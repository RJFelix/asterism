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
      color: #e2e8f0; padding: 13px; line-height: 1.42; font-size: 11.5px;
    }
    .banner {
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(56, 189, 248, 0.14); border: 1px solid rgba(56, 189, 248, 0.38);
      border-radius: 7px; padding: 4px 8px; margin-bottom: 8px; font-size: 10px; color: #38bdf8;
    }
    h3 { margin: 0 0 4px; font-size: 13.5px; color: #f8fafc; }
    p { margin: 0 0 8px; color: #94a3b8; font-size: 11px; }
    .card-box {
      background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;
    }
    .box-title {
      font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: #38bdf8; margin-bottom: 5px;
      display: flex; justify-content: space-between;
    }
    .row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-size: 11px; }
    .btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 6px; }
    .act-btn {
      padding: 6px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 600; cursor: pointer;
      border: 1px solid rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.14); color: #bae6fd;
    }
    .act-btn.emerald {
      border-color: rgba(16, 185, 129, 0.45); background: rgba(16, 185, 129, 0.16); color: #6ee7b7;
    }
    .act-btn.purple {
      border-color: rgba(192, 132, 252, 0.45); background: rgba(192, 132, 252, 0.16); color: #e9d5ff;
    }
    .act-btn.pink {
      border-color: rgba(244, 114, 182, 0.45); background: rgba(244, 114, 182, 0.16); color: #fbcfe8;
    }
  </style>
  <div class="banner">
    <strong>💬 STEER OPTIC • STRATUM: INTENT</strong>
    <span>1 Thought = 4 Crystallization Facets</span>
  </div>
  <h3>Active Thought: Evergreen Innovation Train</h3>
  <p>This card is a single <strong>Active Thought</strong> with <strong>4 cached Crystallization Facets</strong> in its tab bar above (<code>💬 Steer •</code>, <code>📐 Spec •</code>, <code>🎨 UI •</code>, <code>⚙ Code •</code>). Switch tabs in-place without polluting the graph, or <strong>⧉ Tear Off</strong> a facet side-by-side.</p>
  <div class="card-box">
    <div class="box-title">
      <span>🌱 MINIMIZATION OF REGRET (EVERGREEN BRANCHING)</span>
      <span style="color:#34d399;">Default: Auto-Branch</span>
    </div>
    <div class="row">
      <span>Upstream Edit Policy</span>
      <select data-state-key="autonomyLevel" style="background:#1e293b;color:#f8fafc;border:1px solid rgba(148,163,184,0.3);border-radius:4px;padding:2px 6px;font-size:10.5px;">
        <option value="co-pilot">Branch New Future (Preserve Downstream)</option>
        <option value="autonomous">Autonomous Multi-Panel</option>
      </select>
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:#cbd5e1;cursor:pointer;">
      <input type="checkbox" checked data-state-key="spawnCompanionUiAutomatically" style="accent-color:#38bdf8;" />
      <span>Never cancel or invalidate downstream worktrees on upstream edits</span>
    </label>
  </div>
  <div class="btn-grid">
    <button class="act-btn emerald" onclick="window.asterism.mutate('Explore an alternative voice-first direction for this proposal')">
      🌱 Test Regret-Free Branch (v2)
    </button>
    <button class="act-btn purple" onclick="window.asterism.tearOffFacet('spec-diagram')">
      ⧉ Tear Off 📐 Spec Lens
    </button>
    <button class="act-btn pink" onclick="window.asterism.switchFacet('ui-prototype', false)">
      🎨 Flip to UI Facet In-Place
    </button>
    <button class="act-btn" onclick="window.asterism.openComparisonMatrix()">
      ⊞ Open 3-Fork Compare Matrix
    </button>
  </div>
