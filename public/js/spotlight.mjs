import { escHtml } from './card-srcdoc.mjs';

export function createSpotlightController({ getState, handlers }) {
  let spotlightItems = [];
  let spotlightIndex = 0;

  function buildSpotlightItems(query) {
    const state = getState();
    const q = String(query || '').trim().toLowerCase();
    const match = (text) => !q || String(text).toLowerCase().includes(q);
    const actions = [
      { label: '✦ Toggle Polaris Workspace Steward', hint: 'Steward · ⌘J', run: () => handlers.togglePolarisDrawer() },
      { label: '✨ Tidy Overlapping Cards', hint: 'Action', run: () => handlers.tidyCanvasLayout() },
      { label: '☀ Open Morning Coffee Brief', hint: 'Lens · 6', run: () => handlers.setViewProjection('brief') },
      { label: '🎯 Run Calibration Spot-Check Probe', hint: 'Action', run: () => handlers.compileAutonomousIntent(undefined, true) },
      { label: '🌱 Plant 4-Branch Idea Seed', hint: 'Action', run: () => handlers.submitIdeaBoxSeed(query && String(query).trim() ? String(query).trim() : undefined) },
      { label: '🔋 Pulse Basal Free-Energy', hint: 'Action', run: () => handlers.pulseBasalFreeEnergy() },
      { label: '📁 Cycle Active Workspace Project', hint: 'Action', run: () => handlers.cycleOrPromptProject() },
      { label: '🖼 Switch to Canvas', hint: 'Lens · 1', run: () => handlers.setViewProjection('canvas') },
      { label: '🖼 Switch to Plex', hint: 'Lens · 2', run: () => handlers.setViewProjection('plex') },
      { label: '🖼 Switch to Table', hint: 'Lens · 3', run: () => handlers.setViewProjection('table') },
      { label: '🖼 Switch to Timeline', hint: 'Lens · 4', run: () => handlers.setViewProjection('timeline') },
      { label: '🖼 Switch to Model', hint: 'Lens · 5', run: () => handlers.setViewProjection('model') }
    ].filter(item => match(item.label));

    const projectItems = (state.projects || [])
      .filter(p => q && (match(p.name) || match(p.id) || match(p.repoPath)))
      .map(p => ({
        label: `📁 Switch Project: ${p.name}`,
        hint: p.repoPath || 'Superrepo project',
        run: () => handlers.switchToProjectId(p.id)
      }));

    const cards = (state.nodes || [])
      .filter(n => match(n.title) || match(n.id) || match(n.kind) || match(n.stage))
      .map(n => ({
        label: n.title || n.id,
        hint: n.shadowStaged ? 'Card · 🌑 Shadow' : `Card · ${n.stage || 'note'}`,
        run: () => handlers.panAndFocusNode(n.id)
      }));

    const items = [...actions, ...projectItems, ...cards];
    const trimmed = String(query || '').trim();
    if (trimmed) {
      items.push({
        label: `✦ Ask Polaris: ${trimmed}`,
        hint: 'Polaris Steward',
        run: () => handlers.sendPolarisMessage(trimmed)
      });
      items.push({
        label: `⚡ Act on intent: ${trimmed}`,
        hint: 'Compile intent',
        run: () => handlers.compileAutonomousIntent(trimmed)
      });
    }
    return items;
  }

  function renderSpotlightResults(query) {
    const listEl = document.getElementById('spotlight-list');
    if (!listEl) return;
    spotlightItems = buildSpotlightItems(query);
    if (spotlightIndex >= spotlightItems.length) spotlightIndex = Math.max(0, spotlightItems.length - 1);
    if (spotlightItems.length === 0) {
      listEl.innerHTML = `<div class="spotlight-empty">No matching cards, projects, or actions.</div>`;
      return;
    }
    listEl.innerHTML = spotlightItems.map((item, i) => `
      <button class="spotlight-item${i === spotlightIndex ? ' active' : ''}" role="option" data-spotlight-index="${i}">
        <span>${escHtml(item.label)}</span>
        <span class="spotlight-hint">${escHtml(item.hint || '')}</span>
      </button>`).join('');
    listEl.querySelectorAll('.spotlight-item').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        spotlightIndex = Number(btn.dataset.spotlightIndex) || 0;
        listEl.querySelectorAll('.spotlight-item').forEach(b => b.classList.toggle('active', b === btn));
      });
      btn.addEventListener('click', () => {
        spotlightIndex = Number(btn.dataset.spotlightIndex) || 0;
        runSpotlightSelection();
      });
    });
    const activeEl = listEl.querySelector('.spotlight-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function closeSpatialSpotlight() {
    const modal = document.getElementById('spotlight-modal');
    if (modal) modal.classList.remove('open');
  }

  function runSpotlightSelection() {
    const item = spotlightItems[spotlightIndex];
    if (!item) return;
    closeSpatialSpotlight();
    item.run();
  }

  function openSpatialSpotlight() {
    const modal = document.getElementById('spotlight-modal');
    const input = document.getElementById('spotlight-input');
    if (!modal || !input) return;
    modal.classList.add('open');
    spotlightIndex = 0;
    renderSpotlightResults(input.value);
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  function toggleSpatialSpotlight() {
    const modal = document.getElementById('spotlight-modal');
    if (modal && modal.classList.contains('open')) closeSpatialSpotlight();
    else openSpatialSpotlight();
  }

  function bindSpotlightEvents() {
    const spotlightModalEl = document.getElementById('spotlight-modal');
    const spotlightInputEl = document.getElementById('spotlight-input');
    if (spotlightModalEl) {
      spotlightModalEl.addEventListener('pointerdown', (e) => {
        if (e.target === spotlightModalEl) closeSpatialSpotlight();
      });
    }
    if (spotlightInputEl) {
      spotlightInputEl.addEventListener('input', () => {
        spotlightIndex = 0;
        renderSpotlightResults(spotlightInputEl.value);
      });
      spotlightInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          spotlightIndex = Math.min(Math.max(spotlightItems.length - 1, 0), spotlightIndex + 1);
          renderSpotlightResults(spotlightInputEl.value);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          spotlightIndex = Math.max(0, spotlightIndex - 1);
          renderSpotlightResults(spotlightInputEl.value);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          runSpotlightSelection();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeSpatialSpotlight();
        }
      });
    }
  }

  return {
    openSpatialSpotlight,
    closeSpatialSpotlight,
    toggleSpatialSpotlight,
    bindSpotlightEvents
  };
}
