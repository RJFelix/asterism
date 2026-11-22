import { installGlobalErrorTelemetry, reportClientError } from './telemetry.mjs';
import { escHtml, escAttr, defaultRoleForStage, buildSrcDoc, formatDiffPatchHtml } from './card-srcdoc.mjs';
import { createProjectionsController } from './projections.mjs';
import { createPolarisController } from './polaris.mjs';
import { createSpotlightController } from './spotlight.mjs';

let knownServerHello = null;
let pendingServerHello = null;

installGlobalErrorTelemetry({ getBootId: () => knownServerHello?.bootId || null });


const AVAILABLE_MODELS = [
  { id: 'antigravity/gemini-4-neon', label: 'gemini-4-neon' },
  { id: 'codex/gpt-6.2-sol', label: 'gpt-6.2-sol' },
  { id: 'muse/muse-wonder-full-1.0', label: 'muse-wonder-full' },
  { id: 'antigravity/gemini-4-argon', label: 'gemini-4-argon' },
  { id: 'claudeAgent/claude-opus-5-5', label: 'claude-opus-5-5' },
];

let state = {
  viewport: { x: 65, y: 55, scale: 0.88 },
  nodes: [],
  edges: [],
  strokes: []
};

let mode = 'select';
let isPanning = false;
let panStart = { x: 0, y: 0 };
let activeStroke = null;
let connectSourceId = null;
let focusedNodeId = null;
let draggingNodeId = null;
let resizingNodeId = null;
let lastDeletedCard = null;
const resolvingDecisionInFlight = new Set();
const counterfactualInFlight = new Set();
const selectedForSynth = new Set();
let tidyInFlight = false;

const viewportEl = document.getElementById('canvas-viewport');
const worldEl = document.getElementById('canvas-world');
const nodesLayer = document.getElementById('nodes-layer');
const edgesGroup = document.getElementById('edges-group');
const strokesGroup = document.getElementById('strokes-group');
const zoomLabel = document.getElementById('zoom-label');
const toastEl = document.getElementById('status-toast');
const synthBtnEl = document.getElementById('btn-synthesize');
const selectionContextBar = document.getElementById('selection-context-bar');

function showToast(msg, ms = 3800) {
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  clearTimeout(toastEl._timer);
  if (ms > 0) {
    toastEl._timer = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }
}

function showUndoToast(msg) {
  toastEl.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg + ' ';
  const btn = document.createElement('button');
  btn.className = 'mini-btn';
  btn.textContent = 'Undo Delete';
  btn.style.marginLeft = '8px';
  btn.addEventListener('click', () => undoDeleteCard());
  toastEl.appendChild(span);
  toastEl.appendChild(btn);
  toastEl.style.display = 'block';
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => { toastEl.style.display = 'none'; lastDeletedCard = null; }, 6000);
}

function undoDeleteCard() {
  if (!lastDeletedCard || !lastDeletedCard.node) return;
  const { node, edges } = lastDeletedCard;
  if (!state.nodes.some(n => n.id === node.id)) state.nodes.push(node);
  for (const e of (edges || [])) {
    if (!state.edges.some(x => x.id === e.id)) state.edges.push(e);
  }
  lastDeletedCard = null;
  toastEl.style.display = 'none';
  renderAll();
  persistState();
  showToast('Restored deleted card.');
}

async function persistNodeMove(node) {
  if (!node) return;
  try {
    const res = await fetch('/api/nodes/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: node.id, x: node.x, y: node.y, width: node.width, height: node.height })
    });
    if (res.status === 404) await persistState();
  } catch {
    try { await persistState(); } catch {}
  }
}

function updateFocusClasses() {
  nodesLayer.querySelectorAll('.canvas-node').forEach(c => {
    c.classList.toggle('is-focused', c.dataset.id === focusedNodeId);
  });
  document.querySelectorAll('.edge-item').forEach(g => {
    const active = focusedNodeId && (g.dataset.from === focusedNodeId || g.dataset.to === focusedNodeId);
    g.classList.toggle('is-connected-active', Boolean(active));
    g.classList.toggle('is-focused', Boolean(active));
  });
  if (!document.querySelector('.edge-item')) renderEdges();
  polaris.updatePolarisFocusPill();
}

function focusDecisionNode(nodeId) {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return;
  focusedNodeId = nodeId;
  const drawer = document.getElementById('attention-drawer');
  if (drawer) drawer.classList.remove('open');
  if (state.viewProjection && state.viewProjection !== 'canvas' && state.viewProjection !== 'plex') {
    setViewProjection('canvas');
  }
  const scale = state.viewport?.scale || 0.88;
  state.viewport.x = Math.round(window.innerWidth / 2 - (node.x + (node.width || 360) / 2) * scale);
  state.viewport.y = Math.round(window.innerHeight / 2 - (node.y + (node.height || 220) / 2) * scale);
  applyTransform();
  updateFocusClasses();
  renderEdges();
}

async function createCrossPollinateEdge(fromId, toId, relation = 'cross-pollinates', kind = 'association') {
  if (!fromId || !toId || fromId === toId) return;
  if (state.edges.some(e => e.from === fromId && e.to === toId && (e.relation === relation || e.kind === kind || e.relation === 'cross-pollinates'))) {
    showToast('Link already exists.');
    return;
  }
  const edge = { id: 'edge-' + Date.now(), from: fromId, to: toId, relation, kind, label: relation };
  state.edges.push(edge);
  renderEdges();
  try {
    const res = await fetch('/api/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', edge })
    });
    if (!res.ok) await persistState();
  } catch {
    try { await persistState(); } catch {}
  }
}

function toggleWorkspaceMenu(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('workspace-dropdown');
  if (dd) dd.hidden = !dd.hidden;
}

function closeWorkspaceMenu() {
  const dd = document.getElementById('workspace-dropdown');
  if (dd) dd.hidden = true;
}

function resetViewportZoom() {
  state.viewport = { x: 65, y: 55, scale: 0.88 };
  applyTransform();
}

function updateSynthButtonLabel() {
  const count = selectedForSynth.size;
  if (selectionContextBar) {
    selectionContextBar.hidden = count < 2;
  }
  if (synthBtnEl) {
    synthBtnEl.textContent = count >= 2 ? `⊕ Synthesize (${count})` : '⊕ Synthesize';
  }
}

function toggleNodeSynthSelection(nodeId) {
  if (selectedForSynth.has(nodeId)) {
    selectedForSynth.delete(nodeId);
  } else {
    selectedForSynth.add(nodeId);
  }
  updateSynthButtonLabel();
  renderNodes();
  renderEdges();
}

function setMode(nextMode) {
  mode = nextMode;
  connectSourceId = null;
  document.querySelectorAll('.canvas-node.is-connect-source').forEach(c => c.classList.remove('is-connect-source'));
  document.querySelectorAll('#tool-switcher .seg-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('mode-' + nextMode);
  if (btn) btn.classList.add('active');
  viewportEl.className = nextMode === 'draw' ? 'mode-draw' : nextMode === 'connect' ? 'mode-connect' : '';
  if (nextMode === 'connect') showToast('Click a source panel header, then click a target panel header to link them.');
}

async function setViewProjection(nextView, targetFocusNodeId) {
  const prevView = state.viewProjection || 'canvas';
  if (prevView === 'plex' && nextView === 'canvas') {
    for (const n of state.nodes) {
      if (typeof n.canvasX === 'number') n.x = n.canvasX;
      if (typeof n.canvasY === 'number') n.y = n.canvasY;
    }
    try {
      await fetch('/api/views/plex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ restoreCanvasLayout: true, viewProjection: 'canvas' }) });
    } catch {}
  }
  if (targetFocusNodeId) {
    const targetNode = state.nodes.find(n => n.id === targetFocusNodeId);
    if (targetNode && targetNode.shadowStaged) {
      targetNode.shadowStaged = false;
      try { await unfoldShadowForParent(targetNode.parentId || targetNode.id); } catch {}
    }
  }
  state.viewProjection = nextView;
  if (nextView === 'brief') projections.resetBriefingThrottle();
  document.body.classList.remove('view-canvas', 'view-plex', 'view-table', 'view-timeline', 'view-model', 'view-brief');
  document.body.classList.add('view-' + nextView);
  document.querySelectorAll('#view-switcher .seg-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('view-' + nextView);
  if (btn) btn.classList.add('active');

  if (nextView === 'plex') {
    const focusId = targetFocusNodeId || focusedNodeId || state.plexFocusNodeId || 'node-ergodic-algebra';
    await focusPlexNode(focusId);
  } else {
    renderAll();
  }
}

async function focusPlexNode(nodeId) {
  if (!nodeId) return;
  const focusNodeLocal = state.nodes.find(n => n.id === nodeId);
  if (focusNodeLocal && focusNodeLocal.shadowStaged) {
    focusNodeLocal.shadowStaged = false;
    try { await unfoldShadowForParent(focusNodeLocal.parentId || focusNodeLocal.id); } catch {}
  }
  for (const n of state.nodes) {
    if (typeof n.canvasX !== 'number') n.canvasX = n.x;
    if (typeof n.canvasY !== 'number') n.canvasY = n.y;
  }
  focusedNodeId = nodeId;
  state.plexFocusNodeId = nodeId;
  const res = await fetch('/api/views/plex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      focusNodeId: nodeId,
      viewProjection: 'plex',
      applyLayout: true
    })
  });
  const data = await res.json();
  if (data.focusNode) {
    const titleEl = document.getElementById('plex-focus-title');
    if (titleEl) titleEl.textContent = data.focusNode.title;
    state.viewport = { x: 65, y: 55, scale: 0.86 };
    renderAll();
    showToast(
      `🕸 Plex centered on "${data.focusNode.title}" (${data.parents?.length || 0} parent, ${data.children?.length || 0} children, ${data.lateral?.length || 0} lateral).`
    );
  }
}

