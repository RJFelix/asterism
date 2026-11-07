export function getDefaultCanvasState() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    viewport: { x: 80, y: 60, scale: 0.88 },
    strokes: [],
    edges: [
      {
        id: "edge-1",
        from: "node-brief",
        to: "node-hydro",
        label: "Workflow DSL -> Fork"
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
        label: "Fork B: Tactical Console"
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
        title: "Design Brief: Collaborative UI/UX & Speculative Studio",
        kind: "brief",
        x: 40,
        y: 60,
        width: 390,
        height: 360,
        model: "openai/gpt-6-luna",
        status: "ready",
        branchTag: "root",
        html: `<div class="surface-root">
  <style>
    .surface-root {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #e2e8f0;
      padding: 16px;
      line-height: 1.45;
      font-size: 13px;
    }
    .badge-row { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
    .badge {
      font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
      padding: 3px 8px; border-radius: 999px; background: rgba(56, 189, 248, 0.14);
      color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);
    }
    h3 { margin: 0 0 8px; font-size: 15px; color: #f8fafc; }
    p { margin: 0 0 10px; color: #94a3b8; }
    .goal-list {
      display: grid; gap: 8px; margin: 12px 0;
    }
    .goal-item {
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 8px; padding: 9px 11px;
    }
    .goal-item strong { color: #e2e8f0; display: block; margin-bottom: 2px; font-size: 12px; }
    .goal-item span { color: #94a3b8; font-size: 11.5px; }
    .cta-btn {
      width: 100%; margin-top: 6px; padding: 8px 12px; border-radius: 7px;
      border: 1px solid rgba(168, 85, 247, 0.45);
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(59, 130, 246, 0.25));
      color: #f3e8ff; font-weight: 600; font-size: 12px; cursor: pointer;
    }
    .cta-btn:hover { background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(59, 130, 246, 0.4)); }
  </style>
  <div class="badge-row">
    <span class="badge">Malleable HTML Session</span>
    <span class="badge">Root Context</span>
  </div>
  <h3>Rethinking Agent + Human UI/UX</h3>
  <p>Instead of a linear text scrollback, every node on this canvas is a live, malleable HTML application that both you and agents can mutate in place or fork speculatively.</p>
  <div class="goal-list">
    <div class="goal-item">
      <strong>1. Mutate Any Surface Live</strong>
      <span>Use the prompt bar at the bottom of any card (or click Inspect) to ask an agent to redesign or add interactive tools to that card's DOM.</span>
    </div>
    <div class="goal-item">
      <strong>2. Speculative Forking (Hydro DSL)</strong>
      <span>Click <em>Speculate (3x)</em> on any node to anticipate 3 distinct design/action directions in parallel and compare them side-by-side.</span>
    </div>
  </div>
  <button class="cta-btn" onclick="window.parent.postMessage({type:'asterism:trigger-speculate', nodeId:'node-brief', prompt:'Explore 3 radically different UI/UX design tools for co-designing interfaces with an agent'}, '*')">
    ⚡ Fork 3 Speculative Co-Design Surfaces
  </button>
</div>`
      },
      {
        id: "node-hydro",
        title: "Hydro Workflow & Jev Evaluator",
        kind: "workflow",
        x: 500,
        y: 60,
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
    <span class="hdr-title">do-notation :: Workflow UIVariant</span>
    <span class="pill" id="hydro-state">Forked 3 Branches</span>
  </div>
  <div class="step">
    <div class="step-top">
      <span><span class="kw">Intent</span> "Anticipate operator UI preference"</span>
      <span class="cost-free">0 tokens</span>
    </div>
    <div class="desc">Instead of blocking on <code>Ask</code>, fork the canvas into 3 concrete interactive surfaces.</div>
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
      <span class="cost-jev" id="jev-label">Jev • p = 0.84</span>
    </div>
    <div class="desc">Fast small model scores layout density, interaction ergonomics, and accessibility.</div>
    <div class="prob-bar"><div class="prob-fill" id="jev-bar" style="width: 84%"></div></div>
  </div>
  <div class="controls">
    <button class="btn" onclick="
      const p = (0.65 + Math.random()*0.32).toFixed(2);
      document.getElementById('jev-label').textContent = 'Jev • p = ' + p;
      document.getElementById('jev-bar').style.width = (p*100) + '%';
      document.getElementById('hydro-state').textContent = p >= 0.75 ? 'Pass >= 0.75' : 'Abstain / Ask User';
    ">Re-run Jev Calibration</button>
  </div>
</div>`
      },
      {
        id: "node-robotics",
        title: "Physical World: Desk Arm & Depth Sensor",
        kind: "robotics",
        x: 40,
        y: 460,
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
        x: 1010,
        y: 30,
        width: 360,
        height: 255,
        model: "openai/gpt-6-luna",
        status: "speculative",
        branchTag: "fork-A",
        parentId: "node-hydro",
        html: `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(56,189,248,0.18);color:#38bdf8;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">SPECULATIVE FORK A</span>
    <span style="color:#94a3b8;font-size:11px;">Jev Score: 0.89</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">Zero-Chat Spatial Inspector</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Overlays bounding-box handles and inline CSS/token sliders directly onto live components.</p>
  <div style="background:rgba(15,23,42,0.8);border:1px dashed rgba(56,189,248,0.45);border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:11px;color:#38bdf8;font-family:monospace;">&lt;Card radius="12px" /&gt;</div>
      <div style="font-size:10px;color:#64748b;">Drag handles to resize &amp; restyle</div>
    </div>
    <button onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'node-spec-a'}, '*')" style="background:#0284c7;color:white;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✓ Keep Fork A</button>
  </div>
