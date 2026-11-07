export const INNOVATION_STAGES = [
  { id: "note", label: "1. Note", icon: "✎", color: "#94a3b8", next: "brainstorm", nextLabel: "Advance → Brainstorm (3x)" },
  { id: "brainstorm", label: "2. Brainstorm", icon: "⚡", color: "#c084fc", next: "refine", nextLabel: "Advance → Refine Spec" },
  { id: "refine", label: "3. Refine", icon: "◈", color: "#38bdf8", next: "design", nextLabel: "Advance → Interactive Design" },
  { id: "design", label: "4. Design", icon: "❖", color: "#fbbf24", next: "implement", nextLabel: "Advance → Implementation" },
  { id: "implement", label: "5. Implement", icon: "⚙", color: "#34d399", next: "refine", nextLabel: "Spawn Next Iteration" }
];

export function getDefaultCanvasState() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    viewport: { x: 70, y: 55, scale: 0.85 },
    strokes: [],
    edges: [
      {
        id: "edge-1",
        from: "node-brief",
        to: "node-hydro",
        label: "Advance → Refine DSL"
      },
      {
        id: "edge-2",
        from: "node-hydro",
        to: "node-spec-a",
        label: "Fork A: Spatial HUD"
      },
      {
        id: "edge-3",
        from: "node-hydro",
        to: "node-spec-b",
        label: "Fork B: State Scrubber"
      },
      {
        id: "edge-4",
        from: "node-hydro",
        to: "node-spec-c",
        label: "Fork C: Physical + Voice"
      },
      {
        id: "edge-5",
        from: "node-robotics",
        to: "node-hydro",
        label: "Sensor telemetry"
      }
    ],
    nodes: [
      {
        id: "node-brief",
        title: "Seed Note: The Innovation Train",
        kind: "brief",
        stage: "note",
        x: 30,
        y: 50,
        width: 390,
        height: 375,
        model: "openai/gpt-6-luna",
        status: "ready",
        branchTag: "seed-note",
        html: `<div class="surface-root">
  <style>
    .surface-root {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #e2e8f0;
      padding: 15px;
      line-height: 1.45;
      font-size: 12.5px;
    }
    .train-track {
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; font-size: 10.5px;
    }
    .station { display: flex; flex-direction: column; align-items: center; gap: 3px; color: #94a3b8; }
    .station.active { color: #38bdf8; font-weight: 700; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    h3 { margin: 0 0 6px; font-size: 14.5px; color: #f8fafc; }
    p { margin: 0 0 10px; color: #94a3b8; }
    .goal-list { display: grid; gap: 7px; margin: 10px 0; }
    .goal-item {
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 8px; padding: 8px 10px;
    }
    .goal-item strong { color: #e2e8f0; display: block; margin-bottom: 2px; font-size: 11.5px; }
    .goal-item span { color: #94a3b8; font-size: 11px; }
    .cta-row { display: flex; gap: 6px; margin-top: 8px; }
    .cta-btn {
      flex: 1; padding: 7px 10px; border-radius: 7px;
      border: 1px solid rgba(168, 85, 247, 0.45);
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(59, 130, 246, 0.25));
      color: #f3e8ff; font-weight: 600; font-size: 11.5px; cursor: pointer;
    }
    .cta-btn:hover { background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(59, 130, 246, 0.4)); }
  </style>
  <div class="train-track">
    <div class="station active"><span class="dot"></span>Note</div>
    <span>→</span>
    <div class="station"><span class="dot"></span>Brainstorm</div>
    <span>→</span>
    <div class="station"><span class="dot"></span>Refine</div>
    <span>→</span>
    <div class="station"><span class="dot"></span>Design</div>
    <span>→</span>
    <div class="station"><span class="dot"></span>Implement</div>
  </div>
  <h3>Continuous Innovation Train</h3>
  <p>Every node sits on a continuous pipeline from raw thought to running code. Keep <strong>as many speculative forks as you want</strong>—each kept fork becomes its own parallel train car that can advance to the next stage.</p>
  <div class="goal-list">
    <div class="goal-item">
      <strong>Keep Multiple Forks &amp; Synthesize</strong>
      <span>Click <em>✓ Keep Fork</em> on any number of branches without destroying siblings, or <em>⊕ Synthesize Kept</em> to merge two kept designs into a hybrid child.</span>
    </div>
    <div class="goal-item">
      <strong>Advance Stage (→)</strong>
      <span>Click the stage button on any card header to spawn a downstream node for the next phase (Brainstorm → Refine → Design → Implement).</span>
    </div>
  </div>
  <div class="cta-row">
    <button class="cta-btn" onclick="window.parent.postMessage({type:'asterism:advance-stage', nodeId:'node-brief'}, '*')">
      🚂 Advance Note → Next Stage
    </button>
  </div>
</div>`
      },
      {
        id: "node-hydro",
        title: "Hydro Workflow & Jev Evaluator",
        kind: "workflow",
        stage: "refine",
        x: 495,
        y: 50,
        width: 430,
        height: 390,
        model: "openai/gpt-6-luna",
        status: "ready",
        branchTag: "dsl-core",
        html: `<div class="hydro-root">
  <style>
    .hydro-root {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      color: #e2e8f0; padding: 14px; font-size: 12px;
    }
    .hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .hdr-title { font-weight: 700; color: #38bdf8; font-size: 12.5px; }
    .pill {
      padding: 2px 8px; border-radius: 99px; font-size: 10px;
      background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .step {
      background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 7px; padding: 8px 10px; margin-bottom: 8px;
    }
    .step-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .kw { color: #c084fc; font-weight: 700; }
    .cost-free { color: #34d399; font-size: 10.5px; }
    .cost-jev { color: #fbbf24; font-size: 10.5px; }
    .desc { color: #94a3b8; font-family: system-ui, sans-serif; font-size: 11.5px; }
    .prob-bar {
      height: 6px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-top: 6px;
    }
    .prob-fill { height: 100%; background: linear-gradient(90deg, #38bdf8, #a855f7); transition: width 0.3s; }
    .controls { display: flex; gap: 6px; margin-top: 10px; }
    .btn {
      flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(148,163,184,0.25);
      background: rgba(30, 41, 59, 0.8); color: #e2e8f0; cursor: pointer; font-size: 11px;
    }
    .btn:hover { border-color: #38bdf8; color: #38bdf8; }
  </style>
  <div class="hdr">
    <span class="hdr-title">do-notation :: Workflow [UIVariant]</span>
    <span class="pill" id="hydro-state">Multi-Fork Active</span>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">Intent</span> "Fan out speculative UI branches"</span>
      <span class="cost-free">0 tokens</span>
    </div>
    <div class="desc">Keep 1, 2, or all 3 branches alive simultaneously as independent innovation tracks.</div>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">PCheck</span> (ExitZero domRenderCheck)</span>
      <span class="cost-free">CheckSpec • Free</span>
    </div>
    <div class="desc">Local deterministic check verifies HTML/JS sandbox mounts cleanly with 0 console errors.</div>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">PJudge</span> (LastN 3) QChoice</span>
      <span class="cost-jev" id="jev-label">Jev • p = 0.86</span>
    </div>
    <div class="desc">Fast small model scores layout density, interaction ergonomics, and accessibility.</div>
    <div class="prob-bar"><div class="prob-fill" id="jev-bar" style="width: 86%"></div></div>
  </div>
  <div class="controls">
    <button class="btn" onclick="
      const p = (0.65 + Math.random()*0.32).toFixed(2);
      document.getElementById('jev-label').textContent = 'Jev • p = ' + p;
      document.getElementById('jev-bar').style.width = (p*100) + '%';
      document.getElementById('hydro-state').textContent = p >= 0.75 ? 'Pass >= 0.75' : 'Abstain / Ask User';
    ">Re-run Jev Calibration</button>
    <button class="btn" onclick="window.parent.postMessage({type:'asterism:prune-unkept', parentId:'node-hydro'}, '*')">
      ✂ Prune Unkept Forks
    </button>
  </div>
</div>`
      },
      {
        id: "node-robotics",
        title: "Physical World: Desk Arm & Depth Sensor",
        kind: "robotics",
        stage: "implement",
        x: 30,
        y: 465,
        width: 390,
        height: 330,
        model: "openai/gpt-6-luna",
        status: "ready",
        branchTag: "hardware-node",
        html: `<div class="robo-root">
  <style>
    .robo-root {
      font-family: system-ui, -apple-system, sans-serif; color: #e2e8f0; padding: 14px; font-size: 12px;
    }
    .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; margin-right: 6px; box-shadow: 0 0 8px #10b981; }
    .viewport-box {
      background: radial-gradient(circle at 50% 40%, #1e293b, #090d16);
      border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px;
      height: 145px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;
    }
    .sliders { display: grid; gap: 6px; margin-top: 10px; }
    .slider-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #94a3b8; }
    .slider-row span.lbl { width: 65px; }
    .slider-row input { flex: 1; accent-color: #38bdf8; }
    .slider-row code { width: 42px; text-align: right; color: #38bdf8; }
  </style>
  <div class="top-bar">
    <div><span class="status-dot"></span><strong>SO-100 Follower Arm</strong> (6-DOF)</div>
    <span style="font-size:11px;color:#38bdf8;" id="gripper-readout">Gripper: Open</span>
  </div>
  <div class="viewport-box">
    <svg width="260" height="130" viewBox="0 0 260 130">
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
      <input type="range" min="-70" max="45" value="-25" oninput="
        document.getElementById('j1').setAttribute('transform', 'translate(63, 103) rotate(' + this.value + ')');
        document.getElementById('s1-val').textContent = this.value + '°';
      ">
      <code id="s1-val">-25°</code>
    </div>
    <div class="slider-row">
      <span class="lbl">Elbow</span>
      <input type="range" min="-20" max="110" value="55" oninput="
        document.getElementById('j2').setAttribute('transform', 'translate(0, -52) rotate(' + this.value + ')');
        document.getElementById('s2-val').textContent = this.value + '°';
      ">
      <code id="s2-val">55°</code>
    </div>
  </div>
</div>`
      },
      {
        id: "node-spec-a",
        title: "Branch A: Spatial Direct-Manipulation HUD",
        kind: "speculative",
        stage: "design",
        x: 1010,
        y: 25,
        width: 370,
        height: 265,
        model: "openai/gpt-6-luna",
        status: "speculative",
        branchTag: "fork-A",
        parentId: "node-hydro",
        jevScore: 0.89,
        html: `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(56,189,248,0.18);color:#38bdf8;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">SPECULATIVE FORK A</span>
    <span style="color:#94a3b8;font-size:11px;">Jev Score: 0.89</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">Zero-Chat Spatial Inspector</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Overlays bounding-box handles and inline CSS/token sliders directly onto live components.</p>
  <div style="background:rgba(15,23,42,0.8);border:1px dashed rgba(56,189,248,0.45);border-radius:8px;padding:9px;display:flex;justify-content:space-between;align-items:center;gap:6px;">
    <div>
      <div style="font-size:11px;color:#38bdf8;font-family:monospace;">&lt;Card radius="12px" /&gt;</div>
      <div style="font-size:10px;color:#64748b;">Keep multiple forks &amp; advance</div>
    </div>
    <div style="display:flex;gap:5px;">
      <button onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'node-spec-a'}, '*')" style="background:#0284c7;color:white;border:none;padding:6px 9px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✓ Keep Fork</button>
      <button onclick="window.parent.postMessage({type:'asterism:advance-stage', nodeId:'node-spec-a'}, '*')" style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);padding:6px 9px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🚂 Implement →</button>
    </div>
  </div>
</div>`
      },
      {
        id: "node-spec-b",
        title: "Branch B: Keyframe & Constraint Timeline",
        kind: "speculative",
        stage: "design",
        x: 1010,
        y: 310,
        width: 370,
        height: 265,
        model: "openai/gpt-6-luna",
        status: "speculative",
        branchTag: "fork-B",
        parentId: "node-hydro",
        jevScore: 0.82,
        html: `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(168,85,247,0.18);color:#c084fc;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">SPECULATIVE FORK B</span>
    <span style="color:#94a3b8;font-size:11px;">Jev Score: 0.82</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">State-Graph &amp; Motion Scrubbing</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Treats UI/UX as a state machine with scrubbable transitions between empty, loading, error, and populated states.</p>
  <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(168,85,247,0.35);border-radius:8px;padding:9px;display:flex;justify-content:space-between;align-items:center;gap:6px;">
    <div style="display:flex;gap:4px;align-items:center;">
      <span style="padding:3px 5px;background:#3b0764;color:#e9d5ff;border-radius:4px;font-size:10px;">Idle</span>
      <span style="color:#64748b;">→</span>
      <span style="padding:3px 5px;background:#581c87;color:#f3e8ff;border-radius:4px;font-size:10px;">Live</span>
    </div>
    <div style="display:flex;gap:5px;">
      <button onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'node-spec-b'}, '*')" style="background:#7e22ce;color:white;border:none;padding:6px 9px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✓ Keep Fork</button>
      <button onclick="window.parent.postMessage({type:'asterism:advance-stage', nodeId:'node-spec-b'}, '*')" style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);padding:6px 9px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🚂 Implement →</button>
    </div>
  </div>
</div>`
      },
      {
        id: "node-spec-c",
        title: "Branch C: Embodied Sketch + Voice Table",
        kind: "speculative",
        stage: "design",
        x: 1010,
        y: 595,
        width: 370,
        height: 265,
        model: "openai/gpt-6-luna",
        status: "speculative",
        branchTag: "fork-C",
        parentId: "node-hydro",
        jevScore: 0.77,
        html: `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(16,185,129,0.18);color:#34d399;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">SPECULATIVE FORK C</span>
    <span style="color:#94a3b8;font-size:11px;">Jev Score: 0.77</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">Physical Camera + Paper Sketch Sync</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Uses overhead desk camera + Whisper voice stream to turn pen-and-paper wireframes into live DOM surfaces.</p>
  <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(16,185,129,0.35);border-radius:8px;padding:9px;display:flex;justify-content:space-between;align-items:center;gap:6px;">
    <div style="font-size:10.5px;color:#6ee7b7;">📷 Overhead Cam</div>
    <div style="display:flex;gap:5px;">
      <button onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'node-spec-c'}, '*')" style="background:#059669;color:white;border:none;padding:6px 9px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✓ Keep Fork</button>
      <button onclick="window.parent.postMessage({type:'asterism:advance-stage', nodeId:'node-spec-c'}, '*')" style="background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.4);padding:6px 9px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🚂 Implement →</button>
    </div>
  </div>
</div>`
      }
    ]
  };
}
