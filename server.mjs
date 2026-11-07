import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import { getDefaultCanvasState } from "./src/default-state.mjs";
import { mutateHtmlSurface, generateSpeculativeBranches, advanceNodeStage } from "./src/llm.mjs";
import {
  makeSqliteEventSink,
  makePeerFederation,
  createIsolatedWorktree,
  MCP_PROTOCOL_VERSION,
  MODE_LIMIT_HEADER,
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

export const ENVIRONMENT_ID = process.env.ASTERISM_ENV_ID || "env-asterism-agentbox-101";

export const EXTRACTED_PROVIDER_CATALOG = [
  { id: "codex", package: "@t3tools/provider-codex", protocol: "effect-codex-app-server", capabilities: CodexProviderCapabilitiesV2 },
  { id: "claudeAgent", package: "@t3tools/provider-claude", protocol: "claude-agent-sdk", capabilities: ClaudeProviderCapabilitiesV2 },
  { id: "antigravity", package: "@t3tools/provider-antigravity", protocol: "effect-acp", capabilities: AcpProviderCapabilitiesV2 },
  { id: "pi", package: "@t3tools/provider-pi", protocol: "pi-rpc", capabilities: AcpProviderCapabilitiesV2 },
  { id: "opencode", package: "@t3tools/provider-opencode", protocol: "opencode-v1-v2", capabilities: AcpProviderCapabilitiesV2 },
  { id: "cursor", package: "@t3tools/provider-cursor", protocol: "cursor-sdk", capabilities: AcpProviderCapabilitiesV2 },
  { id: "muse", package: "@t3tools/provider-muse", protocol: "muse-msp", capabilities: AcpProviderCapabilitiesV2 },
  { id: "grok", package: "@t3tools/provider-grok", protocol: "effect-acp", capabilities: AcpProviderCapabilitiesV2 },
  { id: "fx", package: "@t3tools/provider-fx", protocol: "effect-acp", capabilities: AcpProviderCapabilitiesV2 },
  { id: "kiro", package: "@t3tools/provider-kiro", protocol: "effect-acp", capabilities: AcpProviderCapabilitiesV2 },
  { id: "acp-registry", package: "@t3tools/provider-acp-registry", protocol: "effect-acp", capabilities: AcpProviderCapabilitiesV2 },
];

export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch {
    // Fall back to default state
  }
  const initial = getDefaultCanvasState();
  saveState(initial);
  return initial;
}

