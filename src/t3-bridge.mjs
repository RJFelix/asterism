import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const T3_BASE_DIR = process.env.T3CODE_HOME || "/home/exedev/.t3";
const T3_BIN = process.env.T3_BIN || "/home/exedev/.local/bin/t3";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const REDIRECT_URI = "http://127.0.0.1/asterism-mcp-callback";

export const DEFAULT_POLARIS_MODEL = {
  providerInstanceId: "antigravity",
  model: "gemini-4-neon",
  options: { thinking_level: "high" },
};

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data, mode = 0o600) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode });
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

export function readT3RuntimeDescriptor(baseDir = T3_BASE_DIR) {
  const runtime = readJsonSafe(path.join(baseDir, "userdata", "server-runtime.json"));
  const settings = readJsonSafe(path.join(baseDir, "userdata", "settings.json"), {});
  if (!runtime || typeof runtime.origin !== "string") {
    return { running: false, origin: null, runtime: null, settings };
  }
  return {
    running: true,
    origin: runtime.origin.replace(/\/+$/, ""),
    serverVersion: runtime.serverVersion || null,
    pid: runtime.pid || null,
    runtime,
    settings,
  };
}

function parseMcpHttpPayloads(rawText, contentType = "") {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) return [];
  if (contentType.includes("text/event-stream") || trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    const payloads = [];
    for (const line of trimmed.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const body = line.slice(5).trim();
      if (!body || body === "[DONE]") continue;
      try {
        payloads.push(JSON.parse(body));
      } catch {
        // Ignore partial frames
      }
    }
    return payloads;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function unwrapMcpToolResult(toolName, result) {
  if (!result || typeof result !== "object") return result;
  if (result.isError) {
    const errText =
      (Array.isArray(result.content) && result.content.find((c) => typeof c?.text === "string")?.text) ||
      `T3 MCP tool ${toolName} returned an error.`;
    try {
      const parsedErr = JSON.parse(errText);
      throw new Error(parsedErr.message || parsedErr.detail || errText);
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(errText);
      throw e;
    }
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const firstText = Array.isArray(result.content)
    ? result.content.find((c) => typeof c?.text === "string")?.text
    : undefined;
  if (typeof firstText === "string") {
    try {
      return JSON.parse(firstText);
    } catch {
      return { text: firstText };
    }
  }
  return result;
}

export function createT3Bridge({
  stateDir,
  baseDir = T3_BASE_DIR,
  t3Bin = T3_BIN,
  disabled = false,
  authFile = null,
} = {}) {
  const tokenCachePath = authFile || (stateDir ? path.join(stateDir, "t3-mcp-auth.json") : null);
  let memoryToken = null;
  let capabilitiesCache = { expiresAt: 0, value: null };

  async function mintMcpAccessToken(origin) {
    const { stdout } = await execFileAsync(
      t3Bin,
      [
        "auth",
        "pairing",
        "create",
        "--base-dir",
        baseDir,
        "--label",
        "asterism-polaris-bridge",
        "--ttl",
        "3m",
        "--json",
      ],
      { timeout: 12_000 },
    );
    const jsonStart = stdout.indexOf("{");
    const pairing = JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout);

    const regRes = await fetch(`${origin}/oauth/mcp/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Asterism Polaris & Canvas Runtime",
        redirect_uris: [REDIRECT_URI],
      }),
    });
    if (!regRes.ok) {
      throw new Error(`T3 OAuth register failed (HTTP ${regRes.status})`);
    }
    const reg = await regRes.json();

    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const oauthState = crypto.randomBytes(16).toString("base64url");
    const resource = `${origin}/mcp`;

    const decRes = await fetch(`${origin}/oauth/mcp/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        authorization: {
          response_type: "code",
          client_id: reg.client_id,
          redirect_uri: REDIRECT_URI,
          code_challenge: challenge,
          code_challenge_method: "S256",
          state: oauthState,
          resource,
        },
        decision: {
          _tag: "pairing-code",
          access: "full-access",
          code: pairing.credential || pairing.token || pairing.code,
        },
      }),
    });
    if (!decRes.ok) {
      const txt = await decRes.text();
      throw new Error(`T3 OAuth decision failed (HTTP ${decRes.status}): ${txt.slice(0, 200)}`);
    }
    const dec = await decRes.json();
    const redirectUrl = new URL(dec.redirectTo);
    const code = redirectUrl.searchParams.get("code");
    if (!code || redirectUrl.searchParams.get("state") !== oauthState) {
      throw new Error("T3 OAuth decision did not return a valid authorization code.");
    }

    const tokRes = await fetch(`${origin}/oauth/mcp/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: reg.client_id,
        code_verifier: verifier,
        resource,
      }),
    });
    if (!tokRes.ok) {
      const txt = await tokRes.text();
      throw new Error(`T3 OAuth token exchange failed (HTTP ${tokRes.status}): ${txt.slice(0, 200)}`);
    }
    const tok = await tokRes.json();
    const expiresInSec = Number(tok.expires_in) || 86_400 * 7;
    const record = {
      origin,
      accessToken: tok.access_token,
      expiresAtMs: Date.now() + Math.max(60, expiresInSec - 120) * 1000,
      issuedAt: new Date().toISOString(),
    };
    memoryToken = record;
    if (tokenCachePath) {
      try {
        writeJsonAtomic(tokenCachePath, record, 0o600);
      } catch {
        // Ignore cache write errors
      }
    }
    return record;
  }

  async function getValidAccessToken(origin, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = memoryToken || (tokenCachePath ? readJsonSafe(tokenCachePath) : null);
      if (
        cached &&
        cached.origin === origin &&
        typeof cached.accessToken === "string" &&
        cached.expiresAtMs > Date.now()
      ) {
        memoryToken = cached;
        return cached.accessToken;
      }
    }
    const minted = await mintMcpAccessToken(origin);
    return minted.accessToken;
  }

  async function withMcpSession(fn, { allowRetry = true } = {}) {
    if (disabled) {
      throw new Error("Live T3 bridge is disabled in this server instance.");
    }
    const desc = readT3RuntimeDescriptor(baseDir);
    if (!desc.running || !desc.origin) {
      throw new Error(`No running T3 Code server found under ${baseDir}.`);
    }
    const endpoint = `${desc.origin}/mcp`;
    const token = await getValidAccessToken(desc.origin, false);
    let sessionId = null;
    let protocolVersion = MCP_PROTOCOL_VERSION;
    let reqSeq = 1;

    const buildHeaders = () => ({
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {}),
    });

    const rpcCall = async (method, params) => {
      const id = `ast-mcp-${reqSeq++}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      if (res.status === 401 && allowRetry) {
        memoryToken = null;
        await getValidAccessToken(desc.origin, true);
        const err = new Error("T3_AUTH_RETRY");
        err.retryAuth = true;
        throw err;
      }
      sessionId = res.headers.get("mcp-session-id") || sessionId;
      const raw = await res.text();
      if (!res.ok) {
        throw new Error(`T3 MCP HTTP ${res.status}: ${raw.slice(0, 240)}`);
      }
      const payloads = parseMcpHttpPayloads(raw, res.headers.get("content-type") || "");
      const env = payloads.find((p) => p && p.id === id) || payloads[0];
      if (!env) {
        throw new Error(`Empty MCP response for ${method}`);
      }
      if (env.error) {
        throw new Error(`T3 MCP ${method} error: ${JSON.stringify(env.error)}`);
      }
      if (env.result?.protocolVersion) {
        protocolVersion = env.result.protocolVersion;
      }
      return env.result;
    };

    try {
      await rpcCall("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "asterism-server", version: "0.2.0" },
      });
      await fetch(endpoint, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }).catch(() => {});

      const callTool = async (toolName, args = {}) => {
        const rawResult = await rpcCall("tools/call", { name: toolName, arguments: args });
        return unwrapMcpToolResult(toolName, rawResult);
      };

      return await fn({ callTool, origin: desc.origin, settings: desc.settings, desc });
    } catch (err) {
      if (err && err.retryAuth && allowRetry) {
        return await withMcpSession(fn, { allowRetry: false });
      }
      throw err;
    } finally {
      if (sessionId) {
        await fetch(endpoint, {
          method: "DELETE",
          headers: buildHeaders(),
        }).catch(() => {});
      }
    }
  }

  async function getLiveStatus({ forceRefresh = false } = {}) {
    if (disabled) {
      return { connected: false, reason: "disabled", providers: [], projects: [], favorites: [] };
    }
    if (!forceRefresh && capabilitiesCache.value && capabilitiesCache.expiresAt > Date.now()) {
      return capabilitiesCache.value;
    }
    try {
      const status = await withMcpSession(async ({ callTool, origin, settings, desc }) => {
        const [caps, projPage] = await Promise.all([
          callTool("orchestrator_capabilities", {}),
          callTool("t3_project_list", { limit: 100 }),
        ]);
        const favorites = Array.isArray(settings?.favorites) ? settings.favorites : [];
        const favSet = new Set(favorites.map((f) => `${f.provider}:${f.model}`));
        const hiddenByProvider = settings?.providerModelPreferences || {};

        const activeProviders = (caps?.providers || [])
          .filter((p) => p.canRunChildTask && Array.isArray(p.models) && p.models.length > 0)
          .map((p) => {
            const hidden = new Set(hiddenByProvider?.[p.providerInstanceId]?.hiddenModels || []);
            const visibleModels = p.models
              .filter((m) => !hidden.has(m.id))
              .map((m) => ({
                id: m.id,
                label: m.label || m.id,
                favorite: favSet.has(`${p.providerInstanceId}:${m.id}`),
                options: m.options || [],
              }));
            return {
              providerInstanceId: p.providerInstanceId,
              driverKind: p.driverKind,
              displayName: p.displayName,
              models: visibleModels.length > 0 ? visibleModels : p.models,
            };
          });

        const projects = (projPage?.projects || [])
          .filter((p) => !p.deletedAt && !p.archivedAt && p.workspaceRoot && !p.workspaceRoot.includes(".t3/scratch"))
          .map((p) => ({
            t3ProjectId: p.id,
            title: p.title,
            workspaceRoot: p.workspaceRoot,
            canonicalKey: p.repositoryIdentity?.canonicalKey || null,
          }));

        return {
          connected: true,
          origin,
          serverVersion: desc.serverVersion,
          providers: activeProviders,
          projects,
          favorites,
          polarisDefault: DEFAULT_POLARIS_MODEL,
        };
      });
      capabilitiesCache = { expiresAt: Date.now() + 30_000, value: status };
      return status;
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : String(err),
        providers: [],
        projects: [],
        favorites: [],
        polarisDefault: DEFAULT_POLARIS_MODEL,
      };
    }
  }

  async function resolveT3ProjectId(callTool, repoPath, { preferSuperrepo = true } = {}) {
    const target = path.resolve(repoPath || "/home/exedev/agent-attic");
    const projPage = await callTool("t3_project_list", { limit: 100 });
    const projects = (projPage?.projects || []).filter((p) => !p.deletedAt && !p.archivedAt);

    // Filter projects whose workspaceRoot contains `target`
    const containing = projects.filter((p) => {
      if (!p.workspaceRoot) return false;
      const rel = path.relative(path.resolve(p.workspaceRoot), target);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    });

    if (preferSuperrepo && containing.length > 0) {
      // Anchor on the outermost superrepo (e.g. /home/exedev/agent-attic) so agents inherit
      // superrepo AGENTS.md + shared knowledge/ and can move across sibling projects & Asterism itself.
      const outermost = [...containing].sort(
        (a, b) => a.workspaceRoot.length - b.workspaceRoot.length,
      )[0];
      if (outermost) return outermost.id;
    }

    const exact = projects.find((p) => path.resolve(p.workspaceRoot || "") === target);
    if (exact) return exact.id;

    const deepest = [...containing].sort(
      (a, b) => b.workspaceRoot.length - a.workspaceRoot.length,
    )[0];
    if (deepest) return deepest.id;

    if (fs.existsSync(path.join(target, ".git"))) {
      try {
        const created = await callTool("t3_project_create", {
          workspaceRoot: target,
          title: path.basename(target),
        });
        if (created?.project?.id) return created.project.id;
        if (created?.id) return created.id;
      } catch {
        // Fall back to first project
      }
    }
    if (projects[0]) return projects[0].id;
    throw new Error(`No T3 project found for ${target}`);
  }

  async function readFullItemText(callTool, threadId, item) {
    let full = typeof item.text === "string" ? item.text : "";
    let nextOffset = item.nextTextOffset;
    while (typeof nextOffset === "number" && item.id) {
      const chunk = await callTool("t3_thread_read", {
        threadId,
        itemId: item.id,
        textOffset: nextOffset,
        maxCharsPerItem: 32_000,
      });
      const match = (chunk?.items || []).find((x) => x.id === item.id) || chunk?.items?.[0];
      if (!match || typeof match.text !== "string" || match.text.length === 0) break;
      full += match.text;
      nextOffset = match.nextTextOffset;
    }
    return full;
  }

  async function runOneShotPrompt({
    prompt,
    instructions = "",
    providerInstanceId = "antigravity",
    model = "gemini-4-neon",
    options = {},
    repoPath = "/home/exedev/agent-attic",
    title = "Asterism Canvas Task",
    workspaceStrategy,
    timeoutMs = 180_000,
  }) {
    return await withMcpSession(async ({ callTool }) => {
      const projectId = await resolveT3ProjectId(callTool, repoPath);
      const combinedMessage = instructions
        ? `${instructions.trim()}\n\n---\n\n${prompt.trim()}`
        : prompt.trim();
      const launched = await callTool("t3_thread_launch", {
        projectId,
        title: title.slice(0, 76),
        message: combinedMessage,
        runtimeMode: "full-access",
        interactionMode: "default",
        modelSelection: {
          provider: providerInstanceId,
          instanceId: providerInstanceId,
          model,
          ...(options && Object.keys(options).length > 0 ? { options } : {}),
        },
        ...(workspaceStrategy ? { workspaceStrategy } : {}),
      });
      const threadId = launched.threadId;
      const runId = launched.runId;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const waited = await callTool("t3_thread_wait", {
          threadId,
          ...(runId ? { runId } : {}),
          timeoutMs: Math.min(15_000, Math.max(2_000, deadline - Date.now())),
        });
        const status = waited?.status || waited?.run?.status || waited?.thread?.status;
        if (status && status !== "running" && status !== "working" && status !== "queued") {
          break;
        }
        if (waited?.timedOut === false || waited?.completed === true) break;
      }
      const readRes = await callTool("t3_thread_read", {
        threadId,
        view: "messages",
        limit: 20,
        runLimit: 2,
        maxCharsPerItem: 32_000,
      });
      const assistants = (readRes?.items || []).filter((i) => i.type === "assistant_message");
      const last = assistants[assistants.length - 1];
      const text = last ? await readFullItemText(callTool, threadId, last) : "";
      return {
        threadId,
        link: launched.link || readRes?.thread?.link || null,
        text: text.trim(),
      };
    });
  }

  return {
    readT3RuntimeDescriptor: () => readT3RuntimeDescriptor(baseDir),
    withMcpSession,
    getLiveStatus,
    resolveT3ProjectId,
    readFullItemText,
    runOneShotPrompt,
  };
}

