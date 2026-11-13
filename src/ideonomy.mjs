import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, "../skills/ideonomy-rich");
const METHODS_DIR = path.join(SKILL_DIR, "methods");
const RENDERING_DIR = path.join(SKILL_DIR, "rendering");

const HALF_LIFE_SECONDS = 3600; // 1-hour mtime cooldown half-life (matches bin/pick)

/**
 * Simple deterministic PRNG (Mulberry32) when `seed` is provided; otherwise uses Math.random().
 */
function createRng(seed) {
  if (seed === undefined || seed === null || seed === "") {
    return () => Math.random();
  }
  let a = Number(seed) >>> 0;
  if (Number.isNaN(a)) {
    a = Array.from(String(seed)).reduce(
      (acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0,
      2166136261,
    );
  }
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseMethodMarkdown(filePath, category) {
  const id = path.basename(filePath, ".md");
  const markdown = fs.readFileSync(filePath, "utf8").trim();
  const lines = markdown.split("\n").map((l) => l.trim());
  const titleLine = lines.find((l) => l.startsWith("# ")) || `# ${id}`;
  const title = titleLine
    .replace(/^#\s*(Organon:|Dimension prompt:)?\s*/i, "")
    .trim();
  const bodyLines = lines.filter((l) => l && !l.startsWith("#"));
  const summary = bodyLines[0] || title;
  const possibleValuesLine = bodyLines.find((l) =>
    /^Possible values:/i.test(l),
  );
  const possibleValues = possibleValuesLine
    ? possibleValuesLine
        .replace(/^Possible values:\s*/i, "")
        .replace(/\*\*/g, "")
        .replace(/\.$/, "")
    : null;

  let renderingRecipe = null;
  if (category === "organons") {
    const recipePath = path.join(RENDERING_DIR, `${id}.md`);
    if (fs.existsSync(recipePath)) {
      renderingRecipe = fs.readFileSync(recipePath, "utf8").trim();
    }
  }

  return {
    id,
    category,
    title,
    summary,
    possibleValues,
    markdown,
    renderingRecipe,
    filePath,
  };
}

/**
 * Picks `count` files from a `methods/<subdir>` directory using the exact
 * 1-hour half-life mtime cooldown scoring from `skills/ideonomy-rich/bin/pick`.
 */
function pickFromCategory(subdir, count, rng, weighted, forcedIds = []) {
  const dirPath = path.join(METHODS_DIR, subdir);
  if (!fs.existsSync(dirPath)) return [];

  const nowSec = Date.now() / 1000;
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .map((f) => path.join(dirPath, f));

  const forcedSet = new Set(forcedIds.filter(Boolean));
  const scored = files.map((filePath) => {
    const id = path.basename(filePath, ".md");
    if (forcedSet.has(id)) {
      return { score: -10, filePath };
    }
    let penalty = 0;
    if (weighted) {
      try {
        const stat = fs.statSync(filePath);
        const ageSec = Math.max(0, nowSec - stat.mtimeMs / 1000);
        penalty = Math.exp(-ageSec / HALF_LIFE_SECONDS);
      } catch {
        penalty = 0;
      }
    }
    return {
      score: rng() + penalty,
      filePath,
    };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored
    .slice(0, count)
    .map((item) => parseMethodMarkdown(item.filePath, subdir));
}

/**
 * Lists the entire Ideonomy catalog (`8 operators × 17 organons × 29 dimension-prompts`).
 */
export function getIdeonomyCatalogSummary() {
  const listIds = (subdir) => {
    const p = path.join(METHODS_DIR, subdir);
    if (!fs.existsSync(p)) return [];
    return fs
      .readdirSync(p)
      .filter((f) => f.endsWith(".md") && f !== "README.md")
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
  };
  const operators = listIds("operators");
  const organons = listIds("organons");
  const dimensions = listIds("dimension-prompts");
  return {
    skillPath: SKILL_DIR,
    operatorCount: operators.length,
    organonCount: organons.length,
    dimensionPromptCount: dimensions.length,
    counts: {
      operators: operators.length,
      organons: organons.length,
      dimensions: dimensions.length,
    },
    operators,
    organons,
    dimensions,
  };
}

/**
 * Draws an Ideonomy Method Tuple `(Operators × Organons × Dimension-Prompts)`
 * from Patrick Gunkel / Grace Kind's Ideonomy skill (`skills/ideonomy-rich` & `skills/ideonomy-plain`).
 *
 * Supports:
 * - `mode`: `"default"` (2 ops, 1 organon, 3 dims), `"more"` (3 ops, 2 organons, 4 dims), `"less"` (1 op, 1 organon, 2 dims)
 * - `seed`: optional deterministic seed (disables mtime cooldown weighting & touching, matching `bin/pick --seed`)
 * - `forceOperators`: optional array of operator IDs to anchor the draw (e.g. `["combination"]` for Synthesis)
 * - `touchCooldown`: whether to update mtime on picked files (default `true` when `seed` is omitted)
 */
export function pickIdeonomyTuple({
  mode = "default",
  opsCount,
  orgCount,
  dimCount,
  seed,
  forceOperators = [],
  touchCooldown = true,
} = {}) {
  const resolvedOpsCount =
    opsCount ?? (mode === "more" ? 3 : mode === "less" ? 1 : 2);
  const resolvedOrgCount = orgCount ?? (mode === "more" ? 2 : 1);
  const resolvedDimCount =
    dimCount ?? (mode === "more" ? 4 : mode === "less" ? 2 : 3);

  const weighted = seed === undefined || seed === null || seed === "";
  const rng = createRng(seed);

  const operators = pickFromCategory(
    "operators",
    resolvedOpsCount,
    rng,
    weighted,
    forceOperators,
  );
  const organons = pickFromCategory("organons", resolvedOrgCount, rng, weighted);
  const dimensions = pickFromCategory(
    "dimension-prompts",
    resolvedDimCount,
    rng,
    weighted,
  );

  // mtime memory: touch picked files so they cool off in future picks (unless seeded)
  if (weighted && touchCooldown) {
    const now = new Date();
    for (const item of [...operators, ...organons, ...dimensions]) {
      try {
        fs.utimesSync(item.filePath, now, now);
      } catch {
        // Ignore read-only filesystem errors
      }
    }
  }

  const operatorIds = operators.map((o) => o.id);
  const organonIds = organons.map((o) => o.id);
  const dimensionIds = dimensions.map((d) => d.id);
  const primaryOrganon = organons[0]?.id || "matrix";
  const pivotDimension = dimensions[0]?.id || "reversibility";

  const tupleLabel = `${operatorIds.join(" · ")} × ${organonIds.join(" · ")} [${dimensionIds.join(" · ")}]`;

  const promptBlock = `=== IDEONOMY SKILL METHOD TUPLE (Patrick Gunkel / Grace Kind) ===
OPERATORS: ${operatorIds.join(" · ")}
ORGANON: ${organonIds.join(" · ")}
DIMENSION-PROMPTS: ${dimensionIds.join(" · ")} (★ Pivot Dimension: ${pivotDimension})

HOW TO APPLY THIS TUPLE (Two-Pass Ideonomy Procedure):
1. Internal Pass:
   - Interrogate the idea using the picked DIMENSION-PROMPTS (${dimensionIds.join(", ")}) to surface the axes along which versions of this idea vary.
   - Apply the picked OPERATORS (${operatorIds.join(", ")}) along those surfaced dimensions (e.g., negate definitional properties, substitute one axis value while holding others constant, lift abstraction, or cross-pollinate).
   - Capture the result inside the picked ORGANON's structural shape (${primaryOrganon.toUpperCase()}).
2. External Pass (Visible Ideonomy Machinery inside the HTML Card):
   - Include a compact TUPLE LEGEND pill/header showing: ◆ OPERATORS (${operatorIds.join(" · ")}) | ◆ ORGANON (${primaryOrganon}) | ◆ DIMENSIONS (${dimensionIds.join(" · ")}).
   - Name both the OPERATOR and the concrete move at section headers: e.g., "◆ ${ (operatorIds[0] || "negation").toUpperCase() } ◆ 'X' → 'Y'" (never procedural labels like "Phase A").
   - Structure the core interactive visual around the picked ORGANON (${primaryOrganon.toUpperCase()}).
   - End with a compact monospace [ideonomy trail] footer that includes a mandatory "not surfaced:" line naming adjacent negations/axes left for the next tuple!

--- PICKED OPERATOR DEFINITIONS ---
${operators.map((o) => o.markdown).join("\n\n")}

--- PICKED ORGANON DEFINITION ---
${organons.map((o) => o.markdown).join("\n\n")}

--- PICKED DIMENSION-PROMPTS ---
${dimensions.map((d) => d.markdown).join("\n\n")}
===================================================================`;

  return {
    operators: operators.map(({ id, title, summary }) => ({
      id,
      title,
      summary,
    })),
    organons: organons.map(({ id, title, summary }) => ({
      id,
      title,
      summary,
    })),
    dimensions: dimensions.map(({ id, title, summary, possibleValues }) => ({
      id,
      title,
      summary,
      possibleValues,
    })),
    operatorIds,
    organonIds,
    dimensionIds,
    primaryOrganon,
    pivotDimension,
    tupleLabel,
    promptBlock,
  };
}

/**
 * Renders the 5-Layer Visible Ideonomy Machinery HTML block (Tuple Legend, Surfaced Dimensions with ★ Pivot,
 * Operator+Move Divider, Organon Header, and mandatory `[ideonomy · ... · not surfaced: ...]` Trail Footer)
 * so every generated card visibly exhibits the Ideonomy skill in action.
 */
export function renderIdeonomyMachineryHtml({
  tuple,
  ideaTitle = "Idea Expansion",
  moves = [],
  notSurfaced = "negations of meta-properties (zero-cost execution, inverted ownership) reserved for follow-up tuple",
}) {
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!tuple) return "";
  const opsStr = (tuple.operatorIds || []).join(" · ") || "negation · substitution";
  const orgStr = (tuple.organonIds || []).join(" · ") || "matrix";
  const dims = tuple.dimensions || [];
  const dimIdsStr = (tuple.dimensionIds || []).join(" · ") || "reversibility · agency · visibility";
  const pivotDim = dims[0] || {
    id: "reversibility",
    possibleValues: "reversible ↔ irreversible",
  };

  const resolvedMoves =
    moves.length > 0
      ? moves
      : (tuple.operators || []).map((op, idx) => ({
          operator: op.id,
          from: idx === 0 ? "default assumption" : "fixed axis",
          to:
            idx === 0
              ? `inverted ${dims[idx]?.id || "structural"} invariant`
              : `substituted ${dims[idx]?.id || "orthogonal"} locus`,
        }));

  const trailLines = [
    `[ideonomy · ${resolvedMoves.length} moves · ${dims.length} dims · 1 organon · "${ideaTitle.slice(0, 38)}"]`,
    `  dim · ★ pivot:  ${pivotDim.id} (${pivotDim.possibleValues || "axis extremes surfaced"})`,
    ...resolvedMoves.map(
      (m) => `  ◆ ${m.operator.padEnd(14, " ")} "${m.from}" → "${m.to}"`,
    ),
    `  organon:        ${orgStr.toUpperCase()}`,
    `  not surfaced:   ${notSurfaced}`,
  ].join("\n");

  return `<details style="margin-top:10px;border-top:1px solid rgba(148,163,184,0.12);padding-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;color:#64748b;">
  <summary style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;color:#94a3b8;font-size:10px;user-select:none;">
    <span>◇ Ideonomy · ${escapeHtml(opsStr)} × ${escapeHtml(orgStr)}</span>
    <span style="color:#64748b;font-size:9.5px;">★ ${escapeHtml(pivotDim.id)} ▾</span>
  </summary>
  <div style="margin-top:6px;padding:7px 9px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.14);border-radius:6px;color:#94a3b8;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;color:#cbd5e1;font-weight:600;font-size:9.5px;">
      <span>╭─ IDEONOMY TUPLE ─╮ ◆ OPS: ${escapeHtml(opsStr)}</span>
      <span style="color:#94a3b8;">◆ ORGANON: ${escapeHtml(orgStr.toUpperCase())}</span>
    </div>
    <div style="margin-bottom:4px;font-size:9px;">
      ◆ DIMS: <strong style="color:#e2e8f0;">★ ${escapeHtml(pivotDim.id)}</strong>${dims.length > 1 ? " · " + dims.slice(1).map((d) => escapeHtml(d.id)).join(" · ") : ""}
    </div>
    <div style="padding:2px 6px;margin-bottom:5px;border-left:2px solid rgba(148,163,184,0.35);color:#cbd5e1;font-size:9px;">
      ◆ ${escapeHtml((resolvedMoves[0]?.operator || "NEGATION").toUpperCase())} ◆ "${escapeHtml(resolvedMoves[0]?.from || "baseline")}" → "${escapeHtml(resolvedMoves[0]?.to || "orthogonal variant")}"
    </div>
    <pre style="margin:0;padding:5px 6px;background:rgba(2,6,23,0.6);border-radius:4px;color:#64748b;font-size:8.8px;line-height:1.35;white-space:pre-wrap;overflow-x:auto;">${escapeHtml(trailLines)}</pre>
  </div>
</details>`;
}
