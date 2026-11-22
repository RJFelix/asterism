export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escAttr(s) {
  return escHtml(s);
}

export function defaultRoleForStage(stage) {
  if (stage === 'refine') return 'spec-diagram';
  if (stage === 'design') return 'ui-prototype';
  if (stage === 'implement') return 'artifact-harness';
  return 'dialogue';
}

/**
 * Injects the bidirectional `window.asterism` SDK + runtime error telemetry into every surface iframe
 */
export function buildSrcDoc(node, options = {}) {
  const initialStateJson = JSON.stringify(node.state || {}).replace(/</g, '\\u003c');
  const nodeIdJson = JSON.stringify(node.id);
  const stageJson = JSON.stringify(node.stage || 'note');
  const roleJson = JSON.stringify(node.surfaceRole || defaultRoleForStage(node.stage));
  const modelJson = JSON.stringify(node.model || 'antigravity/gemini-4-neon');
  const readOnlyJson = JSON.stringify(Boolean(options.readOnly));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; background: transparent; color: #e2e8f0; overflow-x: hidden; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.25); border-radius: 4px; }
  </style>
  <script>
    (function() {
      const _state = ${initialStateJson};
      const _readOnly = ${readOnlyJson};
      window.asterism = {
        nodeId: ${nodeIdJson},
        stage: ${stageJson},
        surfaceRole: ${roleJson},
        model: ${modelJson},
        readOnly: _readOnly,
        state: _state,
        getState() {
          return Object.assign({}, _state);
        },
        setState(patch) {
          if (_readOnly) return _state;
          if (!patch || typeof patch !== 'object') return _state;
          const cleanPatch = {};
          for (const k of Object.keys(patch)) {
            if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
            cleanPatch[k] = patch[k];
          }
          Object.assign(_state, cleanPatch);
          window.parent.postMessage({
            type: 'asterism:set-state',
            nodeId: this.nodeId,
            patch: cleanPatch
          }, '*');
          window.dispatchEvent(new CustomEvent('asterism:statechange', { detail: this.getState() }));
          return this.getState();
        },
        mutate(instruction) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:mutate-node',
            nodeId: this.nodeId,
            instruction: instruction
          }, '*');
        },
        updatePanel(targetNodeId, instruction) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:mutate-node',
            nodeId: targetNodeId || this.nodeId,
            instruction: instruction
          }, '*');
        },
        spawnRelatedPanel(options) {
          if (_readOnly) return;
          const opts = typeof options === 'string' ? { prompt: options } : (options || {});
          window.parent.postMessage({
            type: 'asterism:spawn-related',
            sourceNodeId: this.nodeId,
            relation: opts.relation || 'visualizes-ui',
            surfaceRole: opts.surfaceRole,
            title: opts.title,
            prompt: opts.prompt
          }, '*');
        },
        spawnFork(prompt, options) {
          if (_readOnly) return;
          window.parent.postMessage(Object.assign({
            type: 'asterism:trigger-speculate',
            nodeId: this.nodeId,
            prompt: prompt
          }, options || {}), '*');
        },
        keepFork(pruneSiblings) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:commit-branch',
            nodeId: this.nodeId,
            pruneSiblings: Boolean(pruneSiblings)
          }, '*');
        },
        advanceStage(instruction, targetStage) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:advance-stage',
            nodeId: this.nodeId,
            instruction: instruction,
            targetStage: targetStage
          }, '*');
        },
        synthesizeWith(otherNodeIds, instruction, targetStage) {
          if (_readOnly) return;
          const ids = [this.nodeId].concat(Array.isArray(otherNodeIds) ? otherNodeIds : [otherNodeIds]);
          window.parent.postMessage({
            type: 'asterism:synthesize-nodes',
            parentIds: ids,
            instruction: instruction,
            targetStage: targetStage
          }, '*');
        },
        runImplementAgent(instruction) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:run-implement',
            nodeId: this.nodeId,
            instruction: instruction
          }, '*');
        },
        switchFacet(facetRole, tearOff) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:switch-facet',
            nodeId: this.nodeId,
            facetRole: facetRole || 'spec-diagram',
            tearOff: Boolean(tearOff)
          }, '*');
        },
        tearOffFacet(facetRole) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:switch-facet',
            nodeId: this.nodeId,
            facetRole: facetRole || 'spec-diagram',
            tearOff: true
          }, '*');
        },
        pulseBasalEnergy() {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:pulse-basal-energy',
            nodeId: this.nodeId
          }, '*');
        },
        openComparisonMatrix() {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:open-compare-matrix',
            nodeId: this.nodeId
          }, '*');
        },
        unfoldShadowChildren() {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:unfold-shadow',
            parentNodeId: this.nodeId
          }, '*');
        },
        openAttentionBroker() {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:open-attention-broker',
            nodeId: this.nodeId
          }, '*');
        },
        submitIdeaBoxSeed(seedPrompt) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:ideabox-seed',
            seedPrompt: seedPrompt
          }, '*');
        },
        resolveDecision(predictionId, chosenOptionIds) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:resolve-decision',
            nodeId: this.nodeId,
            predictionId: predictionId,
            chosenOptionIds: Array.isArray(chosenOptionIds) ? chosenOptionIds : (chosenOptionIds ? [chosenOptionIds] : [])
          }, '*');
        },
        counterfactual(action, predictionId, targetOptionIds) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:counterfactual',
            nodeId: this.nodeId,
            predictionId: predictionId,
            action: action,
            targetOptionIds: Array.isArray(targetOptionIds) ? targetOptionIds : (targetOptionIds ? [targetOptionIds] : [])
          }, '*');
        },
        pruneUnkept(parentId) {
          if (_readOnly) return;
          window.parent.postMessage({
            type: 'asterism:prune-unkept',
            nodeId: this.nodeId,
            parentId: parentId || this.nodeId
          }, '*');
        },
        openPolaris(prefill) {
          window.parent.postMessage({
            type: 'asterism:open-polaris',
            focusNodeId: this.nodeId,
            prefill: prefill || ''
          }, '*');
        },
        bindInputs(root) {
          const container = root || document;
          const els = container.querySelectorAll('input[data-state-key], select[data-state-key], textarea[data-state-key], input[name], select[name], textarea[name]');
          els.forEach((el) => {
            const key = el.getAttribute('data-state-key') || el.getAttribute('name');
            if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') return;
            if (Object.prototype.hasOwnProperty.call(_state, key)) {
              if (el.type === 'checkbox') {
                el.checked = Boolean(_state[key]);
              } else if (String(el.value) !== String(_state[key])) {
                el.value = _state[key];
                if (!el._asterismBound) { try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {} }
              }
            }
            if (el._asterismBound) return;
            el._asterismBound = true;
            const readVal = () => {
              let val = el.type === 'checkbox' ? el.checked : el.value;
              if (el.type === 'range' || el.type === 'number') {
                const num = Number(val);
                if (!Number.isNaN(num)) val = num;
              }
              return val;
            };
            let debounceTimer = null;
            const sync = () => { window.asterism.setState({ [key]: readVal() }); };
            el.addEventListener('input', () => {
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(sync, 120);
            });
            el.addEventListener('change', () => {
              clearTimeout(debounceTimer);
              sync();
            });
          });
        }
      };
      window.addEventListener('error', (ev) => {
        try {
          window.parent.postMessage({
            type: 'asterism:card-error',
            nodeId: window.asterism.nodeId,
            kind: 'error',
            message: ev && ev.message ? ev.message : 'Card runtime error',
            lineno: ev && ev.lineno ? ev.lineno : null,
            colno: ev && ev.colno ? ev.colno : null,
            stack: ev && ev.error && ev.error.stack ? ev.error.stack : null
          }, '*');
        } catch {}
      });
      window.addEventListener('unhandledrejection', (ev) => {
        try {
          const r = ev && ev.reason;
          window.parent.postMessage({
            type: 'asterism:card-error',
            nodeId: window.asterism.nodeId,
            kind: 'unhandledrejection',
            message: r && r.message ? r.message : String(r || 'Card unhandled promise rejection'),
            stack: r && r.stack ? r.stack : null
          }, '*');
        } catch {}
      });
      document.addEventListener('pointerdown', () => {
        try { window.parent.postMessage({ type: 'asterism:focus-card', nodeId: window.asterism.nodeId }, '*'); } catch {}
      });
      window.addEventListener('message', (e) => { if (e.data?.type === 'asterism:state-sync' && e.data.state) { for (const k of ['__proto__', 'constructor', 'prototype']) delete e.data.state[k]; Object.assign(_state, e.data.state); window.asterism.bindInputs(document); window.dispatchEvent(new CustomEvent('asterism:statechange', { detail: window.asterism.getState() })); } });
      window.addEventListener('DOMContentLoaded', () => {
        window.asterism.bindInputs(document);
      });
    })();
  <\/script></head><body>${node.html || ''}</body></html>`;
}

export function formatDiffPatchHtml(node) {
  const impl = node.implementation;
  const wt = node.worktree;
  if (!wt && !impl) {
    return `<div style="color:#94a3b8;padding:8px;">No isolated Git worktree provisioned yet. Click <strong>▶ Run Agent</strong> above to provision a worktree, generate code &amp; tests, and inspect the live Git diff.</div>`;
  }
  const diff = impl?.diff;
  const patchLines = (diff?.patch || '').split('\n');
  const coloredPatch = patchLines.map((line) => {
    const esc = escHtml(line);
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return `<div style="background:rgba(16,185,129,0.14);color:#6ee7b7;">${esc}</div>`;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return `<div style="background:rgba(239,68,68,0.14);color:#fca5a5;">${esc}</div>`;
    }
    if (line.startsWith('@@')) {
      return `<div style="color:#38bdf8;margin-top:4px;">${esc}</div>`;
    }
    return `<div style="color:#94a3b8;">${esc}</div>`;
  }).join('');

  const filesHtml = (diff?.changedFiles || []).map(f =>
    `<span style="background:rgba(30,41,59,0.9);border:1px solid rgba(148,163,184,0.25);padding:2px 6px;border-radius:4px;font-size:10px;">${escHtml(f.status)} ${escHtml(f.path)} (<span style="color:#34d399">+${escHtml(f.insertions)}</span>/<span style="color:#f87171">-${escHtml(f.deletions)}</span>)</span>`
  ).join(' ');

  return `
    <div style="margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(148,163,184,0.2);">
      <div style="display:flex;justify-content:space-between;color:#f8fafc;font-weight:700;margin-bottom:4px;">
        <span>Branch: ${escHtml(wt?.branchName || diff?.branchName || 'asterism/implement')}</span>
        <span>HEAD: ${escHtml(wt?.headCommit || diff?.headCommit || wt?.baseCommit || 'HEAD')}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">${filesHtml || '<span style="color:#64748b;">Working tree clean (all changes committed)</span>'}</div>
      ${impl?.testOutput ? `<details style="margin-top:4px;"><summary style="cursor:pointer;color:${impl.testPassed ? '#34d399' : '#f87171'};font-weight:600;">${impl.testPassed ? '✓ node --test Passed' : '✕ node --test Failed'} (${impl.lineageCount || 1} panel lineage)</summary><pre style="margin:4px 0 0;padding:6px;background:#020617;border-radius:4px;color:#cbd5e1;white-space:pre-wrap;font-size:10px;">${escHtml(impl.testOutput)}</pre></details>` : ''}
    </div>
    <div style="font-size:10px;line-height:1.4;white-space:pre-wrap;">${coloredPatch || '<span style="color:#64748b;">No uncommitted diff lines.</span>'}</div>
  `;
}
