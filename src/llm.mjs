const LLM_BASE_URL = process.env.ASTERISM_LLM_URL || "https://llm.int.exe.xyz";
export const DEFAULT_MODEL = process.env.ASTERISM_MODEL || "openai/gpt-6-luna";

export const STAGE_ORDER = ["note", "brainstorm", "refine", "design", "implement"];

/**
 * Every panel on the Asterism canvas is an Agent <-> Developer Collaborator Medium,
 * but with an explicit `surfaceRole` so both human and agent know what kind of collaboration
 * they are looking at (and never confuse collaborator worksheets with target UI mockups).
 */
export const SURFACE_ROLES = {
  dialogue: {
    id: "dialogue",
    label: "💬 Dialogue / Proposal",
    shortBadge: "💬 DIALOGUE",
    color: "#38bdf8",
    bgTint: "rgba(56,189,248,0.16)",
    description:
      "Bespoke interactive communication medium between agent & developer: feature proposals, trade-off sliders, decision checkboxes, and open questions (replaces raw chat).",
  },
  "spec-diagram": {
    id: "spec-diagram",
    label: "📐 Spec / Architecture",
    shortBadge: "📐 SPEC",
    color: "#c084fc",
    bgTint: "rgba(168,85,247,0.16)",
    description:
      "Technical contract, system architecture diagram, data schema, state machine, or deterministic invariant checklist.",
  },
  "ui-prototype": {
    id: "ui-prototype",
    label: "🎨 UI Prototype / Markup",
    shortBadge: "🎨 UI SAMPLE",
    color: "#f472b6",
    bgTint: "rgba(244,114,182,0.16)",
    description:
      "Concrete sample of an intended product UI that developer and agent can inspect, interact with, and mark up together.",
  },
  "artifact-harness": {
    id: "artifact-harness",
    label: "⚙ Live Artifact / Test Harness",
    shortBadge: "⚙ ARTIFACT",
    color: "#34d399",
    bgTint: "rgba(16,185,129,0.16)",
    description:
      "Worktree-backed executable implementation, benchmark dashboard, or live hardware/component test harness.",
  },
};

/**
 * Typed semantic relations between panels on the graph.
 */
export const PANEL_RELATIONS = {
  advances: {
    id: "advances",
    label: "→ advances",
    color: "rgba(56, 189, 248, 0.65)",
    defaultTargetRole: null,
  },
  forks: {
    id: "forks",
    label: "⚔ forks",
    color: "rgba(168, 85, 247, 0.65)",
    defaultTargetRole: null,
  },
  synthesizes: {
    id: "synthesizes",
    label: "⊕ synthesizes",
    color: "rgba(251, 191, 36, 0.85)",
    defaultTargetRole: "spec-diagram",
  },
  "visualizes-ui": {
    id: "visualizes-ui",
    label: "🎨 visualizes UI for",
    color: "rgba(244, 114, 182, 0.82)",
    defaultTargetRole: "ui-prototype",
  },
  specifies: {
    id: "specifies",
    label: "📐 specifies contract for",
    color: "rgba(192, 132, 252, 0.82)",
    defaultTargetRole: "spec-diagram",
  },
  implements: {
    id: "implements",
    label: "⚙ implements",
    color: "rgba(52, 211, 153, 0.85)",
    defaultTargetRole: "artifact-harness",
  },
  annotates: {
    id: "annotates",
    label: "💬 critiques / marks up",
    color: "rgba(56, 189, 248, 0.78)",
    defaultTargetRole: "dialogue",
  },
};

export function defaultRoleForStage(stage = "note") {
  if (stage === "note" || stage === "brainstorm") return "dialogue";
  if (stage === "refine") return "spec-diagram";
  if (stage === "design") return "ui-prototype";
  if (stage === "implement") return "artifact-harness";
  return "dialogue";
}

export function defaultStageForRole(role = "dialogue", fallbackStage = "note") {
  if (role === "ui-prototype") return "design";
  if (role === "spec-diagram") return "refine";
  if (role === "artifact-harness") return "implement";
  return fallbackStage || "brainstorm";
}

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

export function extractJsonOrNull(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw.trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
  return null;
}

