import { escHtml, escAttr, defaultRoleForStage } from './card-srcdoc.mjs';

export function createProjectionsController({
  getState,
  getFocusedNodeId,
  selectedForSynth
}) {
  let briefingInFlight = false;
  let briefingLastFetchAt = 0;
  let lastBriefingData = null;

  function renderBriefView(briefingData) {
    const state = getState();
    const needsEl = document.getElementById('brief-needs-list');
    const autoEl = document.getElementById('brief-autonomous-list');
    const modelSummaryEl = document.getElementById('brief-model-summary');
    const modelListEl = document.getElementById('brief-model-list');
    if (!needsEl || !autoEl || !modelListEl) return;
    const briefing = briefingData && typeof briefingData === 'object' ? briefingData : {};
    const briefNodes = Array.isArray(briefing.nodes) ? briefing.nodes : state.nodes;
    const byId = new Map(briefNodes.map(n => [n.id, n]));
    const resolveList = (list, fallback) => Array.isArray(list) && list.length
      ? list.map(item => {
          if (typeof item === 'string') return byId.get(item);
          const itemId = item?.nodeId || item?.id;
          const full = itemId ? byId.get(itemId) : null;
          return full ? { ...full, ...item, id: full.id, autonomousReceipt: full.autonomousReceipt } : (itemId ? { ...item, id: itemId } : item);
        }).filter(Boolean)
      : fallback;

    const needsFallback = briefNodes.filter(n =>
      (n.kind === 'decision' && n.status !== 'committed' && !n.resolvedAt) || n.shadowStaged);
    const needs = resolveList(briefing.needsYourCall || briefing.needsCall || briefing.decisions, needsFallback);
    needsEl.innerHTML = needs.length === 0
      ? `<div class="brief-empty">Nothing is waiting on you. Enjoy the coffee.</div>`
      : needs.map(n => `
        <div class="brief-item">
          <div class="brief-item-title">${escHtml(n.title || n.id)}</div>
          <div class="brief-item-meta">${n.shadowStaged ? '🌑 Staged shadow branch' : 'Decision awaiting your call'} · ${escHtml(n.stage || 'note')}</div>
          <div class="brief-item-actions">
            <button class="mini-btn" onclick="panAndFocusNode('${escAttr(n.id)}')">Focus on Canvas</button>
          </div>
        </div>`).join('');

    const autoFallback = briefNodes.filter(n =>
      n.autonomousReceipt || n.kind === 'synthesis' || n.branchTag === 'synthesis' ||
      String(n.id).startsWith('node-synth-') ||
      n.basalRecharged || n.basal?.recharged || (n.energy?.basalRechargedTokens || 0) > 0);
    const autonomous = resolveList(briefing.autonomousAndBasalMoves || briefing.autonomousMoves || briefing.autonomous || briefing.basalMoves, autoFallback);
    autoEl.innerHTML = autonomous.length === 0
      ? `<div class="brief-empty">No autonomous or basal moves yet.</div>`
      : autonomous.map(n => {
          const receipt = n.autonomousReceipt || {};
          const predictionId = receipt.predictionId || n.predictionId || '';
          const regime = receipt.regime || n.regime || '';
          const meta = regime
            ? `${escHtml(regime)}${receipt.note || receipt.calibrationNote ? ` · ${escHtml(receipt.note || receipt.calibrationNote)}` : ''}`
            : (n.basalRecharged || n.basal?.recharged ? '🔋 Basal free-energy recharge' : 'Synthesis');
          const counterfactualButtons = (n.autonomousReceipt || n.canSwapCounterfactual)
            ? `<button class="mini-btn" onclick="triggerCounterfactualAction('${escAttr(n.id)}', '${escAttr(predictionId)}', 'swap')">↺ Swap</button>
               <button class="mini-btn" onclick="triggerCounterfactualAction('${escAttr(n.id)}', '${escAttr(predictionId)}', 'keep-both')">✦ Keep Both</button>
               <button class="mini-btn" onclick="triggerCounterfactualAction('${escAttr(n.id)}', '${escAttr(predictionId)}', 'neither')">∅ Neither</button>`
            : '';
          return `
        <div class="brief-item">
          <div class="brief-item-title">${escHtml(n.title || n.id)}</div>
          <div class="brief-item-meta">${meta}</div>
          <div class="brief-item-actions">
            <button class="mini-btn" onclick="panAndFocusNode('${escAttr(n.id)}')">Focus on Canvas</button>
            ${counterfactualButtons}
          </div>
        </div>`;
        }).join('');

    const um = briefing.userModel || state.userModel || {};
    const hyps = Array.isArray(um.hypotheses) ? um.hypotheses : [];
    const activeHyps = hyps.filter(h => h.status === 'active');
    const totalTrials = activeHyps.reduce((s, h) => s + (h.empiricalTrials || 0), 0);
    const totalHits = activeHyps.reduce((s, h) => s + (h.empiricalHits || 0), 0);
    const totalBrier = activeHyps.reduce((s, h) => s + (h.brierSum || 0), 0);
    const modelShifts = briefing.modelShifts && typeof briefing.modelShifts === 'object' ? briefing.modelShifts : {};
    const calibration = modelShifts.calibration || briefing.calibration || {};
    const meanBrier = typeof calibration.meanBrier === 'number'
      ? calibration.meanBrier.toFixed(3)
      : totalTrials > 0 ? (totalBrier / totalTrials).toFixed(3) : '0.250';
    const hitRate = modelShifts.resolvedCount > 0
      ? `${Math.round(((modelShifts.accurateCount || 0) / modelShifts.resolvedCount) * 100)}%`
      : totalTrials > 0 ? `${Math.round((totalHits / totalTrials) * 100)}%` : '—';
    const calibrationFactor = calibration.calibrationFactor ?? briefing.calibrationFactor ?? um.calibrationFactor ?? '—';
    if (modelSummaryEl) {
      modelSummaryEl.innerHTML = `
        <div class="brief-item" style="font-family:ui-monospace,monospace;font-size:11px;">
          <div>Calibration factor: <strong style="color:#38bdf8;">${escHtml(calibrationFactor)}</strong></div>
          <div>Hit rate: <strong style="color:#6ee7b7;">${hitRate}</strong> (${totalHits}/${totalTrials}) · Mean Brier: <strong>${meanBrier}</strong></div>
        </div>`;
    }
    const inferredHyps = Array.isArray(modelShifts.inferredHypotheses)
      ? modelShifts.inferredHypotheses.filter(h => !h.pinned)
      : activeHyps.filter(h => h.source === 'inferred' && !h.pinned);
    const staleHyps = Array.isArray(modelShifts.staleHypotheses)
      ? modelShifts.staleHypotheses
      : activeHyps.filter(h => h.stale || (h.usesSinceLastProbe || 0) >= 3);
    const modelItems = [
      ...inferredHyps.map(h => `
        <div class="brief-item">
          <div style="line-height:1.45;"><span style="background:rgba(168,85,247,0.18);color:#d8b4fe;border:1px solid rgba(168,85,247,0.35);padding:1px 6px;border-radius:99px;font-size:9.5px;font-weight:600;margin-right:6px;">✦ inferred</span>${escHtml(h.statement)}</div>
          <div class="brief-item-actions">
            <button class="mini-btn" onclick="pinOrDismissHypothesis('${escAttr(h.id)}', 'pin')">✓ Pin</button>
            <button class="mini-btn" onclick="pinOrDismissHypothesis('${escAttr(h.id)}', 'dismiss')">✕ Dismiss</button>
          </div>
        </div>`),
      ...staleHyps.map(h => `
        <div class="brief-item">
          <div style="line-height:1.45;">${escHtml(h.statement)}</div>
          <div class="brief-item-meta">Stale · ${h.usesSinceLastProbe || 0} auto-uses since last probe</div>
          <div class="brief-item-actions">
            <button class="mini-btn" onclick="compileAutonomousIntent(undefined, true)">🎯 Spot-Check</button>
          </div>
        </div>`)
    ];
    modelListEl.innerHTML = modelItems.length === 0
      ? `<div class="brief-empty">No new inferred or stale hypotheses.</div>`
      : modelItems.join('');
  }

  async function fetchBriefing(force = false) {
    if (briefingInFlight) return;
    if (!force && Date.now() - briefingLastFetchAt < 4000) return;
    briefingInFlight = true;
    briefingLastFetchAt = Date.now();
    try {
      const res = await fetch('/api/views/briefing');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data) return;
      lastBriefingData = data;
      const state = getState();
      if (state.viewProjection === 'brief') renderBriefView(data);
    } catch {
    } finally {
      briefingInFlight = false;
    }
  }

  function renderProjectionViews() {
    const state = getState();
    const focusedNodeId = getFocusedNodeId();

    const projLbl = document.getElementById('project-pill-label');
    if (projLbl) {
      const projects = state.projects || [];
      const activeProj =
        projects.find(p => p.id === state.activeProjectId) ||
        projects.find(p => p.isDefaultMisc) ||
        { name: 'agent-attic (misc)', repoPath: '/home/exedev/agent-attic' };
      projLbl.textContent = activeProj.name;
    }

    const viewProj = state.viewProjection || 'canvas';
    document.body.classList.remove('view-canvas', 'view-plex', 'view-table', 'view-timeline', 'view-model', 'view-brief');
    document.body.classList.add('view-' + viewProj);
    document.querySelectorAll('#view-switcher .seg-btn').forEach(b => b.classList.remove('active'));
    const activeViewBtn = document.getElementById('view-' + viewProj);
    if (activeViewBtn) activeViewBtn.classList.add('active');

    const plexTitleEl = document.getElementById('plex-focus-title');
    if (plexTitleEl) {
      const pFocus = state.nodes.find(n => n.id === (state.plexFocusNodeId || focusedNodeId || 'node-ergodic-algebra'));
      if (pFocus) plexTitleEl.textContent = pFocus.title;
    }

    const tableBody = document.getElementById('table-view-body');
    const tableSub = document.getElementById('table-view-subtitle');
    if (tableBody) {
      if (tableSub) {
        tableSub.textContent = `${state.nodes.length} nodes (${state.nodes.filter(n => !n.shadowStaged).length} visible · ${state.nodes.filter(n => n.shadowStaged).length} staged in Shadow Graph)`;
      }
      tableBody.innerHTML = state.nodes.map(n => {
        const isChecked = selectedForSynth.has(n.id);
        const role = n.surfaceRole || defaultRoleForStage(n.stage);
        const pVal = n.warrant?.pass ?? n.jevScore;
        const pScore = typeof pVal === 'number' ? `p=${pVal}` : '—';
        const verdict = n.warrant?.verdict || (n.status === 'committed' ? 'pass' : 'calibrated');
        const tokens = n.energy?.remainingTokens;
        const tupleText = n.ideonomyTuple?.tupleLabel || n.ideonomy?.tupleLabel || (n.branchTag || 'canonical');
        return `
          <tr style="${n.shadowStaged ? 'opacity:0.65;' : ''}">
            <td>
              <button class="mini-btn" onclick="toggleNodeSynthSelection('${escAttr(n.id)}')">${isChecked ? '☑' : '☐'}</button>
            </td>
            <td>
              <div style="font-weight:600;color:#f8fafc;">${escHtml(n.title)}</div>
              <div style="font-size:10.5px;color:#8b9bb4;margin-top:2px;">${escHtml(n.id)}${n.shadowStaged ? ' · 🌑 Shadow Staged' : ''}</div>
            </td>
            <td><span class="node-stage-pill" style="display:inline-block;">${escHtml((n.stage || 'note').toUpperCase())}</span></td>
            <td style="font-family:ui-monospace,monospace;font-size:11px;color:#cbd5e1;">${escHtml(role)}</td>
            <td style="font-family:ui-monospace,monospace;font-size:11px;color:${verdict === 'pass' ? '#6ee7b7' : '#38bdf8'};">${escHtml(verdict)} · ${escHtml(pScore)}</td>
            <td style="font-family:ui-monospace,monospace;font-size:11px;color:#94a3b8;">${tokens !== undefined && tokens !== null ? `${escHtml(tokens)} tok` : '—'}</td>
            <td style="font-family:ui-monospace,monospace;font-size:10.5px;color:#fde68a;">${escHtml(tupleText)}</td>
            <td>
              <div style="display:flex;gap:5px;">
                <button class="mini-btn" onclick="setViewProjection('plex', '${escAttr(n.id)}')">🕸 Focus in Plex</button>
                <button class="mini-btn" onclick="commitBranch('${escAttr(n.id)}', false)">✓ Keep</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const timelineBody = document.getElementById('timeline-view-body');
    if (timelineBody) {
      const stagesOrder = ['note', 'brainstorm', 'refine', 'design', 'implement'];
      const sortedNodes = [...state.nodes].sort((a, b) => {
        const sa = stagesOrder.indexOf(a.stage || 'note');
        const sb = stagesOrder.indexOf(b.stage || 'note');
        if (sa !== sb) return sa - sb;
        return String(a.id).localeCompare(String(b.id));
      });
      timelineBody.innerHTML = sortedNodes.map(n => {
        const parent = state.nodes.find(p => p.id === n.parentId);
        const revCount = Array.isArray(n.revisions) ? n.revisions.length : 0;
        const tupleLabel = n.ideonomyTuple?.tupleLabel || n.ideonomy?.tupleLabel;
        const tupleBadge = tupleLabel
          ? `<span style="color:#fde68a;font-family:ui-monospace,monospace;font-size:10.5px;">⧖ ${escHtml(tupleLabel)}</span>`
          : '';
        return `
          <div class="timeline-entry">
            <div class="timeline-card">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <div>
                  <span class="node-stage-pill" style="display:inline-block;margin-right:6px;">${escHtml((n.stage || 'note').toUpperCase())}</span>
                  <strong style="color:#f8fafc;font-size:13px;">${escHtml(n.title)}</strong>
                  ${n.shadowStaged ? '<span style="margin-left:6px;color:#fde68a;font-size:10.5px;">🌑 Shadow Staged</span>' : ''}
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  ${tupleBadge}
                  <button class="mini-btn" onclick="setViewProjection('plex', '${escAttr(n.id)}')">🕸 Focus in Plex</button>
                </div>
              </div>
              <div style="font-size:11px;color:#94a3b8;display:flex;gap:14px;flex-wrap:wrap;">
                <span>Facet: <strong style="color:#cbd5e1;">${escHtml(n.surfaceRole || defaultRoleForStage(n.stage))}</strong></span>
                ${parent ? `<span>Derived from: <strong style="color:#38bdf8;">${escHtml(parent.title)}</strong></span>` : '<span>Root Seed Node</span>'}
                <span>Revisions: <strong style="color:#cbd5e1;">v${revCount + 1}</strong></span>
                ${n.worktree?.branchName ? `<span>Branch: <code style="color:#6ee7b7;">${escHtml(n.worktree.branchName)}</code></span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    const um = state.userModel;
    const hypListEl = document.getElementById('model-hypotheses-list');
    const profListEl = document.getElementById('model-profiles-list');
    const predListEl = document.getElementById('model-predictions-list');
    const calSummaryEl = document.getElementById('model-calibration-summary');
    if (um && hypListEl) {
      const hyps = um.hypotheses || [];
      const activeHyps = hyps.filter(h => h.status === 'active');
      const totalTrials = activeHyps.reduce((s, h) => s + (h.empiricalTrials || 0), 0);
      const totalHits = activeHyps.reduce((s, h) => s + (h.empiricalHits || 0), 0);
      const totalBrier = activeHyps.reduce((s, h) => s + (h.brierSum || 0), 0);
      const meanBrier = totalTrials > 0 ? (totalBrier / totalTrials).toFixed(3) : '0.250';
      const hitPct = totalTrials > 0 ? Math.round((totalHits / totalTrials) * 100) : 0;

      if (calSummaryEl) {
        calSummaryEl.textContent = `${totalHits}/${totalTrials} empirical hits (${hitPct}%) · Mean Brier ${meanBrier} · ${(um.sealedPredictions || []).length} sealed receipts`;
      }

      hypListEl.innerHTML = hyps.map(h => {
        const hBrier = h.empiricalTrials > 0 ? (h.brierSum / h.empiricalTrials).toFixed(2) : 'untested';
        const isRefuted = h.status === 'refuted';
        const isInferred = h.source === 'inferred';
        const isPinned = Boolean(h.pinned);
        const sourceBadge = isInferred && !isPinned
          ? `<span style="background:rgba(168,85,247,0.18);color:#d8b4fe;border:1px solid rgba(168,85,247,0.35);padding:1px 6px;border-radius:99px;font-size:9.5px;font-weight:600;margin-right:6px;">✦ inferred</span>`
          : isInferred && isPinned
            ? `<span style="background:rgba(16,185,129,0.16);color:#6ee7b7;border:1px solid rgba(16,185,129,0.35);padding:1px 6px;border-radius:99px;font-size:9.5px;font-weight:600;margin-right:6px;">📌 pinned (inferred)</span>`
            : `<span style="background:rgba(56,189,248,0.12);color:#7dd3fc;border:1px solid rgba(56,189,248,0.25);padding:1px 6px;border-radius:99px;font-size:9.5px;font-weight:600;margin-right:6px;">explicit</span>`;
        const pinDismissButtons = isInferred && !isPinned && h.status === 'active'
          ? `<div style="margin-top:7px;display:flex;gap:5px;">
              <button class="mini-btn" onclick="pinOrDismissHypothesis('${escAttr(h.id)}', 'pin')">✓ Pin</button>
              <button class="mini-btn" onclick="pinOrDismissHypothesis('${escAttr(h.id)}', 'dismiss')">✕ Dismiss</button>
            </div>`
          : '';
        return `
          <div style="background:rgba(15,23,42,0.72);border:1px solid ${isRefuted ? 'rgba(239,68,68,0.28)' : 'rgba(148,163,184,0.16)'};border-radius:9px;padding:10px 12px;opacity:${isRefuted ? '0.55' : '1'};">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
              <div style="font-size:12px;color:#f1f5f9;line-height:1.45;${isRefuted ? 'text-decoration:line-through;' : ''}">${sourceBadge}${escHtml(h.statement)}</div>
              <button class="mini-btn" onclick="toggleHypothesisStatus('${escAttr(h.id)}', '${escAttr(h.status)}')">${isRefuted ? '↺ Restore' : '✕ Refute'}</button>
            </div>
            ${pinDismissButtons}
            <div style="margin-top:6px;display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px;color:#94a3b8;font-family:ui-monospace,monospace;">
              <span>scope: <strong style="color:#38bdf8;">${escHtml(h.scopeProjectId)}</strong></span>
              <span>hits: <strong style="color:#6ee7b7;">${h.empiricalHits}/${h.empiricalTrials}</strong></span>
              <span>Brier: <strong>${hBrier}</strong></span>
              <span>auto-uses since probe: <strong style="color:${h.usesSinceLastProbe >= 4 ? '#fde68a' : '#cbd5e1'};">${h.usesSinceLastProbe}</strong></span>
            </div>
          </div>
        `;
      }).join('');

      if (profListEl) {
        const profiles = Object.values(um.economicProfiles || {});
        profListEl.innerHTML = profiles.map(p => `
          <div style="background:rgba(15,23,42,0.68);border:1px solid ${p.projectId === state.activeProjectId ? 'rgba(56,189,248,0.4)' : 'rgba(148,163,184,0.14)'};border-radius:9px;padding:9px 11px;font-size:11px;color:#cbd5e1;">
            <div style="font-weight:600;color:#f8fafc;margin-bottom:4px;">${escHtml(p.label)}</div>
            <div style="font-family:ui-monospace,monospace;font-size:10px;color:#94a3b8;display:grid;gap:2px;">
              <span>Basal Floor: <strong style="color:#6ee7b7;">${p.basalFreeTokens} tok</strong></span>
              <span>$ Weight: <strong>${p.dollarCostWeight}/$1</strong></span>
              <span>Ask / Wait Cost: <strong>${p.askInterruptionCost} / ${p.waitLatencyCost}</strong></span>
            </div>
          </div>
        `).join('');
      }

      if (predListEl) {
        const preds = (um.sealedPredictions || []).slice(0, 8);
        predListEl.innerHTML = preds.length === 0
          ? `<div style="color:#64748b;font-size:11.5px;padding:10px;background:rgba(15,23,42,0.5);border-radius:8px;">No sealed predictions recorded yet. State an intent in the top bar or run a Spot-Check Probe.</div>`
          : preds.map(pr => {
              const topProb = Math.round((pr.subsetProbabilities?.[pr.predictedSubsetKey] || 0) * 100);
              const statusBadge = pr.resolvedAt
                ? `<span style="color:${pr.accurate ? '#6ee7b7' : '#fca5a5'};">${pr.accurate ? '✓ Hit' : '↺ Drift Updated'} · Brier ${escHtml(pr.brierScore)}</span>`
                : `<span style="color:#fde68a;">Sealed (${escHtml(pr.regime)})</span>`;
              return `
                <div style="background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.14);border-radius:8px;padding:9px 11px;font-size:11px;">
                  <div style="display:flex;justify-content:space-between;gap:8px;color:#f1f5f9;font-weight:500;">
                    <span>${escHtml((pr.prompt || '').slice(0, 62))}</span>
                    <span style="font-family:ui-monospace,monospace;font-size:10px;">${statusBadge}</span>
                  </div>
                  <div style="margin-top:4px;font-family:ui-monospace,monospace;font-size:10px;color:#94a3b8;">
                    ${pr.resolvedAt ? `Pre-predicted: <strong style="color:#38bdf8;">${escHtml(pr.predictedSubsetKey)} (${topProb}%)</strong>` : `Pre-predicted: <strong style="color:#94a3b8;">🔒 Sealed until resolved</strong>`}
                    ${pr.chosenSubsetKey ? ` · Chosen: <strong style="color:#f8fafc;">${escHtml(pr.chosenSubsetKey)}</strong>` : ''}
                    · R_act=${pr.expectedRegretOfActing} · V_cal=${pr.calibrationValue}
                  </div>
                </div>
              `;
            }).join('');
      }
    }

    if (viewProj === 'brief') {
      renderBriefView(lastBriefingData);
      fetchBriefing(false);
    }
  }

  return {
    renderBriefView,
    fetchBriefing,
    renderProjectionViews,
    resetBriefingThrottle: () => { briefingLastFetchAt = 0; }
  };
}
