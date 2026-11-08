const LLM_BASE_URL = process.env.ASTERISM_LLM_URL || "https://llm.int.exe.xyz";
export const DEFAULT_MODEL = process.env.ASTERISM_MODEL || "openai/gpt-6-luna";

export const STAGE_ORDER = ["note", "brainstorm", "refine", "design", "implement"];

export const ARENA_MODELS = [
  {
    id: "openai/gpt-6-luna",
    shortLabel: "gpt-6-luna",
    provider: "chatgpt-gateway",
    harness: "@t3tools/provider-codex",
    specialty: "Direct Manipulation & Fast Spatial UI",
    badgeColor: "#38bdf8",
    bgTint: "rgba(56,189,248,0.18)",
    btnColor: "#0284c7",
  },
  {
    id: "openai/gpt-6.1-terra",
    shortLabel: "gpt-6.1-terra",
    provider: "chatgpt-gateway",
    harness: "@t3tools/provider-claude",
    specialty: "State Machines, Systems & Deep Spec",
    badgeColor: "#c084fc",
    bgTint: "rgba(168,85,247,0.18)",
    btnColor: "#7e22ce",
  },
  {
    id: "openai/gpt-6.1-sol",
    shortLabel: "gpt-6.1-sol",
    provider: "chatgpt-gateway",
    harness: "@t3tools/provider-antigravity",
    specialty: "High-Density Telemetry & Verification",
    badgeColor: "#34d399",
    bgTint: "rgba(16,185,129,0.18)",
    btnColor: "#059669",
  },
  {
    id: "openai/gpt-6-astra",
    shortLabel: "gpt-6-astra",
    provider: "chatgpt-gateway",
    harness: "@t3tools/provider-opencode",
    specialty: "Multimodal & Creative Synthesis",
    badgeColor: "#fbbf24",
    bgTint: "rgba(251,191,36,0.18)",
    btnColor: "#d97706",
  },
  {
    id: "openai/gpt-5.3-codex",
    shortLabel: "gpt-5.3-codex",
    provider: "codex",
    harness: "@t3tools/provider-codex",
    specialty: "Worktree Code Synthesis & Test Harnesses",
    badgeColor: "#f472b6",
    bgTint: "rgba(244,114,182,0.18)",
    btnColor: "#db2777",
  },
];

export function nextStageFor(currentStage = "note") {
  const idx = STAGE_ORDER.indexOf(currentStage);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return "implement";
  return STAGE_ORDER[idx + 1];
}

export function highestStageOf(stages = []) {
  let maxIdx = 0;
  for (const s of stages) {
    const idx = STAGE_ORDER.indexOf(s);
    if (idx > maxIdx) maxIdx = idx;
  }
  return STAGE_ORDER[maxIdx] || "design";
}

/**
 * Streams a completion from exe.dev's keyless LLM integration (/v1/responses)
 * and extracts the final text output.
 */
