import { createDefaultUserModel } from "@asterism/core";

export const INNOVATION_STAGES = [
  { id: "note", label: "1. Note", icon: "✎", color: "#94a3b8", next: "brainstorm", nextLabel: "Advance → Brainstorm" },
  { id: "brainstorm", label: "2. Brainstorm", icon: "⚡", color: "#c084fc", next: "refine", nextLabel: "Advance → Refine Spec" },
  { id: "refine", label: "3. Refine", icon: "◈", color: "#38bdf8", next: "design", nextLabel: "Advance → Interactive Design" },
  { id: "design", label: "4. Design", icon: "❖", color: "#f472b6", next: "implement", nextLabel: "Advance → Implementation" },
  { id: "implement", label: "5. Implement", icon: "⚙", color: "#34d399", next: "refine", nextLabel: "Spawn Next Iteration" },
];

const THESIS_DIALOGUE_HTML = `<div class="surface-root">
  <style>
    .surface-root {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #e2e8f0; padding: 14px 16px; line-height: 1.5; font-size: 12px;
    }
    p { margin: 0 0 11px; color: #94a3b8; font-size: 11.5px; }
    .control-group {
      background: rgba(15, 23, 42, 0.58); border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 8px; padding: 10px 12px; margin-bottom: 11px;
    }
    .row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11.5px; color: #cbd5e1; }
    .primary-btn {
      width: 100%; padding: 7px 10px; border-radius: 6px; font-size: 11px; font-weight: 500; cursor: pointer;
      border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(56, 189, 248, 0.1); color: #e0f2fe;
    }
  </style>
  <p>Asterism develops Asterism: resting cards stay zero-chrome, reversible hypotheses co-fork on basal compute, and <strong>Polaris</strong> (<code>⌘J</code>) stewards live code &amp; T3 subagents from the right rail.</p>
  <div class="control-group">
    <div class="row">
      <span>Upstream Edit Policy</span>
      <select data-state-key="autonomyLevel" style="background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.22);border-radius:5px;padding:3px 7px;font-size:11px;">
        <option value="co-pilot">Branch New Future (v+1)</option>
        <option value="autonomous">Update In-Place</option>
      </select>
    </div>
    <label style="display:flex;align-items:center;gap:7px;font-size:11px;color:#94a3b8;cursor:pointer;">
      <input type="checkbox" checked data-state-key="spawnCompanionUiAutomatically" style="accent-color:#38bdf8;" />
      <span>Preserve active downstream worktrees on upstream edits</span>
    </label>
  </div>
  <button class="primary-btn" onclick="window.parent.postMessage({type:'asterism:open-polaris',focusNodeId:'node-asterism-thesis'},'*')">
    ✦ Ask Polaris About Next Iteration
  </button>
</div>`;

const THESIS_SPEC_HTML = `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">
  <div style="background:rgba(15,23,42,0.58);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
    <div style="color:#e2e8f0;font-weight:600;margin-bottom:2px;font-size:11.5px;">1. Calm Zero-Chrome Canvas</div>
    <div style="color:#94a3b8;font-size:11px;">Resting cards expose only title + interactive HTML; <code>Chat · Spec · UI · Code</code> facets &amp; actions reveal only on focus.</div>
  </div>
  <div style="background:rgba(15,23,42,0.58);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:10px 12px;">
    <div style="color:#e2e8f0;font-weight:600;margin-bottom:2px;font-size:11.5px;">2. Guided Self-Hosting Loop</div>
    <div style="color:#94a3b8;font-size:11px;">Polaris dispatches Gemini/Muse/Codex workers via T3 and promotes verified edits via <code>bin/asterism self-deploy</code>.</div>
  </div>
</div>`;

const THESIS_UI_HTML = `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Attentional altitude controls interruption cost: zoomed-in focus lowers ask threshold; constellation view raises it.</p>
  <div style="background:rgba(15,23,42,0.58);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:10px 12px;display:flex;gap:8px;align-items:center;">
    <span style="font-size:11px;color:#cbd5e1;">Max Co-Forks</span>
    <input type="range" min="2" max="5" value="3" data-state-key="maxParallelForks" style="flex:1;accent-color:#38bdf8;" />
  </div>
</div>`;