</div>`;

const BRIEF_SPEC_HTML = `<div style="font-family:'JetBrains Mono',ui-monospace,monospace;padding:13px;color:#e2e8f0;font-size:11px;line-height:1.45;">
  <div style="display:flex;justify-content:space-between;background:rgba(192,132,252,0.16);border:1px solid rgba(192,132,252,0.4);padding:4px 8px;border-radius:6px;color:#d8b4fe;margin-bottom:8px;">
    <strong>📐 SPEC FACET (UNIVERSAL ∀ CONTRACT)</strong>
    <span>Same Node • Zero Graph Clutter</span>
  </div>
  <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(148,163,184,0.2);border-radius:7px;padding:8px;margin-bottom:7px;">
    <div style="color:#c084fc;font-weight:700;margin-bottom:3px;">1. Holon vs. Lens Separation</div>
    <div style="color:#94a3b8;font-family:system-ui,sans-serif;"><code>Contract ∈ {Observe, Steer, Exhibit}</code> is an optic over <code>Thought&lt;Stratum&gt;</code>, not a node coordinate.</div>
  </div>
  <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(148,163,184,0.2);border-radius:7px;padding:8px;margin-bottom:7px;">
    <div style="color:#34d399;font-weight:700;margin-bottom:3px;">2. Evergreen Branching Invariant</div>
    <div style="color:#94a3b8;font-family:system-ui,sans-serif;"><code>hasDownstream(node) ⇒ mutate(node)</code> forks <code>v(n+1)</code> via <code>revisions-from</code> edge; existing future stays 100% live.</div>
  </div>
  <button onclick="window.asterism.switchFacet('dialogue', false)" style="width:100%;padding:6px;border-radius:6px;border:1px solid rgba(56,189,248,0.4);background:rgba(56,189,248,0.14);color:#38bdf8;font-weight:600;cursor:pointer;">← Return to 💬 Steer Facet</button>
</div>`;

const BRIEF_UI_HTML = `<div style="font-family:system-ui,sans-serif;padding:13px;color:#e2e8f0;font-size:11.5px;">
  <div style="display:flex;justify-content:space-between;background:rgba(244,114,182,0.16);border:1px solid rgba(244,114,182,0.4);padding:4px 8px;border-radius:6px;color:#f9a8d4;margin-bottom:8px;">
    <strong>🎨 UI SAMPLE FACET (EXISTENTIAL ∃ WITNESS)</strong>
    <span>Exhibit Optic</span>
  </div>
  <div style="background:#0b1120;border:1px solid rgba(244,114,182,0.35);border-radius:8px;padding:10px;margin-bottom:8px;">
    <div style="font-weight:700;color:#f8fafc;margin-bottom:4px;">Interactive Facet Bar Preview</div>
    <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;">You are viewing the <code>🎨 UI</code> facet of <code>node-brief</code> in-place. Mark up this specimen to compile a new <code>Hydro.Predicate</code> refinement loop:</p>
    <div style="display:flex;gap:6px;align-items:center;">
      <span style="font-size:10.5px;color:#f472b6;">Max Parallel Forks:</span>
      <input type="range" min="2" max="6" value="3" data-state-key="maxParallelForks" style="flex:1;accent-color:#f472b6;" />
    </div>
  </div>
  <div style="display:flex;gap:6px;">
    <button onclick="window.asterism.tearOffFacet('ui-prototype')" style="flex:1;padding:6px;border-radius:6px;border:1px solid rgba(244,114,182,0.45);background:rgba(244,114,182,0.16);color:#f9a8d4;font-weight:600;cursor:pointer;">⧉ Tear Off as Side-by-Side Panel</button>
    <button onclick="window.asterism.switchFacet('dialogue', false)" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(148,163,184,0.3);background:rgba(30,41,59,0.8);color:#cbd5e1;cursor:pointer;">💬 Steer</button>
  </div>
