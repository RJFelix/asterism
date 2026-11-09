export const INNOVATION_STAGES = [
  { id: "note", label: "1. Note", icon: "✎", color: "#94a3b8", next: "brainstorm", nextLabel: "Advance → Brainstorm" },
  { id: "brainstorm", label: "2. Brainstorm", icon: "⚡", color: "#c084fc", next: "refine", nextLabel: "Advance → Refine Spec" },
  { id: "refine", label: "3. Refine", icon: "◈", color: "#38bdf8", next: "design", nextLabel: "Advance → Interactive Design" },
  { id: "design", label: "4. Design", icon: "❖", color: "#f472b6", next: "implement", nextLabel: "Advance → Implementation" },
  { id: "implement", label: "5. Implement", icon: "⚙", color: "#34d399", next: "refine", nextLabel: "Spawn Next Iteration" },
];

const BRIEF_STEER_HTML = `<div class="surface-root">
  <style>
    .surface-root {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #e2e8f0; padding: 14px 16px; line-height: 1.5; font-size: 12px;
    }
    p { margin: 0 0 12px; color: #94a3b8; font-size: 11.5px; }
    .control-group {
      background: rgba(15, 23, 42, 0.55); border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;
    }
    .row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11.5px; color: #cbd5e1; }
    .primary-btn {
      width: 100%; padding: 7px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer;
      border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(56, 189, 248, 0.1); color: #e0f2fe;
    }
  </style>
  <p>Explore directions in-place using the facet tabs above, or branch a new revision without disturbing downstream work.</p>
  <div class="control-group">
    <div class="row">
      <span>Edit Policy</span>
      <select data-state-key="autonomyLevel" style="background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.22);border-radius:5px;padding:3px 7px;font-size:11px;">
        <option value="co-pilot">Branch New Future</option>
        <option value="autonomous">Update In-Place</option>
      </select>
    </div>
    <label style="display:flex;align-items:center;gap:7px;font-size:11px;color:#94a3b8;cursor:pointer;">
      <input type="checkbox" checked data-state-key="spawnCompanionUiAutomatically" style="accent-color:#38bdf8;" />
      <span>Preserve downstream worktrees on edit</span>
    </label>
  </div>
  <button class="primary-btn" onclick="window.asterism.mutate('Explore an alternative voice-first direction for this proposal')">
    Branch Revision (v2) →
  </button>
</div>`;

const BRIEF_SPEC_HTML = `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">
  <div style="background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
    <div style="color:#e2e8f0;font-weight:600;margin-bottom:2px;font-size:11.5px;">1. Lens Separation</div>
    <div style="color:#94a3b8;font-size:11px;"><code>Chat · Spec · UI · Code</code> are facets of a single thought, keeping the graph clean.</div>
  </div>
  <div style="background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:10px 12px;">
    <div style="color:#e2e8f0;font-weight:600;margin-bottom:2px;font-size:11.5px;">2. Regret-Free Branching</div>
    <div style="color:#94a3b8;font-size:11px;">Upstream edits fork <code>v(n+1)</code> so active downstream branches stay live.</div>
  </div>
</div>`;

const BRIEF_UI_HTML = `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Previewing the UI facet in-place. Adjust parallel fork fan-out:</p>
  <div style="background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:10px 12px;display:flex;gap:8px;align-items:center;">
    <span style="font-size:11px;color:#cbd5e1;">Parallel Forks</span>
    <input type="range" min="2" max="6" value="3" data-state-key="maxParallelForks" style="flex:1;accent-color:#38bdf8;" />
  </div>
</div>`;

const BRIEF_CODE_HTML = `<div style="font-family:'JetBrains Mono',ui-monospace,monospace;padding:14px 16px;color:#e2e8f0;font-size:11px;">
  <pre style="background:rgba(2,6,23,0.65);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:10px;color:#cbd5e1;overflow:auto;font-size:10.5px;line-height:1.45;margin:0;">export function shouldBranchForRegretMinimization(input) {
  if (input.editIntent === "branch") return true;
  if (input.editIntent === "in-place") return false;
  return input.edges.some((e) =&gt; e.from === input.nodeId);
}</pre>
</div>`;