async function cycleOrPromptProject() {
  const projects = state.projects || [];
  if (projects.length >= 2) {
    const idx = projects.findIndex(p => p.id === state.activeProjectId);
    const nextProj = projects[(idx + 1) % projects.length];
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProjectId: nextProj.id })
    });
    const data = await res.json();
    if (data.activeProject) {
      showToast(`📁 Active project switched to "${data.activeProject.name}" (${data.activeProject.repoPath}).`);
    }
  } else {
    await promptAddProject();
  }
}

async function promptAddProject() {
  const name = window.prompt('Project name (or leave blank to keep current):', 'agent-attic (misc)');
  if (!name) return;
  const repoPath = window.prompt('Local repository or project path in superrepo:', '/home/exedev/agent-attic');
  if (!repoPath) return;
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, repoPath })
  });
  const data = await res.json();
  if (data.activeProject) {
    showToast(`📁 Active project set to "${data.activeProject.name}".`);
  }
}

function getRenderedNodeRect(node) {
  const isConstellation = document.body.classList.contains('zoom-constellation');
  const escapedId = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
    ? CSS.escape(String(node.id))
    : String(node.id).replace(/(["\\])/g, '\\$1');
  const cardEl = nodesLayer ? nodesLayer.querySelector(`.canvas-node[data-id="${escapedId}"]`) : null;
  let width = (cardEl && cardEl.offsetWidth > 0) ? cardEl.offsetWidth : (node.width || 360);
  let height = isConstellation
    ? ((cardEl && cardEl.offsetHeight > 0) ? cardEl.offsetHeight : 52)
    : ((cardEl && cardEl.offsetHeight > 0) ? cardEl.offsetHeight : (node.height || 220));
  let x = node.x;
  let y = node.y;
  if (cardEl && cardEl.classList.contains('plex-distant')) {
    const insetX = width * 0.02;
    const insetY = height * 0.02;
    x += insetX;
    y += insetY;
    width *= 0.96;
    height *= 0.96;
  }
  return { x, y, width, height };
}

function applyTransform() {
  const { x, y, scale } = state.viewport;
  const wasConstellation = document.body.classList.contains('zoom-constellation');
  const isConstellation = scale < 0.60;
  worldEl.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  document.body.classList.toggle('zoom-deep', scale >= 1.12);
  document.body.classList.toggle('zoom-constellation', isConstellation);
  if (wasConstellation !== isConstellation) {
    renderEdges();
  }
}

function screenToWorld(clientX, clientY) {
  const { x, y, scale } = state.viewport;
  return {
    x: (clientX - x) / scale,
    y: (clientY - y) / scale
  };
}

function edgeStyleFor(edge, toNode) {
  const rel = edge.relation || edge.kind || 'advances';
  if (rel === 'cross-pollinates' || edge.kind === 'jump') {
    return { stroke: 'rgba(251, 191, 36, 0.85)', marker: 'url(#arrow-synth)', textFill: '#fde68a', dash: '5 3' };
  }
  if (rel === 'synthesizes' || rel === 'synthesis') {
    return { stroke: 'rgba(251, 191, 36, 0.8)', marker: 'url(#arrow-synth)', textFill: '#fde68a', dash: '' };
  }
  if (rel === 'visualizes-ui') {
    return { stroke: 'rgba(244, 114, 182, 0.72)', marker: 'url(#arrow-ui)', textFill: '#f9a8d4', dash: '' };
  }
  if (rel === 'specifies') {
    return { stroke: 'rgba(192, 132, 252, 0.72)', marker: 'url(#arrow-spec)', textFill: '#d8b4fe', dash: '' };
  }
  if (rel === 'implements') {
    return { stroke: 'rgba(52, 211, 153, 0.75)', marker: 'url(#arrow-impl)', textFill: '#6ee7b7', dash: '' };
  }
  if (rel === 'forks' || (toNode && toNode.kind === 'speculative' && toNode.status !== 'committed')) {
    return { stroke: 'rgba(168, 85, 247, 0.55)', marker: 'url(#arrow-spec)', textFill: '#c084fc', dash: '6 4' };
  }
  return { stroke: 'rgba(56, 189, 248, 0.6)', marker: 'url(#arrow)', textFill: '#94a3b8', dash: '' };
}

function shortEdgeLabel(edge) {
  const rel = edge.relation || edge.kind || '';
  if (edge.label && edge.label.length <= 22) return edge.label;
  const map = {
    'specifies': '📐 specifies',
    'visualizes-ui': '🎨 visualizes UI',
    'implements': '⚙ implements',
    'synthesizes': '⊕ synthesizes',
    'cross-pollinates': '⋈ cross-pollinates',
    'forks': '✨ forks',
    'advances': '→ advances',
    'annotates': '💬 critiques',
    'revisions-from': '🌱 revision'
  };
  return map[rel] || (edge.label ? edge.label.slice(0, 22) : rel);
}

function renderEdges() {
  edgesGroup.innerHTML = '';
  for (const edge of state.edges) {
    if (edge.shadowStaged) continue;
    const from = state.nodes.find(n => n.id === edge.from);
    const to = state.nodes.find(n => n.id === edge.to);
    if (!from || !to || from.shadowStaged || to.shadowStaged) continue;

    const fromBox = getRenderedNodeRect(from);
    const toBox = getRenderedNodeRect(to);
    const gapX = toBox.x > fromBox.x + fromBox.width
      ? toBox.x - (fromBox.x + fromBox.width)
      : (fromBox.x > toBox.x + toBox.width ? fromBox.x - (toBox.x + toBox.width) : 0);
    const gapY = toBox.y > fromBox.y + fromBox.height
      ? toBox.y - (fromBox.y + fromBox.height)
      : (fromBox.y > toBox.y + toBox.height ? fromBox.y - (toBox.y + toBox.height) : 0);
    const fromCx = fromBox.x + fromBox.width / 2;
    const fromCy = fromBox.y + fromBox.height / 2;
    const toCx = toBox.x + toBox.width / 2;
    const toCy = toBox.y + toBox.height / 2;
    const preferVertical = gapY > gapX || (
      gapX === 0 && gapY === 0 &&
      Math.abs(toCy - fromCy) / Math.max(1, fromBox.height) > Math.abs(toCx - fromCx) / Math.max(1, fromBox.width)
    );

    let x1, y1, x2, y2, d;
    if (preferVertical && toCy >= fromCy) {
      x1 = fromCx; y1 = fromBox.y + fromBox.height;
      x2 = toCx; y2 = toBox.y;
      const dy = Math.max(44, Math.abs(y2 - y1) * 0.45);
      d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
    } else if (preferVertical) {
      x1 = fromCx; y1 = fromBox.y;
      x2 = toCx; y2 = toBox.y + toBox.height;
      const dy = Math.max(44, Math.abs(y2 - y1) * 0.45);
      d = `M ${x1} ${y1} C ${x1} ${y1 - dy}, ${x2} ${y2 + dy}, ${x2} ${y2}`;
    } else if (toCx >= fromCx) {
      x1 = fromBox.x + fromBox.width; y1 = fromCy;
      x2 = toBox.x; y2 = toCy;
      const dx = Math.max(52, Math.abs(x2 - x1) * 0.45);
      d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    } else {
      x1 = fromBox.x; y1 = fromCy;
      x2 = toBox.x + toBox.width; y2 = toCy;
      const dx = Math.max(52, Math.abs(x2 - x1) * 0.45);
      d = `M ${x1} ${y1} C ${x1 - dx} ${y1}, ${x2 + dx} ${y2}, ${x2} ${y2}`;
    }

    const style = edgeStyleFor(edge, to);
    const isConnectedActive =
      focusedNodeId === edge.from ||
      focusedNodeId === edge.to ||
      selectedForSynth.has(edge.from) ||
      selectedForSynth.has(edge.to);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `edge-item${isConnectedActive ? ' is-connected-active is-focused' : ''}`);
    g.dataset.from = edge.from;
    g.dataset.to = edge.to;

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('class', 'edge-hit');
    hit.setAttribute('d', d);
    g.appendChild(hit);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge-line');
    path.setAttribute('d', d);
    path.setAttribute('stroke', style.stroke);
    path.setAttribute('stroke-dasharray', style.dash);
    path.setAttribute('marker-end', style.marker);
    g.appendChild(path);

    const lblText = shortEdgeLabel(edge);
    if (lblText) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - 6;
      const lblG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      lblG.setAttribute('class', 'edge-label-group');

      const estWidth = Math.max(52, lblText.length * 6.2 + 14);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(mx - estWidth / 2));
      rect.setAttribute('y', String(my - 11));
      rect.setAttribute('width', String(estWidth));
      rect.setAttribute('height', '16');
      rect.setAttribute('rx', '5');
      rect.setAttribute('fill', 'rgba(15, 23, 42, 0.92)');
      rect.setAttribute('stroke', style.stroke);
      rect.setAttribute('stroke-width', '1');
      lblG.appendChild(rect);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(mx));
      text.setAttribute('y', String(my));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', style.textFill);
      text.setAttribute('font-size', '9.5');
      text.setAttribute('font-family', 'ui-monospace, monospace');
      text.textContent = lblText;
      lblG.appendChild(text);

      g.appendChild(lblG);
    }
    edgesGroup.appendChild(g);
  }
}

function renderStrokes() {
  strokesGroup.innerHTML = '';
  for (const stroke of state.strokes) {
    if (!stroke.points || stroke.points.length < 2) continue;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', stroke.points.map(p => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', stroke.color || '#38bdf8');
    poly.setAttribute('stroke-width', '3');
    poly.setAttribute('stroke-linecap', 'round');
    poly.setAttribute('stroke-linejoin', 'round');
    strokesGroup.appendChild(poly);
  }
}