</div>`;

const BRIEF_CODE_HTML = `<div style="font-family:'JetBrains Mono',ui-monospace,monospace;padding:13px;color:#e2e8f0;font-size:11px;">
  <div style="display:flex;justify-content:space-between;background:rgba(16,185,129,0.16);border:1px solid rgba(16,185,129,0.4);padding:4px 8px;border-radius:6px;color:#6ee7b7;margin-bottom:8px;">
    <strong>⚙ CODE / WORKTREE FACET</strong>
    <span>packages/asterism-core/src/algebra.ts</span>
  </div>
  <pre style="background:#050811;border:1px solid rgba(52,211,153,0.3);border-radius:7px;padding:8px;color:#6ee7b7;overflow:auto;font-size:10px;margin:0 0 8px;">export function shouldBranchForRegretMinimization(input) {
  if (input.editIntent === "branch") return true;
  if (input.editIntent === "in-place") return false;
  // Default: preserve existing downstream train!
  return input.edges.some((e) =&gt; e.from === input.nodeId);
}</pre>
  <button onclick="window.asterism.switchFacet('dialogue', false)" style="width:100%;padding:6px;border-radius:6px;border:1px solid rgba(52,211,153,0.4);background:rgba(16,185,129,0.15);color:#6ee7b7;font-weight:600;cursor:pointer;">← Return to 💬 Steer Facet</button>