export function getDefaultCanvasState() {
  return {
    version: 5,
    updatedAt: new Date().toISOString(),
    activeProjectId: "proj-misc-attic",
    projects: [
      {
        id: "proj-misc-attic",
        name: "agent-attic (misc)",
        repoPath: "/home/exedev/agent-attic/repos/asterism",
        isDefaultMisc: true,
        description: "Default 'anything goes' misc repository — development never blocks waiting for a repo assignment.",
      },
      {
        id: "proj-asterism",
        name: "asterism",
        repoPath: "/home/exedev/agent-attic/repos/asterism",
        isDefaultMisc: false,
        description: "Asterism spatial canvas & active knowledge engine.",
      },
    ],
    viewProjection: "canvas",
    plexFocusNodeId: "node-hydro",
    viewport: { x: 65, y: 55, scale: 0.88 },
    strokes: [],
    edges: [
      {
        id: "edge-1",
        from: "node-brief",
        to: "node-hydro",
        relation: "specifies",
        kind: "specifies",
        label: "📐 specifies",
      },
      {
        id: "edge-2",
        from: "node-hydro",
        to: "node-spec-a",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 UI fork A",
      },
      {
        id: "edge-3",
        from: "node-hydro",
        to: "node-spec-b",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 UI fork B",
      },
      {
        id: "edge-4",
        from: "node-hydro",
        to: "node-spec-c",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 UI fork C",
      },
      {
        id: "edge-5",
        from: "node-robotics",
        to: "node-hydro",
        relation: "implements",
        kind: "implements",
        label: "⚙ verifies",
      },
    ],
    nodes: [
      {
        id: "node-brief",
        title: "Evergreen Innovation Train",
        kind: "brief",
        stage: "note",
        stratum: "intent",
        surfaceRole: "dialogue",
        commitment: "committed",
        warrant: {
          _tag: "Judged",
          pass: 0.91,
          abstain: 0.05,
          statement: "Root operator intent & regret-minimization policy",
        },
        energy: {
          remainingTokens: 3600,
          maxDepth: 5,
          remainingWorktreeLeases: 2,
          basalRechargedTokens: 600,
        },
        x: 30,
        y: 40,
        width: 380,
        height: 265,
        model: "openai/gpt-6-luna",
        status: "ready",
        branchTag: "seed-intent",
        state: {
          autonomyLevel: "co-pilot",
          spawnCompanionUiAutomatically: true,
          maxParallelForks: 3,
        },
        facets: {
          dialogue: BRIEF_STEER_HTML,
          "spec-diagram": BRIEF_SPEC_HTML,
          "ui-prototype": BRIEF_UI_HTML,
          "artifact-harness": BRIEF_CODE_HTML,
        },
        html: BRIEF_STEER_HTML,
      },
      {
        id: "node-hydro",
        title: "Diamond Stratum & Energy Spec",
        kind: "workflow",
        stage: "refine",
        stratum: "spec",
        surfaceRole: "spec-diagram",
        relationFromParent: "specifies",
        commitment: "committed",
        warrant: {
          _tag: "Checked",
          checkSpec: "algebra-invariants",
          passed: true,
        },
        energy: {
          remainingTokens: 2800,
          maxDepth: 4,
          remainingWorktreeLeases: 2,
          basalRechargedTokens: 450,
        },
        x: 480,
        y: 40,
        width: 390,
        height: 265,
        model: "openai/gpt-6.1-terra",
        status: "ready",
        branchTag: "algebra-spec",
        state: {
          jevThreshold: 0.75,
          basalFloorTokensPerTick: 2400,
          allowMultiParentSynthesis: true,
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;color:#e2e8f0;padding:14px 16px;font-size:12px;line-height:1.5;">
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Deterministic checks (<code>PCheck</code>) verify implementation against spec; calibrated judges (<code>PJudge</code>) score UI prototypes.</p>
  <div style="background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:9px 12px;margin-bottom:12px;display:grid;gap:6px;font-size:11px;">
    <div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">Warrant Separation</span><span style="color:#94a3b8;font-family:ui-monospace,monospace;">pass vs. abstain</span></div>
    <div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">Basal Energy Floor</span><span style="color:#94a3b8;font-family:ui-monospace,monospace;">+2400 tok/tick</span></div>
  </div>
  <button onclick="window.asterism.openComparisonMatrix()" style="width:100%;padding:7px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;border:1px solid rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);color:#e0f2fe;">Compare 3 Prototype Forks</button>
</div>`,
      },
      {
        id: "node-robotics",
        title: "SO-100 Arm & Worktree Harness",
        kind: "robotics",
        stage: "implement",
        stratum: "world",
        surfaceRole: "artifact-harness",
        commitment: "committed",
        warrant: {
          _tag: "Checked",
          checkSpec: "node --test & 6-DOF limits",
          passed: true,
        },
        energy: {
          remainingTokens: 3200,
          maxDepth: 4,
          remainingWorktreeLeases: 1,
          basalRechargedTokens: 800,
        },
        x: 30,
        y: 350,
        width: 380,
        height: 270,
        model: "openai/gpt-5.3-codex",
        status: "ready",
        branchTag: "world-tender",
        state: { shoulderDeg: -25, elbowDeg: 55 },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;color:#e2e8f0;padding:14px 16px;font-size:12px;">
  <div style="background:rgba(9,13,22,0.8);border:1px solid rgba(148,163,184,0.16);border-radius:8px;height:112px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;">
    <svg width="240" height="105" viewBox="0 0 260 125">
      <line x1="20" y1="110" x2="240" y2="110" stroke="rgba(148,163,184,0.2)" stroke-width="2"/>
      <rect x="45" y="98" width="36" height="12" rx="3" fill="#475569"/>
      <g id="j1" transform="translate(63, 98) rotate(-25)">
        <line x1="0" y1="0" x2="0" y2="-48" stroke="#38bdf8" stroke-width="6" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="4.5" fill="#e2e8f0"/>
        <g id="j2" transform="translate(0, -48) rotate(55)">
          <line x1="0" y1="0" x2="0" y2="-40" stroke="#94a3b8" stroke-width="4.5" stroke-linecap="round"/>
          <circle cx="0" cy="0" r="3.5" fill="#e2e8f0"/>
          <circle cx="0" cy="-40" r="4.5" fill="#34d399"/>
        </g>
      </g>
      <rect id="target-cube" x="175" y="92" width="16" height="16" rx="3" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" stroke-width="1.2"/>
    </svg>
  </div>
  <div style="display:grid;gap:6px;font-size:11px;color:#94a3b8;">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="width:56px;">Shoulder</span>
      <input type="range" min="-70" max="45" value="-25" data-state-key="shoulderDeg" style="flex:1;accent-color:#38bdf8;" oninput="document.getElementById('j1').setAttribute('transform','translate(63, 98) rotate('+this.value+')');document.getElementById('s1-val').textContent=this.value+'°';" />
      <code id="s1-val" style="width:34px;text-align:right;color:#cbd5e1;">-25°</code>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="width:56px;">Elbow</span>
      <input type="range" min="-20" max="110" value="55" data-state-key="elbowDeg" style="flex:1;accent-color:#38bdf8;" oninput="document.getElementById('j2').setAttribute('transform','translate(0, -48) rotate('+this.value+')');document.getElementById('s2-val').textContent=this.value+'°';" />
      <code id="s2-val" style="width:34px;text-align:right;color:#cbd5e1;">55°</code>
    </div>
  </div>
</div>`,
      },
      {
        id: "node-spec-a",
        title: "Prototype A: Direct-Manipulation HUD",
        kind: "speculative",
        stage: "design",
        stratum: "prototype",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        commitment: "speculative",
        warrant: {
          _tag: "Judged",
          pass: 0.89,
          abstain: 0.06,
          statement: "High-credence existential UI witness",
        },
        energy: {
          remainingTokens: 1400,
          maxDepth: 3,
          remainingWorktreeLeases: 1,
          basalRechargedTokens: 0,
        },
        x: 945,
        y: 25,
        width: 370,
        height: 205,
        model: "openai/gpt-6-luna",
        provider: "chatgpt-gateway",
        harness: "@t3tools/provider-codex",
        arenaMode: true,
        status: "speculative",
        branchTag: "fork-A:gpt-6-luna",
        parentId: "node-hydro",
        parentIds: ["node-hydro"],
        jevScore: 0.89,
        state: {
          cornerRadiusPx: 12,
          markupNote: "Great inline token sliders; combine with Fork B!",
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.45;">
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Direct-manipulation spatial inspector with inline token sliders.</p>
  <div style="background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:8px 11px;margin-bottom:8px;display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
    <span>Card Radius</span>
    <input type="range" min="0" max="24" value="12" data-state-key="cornerRadiusPx" style="flex:1;accent-color:#38bdf8;" oninput="document.getElementById('rad-lbl').textContent=this.value+'px'" />
    <code id="rad-lbl" style="color:#94a3b8;">12px</code>
  </div>
  <input type="text" data-state-key="markupNote" value="Great inline token sliders; combine with Fork B!" style="width:100%;background:rgba(15,23,42,0.4);border:1px solid rgba(148,163,184,0.14);border-radius:6px;padding:5px 8px;color:#94a3b8;font-size:11px;outline:none;" />
</div>`,
      },
      {
        id: "node-spec-b",
        title: "Prototype B: Revision Timeline Scrubber",
        kind: "speculative",
        stage: "design",
        stratum: "prototype",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        commitment: "speculative",
        warrant: {
          _tag: "Judged",
          pass: 0.88,
          abstain: 0.08,
          statement: "Near-tie with Prototype A; ideal Couple (⋈) candidate",
        },
        energy: {
          remainingTokens: 1200,
          maxDepth: 3,
          remainingWorktreeLeases: 1,
          basalRechargedTokens: 0,
        },
        x: 945,
        y: 250,
        width: 370,
        height: 205,
        model: "openai/gpt-6.1-terra",
        provider: "chatgpt-gateway",
        harness: "@t3tools/provider-claude",
        arenaMode: true,
        status: "speculative",
        branchTag: "fork-B:gpt-6.1-terra",
        parentId: "node-hydro",
        parentIds: ["node-hydro"],
        jevScore: 0.88,
        state: {
          timelineFps: 60,
          markupNote: "Couple (⋈) this timeline scrubber with Sample A",
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.45;">
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Non-destructive timeline scrubber across <code>v1 / v2</code> revisions.</p>
  <div style="background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:8px 11px;margin-bottom:8px;display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
    <span>FPS Target</span>
    <input type="range" min="24" max="120" value="60" data-state-key="timelineFps" style="flex:1;accent-color:#38bdf8;" oninput="document.getElementById('fps-lbl').textContent=this.value+'fps'" />
    <code id="fps-lbl" style="color:#94a3b8;">60fps</code>
  </div>
  <button onclick="window.asterism.synthesizeWith(['node-spec-a'], 'Combine Direct-Manipulation HUD with Evergreen Timeline Scrubber', 'design')" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid rgba(148,163,184,0.22);background:rgba(30,41,59,0.6);color:#e2e8f0;font-size:11px;font-weight:500;cursor:pointer;">⊕ Synthesize Fork A + Fork B</button>
</div>`,
      },
      {
        id: "node-spec-c",
        title: "Prototype C: High-Uncertainty Camera Probe",
        kind: "speculative",
        stage: "design",
        stratum: "prototype",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        commitment: "speculative",
        warrant: {
          _tag: "Judged",
          pass: 0.52,
          abstain: 0.42,
          statement: "High epistemic ignorance (abstain=0.42) & exhausted envelope (0.4k)",
        },
        energy: {
          remainingTokens: 400,
          maxDepth: 2,
          remainingWorktreeLeases: 1,
          basalRechargedTokens: 0,
        },
        x: 945,
        y: 475,
        width: 370,
        height: 190,
        model: "openai/gpt-6.1-sol",
        provider: "chatgpt-gateway",
        harness: "@t3tools/provider-antigravity",
        arenaMode: true,
        status: "speculative",
        branchTag: "fork-C:gpt-6.1-sol",
        parentId: "node-hydro",
        parentIds: ["node-hydro"],
        jevScore: 0.52,
        state: {
          confidenceThreshold: 0.85,
          markupNote: "Envelope at 0.4k floor! Click Pulse Basal Energy to recharge.",
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.45;">
  <p style="margin:0 0 12px;color:#94a3b8;font-size:11.5px;">High-uncertainty camera probe (<code>abstain=0.42</code>) at the 0.4k token floor.</p>
  <button onclick="window.asterism.pulseBasalEnergy()" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);color:#e0f2fe;font-size:11px;font-weight:500;cursor:pointer;">
    Recharge Basal Energy
  </button>
</div>`,
      },
    ],
  };
}