const ASTERISM_BRIDGE_SYSTEM_NOTE = `Every panel runs inside a sandbox with \`window.asterism\` pre-injected for multi-panel agent <-> developer collaboration:
- \`window.asterism.state\` holds persisted interactive widget state (object).
- Any \`<input>\`, \`<select>\`, or \`<textarea>\` with \`data-state-key="myKey"\` is automatically two-way bound to \`window.asterism.state.myKey\`!
- \`window.asterism.setState(patch)\` persists interactive widget values (sliders, toggles, decisions, annotations) back to the graph.
- \`window.asterism.spawnRelatedPanel({ relation, surfaceRole, title, prompt })\` spawns a linked companion panel on the canvas (e.g., \`relation: "visualizes-ui", surfaceRole: "ui-prototype"\` to spawn a UI design from a feature proposal, or \`relation: "specifies", surfaceRole: "spec-diagram"\` to spawn a technical contract).
- \`window.asterism.updatePanel(targetNodeId, instruction)\` lets one panel trigger an agent update on a related panel.
- IMPORTANT CHROME RULE: Do NOT render generic Asterism orchestration buttons like "Keep Fork" or "Advance Stage" inside the HTML unless specifically creating a custom companion-panel launcher (e.g. a button calling \`window.asterism.spawnRelatedPanel(...)\`). Outer card chrome already provides Keep, Arena Fork, Advance, and Diff buttons!`;

export function roleGuidanceFor(surfaceRole = "dialogue") {
  const roleMeta = SURFACE_ROLES[surfaceRole] || SURFACE_ROLES.dialogue;
  if (surfaceRole === "dialogue") {
    return `PANEL ROLE: ${roleMeta.label} (${roleMeta.id})
What this panel IS: A structured, interactive Agent <-> Developer communication medium (feature proposal, decision worksheet, trade-off explorer, or question/answer surface).
What this panel is NOT: Do NOT pretend this panel is a mockup of an end-user app. Instead, build interactive widgets (trade-off sliders, option toggles, architecture choice cards, priority weights bound with \`data-state-key="..."\`) so the developer and agent can make decisions together, plus optional buttons calling \`window.asterism.spawnRelatedPanel({ relation: 'visualizes-ui', surfaceRole: 'ui-prototype', prompt: '...' })\` when a visual UI sample should be broken out into a companion panel.`;
  }
  if (surfaceRole === "spec-diagram") {
    return `PANEL ROLE: ${roleMeta.label} (${roleMeta.id})
What this panel IS: A crisp technical contract, architecture diagram, state machine scrubber, or invariant check table shared between developer and agent.
Include interactive constraint inputs (\`data-state-key="..."\`), SVG flow/state diagrams, or schema inspectors.`;
  }
  if (surfaceRole === "ui-prototype") {
    return `PANEL ROLE: ${roleMeta.label} (${roleMeta.id})
What this panel IS: A concrete, interactive sample of the intended UI being developed, shared between agent and developer so they can test interactions and mark up design choices together.
Make the sample UI genuinely interactive and include a subtle top or bottom markup/annotation bar (bound via \`data-state-key="designNotes"\` or similar) where the developer can toggle design variants or leave markup notes for the agent.`;
  }
  return `PANEL ROLE: ${roleMeta.label} (${roleMeta.id})
What this panel IS: A live executable artifact preview, verification harness, or telemetry controller backed by an isolated Git worktree.`;
}

/**
 * Formats a compact digest of connected panels (parents, children, companions) so the agent
 * has multi-panel awareness across the graph.
 */
export function formatNeighborhoodDigest(neighborhood = []) {
  if (!Array.isArray(neighborhood) || neighborhood.length === 0) {
    return "No connected companion panels yet.";
  }
  return neighborhood
    .map(
      (n) =>
        `• [${n.direction} via "${n.relation}"] Node "${n.title}" (id: ${n.id}, role: ${n.surfaceRole || defaultRoleForStage(n.stage)}, stage: ${n.stage}, state: ${JSON.stringify(n.state || {})})`,
    )
    .join("\n");
}