function renderNodes() {
  const visibleNodes = state.nodes.filter(n => !n.shadowStaged);
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  Array.from(nodesLayer.children).forEach(el => {
    if (!visibleIds.has(el.dataset.id)) el.remove();
  });

  for (const node of visibleNodes) {
    let card = nodesLayer.querySelector(`[data-id="${node.id}"]`);
    if (!card) {
      card = document.createElement('div');
      card.dataset.id = node.id;
      const modelOptionsHtml = AVAILABLE_MODELS.map(
        m => `<option value="${m.id}">${m.label}</option>`
      ).join('');

      card.innerHTML = `
        <div class="node-header">
          <div class="node-title-wrap">
            <button class="synth-check-btn" title="Select panel to compare or synthesize (Shift+Click)">☐</button>
            <span class="constellation-dot dot-surface" aria-hidden="true"></span>
            <span class="node-title"></span>
          </div>
          <div class="node-actions">
            <button class="shadow-badge-btn" title="Unfold staged background branches"></button>
            <button class="mini-btn keep-btn" title="Keep this speculative branch">✓ Keep</button>
            <span class="node-stage-pill"></span>
            <div class="header-hover-actions">
              <select class="model-select" title="Model">${modelOptionsHtml}</select>
              <button class="mini-btn code-toggle-btn" title="View/Edit HTML">‹/›</button>
              <button class="mini-btn del-btn" title="Delete Panel">✕</button>
            </div>
          </div>
        </div>
        <div class="facet-tab-bar">
          <div class="facet-tabs">
            <button class="facet-tab" data-facet="dialogue" title="Conversation / Steer View">💬 Chat</button>
            <button class="facet-tab" data-facet="spec-diagram" title="Technical Spec View">📐 Spec</button>
            <button class="facet-tab" data-facet="ui-prototype" title="Interactive UI Sample">🎨 UI</button>
            <button class="facet-tab" data-facet="artifact-harness" title="Code & Worktree View">⚙ Code</button>
          </div>
          <div class="facet-meta-right">
            <button class="tearoff-btn" title="Tear off active view into a linked companion panel">↗ Tear Off</button>
          </div>
        </div>
        <div class="worktree-bar">
          <div class="wt-meta">
            <span class="wt-branch-label">⚙ worktree</span>
            <span class="wt-diff-stat"><span class="ins">+0</span> / <span class="del">-0</span></span>
            <span class="wt-test-badge"></span>
          </div>
          <div class="wt-actions">
            <button class="wt-btn wt-diff-btn" title="Inspect Live Git Worktree Diff & Test Output">Diff</button>
            <button class="wt-btn wt-run-btn" title="Run Outbox Agent inside Isolated Worktree">▶ Run</button>
            <button class="wt-btn wt-commit-btn" title="Commit Implementation in Isolated Worktree Branch">✓ Commit</button>
          </div>
        </div>
        <div class="node-body">
          <iframe class="node-iframe" sandbox="allow-scripts"></iframe>
          <textarea class="node-code-editor" spellcheck="false"></textarea>
          <div class="node-diff-inspector"></div>
        </div>
        <div class="node-footer">
          <input class="node-prompt-input" type="text" placeholder="Ask agent to refine or branch..." />
          <button class="node-send-btn" title="Collaborate with agent on this panel">Ask</button>
          <button class="mini-btn spec-btn" title="Fork 3 parallel model variants">✨ 3x</button>
          <button class="mini-btn advance-btn" title="Advance to next stage">Next →</button>
        </div>
        <div class="resize-handle"></div>
      `;
      setupNodeInteractions(card, node.id);
      nodesLayer.appendChild(card);
    }

    const isSelected = selectedForSynth.has(node.id);
    const isFocused = focusedNodeId === node.id;
    const keepEditing = card.classList.contains('editing-html');
    const keepViewingDiff = card.classList.contains('viewing-diff');
    const resolvedRole = node.surfaceRole || defaultRoleForStage(node.stage);

    let plexClass = '';
    if (state.viewProjection === 'plex') {
      const plexId = state.plexFocusNodeId || focusedNodeId || 'node-ergodic-algebra';
      const plexNode = state.nodes.find(n => n.id === plexId);
      const isDirectEdge = state.edges.some(
        e => (e.from === plexId && e.to === node.id) || (e.to === plexId && e.from === node.id)
      );
      const isSibling = plexNode && plexNode.parentId && node.parentId === plexNode.parentId;
      if (node.id === plexId) {
        plexClass = 'plex-focal';
      } else if (!isDirectEdge && !isSibling) {
        plexClass = 'plex-distant';
      }
    }

    card.className = [
      'canvas-node',
      `kind-${node.kind || 'surface'}`,
      `status-${node.status || 'ready'}`,
      `stage-${node.stage || 'note'}`,
      `role-${resolvedRole}`,
      isSelected ? 'selected-for-synth' : '',
      connectSourceId === node.id ? 'is-connect-source' : '',
      isFocused ? 'is-focused' : '',
      plexClass,
      keepEditing ? 'editing-html' : '',
      keepViewingDiff ? 'viewing-diff' : ''
    ].filter(Boolean).join(' ');

    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.style.width = `${node.width}px`;
    card.style.height = `${node.height}px`;

    const checkBtn = card.querySelector('.synth-check-btn');
    if (checkBtn) {
      checkBtn.textContent = isSelected ? '☑' : '☐';
      checkBtn.classList.toggle('checked', isSelected);
    }

    // Update Facet Tabs & Shadow Badge
    const facetsObj = node.facets || { [resolvedRole]: node.html };
    card.querySelectorAll('.facet-tab').forEach(tab => {
      const f = tab.dataset.facet;
      tab.classList.toggle('active', f === resolvedRole);
      tab.classList.toggle('cached', Boolean(facetsObj[f]));
    });

    const shadowChildren = state.nodes.filter(n => n.shadowStaged && n.parentId === node.id);
    const shadowBadge = card.querySelector('.shadow-badge-btn');
    if (shadowBadge) {
      if (shadowChildren.length > 0) {
        shadowBadge.textContent = `🌑 +${shadowChildren.length}`;
        shadowBadge.classList.add('has-shadow');
      } else {
        shadowBadge.textContent = '';
        shadowBadge.classList.remove('has-shadow');
      }
    }

    const stageLabel = (node.stage || 'note').toUpperCase();
    card.querySelector('.node-stage-pill').textContent =
      node.status === 'committed' ? `✓ ${stageLabel}` : stageLabel;
    card.querySelector('.node-title').textContent = node.title;
    card.querySelector('.node-title').title = node.title;
    const constellationDot = card.querySelector('.constellation-dot');
    if (constellationDot) {
      const dotKind = node.kind === 'decision'
        ? 'dot-decision'
        : node.autonomousReceipt
          ? 'dot-autonomous'
          : node.kind === 'speculative'
            ? 'dot-speculative'
            : 'dot-surface';
      constellationDot.className = `constellation-dot ${dotKind}`;
    }

    const modelSelect = card.querySelector('.model-select');
    const activeModel = node.model || 'openai/gpt-6-luna';
    if (modelSelect && modelSelect.value !== activeModel) {
      modelSelect.value = activeModel;
    }

    // Update Worktree Bar if stage === 'implement' or role === 'artifact-harness'
    if (node.stage === 'implement' || resolvedRole === 'artifact-harness' || node.worktree || node.implementation) {
      const branchLbl = card.querySelector('.wt-branch-label');
      const shortBranch = (node.worktree?.branchName || 'unprovisioned').replace(/^asterism\//, '');
      branchLbl.textContent = `⚙ ${shortBranch.slice(0, 20)}`;

      const ins = node.implementation?.diff?.insertions ?? 0;
      const del = node.implementation?.diff?.deletions ?? 0;
      card.querySelector('.wt-diff-stat').innerHTML = `<span class="ins">+${ins}</span>/<span class="del">-${del}</span>`;

      const testBadge = card.querySelector('.wt-test-badge');
      if (node.implementStatus === 'running') {
        testBadge.textContent = '⟳ Running...';
        testBadge.style.color = '#38bdf8';
      } else if (node.implementation?.testPassed) {
        testBadge.textContent = '✓ Verified';
        testBadge.style.color = '#34d399';
      } else if (node.implementation) {
        testBadge.textContent = '⚠ Check Failed';
        testBadge.style.color = '#f87171';
      } else {
        testBadge.textContent = 'Ready';
        testBadge.style.color = '#94a3b8';
      }

      const diffInspector = card.querySelector('.node-diff-inspector');
      diffInspector.innerHTML = formatDiffPatchHtml(node);
    }

    const iframe = card.querySelector('.node-iframe');
    const editor = card.querySelector('.node-code-editor');
    if (iframe) iframe.title = node.title || 'Asterism Card Surface';
    const _stateJson = JSON.stringify(node.state || {});
    if (card.dataset.lastHtml !== node.html) {
      card.dataset.lastHtml = node.html;
      card.dataset.lastStateJson = _stateJson;
      iframe.srcdoc = buildSrcDoc(node);
      if (document.activeElement !== editor) {
        editor.value = node.html;
      }
    } else if (card.dataset.lastStateJson !== _stateJson) {
      card.dataset.lastStateJson = _stateJson;
      try { iframe.contentWindow?.postMessage({ type: 'asterism:state-sync', state: node.state || {} }, '*'); } catch {}
    }
  }
}

function setupNodeInteractions(card, nodeId) {
  const header = card.querySelector('.node-header');
  const checkBtn = card.querySelector('.synth-check-btn');
  const modelSelect = card.querySelector('.model-select');
  const keepBtn = card.querySelector('.keep-btn');
  const resizeHandle = card.querySelector('.resize-handle');
  const codeBtn = card.querySelector('.code-toggle-btn');
  const specBtn = card.querySelector('.spec-btn');
  const advanceBtn = card.querySelector('.advance-btn');
  const delBtn = card.querySelector('.del-btn');
  const wtDiffBtn = card.querySelector('.wt-diff-btn');
  const wtRunBtn = card.querySelector('.wt-run-btn');
  const wtCommitBtn = card.querySelector('.wt-commit-btn');
  const editor = card.querySelector('.node-code-editor');
  const promptInput = card.querySelector('.node-prompt-input');
  const sendBtn = card.querySelector('.node-send-btn');
  const tearOffBtn = card.querySelector('.tearoff-btn');
  const shadowBadge = card.querySelector('.shadow-badge-btn');

  card.addEventListener('pointerdown', () => {
    if (focusedNodeId !== nodeId) {
      focusedNodeId = nodeId;
      renderNodes();
      renderEdges();
      if (typeof updatePolarisFocusPill === 'function') updatePolarisFocusPill();
    }
  });

  if (shadowBadge) {
    shadowBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      unfoldShadowForParent(nodeId);
    });
  }

  card.querySelectorAll('.facet-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      switchOrTearOffFacet(nodeId, tab.dataset.facet, false);
    });
  });

  if (tearOffBtn) {
    tearOffBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const node = state.nodes.find(n => n.id === nodeId);
      const curRole = node?.surfaceRole || defaultRoleForStage(node?.stage);
      const nextFacet = curRole === 'dialogue' ? 'spec-diagram' : curRole;
      switchOrTearOffFacet(nodeId, nextFacet, true);
    });
  }

  if (checkBtn) {
    checkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNodeSynthSelection(nodeId);
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', async (e) => {
      e.stopPropagation();
      const model = modelSelect.value;
      const node = state.nodes.find(n => n.id === nodeId);
      if (node) node.model = model;
      showToast(`Switched panel model to ${model.replace('openai/', '')}`);
      await fetch('/api/nodes/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, model })
      });
    });
  }

  if (keepBtn) {
    keepBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      commitBranch(nodeId, false);
    });
  }

  header.addEventListener('dblclick', (e) => {
    if (!e.altKey) return;
    if (e.target.closest('button') || e.target.closest('select')) return;
    e.stopPropagation();
    if (state.viewProjection === 'plex') {
      focusPlexNode(nodeId);
    } else {
      setViewProjection('plex', nodeId);
    }
  });

  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || e.target.closest('select')) return;
    e.stopPropagation();

    if (focusedNodeId !== nodeId) {
      focusedNodeId = nodeId;
      renderNodes();
      renderEdges();
    }

    if (e.shiftKey) {
      toggleNodeSynthSelection(nodeId);
      return;
    }

    if (mode === 'connect') {
      if (!connectSourceId) {
        connectSourceId = nodeId;
        document.querySelectorAll('.canvas-node.is-connect-source').forEach(c => c.classList.remove('is-connect-source'));
        card.classList.add('is-connect-source');
        showToast(`Source panel selected (${nodeId}). Now click a target panel header.`);
      } else if (connectSourceId !== nodeId) {
        const targetNode = state.nodes.find(n => n.id === nodeId);
        const tRole = targetNode?.surfaceRole || defaultRoleForStage(targetNode?.stage);
        const rel = tRole === 'ui-prototype' ? 'visualizes-ui' : tRole === 'spec-diagram' ? 'specifies' : tRole === 'artifact-harness' ? 'implements' : 'cross-pollinates';
        const fromId = connectSourceId;
        connectSourceId = null;
        document.querySelectorAll('.canvas-node.is-connect-source').forEach(c => c.classList.remove('is-connect-source'));
        setMode('select');
        createCrossPollinateEdge(fromId, nodeId, rel, rel === 'cross-pollinates' ? 'association' : rel);
      }
      return;
    }

    if (e.altKey) {
      const sourceNode = state.nodes.find(n => n.id === nodeId);
      if (!sourceNode) return;
      connectSourceId = nodeId;
      document.querySelectorAll('.canvas-node.is-connect-source').forEach(c => c.classList.remove('is-connect-source'));
      card.classList.add('is-connect-source');
      document.body.classList.add('is-dragging-card');
      try { header.setPointerCapture?.(e.pointerId); } catch {}
      const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tempLine.setAttribute('class', 'connect-temp-line');
      const sourceBox = getRenderedNodeRect(sourceNode);
      const sx = sourceBox.x + sourceBox.width / 2;
      const sy = sourceBox.y + sourceBox.height / 2;
      tempLine.setAttribute('x1', String(sx)); tempLine.setAttribute('y1', String(sy));
      tempLine.setAttribute('x2', String(sx)); tempLine.setAttribute('y2', String(sy));
      edgesGroup.appendChild(tempLine);
      const altStartX = e.clientX; const altStartY = e.clientY;
      function onAltMove(ev) {
        const pt = screenToWorld(ev.clientX, ev.clientY);
        tempLine.setAttribute('x2', String(pt.x)); tempLine.setAttribute('y2', String(pt.y));
      }
      function onAltUp(ev) {
        window.removeEventListener('pointermove', onAltMove);
        window.removeEventListener('pointerup', onAltUp);
        tempLine.remove();
        document.body.classList.remove('is-dragging-card');
        card.classList.remove('is-connect-source');
        const fromId = connectSourceId;
        connectSourceId = null;
        const dist = Math.hypot(ev.clientX - altStartX, ev.clientY - altStartY);
        if (dist < 5) return;
        const targetCard = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.canvas-node');
        const targetId = targetCard?.dataset?.id;
        if (targetId && targetId !== fromId) {
          createCrossPollinateEdge(fromId, targetId, 'cross-pollinates', 'association');
        }
      }
      window.addEventListener('pointermove', onAltMove);
      window.addEventListener('pointerup', onAltUp);
      return;
    }

    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = node.x;
    const origY = node.y;
    let moved = false;
    draggingNodeId = nodeId;
    document.body.classList.add('is-dragging-card');
    try { header.setPointerCapture?.(e.pointerId); } catch {}

    function onMove(ev) {
      if (Math.abs(ev.clientX - startX) > 2 || Math.abs(ev.clientY - startY) > 2) moved = true;
      node.x = Math.round(origX + (ev.clientX - startX) / state.viewport.scale);
      node.y = Math.round(origY + (ev.clientY - startY) / state.viewport.scale);
      card.style.left = `${node.x}px`;
      card.style.top = `${node.y}px`;
      renderEdges();
    }
    function onUp(ev) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('is-dragging-card');
      draggingNodeId = null;
      const dist = ev ? Math.hypot(ev.clientX - startX, ev.clientY - startY) : (moved ? 99 : 0);
      if (state.viewProjection === 'plex' && state.plexFocusNodeId !== nodeId && !e.shiftKey && mode === 'select' && dist < 5) {
        node.x = origX; node.y = origY;
        card.style.left = `${node.x}px`; card.style.top = `${node.y}px`;
        renderEdges();
        focusPlexNode(nodeId);
        return;
      }
      if (moved || node.x !== origX || node.y !== origY) persistNodeMove(node);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  resizeHandle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = node.width;
    const origH = node.height;
    let resized = false;
    resizingNodeId = nodeId;
    document.body.classList.add('is-dragging-card');
    try { resizeHandle.setPointerCapture?.(e.pointerId); } catch {}

    function onMove(ev) {
      resized = true;
      node.width = Math.max(300, Math.round(origW + (ev.clientX - startX) / state.viewport.scale));
      node.height = Math.max(185, Math.round(origH + (ev.clientY - startY) / state.viewport.scale));
      card.style.width = `${node.width}px`;
      card.style.height = `${node.height}px`;
      renderEdges();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('is-dragging-card');
      resizingNodeId = null;
      if (resized && (node.width !== origW || node.height !== origH)) persistNodeMove(node);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  codeBtn.addEventListener('click', () => {
    card.classList.remove('viewing-diff');
    const isEditing = card.classList.toggle('editing-html');
    if (!isEditing) {
      const node = state.nodes.find(n => n.id === nodeId);
      if (node && editor.value !== node.html) {
        node.html = editor.value;
        renderNodes();
        persistState();
      }
    }
  });

  wtDiffBtn.addEventListener('click', async () => {
    card.classList.remove('editing-html');
    const isViewing = card.classList.toggle('viewing-diff');
    if (isViewing) {
      const res = await fetch(`/api/nodes/implement/diff?nodeId=${encodeURIComponent(nodeId)}`);
      const data = await res.json();
      const node = state.nodes.find(n => n.id === nodeId);
      if (node && data.diff) {
        node.implementation = node.implementation || {};
        node.implementation.diff = data.diff;
        renderNodes();
      }
    }
  });

  wtRunBtn.addEventListener('click', async () => {
    const customPrompt = promptInput.value.trim();
    promptInput.value = '';
    await runImplementAgent(nodeId, customPrompt);
  });

  wtCommitBtn.addEventListener('click', async () => {
    const customMsg = promptInput.value.trim();
    promptInput.value = '';
    showToast('Committing implementation inside isolated Git worktree...', 10000);
    const res = await fetch('/api/nodes/implement/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, message: customMsg || undefined })
    });
    const data = await res.json();
    if (data.commit) {
      showToast(`✓ Committed ${data.commit.commitSha} on branch ${data.commit.branchName}!`);
    }
  });

  specBtn.addEventListener('click', () => {
    const customPrompt = promptInput.value.trim();
    promptInput.value = '';
    triggerSpeculate(
      nodeId,
      customPrompt || 'Explore 3 divergent variants across Arena models',
      { arenaMode: true }
    );
  });

  advanceBtn.addEventListener('click', () => {
    const customPrompt = promptInput.value.trim();
    promptInput.value = '';
    advanceStage(nodeId, customPrompt);
  });

  delBtn.addEventListener('click', async () => {
    const deletedNode = state.nodes.find(n => n.id === nodeId);
    const incidentEdges = state.edges.filter(e => e.from === nodeId || e.to === nodeId);
    if (deletedNode) lastDeletedCard = { node: deletedNode, edges: incidentEdges };
    selectedForSynth.delete(nodeId);
    if (focusedNodeId === nodeId) focusedNodeId = null;
    if (connectSourceId === nodeId) connectSourceId = null;
    updateSynthButtonLabel();
    state.nodes = state.nodes.filter(n => n.id !== nodeId);
    state.edges = state.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
    renderAll();
    try {
      const res = await fetch('/api/nodes/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId })
      });
      if (!res.ok) await persistState();
    } catch {
      try { await persistState(); } catch {}
    }
    showUndoToast(`Deleted "${deletedNode?.title || nodeId}".`);
  });

  async function runMutate() {
    const instruction = promptInput.value.trim();
    if (!instruction) return;
    promptInput.value = '';
    await mutateNode(nodeId, instruction);
  }

  sendBtn.addEventListener('click', runMutate);
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runMutate();
  });
}

