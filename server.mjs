import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultCanvasState } from "./src/default-state.mjs";
import { mutateHtmlSurface, generateSpeculativeBranches, advanceNodeStage } from "./src/llm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "canvas-state.json");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

let canvasState = loadState();
const sseClients = new Set();

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

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

export function createAsterismServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
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
        const { nodeId, instruction, selectedSelector } = await readJsonBody(req);
        const node = canvasState.nodes.find((n) => n.id === nodeId);
        if (!node) return sendJson(res, 404, { error: "Node not found" });

        node.status = "mutating";
        broadcastState();

        const updatedHtml = await mutateHtmlSurface({
          currentHtml: node.html,
          title: node.title,
          instruction,
          selectedSelector,
          model: node.model
        });

        node.html = updatedHtml;
        node.status = "ready";
        saveState(canvasState);
        broadcastState();
        return sendJson(res, 200, { node, state: canvasState });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/nodes/speculate") {
      try {
        const { nodeId, prompt, count = 3 } = await readJsonBody(req);
        const sourceNode = canvasState.nodes.find((n) => n.id === nodeId);
        if (!sourceNode) return sendJson(res, 404, { error: "Source node not found" });

        sourceNode.status = "speculating";
        broadcastState();

        const branches = await generateSpeculativeBranches({
          sourceNode,
          prompt,
          count
        });

        sourceNode.status = "ready";
        for (const b of branches) {
          canvasState.nodes.push(b);
          canvasState.edges.push({
            id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: sourceNode.id,
            to: b.id,
            label: `${b.branchTag} (p=${b.jevScore})`
          });
        }

        saveState(canvasState);
        broadcastState();
        return sendJson(res, 200, { branches, state: canvasState });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Keep one or more speculative branches! By default pruneSiblings=false so multiple forks can be kept in parallel.
    if (req.method === "POST" && url.pathname === "/api/nodes/commit-branch") {
      try {
        const { nodeId, pruneSiblings = false } = await readJsonBody(req);
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
                  n.status !== "committed"
              )
              .map((n) => n.id)
          );
          discarded = [...siblingIds];
          canvasState.nodes = canvasState.nodes.filter((n) => !siblingIds.has(n.id));
          canvasState.edges = canvasState.edges.filter(
            (e) => !siblingIds.has(e.from) && !siblingIds.has(e.to)
          );
        }

        saveState(canvasState);
        broadcastState();
        return sendJson(res, 200, { winner, discarded, state: canvasState });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Explicitly prune only unkept (still speculative) sibling forks of a parent node
    if (req.method === "POST" && url.pathname === "/api/nodes/prune-unkept") {
      try {
        const { parentId } = await readJsonBody(req);
        const unkeptIds = new Set(
          canvasState.nodes
            .filter(
              (n) =>
                (!parentId || n.parentId === parentId) &&
                n.kind === "speculative" &&
                n.status !== "committed"
            )
            .map((n) => n.id)
        );
        canvasState.nodes = canvasState.nodes.filter((n) => !unkeptIds.has(n.id));
        canvasState.edges = canvasState.edges.filter(
          (e) => !unkeptIds.has(e.from) && !unkeptIds.has(e.to)
        );
        saveState(canvasState);
        broadcastState();
        return sendJson(res, 200, { discarded: [...unkeptIds], state: canvasState });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    // Advance any node (or kept fork) to the next stage of the Innovation Train
    if (req.method === "POST" && url.pathname === "/api/nodes/advance") {
      try {
        const { nodeId, targetStage, instruction } = await readJsonBody(req);
        const sourceNode = canvasState.nodes.find((n) => n.id === nodeId);
        if (!sourceNode) return sendJson(res, 404, { error: "Source node not found" });

        // Marking a speculative branch as committed when you advance it
        if (sourceNode.kind === "speculative") {
          sourceNode.status = "committed";
          sourceNode.kind = "surface";
        }
        sourceNode.status = "mutating";
        broadcastState();

        const childNode = await advanceNodeStage({
          sourceNode,
          targetStage,
          instruction
        });

        // Offset vertically if siblings already exist at the target X
        const existingDownstream = canvasState.edges.filter((e) => e.from === sourceNode.id).length;
        childNode.y = sourceNode.y + existingDownstream * 140;

        sourceNode.status = "committed";
        canvasState.nodes.push(childNode);
        canvasState.edges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: sourceNode.id,
          to: childNode.id,
          label: `→ ${childNode.stage}`
        });

        saveState(canvasState);
        broadcastState();
        return sendJson(res, 200, { childNode, state: canvasState });
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
    console.log(`Asterism Spatial Canvas running at http://localhost:${port} (and https://agentbox-101.exe.xyz:${port}/)`);
  });
}
