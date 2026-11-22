import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  makeSqliteEventSink,
  makePeerFederation,
  createIsolatedWorktree,
  runWorktreeAgentImplementation,
} from "@asterism/core";
import { createT3Bridge, createPolarisService } from "./src/t3-bridge.mjs";
import {
  registerT3BridgeForLlm,
  generateWorktreeImplementationBundle,
} from "./src/llm.mjs";
import {
  REPO_ROOT,
  SUPERREPO_ROOT,
  DATA_DIR,
  STATE_FILE,
  SQLITE_FILE,
  WORKTREES_DIR,
  PUBLIC_DIR,
  ENVIRONMENT_ID,
  EXTRACTED_PROVIDER_CATALOG,
  discoverSuperrepoProjects,
  normalizeCanvasState,
  loadState,
  saveState,
  resolveOpenCanvasPosition,
  collectLineageNodes,
  collectNeighborhoodNodes,
} from "./src/canvas-state.mjs";
import { sendJson } from "./src/http-helpers.mjs";
import {
  createClientTelemetryStore,
  createSnapshotManager,
} from "./src/telemetry.mjs";
import { handleSystemRoutes } from "./src/routes/system-routes.mjs";
import { handleCanvasRoutes } from "./src/routes/canvas-routes.mjs";
import { handleDecisionsRoutes } from "./src/routes/decisions-routes.mjs";
import {
  handleSurfacesRoutes,
  resolveNodeGitRepoRoot,
} from "./src/routes/surfaces-routes.mjs";

export {
  ENVIRONMENT_ID,
  EXTRACTED_PROVIDER_CATALOG,
  discoverSuperrepoProjects,
  normalizeCanvasState,
  loadState,
  saveState,
  resolveOpenCanvasPosition,
  collectLineageNodes,
  collectNeighborhoodNodes,
};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function collectUiFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectUiFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results.sort();
}

export function createAsterismServer(options = {}) {
  const dbPath = options.dbPath || SQLITE_FILE;
  const stateFile =
    options.stateFile ||
    (options.dbPath
      ? path.join(path.dirname(options.dbPath), "canvas-state.json")
      : STATE_FILE);
  const stateDir = path.dirname(stateFile);
  const worktreesDir = options.worktreesDir || WORKTREES_DIR;
  const superrepoRoot =
    options.superrepoRoot !== undefined ? options.superrepoRoot : SUPERREPO_ROOT;
  const telemetryFile =
    options.telemetryFile || path.join(stateDir, "client-errors.json");
  const snapshotsDir =
    options.snapshotsDir || path.join(stateDir, "snapshots");

  const eventSink = Effect.runSync(makeSqliteEventSink(dbPath));
  const peerFederation = Effect.runSync(makePeerFederation());
  Effect.runSync(eventSink.reconcileAfterProcessLoss);

  const bootId = `boot-${crypto.randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  let gitSha = "unknown";
  try {
    gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Non-git fallback
  }

  function getUiBundleHash() {
    try {
      const hash = crypto.createHash("sha256");
      const files = collectUiFiles(PUBLIC_DIR);
      if (files.length === 0) return "missing";
      for (const file of files) {
        hash.update(path.relative(PUBLIC_DIR, file));
        hash.update("\0");
        hash.update(fs.readFileSync(file));
        hash.update("\0");
      }
      return hash.digest("hex").slice(0, 12);
    } catch {
      return "missing";
    }
  }

  let canvasState = loadState(stateFile);
  canvasState.projects = discoverSuperrepoProjects(
    canvasState.projects,
    superrepoRoot,
  );

  const sseClients = new Set();
  const mcpSessions = new Map();
  const workerId = `asterism-outbox-worker-${crypto.randomUUID().slice(0, 8)}`;
  let drainingOutbox = false;

  const getCanvasState = () => canvasState;
  const setCanvasState = (next) => {
    canvasState = next;
  };
  const saveCanvasState = (stateToSave = canvasState) => {
    saveState(stateToSave, stateFile);
  };

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

  const telemetryStore = createClientTelemetryStore({
    filePath: telemetryFile,
    maxEntries: 50,
  });

  const snapshotManager = createSnapshotManager({
    snapshotsDir,
    normalizeCanvasState,
    getCanvasState,
    setCanvasState,
    saveCanvasState,
    broadcastState,
  });

  const isTestInstance = Boolean(
    options.dbPath && path.resolve(options.dbPath) !== path.resolve(SQLITE_FILE),
  );
  const disableT3Bridge =
    options.disableT3Bridge ?? (isTestInstance && !options.enableT3Bridge);
  const t3Bridge = createT3Bridge({
    stateDir,
    authFile: options.t3AuthFile || null,
    disabled: disableT3Bridge,
  });
  if (!disableT3Bridge) {
    registerT3BridgeForLlm(t3Bridge);
  }

  const polarisService = createPolarisService({
    stateDir,
    stateFile: options.polarisStateFile || null,
    repoRoot: REPO_ROOT,
    t3Bridge,
    getAsterismOrigin: () =>
      options.asterismOrigin ||
      process.env.ASTERISM_PUBLIC_URL ||
      "http://127.0.0.1:3456",
    getCanvasState,
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
                const targetRepoRoot = resolveNodeGitRepoRoot(
                  canvasState,
                  node,
                  REPO_ROOT,
                );
                node.worktree = await Effect.runPromise(
                  createIsolatedWorktree({
                    repoRoot: targetRepoRoot,
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
              saveCanvasState(canvasState);
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

  const routeCtx = {
    bootId,
    startedAt,
    gitSha,
    repoRoot: REPO_ROOT,
    superrepoRoot,
    worktreesDir,
    getUiBundleHash,
    disableT3Bridge,
    t3Bridge,
    polarisService,
    telemetryStore,
    snapshotManager,
    eventSink,
    peerFederation,
    mcpSessions,
    sseClients,
    getCanvasState,
    setCanvasState,
    saveCanvasState,
    broadcastState,
    recordDomainCommand,
    drainOutbox,
  };

  setImmediate(() => {
    drainOutbox().catch(() => {});
  });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`,
      );

      if (await handleSystemRoutes(req, res, url, routeCtx)) return;
      if (await handleCanvasRoutes(req, res, url, routeCtx)) return;
      if (await handleDecisionsRoutes(req, res, url, routeCtx)) return;
      if (await handleSurfacesRoutes(req, res, url, routeCtx)) return;

      const relPath =
        url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
      const filePath = path.resolve(PUBLIC_DIR, relPath);
      if (
        (filePath.startsWith(PUBLIC_DIR + path.sep) ||
          filePath === path.join(PUBLIC_DIR, "index.html")) &&
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
                : ext === ".json"
                  ? "application/json; charset=utf-8"
                  : ext === ".svg"
                    ? "image/svg+xml"
                    : ext === ".png"
                      ? "image/png"
                      : "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "no-cache",
          "X-Frame-Options": "SAMEORIGIN",
          "Content-Security-Policy": "frame-ancestors 'self'",
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, err.statusCode || 500, {
          error: err.message || "Internal server error",
        });
      }
    }
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const port = Number(process.env.PORT || 3456);
  const server = createAsterismServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(
      `Asterism Spatial Canvas & Effect-TS Orchestrator running at http://localhost:${port} (and https://agentbox-101.exe.xyz:${port}/)`,
    );
  });
}