const THESIS_CODE_HTML = `<div style="font-family:'JetBrains Mono',ui-monospace,monospace;padding:14px 16px;color:#e2e8f0;font-size:11px;">
  <pre style="background:rgba(2,6,23,0.65);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:10px;color:#cbd5e1;overflow:auto;font-size:10.5px;line-height:1.45;margin:0;">// bin/asterism self-deploy pipeline:
// 1. snapshot data/canvas-state.json -> data/snapshots/
// 2. self-check: node --check + HTML script parse + node --test
// 3. systemctl --user restart asterism.service
// 4. poll /api/health (rollback git SHA automatically on failure)</pre>
</div>`;

export function getDefaultCanvasState() {
  return {
    version: 6,
    updatedAt: new Date().toISOString(),
    activeProjectId: "proj-misc-attic",
    projects: [
      {
        id: "proj-misc-attic",
        name: "asterism (unblocked misc)",
        repoPath: "/home/exedev/agent-attic/repos/asterism",
        isDefaultMisc: true,
        description: "Default unblocked workspace — ideas and worktrees never stall waiting for a repository prompt.",
      },
      {
        id: "proj-asterism",
        name: "asterism",
        repoPath: "/home/exedev/agent-attic/repos/asterism",
        t3ProjectId: "mcp:c689f1ee-f91e-4b5a-bc12-a5922a4f5772",
        isDefaultMisc: false,
        description: "Asterism spatial canvas, power-set decision compiler, and Polaris self-hosting runtime.",
      },
      {
        id: "proj-agent-attic",
        name: "agent-attic",
        repoPath: "/home/exedev/agent-attic",
        t3ProjectId: "e5058a16-9afd-4ecb-9912-ce1f73e10162",
        isDefaultMisc: false,
        description: "Top-level agent-attic workspace, shared skills (ideonomy), and cross-repo knowledge base.",
      },
      {
        id: "proj-hydro",
        name: "hydro",
        repoPath: "/home/exedev/agent-attic/repos/hydro",
        t3ProjectId: "mcp:e11370f9-654e-41ac-8953-5ab16d71423f",
        isDefaultMisc: false,
        description: "Hydro workflow algebra & typed effect combinators.",
      },
      {
        id: "proj-intuit",
        name: "intuit",
        repoPath: "/home/exedev/agent-attic/repos/intuit",
        t3ProjectId: "mcp:4ac33d6e-59b7-4ae2-ba9c-c3638497f311",
        isDefaultMisc: false,
        description: "Intuit research & interface experiments.",
      },
      {
        id: "proj-t3code",
        name: "t3code",
        repoPath: "/home/exedev/agent-attic/repos/t3code",
        t3ProjectId: "mcp:24ad2052-81b2-44dd-8fed-fdaf55fc51bf",
        isDefaultMisc: false,
        description: "T3 Code multi-provider harness runtime (Antigravity, Codex, Muse, Claude).",
      },
    ],
    viewProjection: "canvas",
    plexFocusNodeId: "node-ergodic-algebra",
    userModel: createDefaultUserModel(),
    viewport: { x: 65, y: 55, scale: 0.88 },
    strokes: [],
    edges: [
      {
        id: "edge-1",
        from: "node-asterism-thesis",
        to: "node-ergodic-algebra",
        relation: "specifies",
        kind: "specifies",
        label: "📐 specifies",
      },
      {
        id: "edge-2",
        from: "node-ergodic-algebra",
        to: "node-fork-polaris-ux",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 roadmap A",
      },
      {
        id: "edge-3",
        from: "node-ergodic-algebra",
        to: "node-fork-feature-tenders",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 roadmap B",
      },
      {
        id: "edge-4",
        from: "node-ergodic-algebra",
        to: "node-fork-ui-critique",
        relation: "visualizes-ui",
        kind: "visualizes-ui",
        label: "🎨 roadmap C",
      },
      {
        id: "edge-5",
        from: "node-t3-self-host",
        to: "node-ergodic-algebra",
        relation: "implements",
        kind: "implements",
        label: "⚙ implements",
      },
    ],
    nodes: [
      {
        id: "node-asterism-thesis",
        title: "Asterism: Guided Self-Improving Workspace",
        kind: "brief",
        stage: "note",
        stratum: "intent",
        surfaceRole: "dialogue",
        commitment: "committed",
        warrant: {
          _tag: "Judged",
          pass: 0.92,
          abstain: 0.04,
          statement: "Core self-hosting workspace intent & zero-chrome steward posture",
        },
        energy: {
          remainingTokens: 3600,
          maxDepth: 5,
          remainingWorktreeLeases: 2,
          basalRechargedTokens: 600,
        },
        x: 30,
        y: 40,
        width: 390,
        height: 275,
        model: "antigravity/gemini-4-neon",
        provider: "antigravity",
        harness: "@t3tools/provider-antigravity",
        status: "ready",
        branchTag: "self-host-intent",
        state: {
          autonomyLevel: "co-pilot",
          spawnCompanionUiAutomatically: true,
          maxParallelForks: 3,
        },
        facets: {
          dialogue: THESIS_DIALOGUE_HTML,
          "spec-diagram": THESIS_SPEC_HTML,
          "ui-prototype": THESIS_UI_HTML,
          "artifact-harness": THESIS_CODE_HTML,
        },
        html: THESIS_DIALOGUE_HTML,
      },
      {
        id: "node-ergodic-algebra",
        title: "Power-Set VOI & Ergodic Reachability Spec",
        kind: "workflow",
        stage: "refine",
        stratum: "spec",
        surfaceRole: "spec-diagram",
        relationFromParent: "specifies",
        commitment: "committed",
        warrant: {
          _tag: "Checked",
          checkSpec: "packages/asterism-core/src/user-model.ts",
          passed: true,
        },
        energy: {
          remainingTokens: 2800,
          maxDepth: 4,
          remainingWorktreeLeases: 2,
          basalRechargedTokens: 450,
        },
        x: 485,
        y: 40,
        width: 400,
        height: 275,
        model: "antigravity/gemini-4-carbon",
        provider: "antigravity",
        harness: "@t3tools/provider-antigravity",
        status: "ready",
        branchTag: "power-set-spec",
        state: {
          basalFloorTokensPerTick: 2400,
          allowMultiParentSynthesis: true,
          probeWithoutAnchoring: true,
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;color:#e2e8f0;padding:14px 16px;font-size:12px;line-height:1.5;">
  <p style="margin:0 0 10px;color:#94a3b8;font-size:11.5px;">Evaluates full power set <code>P(A)</code> (<code>{A}</code>, <code>{B}</code>, <code>{Both}</code>, <code>∅</code>) under path-vs-state equivalence (<code>LRR ≡ R</code>) and sealed Brier calibration.</p>
  <div style="background:rgba(15,23,42,0.58);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:9px 12px;margin-bottom:11px;display:grid;gap:6px;font-size:11px;">
    <div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">Reachability</span><span style="color:#6ee7b7;font-family:ui-monospace,monospace;">ergodic vs. sink</span></div>
    <div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">Policy Regimes</span><span style="color:#94a3b8;font-family:ui-monospace,monospace;">co-fork · act · ∅ · ask · probe</span></div>
    <div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">Calibration Audit</span><span style="color:#94a3b8;font-family:ui-monospace,monospace;">unanchored pre-prediction</span></div>
  </div>
  <button onclick="window.asterism.openComparisonMatrix()" style="width:100%;padding:7px 10px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;border:1px solid rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);color:#e0f2fe;">Compare 3 Active Roadmap Branches</button>
</div>`,
      },
      {
        id: "node-t3-self-host",
        title: "T3 Harness Bridge & Self-Deploy Guardrails",
        kind: "artifact",
        stage: "implement",
        stratum: "world",
        surfaceRole: "artifact-harness",
        commitment: "committed",
        warrant: {
          _tag: "Checked",
          checkSpec: "bin/asterism self-check && T3 /mcp OAuth",
          passed: true,
        },
        energy: {
          remainingTokens: 3200,
          maxDepth: 4,
          remainingWorktreeLeases: 2,
          basalRechargedTokens: 800,
        },
        x: 30,
        y: 355,
        width: 390,
        height: 270,
        model: "codex/gpt-6.2-sol",
        provider: "codex",
        harness: "@t3tools/provider-codex",
        status: "ready",
        branchTag: "t3-self-deploy",
        state: {
          preferQuotaProviders: "antigravity,muse,codex",
          healthcheckTimeoutSec: 15,
          autoRollbackOnFailure: true,
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;color:#e2e8f0;padding:14px 16px;font-size:12px;line-height:1.48;">
  <p style="margin:0 0 9px;color:#94a3b8;font-size:11.5px;">Live Streamable-HTTP MCP bridge to T3 Code (<code>127.0.0.1:3773</code>) + atomic <code>asterism.service</code> self-deploy with automatic rollback.</p>
  <div style="background:rgba(9,13,22,0.78);border:1px solid rgba(148,163,184,0.16);border-radius:8px;padding:9px 11px;margin-bottom:10px;font-family:ui-monospace,monospace;font-size:10.5px;color:#cbd5e1;display:grid;gap:5px;">
    <div style="display:flex;justify-content:space-between;"><span>Steward Default</span><span style="color:#38bdf8;">antigravity/gemini-4-neon</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Worker Pool</span><span style="color:#34d399;">Gemini · Muse · GPT-6.2</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Guardrail CLI</span><span style="color:#cbd5e1;">bin/asterism self-deploy</span></div>
  </div>
  <label style="display:flex;align-items:center;gap:7px;font-size:11px;color:#94a3b8;cursor:pointer;">
    <input type="checkbox" checked data-state-key="autoRollbackOnFailure" style="accent-color:#34d399;" />
    <span>Rollback git SHA automatically if <code>/api/health</code> fails</span>
  </label>
</div>`,
      },
      {
        id: "node-fork-polaris-ux",
        title: "Next Step A: Polaris Peripheral Steward Rail",
        kind: "speculative",
        stage: "design",
        stratum: "prototype",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        commitment: "speculative",
        warrant: {
          _tag: "Judged",
          pass: 0.9,
          abstain: 0.05,
          statement: "Calm right-rail steward with live focused-card awareness",
        },
        energy: {
          remainingTokens: 1500,
          maxDepth: 3,
          remainingWorktreeLeases: 1,
          basalRechargedTokens: 0,
        },
        x: 955,
        y: 25,
        width: 385,
        height: 210,
        model: "antigravity/gemini-4-neon",
        provider: "antigravity",
        harness: "@t3tools/provider-antigravity",
        arenaMode: true,
        status: "speculative",
        branchTag: "roadmap-A:gemini-4-neon",
        parentId: "node-ergodic-algebra",
        parentIds: ["node-ergodic-algebra"],
        jevScore: 0.9,
        state: {
          railWidthPx: 380,
          autoAttachFocusedCard: true,
          markupNote: "Keep Polaris docked & collapsible (⌘J) so spatial cards stay primary.",
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.45;">
  <p style="margin:0 0 9px;color:#94a3b8;font-size:11.5px;">Docked right-rail steward streaming T3 thread activity &amp; auto-binding the focused card without modal interruption.</p>
  <div style="background:rgba(15,23,42,0.58);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:8px 11px;margin-bottom:8px;display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
    <span>Rail Width</span>
    <input type="range" min="320" max="480" value="380" data-state-key="railWidthPx" style="flex:1;accent-color:#38bdf8;" oninput="document.getElementById('pol-w-lbl').textContent=this.value+'px'" />
    <code id="pol-w-lbl" style="color:#94a3b8;">380px</code>
  </div>
  <input type="text" data-state-key="markupNote" value="Keep Polaris docked &amp; collapsible (⌘J) so spatial cards stay primary." style="width:100%;background:rgba(15,23,42,0.4);border:1px solid rgba(148,163,184,0.14);border-radius:6px;padding:5px 8px;color:#94a3b8;font-size:11px;outline:none;" />
</div>`,
      },
      {
        id: "node-fork-feature-tenders",
        title: "Next Step B: Worktree Feature Tenders & Promotion",
        kind: "speculative",
        stage: "design",
        stratum: "prototype",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        commitment: "speculative",
        warrant: {
          _tag: "Judged",
          pass: 0.88,
          abstain: 0.07,
          statement: "One-click promotion from verified card worktrees into live Asterism",
        },
        energy: {
          remainingTokens: 1300,
          maxDepth: 3,
          remainingWorktreeLeases: 1,
          basalRechargedTokens: 0,
        },
        x: 955,
        y: 255,
        width: 385,
        height: 210,
        model: "codex/gpt-6.2-sol",
        provider: "codex",
        harness: "@t3tools/provider-codex",
        arenaMode: true,
        status: "speculative",
        branchTag: "roadmap-B:gpt-6.2-sol",
        parentId: "node-ergodic-algebra",
        parentIds: ["node-ergodic-algebra"],
        jevScore: 0.88,
        state: {
          verifyBudgetSec: 45,
          markupNote: "Couple (⋈) with Polaris rail so verified worktrees promote cleanly.",
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.45;">
  <p style="margin:0 0 9px;color:#94a3b8;font-size:11.5px;">Promote verified <code>implement</code>-stage card worktrees directly through <code>self-check</code> into live <code>main</code>.</p>
  <div style="background:rgba(15,23,42,0.58);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:8px 11px;margin-bottom:8px;display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
    <span>Preflight Budget</span>
    <input type="range" min="15" max="120" value="45" data-state-key="verifyBudgetSec" style="flex:1;accent-color:#38bdf8;" oninput="document.getElementById('vfy-lbl').textContent=this.value+'s'" />
    <code id="vfy-lbl" style="color:#94a3b8;">45s</code>
  </div>
  <button onclick="window.asterism.synthesizeWith(['node-fork-polaris-ux'], 'Unify Polaris Steward Rail with one-click verified Worktree Promotion', 'design')" style="width:100%;padding:6px 10px;border-radius:6px;border:1px solid rgba(148,163,184,0.22);background:rgba(30,41,59,0.6);color:#e2e8f0;font-size:11px;font-weight:500;cursor:pointer;">⊕ Synthesize Roadmap A + B</button>
</div>`,
      },
      {
        id: "node-fork-ui-critique",
        title: "Next Step C: Live Preview Visual Diff Loop",
        kind: "speculative",
        stage: "design",
        stratum: "prototype",
        surfaceRole: "ui-prototype",
        relationFromParent: "visualizes-ui",
        commitment: "speculative",
        warrant: {
          _tag: "Judged",
          pass: 0.58,
          abstain: 0.34,
          statement: "Open design question on automated visual diff cadence (0.4k envelope floor)",
        },
        energy: {
          remainingTokens: 400,
          maxDepth: 2,
          remainingWorktreeLeases: 1,
          basalRechargedTokens: 0,
        },
        x: 955,
        y: 485,
        width: 385,
        height: 195,
        model: "muse/muse-wonder-full-1.0",
        provider: "muse",
        harness: "@t3tools/provider-muse",
        arenaMode: true,
        status: "speculative",
        branchTag: "roadmap-C:muse-wonder-full-1.0",
        parentId: "node-ergodic-algebra",
        parentIds: ["node-ergodic-algebra"],
        jevScore: 0.58,
        state: {
          snapshotZoomTier: "both",
          markupNote: "At 0.4k basal floor — recharge to prototype constellation + 100% visual diff.",
        },
        html: `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.45;">
  <p style="margin:0 0 11px;color:#94a3b8;font-size:11.5px;">Capture 100% + constellation (<code>&lt;60%</code>) browser snapshots after self-deploys to catch layout drift automatically.</p>
  <button onclick="window.asterism.pulseBasalEnergy()" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid rgba(56,189,248,0.3);background:rgba(56,189,248,0.1);color:#e0f2fe;font-size:11px;font-weight:500;cursor:pointer;">
    Recharge Basal Energy
  </button>
</div>`,
      },
    ],
  };
}