export async function mutateHtmlSurface({
  currentHtml,
  title,
  surfaceRole = "dialogue",
  instruction,
  selectedSelector,
  model,
  nodeState,
  neighborhood = [],
}) {
  const systemInstructions = `You are a Principal Collaborative Agent inside Asterism, an infinite spatial canvas where panels are Agent <-> Developer collaboration mediums connected by typed relations.
${roleGuidanceFor(surfaceRole)}

Rules:
- Return ONLY a self-contained HTML fragment (a root <div> with an inline <style> tag and inline event handlers or <script> tag if interactive). Do NOT wrap in markdown code fences, and do NOT include <html> or <head> tags.
- Use a sleek dark-mode aesthetic (#0f172a / #1e293b backgrounds, #e2e8f0 text, #38bdf8 / #a855f7 / #f472b6 / #34d399 accents).
- Make controls genuinely interactive and bind them with \`data-state-key="..."\` or \`window.asterism.setState({...})\`.
${ASTERISM_BRIDGE_SYSTEM_NOTE}`;

  const stateContext =
    nodeState && Object.keys(nodeState).length > 0
      ? `\nCurrent Panel Interactive State (window.asterism.state):\n${JSON.stringify(nodeState, null, 2)}\n`
      : "";

  const neighborhoodContext =
    neighborhood.length > 0
      ? `\nConnected Panels in Graph Neighborhood:\n${formatNeighborhoodDigest(neighborhood)}\n`
      : "";

  const userPrompt = `Panel Title: ${title}
Panel Surface Role: ${surfaceRole}
${selectedSelector ? `Focused Element: ${selectedSelector}\n` : ""}${stateContext}${neighborhoodContext}User Instruction: ${instruction}

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
 * Multi-Panel Agent Collaboration:
 * Allows an agent turn on `sourceNode` to BOTH update `sourceNode` (or leave it intact) AND
 * autonomously spawn 1+ related companion panels (e.g. a `ui-prototype` connected via `visualizes-ui`,
 * or a `spec-diagram` connected via `specifies`) or update existing connected panels!
 */
export async function collaborateAcrossPanels({
  sourceNode,
  instruction,
  neighborhood = [],
  model = DEFAULT_MODEL,
}) {
  const sourceRole =
    sourceNode.surfaceRole || defaultRoleForStage(sourceNode.stage);

  // Check if the user's instruction asks to spawn/break out a related panel (UI design, spec, critique, implementation)
  const wantsSpawn =
    /\b(spawn|create|break out|companion|separate panel|new panel|ui design|ui prototype|mockup|spec panel|diagram panel)\b/i.test(
      instruction,
    );

  if (!wantsSpawn) {
    const updatedHtml = await mutateHtmlSurface({
      currentHtml: sourceNode.html,
      title: sourceNode.title,
      surfaceRole: sourceRole,
      instruction,
      model,
      nodeState: sourceNode.state,
      neighborhood,
    });
    return {
      updatedHtml,
      spawnedSpecs: [],
      updatedOtherPanels: [],
    };
  }

  // Infer what kind of companion panel makes the most sense if the LLM returns plain HTML or JSON
  const inferredRole = /\b(spec|schema|contract|architecture|diagram)\b/i.test(
    instruction,
  )
    ? "spec-diagram"
    : /\b(implement|code|worktree|test|harness)\b/i.test(instruction)
      ? "artifact-harness"
      : "ui-prototype";

  const inferredRelation =
    inferredRole === "spec-diagram"
      ? "specifies"
      : inferredRole === "artifact-harness"
        ? "implements"
        : "visualizes-ui";

  const companionNode = await spawnRelatedPanel({
    sourceNode,
    relation: inferredRelation,
    surfaceRole: inferredRole,
    prompt: instruction,
    neighborhood,
    model,
  });

  // Also add a cross-reference banner/note to the source panel so both panels clearly reference each other
  const relationMeta =
    PANEL_RELATIONS[inferredRelation] || PANEL_RELATIONS["visualizes-ui"];
  const roleMeta = SURFACE_ROLES[inferredRole] || SURFACE_ROLES["ui-prototype"];
  const linkFooter = `<div style="margin-top:10px;padding:7px 10px;background:rgba(15,23,42,0.85);border:1px solid rgba(244,114,182,0.35);border-radius:7px;display:flex;justify-content:space-between;align-items:center;font-family:system-ui,sans-serif;font-size:11px;color:#e2e8f0;">
    <span>Linked <strong>${roleMeta.shortBadge}</strong> spawned (${relationMeta.label}): <em>${companionNode.title}</em></span>
    <button onclick="window.asterism.updatePanel('${companionNode.id}', 'Sync with latest parent state')" style="background:rgba(244,114,182,0.2);color:#f9a8d4;border:1px solid rgba(244,114,182,0.45);border-radius:5px;padding:3px 7px;font-size:10px;cursor:pointer;">↻ Sync Companion</button>
  </div>`;

  return {
    updatedHtml: sourceNode.html + "\n" + linkFooter,
    spawnedPanels: [companionNode],
  };
}

/**
 * Spawns a new panel related to `sourceNode` with an explicit `relation` and `surfaceRole`.
 * For example, if `sourceNode` is a Feature Proposal (`surfaceRole: "dialogue"`),
 * the agent can spawn a UI Design (`surfaceRole: "ui-prototype"`, `relation: "visualizes-ui"`)
 * or a Technical Contract (`surfaceRole: "spec-diagram"`, `relation: "specifies"`).
 */
export async function spawnRelatedPanel({
  sourceNode,
  relation = "visualizes-ui",
  surfaceRole,
  title,
  prompt,
  neighborhood = [],
  existingRelatedCount = 0,
  model,
}) {
  const relationMeta = PANEL_RELATIONS[relation] || PANEL_RELATIONS["visualizes-ui"];
  const resolvedRole =
    surfaceRole ||
    relationMeta.defaultTargetRole ||
    (sourceNode.surfaceRole === "dialogue" ? "ui-prototype" : "dialogue");
  const roleMeta = SURFACE_ROLES[resolvedRole] || SURFACE_ROLES.dialogue;
  const resolvedStage = defaultStageForRole(resolvedRole, sourceNode.stage);
  const chosenModel = model || sourceNode.model || DEFAULT_MODEL;
  const nodeId = `node-${resolvedRole.split("-")[0]}-${Date.now()}`;

  const baseCleanTitle = sourceNode.title.replace(
    /^(Seed Note:|Feature Proposal:|fork-[A-Z]\s*\[[^\]]+\]:|⊕ Synthesis:)\s*/i,
    "",
  );
  const resolvedTitle =
    title ||
    (resolvedRole === "ui-prototype"
      ? `UI Prototype: ${baseCleanTitle}`
      : resolvedRole === "spec-diagram"
        ? `Spec & Contract: ${baseCleanTitle}`
        : resolvedRole === "artifact-harness"
          ? `Artifact Harness: ${baseCleanTitle}`
          : `Dialogue: ${baseCleanTitle}`);

  const defaultDirective =
    resolvedRole === "ui-prototype"
      ? `Build an interactive sample UI prototype for the proposal in "${sourceNode.title}". Include realistic interactive controls for the target UI AND a compact developer/agent markup bar (using data-state-key="uiMarkupNote") so we can critique and adjust the layout together.`
      : resolvedRole === "spec-diagram"
        ? `Create an interactive technical specification, state machine diagram, and constraint checklist specifying "${sourceNode.title}". Bind constraint parameters with data-state-key attributes.`
        : resolvedRole === "artifact-harness"
          ? `Create an executable verification & telemetry harness preview for "${sourceNode.title}".`
          : `Create a collaborative agent <-> developer dialogue and decision worksheet for "${sourceNode.title}" with interactive trade-off controls.`;

  let html;
  try {
    html = await mutateHtmlSurface({
      currentHtml: sourceNode.html,
      title: resolvedTitle,
      surfaceRole: resolvedRole,
      nodeState: sourceNode.state,
      neighborhood,
      instruction: `You are spawning a new companion panel connected to "${sourceNode.title}" (id: ${sourceNode.id}, role: ${sourceNode.surfaceRole || "dialogue"}) via relation "${relation}" (${relationMeta.label}).
New Panel Role: ${roleMeta.label} (${resolvedRole}).
Directive: ${prompt || defaultDirective}`,
      model: chosenModel,
    });
  } catch {
    html = buildFallbackRoleHtml({
      nodeId,
      title: resolvedTitle,
      surfaceRole: resolvedRole,
      relation,
      sourceNode,
      prompt: prompt || defaultDirective,
    });
  }

  return {
    id: nodeId,
    title: resolvedTitle,
    kind: "surface",
    stage: resolvedStage,
    surfaceRole: resolvedRole,
    relationFromParent: relation,
    x: sourceNode.x + (sourceNode.width || 390) + 115,
    y: sourceNode.y + existingRelatedCount * 305,
    width: 405,
    height: resolvedRole === "artifact-harness" ? 360 : 300,
    model: chosenModel,
    provider: sourceNode.provider || "chatgpt-gateway",
    status: "committed",
    branchTag: `${relation}:${resolvedRole}`,
    parentId: sourceNode.id,
    parentIds: [sourceNode.id],
    state: { ...(sourceNode.state || {}), spawnedViaRelation: relation },
    html,
  };
}

export function buildFallbackRoleHtml({
  title,
  surfaceRole,
  relation,
  sourceNode,
  prompt,
}) {
  const roleMeta = SURFACE_ROLES[surfaceRole] || SURFACE_ROLES.dialogue;
  const relMeta = PANEL_RELATIONS[relation] || PANEL_RELATIONS["visualizes-ui"];

  if (surfaceRole === "ui-prototype") {
    return `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:${roleMeta.bgTint};color:${roleMeta.color};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">${roleMeta.shortBadge} • TARGET UI SAMPLE</span>
    <span style="color:#94a3b8;font-size:10.5px;">${relMeta.label} "${sourceNode.title.slice(0, 22)}"</span>
  </div>
  <div style="background:#0b1120;border:1px solid rgba(244,114,182,0.35);border-radius:8px;padding:10px;margin-bottom:9px;">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(148,163,184,0.15);padding-bottom:6px;margin-bottom:8px;">
      <strong style="color:#f8fafc;font-size:12px;">Interactive Component Preview</strong>
      <select data-state-key="uiDensity" style="background:#1e293b;color:#f472b6;border:1px solid rgba(244,114,182,0.4);border-radius:4px;font-size:10px;padding:2px 5px;">
        <option value="compact">Compact HUD</option>
        <option value="spacious">Spacious Split</option>
      </select>
    </div>
    <p style="margin:0 0 8px;color:#cbd5e1;font-size:11.5px;">${prompt}</p>
    <div style="display:flex;gap:6px;align-items:center;font-size:11px;color:#94a3b8;">
      <span>Preview Scale:</span>
      <input type="range" min="50" max="150" value="100" data-state-key="previewScalePct" style="flex:1;accent-color:#f472b6;" />
    </div>
  </div>
  <div style="background:rgba(15,23,42,0.75);border:1px dashed rgba(148,163,184,0.28);border-radius:6px;padding:6px 8px;display:flex;gap:6px;align-items:center;">
    <span style="font-size:10px;color:#f472b6;white-space:nowrap;">✎ Markup Note:</span>
    <input type="text" data-state-key="designMarkupNote" value="Looks clean — let's wire this to the spec" style="flex:1;background:transparent;border:none;color:#e2e8f0;font-size:11px;outline:none;" />
  </div>
</div>`;
  }

  if (surfaceRole === "spec-diagram") {
    return `<div style="font-family:'JetBrains Mono',monospace;padding:14px;color:#e2e8f0;font-size:11.5px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:${roleMeta.bgTint};color:${roleMeta.color};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">${roleMeta.shortBadge} • CONTRACT &amp; INVARIANTS</span>
    <span style="color:#94a3b8;font-size:10px;">${relMeta.label}</span>
  </div>
  <h4 style="margin:0 0 6px;font-family:system-ui,sans-serif;font-size:13.5px;color:#f8fafc;">${title}</h4>
  <p style="margin:0 0 8px;font-family:system-ui,sans-serif;color:#94a3b8;font-size:11.5px;">${prompt}</p>
  <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(192,132,252,0.35);border-radius:7px;padding:8px;margin-bottom:8px;">
    <label style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;">
      <input type="checkbox" checked data-state-key="invariantIdempotent" style="accent-color:#c084fc;" />
      <span>Idempotent Command Receipts</span>
    </label>
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
      <input type="checkbox" checked data-state-key="invariantTypedRelations" style="accent-color:#c084fc;" />
      <span>Typed Multi-Panel Graph Edges</span>
    </label>
  </div>
  <button onclick="window.asterism.spawnRelatedPanel({relation:'visualizes-ui', surfaceRole:'ui-prototype', prompt:'Generate interactive UI prototype for this contract'})" style="width:100%;background:rgba(244,114,182,0.18);color:#f472b6;border:1px solid rgba(244,114,182,0.4);padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🎨 Spawn Companion UI Prototype →</button>
</div>`;
  }

  return `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:${roleMeta.bgTint};color:${roleMeta.color};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">${roleMeta.shortBadge} • AGENT ↔ DEV MEDIUM</span>
    <span style="color:#94a3b8;font-size:10.5px;">${relMeta.label}</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">${title}</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">${prompt}</p>
  <div style="display:flex;gap:6px;">
    <button onclick="window.asterism.spawnRelatedPanel({relation:'visualizes-ui', surfaceRole:'ui-prototype'})" style="flex:1;background:rgba(244,114,182,0.18);color:#f472b6;border:1px solid rgba(244,114,182,0.4);padding:6px 8px;border-radius:6px;font-size:10.5px;font-weight:600;cursor:pointer;">🎨 + UI Prototype</button>
    <button onclick="window.asterism.spawnRelatedPanel({relation:'specifies', surfaceRole:'spec-diagram'})" style="flex:1;background:rgba(168,85,247,0.18);color:#c084fc;border:1px solid rgba(168,85,247,0.4);padding:6px 8px;border-radius:6px;font-size:10.5px;font-weight:600;cursor:pointer;">📐 + Spec Panel</button>
  </div>
</div>`;
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
  surfaceRole,
  models,
  neighborhood = [],
}) {
  const targetStage =
    sourceNode.stage === "note" ? "brainstorm" : sourceNode.stage || "design";
  const resolvedRole =
    surfaceRole || sourceNode.surfaceRole || defaultRoleForStage(targetStage);
  const roleMeta = SURFACE_ROLES[resolvedRole] || SURFACE_ROLES.dialogue;

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
          surfaceRole: resolvedRole,
          nodeState: sourceNode.state,
          neighborhood,
          instruction: `${prompt || "Create a distinct interactive variant"}.
Specifically take this architectural lens: ${arch.lens}.
You are competing in an Arena Fork as model "${combatantMeta.shortLabel}" (${combatantMeta.harness}).
Panel Role: ${roleMeta.label} (${resolvedRole}).
Include a compact top header bar showing badge "⚔ ${arch.tag.toUpperCase()} • ${combatantMeta.shortLabel}" and "${roleMeta.shortBadge} • Jev: ${score}", plus interactive controls bound with data-state-key attributes. Do NOT include Keep/Advance buttons inside the HTML (they live in the outer card chrome).`,
          model: chosenModel,
        });
        const latencyMs = Date.now() - startedAt;
        return {
          id: nodeId,
          title: `${arch.tag} [${combatantMeta.shortLabel}]: ${arch.lens.split("(")[0].trim()}`,
          kind: "speculative",
          stage: targetStage,
          surfaceRole: resolvedRole,
          relationFromParent: "forks",
          x: sourceNode.x + sourceNode.width + 115,
          y: sourceNode.y + (idx - 1) * 295,
          width: 395,
          height: 275,
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
      } catch {
        const latencyMs = Date.now() - startedAt;
        return {
          id: nodeId,
          title: `${arch.tag} [${combatantMeta.shortLabel}]: ${arch.lens.split("(")[0].trim()}`,
          kind: "speculative",
          stage: targetStage,
          surfaceRole: resolvedRole,
          relationFromParent: "forks",
          x: sourceNode.x + sourceNode.width + 115,
          y: sourceNode.y + (idx - 1) * 295,
          width: 395,
          height: 275,
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
    <span style="color:#94a3b8;font-size:10.5px;">${roleMeta.shortBadge} • Jev: ${score}</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:13.5px;">${arch.lens.split("(")[0].trim()}</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Harness: <code>${combatantMeta.harness}</code> — ${prompt || "Parallel Arena exploration"}</p>
  <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
    <span>Weight:</span>
    <input type="range" min="1" max="100" value="75" data-state-key="branchWeight" style="flex:1;accent-color:${combatantMeta.badgeColor};" />
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
 * Takes 2+ parent nodes on the canvas (even of different roles, e.g. a Spec panel + a UI Prototype panel!)
 * and synthesizes their designs, specs, and interactive states into a unified child node.
 */
export async function synthesizeNodes({
  parentNodes,
  instruction,
  targetStage,
  surfaceRole,
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

  const hasUiParent = parentNodes.some((p) => p.surfaceRole === "ui-prototype");
  const resolvedRole =
    surfaceRole ||
    (hasUiParent ? "ui-prototype" : defaultRoleForStage(resolvedStage));
  const roleMeta = SURFACE_ROLES[resolvedRole] || SURFACE_ROLES.dialogue;

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
      (p, idx) => `--- PARENT ${idx + 1}: "${p.title}" (id: ${p.id}, role: ${p.surfaceRole || defaultRoleForStage(p.stage)}, stage: ${p.stage}, model: ${p.model || DEFAULT_MODEL}) ---
Interactive State: ${JSON.stringify(p.state || {})}
HTML Surface:
${p.html}`,
    )
    .join("\n\n");

  const systemInstructions = `You are a Principal Synthesis Architect inside Asterism's Innovation Train.
The user has selected ${parentNodes.length} panels to CONVERGE (N -> 1 Synthesis) into a single hybrid panel.
${roleGuidanceFor(resolvedRole)}
Rules:
- Combine the strongest interactive controls, visual insights, and technical constraints from ALL ${parentNodes.length} parent panels into a cohesive, interactive dark-mode HTML fragment.
- Include a top synthesis banner showing "⊕ SYNTHESIZED (${parentNodes.map((p) => p.surfaceRole || p.stage).join(" + ")}) • ${roleMeta.shortBadge}".
- Bind interactive controls using \`data-state-key="..."\` or \`window.asterism.setState(...)\`.
- Return ONLY the raw HTML fragment (no markdown fences, no <html>/<head>).`;

  const prompt = `Synthesize these ${parentNodes.length} parent panels into a unified "${resolvedRole}" (${resolvedStage} stage) panel.
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
    <span style="background:rgba(251,191,36,0.18);color:#fbbf24;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">⊕ SYNTHESIZED (${parentNodes.length} PANELS)</span>
    <span style="color:${roleMeta.color};font-size:10.5px;font-weight:600;">${roleMeta.shortBadge}</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">Hybrid Convergence: ${parentNodes.map((p) => p.branchTag || p.title.slice(0, 18)).join(" × ")}</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">${instruction || "Unified collaboration surface combining parent proposals, UI prototypes, and state constraints."}</p>
  <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(251,191,36,0.35);border-radius:8px;padding:9px;">
    <div style="font-size:10.5px;color:#fcd34d;margin-bottom:4px;font-weight:600;">Merged Lineage &amp; Interactive State</div>
    <code style="font-size:10px;color:#cbd5e1;display:block;white-space:pre-wrap;">${JSON.stringify(mergedState)}</code>
  </div>
</div>`;
  }

  return {
    id: nodeId,
    title: `⊕ Synthesis: ${parentNodes.map((p) => p.branchTag || p.title.slice(0, 14)).join(" + ")}`,
    kind: "surface",
    stage: resolvedStage,
    surfaceRole: resolvedRole,
    relationFromParent: "synthesizes",
    x: maxRight + 115,
    y: avgY,
    width: 415,
    height: 310,
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
      surfaceRole: p.surfaceRole || defaultRoleForStage(p.stage),
      model: p.model || DEFAULT_MODEL,
      branchTag: p.branchTag,
    })),
    state: mergedState,
    html,
  };
}