</div>`
      },
      {
        id: "node-spec-b",
        title: "Branch B: Keyframe & Constraint Timeline",
        kind: "speculative",
        x: 1010,
        y: 310,
        width: 360,
        height: 255,
        model: "openai/gpt-6-luna",
        status: "speculative",
        branchTag: "fork-B",
        parentId: "node-hydro",
        html: `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(168,85,247,0.18);color:#c084fc;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">SPECULATIVE FORK B</span>
    <span style="color:#94a3b8;font-size:11px;">Jev Score: 0.82</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">State-Graph &amp; Motion Scrubbing</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Treats UI/UX as a state machine with scrubbable transitions between empty, loading, error, and populated states.</p>
  <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(168,85,247,0.35);border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;gap:4px;">
      <span style="padding:3px 6px;background:#3b0764;color:#e9d5ff;border-radius:4px;font-size:10px;">Idle</span>
      <span style="color:#64748b;">→</span>
      <span style="padding:3px 6px;background:#581c87;color:#f3e8ff;border-radius:4px;font-size:10px;">Streaming</span>
      <span style="color:#64748b;">→</span>
      <span style="padding:3px 6px;background:#1e293b;color:#94a3b8;border-radius:4px;font-size:10px;">Done</span>
    </div>
    <button onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'node-spec-b'}, '*')" style="background:#7e22ce;color:white;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✓ Keep Fork B</button>
  </div>
</div>`
      },
      {
        id: "node-spec-c",
        title: "Branch C: Embodied Sketch + Voice Table",
        kind: "speculative",
        x: 1010,
        y: 590,
        width: 360,
        height: 255,
        model: "openai/gpt-6-luna",
        status: "speculative",
        branchTag: "fork-C",
        parentId: "node-hydro",
        html: `<div style="font-family:system-ui,sans-serif;padding:14px;color:#e2e8f0;font-size:12px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <span style="background:rgba(16,185,129,0.18);color:#34d399;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;">SPECULATIVE FORK C</span>
    <span style="color:#94a3b8;font-size:11px;">Jev Score: 0.77</span>
  </div>
  <h4 style="margin:0 0 6px;font-size:14px;">Physical Camera + Paper Sketch Sync</h4>
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Uses overhead desk camera + Whisper voice stream to turn pen-and-paper wireframes into live DOM surfaces.</p>
  <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(16,185,129,0.35);border-radius:8px;padding:10px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:10.5px;color:#6ee7b7;">📷 Overhead Cam + Whisper Ready</div>
    <button onclick="window.parent.postMessage({type:'asterism:commit-branch', nodeId:'node-spec-c'}, '*')" style="background:#059669;color:white;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✓ Keep Fork C</button>
  </div>
</div>`
      }
    ]
  };
}
