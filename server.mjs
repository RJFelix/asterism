import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getDefaultCanvasState } from "./src/default-state.mjs";
import {
  createT3Bridge,
  createPolarisService,
  DEFAULT_POLARIS_MODEL,
} from "./src/t3-bridge.mjs";
import {
  ARENA_MODELS,
  DEFAULT_MODEL,
  SURFACE_ROLES,
  PANEL_RELATIONS,
  defaultRoleForStage,
  registerT3BridgeForLlm,
  mutateHtmlSurface,
  collaborateAcrossPanels,
  spawnRelatedPanel,
  generateSpeculativeBranches,
  synthesizeNodes,
  advanceNodeStage,
  generateWorktreeImplementationBundle,
  runIdeonomyAndMatchmakerPipeline,
  pickIdeonomyTuple,
  getIdeonomyCatalogSummary,
  renderIdeonomyMachineryHtml,
  compileDecisionTreeOnTheFly,
  renderCompiledDecisionSurfaceHtml,
  renderAutonomousBranchHtml,
} from "./src/llm.mjs";
import {
  makeSqliteEventSink,
  makePeerFederation,
  createIsolatedWorktree,
  inspectWorktreeDiff,
  commitWorktreeChanges,
  runWorktreeAgentImplementation,
  probeAvailableHarnesses,
  MCP_PROTOCOL_VERSION,
  MODE_LIMIT_HEADER,
  createDefaultEnergyEnvelope,
  attenuateEnergyForBranches,
  normalizeWarrant,
  computeAttentionBid,
  allocateBasalFreeEnergy,
  shouldBranchForRegretMinimization,
  rankMatchmakerCandidates,
  createDefaultUserModel,
  evaluatePowerSetPolicy,
  recordAutonomousActionOnUserModel,
  scoreSealedPrediction,
  recordBehavioralObservation,
  computeEmpiricalCalibrationFactor,
} from "@asterism/core";
import { CodexProviderCapabilitiesV2 } from "@t3tools/provider-codex/server/adapter";
import { ClaudeProviderCapabilitiesV2 } from "@t3tools/provider-claude/server/adapter";
import { AcpProviderCapabilitiesV2 } from "@t3tools/provider-acp/server/adapter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "canvas-state.json");
const SQLITE_FILE = path.join(DATA_DIR, "asterism.sqlite");
const WORKTREES_DIR = path.join(DATA_DIR, "worktrees");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const ENVIRONMENT_ID =
  process.env.ASTERISM_ENV_ID || "env-asterism-agentbox-101";

export const EXTRACTED_PROVIDER_CATALOG = [
  {
    id: "codex",
    package: "@t3tools/provider-codex",
    binary: "codex",
    protocol: "effect-codex-app-server",
    capabilities: CodexProviderCapabilitiesV2,
  },
  {
    id: "claudeAgent",
    package: "@t3tools/provider-claude",
    binary: "claude",
    protocol: "claude-agent-sdk",
    capabilities: ClaudeProviderCapabilitiesV2,
  },
  {
    id: "antigravity",
    package: "@t3tools/provider-antigravity",
    binary: "antigravity",
    protocol: "effect-acp",
    capabilities: AcpProviderCapabilitiesV2,
  },
  {
    id: "pi",
    package: "@t3tools/provider-pi",
    binary: "pi",
    protocol: "pi-rpc",
    capabilities: AcpProviderCapabilitiesV2,
  },
  {
    id: "opencode",
    package: "@t3tools/provider-opencode",
    binary: "opencode",
    protocol: "opencode-v1-v2",
    capabilities: AcpProviderCapabilitiesV2,
  },
  {
    id: "cursor",
    package: "@t3tools/provider-cursor",
    binary: "cursor",
    protocol: "cursor-sdk",
    capabilities: AcpProviderCapabilitiesV2,
  },
  {
    id: "muse",
    package: "@t3tools/provider-muse",
    binary: "muse",
    protocol: "muse-msp",
    capabilities: AcpProviderCapabilitiesV2,
  },
  {
    id: "grok",
    package: "@t3tools/provider-grok",
    binary: "grok",
    protocol: "effect-acp",
    capabilities: AcpProviderCapabilitiesV2,
  },
  {
    id: "fx",
    package: "@t3tools/provider-fx",
    binary: "fx",
    protocol: "effect-acp",
    capabilities: AcpProviderCapabilitiesV2,
  },
  {
    id: "kiro",
    package: "@t3tools/provider-kiro",
    binary: "kiro",
    protocol: "effect-acp",
    capabilities: AcpProviderCapabilitiesV2,
  },
  {
    id: "acp-registry",
    package: "@t3tools/provider-acp-registry",
    binary: "acp",
    protocol: "effect-acp",
    capabilities: AcpProviderCapabilitiesV2,
  },
];

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isAssociation = e => ["jump", "association", "lens"].includes(e.kind) || ["cross-pollinates", "association", "annotates"].includes(e.relation);

function restoreCanvasLayout(state) {
  for (const n of state.nodes) {
    if (Number.isFinite(n.canvasX) && Number.isFinite(n.canvasY)) { n.x = n.canvasX; n.y = n.canvasY; }
    delete n.canvasX; delete n.canvasY;
  }
}

export function normalizeCanvasState(raw) {
  const state = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  for (const key of ["nodes", "edges", "strokes", "projects"]) {
    state[key] = [...new Map((Array.isArray(state[key]) ? state[key] : []).filter(n => n && typeof n === "object" && !Array.isArray(n) && typeof n.id === "string").map(n => [n.id, { ...n }])).values()];
  }
  const ids = new Set(state.nodes.map(n => n.id));
  const seen = new Set();
  state.edges = state.edges.filter(e => {
    const key = JSON.stringify([e.from, e.to, e.relation]);
    if (!ids.has(e.from) || !ids.has(e.to) || seen.has(key)) return false;
    seen.add(key); return true;
  });
  for (const n of state.nodes) {
    if (!ids.has(n.parentId)) delete n.parentId;
    if (Array.isArray(n.parentIds)) n.parentIds = [...new Set(n.parentIds.filter(id => ids.has(id)))];
  }
  const v = state.viewport || {};
  state.viewport = { x: Number.isFinite(v.x) ? v.x : 65, y: Number.isFinite(v.y) ? v.y : 55, scale: Number.isFinite(v.scale) ? Math.max(0.15, Math.min(3, v.scale)) : 0.88 };
  const defaults = createDefaultUserModel(), model = state.userModel || {};
  state.userModel = { ...defaults, ...model, hypotheses: Array.isArray(model.hypotheses) ? model.hypotheses : defaults.hypotheses, economicProfiles: model.economicProfiles && typeof model.economicProfiles === "object" && !Array.isArray(model.economicProfiles) ? { ...defaults.economicProfiles, ...model.economicProfiles } : defaults.economicProfiles, sealedPredictions: Array.isArray(model.sealedPredictions) ? model.sealedPredictions : defaults.sealedPredictions };
  for (const [id, profile] of Object.entries(state.userModel.economicProfiles)) {
    state.userModel.economicProfiles[id] = {
      ...(defaults.economicProfiles[id] || defaults.economicProfiles["proj-misc-attic"]),
      ...(profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {}),
      projectId: id,
    };
  }
  if (!state.nodes.some(n => n.id === state.plexFocusNodeId && !n.shadowStaged)) state.plexFocusNodeId = state.nodes.find(n => !n.shadowStaged)?.id;
  return state;
}

export function loadState(targetFile = STATE_FILE) {
  if (fs.existsSync(targetFile)) {
    try { return normalizeCanvasState(JSON.parse(fs.readFileSync(targetFile, "utf8"))); }
    catch { fs.renameSync(targetFile, `${targetFile}.corrupt-${Date.now()}`); }
  }
  const initial = normalizeCanvasState(getDefaultCanvasState());
  saveState(initial, targetFile);
  return initial;
}

export function saveState(state, targetFile = STATE_FILE) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const temporary = `${targetFile}.tmp-${process.pid}-${Date.now()}`;
  try { fs.writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8"); fs.renameSync(temporary, targetFile); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export function resolveOpenCanvasPosition(nodes, desiredX, desiredY, width = 400, height = 260, gap = 28, excludeIds = new Set()) {
  const originX = Number.isFinite(desiredX) ? desiredX : 25;
  const originY = Number.isFinite(desiredY) ? desiredY : 25;
  const visible = nodes.filter(n => !n.shadowStaged && !excludeIds.has(n.id));
  const free = (x, y) => !visible.some(n => x < n.x + (n.width || 400) + gap && x + width + gap > n.x && y < n.y + (n.height || 260) + gap && y + height + gap > n.y);
  const x = Math.max(25, Math.round(originX)), y = Math.max(25, Math.round(originY));
  if (free(x, y)) return { x, y };
  for (let radius = 1; ; radius++) {
    const points = [];
    for (let dx = -radius; dx <= radius; dx++) for (const dy of [-radius, radius]) points.push([x + dx * 80, y + dy * 80]);
    for (let dy = -radius + 1; dy < radius; dy++) for (const dx of [-radius, radius]) points.push([x + dx * 80, y + dy * 80]);
    points.sort((a, b) => (a[0]-x)**2 + (a[1]-y)**2 - (b[0]-x)**2 - (b[1]-y)**2);
    for (const [px, py] of points) if (px >= 25 && py >= 25 && free(px, py)) return { x: px, y: py };
  }
}

/**
 * Walks upstream DAG edges & parentIds to collect the full ordered lineage leading into `targetNodeId`.
 */
export function collectLineageNodes(canvasState, targetNodeId) {
  const byId = new Map((canvasState.nodes || []).map((n) => [n.id, n]));
  const visited = new Set();
  const ordered = [];

  function visit(nodeId) {
    if (!nodeId || visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = byId.get(nodeId);
    if (!node) return;

    const parentIds = new Set();
    if (node.parentId) parentIds.add(node.parentId);
    if (Array.isArray(node.parentIds)) {
      for (const pid of node.parentIds) parentIds.add(pid);
    }
    for (const edge of canvasState.edges || []) {
      if (!isAssociation(edge) && edge.to === nodeId && edge.from) parentIds.add(edge.from);
    }

    for (const pid of parentIds) {
      visit(pid);
    }
    ordered.push(node);
  }

  visit(targetNodeId);
  return ordered;
}

/**
 * Collects all directly connected upstream and downstream panels around `nodeId`
 * along with their `relation` and `surfaceRole` so agents can view & manipulate beyond one panel.
 */
export function collectNeighborhoodNodes(canvasState, nodeId) {
  const byId = new Map((canvasState.nodes || []).map((n) => [n.id, n]));
  const result = [];
  const seen = new Set([nodeId]);

  for (const edge of canvasState.edges || []) {
    if (edge.from === nodeId && !seen.has(edge.to)) {
      const target = byId.get(edge.to);
      if (target) {
        seen.add(edge.to);
        result.push({
          ...target,
          direction: "downstream",
          relation: edge.relation || edge.kind || "advances",
        });
      }
    } else if (edge.to === nodeId && !seen.has(edge.from)) {
      const source = byId.get(edge.from);
      if (source) {
        seen.add(edge.from);
        result.push({
          ...source,
          direction: "upstream",
          relation: edge.relation || edge.kind || "advances",
        });
      }
    }
  }
  return result;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "", size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) { reject(Object.assign(new Error("Payload too large"), { statusCode: 413 })); req.destroy(); return; }
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        resolve(parsed);
      } catch { reject(Object.assign(new Error("Invalid JSON object body"), { statusCode: 400 })); }
    });
    req.on("error", reject);
  });
}

function requestErrorStatus(err) {
  if (err.statusCode) return err.statusCode;
  if (["INVALID_CHOICE", "INFEASIBLE_SUBSET"].includes(err.code) || err.message === "chosenOptionIds must be an array") return 400;
  return err.code === "ALREADY_RESOLVED" ? 409 : 500;
}

function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