function summarizeActivityItem(item) {
  if (!item || typeof item !== "object") return null;
  if (item.type === "assistant_message") return "Drafting response…";
  if (item.type === "plan" || item.type === "thinking") return "Planning next move…";
  const label = item.title || item.summary || item.toolName || item.name || item.type;
  if (typeof label === "string" && label.trim()) {
    return label.trim().slice(0, 90);
  }
  return null;
}

export function buildPolarisPrompt({
  userMessage,
  isFirstTurn,
  asterismOrigin,
  repoRoot,
  activeProject,
  focusedNode,
  canvasState,
}) {
  const visibleNodes = (canvasState?.nodes || []).filter((n) => !n.shadowStaged && !n.archived);
  const cardLines = visibleNodes
    .slice(0, 18)
    .map(
      (n) =>
        `- [${n.id}] "${n.title}" (stage=${n.stage || "note"}, role=${n.surfaceRole || "dialogue"}, commitment=${n.commitment || n.status || "ready"}${n.projectId ? `, project=${n.projectId}` : ""})`,
    )
    .join("\n");
  const pinnedHyps = (canvasState?.userModel?.hypotheses || [])
    .filter((h) => h.status === "active")
    .slice(0, 6)
    .map((h) => `- (${h.pinned ? "pinned" : h.source || "explicit"}, conf=${Number(h.confidence || 0).toFixed(2)}) ${h.statement}`)
    .join("\n");

  const cliPath = path.join(repoRoot, "bin", "asterism");
  const superrepoRoot = path.resolve(repoRoot, "../..");

  const preamble = isFirstTurn
    ? `<polaris_role>
You are **Polaris**, the quiet right-rail Workspace Steward inside **Asterism** (${asterismOrigin}).
Your session is anchored in the superrepo \`${superrepoRoot}\` ("superrepo > many projects"), while Asterism itself lives at \`${repoRoot}\`.

Core Principles & Capabilities:
1. You help the operator both **work on real projects across \`${superrepoRoot}\`** (nested repos under \`repos/*\`, experiments like \`dsv41-deepdream\`, shared notes in \`knowledge/\`) AND **continuously improve Asterism itself** whenever dogfooding reveals a better workflow.
2. Read \`${superrepoRoot}/AGENTS.md\` (and \`${repoRoot}/AGENTS.md\` when editing Asterism). When delegating to Antigravity workers via T3 \`delegate_task\`, explicitly include those file paths in the brief since Antigravity ACP does not auto-load rule files. Conserve Claude quota by preferring Gemini, Muse, and Codex unless Claude is requested.
3. Keep Asterism's UI calm and zero-chrome: resting canvas cards show only title + interactive HTML surface, never noisy orchestration toolbars.
4. **Live Canvas & Diagnostics CLI (\`${cliPath}\`):**
   - \`${cliPath} status\` / \`${cliPath} projects\` / \`${cliPath} cards\` — inspect live health, discovered superrepo projects, and active thoughts
   - \`${cliPath} errors [--clear]\` / \`${cliPath} logs\` — inspect uncaught browser/card-iframe JS errors and server logs
   - \`${cliPath} card-create --title "..." --stage note|brainstorm|refine|design|implement --role dialogue|spec-diagram|ui-prototype|artifact-harness --html "<div...>" [--parent <nodeId>]\`
   - \`${cliPath} card-update <nodeId> [--title "..."] [--html-file <file>]\`
   - \`${cliPath} connect <fromId> <toId> --relation specifies|visualizes-ui|implements|cross-pollinates\`
   - \`${cliPath} compile "<dilemma or intent>"\` / \`${cliPath} tidy\`
   - \`${cliPath} snapshots\` / \`${cliPath} snapshot-save\` / \`${cliPath} snapshot-restore latest\` — instant canvas state time-machine
   - \`${cliPath} worktree <list|create|remove> [--repo <path>]\` — isolated git worktrees for any nested repo in \`${superrepoRoot}\`
   - \`${cliPath} preview [--port 3457]\` — boot an ephemeral canary preview seeded from live canvas state
5. **Safe Self-Modification of Asterism (\`${repoRoot}\`):**
   - Whenever you edit \`server.mjs\`, \`src/**\`, \`public/**\`, or \`packages/asterism-core\`, ALWAYS run \`${cliPath} self-check\`.
   - Deploy live to :3456 with automatic healthcheck + git rollback via \`${cliPath} self-deploy --message "feat: ..." --push\`.
</polaris_role>\n\n`
    : "";

  const focusBlock = focusedNode
    ? `Focused Card: [${focusedNode.id}] "${focusedNode.title}" (stage=${focusedNode.stage}, role=${focusedNode.surfaceRole || "dialogue"}${focusedNode.projectId ? `, cardProject=${focusedNode.projectId}` : ""}${focusedNode.worktree?.worktreePath ? `, worktree=${focusedNode.worktree.worktreePath}` : ""})`
    : "Focused Card: (none)";

  const contextBlock = `<asterism_live_context>
Superrepo Root: ${superrepoRoot}
Active Workspace Project: ${activeProject?.name || "misc-attic"} (${activeProject?.repoPath || superrepoRoot})
Asterism Self-Host Root: ${repoRoot}
${focusBlock}
Visible Canvas Thoughts (${visibleNodes.length}):
${cardLines || "- (empty canvas)"}
${pinnedHyps ? `Operator Preferences:\n${pinnedHyps}` : ""}
</asterism_live_context>`;

  return `${preamble}${contextBlock}\n\n${userMessage.trim()}`;
}

