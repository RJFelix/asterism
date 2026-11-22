import { escHtml } from './card-srcdoc.mjs';

export function createPolarisController({
  getState,
  getFocusedNodeId,
  setFocusedNodeId,
  showToast
}) {
  let polarisState = {
    agentName: 'Polaris',
    subtitle: 'Workspace Steward',
    providerInstanceId: 'antigravity',
    model: 'gemini-4-neon',
    status: 'idle',
    activeActivity: null,
    threadId: null,
    threadLink: null,
    messages: []
  };
  let liveT3Providers = [];
  let restoredSessionOnce = false;

  function renderPolarisMarkdown(text) {
    const raw = String(text || '');
    const blocks = [];
    const withPlaceholders = raw.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
      const idx = blocks.length;
      blocks.push(`<pre><code>${escHtml(code.replace(/\n$/, ''))}</code></pre>`);
      return `\u0000CODEBLOCK_${idx}\u0000`;
    });

    const lines = withPlaceholders.split('\n');
    const htmlParts = [];
    let inList = false;

    const formatInline = (line) => {
      let out = escHtml(line);
      out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
      out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|file:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return out;
    };

    for (const line of lines) {
      const phMatch = line.trim().match(/^\u0000CODEBLOCK_(\d+)\u0000$/);
      if (phMatch) {
        if (inList) { htmlParts.push('</ul>'); inList = false; }
        htmlParts.push(blocks[Number(phMatch[1])] || '');
        continue;
      }
      const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
      if (bullet) {
        if (!inList) { htmlParts.push('<ul>'); inList = true; }
        htmlParts.push(`<li>${formatInline(bullet[1])}</li>`);
        continue;
      }
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      if (!line.trim()) continue;
      htmlParts.push(`<p>${formatInline(line).replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_, i) => blocks[Number(i)] || '')}</p>`);
    }
    if (inList) htmlParts.push('</ul>');
    return `<div class="polaris-md">${htmlParts.join('')}</div>`;
  }

  function updatePolarisFocusPill() {
    const pill = document.getElementById('polaris-focus-pill');
    if (!pill) return;
    const state = getState();
    const focusedNodeId = getFocusedNodeId();
    const node = focusedNodeId ? state.nodes.find(n => n.id === focusedNodeId) : null;
    if (node) {
      pill.innerHTML = `<span>⌖ ${escHtml(node.title.length > 30 ? node.title.slice(0, 29) + '…' : node.title)}</span>`;
      pill.style.color = '#bae6fd';
      pill.style.borderColor = 'rgba(56, 189, 248, 0.35)';
    } else {
      const activeProj = (state.projects || []).find(p => p.id === state.activeProjectId);
      pill.textContent = activeProj ? `⌖ ${activeProj.name} · Canvas-wide` : '⌖ Canvas-wide context';
      pill.style.color = '#94a3b8';
      pill.style.borderColor = 'rgba(148, 163, 184, 0.18)';
    }
  }

  function togglePolarisDrawer(forceOpen) {
    const drawer = document.getElementById('polaris-drawer');
    const btn = document.getElementById('btn-polaris-steward');
    if (!drawer) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('open');
    drawer.classList.toggle('open', shouldOpen);
    if (btn) btn.classList.toggle('active', shouldOpen);
    try { sessionStorage.setItem('asterism:polarisOpen', shouldOpen ? '1' : '0'); } catch {}
    if (shouldOpen) {
      updatePolarisFocusPill();
      renderPolarisUI(true);
      requestAnimationFrame(() => document.getElementById('polaris-input')?.focus());
    }
  }

  function renderPolarisUI(forceScrollBottom = false) {
    const btn = document.getElementById('btn-polaris-steward');
    const actBar = document.getElementById('polaris-activity-bar');
    const actText = document.getElementById('polaris-activity-text');
    const subEl = document.getElementById('polaris-subtitle');
    const linkEl = document.getElementById('polaris-thread-link');
    const selEl = document.getElementById('polaris-model-select');
    const msgBox = document.getElementById('polaris-messages');
    const isWorking = polarisState.status === 'working';

    if (btn) btn.classList.toggle('working', isWorking);
    if (actBar) actBar.classList.toggle('active', isWorking);
    if (actText && polarisState.activeActivity) actText.textContent = polarisState.activeActivity;
    if (subEl) {
      subEl.textContent = `Workspace Steward · ${polarisState.providerInstanceId}/${polarisState.model}`;
    }
    if (linkEl) {
      if (polarisState.threadLink && polarisState.threadLink.startsWith('http')) {
        linkEl.href = polarisState.threadLink;
        linkEl.hidden = false;
      } else {
        linkEl.hidden = true;
      }
    }
    if (selEl) {
      const key = `${polarisState.providerInstanceId}::${polarisState.model}`;
      if (!Array.from(selEl.options).some(o => o.value === key)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = polarisState.model;
        selEl.appendChild(opt);
      }
      selEl.value = key;
    }

    if (!msgBox) return;
    const nearBottom = forceScrollBottom || (msgBox.scrollHeight - msgBox.scrollTop - msgBox.clientHeight < 90);
    const msgs = Array.isArray(polarisState.messages) ? polarisState.messages : [];

    if (msgs.length === 0) {
      msgBox.innerHTML = `
        <div style="padding:10px 11px;border-radius:10px;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.12);color:#94a3b8;font-size:11.5px;line-height:1.5;">
          <div style="color:#e2e8f0;font-weight:600;margin-bottom:4px;">✦ Polaris · Workspace Steward</div>
          <div>Anchored on your <code>agent-attic</code> superrepo via live T3 Code (<code>gemini-4-neon</code>). Switch projects in the top bar to work on <code>hydro</code>, <code>intuit</code>, <code>dsv41-deepdream</code>, or Asterism itself.</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:2px;">
          <button class="polaris-starter-btn" onclick="sendPolarisStarter('Review our active roadmap branches on the canvas and recommend the highest-VOI next step.')">↗ Review active roadmap branches &amp; highest-VOI next step</button>
          <button class="polaris-starter-btn" onclick="sendPolarisStarter('Inspect the currently focused card and propose a concrete improvement or companion surface.')">⌖ Critique or extend the currently focused card</button>
          <button class="polaris-starter-btn" onclick="sendPolarisStarter('Run bin/asterism status and bin/asterism projects and summarize our superrepo projects and T3 readiness.')">⚙ Check superrepo projects &amp; self-hosting status</button>
        </div>
      `;
      return;
    }

    msgBox.innerHTML = msgs.map(m => {
      const isUser = m.role === 'user';
      const focusTag = m.focusedNodeTitle
        ? `<span>⌖ ${escHtml(m.focusedNodeTitle.slice(0, 24))}</span>`
        : '';
      const modelTag = !isUser && m.model ? `<span>${escHtml(m.model)}${m.streaming ? ' · streaming…' : ''}</span>` : '';
      return `
        <div class="polaris-msg role-${isUser ? 'user' : 'assistant'}${m.isError ? ' is-error' : ''}">
          ${(focusTag || modelTag) ? `<div class="polaris-msg-meta">${modelTag || '<span>you</span>'}${focusTag}</div>` : ''}
          ${isUser ? `<div>${escHtml(m.text)}</div>` : renderPolarisMarkdown(m.text)}
        </div>
      `;
    }).join('');

    if (nearBottom) {
      msgBox.scrollTop = msgBox.scrollHeight;
    }
  }

  function sendPolarisStarter(promptText) {
    const inp = document.getElementById('polaris-input');
    if (inp) inp.value = promptText;
    sendPolarisMessage();
  }

  async function sendPolarisMessage(customText) {
    const inp = document.getElementById('polaris-input');
    const text = (customText !== undefined ? String(customText) : (inp?.value || '')).trim();
    if (!text) return;
    if (inp && customText === undefined) inp.value = '';
    togglePolarisDrawer(true);
    try {
      const res = await fetch('/api/polaris/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          focusedNodeId: getFocusedNodeId() || null
        })
      });
      const data = await res.json();
      if (data.polaris) {
        polarisState = data.polaris;
        renderPolarisUI(true);
      }
    } catch (err) {
      showToast('Polaris request failed: ' + (err?.message || 'network error'));
    }
  }

  async function onPolarisModelChange(val) {
    const [providerInstanceId, model] = String(val || '').split('::');
    if (!providerInstanceId || !model) return;
    const options = model.includes('gemini-4') ? { thinking_level: 'high' } : {};
    const res = await fetch('/api/polaris/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerInstanceId, model, options })
    });
    const data = await res.json();
    if (data.polaris) {
      polarisState = data.polaris;
      renderPolarisUI(false);
      showToast(`Polaris switched to ${providerInstanceId}/${model}`);
    }
  }

  async function resetPolarisChat() {
    const res = await fetch('/api/polaris/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.polaris) {
      polarisState = data.polaris;
      renderPolarisUI(true);
      showToast('Started fresh Polaris Steward thread.');
    }
  }

  async function interruptPolaris() {
    const res = await fetch('/api/polaris/interrupt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.polaris) {
      polarisState = data.polaris;
      renderPolarisUI(false);
    }
  }

  async function hydrateLiveT3Providers() {
    try {
      const res = await fetch('/api/providers');
      if (!res.ok) return;
      const data = await res.json();
      const providers = data?.liveT3?.providers || [];
      if (!Array.isArray(providers) || providers.length === 0) return;
      liveT3Providers = providers;

      const selEl = document.getElementById('polaris-model-select');
      if (selEl) {
        const currentVal = `${polarisState.providerInstanceId}::${polarisState.model}`;
        selEl.innerHTML = '';
        for (const p of providers) {
          const group = document.createElement('optgroup');
          group.label = p.displayName || p.providerInstanceId;
          for (const m of (p.models || [])) {
            const opt = document.createElement('option');
            opt.value = `${p.providerInstanceId}::${m.id}`;
            opt.textContent = `${m.id}${m.favorite ? ' ★' : ''}`;
            group.appendChild(opt);
          }
          selEl.appendChild(group);
        }
        if (Array.from(selEl.options).some(o => o.value === currentVal)) {
          selEl.value = currentVal;
        }
      }
    } catch {
      // Offline or T3 bridge disabled
    }
  }

  function applySeamlessSelfReload() {
    const state = getState();
    try {
      sessionStorage.setItem('asterism:reloadState', JSON.stringify({
        viewport: state.viewport,
        viewProjection: state.viewProjection,
        focusedNodeId: getFocusedNodeId(),
        polarisOpen: document.getElementById('polaris-drawer')?.classList.contains('open') || false
      }));
    } catch {}
    window.location.reload();
  }

  function restoreSeamlessReloadIfPresent() {
    if (restoredSessionOnce) return;
    restoredSessionOnce = true;
    const state = getState();
    try {
      const raw = sessionStorage.getItem('asterism:reloadState');
      if (raw) {
        sessionStorage.removeItem('asterism:reloadState');
        const saved = JSON.parse(raw);
        if (saved.viewport) state.viewport = saved.viewport;
        if (saved.viewProjection) state.viewProjection = saved.viewProjection;
        if (saved.focusedNodeId) setFocusedNodeId(saved.focusedNodeId);
        if (saved.polarisOpen) togglePolarisDrawer(true);
        return;
      }
      if (sessionStorage.getItem('asterism:polarisOpen') === '1') {
        togglePolarisDrawer(true);
      }
    } catch {}
  }

  function bindPolarisInput() {
    const polarisInputEl = document.getElementById('polaris-input');
    if (polarisInputEl) {
      polarisInputEl.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendPolarisMessage();
        }
      });
    }
  }

  return {
    getPolarisState: () => polarisState,
    setPolarisState: (next) => { polarisState = next; },
    getLiveT3Providers: () => liveT3Providers,
    updatePolarisFocusPill,
    togglePolarisDrawer,
    renderPolarisUI,
    sendPolarisStarter,
    sendPolarisMessage,
    onPolarisModelChange,
    resetPolarisChat,
    interruptPolaris,
    hydrateLiveT3Providers,
    applySeamlessSelfReload,
    restoreSeamlessReloadIfPresent,
    bindPolarisInput
  };
}