export function saveState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
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
  const eventSink = Effect.runSync(makeSqliteEventSink(dbPath));
  const peerFederation = Effect.runSync(makePeerFederation());
  Effect.runSync(eventSink.reconcileAfterProcessLoss);

  let canvasState = loadState();
  const sseClients = new Set();
  const mcpSessions = new Map();

  function broadcastState(eventType = "state") {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(canvasState)}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  }

  async function recordDomainCommand(commandType, streamId, eventType, payload, effects = [], commandId) {
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

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // 1. Environment Descriptor (for T3-style Multi-Route Connection Probing & Peer Verification)
    if (req.method === "GET" && url.pathname === "/api/environment/descriptor") {
      return sendJson(res, 200, {
        environmentId: ENVIRONMENT_ID,
        name: "asterism-agentbox-101",
        protocolVersion: MCP_PROTOCOL_VERSION,
        providers: EXTRACTED_PROVIDER_CATALOG.map((p) => p.id),
      });
    }

    // 2. Extracted Provider Harness Catalog
    if (req.method === "GET" && url.pathname === "/api/providers") {
      return sendJson(res, 200, {
        providers: EXTRACTED_PROVIDER_CATALOG,
      });
    }

    // 3. Event-Sourced Outbox & Event Log Inspection
    if (req.method === "GET" && url.pathname === "/api/events/log") {
      const after = Number(url.searchParams.get("after") || 0);
      const events = await Effect.runPromise(eventSink.readEventsAfter(after));
      return sendJson(res, 200, { events });
    }

    // 4. Peer Federation `/mcp` Endpoint (JSON-RPC 2.0 + T3-Mode-Limit header support)
    if (req.method === "POST" && url.pathname === "/mcp") {
      try {
        const rpc = await readJsonBody(req);
        const modeLimit = req.headers[MODE_LIMIT_HEADER.toLowerCase()] || "full-access/default";

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
                serverInfo: { name: "asterism-mcp", version: "0.2.0" },
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
                status: n.status,
              })),
            };
            return sendJson(res, 200, {
              jsonrpc: "2.0",
              id: rpc.id ?? 1,
              result: {
                content: [{ type: "text", text: JSON.stringify(summary) }],
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
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: state\ndata: ${JSON.stringify(canvasState)}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      return sendJson(res, 200, canvasState);
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      canvasState = getDefaultCanvasState();
      saveState(canvasState);
      await recordDomainCommand("canvas.reset", "canvas-root", "canvas.reset", {
        nodeCount: canvasState.nodes.length,
      });
      broadcastState();
      return sendJson(res, 200, canvasState);
    }

    if (req.method === "POST" && url.pathname === "/api/state") {
      try {
        const next = await readJsonBody(req);
        if (Array.isArray(next.nodes)) canvasState.nodes = next.nodes;
        if (Array.isArray(next.edges)) canvasState.edges = next.edges;
        if (Array.isArray(next.strokes)) canvasState.strokes = next.strokes;
        if (next.viewport) canvasState.viewport = next.viewport;
        saveState(canvasState);
        broadcastState();
        return sendJson(res, 200, canvasState);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/nodes/mutate") {
      try {
        const { nodeId, instruction, selectedSelector, commandId } = await readJsonBody(req);
        const node = canvasState.nodes.find((n) => n.id === nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });

        node.status = "mutating";
        broadcastState();

        const updatedHtml = await mutateHtmlSurface({
          currentHtml: node.html,
          title: node.title,
          instruction,
          selectedSelector,
          model: node.model,
        });

        node.html = updatedHtml;
        node.status = "ready";
        saveState(canvasState);

        await recordDomainCommand(
          "node.mutate",
          node.id,
          "surface.mutated",
          { nodeId: node.id, instruction },
          [{ request: { type: "surface.mutate", nodeId: node.id, instruction } }],
          commandId,
        );

        broadcastState();
        return sendJson(res, 200, { node, state: canvasState });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/nodes/speculate") {
      try {
        const { nodeId, prompt, count = 3, commandId } = await readJsonBody(req);
        const sourceNode = canvasState.nodes.find((n) => n.id === nodeId);
        if (!sourceNode) return sendJson(res, 404, { error: "Source node not found" });

        sourceNode.status = "speculating";
        broadcastState();

        const branches = await generateSpeculativeBranches({
          sourceNode,
          prompt,
          count,
        });

        sourceNode.status = "ready";
        for (const b of branches) {
          canvasState.nodes.push(b);
          canvasState.edges.push({
            id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: sourceNode.id,
            to: b.id,
            label: `${b.branchTag} (p=${b.jevScore})`,
          });
        }

        saveState(canvasState);
        await recordDomainCommand(
          "node.speculate",
          sourceNode.id,
          "branches.forked",
          {
            sourceNodeId: sourceNode.id,
            branchIds: branches.map((b) => b.id),
          },
          [
            {
              request: {
                type: "surface.speculate",
                nodeId: sourceNode.id,
                prompt: prompt || "Speculate",
                count,
              },
            },
          ],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, { branches, state: canvasState });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/nodes/commit-branch") {
      try {
        const { nodeId, pruneSiblings = false, commandId } = await readJsonBody(req);
        const winner = canvasState.nodes.find((n) => n.id === nodeId);
        if (!winner) return sendJson(res, 404, { error: "Branch node not found" });

        winner.status = "committed";
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
          canvasState.nodes = canvasState.nodes.filter((n) => !siblingIds.has(n.id));
          canvasState.edges = canvasState.edges.filter(
            (e) => !siblingIds.has(e.from) && !siblingIds.has(e.to),
          );
        }

        saveState(canvasState);
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
        return sendJson(res, 500, { error: err.message });
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
        canvasState.nodes = canvasState.nodes.filter((n) => !unkeptIds.has(n.id));
        canvasState.edges = canvasState.edges.filter(
          (e) => !unkeptIds.has(e.from) && !unkeptIds.has(e.to),
        );
        saveState(canvasState);
        await recordDomainCommand(
          "branch.prune-unkept",
          parentId || "canvas-root",
          "branches.pruned",
          { discarded: [...unkeptIds] },
          [],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, { discarded: [...unkeptIds], state: canvasState });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/nodes/advance") {
      try {
        const { nodeId, targetStage, instruction, commandId } = await readJsonBody(req);
        const sourceNode = canvasState.nodes.find((n) => n.id === nodeId);
        if (!sourceNode) return sendJson(res, 404, { error: "Source node not found" });

        if (sourceNode.kind === "speculative") {
          sourceNode.status = "committed";
          sourceNode.kind = "surface";
        }
        sourceNode.status = "mutating";
        broadcastState();

        const childNode = await advanceNodeStage({
          sourceNode,
          targetStage,
          instruction,
        });

        // If advancing into the IMPLEMENT stage, provision a real isolated Git worktree via @asterism/core!
        if (childNode.stage === "implement") {
          try {
            const wt = await Effect.runPromise(
              createIsolatedWorktree({
                repoRoot: __dirname,
                worktreesDir: WORKTREES_DIR,
                nodeId: childNode.id,
              }),
            );
            childNode.worktree = wt;
            childNode.html = `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;background:rgba(16,185,129,0.12);border-bottom:1px solid rgba(16,185,129,0.3);padding:6px 10px;color:#34d399;display:flex;justify-content:space-between;">
              <span>⚙ worktree: ${wt.branchName}</span>
              <span>base: ${wt.baseCommit}</span>
            </div>` + childNode.html;
          } catch {
            // Ignore worktree error if git is unavailable
          }
        }

        const existingDownstream = canvasState.edges.filter((e) => e.from === sourceNode.id).length;
        childNode.y = sourceNode.y + existingDownstream * 140;

        sourceNode.status = "committed";
        canvasState.nodes.push(childNode);
        canvasState.edges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: sourceNode.id,
          to: childNode.id,
          label: `→ ${childNode.stage}`,
        });

        saveState(canvasState);
        await recordDomainCommand(
          "train.advance",
          sourceNode.id,
          "node.advanced",
          {
            sourceNodeId: sourceNode.id,
            childNodeId: childNode.id,
            stage: childNode.stage,
            worktree: childNode.worktree ?? null,
          },
          [
            {
              request: {
                type: "train.advance",
                nodeId: sourceNode.id,
                targetStage: childNode.stage,
                ...(instruction ? { instruction } : {}),
              },
            },
          ],
          commandId,
        );
        broadcastState();
        return sendJson(res, 200, { childNode, state: canvasState, peerFederationReady: Boolean(peerFederation) });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Serve static files from public/
    const relPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const filePath = path.join(PUBLIC_DIR, relPath);
    if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mime =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".js" || ext === ".mjs"
            ? "application/javascript; charset=utf-8"
            : ext === ".css"
              ? "text/css; charset=utf-8"
              : "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3456);
  const server = createAsterismServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Asterism Spatial Canvas & Effect-TS Orchestrator running at http://localhost:${port} (and https://agentbox-101.exe.xyz:${port}/)`);
  });
}
