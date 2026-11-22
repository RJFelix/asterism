import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultUserModel } from "@asterism/core";
import { CodexProviderCapabilitiesV2 } from "@t3tools/provider-codex/server/adapter";
import { ClaudeProviderCapabilitiesV2 } from "@t3tools/provider-claude/server/adapter";
import { AcpProviderCapabilitiesV2 } from "@t3tools/provider-acp/server/adapter";
import { getDefaultCanvasState } from "./default-state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..");
export const SUPERREPO_ROOT = process.env.ASTERISM_SUPERREPO_ROOT || path.resolve(REPO_ROOT, "../..");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const STATE_FILE = path.join(DATA_DIR, "canvas-state.json");
export const SQLITE_FILE = path.join(DATA_DIR, "asterism.sqlite");
export const WORKTREES_DIR = path.join(DATA_DIR, "worktrees");
export const PUBLIC_DIR = path.join(REPO_ROOT, "public");

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

export const isAssociation = (e) =>
  ["jump", "association", "lens"].includes(e.kind) ||
  ["cross-pollinates", "association", "annotates"].includes(e.relation);

export function restoreCanvasLayout(state) {
  for (const n of state.nodes) {
    if (Number.isFinite(n.canvasX) && Number.isFinite(n.canvasY)) {
      n.x = n.canvasX;
      n.y = n.canvasY;
    }
    delete n.canvasX;
    delete n.canvasY;
  }
}

const IGNORED_SUPERREPO_DIRS = new Set([
  "repos",
  "knowledge",
  "smoke-tests",
  "node_modules",
  "dist",
  "build",
  "tmp",
]);

/**
 * Auto-discovers nested repos under `<superrepo>/repos/*` and active project directories
 * directly under `<superrepo>/*` (such as `dsv41-deepdream`) so Asterism works naturally
 * with the "superrepo > many projects" layout without manual registration.
 */