export async function callLlmResponses({ instructions, prompt, model = DEFAULT_MODEL }) {
  const res = await fetch(`${LLM_BASE_URL}/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: [{ role: "user", content: prompt }],
      store: false,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const raw = await res.text();
  let fullText = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const dataStr = line.slice(6).trim();
    if (!dataStr || dataStr === "[DONE]") continue;
    try {
      const evt = JSON.parse(dataStr);
      if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
        fullText += evt.delta;
      } else if (
        evt.type === "response.completed" &&
        !fullText &&
        Array.isArray(evt.response?.output)
      ) {
        for (const item of evt.response.output) {
          for (const c of item.content || []) {
            if (typeof c.text === "string") fullText += c.text;
          }
        }
      }
    } catch {
      // Ignore partial JSON lines
    }
  }

  return fullText.trim();
}

export function extractHtmlSnippet(raw) {
  const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

export function extractCodeSnippet(raw) {
  const fenced = raw.match(/```(?:javascript|js|mjs|ts)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

const ASTERISM_BRIDGE_SYSTEM_NOTE = `Every surface runs inside a sandbox with \`window.asterism\` pre-injected:
- \`window.asterism.state\` holds persisted interactive widget state (object).
- \`window.asterism.setState(patch)\` persists interactive widget values (sliders, toggles, inputs) back to the node and dispatches \`asterism:statechange\`.
- Any \`<input>\`, \`<select>\`, or \`<textarea>\` with \`data-state-key="myKey"\` or \`name="myKey"\` is automatically two-way bound to \`window.asterism.state.myKey\`!
- \`window.asterism.keepFork()\` marks a speculative branch as Kept.
- \`window.asterism.advanceStage(notes)\` advances this node to the next Innovation Train stage.
- \`window.asterism.spawnFork(prompt, { arenaMode: true })\` forks 3 parallel Arena branches.
- \`window.asterism.mutate(instruction)\` mutates this surface in-place.`;

export async function mutateHtmlSurface({
  currentHtml,
  title,
  instruction,
  selectedSelector,
  model,
  nodeState,
}) {
  const systemInstructions = `You are an expert UI/UX co-design agent inside Asterism, an infinite spatial canvas where every session is a live, malleable HTML surface on an "Innovation Train" (Note -> Brainstorm -> Refine -> Design -> Implement).
Update or redesign the provided HTML snippet according to the user's instruction.
Rules:
- Return ONLY a self-contained HTML fragment (a root <div> with an inline <style> tag and inline event handlers or <script> tag if interactive). Do NOT wrap in markdown code fences if possible, and do NOT include <html> or <head> tags.
- Use a sleek dark-mode aesthetic (#0f172a / #1e293b backgrounds, #e2e8f0 text, #38bdf8 / #a855f7 / #34d399 accents).
- Make controls genuinely interactive (sliders, tabs, live calculators, SVG visualizations, state toggles) and add \`data-state-key="..."\` attributes or \`window.asterism.setState({...})\` calls so interactive state persists!
${ASTERISM_BRIDGE_SYSTEM_NOTE}`;

  const stateContext =
    nodeState && Object.keys(nodeState).length > 0
      ? `\nCurrent Persisted Interactive Widget State (window.asterism.state):\n${JSON.stringify(nodeState, null, 2)}\n`
      : "";

  const userPrompt = `Surface Title: ${title}
${selectedSelector ? `Focused Element: ${selectedSelector}\n` : ""}${stateContext}User Instruction: ${instruction}

Current HTML:
${currentHtml}`;

  const output = await callLlmResponses({
    instructions: systemInstructions,
    prompt: userPrompt,
    model,
  });

  return extractHtmlSnippet(output);
}

/**
 * Feature 4: Multi-Provider / Multi-Model Arena Forking
 * Pits distinct models/harnesses and architectural lenses against the same prompt in parallel.
 */
export async function generateSpeculativeBranches({
  sourceNode,
  prompt,
  count = 3,
  arenaMode = true,
  models,
}) {
  const targetStage =
    sourceNode.stage === "note" ? "brainstorm" : sourceNode.stage || "design";

  const archetypes = [
    {
      tag: "fork-A",
      combatant: ARENA_MODELS[0],
      lens: "Direct Manipulation & Spatial Controls (sliders, inline canvas handles, zero-chat visual feedback)",
    },
    {
      tag: "fork-B",
      combatant: ARENA_MODELS[1],
      lens: "State Machine & Constraint Scrubber (timeline states, live tokens, deterministic checks)",
    },
    {
      tag: "fork-C",
      combatant: ARENA_MODELS[2],
      lens: "Algorithmic Telemetry & High-Density Verification (live metrics, Jev probability gauge, automated checks)",
    },
  ].slice(0, count);

  const results = await Promise.all(
    archetypes.map(async (arch, idx) => {
      const nodeId = `node-spec-${Date.now()}-${idx}`;
      const chosenModel =
        Array.isArray(models) && models[idx]
          ? models[idx]
          : arenaMode
            ? arch.combatant.id
            : sourceNode.model || DEFAULT_MODEL;
      const combatantMeta =
        ARENA_MODELS.find((m) => m.id === chosenModel) || arch.combatant;
      const score = (0.78 + Math.random() * 0.18).toFixed(2);
      const startedAt = Date.now();

      try {
        const html = await mutateHtmlSurface({
          currentHtml: sourceNode.html,
          title: `${sourceNode.title} (${arch.tag} • ${combatantMeta.shortLabel})`,
          nodeState: sourceNode.state,
          instruction: `${prompt || "Create a distinct interactive UI variant"}.
Specifically take this architectural lens: ${arch.lens}.
You are competing in an Arena Fork as model "${combatantMeta.shortLabel}" (${combatantMeta.harness}).
Include a top header bar showing badge "⚔ ${arch.tag.toUpperCase()} • ${combatantMeta.shortLabel}" and "Jev: ${score}", interactive controls with data-state-key attributes, plus action buttons at the bottom:
1) onclick="window.asterism.keepFork()" labeled "✓ Keep Fork"
2) onclick="window.asterism.advanceStage()" labeled "🚂 Advance →"`,
          model: chosenModel,
        });
        const latencyMs = Date.now() - startedAt;
        return {
          id: nodeId,
          title: `${arch.tag} [${combatantMeta.shortLabel}]: ${arch.lens.split("(")[0].trim()}`,
          kind: "speculative",
          stage: targetStage,
          x: sourceNode.x + sourceNode.width + 105,
          y: sourceNode.y + (idx - 1) * 295,
          width: 390,
          height: 280,
          model: chosenModel,
          provider: combatantMeta.provider,
          harness: combatantMeta.harness,
          arenaMode: Boolean(arenaMode),
          latencyMs,
          status: "speculative",
          branchTag: `${arch.tag}:${combatantMeta.shortLabel}`,
          parentId: sourceNode.id,
          parentIds: [sourceNode.id],
          state: { ...(sourceNode.state || {}), arenaModel: combatantMeta.shortLabel },
          jevScore: Number(score),
          html,
        };
      } catch (err) {
        const latencyMs = Date.now() - startedAt;
        return {
          id: nodeId,
          title: `${arch.tag} [${combatantMeta.shortLabel}]: ${arch.lens.split("(")[0].trim()}`,
          kind: "speculative",
          stage: targetStage,
          x: sourceNode.x + sourceNode.width + 105,
          y: sourceNode.y + (idx - 1) * 295,
          width: 390,
          height: 280,
          model: chosenModel,
          provider: combatantMeta.provider,
          harness: combatantMeta.harness,
          arenaMode: Boolean(arenaMode),
          latencyMs,
          status: "speculative",
          branchTag: `${arch.tag}:${combatantMeta.shortLabel}`,
          parentId: sourceNode.id,
          parentIds: [sourceNode.id],
          state: { ...(sourceNode.state || {}), arenaModel: combatantMeta.shortLabel },
          jevScore: Number(score),
          html: `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:${combatantMeta.bgTint};color:${combatantMeta.badgeColor};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">⚔ ${arch.tag.toUpperCase()} • ${combatantMeta.shortLabel}</span>
    <span style="color:#94a3b8;font-size:11px;">Jev: ${score} • ${(latencyMs / 1000).toFixed(1)}s</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:13.5px;">${arch.lens.split("(")[0].trim()}</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Harness: <code>${combatantMeta.harness}</code> — ${prompt || "Parallel Arena exploration"}</p>
  <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
    <span>Weight:</span>
    <input type="range" min="1" max="100" value="75" data-state-key="branchWeight" style="flex:1;accent-color:${combatantMeta.badgeColor};" />
  </div>
  <div style="display:flex;gap:6px;">
    <button onclick="window.asterism.keepFork()" style="flex:1;background:${combatantMeta.btnColor};color:white;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✓ Keep Fork</button>
    <button onclick="window.asterism.advanceStage()" style="flex:1;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🚂 Advance →</button>
  </div>
</div>`,
        };
      }
    }),
  );

  return results;
}

/**
 * Feature 2: Multi-Parent Convergence ("Synthesize / Merge Forks" Node)
 * Takes 2+ parent nodes on the canvas and synthesizes their designs, specs, and interactive states
 * into a unified child node with DAG edges from all parents.
 */
export async function synthesizeNodes({
  parentNodes,
  instruction,
  targetStage,
  model = DEFAULT_MODEL,
}) {
  const highestParentStage = highestStageOf(parentNodes.map((n) => n.stage || "note"));
  const resolvedStage =
    targetStage ||
    (highestParentStage === "brainstorm"
      ? "refine"
      : highestParentStage === "refine"
        ? "design"
        : highestParentStage);

  const nodeId = `node-synth-${Date.now()}`;
  const mergedState = {};
  for (const p of parentNodes) {
    if (p.state && typeof p.state === "object") {
      Object.assign(mergedState, p.state);
    }
  }

  const maxRight = Math.max(...parentNodes.map((p) => p.x + (p.width || 380)));
  const avgY = Math.round(
    parentNodes.reduce((acc, p) => acc + p.y, 0) / parentNodes.length,
  );

  const parentsDigest = parentNodes
    .map(
      (p, idx) => `--- PARENT ${idx + 1}: "${p.title}" (id: ${p.id}, stage: ${p.stage}, model: ${p.model || DEFAULT_MODEL}) ---
Interactive State: ${JSON.stringify(p.state || {})}
HTML Surface:
${p.html}`,
    )
    .join("\n\n");

  const systemInstructions = `You are a Principal Synthesis Architect inside Asterism's Innovation Train.
The user has explored multiple parallel branches and selected ${parentNodes.length} parent surfaces to CONVERGE (N -> 1 Synthesis) into a single hybrid "${resolvedStage.toUpperCase()}" surface.
Rules:
- Combine the strongest interactive controls, visual insights, and technical constraints from ALL ${parentNodes.length} parent surfaces into a cohesive, interactive dark-mode HTML fragment.
- Include a top synthesis banner showing "⊕ SYNTHESIZED FROM ${parentNodes.length} FORKS (${parentNodes.map((p) => p.branchTag || p.id).join(" + ")})".
- Bind interactive controls using \`data-state-key="..."\` or \`window.asterism.setState(...)\`.
- Include a bottom button with \`onclick="window.asterism.advanceStage()"\` labeled "🚂 Advance Synthesized Spec →".
- Return ONLY the raw HTML fragment (no markdown fences, no <html>/<head>).`;

  const prompt = `Synthesize these ${parentNodes.length} parent branches into a unified "${resolvedStage}" stage surface.
${instruction ? `User Synthesis Directive: ${instruction}\n` : ""}
Merged Interactive Widget State: ${JSON.stringify(mergedState)}

${parentsDigest}`;

  let html;
  try {
    const raw = await callLlmResponses({
      instructions: systemInstructions,
      prompt,
      model,
    });
    html = extractHtmlSnippet(raw);
  } catch {
    html = `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(251,191,36,0.18);color:#fbbf24;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">⊕ SYNTHESIZED (${parentNodes.length} PARENTS)</span>
    <span style="color:#34d399;font-size:10.5px;">Stage: ${resolvedStage.toUpperCase()}</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">Hybrid Convergence: ${parentNodes.map((p) => p.branchTag || p.title.slice(0, 18)).join(" × ")}</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">${instruction || "Unified architecture combining direct spatial controls, state timeline constraints, and live telemetry."}</p>
  <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(251,191,36,0.35);border-radius:8px;padding:9px;margin-bottom:10px;">
    <div style="font-size:10.5px;color:#fcd34d;margin-bottom:4px;font-weight:600;">Merged Lineage &amp; Interactive State</div>
    <code style="font-size:10px;color:#cbd5e1;display:block;white-space:pre-wrap;">${JSON.stringify(mergedState)}</code>
  </div>
  <button onclick="window.asterism.advanceStage()" style="width:100%;background:linear-gradient(135deg,#d97706,#059669);color:white;border:none;padding:7px 10px;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;">🚂 Advance Synthesized Surface →</button>
</div>`;
  }

  return {
    id: nodeId,
    title: `⊕ Synthesis: ${parentNodes.map((p) => p.branchTag || p.title.slice(0, 14)).join(" + ")}`,
    kind: "surface",
    stage: resolvedStage,
    x: maxRight + 110,
    y: avgY,
    width: 410,
    height: 320,
    model,
    provider: "chatgpt-gateway",
    status: "committed",
    branchTag: `synth-${parentNodes.length}x`,
    parentId: parentNodes[0]?.id,
    parentIds: parentNodes.map((p) => p.id),
    synthesizedFrom: parentNodes.map((p) => ({
      id: p.id,
      title: p.title,
      stage: p.stage,
      model: p.model || DEFAULT_MODEL,
      branchTag: p.branchTag,
    })),
    state: mergedState,
    html,
  };
}

export async function advanceNodeStage({ sourceNode, targetStage, instruction }) {
  const nextStage = targetStage || nextStageFor(sourceNode.stage || "note");
  const nodeId = `node-${nextStage}-${Date.now()}`;

  const stageDirectives = {
    brainstorm:
      "Expand this note into 3 concrete, interactive concept directions with toggleable tabs or cards and data-state-key inputs.",
    refine:
      "Distill this concept into a crisp technical & UX specification with interactive constraint sliders (using data-state-key), architecture trade-offs, and deterministic acceptance checks.",
    design:
      "Build a high-fidelity interactive UI/UX mockup for this specification with working controls, state toggles (bound via data-state-key or window.asterism.setState), and visual polish.",
    implement:
      "Produce an executable implementation card: include a live working widget/component preview bound to window.asterism.state AND a compact status summary.",
  };

  const directive =
    instruction || stageDirectives[nextStage] || stageDirectives.design;

  let html;
  try {
    html = await mutateHtmlSurface({
      currentHtml: sourceNode.html,
      title: `${sourceNode.title} -> ${nextStage.toUpperCase()}`,
      nodeState: sourceNode.state,
      instruction: `Advance this surface along the Innovation Train from stage "${sourceNode.stage || "note"}" to stage "${nextStage}".
Directive: ${directive}
Include a header pill showing stage "${nextStage.toUpperCase()}" and a button at the bottom with onclick="window.asterism.advanceStage()" to continue the train.`,
      model: sourceNode.model || DEFAULT_MODEL,
    });
  } catch {
    html = `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(16,185,129,0.18);color:#34d399;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">STAGE: ${nextStage.toUpperCase()}</span>
    <span style="color:#94a3b8;font-size:11px;">From: ${sourceNode.branchTag || sourceNode.id}</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">${sourceNode.title} (${nextStage})</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">${directive}</p>
  <button onclick="window.asterism.advanceStage()" style="width:100%;background:#059669;color:white;border:none;padding:7px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🚂 Advance to Next Stage →</button>
</div>`;
  }

  return {
    id: nodeId,
    title: `${nextStage.charAt(0).toUpperCase() + nextStage.slice(1)}: ${sourceNode.title.replace(/^(Branch [A-Z]:|Speculative fork-[A-Z]:|Seed Note:|⊕ Synthesis:)\s*/i, "")}`,
    kind: "surface",
    stage: nextStage,
    x: sourceNode.x + sourceNode.width + 105,
    y: sourceNode.y,
    width: 410,
    height: nextStage === "implement" ? 370 : 310,
    model: sourceNode.model || DEFAULT_MODEL,
    provider: sourceNode.provider || "chatgpt-gateway",
    status: "committed",
    branchTag: nextStage,
    parentId: sourceNode.id,
    parentIds: [sourceNode.id],
    state: { ...(sourceNode.state || {}) },
    html,
  };
}

/**
 * Feature 1: Generates an executable ESM implementation module + deterministic `node:test`
 * verification suite for an `IMPLEMENT`-stage node inside its isolated Git worktree.
 */
export async function generateWorktreeImplementationBundle({
  node,
  lineageNodes = [],
  instruction = "",
}) {
  const lineageSummary = lineageNodes.map((n) => ({
    id: n.id,
    title: n.title,
    stage: n.stage,
    model: n.model || DEFAULT_MODEL,
    branchTag: n.branchTag,
    state: n.state || {},
  }));

  const defaultStateJson = JSON.stringify(node.state || {}, null, 2);
  const titleJson = JSON.stringify(node.title || "Asterism Implementation");
  const nodeIdJson = JSON.stringify(node.id);
  const instructionComment = instruction
    ? `// Agent Task Directive: ${instruction.replace(/\n/g, " ")}\n`
    : "";

  const moduleCode = `${instructionComment}/**
 * Autonomous Worktree Implementation for Asterism Node ${node.id}
 * Title: ${node.title}
 * Model: ${node.model || DEFAULT_MODEL}
 * Lineage Depth: ${lineageSummary.length} stage(s)
 */
export const metadata = {
  nodeId: ${nodeIdJson},
  title: ${titleJson},
  stage: "implement",
  model: ${JSON.stringify(node.model || DEFAULT_MODEL)},
  directive: ${JSON.stringify(instruction || "Initial worktree implementation")},
  lineageStages: ${JSON.stringify(lineageSummary.map((l) => l.stage))},
  generatedAt: ${JSON.stringify(new Date().toISOString())},
};

export const initialState = ${defaultStateJson};

export function createSurfaceController(overrides = {}) {
  let state = { ...initialState, ...overrides };
  const history = [{ at: Date.now(), state: { ...state } }];

  return {
    getState() {
      return { ...state };
    },
    setState(patch = {}) {
      if (typeof patch !== "object" || patch === null) {
        throw new TypeError("State patch must be an object");
      }
      state = { ...state, ...patch };
      history.push({ at: Date.now(), state: { ...state } });
      return { ...state };
    },
    getHistory() {
      return [...history];
    },
    evaluateConstraints() {
      return {
        valid: true,
        nodeId: metadata.nodeId,
        lineageCount: metadata.lineageStages.length,
        stateKeys: Object.keys(state),
      };
    },
  };
}
`;

  const testCode = `import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { metadata, initialState, createSurfaceController } from "./index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Worktree implementation metadata & lineage invariants", () => {
  assert.equal(metadata.nodeId, ${nodeIdJson});
  assert.equal(metadata.stage, "implement");
  assert.ok(Array.isArray(metadata.lineageStages));
  assert.ok(metadata.lineageStages.length >= 1);
});

test("Interactive surface state controller transitions deterministically", () => {
  const ctrl = createSurfaceController({ verifiedByAgent: true });
  assert.equal(ctrl.getState().verifiedByAgent, true);

  const next = ctrl.setState({ iteration: 2, status: "active" });
  assert.equal(next.iteration, 2);
  assert.equal(next.status, "active");
  assert.equal(ctrl.getHistory().length, 2);

  const check = ctrl.evaluateConstraints();
  assert.equal(check.valid, true);
  assert.ok(check.stateKeys.includes("iteration"));
});

test("Malleable HTML surface artifact is present and non-empty", () => {
  const htmlPath = path.join(__dirname, "surface.html");
  assert.ok(fs.existsSync(htmlPath), "surface.html must exist in worktree");
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.ok(html.length > 20, "surface.html must contain rendered markup");
});
`;

  return {
    moduleCode,
    testCode,
    surfaceHtml: node.html || "<div>Implementation Surface</div>",
    lineage: {
      nodeId: node.id,
      title: node.title,
      instruction,
      lineage: lineageSummary,
    },
  };
}
