import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getDefaultCanvasState } from "./src/default-state.mjs";
import {
  ARENA_MODELS,
  DEFAULT_MODEL,
  SURFACE_ROLES,
  PANEL_RELATIONS,
  defaultRoleForStage,
  mutateHtmlSurface,
  collaborateAcrossPanels,
  spawnRelatedPanel,
  generateSpeculativeBranches,
  synthesizeNodes,
  advanceNodeStage,
  generateWorktreeImplementationBundle,
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
      if (edge.to === nodeId && edge.from) parentIds.add(edge.from);
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
  const worktreesDir = options.worktreesDir || WORKTREES_DIR;
  const eventSink = Effect.runSync(makeSqliteEventSink(dbPath));
  const peerFederation = Effect.runSync(makePeerFederation());
  Effect.runSync(eventSink.reconcileAfterProcessLoss);

  let canvasState = loadState();
  const sseClients = new Set();
  const mcpSessions = new Map();
  const workerId = `asterism-outbox-worker-${crypto.randomUUID().slice(0, 8)}`;
  let drainingOutbox = false;

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
              saveState(canvasState);
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

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // 1. Environment Descriptor
    if (req.method === "GET" && url.pathname === "/api/environment/descriptor") {
      return sendJson(res, 200, {
        environmentId: ENVIRONMENT_ID,
        name: "asterism-agentbox-101",
        protocolVersion: MCP_PROTOCOL_VERSION,
        providers: EXTRACTED_PROVIDER_CATALOG.map((p) => p.id),
        arenaModels: ARENA_MODELS.map((m) => m.id),
        surfaceRoles: Object.keys(SURFACE_ROLES),
        panelRelations: Object.keys(PANEL_RELATIONS),
      });
    }

    // 2. Extracted Provider Harness Catalog + Arena Models + Surface Roles + Relations
    if (req.method === "GET" && url.pathname === "/api/providers") {
      const cliProbes = await Effect.runPromise(
        probeAvailableHarnesses(
          EXTRACTED_PROVIDER_CATALOG.map((p) => ({
            id: p.id,
            binary: p.binary,
          })),
        ),
      );
      const probeById = new Map(cliProbes.map((p) => [p.id, p]));
      return sendJson(res, 200, {
        providers: EXTRACTED_PROVIDER_CATALOG.map((p) => ({
          ...p,
          cliInstalled: probeById.get(p.id)?.installed ?? false,
          binaryPath: probeById.get(p.id)?.binaryPath ?? null,
        })),
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
            canvasState.nodes.push(childNode);
            canvasState.edges.push({
              id: `edge-rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              from: sourceNode.id,
              to: childNode.id,
              relation: childNode.relationFromParent,
              kind: childNode.relationFromParent,
              label: relMeta.label,
            });
            saveState(canvasState);
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

        saveState(canvasState);
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
        return sendJson(res, 500, { error: err.message });
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

        let updatedHtml;
        let spawnedPanels = [];
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
            facets: {
              ...(node.facets || { [node.surfaceRole || defaultRoleForStage(node.stage)]: node.html }),
              [targetRole]: updatedHtml,
            },
            energy: createDefaultEnergyEnvelope(node.energy),
          };
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

        saveState(canvasState);

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
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
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
            model: node.model || DEFAULT_MODEL,
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
          canvasState.nodes.push(tornOffLens);
          canvasState.edges.push({
            id: `edge-lens-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            from: node.id,
            to: tornOffLens.id,
            relation,
            kind: "lens",
            label: `🔭 lens (${facetRole})`,
          });
          saveState(canvasState);
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
        saveState(canvasState);
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
        return sendJson(res, 500, { error: err.message });
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

        saveState(canvasState);
        broadcastState();
        return sendJson(res, 200, {
          totalGrantedTokens: result.totalGrantedTokens,
          allocations: result.allocations,
          attentionQueue,
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
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

        saveState(canvasState);
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
        return sendJson(res, 500, { error: err.message });
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

        saveState(canvasState);
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
        return sendJson(res, 500, { error: err.message });
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

        saveState(canvasState);
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
        return sendJson(res, 500, { error: err.message });
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
        canvasState.nodes = canvasState.nodes.filter(
          (n) => !unkeptIds.has(n.id),
        );
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
        return sendJson(res, 200, {
          discarded: [...unkeptIds],
          state: canvasState,
        });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
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

        saveState(canvasState);
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
        return sendJson(res, 500, { error: err.message });
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
        return sendJson(res, 500, { error: err.message });
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

        if (!node.worktree?.worktreePath) {
          node.worktree = await Effect.runPromise(
            createIsolatedWorktree({
              repoRoot: __dirname,
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
        return sendJson(res, 500, { error: err.message });
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

        saveState(canvasState);
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
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Serve static files from public/
    const relPath =
      url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const filePath = path.join(PUBLIC_DIR, relPath);
    if (
      filePath.startsWith(PUBLIC_DIR) &&
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
    console.log(
      `Asterism Spatial Canvas & Effect-TS Orchestrator running at http://localhost:${port} (and https://agentbox-101.exe.xyz:${port}/)`,
    );
  });
}