export function discoverSuperrepoProjects(existingProjects = [], superrepoRoot = SUPERREPO_ROOT) {
  const merged = Array.isArray(existingProjects)
    ? existingProjects.map((p) => ({
        ...p,
        isGitRepo:
          typeof p.isGitRepo === "boolean"
            ? p.isGitRepo
            : Boolean(p.repoPath && fs.existsSync(path.join(p.repoPath, ".git"))),
      }))
    : [];
  if (!superrepoRoot || !fs.existsSync(superrepoRoot)) return merged;

  const byPath = new Set(
    merged
      .filter((p) => typeof p.repoPath === "string")
      .map((p) => path.resolve(p.repoPath)),
  );
  const byId = new Set(merged.map((p) => p.id));

  const maybeAddDir = (dirPath, kindLabel) => {
    const resolved = path.resolve(dirPath);
    if (byPath.has(resolved)) return;
    const base = path.basename(resolved);
    const slug = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    let id = `proj-${slug}`;
    let seq = 2;
    while (byId.has(id)) {
      id = `proj-${slug}-${seq++}`;
    }
    const isGitRepo = fs.existsSync(path.join(resolved, ".git"));
    merged.push({
      id,
      name: base,
      repoPath: resolved,
      isDefaultMisc: false,
      isGitRepo,
      discoveredFromSuperrepo: true,
      description: `${kindLabel} in superrepo (${resolved})`,
    });
    byPath.add(resolved);
    byId.add(id);
  };

  const reposDir = path.join(superrepoRoot, "repos");
  if (fs.existsSync(reposDir)) {
    try {
      for (const ent of fs.readdirSync(reposDir, { withFileTypes: true })) {
        if (ent.isDirectory() && !ent.name.startsWith(".")) {
          maybeAddDir(path.join(reposDir, ent.name), "Nested repo");
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  try {
    for (const ent of fs.readdirSync(superrepoRoot, { withFileTypes: true })) {
      if (
        ent.isDirectory() &&
        !ent.name.startsWith(".") &&
        !IGNORED_SUPERREPO_DIRS.has(ent.name)
      ) {
        maybeAddDir(path.join(superrepoRoot, ent.name), "Superrepo project directory");
      }
    }
  } catch {
    // Ignore permission errors
  }

  return merged;
}

export function normalizeCanvasState(raw) {
  const state = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  for (const key of ["nodes", "edges", "strokes", "projects"]) {
    state[key] = [
      ...new Map(
        (Array.isArray(state[key]) ? state[key] : [])
          .filter((n) => n && typeof n === "object" && !Array.isArray(n) && typeof n.id === "string")
          .map((n) => [n.id, { ...n }]),
      ).values(),
    ];
  }
  const ids = new Set(state.nodes.map((n) => n.id));
  const seen = new Set();
  state.edges = state.edges.filter((e) => {
    const key = JSON.stringify([e.from, e.to, e.relation]);
    if (!ids.has(e.from) || !ids.has(e.to) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const n of state.nodes) {
    if (!ids.has(n.parentId)) delete n.parentId;
    if (Array.isArray(n.parentIds)) {
      n.parentIds = [...new Set(n.parentIds.filter((id) => ids.has(id)))];
    }
  }
  const v = state.viewport || {};
  state.viewport = {
    x: Number.isFinite(v.x) ? v.x : 65,
    y: Number.isFinite(v.y) ? v.y : 55,
    scale: Number.isFinite(v.scale) ? Math.max(0.15, Math.min(3, v.scale)) : 0.88,
  };
  const defaults = createDefaultUserModel();
  const model = state.userModel || {};
  state.userModel = {
    ...defaults,
    ...model,
    hypotheses: Array.isArray(model.hypotheses) ? model.hypotheses : defaults.hypotheses,
    economicProfiles:
      model.economicProfiles &&
      typeof model.economicProfiles === "object" &&
      !Array.isArray(model.economicProfiles)
        ? { ...defaults.economicProfiles, ...model.economicProfiles }
        : defaults.economicProfiles,
    sealedPredictions: Array.isArray(model.sealedPredictions)
      ? model.sealedPredictions
      : defaults.sealedPredictions,
  };
  for (const [id, profile] of Object.entries(state.userModel.economicProfiles)) {
    state.userModel.economicProfiles[id] = {
      ...(defaults.economicProfiles[id] || defaults.economicProfiles["proj-misc-attic"]),
      ...(profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {}),
      projectId: id,
    };
  }
  if (!state.nodes.some((n) => n.id === state.plexFocusNodeId && !n.shadowStaged)) {
    state.plexFocusNodeId = state.nodes.find((n) => !n.shadowStaged)?.id;
  }
  return state;
}

export function loadState(targetFile = STATE_FILE) {
  if (fs.existsSync(targetFile)) {
    try {
      return normalizeCanvasState(JSON.parse(fs.readFileSync(targetFile, "utf8")));
    } catch {
      fs.renameSync(targetFile, `${targetFile}.corrupt-${Date.now()}`);
    }
  }
  const initial = normalizeCanvasState(getDefaultCanvasState());
  saveState(initial, targetFile);
  return initial;
}

export function saveState(state, targetFile = STATE_FILE) {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const temporary = `${targetFile}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(temporary, targetFile);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function resolveOpenCanvasPosition(
  nodes,
  desiredX,
  desiredY,
  width = 400,
  height = 260,
  gap = 28,
  excludeIds = new Set(),
) {
  const originX = Number.isFinite(desiredX) ? desiredX : 25;
  const originY = Number.isFinite(desiredY) ? desiredY : 25;
  const visible = nodes.filter((n) => !n.shadowStaged && !excludeIds.has(n.id));
  const free = (x, y) =>
    !visible.some(
      (n) =>
        x < n.x + (n.width || 400) + gap &&
        x + width + gap > n.x &&
        y < n.y + (n.height || 260) + gap &&
        y + height + gap > n.y,
    );
  const x = Math.max(25, Math.round(originX));
  const y = Math.max(25, Math.round(originY));
  if (free(x, y)) return { x, y };
  for (let radius = 1; ; radius++) {
    const points = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (const dy of [-radius, radius]) points.push([x + dx * 80, y + dy * 80]);
    }
    for (let dy = -radius + 1; dy < radius; dy++) {
      for (const dx of [-radius, radius]) points.push([x + dx * 80, y + dy * 80]);
    }
    points.sort(
      (a, b) => (a[0] - x) ** 2 + (a[1] - y) ** 2 - ((b[0] - x) ** 2 + (b[1] - y) ** 2),
    );
    for (const [px, py] of points) {
      if (px >= 25 && py >= 25 && free(px, py)) return { x: px, y: py };
    }
  }
}

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