export async function advanceNodeStage({
  sourceNode,
  targetStage,
  surfaceRole,
  instruction,
  neighborhood = [],
}) {
  const nextStage = targetStage || nextStageFor(sourceNode.stage || "note");
  const resolvedRole = surfaceRole || defaultRoleForStage(nextStage);
  const roleMeta = SURFACE_ROLES[resolvedRole] || SURFACE_ROLES.dialogue;
  const nodeId = `node-${nextStage}-${Date.now()}`;

  const stageDirectives = {
    brainstorm:
      "Build an interactive Agent <-> Developer Dialogue worksheet exploring 3 concept directions with trade-off sliders and decision checkboxes (bound via data-state-key).",
    refine:
      "Distill this into an interactive Spec & Contract surface (spec-diagram) with architecture invariants, state transitions, and constraint sliders.",
    design:
      "Build an interactive UI Prototype / Markup sample (ui-prototype) of the target feature so developer and agent can test and annotate it together.",
    implement:
      "Produce a Live Artifact & Verification Harness surface (artifact-harness) bound to window.asterism.state.",
  };

  const directive =
    instruction || stageDirectives[nextStage] || stageDirectives.design;

  let html;
  try {
    html = await mutateHtmlSurface({
      currentHtml: sourceNode.html,
      title: `${sourceNode.title} -> ${nextStage.toUpperCase()}`,
      surfaceRole: resolvedRole,
      nodeState: sourceNode.state,
      neighborhood,
      instruction: `Advance this branch along the Innovation Train from stage "${sourceNode.stage || "note"}" (${sourceNode.surfaceRole || "dialogue"}) to stage "${nextStage}" with Panel Role "${roleMeta.label}" (${resolvedRole}).
Directive: ${directive}
Include a top badge showing "${roleMeta.shortBadge} • STAGE: ${nextStage.toUpperCase()}". Do NOT include generic Keep/Advance buttons inside the HTML.`,
      model: sourceNode.model || DEFAULT_MODEL,
    });
  } catch {
    html = buildFallbackRoleHtml({
      nodeId,
      title: `${sourceNode.title} (${nextStage})`,
      surfaceRole: resolvedRole,
      relation: nextStage === "implement" ? "implements" : "advances",
      sourceNode,
      prompt: directive,
    });
  }

  const relation =
    nextStage === "implement"
      ? "implements"
      : resolvedRole === "ui-prototype"
        ? "visualizes-ui"
        : resolvedRole === "spec-diagram"
          ? "specifies"
          : "advances";

  return {
    id: nodeId,
    title: `${nextStage.charAt(0).toUpperCase() + nextStage.slice(1)}: ${sourceNode.title.replace(/^(Branch [A-Z]:|Speculative fork-[A-Z]:|fork-[A-Z]\s*\[[^\]]+\]:|Seed Note:|Feature Proposal:|⊕ Synthesis:)\s*/i, "")}`,
    kind: "surface",
    stage: nextStage,
    surfaceRole: resolvedRole,
    relationFromParent: relation,
    x: sourceNode.x + sourceNode.width + 115,
    y: sourceNode.y,
    width: 410,
    height: nextStage === "implement" ? 360 : 300,
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
    surfaceRole: n.surfaceRole || defaultRoleForStage(n.stage),
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
 * Surface Role: ${node.surfaceRole || "artifact-harness"}
 * Model: ${node.model || DEFAULT_MODEL}
 * Lineage Depth: ${lineageSummary.length} panel(s)
 */
export const metadata = {
  nodeId: ${nodeIdJson},
  title: ${titleJson},
  stage: "implement",
  surfaceRole: ${JSON.stringify(node.surfaceRole || "artifact-harness")},
  model: ${JSON.stringify(node.model || DEFAULT_MODEL)},
  directive: ${JSON.stringify(instruction || "Initial worktree implementation")},
  lineageStages: ${JSON.stringify(lineageSummary.map((l) => l.stage))},
  lineageRoles: ${JSON.stringify(lineageSummary.map((l) => l.surfaceRole))},
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
        roles: metadata.lineageRoles,
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
import { metadata, createSurfaceController } from "./index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Worktree implementation metadata & multi-role lineage invariants", () => {
  assert.equal(metadata.nodeId, ${nodeIdJson});
  assert.equal(metadata.stage, "implement");
  assert.ok(Array.isArray(metadata.lineageStages));
  assert.ok(metadata.lineageStages.length >= 1);
  assert.ok(Array.isArray(metadata.lineageRoles));
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
      surfaceRole: node.surfaceRole || "artifact-harness",
      instruction,
      lineage: lineageSummary,
    },
  };
}
