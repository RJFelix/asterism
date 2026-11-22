import crypto from "node:crypto";
import * as Effect from "effect/Effect";
import {
  probeAvailableHarnesses,
  MCP_PROTOCOL_VERSION,
  MODE_LIMIT_HEADER,
} from "@asterism/core";
import { DEFAULT_POLARIS_MODEL } from "../t3-bridge.mjs";
import {
  ARENA_MODELS,
  DEFAULT_MODEL,
  SURFACE_ROLES,
  PANEL_RELATIONS,
  defaultRoleForStage,
  spawnRelatedPanel,
} from "../llm.mjs";
import {
  ENVIRONMENT_ID,
  EXTRACTED_PROVIDER_CATALOG,
  collectNeighborhoodNodes,
  resolveOpenCanvasPosition,
} from "../canvas-state.mjs";
import { readJsonBody, requestErrorStatus, sendJson } from "../http-helpers.mjs";

export async function handleSystemRoutes(req, res, url, ctx) {
  const {
    bootId,
    startedAt,
    gitSha,
    getUiBundleHash,
    disableT3Bridge,
    t3Bridge,
    polarisService,
    telemetryStore,
    snapshotManager,
    eventSink,
    mcpSessions,
    sseClients,
    getCanvasState,
    saveCanvasState,
    broadcastState,
  } = ctx;

  // 0. Healthcheck, Telemetry Summary & Self-Deploy Identity Probe
  if (req.method === "GET" && url.pathname === "/api/health") {
    const deep = url.searchParams.get("deep") === "1";
    const t3Desc = t3Bridge.readT3RuntimeDescriptor();
    const liveT3 = deep ? await t3Bridge.getLiveStatus({ forceRefresh: false }) : undefined;
    const pState = polarisService.getState();
    const canvasState = getCanvasState();
    const uiHash = getUiBundleHash();
    return (
      sendJson(res, 200, {
        ok: true,
        bootId,
        startedAt,
        gitSha,
        indexHtmlHash: uiHash,
        uiBundleHash: uiHash,
        nodeCount: canvasState.nodes.length,
        edgeCount: canvasState.edges.length,
        activeProjectId: canvasState.activeProjectId,
        clientErrors: telemetryStore.getSummary(),
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
      }),
      true
    );
  }

  // Client & Card-Iframe Runtime Error Telemetry Loopback
  if (req.method === "POST" && url.pathname === "/api/telemetry/client-error") {
    const body = await readJsonBody(req);
    const items = Array.isArray(body.errors) ? body.errors : [body];
    const recorded = items.slice(0, 10).map((item) => telemetryStore.recordError(item, bootId));
    return (
      sendJson(res, 200, {
        ok: true,
        recordedCount: recorded.length,
        summary: telemetryStore.getSummary(),
      }),
      true
    );
  }

  if (req.method === "GET" && url.pathname === "/api/telemetry/client-errors") {
    const limit = Number(url.searchParams.get("limit") || 50);
    return (
      sendJson(res, 200, {
        errors: telemetryStore.listErrors({ limit }),
        summary: telemetryStore.getSummary(),
      }),
      true
    );
  }

  if (req.method === "DELETE" && url.pathname === "/api/telemetry/client-errors") {
    const cleared = telemetryStore.clearErrors();
    return (sendJson(res, 200, { ok: true, ...cleared }), true);
  }

  // Canvas State Snapshot Time-Machine (`/api/snapshots*`)
  if (req.method === "GET" && url.pathname === "/api/snapshots") {
    return (sendJson(res, 200, { snapshots: snapshotManager.listSnapshots() }), true);
  }

  if (req.method === "POST" && url.pathname === "/api/snapshots/save") {
    const body = await readJsonBody(req);
    const saved = snapshotManager.saveSnapshot({ label: body.label || gitSha || "manual" });
    return (sendJson(res, 200, { ok: true, snapshot: saved }), true);
  }

  if (req.method === "POST" && url.pathname === "/api/snapshots/restore") {
    const body = await readJsonBody(req);
    const out = snapshotManager.restoreSnapshot(body.target || body.name || "latest");
    return (sendJson(res, 200, { ok: true, ...out }), true);
  }

  // 1. Environment Descriptor
  if (req.method === "GET" && url.pathname === "/api/environment/descriptor") {
    return (
      sendJson(res, 200, {
        environmentId: ENVIRONMENT_ID,
        name: "asterism-agentbox-101",
        protocolVersion: MCP_PROTOCOL_VERSION,
        bootId,
        gitSha,
        providers: EXTRACTED_PROVIDER_CATALOG.map((p) => p.id),
        arenaModels: ARENA_MODELS.map((m) => m.id),
        surfaceRoles: Object.keys(SURFACE_ROLES),
        panelRelations: Object.keys(PANEL_RELATIONS),
      }),
      true
    );
  }

  // 2. Extracted Provider Harness Catalog + Live T3 Code Providers + Arena Models
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
    return (
      sendJson(res, 200, {
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
      }),
      true
    );
  }

  // 3. Event-Sourced Outbox & Event Log Inspection
  if (req.method === "GET" && url.pathname === "/api/events/log") {
    const after = Number(url.searchParams.get("after") || 0);
    const events = await Effect.runPromise(eventSink.readEventsAfter(after));
    return (sendJson(res, 200, { events }), true);
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
        return (
          sendJson(
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
          ),
          true
        );
      }

      if (rpc.method === "notifications/initialized") {
        return (sendJson(res, 200, { jsonrpc: "2.0", result: {} }), true);
      }

      const sid = req.headers["mcp-session-id"];
      if (!sid || !mcpSessions.has(sid)) {
        return (sendJson(res, 404, { error: "Unknown MCP session" }), true);
      }

      if (rpc.method === "tools/call") {
        const toolName = rpc.params?.name;
        const args = rpc.params?.arguments || {};
        const canvasState = getCanvasState();

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
          return (
            sendJson(res, 200, {
              jsonrpc: "2.0",
              id: rpc.id ?? 1,
              result: {
                content: [{ type: "text", text: JSON.stringify(summary) }],
              },
            }),
            true
          );
        }

        if (toolName === "asterism_spawn_related_panel") {
          const sourceNode = canvasState.nodes.find((n) => n.id === args.sourceNodeId);
          if (!sourceNode) {
            return (
              sendJson(res, 200, {
                jsonrpc: "2.0",
                id: rpc.id ?? 1,
                result: {
                  isError: true,
                  content: [{ type: "text", text: "Source node not found" }],
                },
              }),
              true
            );
          }
          const neighborhood = collectNeighborhoodNodes(canvasState, sourceNode.id);
          const existingOut = canvasState.edges.filter((e) => e.from === sourceNode.id).length;
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
          if (!childNode.shadowStaged) {
            Object.assign(
              childNode,
              resolveOpenCanvasPosition(
                canvasState.nodes,
                childNode.x,
                childNode.y,
                childNode.width,
                childNode.height,
              ),
            );
          }
          canvasState.nodes.push(childNode);
          canvasState.edges.push({
            id: `edge-rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: sourceNode.id,
            to: childNode.id,
            relation: childNode.relationFromParent,
            kind: childNode.relationFromParent,
            label: relMeta.label,
          });
          saveCanvasState(canvasState);
          broadcastState();
          return (
            sendJson(res, 200, {
              jsonrpc: "2.0",
              id: rpc.id ?? 1,
              result: {
                content: [{ type: "text", text: JSON.stringify({ childNode }) }],
              },
            }),
            true
          );
        }

        return (
          sendJson(res, 200, {
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
          }),
          true
        );
      }

      return (sendJson(res, 400, { error: "Unsupported JSON-RPC method" }), true);
    } catch (err) {
      return (sendJson(res, requestErrorStatus(err), { error: err.message }), true);
    }
  }

  // 5. Server-Sent Events Stream (`/api/events`)
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const uiHash = getUiBundleHash();
    res.write(
      `event: server_hello\ndata: ${JSON.stringify({
        bootId,
        startedAt,
        gitSha,
        indexHtmlHash: uiHash,
        uiBundleHash: uiHash,
      })}\n\n`,
    );
    res.write(`event: state\ndata: ${JSON.stringify(getCanvasState())}\n\n`);
    res.write(`event: polaris_update\ndata: ${JSON.stringify(polarisService.getState())}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return true;
  }

  // 6. Polaris Workspace Steward Endpoints (`/api/polaris/*`)
  if (req.method === "GET" && url.pathname === "/api/polaris/state") {
    return (sendJson(res, 200, { polaris: polarisService.getState() }), true);
  }

  if (req.method === "POST" && url.pathname === "/api/polaris/message") {
    const body = await readJsonBody(req);
    const accepted = await polarisService.sendMessage({
      message: body.message,
      focusedNodeId: body.focusedNodeId || null,
    });
    if (body.wait === true) {
      await accepted.completion;
      return (
        sendJson(res, 200, {
          ok: true,
          userMessage: accepted.userMessage,
          polaris: polarisService.getState(),
        }),
        true
      );
    }
    return (
      sendJson(res, 202, {
        accepted: true,
        userMessage: accepted.userMessage,
        polaris: accepted.polaris,
      }),
      true
    );
  }

  if (req.method === "POST" && url.pathname === "/api/polaris/configure") {
    const body = await readJsonBody(req);
    const polaris = await polarisService.configure(body);
    return (sendJson(res, 200, { polaris }), true);
  }

  if (req.method === "POST" && url.pathname === "/api/polaris/reset") {
    const polaris = await polarisService.resetThread();
    return (sendJson(res, 200, { polaris }), true);
  }

  if (req.method === "POST" && url.pathname === "/api/polaris/interrupt") {
    const polaris = await polarisService.interrupt();
    return (sendJson(res, 200, { polaris }), true);
  }

  return false;
}