export function createPolarisService({
  stateDir,
  stateFile: customStateFile = null,
  repoRoot,
  t3Bridge,
  getAsterismOrigin,
  getCanvasState,
  broadcastSse,
  customRunner = null,
}) {
  const stateFile = customStateFile || path.join(stateDir, "polaris-state.json");

  function loadPolarisState() {
    const raw = readJsonSafe(stateFile);
    const base = {
      version: 1,
      agentName: "Polaris",
      subtitle: "Workspace Steward",
      threadId: null,
      threadLink: null,
      projectId: null,
      providerInstanceId: DEFAULT_POLARIS_MODEL.providerInstanceId,
      model: DEFAULT_POLARIS_MODEL.model,
      options: { ...DEFAULT_POLARIS_MODEL.options },
      status: "idle",
      activeActivity: null,
      lastError: null,
      turnCount: 0,
      messages: [],
      updatedAt: new Date().toISOString(),
    };
    if (!raw || typeof raw !== "object") return base;
    return {
      ...base,
      ...raw,
      status: raw.status === "working" ? "idle" : raw.status || "idle",
      activeActivity: null,
      messages: Array.isArray(raw.messages) ? raw.messages.slice(-80) : [],
    };
  }

  let polaris = loadPolarisState();
  let inFlightPromise = null;

  function persistAndBroadcast() {
    polaris.updatedAt = new Date().toISOString();
    writeJsonAtomic(stateFile, polaris, 0o600);
    if (typeof broadcastSse === "function") {
      broadcastSse("polaris_update", getPublicState());
    }
  }

  function getPublicState() {
    return {
      agentName: polaris.agentName,
      subtitle: polaris.subtitle,
      threadId: polaris.threadId,
      threadLink: polaris.threadLink,
      providerInstanceId: polaris.providerInstanceId,
      model: polaris.model,
      options: polaris.options,
      status: polaris.status,
      activeActivity: polaris.activeActivity,
      lastError: polaris.lastError,
      turnCount: polaris.turnCount,
      messages: polaris.messages,
      updatedAt: polaris.updatedAt,
    };
  }

  async function configure({ providerInstanceId, model, options } = {}) {
    if (providerInstanceId) polaris.providerInstanceId = String(providerInstanceId);
    if (model) polaris.model = String(model);
    if (options && typeof options === "object" && !Array.isArray(options)) {
      polaris.options = { ...options };
    }
    if (polaris.threadId && !customRunner) {
      try {
        await t3Bridge.withMcpSession(async ({ callTool }) => {
          await callTool("t3_thread_configure", {
            threadId: polaris.threadId,
            modelSelection: {
              provider: polaris.providerInstanceId,
              instanceId: polaris.providerInstanceId,
              model: polaris.model,
              ...(polaris.options && Object.keys(polaris.options).length > 0
                ? { options: polaris.options }
                : {}),
            },
          });
        });
      } catch {
        // If old thread cannot reconfigure across incompatible drivers, start a clean thread on next message
        polaris.threadId = null;
        polaris.threadLink = null;
        polaris.turnCount = 0;
      }
    }
    persistAndBroadcast();
    return getPublicState();
  }

  async function resetThread() {
    polaris.threadId = null;
    polaris.threadLink = null;
    polaris.projectId = null;
    polaris.status = "idle";
    polaris.activeActivity = null;
    polaris.lastError = null;
    polaris.turnCount = 0;
    polaris.messages = [];
    persistAndBroadcast();
    return getPublicState();
  }

  async function interrupt() {
    if (polaris.threadId && !customRunner) {
      try {
        await t3Bridge.withMcpSession(async ({ callTool }) => {
          await callTool("t3_thread_interrupt", { threadId: polaris.threadId });
        });
      } catch {
        // Ignore if already idle
      }
    }
    polaris.status = "idle";
    polaris.activeActivity = null;
    persistAndBroadcast();
    return getPublicState();
  }

  async function sendMessage({ message, focusedNodeId = null } = {}) {
    const trimmed = String(message || "").trim();
    if (!trimmed) {
      const err = new Error("Message cannot be empty.");
      err.statusCode = 400;
      throw err;
    }

    const canvasState = getCanvasState();
    const activeProject =
      (canvasState.projects || []).find((p) => p.id === canvasState.activeProjectId) ||
      (canvasState.projects || [])[0] || {
        id: "proj-asterism",
        name: "asterism",
        repoPath: repoRoot,
      };
    const focusedNode = focusedNodeId
      ? (canvasState.nodes || []).find((n) => n.id === focusedNodeId) || null
      : null;

    const userEntry = {
      id: `pmsg-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      role: "user",
      text: trimmed,
      focusedNodeId: focusedNode?.id || null,
      focusedNodeTitle: focusedNode?.title || null,
      createdAt: new Date().toISOString(),
    };
    polaris.messages.push(userEntry);
    polaris.status = "working";
    polaris.activeActivity = `Connecting to ${polaris.providerInstanceId}/${polaris.model}…`;
    polaris.lastError = null;
    persistAndBroadcast();

    const assistantMsgId = `pmsg-${Date.now() + 1}-${crypto.randomBytes(3).toString("hex")}`;

    const runTurn = async () => {
      try {
        const isFirstTurn = !polaris.threadId || polaris.turnCount === 0;
        const fullPrompt = buildPolarisPrompt({
          userMessage: trimmed,
          isFirstTurn,
          asterismOrigin: getAsterismOrigin(),
          repoRoot,
          activeProject,
          focusedNode,
          canvasState,
        });

        if (customRunner) {
          const out = await customRunner({
            message: trimmed,
            fullPrompt,
            focusedNode,
            activeProject,
            polaris: getPublicState(),
          });
          polaris.threadId = out.threadId || polaris.threadId || "thread-custom-polaris";
          polaris.threadLink = out.threadLink || polaris.threadLink || null;
          polaris.turnCount += 1;
          polaris.messages.push({
            id: assistantMsgId,
            role: "assistant",
            text: out.text,
            model: `${polaris.providerInstanceId}/${polaris.model}`,
            createdAt: new Date().toISOString(),
          });
          polaris.status = "idle";
          polaris.activeActivity = null;
          persistAndBroadcast();
          return;
        }

        await t3Bridge.withMcpSession(async ({ callTool }) => {
          const targetRepo = activeProject?.repoPath || repoRoot;
          let threadId = polaris.threadId;
          let runId = null;
          let preTurnAssistantIds = new Set();

          if (threadId) {
            try {
              const existing = await callTool("t3_thread_read", {
                threadId,
                view: "messages",
                limit: 30,
                runLimit: 2,
              });
              for (const it of existing?.items || []) {
                if (it.type === "assistant_message" && it.id) preTurnAssistantIds.add(it.id);
              }
            } catch {
              threadId = null;
            }
          }

          if (!threadId) {
            const projectId = await t3Bridge.resolveT3ProjectId(callTool, targetRepo);
            const launched = await callTool("t3_thread_launch", {
              projectId,
              title: `Polaris · ${trimmed.split("\n")[0].slice(0, 56)}`,
              message: fullPrompt,
              runtimeMode: "full-access",
              interactionMode: "default",
              modelSelection: {
                provider: polaris.providerInstanceId,
                instanceId: polaris.providerInstanceId,
                model: polaris.model,
                ...(polaris.options && Object.keys(polaris.options).length > 0
                  ? { options: polaris.options }
                  : {}),
              },
            });
            threadId = launched.threadId;
            runId = launched.runId;
            polaris.threadId = threadId;
            polaris.projectId = projectId;
            polaris.threadLink = launched.link || null;
          } else {
            const sent = await callTool("t3_thread_send", {
              threadId,
              message: fullPrompt,
              mode: "auto",
            });
            runId = sent.runId || null;
            polaris.threadLink = sent.link || polaris.threadLink;
          }

          polaris.turnCount += 1;
          polaris.activeActivity = `Thinking (${polaris.model})…`;
          persistAndBroadcast();

          const deadline = Date.now() + 600_000; // up to 10 min for deep multi-file self-edits
          while (Date.now() < deadline && polaris.status === "working") {
            const waited = await callTool("t3_thread_wait", {
              threadId,
              ...(runId ? { runId } : {}),
              timeoutMs: 3_000,
              untilDelegatedWorkSettled: true,
            });

            // Read latest activity + streaming assistant draft
            const act = await callTool("t3_thread_read", {
              threadId,
              view: "activity",
              limit: 25,
              runLimit: 2,
              maxCharsPerItem: 8_000,
            });
            if (act?.thread?.link) polaris.threadLink = act.thread.link;

            const items = act?.items || [];
            const latestToolOrStep = [...items]
              .reverse()
              .find((it) => it.type !== "user_message" && it.type !== "assistant_message");
            const stepSummary = summarizeActivityItem(latestToolOrStep);
            if (stepSummary) {
              polaris.activeActivity = stepSummary;
            }

            const newAssistants = items.filter(
              (it) => it.type === "assistant_message" && (!it.id || !preTurnAssistantIds.has(it.id)),
            );
            if (newAssistants.length > 0) {
              const latestDraft = newAssistants[newAssistants.length - 1];
              const draftText = (latestDraft.text || "").trim();
              if (draftText) {
                const existingIdx = polaris.messages.findIndex((m) => m.id === assistantMsgId);
                const draftMsg = {
                  id: assistantMsgId,
                  role: "assistant",
                  text: draftText,
                  streaming: true,
                  model: `${polaris.providerInstanceId}/${polaris.model}`,
                  createdAt: new Date().toISOString(),
                };
                if (existingIdx >= 0) polaris.messages[existingIdx] = draftMsg;
                else polaris.messages.push(draftMsg);
              }
            }
            persistAndBroadcast();

            const waitStatus =
              waited?.status || waited?.resultRun?.status || waited?.run?.status || act?.thread?.status;
            const stillRunning =
              waitStatus === "running" ||
              waitStatus === "working" ||
              waitStatus === "queued" ||
              waited?.timedOut === true;
            if (!stillRunning) {
              break;
            }
          }

          // Final clean read of messages
          const finalRead = await callTool("t3_thread_read", {
            threadId,
            view: "messages",
            limit: 30,
            runLimit: 3,
            maxCharsPerItem: 32_000,
          });
          if (finalRead?.thread?.link) polaris.threadLink = finalRead.thread.link;
          const allAssistants = (finalRead?.items || []).filter(
            (it) => it.type === "assistant_message" && (!it.id || !preTurnAssistantIds.has(it.id)),
          );
          let finalText = "";
          if (allAssistants.length > 0) {
            const parts = [];
            for (const item of allAssistants) {
              const t = await t3Bridge.readFullItemText(callTool, threadId, item);
              if (t.trim()) parts.push(t.trim());
            }
            finalText = parts.join("\n\n");
          }
          if (!finalText) {
            finalText = "(Completed action with no additional text output.)";
          }

          const existingIdx = polaris.messages.findIndex((m) => m.id === assistantMsgId);
          const finalEntry = {
            id: assistantMsgId,
            role: "assistant",
            text: finalText,
            streaming: false,
            model: `${polaris.providerInstanceId}/${polaris.model}`,
            threadLink: polaris.threadLink,
            createdAt: new Date().toISOString(),
          };
          if (existingIdx >= 0) polaris.messages[existingIdx] = finalEntry;
          else polaris.messages.push(finalEntry);

          polaris.status = "idle";
          polaris.activeActivity = null;
          persistAndBroadcast();
        });
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        polaris.status = "error";
        polaris.activeActivity = null;
        polaris.lastError = messageText;
        polaris.messages.push({
          id: assistantMsgId,
          role: "assistant",
          isError: true,
          text: `⚠️ Polaris hit an error talking to T3 (${polaris.providerInstanceId}/${polaris.model}): ${messageText}`,
          createdAt: new Date().toISOString(),
        });
        persistAndBroadcast();
      } finally {
        inFlightPromise = null;
      }
    };

    inFlightPromise = runTurn();
    return {
      accepted: true,
      userMessage: userEntry,
      polaris: getPublicState(),
      completion: inFlightPromise,
    };
  }

  return {
    getState: getPublicState,
    configure,
    resetThread,
    interrupt,
    sendMessage,
  };
}