let comparedNodeIds = [];

async function switchOrTearOffFacet(nodeId, facetRole, tearOff = false) {
  showToast(
    tearOff
      ? `↗ Tearing off "${facetRole}" lens into a companion panel...`
      : `Switching view to "${facetRole}"...`,
    14000
  );
  const res = await fetch('/api/nodes/facet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, facetRole, tearOff })
  });
  const data = await res.json();
  if (data.tornOffLens) {
    showToast(`↗ Torn off "${data.tornOffLens.title}" as a linked companion panel.`);
  } else {
    showToast(`Switched view to "${facetRole}".`);
  }
}

async function pulseBasalFreeEnergy() {
  showToast('🔋 Allocating Basal Free-Energy across frontier nodes...', 8000);
  const res = await fetch('/api/energy/basal-tick', { method: 'POST' });
  const data = await res.json();
  if (data.totalGrantedTokens) {
    const top = data.attentionQueue?.[0];
    showToast(
      `🔋 Recharged +${data.totalGrantedTokens} tokens across ${data.allocations?.length || 0} nodes (Top EVOI: "${top?.title || 'root'}").`
    );
  }
}

function openComparisonMatrix() {
  let candidates = [...selectedForSynth]
    .map(id => state.nodes.find(n => n.id === id))
    .filter(Boolean);
  if (candidates.length < 2) {
    const specs = state.nodes.filter(n => n.kind === 'speculative' || n.id.startsWith('node-spec-'));
    candidates = specs.length >= 2 ? specs.slice(0, 3) : state.nodes.slice(0, 3);
  }
  comparedNodeIds = candidates.map(n => n.id);
  const grid = document.getElementById('compare-grid');
  const sub = document.getElementById('compare-subtitle');
  sub.textContent = `Comparing ${candidates.length} sibling thoughts (${candidates.map(c => c.title).join(' vs. ')})`;
  grid.innerHTML = '';
  for (const n of candidates) {
    const col = document.createElement('div');
    col.className = 'compare-col';
    const shortModel = (n.model || 'gpt-6-luna').replace('openai/', '');
    const pScore = typeof n.jevScore === 'number' ? `p=${n.jevScore}` : 'calibrated';
    col.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:rgba(30,41,59,0.92);border-bottom:1px solid rgba(148,163,184,0.16);font-size:11px;">
        <div>
          <strong style="color:#f8fafc;">${escHtml(n.title)}</strong>
          <span style="margin-left:6px;color:#38bdf8;font-family:ui-monospace,monospace;font-size:10px;">${escHtml(shortModel)} • ${escHtml(pScore)}</span>
        </div>
        <button class="mini-btn" onclick="commitBranch('${escAttr(n.id)}', false); closeComparisonMatrix();">✓ Keep</button>
      </div>
      <iframe style="flex:1;width:100%;border:none;background:transparent;" sandbox="allow-scripts"></iframe>
    `;
    const iframe = col.querySelector('iframe');
    iframe.title = n.title || 'Asterism Card Surface';
    iframe.srcdoc = buildSrcDoc(n, { readOnly: true });
    grid.appendChild(col);
  }
  document.getElementById('compare-modal').classList.add('open');
}

function closeComparisonMatrix() {
  document.getElementById('compare-modal').classList.remove('open');
}

async function synthesizeFromComparisonMatrix() {
  const ids = [...comparedNodeIds];
  closeComparisonMatrix();
  if (ids.length >= 2) {
    await synthesizeSelectedOrKept(ids);
  }
}

async function mutateNode(nodeId, instruction) {
  showToast(`Collaborating with agent on "${nodeId}"...`, 18000);
  const res = await fetch('/api/nodes/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, instruction })
  });
  const data = await res.json();
  if (data.branchedNewFuture && data.branchedRevisionNode) {
    showToast(`🌱 Branched "${data.branchedRevisionNode.title}" while keeping existing downstream work intact.`);
  } else if (data.spawnedPanels && data.spawnedPanels.length > 0) {
    showToast(`Updated panel and spawned ${data.spawnedPanels.length} companion panel(s).`);
  } else {
    showToast('Panel updated.');
  }
}

async function triggerSpawnRelated({ sourceNodeId, relation = 'visualizes-ui', surfaceRole, title, prompt }) {
  showToast(`Spawning companion "${surfaceRole || relation}" panel...`, 18000);
  const res = await fetch('/api/nodes/spawn-related', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceNodeId, relation, surfaceRole, title, prompt })
  });
  const data = await res.json();
  if (data.childNode) {
    showToast(`✦ Spawned companion panel "${data.childNode.title}".`);
  }
}

async function triggerSpeculate(nodeId, prompt, options = {}) {
  showToast('✨ Forking 3 parallel model variants...', 20000);
  await fetch('/api/nodes/speculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodeId,
      prompt,
      count: options.count || 3,
      arenaMode: options.arenaMode ?? true,
      surfaceRole: options.surfaceRole,
      models: options.models
    })
  });
  showToast('3 parallel branches ready.');
}

async function synthesizeSelectedOrKept(customParentIds, instruction, targetStage) {
  let parentIds = Array.isArray(customParentIds) ? customParentIds : [...selectedForSynth];
  if (parentIds.length < 2) {
    const committedForks = state.nodes.filter(n => n.status === 'committed' && n.parentId);
    if (committedForks.length >= 2) {
      parentIds = committedForks.slice(-2).map(n => n.id);
    } else {
      const specForks = state.nodes.filter(n => n.kind === 'speculative' || n.branchTag?.startsWith('fork-'));
      parentIds = specForks.slice(0, 2).map(n => n.id);
    }
  }

  if (parentIds.length < 2) {
    showToast('Select 2+ panels (Shift+Click or ☐ checkbox) to synthesize.');
    return;
  }

  showToast(`⊕ Synthesizing ${parentIds.length} panels into a unified surface...`, 20000);
  const res = await fetch('/api/nodes/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentIds, instruction, targetStage })
  });
  const data = await res.json();
  selectedForSynth.clear();
  updateSynthButtonLabel();
  if (data.synthNode) {
    showToast(`⊕ Created "${data.synthNode.title}" from ${parentIds.length} parents.`);
  }
}

async function runImplementAgent(nodeId, instruction) {
  showToast('⚙ Running Outbox Agent inside isolated Git worktree...', 15000);
  const res = await fetch('/api/nodes/implement/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, instruction })
  });
  const data = await res.json();
  if (data.implementation) {
    const ins = data.implementation.diff?.insertions ?? 0;
    const passed = data.implementation.testPassed;
    showToast(`⚙ Worktree implementation ${passed ? 'verified ✓' : 'completed'} (+${ins} lines).`);
  }
}

async function commitBranch(nodeId, pruneSiblings = false) {
  showToast('✓ Marked branch as Kept.');
  await fetch('/api/nodes/commit-branch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, pruneSiblings })
  });
}

async function pruneUnkeptForks(parentId) {
  const res = await fetch('/api/nodes/prune-unkept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId })
  });
  const data = await res.json();
  showToast(`Pruned ${data.discarded?.length || 0} unkept speculative fork(s).`);
}

async function advanceStage(nodeId, instruction, targetStage) {
  showToast('Advancing to next stage...', 20000);
  await fetch('/api/nodes/advance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, instruction, targetStage })
  });
  showToast('Next stage created.');
}

// Listen to messages from surface iframes (`window.asterism.*`)
window.addEventListener('message', async (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  const msg = e.data;
  if (!msg.type || !String(msg.type).startsWith('asterism:')) return;
  const senderCard = Array.from(nodesLayer.querySelectorAll('.canvas-node')).find(c => c.querySelector('.node-iframe')?.contentWindow === e.source);
  if (!senderCard) return;
  const verifiedNodeId = senderCard.dataset.id;
  if (msg.type === 'asterism:focus-card') {
    focusedNodeId = verifiedNodeId;
    updateFocusClasses();
  } else if (msg.type === 'asterism:set-state' && msg.patch) {
    const cleanPatch = {};
    for (const k of Object.keys(msg.patch)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      cleanPatch[k] = msg.patch[k];
    }
    const node = state.nodes.find(n => n.id === verifiedNodeId);
    if (node) {
      node.state = Object.assign({}, node.state || {}, cleanPatch);
      senderCard.dataset.lastStateJson = JSON.stringify(node.state || {});
    }
    await fetch('/api/nodes/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: verifiedNodeId, patch: cleanPatch })
    });
  } else if (msg.type === 'asterism:mutate-node') {
    mutateNode(msg.nodeId, msg.instruction);
  } else if (msg.type === 'asterism:spawn-related') {
    triggerSpawnRelated({ ...msg, sourceNodeId: verifiedNodeId });
  } else if (msg.type === 'asterism:trigger-speculate') {
    triggerSpeculate(msg.nodeId, msg.prompt, msg);
  } else if (msg.type === 'asterism:commit-branch') {
    commitBranch(msg.nodeId, Boolean(msg.pruneSiblings));
  } else if (msg.type === 'asterism:prune-unkept') {
    pruneUnkeptForks(msg.parentId || verifiedNodeId);
  } else if (msg.type === 'asterism:advance-stage') {
    advanceStage(msg.nodeId, msg.instruction, msg.targetStage);
  } else if (msg.type === 'asterism:synthesize-nodes') {
    synthesizeSelectedOrKept(msg.parentIds, msg.instruction, msg.targetStage);
  } else if (msg.type === 'asterism:run-implement') {
    runImplementAgent(msg.nodeId, msg.instruction);
  } else if (msg.type === 'asterism:switch-facet') {
    switchOrTearOffFacet(msg.nodeId, msg.facetRole || 'spec-diagram', Boolean(msg.tearOff));
  } else if (msg.type === 'asterism:pulse-basal-energy') {
    pulseBasalFreeEnergy();
  } else if (msg.type === 'asterism:open-compare-matrix') {
    openComparisonMatrix();
  } else if (msg.type === 'asterism:unfold-shadow') {
    unfoldShadowForParent(msg.parentNodeId);
  } else if (msg.type === 'asterism:open-attention-broker') {
    toggleAttentionBroker(true);
  } else if (msg.type === 'asterism:ideabox-seed') {
    submitIdeaBoxSeed(msg.seedPrompt);
  } else if (msg.type === 'asterism:resolve-decision') {
    resolveSurfacedDecision(verifiedNodeId, msg.predictionId, msg.chosenOptionIds || []);
  } else if (msg.type === 'asterism:counterfactual') {
    triggerCounterfactualAction(verifiedNodeId || msg.nodeId, msg.predictionId, msg.action, msg.targetOptionIds);
  } else if (msg.type === 'asterism:card-error') {
    reportClientError({
      source: 'card-iframe',
      kind: msg.kind || 'error',
      nodeId: verifiedNodeId,
      message: msg.message || 'Card runtime error',
      lineno: msg.lineno || null,
      colno: msg.colno || null,
      stack: msg.stack || null
    }, knownServerHello?.bootId || null);
  } else if (msg.type === 'asterism:open-polaris') {
    focusedNodeId = msg.focusNodeId || verifiedNodeId;
    updateFocusClasses();
    polaris.togglePolarisDrawer(true);
    if (msg.prefill) {
      const inp = document.getElementById('polaris-input');
      if (inp) { inp.value = String(msg.prefill); inp.focus(); }
    }
  }
});

async function compileAutonomousIntent(customPrompt, forceProbe = false) {
  const inputEl = document.getElementById('ideabox-input');
  const prompt = (customPrompt || inputEl?.value || '').trim() ||
    'Explore complementary approaches to predictive zero-chrome surfaces';
  if (inputEl && !customPrompt) inputEl.value = '';

  const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
  showToast(
    forceProbe
      ? '🎯 Compiling Calibration Spot-Check Probe with sealed pre-prediction...'
      : '⚡ Compiling local decision structure & evaluating power-set regret...',
    14000
  );
  const res = await fetch('/api/decisions/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      forceProbe,
      attentionalAltitudeScale: state.viewport?.scale || 0.88,
      parentNodeId: focusedNodeId || undefined,
      x: Math.round(center.x - 210),
      y: Math.round(center.y - 110)
    })
  });
  const data = await res.json();
  if (data.regime === 'co-fork') {
    showToast(`✦ Co-Forked ${data.materializedNodes?.length || 2} complementary paths automatically under Basal Energy.`);
  } else if (data.regime === 'act-single') {
    showToast(`⚡ Auto-committed "${data.materializedNodes?.[0]?.title || 'path'}" (expected regret below interruption threshold).`);
  } else if (data.regime === 'abstain-neither') {
    showToast(`∅ Auto-abstained (status-quo outperformed negative-utility options).`);
  } else if (data.regime === 'probe-calibration') {
    showToast(`🎯 Surfaced unanchored choice to spot-check User Model calibration.`);
  } else if (data.regime === 'ask-regret') {
    showToast(`Surfaced high-regret decision (${data.policy?.expectedRegretOfActing} > ask threshold ${data.policy?.effectiveAskCost}).`);
  }
}

async function resolveSurfacedDecision(nodeId, predictionId, chosenOptionIds) {
  const key = `${nodeId}::${predictionId || ''}`;
  if (resolvingDecisionInFlight.has(key)) return;
  resolvingDecisionInFlight.add(key);
  try {
    const res = await fetch('/api/decisions/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, predictionId, chosenOptionIds })
    });
    const data = await res.json();
    if (data.resolvedPrediction) {
      showToast(`✓ ${data.resolvedPrediction.calibrationNote}`, 9000);
    }
  } finally {
    resolvingDecisionInFlight.delete(key);
  }
}

async function triggerCounterfactualAction(nodeId, predictionId, action = 'swap', targetOptionIds = []) {
  const resolvedAction = action || 'swap';
  const key = predictionId + ':' + resolvedAction;
  if (counterfactualInFlight.has(key)) return;
  counterfactualInFlight.add(key);
  try {
    const res = await fetch('/api/decisions/counterfactual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, predictionId, action: resolvedAction, targetOptionIds: Array.isArray(targetOptionIds) ? targetOptionIds : [] })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(`↺ Counterfactual ${resolvedAction} failed${data.error ? `: ${data.error}` : ''}`);
      return;
    }
    showToast(`↺ Counterfactual ${resolvedAction} applied · ${data.resolvedPrediction?.calibrationNote || 'User Model updated'}`);
    if (data.state) {
      const prevViewport = state.viewport ? { ...state.viewport } : null;
      const prevViewProjection = state.viewProjection;
      state = data.state;
      if (prevViewport) state.viewport = prevViewport;
      if (prevViewProjection) state.viewProjection = prevViewProjection;
    } else if (data.userModel) {
      state.userModel = data.userModel;
    }
    renderAll();
  } catch {
    showToast('↺ Counterfactual request failed — please try again.');
  } finally {
    counterfactualInFlight.delete(key);
  }
}

async function tidyCanvasLayout() {
  if (tidyInFlight) return;
  tidyInFlight = true;
  try {
    const res = await fetch('/api/canvas/tidy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(`✨ Tidy failed${data.error ? `: ${data.error}` : ''}`);
      return;
    }
    if (data.state) {
      const prevViewport = state.viewport ? { ...state.viewport } : null;
      const prevViewProjection = state.viewProjection;
      state = data.state;
      if (prevViewport) state.viewport = prevViewport;
      if (prevViewProjection) state.viewProjection = prevViewProjection;
    }
    renderAll();
    showToast(`✨ Tidied canvas layout (${data.movedCount || 0} overlapping card(s) nudged clear).`);
  } catch {
    showToast('✨ Tidy request failed — please try again.');
  } finally {
    tidyInFlight = false;
  }
}

async function observeUserBehavior(type, nodeId, detail) {
  try {
    await fetch('/api/user-model/observe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, nodeId, detail, projectId: state.activeProjectId })
    });
  } catch {}
}

async function pinOrDismissHypothesis(hypothesisId, action) {
  try {
    const res = await fetch('/api/user-model/hypotheses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hypothesisId, action })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(action === 'pin' ? '📌 Pin failed — please try again.' : '✕ Dismiss failed — please try again.');
      return;
    }
    if (data.state) {
      const prevViewport = state.viewport ? { ...state.viewport } : null;
      const prevViewProjection = state.viewProjection;
      state = data.state;
      if (prevViewport) state.viewport = prevViewport;
      if (prevViewProjection) state.viewProjection = prevViewProjection;
    } else if (data.userModel) {
      state.userModel = data.userModel;
    }
    renderAll();
    showToast(action === 'pin'
      ? '📌 Pinned inferred preference to your User Model.'
      : '✕ Dismissed inferred hypothesis.');
  } catch {
    showToast(action === 'pin' ? '📌 Pin failed — please try again.' : '✕ Dismiss failed — please try again.');
  }
}

function panAndFocusNode(nodeId) {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return;
  if (node.shadowStaged) {
    node.shadowStaged = false;
    try { unfoldShadowForParent(node.parentId || node.id); } catch {}
  }
  focusedNodeId = nodeId;
  const scale = Math.max(0.88, state.viewport.scale);
  state.viewport.scale = scale;
  state.viewport.x = Math.round(window.innerWidth / 2 - (node.x + (node.width || 360) / 2) * scale);
  state.viewport.y = Math.round(window.innerHeight / 2 - (node.y + (node.height || 220) / 2) * scale);
  if (state.viewProjection && state.viewProjection !== 'canvas') {
    setViewProjection('canvas');
  } else {
    renderAll();
  }
}

async function toggleHypothesisStatus(hypothesisId, currentStatus) {
  const nextStatus = currentStatus === 'active' ? 'refuted' : 'active';
  await fetch('/api/user-model/hypotheses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hypothesisId, status: nextStatus })
  });
  showToast(nextStatus === 'refuted' ? 'Refuted hypothesis in User Model.' : 'Restored hypothesis in User Model.');
}

async function addNewHypothesisFromUI() {
  const inp = document.getElementById('new-hyp-input');
  const statement = inp?.value?.trim();
  if (!statement) return;
  inp.value = '';
  await fetch('/api/user-model/hypotheses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statement, scopeProjectId: state.activeProjectId || 'global' })
  });
  showToast('Added falsifiable preference hypothesis (scheduled for calibration spot-checking).');
}

async function submitIdeaBoxSeed(customPrompt) {
  const inputEl = document.getElementById('ideabox-input');
  const seedPrompt = (customPrompt || inputEl?.value || '').trim() ||
    'Cross-pollinate epistemic confidence calibration with isolated Git worktree telemetry';
  if (inputEl && !customPrompt) inputEl.value = '';

  const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
  showToast('🌱 Seeding idea and staging 4 Ideonomy + Matchmaker branches in the Shadow Graph...', 18000);
  const res = await fetch('/api/ideabox/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seedPrompt,
      x: Math.round(center.x - 200),
      y: Math.round(center.y - 140)
    })
  });
  const data = await res.json();
  if (data.seedNode) {
    focusedNodeId = data.seedNode.id;
    showToast(`🌱 Seed "${data.seedNode.title}" created with 4 staged branches. Click 🌑 +4 on the card to unfold.`);
  }
}

async function unfoldShadowForParent(parentNodeId) {
  showToast('🌑 Unfolding staged branches onto the canvas...', 10000);
  const res = await fetch('/api/shadow/unfold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentNodeId })
  });
  const data = await res.json();
  if (data.unfoldedNodeIds?.length > 0) {
    showToast(`🌑 Unfolded ${data.unfoldedNodeIds.length} branch(es) onto the canvas.`);
  } else {
    showToast('No staged shadow branches found for this node.');
  }
}

async function unfoldAllShadowBranches() {
  const res = await fetch('/api/shadow/unfold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  showToast(`🌑 Unfolded ${data.unfoldedNodeIds?.length || 0} branch(es) onto the canvas.`);
}

function toggleAttentionBroker(forceOpen) {
  const drawer = document.getElementById('attention-drawer');
  if (!drawer) return;
  if (typeof forceOpen === 'boolean') {
    drawer.classList.toggle('open', forceOpen);
  } else {
    drawer.classList.toggle('open');
  }
  updateAttentionAndWeatherUI();
}

async function autoResolveTopAttentionItem(nodeId) {
  showToast('Auto-resolving top item via default action...', 10000);
  const res = await fetch('/api/attention/auto-resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId })
  });
  const data = await res.json();
  if (data.resolvedNode) {
    showToast(`✓ Resolved "${data.resolvedNode.title}".`);
  }
}

function computeClientEVOI(node) {
  if (typeof node.evoiScore === 'number') return node.evoiScore;
  const p = typeof node.jevScore === 'number' ? node.jevScore : 0.72;
  const entropy = 4 * p * (1 - p);
  const downstreamCount = state.edges.filter(e => e.from === node.id).length;
  const impact = 1 + downstreamCount * 0.45 + (node.stage === 'implement' ? 0.5 : 0.25);
  const unblock = node.shadowStaged ? 1.35 : node.status === 'ready' ? 1.15 : 0.75;
  return Number((entropy * impact * unblock).toFixed(3));
}

function updateAttentionAndWeatherUI() {
  const shadowNodes = state.nodes.filter(n => n.shadowStaged);

  const ranked = state.nodes
    .filter(n => n.shadowStaged || n.kind === 'speculative' || n.kind === 'decision' || n.askDefault || typeof n.jevScore === 'number')
    .map(n => ({
      node: n,
      evoi: computeClientEVOI(n),
      p: typeof n.jevScore === 'number' ? n.jevScore : 0.72
    }))
    .sort((a, b) => b.evoi - a.evoi);

  const btnBroker = document.getElementById('btn-attention-broker');
  const lblBroker = document.getElementById('attn-pill-label');
  if (btnBroker && lblBroker) {
    btnBroker.classList.toggle('has-shadow', shadowNodes.length > 0);
    lblBroker.textContent = shadowNodes.length > 0
      ? `Queue (${ranked.length}) · 🌑 ${shadowNodes.length}`
      : `Queue (${ranked.length})`;
  }

  const listEl = document.getElementById('attention-list');
  if (!listEl) return;
  if (ranked.length === 0) {
    listEl.innerHTML = `<div style="color:#64748b;font-size:11.5px;padding:10px;">No pending items. State an intent in the top bar to act.</div>`;
    return;
  }

  listEl.innerHTML = ranked.slice(0, 8).map(({ node, evoi, p }) => {
    const stanceBadge = (node.stance || node.surfaceRole || 'agent').toUpperCase();
    const shadowTag = node.shadowStaged
      ? `<span style="background:rgba(251,191,36,0.16);color:#fde68a;padding:1px 6px;border-radius:99px;font-size:9px;font-weight:600;">Staged</span>`
      : `<span style="background:rgba(56,189,248,0.12);color:#38bdf8;padding:1px 6px;border-radius:99px;font-size:9px;font-weight:600;">On Canvas</span>`;
    const askLabel = typeof node.askDefault === 'string' ? node.askDefault : (node.askDefault?.label || 'Promote & Keep');
    return `
      <div class="attention-item">
        <div class="attention-item-top">
          <div class="attention-item-title">${escHtml(node.title)}</div>
          <span class="evoi-badge">EVOI ${evoi.toFixed(2)} · p=${p}</span>
        </div>
        <div class="attention-item-meta">
          ${shadowTag}
          <span>${escHtml(stanceBadge)}</span>
          <span>${escHtml((node.model || 'gpt-6-luna').replace('openai/', ''))}</span>
        </div>
        <div class="attention-item-actions">
          ${node.shadowStaged ? `<button class="mini-btn" style="color:#fde68a;border-color:rgba(251,191,36,0.35);" onclick="unfoldShadowForParent('${escAttr(node.parentId || node.id)}')">Unfold</button>` : ''}
          ${node.kind === 'decision' ? `<button class="mini-btn" style="color:#fde68a;border-color:rgba(251,191,36,0.4);" onclick="focusDecisionNode('${escAttr(node.id)}')">Focus Decision</button>` : `<button class="mini-btn" style="color:#6ee7b7;border-color:rgba(16,185,129,0.35);" onclick="autoResolveTopAttentionItem('${escAttr(node.id)}')">✓ ${escHtml(askLabel)}</button>`}
        </div>
      </div>
    `;
  }).join('');
}

const ideaboxInputEl = document.getElementById('ideabox-input');
if (ideaboxInputEl) {
  ideaboxInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') compileAutonomousIntent();
  });
}

// Canvas panning & freehand sketching
viewportEl.addEventListener('pointerdown', (e) => {
  closeWorkspaceMenu();
  if (e.target.closest('.canvas-node') || e.target.closest('.hud-topbar') || e.target.closest('#attention-drawer')) return;

  if (focusedNodeId) {
    focusedNodeId = null;
    renderNodes();
    renderEdges();
  }

  if (mode === 'draw') {
    const pt = screenToWorld(e.clientX, e.clientY);
    activeStroke = { id: 'stroke-' + Date.now(), color: '#38bdf8', points: [pt] };
    state.strokes.push(activeStroke);
    renderStrokes();
    return;
  }

  isPanning = true;
  document.body.classList.add('is-dragging-card');
  viewportEl.classList.add('panning');
  panStart = { x: e.clientX - state.viewport.x, y: e.clientY - state.viewport.y };
});

window.addEventListener('pointermove', (e) => {
  if (activeStroke) {
    activeStroke.points.push(screenToWorld(e.clientX, e.clientY));
    renderStrokes();
    return;
  }
  if (!isPanning) return;
  state.viewport.x = e.clientX - panStart.x;
  state.viewport.y = e.clientY - panStart.y;
  applyTransform();
});

window.addEventListener('pointerup', () => {
  if (activeStroke) {
    activeStroke = null;
    persistState();
  }
  if (isPanning) {
    isPanning = false;
    document.body.classList.remove('is-dragging-card');
    viewportEl.classList.remove('panning');
  }
});

viewportEl.addEventListener('wheel', (e) => {
  if (e.target.closest('.node-body') || e.target.closest('#attention-drawer')) return;
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
  const nextScale = Math.min(2.0, Math.max(0.3, state.viewport.scale * zoomFactor));
  const wx = (e.clientX - state.viewport.x) / state.viewport.scale;
  const wy = (e.clientY - state.viewport.y) / state.viewport.scale;
  state.viewport.scale = nextScale;
  state.viewport.x = e.clientX - wx * nextScale;
  state.viewport.y = e.clientY - wy * nextScale;
  applyTransform();
}, { passive: false });

function createNewSurface() {
  const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
  const id = 'node-proposal-' + Date.now();
  state.nodes.push({
    id,
    title: 'New Feature Proposal',
    kind: 'surface',
    stage: 'note',
    surfaceRole: 'dialogue',
    x: Math.round(center.x - 190),
    y: Math.round(center.y - 115),
    width: 375,
    height: 225,
    projectId: state.activeProjectId || 'proj-misc-attic',
    model: 'antigravity/gemini-4-neon',
    status: 'ready',
    branchTag: 'dialogue',
    state: { priority: 80, scope: 'mvp' },
    html: `<div style="font-family:'Inter',system-ui,sans-serif;padding:14px 16px;color:#e2e8f0;font-size:12px;line-height:1.5;">
  <p style="font-size:11.5px;color:#94a3b8;margin:0 0 12px;">Use the facet tabs above to view Spec, UI, or Code lenses—or ask the agent below to refine this thought.</p>
  <div style="background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:9px 12px;display:flex;align-items:center;gap:8px;font-size:11px;color:#cbd5e1;">
<span>Priority</span>
<input type="range" min="1" max="100" value="80" data-state-key="priority" style="flex:1;accent-color:#38bdf8;" />
  </div>
</div>`
  });
  focusedNodeId = id;
  renderAll();
  persistState();
}

function clearSketches() {
  state.strokes = [];
  renderStrokes();
  persistState();
}

async function resetCanvas() {
  if (!window.confirm('Reset canvas to default state?')) return;
  selectedForSynth.clear();
  focusedNodeId = null;
  updateSynthButtonLabel();
  await fetch('/api/reset', { method: 'POST' });
  showToast('Canvas reset to default state.');
}

async function persistState() {
  await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
}


async function switchToProjectId(projectId) {
  if (!projectId) return;
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeProjectId: projectId })
  });
  const data = await res.json();
  if (data.activeProject) {
    showToast(`📁 Active project switched to "${data.activeProject.name}" (${data.activeProject.repoPath}).`);
  }
}

const projections = createProjectionsController({
  getState: () => state,
  getFocusedNodeId: () => focusedNodeId,
  selectedForSynth
});

const polaris = createPolarisController({
  getState: () => state,
  getFocusedNodeId: () => focusedNodeId,
  setFocusedNodeId: (id) => { focusedNodeId = id; },
  showToast
});

function renderAll() {
  applyTransform();
  renderNodes();
  renderEdges();
  renderStrokes();
  updateAttentionAndWeatherUI();
  projections.renderProjectionViews();
  polaris.updatePolarisFocusPill();
}

const spotlight = createSpotlightController({
  getState: () => state,
  handlers: {
    togglePolarisDrawer: (force) => polaris.togglePolarisDrawer(force),
    tidyCanvasLayout,
    setViewProjection,
    compileAutonomousIntent,
    submitIdeaBoxSeed,
    pulseBasalFreeEnergy,
    cycleOrPromptProject,
    switchToProjectId,
    panAndFocusNode,
    sendPolarisMessage: (txt) => polaris.sendPolarisMessage(txt)
  }
});

polaris.bindPolarisInput();
spotlight.bindSpotlightEvents();

document.addEventListener('click', (e) => {
  if (!e.target.closest('.workspace-menu-wrap')) closeWorkspaceMenu();
});

function zoomByFactor(factor) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const wx = (cx - state.viewport.x) / state.viewport.scale;
  const wy = (cy - state.viewport.y) / state.viewport.scale;
  const nextScale = Math.min(3.0, Math.max(0.15, state.viewport.scale * factor));
  state.viewport.scale = nextScale;
  state.viewport.x = cx - wx * nextScale;
  state.viewport.y = cy - wy * nextScale;
  applyTransform();
}

window.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  const target = e.target || document.activeElement;
  const tag = target && target.tagName ? String(target.tagName).toUpperCase() : '';
  const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target && target.isContentEditable);
  if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
    e.preventDefault();
    spotlight.toggleSpatialSpotlight();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'j') {
    e.preventDefault();
    polaris.togglePolarisDrawer();
    return;
  }
  if (e.key === 'Escape') {
    const spotlightEl = document.getElementById('spotlight-modal');
    if (spotlightEl && spotlightEl.classList.contains('open')) { spotlight.closeSpatialSpotlight(); return; }
    const dd = document.getElementById('workspace-dropdown');
    if (dd && !dd.hidden) { closeWorkspaceMenu(); return; }
    if (target && target.id === 'polaris-input' && !target.value) {
      polaris.togglePolarisDrawer(false);
      target.blur();
      return;
    }
    if (inField) return;
    const compare = document.getElementById('compare-modal');
    if (compare && compare.classList.contains('open')) { closeComparisonMatrix(); return; }
    const drawer = document.getElementById('attention-drawer');
    if (drawer && drawer.classList.contains('open')) { drawer.classList.remove('open'); return; }
    const polarisDrawer = document.getElementById('polaris-drawer');
    if (polarisDrawer && polarisDrawer.classList.contains('open')) { polaris.togglePolarisDrawer(false); return; }
    const editing = document.querySelectorAll('.canvas-node.editing-html, .canvas-node.viewing-diff');
    if (editing.length) { editing.forEach(c => c.classList.remove('editing-html', 'viewing-diff')); return; }
    if (state.viewProjection && state.viewProjection !== 'canvas') { setViewProjection('canvas'); return; }
    if (focusedNodeId || connectSourceId) {
      focusedNodeId = null;
      connectSourceId = null;
      document.querySelectorAll('.canvas-node.is-connect-source').forEach(c => c.classList.remove('is-connect-source'));
      updateFocusClasses();
      renderEdges();
    }
    return;
  }
  if (inField) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const viewMap = { '1': 'canvas', '2': 'plex', '3': 'table', '4': 'timeline', '5': 'model', '6': 'brief' };
  if (viewMap[e.key]) { setViewProjection(viewMap[e.key]); return; }
  if (e.key === '=' || e.key === '+') { zoomByFactor(1.12); return; }
  if (e.key === '-' || e.key === '_') { zoomByFactor(0.88); return; }
  if (e.key === '0') { resetViewportZoom(); return; }
});

// Expose inline HTML callbacks on window so semantic markup stays declarative
Object.assign(window, {
  cycleOrPromptProject,
  promptAddProject,
  switchToProjectId,
  compileAutonomousIntent,
  setViewProjection,
  focusPlexNode,
  setMode,
  synthesizeSelectedOrKept,
  openComparisonMatrix,
  closeComparisonMatrix,
  synthesizeFromComparisonMatrix,
  openSpatialSpotlight: () => spotlight.openSpatialSpotlight(),
  closeSpatialSpotlight: () => spotlight.closeSpatialSpotlight(),
  toggleSpatialSpotlight: () => spotlight.toggleSpatialSpotlight(),
  toggleAttentionBroker,
  unfoldAllShadowBranches,
  unfoldShadowForParent,
  autoResolveTopAttentionItem,
  togglePolarisDrawer: (force) => polaris.togglePolarisDrawer(force),
  sendPolarisMessage: (txt) => polaris.sendPolarisMessage(txt),
  sendPolarisStarter: (txt) => polaris.sendPolarisStarter(txt),
  onPolarisModelChange: (val) => polaris.onPolarisModelChange(val),
  resetPolarisChat: () => polaris.resetPolarisChat(),
  interruptPolaris: () => polaris.interruptPolaris(),
  applySeamlessSelfReload: () => polaris.applySeamlessSelfReload(),
  resetViewportZoom,
  toggleWorkspaceMenu,
  closeWorkspaceMenu,
  submitIdeaBoxSeed,
  createNewSurface,
  tidyCanvasLayout,
  pulseBasalFreeEnergy,
  pruneUnkeptForks,
  clearSketches,
  resetCanvas,
  undoDeleteCard,
  addNewHypothesisFromUI,
  toggleHypothesisStatus,
  pinOrDismissHypothesis,
  toggleNodeSynthSelection,
  commitBranch,
  focusDecisionNode,
  panAndFocusNode,
  resolveSurfacedDecision,
  triggerCounterfactualAction
});

const evtSource = new EventSource('/api/events');
evtSource.onopen = () => {
  const dot = document.getElementById('brand-health-dot');
  if (dot) { dot.style.background = '#10b981'; dot.style.boxShadow = '0 0 6px rgba(16, 185, 129, 0.6)'; }
};
evtSource.onerror = () => {
  const dot = document.getElementById('brand-health-dot');
  if (dot) { dot.style.background = '#fbbf24'; dot.style.boxShadow = '0 0 6px rgba(251, 191, 36, 0.6)'; }
};
evtSource.addEventListener('server_hello', (e) => {
  let hello;
  try { hello = JSON.parse(e.data); } catch { return; }
  if (!hello || typeof hello !== 'object') return;
  if (!knownServerHello) {
    knownServerHello = hello;
    return;
  }
  const incomingHash = hello.uiBundleHash || hello.indexHtmlHash;
  const previousHash = knownServerHello.uiBundleHash || knownServerHello.indexHtmlHash;
  if (incomingHash && incomingHash !== previousHash) {
    pendingServerHello = hello;
    const banner = document.getElementById('self-update-banner');
    const txt = document.getElementById('self-update-text');
    if (txt) txt.textContent = `✦ New Asterism UI ready (${hello.gitSha || 'updated'})`;
    if (banner) banner.classList.add('visible');
  } else if (hello.bootId && hello.bootId !== knownServerHello.bootId) {
    knownServerHello = hello;
    showToast(`✦ Live backend hot-reloaded (${hello.gitSha || 'updated'}) — workspace preserved.`);
  }
});
evtSource.addEventListener('polaris_update', (e) => {
  let incoming;
  try { incoming = JSON.parse(e.data); } catch { return; }
  if (!incoming || typeof incoming !== 'object') return;
  polaris.setPolarisState(incoming);
  polaris.renderPolarisUI(false);
});
evtSource.addEventListener('state', (e) => {
  let incoming;
  try { incoming = JSON.parse(e.data); } catch { return; }
  if (!incoming || typeof incoming !== 'object') return;
  const prevViewport = state.viewport ? { ...state.viewport } : null;
  const prevViewProjection = state.viewProjection;
  incoming.nodes = Array.isArray(incoming.nodes) ? incoming.nodes : [];
  incoming.edges = Array.isArray(incoming.edges) ? incoming.edges : [];
  incoming.strokes = Array.isArray(incoming.strokes) ? incoming.strokes : [];
  incoming.projects = Array.isArray(incoming.projects) ? incoming.projects : (state.projects || []);
  const rawVp = incoming.viewport && typeof incoming.viewport === 'object' ? incoming.viewport : {};
  incoming.viewport = {
    x: typeof rawVp.x === 'number' ? rawVp.x : 65,
    y: typeof rawVp.y === 'number' ? rawVp.y : 55,
    scale: Math.min(3.0, Math.max(0.15, typeof rawVp.scale === 'number' ? rawVp.scale : 0.88))
  };
  const activeGeomId = draggingNodeId || resizingNodeId;
  if (activeGeomId) {
    const localNode = state.nodes.find(n => n.id === activeGeomId);
    const incomingNode = incoming.nodes.find(n => n.id === activeGeomId);
    if (localNode && incomingNode) {
      incomingNode.x = localNode.x;
      incomingNode.y = localNode.y;
      incomingNode.width = localNode.width;
      incomingNode.height = localNode.height;
    }
  }
  state = incoming;
  if (prevViewport) {
    state.viewport = { ...prevViewport, scale: Math.min(3.0, Math.max(0.15, prevViewport.scale || 0.88)) };
  }
  if (prevViewProjection) state.viewProjection = prevViewProjection;
  polaris.restoreSeamlessReloadIfPresent();
  const validIds = new Set(state.nodes.map(n => n.id));
  for (const id of [...selectedForSynth]) { if (!validIds.has(id)) selectedForSynth.delete(id); }
  if (focusedNodeId && !validIds.has(focusedNodeId)) focusedNodeId = null;
  if (connectSourceId && !validIds.has(connectSourceId)) connectSourceId = null;
  comparedNodeIds = comparedNodeIds.filter(id => validIds.has(id));
  updateSynthButtonLabel();
  renderAll();
});

polaris.hydrateLiveT3Providers();
