import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

export function createClientTelemetryStore({ filePath = null, maxEntries = 50 } = {}) {
  let entries = [];
  if (filePath && fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(parsed)) entries = parsed.slice(0, maxEntries);
    } catch {
      entries = [];
    }
  }

  function persist() {
    if (!filePath) return;
    try {
      writeJsonAtomic(filePath, entries);
    } catch {
      // Ignore telemetry disk write failures
    }
  }

  function recordError(raw = {}, defaultBootId = null) {
    const message = String(raw.message || raw.reason || "Unknown client runtime error").slice(0, 600);
    const source = String(raw.source || "window").slice(0, 48);
    const nodeId = raw.nodeId ? String(raw.nodeId).slice(0, 120) : null;
    const filename = raw.filename ? String(raw.filename).slice(0, 240) : null;
    const lineno = Number.isFinite(Number(raw.lineno)) ? Number(raw.lineno) : null;
    const colno = Number.isFinite(Number(raw.colno)) ? Number(raw.colno) : null;
    const stack = raw.stack ? String(raw.stack).slice(0, 2000) : null;
    const now = new Date().toISOString();

    const head = entries[0];
    if (
      head &&
      head.message === message &&
      head.source === source &&
      head.nodeId === nodeId &&
      head.lineno === lineno
    ) {
      head.occurrences = (head.occurrences || 1) + 1;
      head.lastSeenAt = now;
      persist();
      return head;
    }

    const record = {
      id: `cerr-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`,
      timestamp: now,
      lastSeenAt: now,
      occurrences: 1,
      source,
      kind: String(raw.kind || "error").slice(0, 48),
      nodeId,
      message,
      filename,
      lineno,
      colno,
      stack,
      bootId: raw.bootId || defaultBootId || null,
    };
    entries.unshift(record);
    if (entries.length > maxEntries) {
      entries = entries.slice(0, maxEntries);
    }
    persist();
    return record;
  }

  function listErrors({ limit = 50 } = {}) {
    const n = Math.max(1, Math.min(maxEntries, Number(limit) || maxEntries));
    return entries.slice(0, n);
  }

  function clearErrors() {
    const cleared = entries.length;
    entries = [];
    persist();
    return { cleared };
  }

  function getSummary() {
    return {
      count: entries.length,
      latest: entries[0]
        ? {
            id: entries[0].id,
            timestamp: entries[0].lastSeenAt || entries[0].timestamp,
            source: entries[0].source,
            nodeId: entries[0].nodeId,
            message: entries[0].message,
            occurrences: entries[0].occurrences || 1,
          }
        : null,
    };
  }

  return {
    recordError,
    listErrors,
    clearErrors,
    getSummary,
  };
}

export function createSnapshotManager({
  snapshotsDir,
  normalizeCanvasState,
  getCanvasState,
  setCanvasState,
  saveCanvasState,
  broadcastState,
}) {
  function ensureDir() {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  function listSnapshots() {
    if (!fs.existsSync(snapshotsDir)) return [];
    return fs
      .readdirSync(snapshotsDir)
      .filter((f) => f.endsWith(".json"))
      .map((name) => {
        const full = path.join(snapshotsDir, name);
        const stat = fs.statSync(full);
        return {
          name,
          sizeBytes: stat.size,
          mtime: stat.mtime.toISOString(),
          mtimeMs: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map(({ mtimeMs: _m, ...rest }) => rest);
  }

  function saveSnapshot({ label = "manual", maxSnapshots = 30 } = {}) {
    ensureDir();
    const safeLabel =
      String(label || "manual")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "manual";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${stamp}-${safeLabel}.json`;
    const full = path.join(snapshotsDir, name);
    const state = getCanvasState();
    writeJsonAtomic(full, state);

    const all = listSnapshots();
    for (const old of all.slice(maxSnapshots)) {
      try {
        fs.unlinkSync(path.join(snapshotsDir, old.name));
      } catch {
        // Ignore cleanup races
      }
    }
    return {
      name,
      path: full,
      nodeCount: (state.nodes || []).length,
      edgeCount: (state.edges || []).length,
    };
  }

  function restoreSnapshot(target = "latest") {
    const all = listSnapshots();
    if (all.length === 0) {
      const err = new Error("No state snapshots available to restore.");
      err.statusCode = 404;
      throw err;
    }

    let match = null;
    if (!target || target === "latest") {
      match = all.find((s) => !s.name.includes("-pre-restore")) || all[0];
    } else {
      const q = String(target).trim();
      match =
        all.find((s) => s.name === q || s.name === `${q}.json`) ||
        all.find((s) => s.name.includes(q));
    }

    if (!match) {
      const err = new Error(`Snapshot matching "${target}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    const backup = saveSnapshot({ label: "pre-restore" });
    const raw = JSON.parse(fs.readFileSync(path.join(snapshotsDir, match.name), "utf8"));
    const unwrapped =
      raw && typeof raw === "object" && raw.canvasState && typeof raw.canvasState === "object"
        ? raw.canvasState
        : raw;
    const restored = normalizeCanvasState(unwrapped);
    setCanvasState(restored);
    saveCanvasState(restored);
    broadcastState();

    return {
      restoredFrom: match.name,
      backupName: backup.name,
      nodeCount: restored.nodes.length,
      edgeCount: restored.edges.length,
      state: restored,
    };
  }

  return {
    listSnapshots,
    saveSnapshot,
    restoreSnapshot,
  };
}