export function createAsterismServer(options = {}) {
  const dbPath = options.dbPath || SQLITE_FILE;
  const stateFile = options.stateFile || (options.dbPath ? path.join(path.dirname(options.dbPath), "canvas-state.json") : STATE_FILE);
  const stateDir = path.dirname(stateFile);
  const worktreesDir = options.worktreesDir || WORKTREES_DIR;
  const eventSink = Effect.runSync(makeSqliteEventSink(dbPath));
  const peerFederation = Effect.runSync(makePeerFederation());
  Effect.runSync(eventSink.reconcileAfterProcessLoss);

  const bootId = `boot-${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  let gitSha = "unknown";
  try {
    gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Non-git fallback
  }

  function getIndexHtmlHash() {
    try {
      const buf = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"));
      return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
    } catch {
      return "missing";
    }
  }

  let canvasState = loadState(stateFile);
  const sseClients = new Set();
  const mcpSessions = new Map();
  const workerId = `asterism-outbox-worker-${crypto.randomUUID().slice(0, 8)}`;
  let drainingOutbox = false;

  function broadcastSse(eventType, dataObj) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(dataObj)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  function broadcastState(eventType = "state") {
    broadcastSse(eventType, canvasState);
  }

  const isTestInstance = Boolean(options.dbPath && path.resolve(options.dbPath) !== path.resolve(SQLITE_FILE));
  const disableT3Bridge = options.disableT3Bridge ?? (isTestInstance && !options.enableT3Bridge);
  const t3Bridge = createT3Bridge({ stateDir, disabled: disableT3Bridge });
  if (!disableT3Bridge) {
    registerT3BridgeForLlm(t3Bridge);
  }

  const polarisService = createPolarisService({
    stateDir,
    repoRoot: __dirname,
    t3Bridge,
    getAsterismOrigin: () => process.env.ASTERISM_PUBLIC_URL || "http://127.0.0.1:3456",
    getCanvasState: () => canvasState,
    broadcastSse,
    customRunner: options.polarisRunner || null,
  });

  async function recordDomainCommand(
    commandType,
    streamId,
    eventType,
    payload,
    effects = [],
    commandId,
  ) {
    const cid = commandId || `cmd-${crypto.randomUUID()}`;
    return Effect.runPromise(
      eventSink.commitCommand({
        commandId: cid,
        streamId,
        commandType,
        events: [{ eventType, payload }],
        effects,
      }),
    );
  }

  /**
   * Feature 1: Outbox Worker Loop that claims pending `harness.run-turn` and `worktree.commit`
   * effects and executes them inside the node's isolated Git worktree.
   */
  async function drainOutbox() {
    if (drainingOutbox) return;
    drainingOutbox = true;
    try {
      while (true) {
        const claimedOpt = await Effect.runPromise(
          eventSink.claimNextEffect(workerId),
        );
        if (Option.isNone(claimedOpt)) break;
        const effect = Option.getOrThrow(claimedOpt);

        try {
          if (effect.request.type === "harness.run-turn") {
            const node = canvasState.nodes.find(
              (n) => n.id === effect.request.nodeId,
            );
            if (node) {
              node.implementStatus = "running";
              broadcastState();

              if (!node.worktree || !node.worktree.worktreePath) {
                node.worktree = await Effect.runPromise(
                  createIsolatedWorktree({
                    repoRoot: __dirname,
                    worktreesDir,
                    nodeId: node.id,
                  }),
                );
              }

              const lineageNodes = collectLineageNodes(canvasState, node.id);
              const bundle = await generateWorktreeImplementationBundle({
                node,
                lineageNodes,
                instruction: effect.request.prompt,
              });

              const implResult = await Effect.runPromise(
                runWorktreeAgentImplementation({
                  worktreePath: node.worktree.worktreePath,
                  nodeId: node.id,
                  bundle,
                }),
              );

              node.implementStatus = implResult.testPassed ? "verified" : "failed";
              node.implementation = {
                status: implResult.testPassed ? "verified" : "failed",
                provider: effect.request.provider,
                model: effect.request.model,
                prompt: effect.request.prompt,
                moduleRelPath: implResult.moduleRelPath,
                testRelPath: implResult.testRelPath,
                surfaceRelPath: implResult.surfaceRelPath,
                testPassed: implResult.testPassed,
                testOutput: implResult.testOutput,
                diff: implResult.diff,
                lineageCount: lineageNodes.length,
                updatedAt: new Date().toISOString(),
              };
              saveState(canvasState, stateFile);
              broadcastState();
            }
          }
          await Effect.runPromise(
            eventSink.completeEffect({ effectId: effect.id, workerId }),
          );
        } catch (err) {
          await Effect.runPromise(
            eventSink.failEffect({
              effectId: effect.id,
              workerId,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
    } finally {
      drainingOutbox = false;
    }
  }

  setImmediate(() => { drainOutbox().catch(() => {}); });
  return http.createServer(async (req, res) => {
    try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // 0. Healthcheck & Self-Deploy Identity Probe
    if (req.method === "GET" && url.pathname === "/api/health") {
      const deep = url.searchParams.get("deep") === "1";
      const t3Desc = t3Bridge.readT3RuntimeDescriptor();
      const liveT3 = deep ? await t3Bridge.getLiveStatus({ forceRefresh: false }) : undefined;
      const pState = polarisService.getState();
      return sendJson(res, 200, {
        ok: true,
        bootId,
        startedAt,
        gitSha,
        indexHtmlHash: getIndexHtmlHash(),
        nodeCount: canvasState.nodes.length,
        edgeCount: canvasState.edges.length,
        activeProjectId: canvasState.activeProjectId,
        polaris: {
          agentName: pState.agentName,
          providerInstanceId: pState.providerInstanceId,
          model: pState.model,
          status: pState.status,
          threadId: pState.threadId,
        },
        t3Runtime: {
          running: t3Desc.running,
          origin: t3Desc.origin,
          serverVersion: t3Desc.serverVersion || null,
          bridgeEnabled: !disableT3Bridge,
        },
        ...(liveT3 ? { liveT3 } : {}),
      });
    }

    // 1. Environment Descriptor
    if (req.method === "GET" && url.pathname === "/api/environment/descriptor") {
      return sendJson(res, 200, {
        environmentId: ENVIRONMENT_ID,
        name: "asterism-agentbox-101",
        protocolVersion: MCP_PROTOCOL_VERSION,
        bootId,
        gitSha,
        providers: EXTRACTED_PROVIDER_CATALOG.map((p) => p.id),
        arenaModels: ARENA_MODELS.map((m) => m.id),
        surfaceRoles: Object.keys(SURFACE_ROLES),
        panelRelations: Object.keys(PANEL_RELATIONS),
      });
    }

    // 2. Extracted Provider Harness Catalog + Live T3 Code Providers + Arena Models + Surface Roles + Relations
    if (req.method === "GET" && url.pathname === "/api/providers") {
      const [cliProbes, liveT3] = await Promise.all([
        Effect.runPromise(
          probeAvailableHarnesses(
            EXTRACTED_PROVIDER_CATALOG.map((p) => ({
              id: p.id,
              binary: p.binary,
            })),
          ),
        ),
        t3Bridge.getLiveStatus({ forceRefresh: url.searchParams.get("refresh") === "1" }),
      ]);
      const probeById = new Map(cliProbes.map((p) => [p.id, p]));
      const liveIds = new Set((liveT3.providers || []).map((p) => p.providerInstanceId));
      return sendJson(res, 200, {
        providers: EXTRACTED_PROVIDER_CATALOG.map((p) => ({
          ...p,
          cliInstalled: (probeById.get(p.id)?.installed ?? false) || liveIds.has(p.id),
          binaryPath: probeById.get(p.id)?.binaryPath ?? null,
          liveInT3: liveIds.has(p.id),
        })),
        liveT3,
        polarisDefault: DEFAULT_POLARIS_MODEL,
        arenaModels: ARENA_MODELS,
        surfaceRoles: SURFACE_ROLES,
        panelRelations: PANEL_RELATIONS,
      });
    }

    // 3. Event-Sourced Outbox & Event Log Inspection
    if (req.method === "GET" && url.pathname === "/api/events/log") {
      const after = Number(url.searchParams.get("after") || 0);
      const events = await Effect.runPromise(eventSink.readEventsAfter(after));
      return sendJson(res, 200, { events });
    }

    // 4. Peer Federation & Multi-Panel Graph MCP Tools (`/mcp`)
    if (req.method === "POST" && url.pathname === "/mcp") {
      try {
        const rpc = await readJsonBody(req);
        const modeLimit =
          req.headers[MODE_LIMIT_HEADER.toLowerCase()] || "full-access/default";

        if (rpc.method === "initialize") {
          const sid = `mcp-sess-${crypto.randomUUID()}`;
          mcpSessions.set(sid, { createdAt: new Date().toISOString(), modeLimit });
          return sendJson(
            res,
            200,
            {
              jsonrpc: "2.0",
              id: rpc.id ?? 0,
              result: {
                protocolVersion: MCP_PROTOCOL_VERSION,
                serverInfo: { name: "asterism-mcp", version: "0.4.0" },
                capabilities: { tools: {} },
              },
            },
            { "mcp-session-id": sid },
          );
        }

        if (rpc.method === "notifications/initialized") {
          return sendJson(res, 200, { jsonrpc: "2.0", result: {} });
        }

        const sid = req.headers["mcp-session-id"];
        if (!sid || !mcpSessions.has(sid)) {
          return sendJson(res, 404, { error: "Unknown MCP session" });
        }

        if (rpc.method === "tools/call") {
          const toolName = rpc.params?.name;
          const args = rpc.params?.arguments || {};

          if (toolName === "asterism_canvas_summary") {
            const summary = {
              environmentId: ENVIRONMENT_ID,
              modeLimit,
              nodeCount: canvasState.nodes.length,
              edgeCount: canvasState.edges.length,
              stages: canvasState.nodes.map((n) => ({
                id: n.id,
                title: n.title,
                stage: n.stage,
                surfaceRole: n.surfaceRole || defaultRoleForStage(n.stage),
                status: n.status,
                model: n.model || DEFAULT_MODEL,
                state: n.state || {},
              })),
              edges: canvasState.edges,
            };
            return sendJson(res, 200, {
              jsonrpc: "2.0",
              id: rpc.id ?? 1,
              result: {
                content: [{ type: "text", text: JSON.stringify(summary) }],
              },
            });
          }

          if (toolName === "asterism_spawn_related_panel") {
            const sourceNode = canvasState.nodes.find(
              (n) => n.id === args.sourceNodeId,
            );
            if (!sourceNode) {
              return sendJson(res, 200, {
                jsonrpc: "2.0",
                id: rpc.id ?? 1,
                result: {
                  isError: true,
                  content: [{ type: "text", text: "Source node not found" }],
                },
              });
            }
            const neighborhood = collectNeighborhoodNodes(
              canvasState,
              sourceNode.id,
            );
            const existingOut = canvasState.edges.filter(
              (e) => e.from === sourceNode.id,
            ).length;
            const childNode = await spawnRelatedPanel({
              sourceNode,
              relation: args.relation || "visualizes-ui",
              surfaceRole: args.surfaceRole,
              title: args.title,
              prompt: args.prompt,
              neighborhood,
              existingRelatedCount: existingOut,
              model: args.model || sourceNode.model || DEFAULT_MODEL,
            });
            const relMeta =
              PANEL_RELATIONS[childNode.relationFromParent] ||
              PANEL_RELATIONS["visualizes-ui"];
            if (!childNode.shadowStaged) Object.assign(childNode, resolveOpenCanvasPosition(canvasState.nodes, childNode.x, childNode.y, childNode.width, childNode.height));
            canvasState.nodes.push(childNode);
            canvasState.edges.push({
              id: `edge-rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              from: sourceNode.id,
              to: childNode.id,
              relation: childNode.relationFromParent,
              kind: childNode.relationFromParent,
              label: relMeta.label,
            });
            saveState(canvasState, stateFile);
            broadcastState();
            return sendJson(res, 200, {
              jsonrpc: "2.0",
              id: rpc.id ?? 1,
              result: {
                content: [{ type: "text", text: JSON.stringify({ childNode }) }],
              },
            });
          }

          return sendJson(res, 200, {
            jsonrpc: "2.0",
            id: rpc.id ?? 1,
            result: {
              isError: true,
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    code: "invalid_request",
                    message: `Unknown tool: ${toolName}`,
                  }),
                },
              ],
            },
          });
        }

        return sendJson(res, 400, { error: "Unsupported JSON-RPC method" });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(
        `event: server_hello\ndata: ${JSON.stringify({
          bootId,
          startedAt,
          gitSha,
          indexHtmlHash: getIndexHtmlHash(),
        })}\n\n`,
      );
      res.write(`event: state\ndata: ${JSON.stringify(canvasState)}\n\n`);
      res.write(`event: polaris_update\ndata: ${JSON.stringify(polarisService.getState())}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // Polaris Workspace Steward Endpoints (`/api/polaris/*`)
    if (req.method === "GET" && url.pathname === "/api/polaris/state") {
      return sendJson(res, 200, { polaris: polarisService.getState() });
    }

    if (req.method === "POST" && url.pathname === "/api/polaris/message") {
      const body = await readJsonBody(req);
      const accepted = await polarisService.sendMessage({
        message: body.message,
        focusedNodeId: body.focusedNodeId || null,
      });
      if (body.wait === true) {
        await accepted.completion;
        return sendJson(res, 200, {
          ok: true,
          userMessage: accepted.userMessage,
          polaris: polarisService.getState(),
        });
      }
      return sendJson(res, 202, {
        accepted: true,
        userMessage: accepted.userMessage,
        polaris: accepted.polaris,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/polaris/configure") {
      const body = await readJsonBody(req);
      const polaris = await polarisService.configure(body);
      return sendJson(res, 200, { polaris });
    }

    if (req.method === "POST" && url.pathname === "/api/polaris/reset") {
      const polaris = await polarisService.resetThread();
      return sendJson(res, 200, { polaris });
    }

    if (req.method === "POST" && url.pathname === "/api/polaris/interrupt") {
      const polaris = await polarisService.interrupt();
      return sendJson(res, 200, { polaris });
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      return sendJson(res, 200, canvasState);
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      canvasState = getDefaultCanvasState();
      saveState(canvasState, stateFile);
      await recordDomainCommand("canvas.reset", "canvas-root", "canvas.reset", {
        nodeCount: canvasState.nodes.length,
      });
      broadcastState();
      return sendJson(res, 200, canvasState);
    }

    if (req.method === "GET" && ["/api/views/table", "/api/views/timeline"].includes(url.pathname)) {
      const nodes = [...canvasState.nodes].sort(url.pathname.endsWith("timeline")
        ? (a, b) => String(a.createdAt || a.updatedAt || "").localeCompare(String(b.createdAt || b.updatedAt || "")) || a.id.localeCompare(b.id)
        : (a, b) => String(a.title || "").localeCompare(String(b.title || "")) || a.id.localeCompare(b.id));
      return sendJson(res, 200, { nodes, edges: canvasState.edges });
    }
    if (req.method === "POST" && ["/api/nodes/move", "/api/nodes/create", "/api/nodes/update", "/api/nodes/delete", "/api/edges"].includes(url.pathname)) {
      const body = await readJsonBody(req);
      let result = {};
      if (url.pathname === "/api/nodes/create") {
        if (!body.node || typeof body.node !== "object" || Array.isArray(body.node)) return sendJson(res, 400, { error: "node must be an object" });
        const stage = body.node.stage || "note";
        const surfaceRole = body.node.surfaceRole || defaultRoleForStage(stage);
        const node = {
          width: 400,
          height: 260,
          kind: "surface",
          stage,
          surfaceRole,
          commitment: body.node.commitment || "committed",
          status: body.node.status || "ready",
          model: body.node.model || "antigravity/gemini-4-neon",
          provider: body.node.provider || "antigravity",
          state: {},
          ...body.node,
          id: body.node.id || "node-" + crypto.randomUUID(),
        };
        if (typeof node.id !== "string" || canvasState.nodes.some(n => n.id === node.id)) return sendJson(res, 400, { error: "Invalid or duplicate node id" });
        for (const key of ["width", "height"]) if (!Number.isFinite(node[key]) || node[key] <= 0) node[key] = key === "width" ? 400 : 260;
        if (!node.html) {
          node.html = `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">${escapeHtml(node.summary || node.title || "New thought")}</div>`;
        }
        node.facets = { ...(node.facets || {}), [node.surfaceRole]: node.html };
        Object.assign(node, resolveOpenCanvasPosition(canvasState.nodes, node.x, node.y, node.width, node.height));
        canvasState.nodes.push(node);
        if (body.parentNodeId && canvasState.nodes.some(n => n.id === body.parentNodeId)) {
          const relation = body.relation || node.relationFromParent || "advances";
          const relMeta = PANEL_RELATIONS[relation] || PANEL_RELATIONS.advances;
          node.parentId = body.parentNodeId;
          node.parentIds = [body.parentNodeId];
          canvasState.edges.push({
            id: `edge-${crypto.randomUUID().slice(0, 8)}`,
            from: body.parentNodeId,
            to: node.id,
            relation,
            kind: relation,
            label: relMeta.label,
          });
        }
        result = { node };
      } else if (url.pathname === "/api/nodes/update") {
        const node = canvasState.nodes.find(n => n.id === body.nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });
        for (const key of ["title", "html", "stage", "surfaceRole", "commitment", "status", "model", "provider", "summary"]) {
          if (typeof body[key] === "string") node[key] = body[key];
        }
        for (const key of ["width", "height"]) {
          if (Number.isFinite(body[key]) && body[key] > 0) node[key] = body[key];
        }
        if (body.state && typeof body.state === "object" && !Array.isArray(body.state)) {
          node.state = { ...(node.state || {}), ...body.state };
        }
        if (typeof body.html === "string") {
          const role = node.surfaceRole || defaultRoleForStage(node.stage);
          node.facets = { ...(node.facets || {}), [role]: body.html };
        }
        node.updatedAt = new Date().toISOString();
        result = { node };
      } else if (url.pathname === "/api/edges") {
        if (body.action === "delete") {
          if (!canvasState.edges.some(e => e.id === body.edgeId)) return sendJson(res, 404, { error: "Edge not found" });
          canvasState.edges = canvasState.edges.filter(e => e.id !== body.edgeId);
        } else if (body.action === "create") {
          const edge = body.edge;
          if (!edge || !canvasState.nodes.some(n => n.id === edge.from) || !canvasState.nodes.some(n => n.id === edge.to)) return sendJson(res, 400, { error: "Invalid edge endpoints" });
          if (!canvasState.edges.some(e => e.from === edge.from && e.to === edge.to && e.relation === edge.relation)) {
            const id = edge.id || "edge-" + crypto.randomUUID();
            if (typeof id !== "string" || canvasState.edges.some(e => e.id === id)) return sendJson(res, 400, { error: "Invalid or duplicate edge id" });
            canvasState.edges.push({ ...edge, id });
          }
        } else return sendJson(res, 400, { error: "Invalid edge action" });
      } else {
        const node = canvasState.nodes.find(n => n.id === body.nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });
        if (url.pathname === "/api/nodes/delete") {
          if (node.kind === "speculative" || node.commitment === "speculative") canvasState.userModel = recordBehavioralObservation(canvasState.userModel, { type: "branch-pruned", projectId: canvasState.activeProjectId, nodeId: node.id }).updatedUserModel;
          canvasState.nodes = canvasState.nodes.filter(n => n.id !== node.id);
          canvasState = normalizeCanvasState(canvasState);
          result = { deletedId: node.id };
        } else {
          for (const key of ["x", "y", "width", "height"]) if (Number.isFinite(body[key])) node[key] = body[key];
          if (canvasState.viewProjection !== "plex") {
            if (Number.isFinite(body.x)) node.canvasX = node.x;
            if (Number.isFinite(body.y)) node.canvasY = node.y;
          }
          result = { node };
        }
      }
      saveState(canvasState, stateFile); broadcastState();
      return sendJson(res, 200, { ...result, state: canvasState });
    }

    if (req.method === "POST" && url.pathname === "/api/state") {
      try {
        const next = await readJsonBody(req);
        canvasState = normalizeCanvasState({ ...canvasState, ...next });
        if (next.viewProjection === "canvas") restoreCanvasLayout(canvasState);

        saveState(canvasState, stateFile);
        broadcastState();
        return sendJson(res, 200, canvasState);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { error: err.message });
      }
    }

    // T3-Style Global Workspace Projects (`GET /api/projects` & `POST /api/projects`)
    // Defaults to an "anything goes" misc repo (`proj-misc-attic`) so development never blocks
    // waiting to know which repo a card belongs to, while letting users switch or add projects.
    if (
      (req.method === "GET" || req.method === "POST") &&
      url.pathname === "/api/projects"
    ) {
      try {
        if (!Array.isArray(canvasState.projects) || canvasState.projects.length === 0) {
          const def = getDefaultCanvasState();
          canvasState.projects = def.projects;
          canvasState.activeProjectId = def.activeProjectId;
        }
        if (req.method === "GET") {
          const activeProject =
            canvasState.projects.find((p) => p.id === canvasState.activeProjectId) ||
            canvasState.projects[0];
          return sendJson(res, 200, {
            activeProjectId: activeProject.id,
            activeProject,
            projects: canvasState.projects,
          });
        }
        const body = await readJsonBody(req);
        if (body.name && body.repoPath) {
          const newProj = {
            id: body.id || `proj-${Date.now().toString(36)}`,
            name: String(body.name).trim(),
            repoPath: String(body.repoPath).trim(),
            isDefaultMisc: Boolean(body.isDefaultMisc),
            description:
              body.description || `Project workspace at ${body.repoPath}`,
          };
          canvasState.projects = canvasState.projects.filter(
            (p) => p.id !== newProj.id,
          );
          canvasState.projects.push(newProj);
          canvasState.activeProjectId = newProj.id;
        } else if (body.activeProjectId) {
          const exists = canvasState.projects.find(
            (p) => p.id === body.activeProjectId,
          );
          if (!exists) {
            return sendJson(res, 404, { error: "Project not found" });
          }
          canvasState.activeProjectId = exists.id;
        }
        const activeProject =
          canvasState.projects.find((p) => p.id === canvasState.activeProjectId) ||
          canvasState.projects[0];
        saveState(canvasState, stateFile);
        broadcastState();
        return sendJson(res, 200, {
          activeProjectId: activeProject.id,
          activeProject,
          projects: canvasState.projects,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // TheBrain-Style Plex Focus & Multi-View Graph Projection (`GET /api/views/plex` & `POST /api/views/plex`)
    // Computes the Focus-and-Context neighborhood around `focusNodeId` (`parents` above, `children` below,
    // `lateral` Jump/Matchmaker/Lens peers to the left & right) and optionally applies a clean Plex layout.
    if (
      (req.method === "GET" || req.method === "POST") &&
      url.pathname === "/api/views/plex"
    ) {
      try {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        if (req.method === "POST" && (body.restoreCanvasLayout || body.viewProjection === "canvas")) {
          restoreCanvasLayout(canvasState);
          canvasState.viewProjection = "canvas";
          saveState(canvasState, stateFile); broadcastState();
          return sendJson(res, 200, { state: canvasState, viewProjection: "canvas" });
        }
        const explicitId = url.searchParams.get("focusNodeId") || body.focusNodeId;
        const target = canvasState.nodes.find(n => n.id === explicitId);
        if (target?.shadowStaged && req.method === "POST") {
          Object.assign(target, resolveOpenCanvasPosition(canvasState.nodes, target.x, target.y, target.width, target.height, 28, new Set([target.id])));
          target.shadowStaged = false;
          for (const edge of canvasState.edges) if (edge.from === target.id || edge.to === target.id) edge.shadowStaged = false;
        }
        const visibleNodes = canvasState.nodes.filter(n => !n.shadowStaged);
        if (explicitId && !visibleNodes.some(n => n.id === explicitId)) return sendJson(res, 404, { error: "Focus node not found" });
        const requestedId = explicitId || canvasState.plexFocusNodeId || visibleNodes[0]?.id;
        const focusNode = visibleNodes.find(n => n.id === requestedId) || visibleNodes[0];
        if (!focusNode) return sendJson(res, 404, { error: "No visible focus node found" });

        const byId = new Map(visibleNodes.map((n) => [n.id, n]));
        const parents = [];
        const children = [];
        const lateral = [];
        const seen = new Set([focusNode.id]);

        const isLateralEdge = (e, peerNode) =>
          e.kind === "jump" || e.kind === "association" || e.kind === "lens" || e.relation === "association" ||
          e.relation === "cross-pollinates" ||
          e.relation === "annotates" ||
          e.relation === "synthesizes" ||
          e.relation === "implements" ||
          peerNode?.kind === "lens" ||
          (focusNode.parentId && peerNode?.id !== focusNode.parentId && e.to === focusNode.id);

        for (const edge of canvasState.edges || []) {
          if (edge.shadowStaged) continue;
          if (edge.to === focusNode.id && byId.has(edge.from) && !seen.has(edge.from)) {
            seen.add(edge.from);
            const node = byId.get(edge.from);
            if (isLateralEdge(edge, node)) {
              lateral.push({ node, edge, direction: "incoming-lateral" });
            } else {
              parents.push({ node, edge });
            }
          } else if (
            edge.from === focusNode.id &&
            byId.has(edge.to) &&
            !seen.has(edge.to)
          ) {
            seen.add(edge.to);
            const node = byId.get(edge.to);
            if (isLateralEdge(edge, node)) {
              lateral.push({ node, edge, direction: "outgoing-lateral" });
            } else {
              children.push({ node, edge });
            }
          }
        }

        // Also include sibling forks sharing the same parent as lateral peers if not already connected
        if (focusNode.parentId) {
          for (const n of visibleNodes) {
            if (n.parentId === focusNode.parentId && !seen.has(n.id)) {
              seen.add(n.id);
              lateral.push({
                node: n,
                edge: {
                  id: `sibling-${n.id}`,
                  from: focusNode.parentId,
                  to: n.id,
                  relation: "sibling-fork",
                  label: "sibling fork",
                },
                direction: "sibling",
              });
            }
          }
        }

        if (req.method === "POST") {
          canvasState.plexFocusNodeId = focusNode.id;
          if (body.viewProjection) {
            canvasState.viewProjection = body.viewProjection;
          }
          if (body.applyLayout) {
            for (const n of canvasState.nodes) if (typeof n.canvasX !== "number") { n.canvasX = n.x; n.canvasY = n.y; }
            const placed = [];
            const place = (node, x, y) => {
              Object.assign(node, resolveOpenCanvasPosition(placed, x, y, node.width || 400, node.height || 265));
              placed.push(node);
            };
            const centerX = Math.max(900, parents.reduce((sum, p) => sum + (p.node.width || 400) + 28, 0) / 2 + 50);
            place(focusNode, centerX - (focusNode.width || 400) / 2, parents.length > 0 ? 370 : 220);
            let parentX = 40;
            for (const { node } of parents) { place(node, parentX, 40); parentX = node.x + (node.width || 400) + 28; }
            let childX = 40;
            for (const { node } of children) { place(node, childX, focusNode.y + (focusNode.height || 265) + 85); childX = node.x + (node.width || 400) + 28; }
            lateral.forEach(({ node }, idx) => {
              place(node, idx % 2 === 0 ? focusNode.x - (node.width || 400) - 85 : focusNode.x + (focusNode.width || 400) + 85, focusNode.y + Math.floor(idx / 2) * ((node.height || 265) + 28));
            });
            for (const node of visibleNodes) if (!placed.includes(node)) place(node, node.x, node.y);
          }
          saveState(canvasState, stateFile);
          broadcastState();
        }

        return sendJson(res, 200, {
          viewProjection: canvasState.viewProjection || "plex",
          focusNodeId: focusNode.id,
          focusNode,
          parents: parents.map((p) => ({
            id: p.node.id,
            nodeId: p.node.id,
            title: p.node.title,
            stage: p.node.stage,
            surfaceRole: p.node.surfaceRole,
            relation: p.edge.relation || p.edge.kind || "advances",
          })),
          children: children.map((c) => ({
            id: c.node.id,
            nodeId: c.node.id,
            title: c.node.title,
            stage: c.node.stage,
            surfaceRole: c.node.surfaceRole,
            relation: c.edge.relation || c.edge.kind || "advances",
          })),
          lateral: lateral.map((l) => ({
            id: l.node.id,
            nodeId: l.node.id,
            title: l.node.title,
            stage: l.node.stage,
            surfaceRole: l.node.surfaceRole,
            relation: l.edge.relation || l.edge.kind || "jump",
            direction: l.direction,
          })),
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/views/briefing") {
      const model = canvasState.userModel;
      const predictions = model.sealedPredictions || [];
      return sendJson(res, 200, {
        generatedAt: new Date().toISOString(), activeProject: canvasState.projects.find(p => p.id === canvasState.activeProjectId),
        needsYourCall: canvasState.nodes.filter(n => (n.kind === "decision" && !n.decisionMeta?.resolved) || n.shadowStaged).map(n => ({ nodeId: n.id, title: n.title, kind: n.kind, prompt: n.decisionMeta?.prompt || n.state?.seedPrompt || n.title, regime: n.decisionMeta?.regime || "shadow-staged", predictionId: n.decisionMeta?.predictionId || null, candidates: n.decisionMeta?.candidates || [], x: n.x, y: n.y })),
        autonomousAndBasalMoves: canvasState.nodes.filter(n => !n.shadowStaged && n.kind !== "decision" && (n.autonomousReceipt || n.id.startsWith("node-synth-") || (n.energy?.basalRechargedTokens || 0) > 0)).map(n => ({ nodeId: n.id, title: n.title, stage: n.stage, surfaceRole: n.surfaceRole || defaultRoleForStage(n.stage), regime: n.autonomousReceipt?.regime || "basal-explore", reachability: n.autonomousReceipt?.reachability || "ergodic", predictionId: n.autonomousReceipt?.predictionId || null, canSwapCounterfactual: Boolean(n.autonomousReceipt?.predictionId), candidates: n.autonomousReceipt?.candidates || [], chosenOptionIds: n.autonomousReceipt?.chosenOptionIds || [], basalRechargedTokens: n.energy?.basalRechargedTokens || 0, x: n.x, y: n.y })),
        modelShifts: { calibration: computeEmpiricalCalibrationFactor(model.hypotheses), totalPredictions: predictions.length, resolvedCount: predictions.filter(p => p.resolvedAt).length, accurateCount: predictions.filter(p => p.resolvedAt && p.accurate).length, inferredHypotheses: model.hypotheses.filter(h => h.source === "inferred" && h.status === "active"), staleHypotheses: model.hypotheses.filter(h => h.status === "active" && h.usesSinceLastProbe >= 3), recentReceipts: predictions.filter(p => p.resolvedAt).slice(0, 6) },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/canvas/tidy") {
      try {
        const body = await readJsonBody(req);
        const placed = []; let movedCount = 0;
        for (const node of canvasState.nodes.filter(n => !n.shadowStaged).sort((a, b) => a.y - b.y || a.x - b.x)) {
          // Restrict the search below the previous row to retain reading order.
          const pos = resolveOpenCanvasPosition(placed, node.x, Math.max(node.y, placed.at(-1)?.y || 25), node.width || 400, node.height || 260);
          if (placed.length && (pos.y < placed.at(-1).y || (pos.y === placed.at(-1).y && pos.x < placed.at(-1).x))) Object.assign(pos, resolveOpenCanvasPosition(placed, node.x, placed.at(-1).y + (placed.at(-1).height || 260) + 28, node.width || 400, node.height || 260));
          if (pos.x !== node.x || pos.y !== node.y) movedCount++;
          Object.assign(node, pos); placed.push(node);
        }
        saveState(canvasState, stateFile);
        await recordDomainCommand("canvas.tidy", "canvas-root", "canvas.tidied", { movedCount }, [], body.commandId);
        broadcastState(); return sendJson(res, 200, { movedCount, nodes: canvasState.nodes, state: canvasState });
      } catch (err) { return sendJson(res, requestErrorStatus(err), { error: err.message }); }
    }

    if (req.method === "POST" && url.pathname === "/api/user-model/observe") {
      try {
        const body = await readJsonBody(req);
        if (!["counterfactual-override", "co-fork-upgrade", "branch-pruned", "tearoff-promoted"].includes(body.type)) return sendJson(res, 400, { error: "Invalid behavioral event type" });
        const result = recordBehavioralObservation(canvasState.userModel, body);
        canvasState.userModel = result.updatedUserModel; saveState(canvasState, stateFile); broadcastState();
        return sendJson(res, 200, { affectedHypothesis: result.affectedHypothesis, userModel: canvasState.userModel, calibration: computeEmpiricalCalibrationFactor(canvasState.userModel.hypotheses), state: canvasState });
      } catch (err) { return sendJson(res, requestErrorStatus(err), { error: err.message }); }
    }

    if (req.method === "POST" && url.pathname === "/api/decisions/counterfactual") {
      try {
        const { nodeId, predictionId, action = "swap", targetOptionIds, commandId } = await readJsonBody(req);
        if (!["swap", "keep-both", "neither"].includes(action)) return sendJson(res, 400, { error: "Invalid counterfactual action" });
        const node = nodeId ? canvasState.nodes.find(n => n.id === nodeId) : canvasState.nodes.find(n => n.autonomousReceipt?.predictionId === predictionId);
        const pred = canvasState.userModel.sealedPredictions.find(p => p.id === (predictionId || node?.autonomousReceipt?.predictionId));
        if (!pred || (node && node.autonomousReceipt?.predictionId !== pred.id)) return sendJson(res, 404, { error: "Autonomous prediction not found" });
        const candidates = node?.autonomousReceipt?.candidates || [];
        const prompt = node?.autonomousReceipt?.prompt || pred.prompt || "";
        const effectiveOptionIds = action === "neither" ? [] : action === "keep-both" ? candidates.map(c => c.id) : Array.isArray(targetOptionIds) && targetOptionIds.length ? targetOptionIds : candidates.filter(c => c.id !== node?.autonomousReceipt?.candidateId).map(c => c.id).slice(0, 1);
        if (action !== "neither" && (!node || !effectiveOptionIds.length || (action === "swap" && effectiveOptionIds.length !== 1) || effectiveOptionIds.some(id => !candidates.some(c => c.id === id)))) return sendJson(res, 400, { error: "Invalid counterfactual target" });
        // Validate and score before mutating the canvas.
        const scored = scoreSealedPrediction({ userModel: canvasState.userModel, predictionId: pred.id, chosenOptionIds: effectiveOptionIds, allowOverride: true });
        const materializedNodes = [], removedNodeIds = [];
        const render = (n, cand, regimeLabel) => {
          n.title = cand.label;
          n.autonomousReceipt = { ...n.autonomousReceipt, candidateId: cand.id, chosenOptionIds: effectiveOptionIds, regime: action === "swap" ? "counterfactual-swap" : "co-fork", reachability: cand.reachability };
          n.html = renderAutonomousBranchHtml({ candidate: cand, prompt, ideonomyTuple: n.ideonomyTuple, regimeLabel, nodeId: n.id, predictionId: pred.id, candidates, chosenOptionIds: effectiveOptionIds });
          n.facets = { ...n.facets, "ui-prototype": n.html }; materializedNodes.push(n);
        };
        if (action === "neither") {
          for (const n of canvasState.nodes) if (n.autonomousReceipt?.predictionId === pred.id || n.id === nodeId) removedNodeIds.push(n.id);
          const ids = new Set(removedNodeIds);
          canvasState.nodes = canvasState.nodes.filter(n => !ids.has(n.id)); canvasState.edges = canvasState.edges.filter(e => !ids.has(e.from) && !ids.has(e.to));
        } else if (action === "swap") {
          render(node, candidates.find(c => c.id === effectiveOptionIds[0]), "↺ Counterfactual Swap");
        } else {
          candidates.forEach((cand, i) => {
            let sibling = canvasState.nodes.find(n => n.autonomousReceipt?.predictionId === pred.id && n.autonomousReceipt?.candidateId === cand.id);
            if (!sibling) {
              sibling = { ...node, id: `node-auto-${crypto.randomUUID()}`, ...resolveOpenCanvasPosition(canvasState.nodes, node.x + 425, node.y, 395, 260), width: 395, height: 260 };
              canvasState.nodes.push(sibling);
              if (node.parentId) canvasState.edges.push({ id: `edge-auto-${crypto.randomUUID()}`, from: node.parentId, to: sibling.id, relation: "forks", kind: "forks" });
            }
            render(sibling, cand, `✦ Co-Forked (${i + 1}/${candidates.length})`);
          });
        }
        canvasState.userModel = recordBehavioralObservation(scored.updatedUserModel, { type: action === "keep-both" ? "co-fork-upgrade" : action === "neither" ? "branch-pruned" : "counterfactual-override", projectId: pred.projectId || canvasState.activeProjectId, nodeId: node?.id }).updatedUserModel;
        saveState(canvasState, stateFile);
        await recordDomainCommand("decision.counterfactual", nodeId || pred.id, "decision.overridden", { action, predictionId: pred.id, effectiveOptionIds }, [], commandId);
        broadcastState(); return sendJson(res, 200, { action, resolvedPrediction: scored.resolvedPrediction, materializedNodes, removedNodeIds, userModel: canvasState.userModel, calibration: computeEmpiricalCalibrationFactor(canvasState.userModel.hypotheses), state: canvasState });
      } catch (err) { return sendJson(res, ["INVALID_CHOICE", "INFEASIBLE_SUBSET"].includes(err.code) ? 400 : requestErrorStatus(err), { error: err.message }); }
    }

    // Testable Implicit User Model (`GET /api/user-model` & `POST /api/user-model/hypotheses`)
    if (req.method === "GET" && url.pathname === "/api/user-model") {
      canvasState.userModel = canvasState.userModel || createDefaultUserModel();
      const calibration = computeEmpiricalCalibrationFactor(
        canvasState.userModel.hypotheses,
      );
      return sendJson(res, 200, {
        userModel: canvasState.userModel,
        calibration,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/user-model/hypotheses") {
      try {
        canvasState.userModel = canvasState.userModel || createDefaultUserModel();
        const body = await readJsonBody(req);
        const now = new Date().toISOString();
        let hypotheses = [...canvasState.userModel.hypotheses];

        if (body.hypothesisId && !hypotheses.some(h => h.id === body.hypothesisId)) return sendJson(res, 404, { error: "Hypothesis not found" });
        if (body.hypothesisId) {
          hypotheses = hypotheses.map((h) => {
            if (h.id !== body.hypothesisId) return h;
            return {
              ...h,
              ...(typeof body.statement === "string" ? { statement: body.statement.trim() } : {}),
              ...(body.status === "active" || body.status === "refuted" ? { status: body.status } : {}),
              ...(body.polarity === "positive" || body.polarity === "negative" ? { polarity: body.polarity } : {}),
              ...(Number.isFinite(body.weight) ? { weight: Math.max(-1, Math.min(1, body.weight)) } : {}),
              ...(Number.isFinite(body.confidence) ? { confidence: Math.max(0, Math.min(1, body.confidence)) } : {}),
              ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}),
              ...(body.action === "pin" ? { pinned: true, status: "active", confidence: Number(Math.max(h.confidence, 0.85).toFixed(3)) } : {}),
              ...(body.action === "dismiss" ? { status: "refuted", pinned: false } : {}),
              updatedAt: now,
            };
          });
        } else if (typeof body.statement === "string" && body.statement.trim()) {
          hypotheses.unshift({
            source: "explicit", pinned: true,
            id: `hyp-${Date.now().toString(36)}`,
            statement: body.statement.trim(),
            scopeProjectId: body.scopeProjectId || "global",
            polarity: body.polarity === "negative" ? "negative" : "positive",
            weight: Number.isFinite(body.weight) ? Math.max(-1, Math.min(1, body.weight)) : 0.75,
            confidence: Number.isFinite(body.confidence) ? Math.max(0, Math.min(1, body.confidence)) : 0.65,
            empiricalHits: 0,
            empiricalTrials: 0,
            brierSum: 0,
            usesSinceLastProbe: 3, // Untested hypothesis starts ripe for calibration spot-checking
            status: "active",
            updatedAt: now,
          });
        }

        canvasState.userModel = {
          ...canvasState.userModel,
          hypotheses,
        };
        saveState(canvasState, stateFile);
        broadcastState();
        return sendJson(res, 200, {
          userModel: canvasState.userModel,
          calibration: computeEmpiricalCalibrationFactor(hypotheses),
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Sovereign Compute On-the-Fly Decision Compiler (`POST /api/decisions/compile`)
    // Compiles novel situations into a local candidate set A, evaluates the Power Set P(A)
    // (including ∅ = "Neither" and multi-branch "Co-Fork / Both") against Basal Free Energy & Reachability,
    // seals its pre-prediction first, and either acts silently OR surfaces a neutral Choice/Probe card.
    if (req.method === "POST" && url.pathname === "/api/decisions/compile") {
      try {
        canvasState.userModel = canvasState.userModel || createDefaultUserModel();
        const body = await readJsonBody(req);
        if (body.parentNodeId && !canvasState.nodes.some(n => n.id === body.parentNodeId)) return sendJson(res, 404, { error: "Parent node not found" });
        const prompt =
          String(body.prompt || "").trim() ||
          "Explore two complementary directions for ambient zero-chrome UI";
        const projectId =
          body.projectId || canvasState.activeProjectId || "proj-misc-attic";
        const altitudeScale =
          typeof body.attentionalAltitudeScale === "number"
            ? body.attentionalAltitudeScale
            : canvasState.viewport?.scale || 0.88;
        const baseX = Number.isFinite(body.x) ? body.x : 520;
        const baseY = Number.isFinite(body.y) ? body.y : 380;

        const compiled = await compileDecisionTreeOnTheFly({
          prompt,
          userModel: canvasState.userModel,
          projectId,
          model: body.model || DEFAULT_MODEL,
        });

        const decisionNodeId = `node-dec-${Date.now().toString(36)}`;
        const policy = evaluatePowerSetPolicy({
          prompt,
          candidates: compiled.candidates,
          userModel: canvasState.userModel,
          projectId,
          attentionalAltitudeScale: altitudeScale,
          nodeId: decisionNodeId,
        });

        const effectiveRegime = body.forceProbe
          ? "probe-calibration"
          : policy.regime;

        const sealedPrediction = {
          ...policy.sealedPrediction,
          regime: effectiveRegime,
        };

        const materializedNodes = [];
        let decisionNode = null;

        if (
          effectiveRegime === "ask-regret" ||
          effectiveRegime === "probe-calibration"
        ) {
          // Surface a neutral, unanchored Zero-Chrome Decision / Calibration Probe Card
          const hasMutualExclusion = compiled.candidates.some(
            (c) => Array.isArray(c.mutuallyExclusiveWith) && c.mutuallyExclusiveWith.length > 0,
          );
          const html = renderCompiledDecisionSurfaceHtml({
            nodeId: decisionNodeId,
            prompt,
            candidates: compiled.candidates,
            predictionId: sealedPrediction.id,
            allowBoth: !hasMutualExclusion,
          });
          decisionNode = {
            id: decisionNodeId,
            title:
              effectiveRegime === "probe-calibration"
                ? prompt.slice(0, 56)
                : prompt.slice(0, 56),
            kind: "decision",
            stage: "refine",
            surfaceRole: "dialogue",
            commitment: "speculative",
            status: "ready",
            x: baseX,
            y: baseY,
            width: 440,
            height: 270,
            model: body.model || DEFAULT_MODEL,
            parentId: body.parentNodeId || undefined,
            decisionMeta: {
              predictionId: sealedPrediction.id,
              regime: effectiveRegime,
              prompt,
              candidates: compiled.candidates,
              resolved: false,
            },
            facets: { dialogue: html },
            html,
            energy: createDefaultEnergyEnvelope(),
          };
          if (!decisionNode.shadowStaged) Object.assign(decisionNode, resolveOpenCanvasPosition(canvasState.nodes, decisionNode.x, decisionNode.y, decisionNode.width, decisionNode.height));
          canvasState.nodes.push(decisionNode);
          if (body.parentNodeId) {
            canvasState.edges.push({
              id: `edge-dec-${Date.now().toString(36)}`,
              from: body.parentNodeId,
              to: decisionNode.id,
              relation: "advances",
              kind: "advances",
              label: "elicits decision",
            });
          }
          canvasState.userModel = {
            ...canvasState.userModel,
            sealedPredictions: [
              sealedPrediction,
              ...canvasState.userModel.sealedPredictions,
            ].slice(0, 60),
          };
        } else {
          // Act autonomously without interrupting the human! ("co-fork", "act-single", or "abstain-neither")
          const chosenSet = new Set(policy.bestSubset.optionIds);
          const chosenCandidates = compiled.candidates.filter((c) =>
            chosenSet.has(c.id),
          );
          chosenCandidates.forEach((cand, idx) => {
            const branchId = `node-auto-${Date.now().toString(36)}-${idx}`;
            const regimeLabel =
              effectiveRegime === "co-fork"
                ? `✦ Co-Forked (${idx + 1}/${chosenCandidates.length})`
                : "⚡ Auto-Committed";
            const html = renderAutonomousBranchHtml({
              candidate: cand,
              prompt,
              ideonomyTuple: compiled.ideonomyTuple,
              regimeLabel, nodeId: branchId, predictionId: sealedPrediction.id, candidates: compiled.candidates, chosenOptionIds: policy.bestSubset.optionIds,
            });
            const branchNode = {
              id: branchId,
              title: cand.label,
              kind: "surface",
              stage: "design",
              surfaceRole: "ui-prototype",
              commitment: "committed",
              status: "committed",
              x: baseX + idx * 425,
              y: baseY,
              width: 395,
              height: 260,
              model: body.model || DEFAULT_MODEL,
              parentId: body.parentNodeId || undefined,
              ideonomyTuple: {
                operatorIds: compiled.ideonomyTuple.operatorIds,
                organonIds: compiled.ideonomyTuple.organonIds,
                dimensionIds: compiled.ideonomyTuple.dimensionIds,
                tupleLabel: compiled.ideonomyTuple.tupleLabel,
              },
              autonomousReceipt: {
                predictionId: sealedPrediction.id, candidateId: cand.id, candidates: compiled.candidates, chosenOptionIds: policy.bestSubset.optionIds, prompt,
                regime: effectiveRegime,
                reachability: cand.reachability,
              },
              facets: { "ui-prototype": html },
              html,
              energy: createDefaultEnergyEnvelope(),
            };
            if (!branchNode.shadowStaged) Object.assign(branchNode, resolveOpenCanvasPosition(canvasState.nodes, branchNode.x, branchNode.y, branchNode.width, branchNode.height));
            canvasState.nodes.push(branchNode);
            materializedNodes.push(branchNode);
            if (body.parentNodeId) {
              canvasState.edges.push({
                id: `edge-auto-${Date.now().toString(36)}-${idx}`,
                from: body.parentNodeId,
                to: branchNode.id,
                relation: "forks",
                kind: "forks",
                label: regimeLabel,
              });
            }
          });

          canvasState.userModel = recordAutonomousActionOnUserModel(
            canvasState.userModel,
            sealedPrediction,
          );
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "decision.compile",
          decisionNode?.id || materializedNodes[0]?.id || "canvas-root",
          `decision.${effectiveRegime}`,
          {
            predictionId: sealedPrediction.id,
            regime: effectiveRegime,
            predictedSubsetKey: sealedPrediction.predictedSubsetKey,
            materializedNodeIds: materializedNodes.map((n) => n.id),
          },
          [],
          body.commandId,
        );
        broadcastState();

        return sendJson(res, 200, {
          regime: effectiveRegime,
          policy,
          sealedPrediction,
          candidates: compiled.candidates,
          decisionNode,
          materializedNodes,
          userModel: canvasState.userModel,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Resolve a Surfaced Decision / Calibration Probe (`POST /api/decisions/resolve`)
    // Scores the sealed pre-prediction via proper multi-subset Brier score, updates User Model
    // hypotheses, and materializes the chosen subset ({A}, {B}, {Both}, or ∅ = Neither).
    if (req.method === "POST" && url.pathname === "/api/decisions/resolve") {
      try {
        canvasState.userModel = canvasState.userModel || createDefaultUserModel();
        const {
          predictionId,
          nodeId,
          chosenOptionIds = [],
          commandId,
        } = await readJsonBody(req);

        const pred = canvasState.userModel.sealedPredictions.find(p => p.id === predictionId);
        if (!pred) return sendJson(res, 404, { error: "Prediction not found" });
        const decNode = canvasState.nodes.find(n => n.id === nodeId);
        if (nodeId && !decNode) return sendJson(res, 404, { error: "Decision node not found" });
        if (nodeId && decNode.decisionMeta?.predictionId !== predictionId) return sendJson(res, 400, { error: "Prediction does not match decision node" });
        if (pred.resolvedAt || decNode?.decisionMeta?.resolved) return sendJson(res, 409, { error: "Decision already resolved", resolvedPrediction: pred });
        const scored = scoreSealedPrediction({
          userModel: canvasState.userModel,
          predictionId,
          chosenOptionIds,
        });
        canvasState.userModel = scored.updatedUserModel;

        const spawnedNodes = [];

        if (decNode && decNode.decisionMeta) {
          decNode.decisionMeta.resolved = true;
          decNode.decisionMeta.resolvedReceipt = scored.resolvedPrediction;
          decNode.status = "committed";
          decNode.commitment = "committed";
          const updatedHtml = renderCompiledDecisionSurfaceHtml({
            nodeId: decNode.id,
            prompt: decNode.decisionMeta.prompt,
            candidates: decNode.decisionMeta.candidates || [],
            predictionId,
            resolvedReceipt: scored.resolvedPrediction,
          });
          decNode.html = updatedHtml;
          decNode.facets = { ...(decNode.facets || {}), dialogue: updatedHtml };
          decNode.height = 195;

          const chosenSet = new Set(scored.resolvedPrediction.chosenOptionIds);
          const chosenCandidates = (decNode.decisionMeta.candidates || []).filter(
            (c) => chosenSet.has(c.id),
          );
          const tuple = pickIdeonomyTuple({ mode: "plain" });

          chosenCandidates.forEach((cand, idx) => {
            const childId = `node-choice-${Date.now().toString(36)}-${idx}`;
            const childHtml = renderAutonomousBranchHtml({
              candidate: cand,
              prompt: decNode.decisionMeta.prompt,
              ideonomyTuple: tuple,
              regimeLabel:
                chosenCandidates.length >= 2
                  ? `✦ Co-Forked (${idx + 1}/${chosenCandidates.length})`
                  : "✓ Selected Path",
            });
            const childNode = {
              id: childId,
              title: cand.label,
              kind: "surface",
              stage: "design",
              surfaceRole: "ui-prototype",
              commitment: "committed",
              status: "committed",
              x: decNode.x + (idx - (chosenCandidates.length - 1) / 2) * 415,
              y: decNode.y + 225,
              width: 395,
              height: 255,
              model: decNode.model || DEFAULT_MODEL,
              parentId: decNode.id,
              facets: { "ui-prototype": childHtml },
              html: childHtml,
              energy: createDefaultEnergyEnvelope(),
            };
            if (!childNode.shadowStaged) Object.assign(childNode, resolveOpenCanvasPosition(canvasState.nodes, childNode.x, childNode.y, childNode.width, childNode.height));
            canvasState.nodes.push(childNode);
            spawnedNodes.push(childNode);
            canvasState.edges.push({
              id: `edge-choice-${Date.now().toString(36)}-${idx}`,
              from: decNode.id,
              to: childNode.id,
              relation: "forks",
              kind: "forks",
              label: chosenCandidates.length >= 2 ? "✦ co-fork" : "→ chosen",
            });
          });
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "decision.resolve",
          nodeId || predictionId,
          "decision.sealed_prediction.scored",
          {
            predictionId,
            chosenSubsetKey: scored.resolvedPrediction.chosenSubsetKey,
            brierScore: scored.resolvedPrediction.brierScore,
            accurate: scored.resolvedPrediction.accurate,
            spawnedNodeIds: spawnedNodes.map((n) => n.id),
          },
          [],
          commandId,
        );
        broadcastState();

        return sendJson(res, 200, {
          resolvedPrediction: scored.resolvedPrediction,
          spawnedNodes,
          userModel: canvasState.userModel,
          calibration: computeEmpiricalCalibrationFactor(
            canvasState.userModel.hypotheses,
          ),
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Feature 3: Bidirectional Surface <-> Agent Bridge (`window.asterism.setState`, Role & Model Selection)
    if (req.method === "POST" && url.pathname === "/api/nodes/state") {
      try {
        const { nodeId, patch, model, provider, surfaceRole, commandId } =
          await readJsonBody(req);
        const node = canvasState.nodes.find((n) => n.id === nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });

        if (patch && typeof patch === "object") {
          node.state = { ...(node.state || {}), ...patch };
        }
        if (typeof model === "string" && model.trim()) {
          node.model = model.trim();
        }
        if (typeof provider === "string" && provider.trim()) {
          node.provider = provider.trim();
        }
        if (typeof surfaceRole === "string" && SURFACE_ROLES[surfaceRole]) {
          node.surfaceRole = surfaceRole;
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "node.state.patch",
          node.id,
          "surface.state.updated",
          {
            nodeId: node.id,
            patch: patch || {},
            model: node.model,
            surfaceRole: node.surfaceRole,
            state: node.state || {},
          },
          [],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, { node, state: canvasState });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Ideonomy Tuple Picker Endpoint (`GET /api/ideonomy/pick` & `POST /api/ideonomy/pick`)
    // Exposes Patrick Gunkel's Ideonomy tuple sampler (2 Operators × 1 Organon × 3 Dimension-Prompts)
    // with 1-hour half-life mtime cooldown across `ideonomy-plain` and `ideonomy-rich`.
    if (
      (req.method === "GET" || req.method === "POST") &&
      url.pathname === "/api/ideonomy/pick"
    ) {
      try {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        const mode = url.searchParams.get("mode") || body.mode || "rich";
        const seedParam = url.searchParams.get("seed") ?? body.seed;
        const seed = seedParam !== undefined && seedParam !== null ? Number(seedParam) : undefined;
        const tuple = pickIdeonomyTuple({
          mode,
          seed: Number.isFinite(seed) ? seed : undefined,
          forceOperators: Array.isArray(body.forceOperators) ? body.forceOperators : [],
          touchCooldown: seed === undefined,
        });
        return sendJson(res, 200, {
          mode,
          pivotDimension: tuple.pivotDimension,
          pivotDimensionId: tuple.pivotDimension,
          tuple: {
            mode,
            operatorIds: tuple.operatorIds,
            organonIds: tuple.organonIds,
            dimensionIds: tuple.dimensionIds,
            pivotDimension: tuple.pivotDimension,
            pivotDimensionId: tuple.pivotDimension,
            tupleLabel: tuple.tupleLabel,
            promptBlock: tuple.promptBlock,
          },
          catalog: getIdeonomyCatalogSummary(),
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Multi-Panel Aware Mutation:
    // - By default ("minimization of regret"), if the node already has downstream children in the graph,
    //   acting on it branches into an additional future (`revisions-from`) rather than destructively
    //   overwriting or invalidating the existing downstream Innovation Train!
    // - Can also update in-place (`editIntent: "in-place"`) while snapshotting `revisions[]` and
    //   storing per-role `facets[surfaceRole]`.
    if (req.method === "POST" && url.pathname === "/api/nodes/mutate") {
      try {
        const {
          nodeId,
          instruction,
          selectedSelector,
          model,
          surfaceRole,
          editIntent = "auto-branch",
          commandId,
        } = await readJsonBody(req);
        const node = canvasState.nodes.find((n) => n.id === nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });

        const targetRole =
          surfaceRole && SURFACE_ROLES[surfaceRole]
            ? surfaceRole
            : node.surfaceRole || defaultRoleForStage(node.stage);
        const targetModel = model || node.model || DEFAULT_MODEL;

        const branchNewFuture = shouldBranchForRegretMinimization({
          nodeId: node.id,
          edges: canvasState.edges || [],
          editIntent,
        });

        node.status = "mutating";
        broadcastState();

        const neighborhood = collectNeighborhoodNodes(canvasState, node.id);
        const mutationTuple = pickIdeonomyTuple({ mode: "rich" });

        let updatedHtml;
        let spawnedPanels = [];
        let activeIdeonomyTuple = {
          operatorIds: mutationTuple.operatorIds,
          organonIds: mutationTuple.organonIds,
          dimensionIds: mutationTuple.dimensionIds,
          tupleLabel: mutationTuple.tupleLabel,
        };
        if (selectedSelector) {
          updatedHtml = await mutateHtmlSurface({
            currentHtml: node.facets?.[targetRole] || node.html,
            title: node.title,
            surfaceRole: targetRole,
            instruction,
            selectedSelector,
            model: targetModel,
            nodeState: node.state,
            neighborhood,
            ideonomyTuple: mutationTuple,
          });
        } else {
          const collab = await collaborateAcrossPanels({
            sourceNode: {
              ...node,
              surfaceRole: targetRole,
              html: node.facets?.[targetRole] || node.html,
            },
            instruction,
            neighborhood,
            model: targetModel,
          });
          updatedHtml = collab.updatedHtml;
          spawnedPanels = collab.spawnedPanels || [];
          if (collab.ideonomyTuple) {
            activeIdeonomyTuple = collab.ideonomyTuple;
          }
        }

        node.status = "ready";
        let targetNode = node;
        let branchedRevisionNode = null;

        if (branchNewFuture) {
          // Minimization of Regret: Fork a new revision timeline node so existing downstream futures stay 100% intact!
          const siblingRevs = canvasState.edges.filter(
            (e) => e.from === node.id && e.relation === "revisions-from",
          ).length;
          const revNum = (node.revision || 1) + siblingRevs + 1;
          branchedRevisionNode = {
            ...JSON.parse(JSON.stringify(node)),
            id: `${node.id}-rev${revNum}-${Date.now().toString(36).slice(-4)}`,
            title: `${node.title} (v${revNum})`,
            parentId: node.id,
            revision: revNum,
            surfaceRole: targetRole,
            model: targetModel,
            x: node.x + 40,
            y: node.y + node.height + 55 + siblingRevs * 110,
            status: "ready",
            commitment: "speculative",
            html: updatedHtml,
            ideonomyTuple: activeIdeonomyTuple,
            facets: {
              ...(node.facets || { [node.surfaceRole || defaultRoleForStage(node.stage)]: node.html }),
              [targetRole]: updatedHtml,
            },
            energy: createDefaultEnergyEnvelope(node.energy),
          };
          if (!branchedRevisionNode.shadowStaged) Object.assign(branchedRevisionNode, resolveOpenCanvasPosition(canvasState.nodes, branchedRevisionNode.x, branchedRevisionNode.y, branchedRevisionNode.width, branchedRevisionNode.height));
          canvasState.nodes.push(branchedRevisionNode);
          canvasState.edges.push({
            id: `edge-rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: node.id,
            to: branchedRevisionNode.id,
            relation: "revisions-from",
            kind: "revisions-from",
            label: `🌱 branches v${revNum} (existing future preserved)`,
          });
          targetNode = branchedRevisionNode;
        } else {
          // In-place update: preserve prior snapshot in `revisions[]` and never cancel downstream nodes
          const prevRev = node.revision || 1;
          node.revisions = Array.isArray(node.revisions) ? node.revisions : [];
          node.revisions.push({
            revision: prevRev,
            timestamp: new Date().toISOString(),
            title: node.title,
            html: node.html,
            state: { ...(node.state || {}) },
            instruction,
          });
          node.revision = prevRev + 1;
          node.model = targetModel;
          node.surfaceRole = targetRole;
          node.ideonomyTuple = activeIdeonomyTuple;
          node.facets = {
            ...(node.facets || {}),
            [targetRole]: updatedHtml,
          };
          node.html = updatedHtml;

          // Non-destructively notify direct downstream nodes that an upstream revision exists (no cancellation!)
          for (const edge of canvasState.edges || []) {
            if (edge.from === node.id) {
              const child = canvasState.nodes.find((n) => n.id === edge.to);
              if (child) {
                child.upstreamRevisionAvailable = node.revision;
              }
            }
          }
        }

        for (const sp of spawnedPanels) {
          const relMeta =
            PANEL_RELATIONS[sp.relationFromParent] ||
            PANEL_RELATIONS["visualizes-ui"];
          if (!sp.shadowStaged) Object.assign(sp, resolveOpenCanvasPosition(canvasState.nodes, sp.x, sp.y, sp.width, sp.height));
          canvasState.nodes.push(sp);
          canvasState.edges.push({
            id: `edge-rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: targetNode.id,
            to: sp.id,
            relation: sp.relationFromParent,
            kind: sp.relationFromParent,
            label: relMeta.label,
          });
        }

        saveState(canvasState, stateFile);

        await recordDomainCommand(
          "node.mutate",
          targetNode.id,
          branchNewFuture ? "surface.branched.regret_free" : "surface.mutated",
          {
            sourceNodeId: node.id,
            targetNodeId: targetNode.id,
            branchedNewFuture: branchNewFuture,
            instruction,
            model: targetNode.model,
            surfaceRole: targetNode.surfaceRole,
            ideonomyTuple: targetNode.ideonomyTuple,
            spawnedPanelIds: spawnedPanels.map((p) => p.id),
          },
          [{ request: { type: "surface.mutate", nodeId: targetNode.id, instruction } }],
          commandId,
        );

        broadcastState();
        return sendJson(res, 200, {
          node: targetNode,
          branchedNewFuture: branchNewFuture,
          branchedRevisionNode,
          spawnedPanels,
          ideonomyTuple: targetNode.ideonomyTuple,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Crystallization Optic / Facet Tab Switch & Tear-Off Lens (`/api/nodes/facet`)
    // Lets a single Active Thought render any Facet (`dialogue` | `spec-diagram` | `ui-prototype` | `artifact-harness`)
    // either in-place via Facet Tabs OR torn off as a linked side-by-side Lens Panel!
    if (req.method === "POST" && url.pathname === "/api/nodes/facet") {
      try {
        const {
          nodeId,
          facetRole = "spec-diagram",
          tearOff = false,
          prompt,
          model,
          commandId,
        } = await readJsonBody(req);
        const node = canvasState.nodes.find((n) => n.id === nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });

        const currentRole = node.surfaceRole || defaultRoleForStage(node.stage);
        node.facets = node.facets || { [currentRole]: node.html };

        const relationMap = {
          "ui-prototype": "visualizes-ui",
          "spec-diagram": "specifies",
          "artifact-harness": "implements",
          dialogue: "annotates",
        };
        const relation = relationMap[facetRole] || "specifies";

        // Generate facet HTML on demand if not cached yet (or if a custom prompt was supplied)
        if (!node.facets[facetRole] || prompt) {
          node.status = "mutating";
          broadcastState();
          const neighborhood = collectNeighborhoodNodes(canvasState, node.id);
          const generated = await spawnRelatedPanel({
            sourceNode: node,
            relation,
            surfaceRole: facetRole,
            title: node.title,
            prompt:
              prompt ||
              `Crystallize the "${facetRole}" facet lens for thought "${node.title}"`,
            neighborhood,
            existingRelatedCount: 0,
            model: model || node.model || DEFAULT_MODEL,
          });
          node.facets[facetRole] = generated.html;
          node.status = "ready";
        }

        if (tearOff) {
          const existingOut = canvasState.edges.filter(
            (e) => e.from === node.id,
          ).length;
          const tornOffLens = {
            id: `lens-${facetRole}-${Date.now().toString(36)}`,
            title: `${node.title} [${SURFACE_ROLES[facetRole]?.shortBadge || facetRole}]`,
            kind: "lens",
            lensOfNodeId: node.id,
            stage: node.stage,
            surfaceRole: facetRole,
            x: node.x + node.width + 65,
            y: node.y + existingOut * 120,
            width: 410,
            height: 350,
            model: node.model || DEFAULT_MODEL,
            status: "ready",
            state: node.state || {},
            facets: { ...node.facets },
            html: node.facets[facetRole],
            energy: createDefaultEnergyEnvelope(node.energy),
          };
          if (!tornOffLens.shadowStaged) Object.assign(tornOffLens, resolveOpenCanvasPosition(canvasState.nodes, tornOffLens.x, tornOffLens.y, tornOffLens.width, tornOffLens.height));
          canvasState.userModel = recordBehavioralObservation(canvasState.userModel, { type: "tearoff-promoted", projectId: canvasState.activeProjectId, nodeId: node.id }).updatedUserModel;
          canvasState.nodes.push(tornOffLens);
          canvasState.edges.push({
            id: `edge-lens-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            from: node.id,
            to: tornOffLens.id,
            relation,
            kind: "lens",
            label: `🔭 lens (${facetRole})`,
          });
          saveState(canvasState, stateFile);
          await recordDomainCommand(
            "node.facet.tearoff",
            node.id,
            "facet.torn_off",
            { nodeId: node.id, lensNodeId: tornOffLens.id, facetRole },
            [],
            commandId,
          );
          broadcastState();
          return sendJson(res, 200, {
            node,
            tornOffLens,
            facetRole,
            state: canvasState,
          });
        }

        node.surfaceRole = facetRole;
        node.html = node.facets[facetRole];
        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "node.facet.switch",
          node.id,
          "facet.switched",
          { nodeId: node.id, facetRole },
          [],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, { node, facetRole, state: canvasState });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Basal Free-Energy Floor & EVOI Attention Queue (`/api/energy/basal-tick`)
    // Allocates excess "effective free" compute energy to exhausted or high-EVOI directions so the
    // system never deadlocks waiting for a human Steer when free compute can buy positive information value.
    if (
      (req.method === "POST" || req.method === "GET") &&
      url.pathname === "/api/energy/basal-tick"
    ) {
      try {
        for (const n of canvasState.nodes) {
          if (!n.energy) {
            n.energy = createDefaultEnergyEnvelope();
          }
          const w = normalizeWarrant(n);
          n.warrant = w.warrant;
          const downstreamCount = (canvasState.edges || []).filter(
            (e) => e.from === n.id,
          ).length;
          n.attentionBid = computeAttentionBid({
            warrant: n.warrant,
            jevScore: n.jevScore,
            downstreamCount,
            opticMode:
              n.surfaceRole === "ui-prototype"
                ? "exhibit"
                : n.surfaceRole === "dialogue"
                  ? "steer"
                  : "observe",
          });
        }

        const result = allocateBasalFreeEnergy(canvasState.nodes);
        const byId = new Map(canvasState.nodes.map((n) => [n.id, n]));
        for (const alloc of result.allocations) {
          const target = byId.get(alloc.nodeId);
          if (target) {
            target.energy = alloc.updatedEnvelope;
          }
        }

        const attentionQueue = [...canvasState.nodes]
          .sort(
            (a, b) =>
              (b.attentionBid?.evoiScore || 0) -
              (a.attentionBid?.evoiScore || 0),
          )
          .map((n) => ({
            nodeId: n.id,
            title: n.title,
            surfaceRole: n.surfaceRole || defaultRoleForStage(n.stage),
            evoiScore: n.attentionBid?.evoiScore ?? 0,
            epistemicEntropy: n.attentionBid?.epistemicEntropy ?? 0,
            remainingTokens: n.energy?.remainingTokens ?? 0,
            basalRechargedTokens: n.energy?.basalRechargedTokens ?? 0,
          }));

        saveState(canvasState, stateFile);
        broadcastState();
        return sendJson(res, 200, {
          totalGrantedTokens: result.totalGrantedTokens,
          allocations: result.allocations,
          attentionQueue,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Helper to compute EVOI Attention Broker Queue & Shadow Graph Summary
    function computeAttentionBrokerSnapshot() {
      for (const n of canvasState.nodes) {
        if (!n.energy) n.energy = createDefaultEnergyEnvelope();
        const w = normalizeWarrant(n);
        n.warrant = w.warrant;
        const downstreamCount = (canvasState.edges || []).filter(
          (e) => e.from === n.id,
        ).length;
        n.attentionBid = computeAttentionBid({
          warrant: n.warrant,
          jevScore: n.jevScore,
          downstreamCount,
          opticMode:
            n.surfaceRole === "ui-prototype"
              ? "exhibit"
              : n.surfaceRole === "dialogue"
                ? "steer"
                : "observe",
        });
        n.evoiScore = n.attentionBid.evoiScore;
      }

      const shadowNodes = canvasState.nodes.filter((n) => n.shadowStaged);
      const shadowByParent = {};
      for (const sn of shadowNodes) {
        const pid = sn.parentId || "root";
        if (!shadowByParent[pid]) {
          shadowByParent[pid] = {
            parentId: pid,
            count: 0,
            synthesisCount: 0,
            nodeIds: [],
          };
        }
        shadowByParent[pid].count += 1;
        if (sn.stance === "matchmaker" || sn.relationFromParent === "synthesizes") {
          shadowByParent[pid].synthesisCount += 1;
        }
        shadowByParent[pid].nodeIds.push(sn.id);
      }

      const queue = canvasState.nodes
        .filter((n) => n.shadowStaged || n.commitment === "speculative")
        .sort(
          (a, b) =>
            (b.attentionBid?.evoiScore || 0) - (a.attentionBid?.evoiScore || 0),
        )
        .map((n) => ({
          nodeId: n.id,
          parentId: n.parentId || null,
          title: n.title,
          stance: n.stance || "explorer",
          surfaceRole: n.surfaceRole || defaultRoleForStage(n.stage),
          shadowStaged: Boolean(n.shadowStaged),
          askDefault: n.kind === "decision" ? null : n.askDefault || "Keep & Promote to Active Canvas",
          requiresExplicitResolution: n.kind === "decision",
          evoiScore: n.attentionBid?.evoiScore ?? 0,
          epistemicEntropy: n.attentionBid?.epistemicEntropy ?? 0,
          pass: n.attentionBid?.pass ?? 0.5,
          abstain: n.attentionBid?.abstain ?? 0.2,
          estimatedHumanSeconds: n.attentionBid?.estimatedHumanSeconds ?? 15,
          remainingTokens: n.energy?.remainingTokens ?? 3600,
        }));

      return {
        shadowCount: shadowNodes.length,
        shadowByParent,
        queue,
      };
    }

    // Autonomous Idea Box & Ideonomy + Matchmaker + Jev Pipeline (`/api/ideabox/seed`)
    // Drops a 1-sentence seed into the Idea Box (or runs on an existing node), spawns combinatorial
    // Ideonomy branches (Ideonomist Δ, Advocate ∃, Red-Team Critic ∇) + a lateral Matchmaker Jump Synthesis (⋈),
    // and stages all background branches in the Shadow Graph (`shadowStaged: true`) so the human's viewport is never disrupted!
    if (req.method === "POST" && url.pathname === "/api/ideabox/seed") {
      try {
        const body = await readJsonBody(req);
        const prompt =
          body.seedPrompt ||
          body.prompt ||
          "Autonomous voice + gesture co-design surface with live worktree verification";
        const {
          sourceNodeId,
          unfoldImmediately = false,
          x,
          y,
          commandId,
        } = body;

        let seedNode = sourceNodeId
          ? canvasState.nodes.find((n) => n.id === sourceNodeId)
          : null;

        if (sourceNodeId && !seedNode) return sendJson(res, 404, { error: "Source node not found" });
        const seedTuple = pickIdeonomyTuple({ mode: "rich" });
        if (!seedNode) {
          const ts = Date.now();
          const seedId = `node-seed-${ts}`;
          const maxY = canvasState.nodes
            .filter((n) => !n.shadowStaged)
            .reduce((m, n) => Math.max(m, n.y + (n.height || 300)), 40);
          const seedHtml = `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">
  <p style="margin:0 0 12px;color:#94a3b8;font-size:11.5px;">${escapeHtml(String(prompt).slice(0, 120))} — 4 background branches staged in the Shadow Graph.</p>
  <button onclick="window.asterism.unfoldShadowChildren()" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);color:#e0f2fe;font-size:11px;font-weight:500;cursor:pointer;">Unfold Staged Branches</button>
  ${renderIdeonomyMachineryHtml({
    tuple: seedTuple,
    ideaTitle: `Seed: ${prompt.slice(0, 36)}`,
  })}
</div>`;
          seedNode = {
            id: seedId,
            title: `Seed: ${prompt.slice(0, 44)}`,
            kind: "surface",
            stage: "note",
            stratum: "intent",
            surfaceRole: "dialogue",
            commitment: "committed",
            shadowStaged: false,
            ideonomyTuple: {
              operatorIds: seedTuple.operatorIds,
              organonIds: seedTuple.organonIds,
              dimensionIds: seedTuple.dimensionIds,
              tupleLabel: seedTuple.tupleLabel,
            },
            warrant: {
              _tag: "Open",
              pass: 0.75,
              abstain: 0.25,
            },
            energy: createDefaultEnergyEnvelope({ remainingTokens: 3600 }),
            x: typeof x === "number" ? x : 25,
            y: typeof y === "number" ? y : maxY + 45,
            width: 405,
            height: 295,
            model: DEFAULT_MODEL,
            status: "ready",
            branchTag: "idea-seed",
            state: { seedPrompt: prompt },
            facets: { dialogue: seedHtml },
            html: seedHtml,
          };
          if (!seedNode.shadowStaged) Object.assign(seedNode, resolveOpenCanvasPosition(canvasState.nodes, seedNode.x, seedNode.y, seedNode.width, seedNode.height));
          canvasState.nodes.push(seedNode);
        } else {
          seedNode.shadowStaged = false;
          if (!seedNode.ideonomyTuple) {
            seedNode.ideonomyTuple = {
              operatorIds: seedTuple.operatorIds,
              organonIds: seedTuple.organonIds,
              dimensionIds: seedTuple.dimensionIds,
              tupleLabel: seedTuple.tupleLabel,
            };
          }
        }

        // Matchmaker Stance: search the rest of the Brain graph for the highest-affinity distant thought
        const matchCandidates = rankMatchmakerCandidates(
          prompt,
          canvasState.nodes.filter((n) => !n.shadowStaged),
          new Set([seedNode.id]),
        );
        const topMatch = matchCandidates[0] || null;

        const { shadowBranches, matchmakerHybrid } =
          await runIdeonomyAndMatchmakerPipeline({
            seedNode,
            seedPrompt: prompt,
            matchedTargetNode: topMatch?.node || null,
            affinityScore: topMatch?.affinityScore ?? 0.82,
            sharedConcepts: topMatch?.sharedConcepts ?? [],
          });

        const childEnergy = attenuateEnergyForBranches(
          seedNode.energy || createDefaultEnergyEnvelope(),
          shadowBranches.length + (matchmakerHybrid ? 1 : 0),
        );

        const stagedNodes = [];
        for (const sb of shadowBranches) {
          sb.energy = childEnergy;
          sb.shadowStaged = !unfoldImmediately;
          if (!sb.shadowStaged) Object.assign(sb, resolveOpenCanvasPosition(canvasState.nodes, sb.x, sb.y, sb.width, sb.height));
          canvasState.nodes.push(sb);
          stagedNodes.push(sb);
          canvasState.edges.push({
            id: `edge-ideo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: seedNode.id,
            to: sb.id,
            relation: sb.relationFromParent,
            kind: "ideonomy",
            shadowStaged: !unfoldImmediately,
            label: `${sb.stance} (${sb.warrant.pass})`,
          });
        }

        let jumpEdge = null;
        if (matchmakerHybrid && topMatch?.node) {
          matchmakerHybrid.energy = childEnergy;
          matchmakerHybrid.shadowStaged = !unfoldImmediately;
          if (!matchmakerHybrid.shadowStaged) Object.assign(matchmakerHybrid, resolveOpenCanvasPosition(canvasState.nodes, matchmakerHybrid.x, matchmakerHybrid.y, matchmakerHybrid.width, matchmakerHybrid.height));
          canvasState.nodes.push(matchmakerHybrid);
          stagedNodes.push(matchmakerHybrid);

          // Lateral Jump Link across the Plex + Synthesis edges
          jumpEdge = {
            id: `edge-jump-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            from: seedNode.id,
            to: topMatch.node.id,
            relation: "cross-pollinates",
            kind: "jump",
            label: `🧲 lateral jump (affinity=${topMatch.affinityScore})`,
          };
          canvasState.edges.push(jumpEdge);
          canvasState.edges.push({
            id: `edge-mm1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            from: seedNode.id,
            to: matchmakerHybrid.id,
            relation: "synthesizes",
            kind: "synthesis",
            shadowStaged: !unfoldImmediately,
            label: `⊕ matchmaker ⋈`,
          });
          canvasState.edges.push({
            id: `edge-mm2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            from: topMatch.node.id,
            to: matchmakerHybrid.id,
            relation: "synthesizes",
            kind: "synthesis",
            shadowStaged: !unfoldImmediately,
            label: `⊕ cross-pollinates`,
          });
        }

        const attentionBroker = computeAttentionBrokerSnapshot();
        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "ideabox.seed",
          seedNode.id,
          "ideabox.constellation.staged",
          {
            seedNodeId: seedNode.id,
            prompt,
            stagedNodeIds: stagedNodes.map((n) => n.id),
            matchedNodeId: topMatch?.node?.id || null,
            affinityScore: topMatch?.affinityScore || null,
          },
          [],
          commandId,
        );
        broadcastState();

        return sendJson(res, 200, {
          seedNode,
          stagedNodes,
          shadowBranches: stagedNodes,
          matchedTargetNode: topMatch?.node || null,
          affinityScore: topMatch?.affinityScore || null,
          jumpEdge,
          attentionBroker,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Shadow Graph Unfold / Promote on Receipt (`/api/shadow/unfold`)
    // Promotes background-staged Shadow Graph nodes onto the active 2D spatial canvas only when
    // the human clicks the Shadow Badge on a parent card or accepts an item from the Attention Queue!
    if (req.method === "POST" && url.pathname === "/api/shadow/unfold") {
      try {
        const { parentNodeId, nodeIds, commandId } = await readJsonBody(req);
        const targetSet = Array.isArray(nodeIds) && nodeIds.length > 0
          ? new Set(nodeIds)
          : null;

        const unfoldedIds = [];
        for (const n of canvasState.nodes) {
          if (!n.shadowStaged) continue;
          const matchParent = parentNodeId ? n.parentId === parentNodeId : true;
          const matchId = targetSet ? targetSet.has(n.id) : true;
          if (matchParent && matchId) {
            Object.assign(n, resolveOpenCanvasPosition(canvasState.nodes, n.x, n.y, n.width, n.height, 28, new Set([n.id])));
            n.shadowStaged = false;
            unfoldedIds.push(n.id);
          }
        }

        const unfoldedSet = new Set(unfoldedIds);
        for (const e of canvasState.edges) {
          if (e.shadowStaged && (unfoldedSet.has(e.to) || unfoldedSet.has(e.from))) {
            e.shadowStaged = false;
          }
        }

        const attentionBroker = computeAttentionBrokerSnapshot();
        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "shadow.unfold",
          parentNodeId || "canvas-root",
          "shadow.branches.unfolded",
          { parentNodeId: parentNodeId || null, unfoldedIds },
          [],
          commandId,
        );
        broadcastState();

        return sendJson(res, 200, {
          unfoldedIds,
          unfoldedNodeIds: unfoldedIds,
          attentionBroker,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Attention Broker Queue & Auto-Resolve via `AskDefault` (`/api/attention/queue` & `/api/attention/auto-resolve`)
    if (req.method === "GET" && url.pathname === "/api/attention/queue") {
      const attentionBroker = computeAttentionBrokerSnapshot();
      return sendJson(res, 200, attentionBroker);
    }

    if (req.method === "POST" && url.pathname === "/api/attention/auto-resolve") {
      try {
        const { nodeId, commandId } = await readJsonBody(req);
        const attentionBrokerBefore = computeAttentionBrokerSnapshot();
        const targetId = nodeId || attentionBrokerBefore.queue.find(item => canvasState.nodes.find(n => n.id === item.nodeId)?.kind !== "decision")?.nodeId;
        const targetNode = canvasState.nodes.find((n) => n.id === targetId);
        if (!targetNode) {
          return sendJson(res, 404, { error: "No pending attention item found" });
        }

        if (targetNode.kind === "decision") return sendJson(res, 400, { error: "Decision cards require explicit resolution via /api/decisions/resolve" });

        // Apply `Hydro.Workflow.Ask` default (`askDefault`) so the human is never a bottleneck!
        targetNode.shadowStaged = false;
        targetNode.commitment = "committed";
        targetNode.status = "committed";
        targetNode.kind = "surface";
        targetNode.state = {
          ...(targetNode.state || {}),
          autoResolvedViaAskDefault:
            targetNode.askDefault || "Keep & Promote to Active Canvas",
          resolvedAt: new Date().toISOString(),
        };

        for (const e of canvasState.edges) {
          if (e.to === targetNode.id || e.from === targetNode.id) {
            e.shadowStaged = false;
          }
        }

        const attentionBroker = computeAttentionBrokerSnapshot();
        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "attention.auto_resolve",
          targetNode.id,
          "attention.ask_default.applied",
          {
            nodeId: targetNode.id,
            appliedDecision: targetNode.state.autoResolvedViaAskDefault,
          },
          [],
          commandId,
        );
        broadcastState();

        return sendJson(res, 200, {
          resolvedNode: targetNode,
          appliedDecision: targetNode.state.autoResolvedViaAskDefault,
          attentionBroker,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Spawn a Related Companion Panel with a Typed Relation (`visualizes-ui`, `specifies`, `implements`, `annotates`)
    if (req.method === "POST" && url.pathname === "/api/nodes/spawn-related") {
      try {
        const {
          sourceNodeId,
          relation = "visualizes-ui",
          surfaceRole,
          title,
          prompt,
          model,
          commandId,
        } = await readJsonBody(req);

        const sourceNode = canvasState.nodes.find((n) => n.id === sourceNodeId);
        if (!sourceNode) {
          return sendJson(res, 404, { error: "Source node not found" });
        }

        sourceNode.status = "mutating";
        broadcastState();

        const neighborhood = collectNeighborhoodNodes(canvasState, sourceNode.id);
        const existingRelatedCount = canvasState.edges.filter(
          (e) => e.from === sourceNode.id,
        ).length;

        const childNode = await spawnRelatedPanel({
          sourceNode,
          relation,
          surfaceRole,
          title,
          prompt,
          neighborhood,
          existingRelatedCount,
          model: model || sourceNode.model || DEFAULT_MODEL,
        });

        sourceNode.status = "ready";
        const relMeta =
          PANEL_RELATIONS[childNode.relationFromParent] ||
          PANEL_RELATIONS["visualizes-ui"];

        if (!childNode.shadowStaged) Object.assign(childNode, resolveOpenCanvasPosition(canvasState.nodes, childNode.x, childNode.y, childNode.width, childNode.height));

        canvasState.nodes.push(childNode);
        canvasState.edges.push({
          id: `edge-rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: sourceNode.id,
          to: childNode.id,
          relation: childNode.relationFromParent,
          kind: childNode.relationFromParent,
          label: relMeta.label,
        });

        const outboxEffects = [
          {
            request: {
              type: "panel.spawn-related",
              sourceNodeId: sourceNode.id,
              childNodeId: childNode.id,
              relation: childNode.relationFromParent,
              surfaceRole: childNode.surfaceRole,
              ...(prompt ? { prompt } : {}),
            },
          },
        ];

        if (childNode.surfaceRole === "artifact-harness" || childNode.stage === "implement") {
          try {
            const wt = await Effect.runPromise(
              createIsolatedWorktree({
                repoRoot: __dirname,
                worktreesDir,
                nodeId: childNode.id,
              }),
            );
            childNode.worktree = wt;
            outboxEffects.push({
              request: {
                type: "harness.run-turn",
                nodeId: childNode.id,
                provider: childNode.provider || "codex",
                model: childNode.model || DEFAULT_MODEL,
                prompt:
                  prompt ||
                  `Implement and verify ${childNode.title} inside isolated worktree`,
                cwd: wt.worktreePath,
              },
            });
          } catch {
            // Ignore worktree error if git is unavailable
          }
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "panel.spawn-related",
          sourceNode.id,
          "panel.related.spawned",
          {
            sourceNodeId: sourceNode.id,
            childNodeId: childNode.id,
            relation: childNode.relationFromParent,
            surfaceRole: childNode.surfaceRole,
          },
          outboxEffects,
          commandId,
        );

        await drainOutbox();
        broadcastState();

        return sendJson(res, 200, { childNode, state: canvasState });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Feature 4: Multi-Provider / Multi-Model Arena Forking
    if (req.method === "POST" && url.pathname === "/api/nodes/speculate") {
      try {
        const {
          nodeId,
          prompt,
          count = 3,
          arenaMode = true,
          surfaceRole,
          models,
          commandId,
        } = await readJsonBody(req);
        const sourceNode = canvasState.nodes.find((n) => n.id === nodeId);
        if (!sourceNode)
          return sendJson(res, 404, { error: "Source node not found" });

        sourceNode.status = "speculating";
        broadcastState();

        const neighborhood = collectNeighborhoodNodes(canvasState, sourceNode.id);
        const branches = await generateSpeculativeBranches({
          sourceNode,
          prompt,
          count,
          arenaMode,
          surfaceRole,
          models,
          neighborhood,
        });

        const parentEnergy =
          sourceNode.energy || createDefaultEnergyEnvelope();
        const childEnergy = attenuateEnergyForBranches(
          parentEnergy,
          branches.length || count,
        );
        sourceNode.energy = {
          ...parentEnergy,
          remainingTokens: Math.max(
            400,
            parentEnergy.remainingTokens - 300 * branches.length,
          ),
        };

        sourceNode.status = "ready";
        for (const b of branches) {
          b.commitment = "speculative";
          b.warrant = normalizeWarrant(b).warrant;
          b.energy = childEnergy;
          b.facets = { [b.surfaceRole || defaultRoleForStage(b.stage)]: b.html };
          if (!b.shadowStaged) Object.assign(b, resolveOpenCanvasPosition(canvasState.nodes, b.x, b.y, b.width, b.height));
          canvasState.nodes.push(b);
          const shortModel = (b.model || "").replace(/^openai\//, "");
          canvasState.edges.push({
            id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: sourceNode.id,
            to: b.id,
            relation: "forks",
            kind: arenaMode ? "arena" : "speculative",
            label: arenaMode
              ? `⚔ forks (${shortModel} • p=${b.jevScore})`
              : `${b.branchTag} (p=${b.jevScore})`,
          });
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "node.speculate",
          sourceNode.id,
          "branches.forked",
          {
            sourceNodeId: sourceNode.id,
            arenaMode,
            branchIds: branches.map((b) => b.id),
            models: branches.map((b) => b.model),
          },
          [
            {
              request: {
                type: "surface.speculate",
                nodeId: sourceNode.id,
                prompt: prompt || "Arena Speculate",
                count,
              },
            },
          ],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, { branches, state: canvasState });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Feature 2: Multi-Parent Convergence ("Synthesize / Merge Forks" DAG Node)
    if (req.method === "POST" && url.pathname === "/api/nodes/synthesize") {
      try {
        const {
          parentIds = [],
          instruction,
          targetStage,
          surfaceRole,
          model,
          commandId,
        } = await readJsonBody(req);

        const uniqueParentIds = [...new Set(parentIds)];
        const parentNodes = uniqueParentIds
          .map((id) => canvasState.nodes.find((n) => n.id === id))
          .filter(Boolean);

        if (parentNodes.length < 2) {
          return sendJson(res, 400, {
            error: "At least 2 parent nodes are required to synthesize a merged branch",
          });
        }

        // Preserve Epistemic Honesty: Do NOT silently launder speculative parents into "committed"
        // merely because they were coupled (`⋈`); only explicit Keep (`Steer`) or verified checks commit!
        broadcastState();

        const synthNode = await synthesizeNodes({
          parentNodes,
          instruction,
          targetStage,
          surfaceRole,
          model: model || parentNodes[0]?.model || DEFAULT_MODEL,
        });
        synthNode.commitment = "speculative";
        synthNode.warrant = normalizeWarrant(synthNode).warrant;
        synthNode.energy = createDefaultEnergyEnvelope();
        synthNode.facets = {
          [synthNode.surfaceRole || defaultRoleForStage(synthNode.stage)]:
            synthNode.html,
        };

        if (!synthNode.shadowStaged) Object.assign(synthNode, resolveOpenCanvasPosition(canvasState.nodes, synthNode.x, synthNode.y, synthNode.width, synthNode.height));

        canvasState.nodes.push(synthNode);
        for (const p of parentNodes) {
          canvasState.edges.push({
            id: `edge-synth-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: p.id,
            to: synthNode.id,
            relation: "synthesizes",
            kind: "synthesis",
            label: `⊕ synthesizes (${p.surfaceRole || p.stage})`,
          });
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "node.synthesize",
          synthNode.id,
          "branches.synthesized",
          {
            synthNodeId: synthNode.id,
            parentIds: parentNodes.map((p) => p.id),
            stage: synthNode.stage,
            surfaceRole: synthNode.surfaceRole,
          },
          [
            {
              request: {
                type: "surface.synthesize",
                nodeId: synthNode.id,
                parentIds: parentNodes.map((p) => p.id),
                targetStage: synthNode.stage,
                ...(instruction ? { instruction } : {}),
              },
            },
          ],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, { synthNode, state: canvasState });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/nodes/commit-branch") {
      try {
        const { nodeId, pruneSiblings = false, commandId } =
          await readJsonBody(req);
        const winner = canvasState.nodes.find((n) => n.id === nodeId);
        if (!winner)
          return sendJson(res, 404, { error: "Branch node not found" });

        winner.status = "committed";
        winner.commitment = "committed";
        winner.kind = "surface";

        let discarded = [];
        if (pruneSiblings && winner.parentId) {
          const siblingIds = new Set(
            canvasState.nodes
              .filter(
                (n) =>
                  n.parentId === winner.parentId &&
                  n.id !== winner.id &&
                  n.status !== "committed",
              )
              .map((n) => n.id),
          );
          discarded = [...siblingIds];
          canvasState.nodes = canvasState.nodes.filter(
            (n) => !siblingIds.has(n.id),
          );
          canvasState.edges = canvasState.edges.filter(
            (e) => !siblingIds.has(e.from) && !siblingIds.has(e.to),
          );
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "branch.keep",
          winner.id,
          "branch.committed",
          { winnerId: winner.id, discarded },
          [],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, { winner, discarded, state: canvasState });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/nodes/prune-unkept") {
      try {
        const { parentId, commandId } = await readJsonBody(req);
        const unkeptIds = new Set(
          canvasState.nodes
            .filter(
              (n) =>
                (!parentId || n.parentId === parentId) &&
                n.kind === "speculative" &&
                n.status !== "committed",
            )
            .map((n) => n.id),
        );
        if (unkeptIds.size > 0) canvasState.userModel = recordBehavioralObservation(canvasState.userModel, { type: "branch-pruned", projectId: canvasState.activeProjectId }).updatedUserModel;
        canvasState.nodes = canvasState.nodes.filter(
          (n) => !unkeptIds.has(n.id),
        );
        canvasState.edges = canvasState.edges.filter(
          (e) => !unkeptIds.has(e.from) && !unkeptIds.has(e.to),
        );
        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "branch.prune-unkept",
          parentId || "canvas-root",
          "branches.pruned",
          { discarded: [...unkeptIds] },
          [],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, {
          discarded: [...unkeptIds],
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/nodes/advance") {
      try {
        const { nodeId, targetStage, surfaceRole, instruction, commandId } =
          await readJsonBody(req);
        const sourceNode = canvasState.nodes.find((n) => n.id === nodeId);
        if (!sourceNode)
          return sendJson(res, 404, { error: "Source node not found" });

        if (sourceNode.kind === "speculative") {
          sourceNode.status = "committed";
          sourceNode.kind = "surface";
        }
        sourceNode.status = "mutating";
        broadcastState();

        const neighborhood = collectNeighborhoodNodes(canvasState, sourceNode.id);
        const childNode = await advanceNodeStage({
          sourceNode,
          targetStage,
          surfaceRole,
          instruction,
          neighborhood,
        });

        const existingDownstream = canvasState.edges.filter(
          (e) => e.from === sourceNode.id,
        ).length;
        childNode.y = sourceNode.y + existingDownstream * 140;

        sourceNode.status = "committed";
        const relMeta =
          PANEL_RELATIONS[childNode.relationFromParent] ||
          PANEL_RELATIONS.advances;
        if (!childNode.shadowStaged) Object.assign(childNode, resolveOpenCanvasPosition(canvasState.nodes, childNode.x, childNode.y, childNode.width, childNode.height));
        canvasState.nodes.push(childNode);
        canvasState.edges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: sourceNode.id,
          to: childNode.id,
          relation: childNode.relationFromParent || "advances",
          kind: childNode.relationFromParent || "advances",
          label: `${relMeta.label} (${childNode.stage})`,
        });

        const outboxEffects = [
          {
            request: {
              type: "train.advance",
              nodeId: sourceNode.id,
              targetStage: childNode.stage,
              ...(instruction ? { instruction } : {}),
            },
          },
        ];

        // Feature 1: If advancing into IMPLEMENT, provision an isolated Git worktree and enqueue an outbox agent turn!
        if (childNode.stage === "implement") {
          try {
            const wt = await Effect.runPromise(
              createIsolatedWorktree({
                repoRoot: __dirname,
                worktreesDir,
                nodeId: childNode.id,
              }),
            );
            childNode.worktree = wt;
            outboxEffects.push({
              request: {
                type: "harness.run-turn",
                nodeId: childNode.id,
                provider: childNode.provider || "codex",
                model: childNode.model || DEFAULT_MODEL,
                prompt:
                  instruction ||
                  `Implement and verify ${childNode.title} inside isolated worktree`,
                cwd: wt.worktreePath,
              },
            });
          } catch {
            // Ignore worktree error if git is unavailable
          }
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "train.advance",
          sourceNode.id,
          "node.advanced",
          {
            sourceNodeId: sourceNode.id,
            childNodeId: childNode.id,
            stage: childNode.stage,
            surfaceRole: childNode.surfaceRole,
            worktree: childNode.worktree ?? null,
          },
          outboxEffects,
          commandId,
        );

        // Drain the outbox so any `harness.run-turn` effect materializes code, runs `node --test`, and computes `git diff`
        await drainOutbox();

        broadcastState();
        return sendJson(res, 200, {
          childNode,
          state: canvasState,
          peerFederationReady: Boolean(peerFederation),
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Feature 1: Inspect live Git diff & verification status for an IMPLEMENT node
    if (req.method === "GET" && url.pathname === "/api/nodes/implement/diff") {
      try {
        const nodeId = url.searchParams.get("nodeId");
        const node = canvasState.nodes.find((n) => n.id === nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });

        if (!node.worktree?.worktreePath) {
          return sendJson(res, 200, {
            nodeId: node.id,
            hasWorktree: false,
            implementation: node.implementation || null,
          });
        }

        const diff = await Effect.runPromise(
          inspectWorktreeDiff(node.worktree.worktreePath),
        );
        if (node.implementation) {
          node.implementation.diff = diff;
        }
        return sendJson(res, 200, {
          nodeId: node.id,
          hasWorktree: true,
          worktree: node.worktree,
          diff,
          implementation: node.implementation || null,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Feature 1: Trigger or re-run the Outbox Agent inside an IMPLEMENT node's Git worktree
    if (req.method === "POST" && url.pathname === "/api/nodes/implement/run") {
      try {
        const { nodeId, instruction, provider, model, commandId } =
          await readJsonBody(req);
        const node = canvasState.nodes.find((n) => n.id === nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });

        node.stage = "implement";
        node.surfaceRole = "artifact-harness";
        if (model) node.model = model;
        if (provider) node.provider = provider;

        const activeProject =
          (canvasState.projects || []).find(
            (p) => p.id === canvasState.activeProjectId,
          ) || (canvasState.projects || [])[0];
        const targetRepoRoot =
          activeProject?.repoPath && fs.existsSync(activeProject.repoPath)
            ? activeProject.repoPath
            : __dirname;
        node.projectId = activeProject?.id || "proj-misc-attic";

        if (!node.worktree?.worktreePath) {
          node.worktree = await Effect.runPromise(
            createIsolatedWorktree({
              repoRoot: targetRepoRoot,
              worktreesDir,
              nodeId: node.id,
            }),
          );
        }

        await recordDomainCommand(
          "implement.run",
          node.id,
          "implement.turn.enqueued",
          {
            nodeId: node.id,
            worktreePath: node.worktree.worktreePath,
            instruction: instruction || "Run worktree implementation & verification",
          },
          [
            {
              request: {
                type: "harness.run-turn",
                nodeId: node.id,
                provider: node.provider || "codex",
                model: node.model || DEFAULT_MODEL,
                prompt:
                  instruction ||
                  `Implement and verify ${node.title} inside isolated worktree`,
                cwd: node.worktree.worktreePath,
              },
            },
          ],
          commandId,
        );

        await drainOutbox();
        return sendJson(res, 200, {
          node,
          implementation: node.implementation,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Feature 1: Commit generated implementation inside the node's isolated Git worktree branch
    if (req.method === "POST" && url.pathname === "/api/nodes/implement/commit") {
      try {
        const { nodeId, message, commandId } = await readJsonBody(req);
        const node = canvasState.nodes.find((n) => n.id === nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });
        if (!node.worktree?.worktreePath) {
          return sendJson(res, 400, { error: "Node has no provisioned Git worktree" });
        }

        const commitMessage =
          message || `Implement ${node.title} (${node.id}) via Asterism Innovation Train`;

        const commitResult = await Effect.runPromise(
          commitWorktreeChanges({
            worktreePath: node.worktree.worktreePath,
            message: commitMessage,
          }),
        );

        node.worktree.headCommit = commitResult.commitSha;
        node.worktree.lastCommitMessage = commitResult.message;
        if (node.implementation) {
          node.implementation.lastCommit = commitResult;
          node.implementation.diff = await Effect.runPromise(
            inspectWorktreeDiff(node.worktree.worktreePath),
          );
        }

        saveState(canvasState, stateFile);
        await recordDomainCommand(
          "implement.commit",
          node.id,
          "worktree.committed",
          {
            nodeId: node.id,
            ...commitResult,
          },
          [
            {
              request: {
                type: "worktree.commit",
                nodeId: node.id,
                worktreePath: node.worktree.worktreePath,
                message: commitMessage,
              },
            },
          ],
          commandId,
        );
        await drainOutbox();
        broadcastState();

        return sendJson(res, 200, {
          commit: commitResult,
          node,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, requestErrorStatus(err), { error: err.message });
      }
    }

    // Serve static files from public/
    const relPath =
      url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const filePath = path.join(PUBLIC_DIR, relPath);
    if (
      (filePath.startsWith(PUBLIC_DIR + path.sep) || filePath === path.join(PUBLIC_DIR, "index.html")) &&
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile()
    ) {
      const ext = path.extname(filePath);
      const mime =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".js" || ext === ".mjs"
            ? "application/javascript; charset=utf-8"
            : ext === ".css"
              ? "text/css; charset=utf-8"
              : "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
    } catch (err) { if (!res.headersSent) sendJson(res, err.statusCode || 500, { error: err.message || "Internal server error" }); }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3456);
  const server = createAsterismServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(
      `Asterism Spatial Canvas & Effect-TS Orchestrator running at http://localhost:${port} (and https://agentbox-101.exe.xyz:${port}/)`,
    );
  });
}