</div>`;

export function getDefaultCanvasState() {
  return {
    version: 4,
    updatedAt: new Date().toISOString(),
    viewport: { x: 55, y: 50, scale: 0.84 },
    strokes: [],
    edges: [
      {
        id: "edge-1",
        from: "node-brief",
        to: "node-hydro",
        relation: "specifies",
        kind: "specifies",
        label: "↓ translates (Intent → Spec ∀)",
      },
      {
        id: "edge-2",
        from: "node-hydro",
        to: "node-spec-a",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "Δ expands UI (gpt-6-luna • p=0.89)",
      },
      {
        id: "edge-3",
        from: "node-hydro",
        to: "node-spec-b",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "Δ expands UI (gpt-6.1-terra • p=0.88)",
      },
      {
        id: "edge-4",
        from: "node-hydro",
        to: "node-spec-c",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "Δ expands UI (gpt-6.1-sol • p=0.52, u=0.42)",
      },
      {
        id: "edge-5",
        from: "node-robotics",
        to: "node-hydro",
        relation: "implements",
        kind: "implements",
        label: "ν tends & verifies (World ↔ Spec)",
      },
    ],
    nodes: [
      {
        id: "node-brief",
        title: "Active Thought: Evergreen Innovation Train",
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
        x: 25,
        y: 40,
        width: 405,
        height: 390,
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
        title: "Spec: Diamond Stratum & Two-Law Energy Algebra",
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
        x: 500,
        y: 40,
        width: 440,
        height: 395,
        model: "openai/gpt-6.1-terra",
        status: "ready",
        branchTag: "algebra-spec",
        state: {
          jevThreshold: 0.75,
          basalFloorTokensPerTick: 2400,
          allowMultiParentSynthesis: true,
        },
        html: `<div class="hydro-root">
  <style>
    .hydro-root {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      color: #e2e8f0; padding: 13px; font-size: 11px; line-height: 1.4;
    }
    .hdr {
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.38);
      border-radius: 7px; padding: 4px 8px; margin-bottom: 8px; font-size: 10px; color: #d8b4fe;
    }
    .step {
      background: rgba(15, 23, 42, 0.82); border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 7px; padding: 7px 9px; margin-bottom: 6px;
    }
    .step-top { display: flex; justify-content: space-between; margin-bottom: 2px; }
    .kw { color: #c084fc; font-weight: 700; }
    .tag-emerald { color: #34d399; font-size: 9.5px; }
    .tag-amber { color: #fbbf24; font-size: 9.5px; }
    .tag-cyan { color: #38bdf8; font-size: 9.5px; }
    .desc { color: #94a3b8; font-family: system-ui, sans-serif; font-size: 10.5px; }
    .btn-row { display: flex; gap: 6px; margin-top: 7px; }
    .act {
      flex: 1; padding: 5px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer;
      border: 1px solid rgba(52, 211, 153, 0.45); background: rgba(16, 185, 129, 0.15); color: #6ee7b7;
    }
    .act.compare {
      border-color: rgba(56, 189, 248, 0.45); background: rgba(56, 189, 248, 0.15); color: #38bdf8;
    }
  </style>
  <div class="hdr">
    <strong>📐 SPEC STRATUM (UNIVERSAL ∀ LAW)</strong>
    <span>5 Combinators: ↓/↑ Δ ⋈ ∇ ν</span>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">Diamond Stratum</span>: Intent → {Spec ∀, Proto ∃} → World</span>
      <span class="tag-cyan">Commutative Square</span>
    </div>
    <div class="desc"><code>World</code> is checked deterministically vs. <code>Spec</code> (<code>PCheck</code>) and calibrated vs. <code>Prototype</code> (<code>PJudge</code>).</div>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">Warrant × Commitment</span>: ANoul(pass, abstain)</span>
      <span class="tag-amber">No Laundering</span>
    </div>
    <div class="desc">Separates evidential credence (<code>pass</code> vs. ignorance <code>abstain</code>) from deontic <code>Speculative | Committed | Refuted</code>.</div>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">Two-Law Energy</span>: Attenuation + Basal Free Floor</span>
      <span class="tag-emerald">+2400 tok/tick</span>
    </div>
    <div class="desc">Excess "effective free" compute recharges exhausted &amp; high-EVOI forks (like <strong>Sample C</strong> at <code>400 tok</code>) so the graph never stalls on human Steer.</div>
  </div>
  <div class="btn-row">
    <button class="act" onclick="window.asterism.pulseBasalEnergy()">🔋 Pulse Basal Free Energy</button>
    <button class="act compare" onclick="window.asterism.openComparisonMatrix()">⊞ Compare 3 Forks Side-by-Side</button>
  </div>
</div>`,
      },
      {
        id: "node-robotics",
        title: "World + Tender (ν): SO-100 Arm & Worktree Harness",
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
        x: 25,
        y: 455,
        width: 405,
        height: 340,
        model: "openai/gpt-5.3-codex",
        status: "ready",
        branchTag: "world-tender",
        state: { shoulderDeg: -25, elbowDeg: 55 },
        html: `<div class="robo-root">
  <style>
    .robo-root {
      font-family: system-ui, -apple-system, sans-serif; color: #e2e8f0; padding: 12px; font-size: 11.5px;
    }
    .top-bar {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px;
      background: rgba(16, 185, 129, 0.14); border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 6px; padding: 4px 8px; font-size: 10px; color: #6ee7b7;
    }
    .status-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981; margin-right: 5px; box-shadow: 0 0 8px #10b981; }
    .viewport-box {
      background: radial-gradient(circle at 50% 40%, #1e293b, #090d16);
      border: 1px solid rgba(52, 211, 153, 0.3); border-radius: 8px;
      height: 120px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;
    }
    .sliders { display: grid; gap: 5px; margin-top: 7px; }
    .slider-row { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: #94a3b8; }
    .slider-row span.lbl { width: 60px; }
    .slider-row input { flex: 1; accent-color: #34d399; }
    .slider-row code { width: 38px; text-align: right; color: #34d399; }
  </style>
  <div class="top-bar">
    <div><span class="status-dot"></span><strong>⚙ WORLD STRATUM • FEATURE TENDER (ν)</strong></div>
    <span>PCheck: Verified ✓</span>
  </div>
  <div class="viewport-box">
    <svg width="260" height="115" viewBox="0 0 260 125">
      <defs>
        <linearGradient id="armGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#818cf8"/>
        </linearGradient>
      </defs>
      <line x1="20" y1="110" x2="240" y2="110" stroke="rgba(148,163,184,0.25)" stroke-width="2"/>
      <rect x="45" y="98" width="36" height="12" rx="3" fill="#475569"/>
      <g id="j1" transform="translate(63, 98) rotate(-25)">
        <line x1="0" y1="0" x2="0" y2="-48" stroke="url(#armGrad)" stroke-width="7" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="5" fill="#e2e8f0"/>
        <g id="j2" transform="translate(0, -48) rotate(55)">
          <line x1="0" y1="0" x2="0" y2="-40" stroke="#a855f7" stroke-width="5" stroke-linecap="round"/>
          <circle cx="0" cy="0" r="4" fill="#e2e8f0"/>
          <circle cx="0" cy="-40" r="5" fill="#34d399"/>
        </g>
      </g>
      <rect id="target-cube" x="175" y="90" width="18" height="18" rx="3" fill="rgba(251, 191, 36, 0.85)" stroke="#fef08a" stroke-width="1.5"/>
      <text x="155" y="83" fill="#fbbf24" font-size="9" font-family="monospace">Tender ν: 0 drift</text>
    </svg>
  </div>
  <div class="sliders">
    <div class="slider-row">
      <span class="lbl">Shoulder</span>
      <input type="range" min="-70" max="45" value="-25" data-state-key="shoulderDeg" oninput="
        document.getElementById('j1').setAttribute('transform', 'translate(63, 98) rotate(' + this.value + ')');
        document.getElementById('s1-val').textContent = this.value + '°';
      ">
      <code id="s1-val">-25°</code>
    </div>
    <div class="slider-row">
      <span class="lbl">Elbow</span>
      <input type="range" min="-20" max="110" value="55" data-state-key="elbowDeg" oninput="
        document.getElementById('j2').setAttribute('transform', 'translate(0, -48) rotate(' + this.value + ')');
        document.getElementById('s2-val').textContent = this.value + '°';
      ">
      <code id="s2-val">55°</code>
    </div>
  </div>
</div>`,
      },
      {
        id: "node-spec-a",
        title: "Prototype A [gpt-6-luna]: Direct-Manipulation HUD",
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
        x: 1020,
        y: 20,
        width: 395,
        height: 270,
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
        html: `<div style="font-family:system-ui,sans-serif;padding:12px;color:#e2e8f0;font-size:11.5px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
    <span style="background:rgba(244,114,182,0.18);color:#f472b6;padding:2px 7px;border-radius:99px;font-size:9.5px;font-weight:700;">🎨 PROTOTYPE (∃) • gpt-6-luna</span>
    <span style="color:#34d399;font-family:monospace;font-size:10px;">ANoul(p=0.89, u=0.06)</span>
  </div>
  <div style="background:#0b1120;border:1px solid rgba(56,189,248,0.35);border-radius:8px;padding:8px;margin-bottom:7px;">
    <div style="font-size:11.5px;font-weight:600;color:#f8fafc;margin-bottom:3px;">Exhibit A: Zero-Chat Spatial Inspector</div>
    <p style="margin:0 0 6px;color:#94a3b8;font-size:10.5px;">Tied at top Jev with Fork B (<code>p=0.89</code> vs <code>0.88</code>) → high Decision Leverage for human <code>Steer</code> or <code>⊕ Synthesize</code>:</p>
    <div style="display:flex;align-items:center;gap:8px;font-size:10.5px;color:#cbd5e1;">
      <span>Card Radius:</span>
      <input type="range" min="0" max="24" value="12" data-state-key="cornerRadiusPx" style="flex:1;accent-color:#38bdf8;" oninput="document.getElementById('rad-lbl').textContent=this.value+'px'" />
      <code id="rad-lbl" style="color:#38bdf8;">12px</code>
    </div>
  </div>
  <div style="background:rgba(15,23,42,0.75);border:1px dashed rgba(244,114,182,0.35);border-radius:6px;padding:4px 7px;display:flex;gap:6px;align-items:center;">
    <span style="font-size:9.5px;color:#f472b6;white-space:nowrap;">✎ Exhibit Markup → Predicate:</span>
    <input type="text" data-state-key="markupNote" value="Great inline token sliders; combine with Fork B!" style="flex:1;background:transparent;border:none;color:#e2e8f0;font-size:10.5px;outline:none;" />
  </div>
</div>`,
      },
      {
        id: "node-spec-b",
        title: "Prototype B [gpt-6.1-terra]: Evergreen Timeline Scrubber",
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
        x: 1020,
        y: 305,
        width: 395,
        height: 270,
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
        html: `<div style="font-family:system-ui,sans-serif;padding:12px;color:#e2e8f0;font-size:11.5px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
    <span style="background:rgba(244,114,182,0.18);color:#f472b6;padding:2px 7px;border-radius:99px;font-size:9.5px;font-weight:700;">🎨 PROTOTYPE (∃) • gpt-6.1-terra</span>
    <span style="color:#c084fc;font-family:monospace;font-size:10px;">ANoul(p=0.88, u=0.08)</span>
  </div>
  <div style="background:#0b1120;border:1px solid rgba(168,85,247,0.35);border-radius:8px;padding:8px;margin-bottom:7px;">
    <div style="font-size:11.5px;font-weight:600;color:#f8fafc;margin-bottom:3px;">Exhibit B: Non-Destructive Revision Scrubber</div>
    <p style="margin:0 0 6px;color:#94a3b8;font-size:10.5px;">Scrubs across evergreen <code>v1 / v2</code> timelines without invalidating downstream worktrees:</p>
    <div style="display:flex;align-items:center;gap:8px;font-size:10.5px;color:#cbd5e1;">
      <span>FPS Target:</span>
      <input type="range" min="24" max="120" value="60" data-state-key="timelineFps" style="flex:1;accent-color:#c084fc;" oninput="document.getElementById('fps-lbl').textContent=this.value+'fps'" />
      <code id="fps-lbl" style="color:#c084fc;">60fps</code>
    </div>
  </div>
  <div style="display:flex;gap:6px;">
    <button onclick="window.asterism.synthesizeWith(['node-spec-a'], 'Combine Direct-Manipulation HUD with Evergreen Timeline Scrubber', 'design')" style="flex:1;padding:5px;border-radius:5px;border:1px solid rgba(251,191,36,0.45);background:rgba(251,191,36,0.15);color:#fde68a;font-size:10px;font-weight:600;cursor:pointer;">⊕ Couple (⋈) Fork A + Fork B</button>
    <button onclick="window.asterism.openComparisonMatrix()" style="padding:5px 8px;border-radius:5px;border:1px solid rgba(56,189,248,0.4);background:rgba(56,189,248,0.14);color:#38bdf8;font-size:10px;cursor:pointer;">⊞ Matrix</button>
  </div>
</div>`,
      },
      {
        id: "node-spec-c",
        title: "Prototype C [gpt-6.1-sol]: High-Uncertainty Desk Camera",
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
        x: 1020,
        y: 590,
        width: 395,
        height: 275,
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
        html: `<div style="font-family:system-ui,sans-serif;padding:12px;color:#e2e8f0;font-size:11.5px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
    <span style="background:rgba(251,191,36,0.18);color:#fbbf24;padding:2px 7px;border-radius:99px;font-size:9.5px;font-weight:700;">🔋 AT BASAL FLOOR (0.4k) • HIGH EVOI</span>
    <span style="color:#fbbf24;font-family:monospace;font-size:10px;">ANoul(p=0.52, u=0.42)</span>
  </div>
  <div style="background:#0b1120;border:1px solid rgba(251,191,36,0.4);border-radius:8px;padding:8px;margin-bottom:7px;">
    <div style="font-size:11.5px;font-weight:600;color:#f8fafc;margin-bottom:3px;">Why the Basal Free-Energy Floor matters here:</div>
    <p style="margin:0 0 6px;color:#94a3b8;font-size:10.5px;">This branch exhausted its downward envelope (<code>🔋 0.4k</code>) and has high ignorance (<code>abstain=0.42</code>). Instead of stalling for human Steer, excess free energy automatically prioritizes it!</p>
  </div>
  <button onclick="window.asterism.pulseBasalEnergy()" style="width:100%;padding:6px;border-radius:6px;border:1px solid rgba(16,185,129,0.5);background:rgba(16,185,129,0.18);color:#6ee7b7;font-size:10.5px;font-weight:700;cursor:pointer;">
    🔋 Pulse Basal Free Energy (Watch 0.4k Recharge!)
  </button>
</div>`,
      },
    ],
  };
}
