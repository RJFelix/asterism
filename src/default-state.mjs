export const INNOVATION_STAGES = [
  { id: "note", label: "1. Note", icon: "✎", color: "#94a3b8", next: "brainstorm", nextLabel: "Advance → Brainstorm" },
  { id: "brainstorm", label: "2. Brainstorm", icon: "⚡", color: "#c084fc", next: "refine", nextLabel: "Advance → Refine Spec" },
  { id: "refine", label: "3. Refine", icon: "◈", color: "#38bdf8", next: "design", nextLabel: "Advance → Interactive Design" },
  { id: "design", label: "4. Design", icon: "❖", color: "#f472b6", next: "implement", nextLabel: "Advance → Implementation" },
  { id: "implement", label: "5. Implement", icon: "⚙", color: "#34d399", next: "refine", nextLabel: "Spawn Next Iteration" },
];

export function getDefaultCanvasState() {
  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    viewport: { x: 65, y: 55, scale: 0.84 },
    strokes: [],
    edges: [
      {
        id: "edge-1",
        from: "node-brief",
        to: "node-hydro",
        relation: "specifies",
        kind: "specifies",
        label: "📐 specifies contract",
      },
      {
        id: "edge-2",
        from: "node-hydro",
        to: "node-spec-a",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 visualizes UI (gpt-6-luna)",
      },
      {
        id: "edge-3",
        from: "node-hydro",
        to: "node-spec-b",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 visualizes UI (gpt-6.1-terra)",
      },
      {
        id: "edge-4",
        from: "node-hydro",
        to: "node-spec-c",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 visualizes UI (gpt-6.1-sol)",
      },
      {
        id: "edge-5",
        from: "node-robotics",
        to: "node-hydro",
        relation: "implements",
        kind: "implements",
        label: "⚙ telemetry harness",
      },
    ],
    nodes: [
      {
        id: "node-brief",
        title: "Feature Proposal: Multi-Panel Innovation Train",
        kind: "brief",
        stage: "note",
        surfaceRole: "dialogue",
        x: 30,
        y: 45,
        width: 395,
        height: 365,
        model: "openai/gpt-6-luna",
        status: "ready",
        branchTag: "seed-proposal",
        state: {
          autonomyLevel: "co-pilot",
          spawnCompanionUiAutomatically: true,
          maxParallelForks: 3,
        },
        html: `<div class="surface-root">
  <style>
    .surface-root {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #e2e8f0;
      padding: 14px;
      line-height: 1.45;
      font-size: 12px;
    }
    .role-banner {
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(56, 189, 248, 0.14); border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 7px; padding: 5px 9px; margin-bottom: 10px; font-size: 10.5px; color: #38bdf8;
    }
    h3 { margin: 0 0 5px; font-size: 14px; color: #f8fafc; }
    p { margin: 0 0 10px; color: #94a3b8; font-size: 11.5px; }
    .decision-box {
      background: rgba(15, 23, 42, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px; padding: 9px 10px; margin-bottom: 8px;
    }
    .decision-row {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 11px;
    }
    .spawn-bar {
      display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;
    }
    .spawn-btn {
      padding: 6px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;
      border: 1px solid rgba(244, 114, 182, 0.4); background: rgba(244, 114, 182, 0.15); color: #f9a8d4;
    }
    .spawn-btn.spec {
      border-color: rgba(192, 132, 252, 0.4); background: rgba(192, 132, 252, 0.15); color: #d8b4fe;
    }
  </style>
  <div class="role-banner">
    <strong>💬 DIALOGUE / PROPOSAL</strong>
    <span>Agent ↔ Developer Medium</span>
  </div>
  <h3>What is each panel on this canvas?</h3>
  <p>Every panel is an <strong>Agent ↔ Developer collaboration surface</strong> with an explicit role badge in its header—so neither you nor the agent confuses a <em>decision worksheet</em> with a <em>sample of the target UI</em>.</p>
  <div class="decision-box">
    <div style="font-size:10.5px;color:#38bdf8;font-weight:700;margin-bottom:6px;">COLLABORATION PREFERENCES (window.asterism.state)</div>
    <div class="decision-row">
      <span>Agent Collaboration Mode</span>
      <select data-state-key="autonomyLevel" style="background:#1e293b;color:#f8fafc;border:1px solid rgba(148,163,184,0.3);border-radius:4px;padding:2px 6px;font-size:11px;">
        <option value="co-pilot">Interactive Co-Pilot</option>
        <option value="autonomous">Autonomous Multi-Panel</option>
      </select>
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#cbd5e1;cursor:pointer;">
      <input type="checkbox" checked data-state-key="spawnCompanionUiAutomatically" style="accent-color:#38bdf8;" />
      <span>Allow agent to spawn linked 🎨 UI Prototype &amp; 📐 Spec panels</span>
    </label>
  </div>
  <div class="spawn-bar">
    <button class="spawn-btn" onclick="window.asterism.spawnRelatedPanel({relation:'visualizes-ui', surfaceRole:'ui-prototype', prompt:'Create an interactive UI prototype for this feature proposal'})">
      🎨 + Spawn UI Prototype
    </button>
    <button class="spawn-btn spec" onclick="window.asterism.spawnRelatedPanel({relation:'specifies', surfaceRole:'spec-diagram', prompt:'Create a technical contract & architecture spec for this proposal'})">
      📐 + Spawn Spec Panel
    </button>
  </div>
</div>`,
      },
      {
        id: "node-hydro",
        title: "Spec: Hydro Workflow & Multi-Panel Graph Contract",
        kind: "workflow",
        stage: "refine",
        surfaceRole: "spec-diagram",
        relationFromParent: "specifies",
        x: 505,
        y: 45,
        width: 430,
        height: 375,
        model: "openai/gpt-6-luna",
        status: "ready",
        branchTag: "dsl-core",
        state: { jevThreshold: 0.75, allowMultiParentSynthesis: true },
        html: `<div class="hydro-root">
  <style>
    .hydro-root {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      color: #e2e8f0; padding: 14px; font-size: 11.5px;
    }
    .hdr {
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(168, 85, 247, 0.14); border: 1px solid rgba(168, 85, 247, 0.35);
      border-radius: 7px; padding: 5px 9px; margin-bottom: 10px; font-size: 10.5px; color: #d8b4fe;
    }
    .step {
      background: rgba(15, 23, 42, 0.78); border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 7px; padding: 8px 10px; margin-bottom: 7px;
    }
    .step-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .kw { color: #c084fc; font-weight: 700; }
    .cost-free { color: #34d399; font-size: 10px; }
    .cost-jev { color: #fbbf24; font-size: 10px; }
    .desc { color: #94a3b8; font-family: system-ui, sans-serif; font-size: 11px; }
    .prob-bar {
      height: 6px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-top: 6px;
    }
    .prob-fill { height: 100%; background: linear-gradient(90deg, #38bdf8, #a855f7); transition: width 0.3s; }
  </style>
  <div class="hdr">
    <strong>📐 SPEC / ARCHITECTURE CONTRACT</strong>
    <span id="hydro-state"> specifies: node-brief</span>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">SurfaceRole</span> = Dialogue | Spec | UIPrototype | Artifact</span>
      <span class="cost-free">Typed Role</span>
    </div>
    <div class="desc">Every panel declares whether it is direct agent↔dev dialogue, a technical contract, a sample UI to mark up, or a worktree test harness.</div>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">PanelRelation</span> = visualizes-ui | specifies | forks | synthesizes</span>
      <span class="cost-free">Graph Edges</span>
    </div>
    <div class="desc">Agents inspect connected panels across the graph and can spawn companion UI or Spec panels automatically.</div>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">PJudge</span> (Arena 3x) QChoice</span>
      <span class="cost-jev" id="jev-label">Jev • p = 0.86</span>
    </div>
    <div class="desc">Calibrated evaluator scores parallel UI prototypes on the right.</div>
    <div class="prob-bar"><div class="prob-fill" id="jev-bar" style="width: 86%"></div></div>
  </div>
</div>`,
      },
      {
        id: "node-robotics",
        title: "Artifact Harness: SO-100 Arm & Telemetry",
        kind: "robotics",
        stage: "implement",
        surfaceRole: "artifact-harness",
        x: 30,
        y: 445,
        width: 395,
        height: 330,
        model: "openai/gpt-6-luna",
        status: "ready",
        branchTag: "hardware-node",
        state: { shoulderDeg: -25, elbowDeg: 55 },
        html: `<div class="robo-root">
  <style>
    .robo-root {
      font-family: system-ui, -apple-system, sans-serif; color: #e2e8f0; padding: 12px; font-size: 12px;
    }
    .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; margin-right: 6px; box-shadow: 0 0 8px #10b981; }
    .viewport-box {
      background: radial-gradient(circle at 50% 40%, #1e293b, #090d16);
      border: 1px solid rgba(52, 211, 153, 0.3); border-radius: 8px;
      height: 135px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;
    }
    .sliders { display: grid; gap: 6px; margin-top: 8px; }
    .slider-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #94a3b8; }
    .slider-row span.lbl { width: 65px; }
    .slider-row input { flex: 1; accent-color: #34d399; }
    .slider-row code { width: 42px; text-align: right; color: #34d399; }
  </style>
  <div class="top-bar">
    <div><span class="status-dot"></span><strong>⚙ Live Artifact Harness: SO-100 Arm</strong></div>
    <span style="font-size:10.5px;color:#34d399;">6-DOF Joint State</span>
  </div>
  <div class="viewport-box">
    <svg width="260" height="125" viewBox="0 0 260 130">
      <defs>
        <linearGradient id="armGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#818cf8"/>
        </linearGradient>
      </defs>
      <line x1="20" y1="115" x2="240" y2="115" stroke="rgba(148,163,184,0.25)" stroke-width="2"/>
      <rect x="45" y="103" width="36" height="12" rx="3" fill="#475569"/>
      <g id="j1" transform="translate(63, 103) rotate(-25)">
        <line x1="0" y1="0" x2="0" y2="-52" stroke="url(#armGrad)" stroke-width="7" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="5" fill="#e2e8f0"/>
        <g id="j2" transform="translate(0, -52) rotate(55)">
          <line x1="0" y1="0" x2="0" y2="-44" stroke="#a855f7" stroke-width="5" stroke-linecap="round"/>
          <circle cx="0" cy="0" r="4" fill="#e2e8f0"/>
          <circle cx="0" cy="-44" r="5" fill="#34d399"/>
        </g>
      </g>
      <rect id="target-cube" x="175" y="95" width="18" height="18" rx="3" fill="rgba(251, 191, 36, 0.85)" stroke="#fef08a" stroke-width="1.5"/>
      <text x="165" y="88" fill="#fbbf24" font-size="9" font-family="monospace">obj_pcb (0.96)</text>
    </svg>
  </div>
  <div class="sliders">
    <div class="slider-row">
      <span class="lbl">Shoulder</span>
      <input type="range" min="-70" max="45" value="-25" data-state-key="shoulderDeg" oninput="
        document.getElementById('j1').setAttribute('transform', 'translate(63, 103) rotate(' + this.value + ')');
        document.getElementById('s1-val').textContent = this.value + '°';
      ">
      <code id="s1-val">-25°</code>
    </div>
    <div class="slider-row">
      <span class="lbl">Elbow</span>
      <input type="range" min="-20" max="110" value="55" data-state-key="elbowDeg" oninput="
        document.getElementById('j2').setAttribute('transform', 'translate(0, -52) rotate(' + this.value + ')');
        document.getElementById('s2-val').textContent = this.value + '°';
      ">
      <code id="s2-val">55°</code>
    </div>
  </div>
</div>`,
      },
      {
        id: "node-spec-a",
        title: "UI Sample A [gpt-6-luna]: Direct-Manipulation HUD",
        kind: "speculative",
        stage: "design",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        x: 1025,
        y: 20,
        width: 390,
        height: 265,
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
          markupNote: "Great inline token sliders; keep this layout",
        },
        html: `<div style="font-family:system-ui,sans-serif;padding:13px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(244,114,182,0.18);color:#f472b6;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">🎨 UI SAMPLE • gpt-6-luna</span>
    <span style="color:#94a3b8;font-size:10.5px;">Jev: 0.89</span>
  </div>
  <div style="background:#0b1120;border:1px solid rgba(56,189,248,0.35);border-radius:8px;padding:9px;margin-bottom:8px;">
    <div style="font-size:12px;font-weight:600;color:#f8fafc;margin-bottom:4px;">Target UI: Zero-Chat Spatial Inspector</div>
    <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;">Sample of the intended inspector HUD with live bounding-box radius controls:</p>
    <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
      <span>Card Radius:</span>
      <input type="range" min="0" max="24" value="12" data-state-key="cornerRadiusPx" style="flex:1;accent-color:#38bdf8;" oninput="document.getElementById('rad-lbl').textContent=this.value+'px'" />
      <code id="rad-lbl" style="color:#38bdf8;">12px</code>
    </div>
  </div>
  <div style="background:rgba(15,23,42,0.75);border:1px dashed rgba(244,114,182,0.35);border-radius:6px;padding:5px 8px;display:flex;gap:6px;align-items:center;">
    <span style="font-size:10px;color:#f472b6;white-space:nowrap;">✎ Markup:</span>
    <input type="text" data-state-key="markupNote" value="Great inline token sliders; keep this layout" style="flex:1;background:transparent;border:none;color:#e2e8f0;font-size:11px;outline:none;" />
  </div>
</div>`,
      },
      {
        id: "node-spec-b",
        title: "UI Sample B [gpt-6.1-terra]: State-Graph Scrubber",
        kind: "speculative",
        stage: "design",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        x: 1025,
        y: 305,
        width: 390,
        height: 265,
        model: "openai/gpt-6.1-terra",
        provider: "chatgpt-gateway",
        harness: "@t3tools/provider-claude",
        arenaMode: true,
        status: "speculative",
        branchTag: "fork-B:gpt-6.1-terra",
        parentId: "node-hydro",
        parentIds: ["node-hydro"],
        jevScore: 0.84,
        state: {
          timelineFps: 60,
          markupNote: "Combine this state scrubber with Sample A",
        },
        html: `<div style="font-family:system-ui,sans-serif;padding:13px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(244,114,182,0.18);color:#f472b6;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">🎨 UI SAMPLE • gpt-6.1-terra</span>
    <span style="color:#94a3b8;font-size:10.5px;">Jev: 0.84</span>
  </div>
  <div style="background:#0b1120;border:1px solid rgba(168,85,247,0.35);border-radius:8px;padding:9px;margin-bottom:8px;">
    <div style="font-size:12px;font-weight:600;color:#f8fafc;margin-bottom:4px;">Target UI: Keyframe &amp; State Scrubber</div>
    <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;">Sample of a timeline scrubber for switching between Idle, Loading, and Live states:</p>
    <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
      <span>FPS Target:</span>
      <input type="range" min="24" max="120" value="60" data-state-key="timelineFps" style="flex:1;accent-color:#c084fc;" oninput="document.getElementById('fps-lbl').textContent=this.value+'fps'" />
      <code id="fps-lbl" style="color:#c084fc;">60fps</code>
    </div>
  </div>
  <div style="background:rgba(15,23,42,0.75);border:1px dashed rgba(244,114,182,0.35);border-radius:6px;padding:5px 8px;display:flex;gap:6px;align-items:center;">
    <span style="font-size:10px;color:#f472b6;white-space:nowrap;">✎ Markup:</span>
    <input type="text" data-state-key="markupNote" value="Combine this state scrubber with Sample A" style="flex:1;background:transparent;border:none;color:#e2e8f0;font-size:11px;outline:none;" />
  </div>
</div>`,
      },
      {
        id: "node-spec-c",
        title: "UI Sample C [gpt-6.1-sol]: Camera + Voice Table",
        kind: "speculative",
        stage: "design",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        x: 1025,
        y: 590,
        width: 390,
        height: 265,
        model: "openai/gpt-6.1-sol",
        provider: "chatgpt-gateway",
        harness: "@t3tools/provider-antigravity",
        arenaMode: true,
        status: "speculative",
        branchTag: "fork-C:gpt-6.1-sol",
        parentId: "node-hydro",
        parentIds: ["node-hydro"],
        jevScore: 0.79,
        state: {
          confidenceThreshold: 0.85,
          markupNote: "Defer overhead camera hardware to v2",
        },
        html: `<div style="font-family:system-ui,sans-serif;padding:13px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(244,114,182,0.18);color:#f472b6;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;">🎨 UI SAMPLE • gpt-6.1-sol</span>
    <span style="color:#94a3b8;font-size:10.5px;">Jev: 0.79</span>
  </div>
  <div style="background:#0b1120;border:1px solid rgba(16,185,129,0.35);border-radius:8px;padding:9px;margin-bottom:8px;">
    <div style="font-size:12px;font-weight:600;color:#f8fafc;margin-bottom:4px;">Target UI: Physical Desk Camera Overlay</div>
    <p style="margin:0 0 6px;color:#94a3b8;font-size:11px;">Sample of an overhead camera projection HUD syncing paper sketches into DOM nodes.</p>
    <div style="font-size:10.5px;color:#6ee7b7;">📷 Feed: /dev/video0 • Whisper VAD Ready</div>
  </div>
  <div style="background:rgba(15,23,42,0.75);border:1px dashed rgba(244,114,182,0.35);border-radius:6px;padding:5px 8px;display:flex;gap:6px;align-items:center;">
    <span style="font-size:10px;color:#f472b6;white-space:nowrap;">✎ Markup:</span>
    <input type="text" data-state-key="markupNote" value="Defer overhead camera hardware to v2" style="flex:1;background:transparent;border:none;color:#e2e8f0;font-size:11px;outline:none;" />
  </div>
</div>`,
      },
    ],
  };
}
