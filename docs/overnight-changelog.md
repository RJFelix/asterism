# Asterism Overnight QA, Usability Polish & Surprise Additions Changelog

**Date:** 2026-11-13  
**Live Server:** `http://127.0.0.1:3456` / `https://agentbox-101.exe.xyz:3456/`  
**Test Suite:** `12/12` passing (`test/core.test.mjs`, `test/server.test.mjs`)

---

## 1. 4-Model QA Panel Summary

Four distinct model families audited Asterism in parallel across API invariants, HCI/Zero-Chrome design, adversarial edge cases, and live browser spatial choreography:

- **Seat 1 — Sol (`gpt-6.1-sol`) — API, State & Math Invariants**
  - Identified shared `data/canvas-state.json` mutations across isolated test servers (`options.dbPath` did not isolate `stateFile`), destructive corrupt-JSON recovery without backup, unvalidated/non-idempotent `scoreSealedPrediction` and `/api/decisions/resolve`, `allocateBasalFreeEnergy` floor budget overflow when `N * minBudget > totalBudget`, `evaluatePowerSetPolicy` non-finite/unnormalized probability edge cases, and `shouldBranchForRegretMinimization` counting lateral `association`/`jump` edges as child branches.
- **Seat 2 — Opus (`claude-opus-5-5`) — HCI, Zero-Chrome & Accessibility**
  - Flagged SSE `state` broadcasts overwriting local `viewport` and `viewProjection` (snapping pan/zoom or re-entering Plex whenever a card slider adjusted), full-state `POST /api/state` races on every card drag/resize end, permanent mutation of 2D canvas positions (`node.x/y`) on entering Plex, `renderAutonomousBranchHtml({ tuple: ... })` vs `{ ideonomyTuple }` parameter mismatch, pre-resolution leakage of sealed predictions in Model view, truncated `24ch` decision buttons with pre-highlighted Option A bias, resting `.keep-btn` chrome leakage, and `sandbox="allow-scripts allow-same-origin"` iframe escape risk.
- **Seat 3 — Muse Wonder-Full (`muse-wonder-full-1.0`) — Adversarial & Edge-Case QA**
  - Found double-click/concurrent replay inflation on decision cards (`scoreSealedPrediction` re-scoring resolved predictions and duplicating sibling eviction), unverified `window.addEventListener('message')` sender identity, prototype-pollution surface in `asterism:state` deep merge, XSS vectors in unescaped titles/summaries/hypotheses across Table/Timeline/Model/Compare/Diff/srcdoc views, and non-atomic `writeFileSync` persistence.
- **Seat 4 — Separate Argon (`gemini-4-argon`) — Live Browser & Spatial Choreography**
  - Verified live DOM bounding boxes at `http://127.0.0.1:3456`: entering Plex clamped `node-brief` onto `node-hydro` (`31,540 px²` overlap) and persisted the mutated layout; clicking `Act`/`Probe`/`Seed` spawned new cards at fixed `(443, 282)` causing `100%` overlap stacks; missing `GET /api/views/table` and `/api/views/timeline` endpoints returned `404`.

---

## 2. P0 / P1 / P2 Bugs Squashed & Usability Polish

### P0 Fixes (Data Integrity, Sync, Security & Layout)
1. **Isolated & Atomic State Persistence ([`server.mjs`](../server.mjs)):**
   - `createAsterismServer` now derives an isolated `stateFile` next to `dbPath` when `options.dbPath` is supplied (or accepts `options.stateFile`), ensuring test runs never touch live `data/canvas-state.json`.
   - `saveState` writes atomically via temp file + rename (`writeFileSync(tmp) -> renameSync`).
   - `loadState` backs up unreadable/corrupt JSON to `<stateFile>.corrupt-<timestamp>.bak` before falling back to defaults, and normalizes legacy/partial states via `normalizeCanvasState`.
2. **Client-Authoritative Viewport & Granular Drag Sync ([`public/index.html`](../public/index.html), [`server.mjs`](../server.mjs)):**
   - SSE `state` listeners now preserve local `state.viewport`, `state.viewProjection`, and any in-flight dragged/resized card geometry, while pruning deleted IDs from `selectedIds` and `compareIds`.
   - Card drag and resize use `setPointerCapture` and persist via `POST /api/nodes/move` instead of posting the entire canvas state.
   - `asterism:state` updates from iframes strip `__proto__`/`constructor`/`prototype` keys and debounce persistence (`180ms`).
3. **Non-Destructive Plex Projection & Collision-Free Spawning ([`server.mjs`](../server.mjs), [`public/index.html`](../public/index.html)):**
   - Entering Plex preserves each card's 2D coordinates in `canvasX`/`canvasY` and spaces DAG depth rows (`420px × 340px`) without overlapping parent/child cards.
   - Exiting Plex via `2D` tab or `Esc` restores `x = canvasX, y = canvasY`.
   - All card creation flows (`POST /api/prompts/unfold`, `POST /api/nodes/create`, `POST /api/branches/evaluate`, `POST /api/branches/probe`) route through `resolveOpenCanvasPosition` so newly spawned cards never stack at fixed coordinates.
4. **Decision Idempotency & Subset Validation ([`packages/asterism-core/src/user-model.ts`](../packages/asterism-core/src/user-model.ts), [`server.mjs`](../server.mjs)):**
   - `scoreSealedPrediction` and `POST /api/decisions/resolve` reject empty or unknown option IDs (`400 INVALID_CHOICE`), reject mutually exclusive multi-select subsets (`400 INFEASIBLE_SUBSET`), and return `409 ALREADY_RESOLVED` on duplicate resolution attempts unless `allowOverride: true` is explicitly passed for counterfactual swaps.
5. **Iframe Sandbox Hardening & Full XSS Escaping ([`public/index.html`](../public/index.html), [`src/llm.mjs`](../src/llm.mjs), [`src/ideonomy.mjs`](../src/ideonomy.mjs), [`server.mjs`](../server.mjs)):**
   - Removed `allow-same-origin` from all card and compare `srcdoc` iframes (`sandbox="allow-scripts"`).
   - Parent `message` listener verifies `e.source === iframe.contentWindow` before acting on any `asterism:*` event.
   - Escaped all user/LLM strings via `escHtml` and `escAttr` across Table, Timeline, Model, Attention, Compare, Diff, and generated `srcdoc` templates.

### P1 / P2 Core Math & Calm Spatial UI Polish
- **Core Algebra Invariants ([`packages/asterism-core/src/algebra.ts`](../packages/asterism-core/src/algebra.ts)):**
  - `allocateBasalFreeEnergy` clamps `effectiveMinBudget = Math.min(minBudget, totalBudget / nodes.length)` so total allocated budget always equals `totalBudget` (`1.0`).
  - `evaluatePowerSetPolicy` sanitizes `NaN`/negative utilities, normalizes probability distributions, and returns `recommendedSubset` as a clean string array.
  - `shouldBranchForRegretMinimization` counts only structural lineage edges (`branch`, ` parent_child`, `speculative_sibling`, `derived`), ignoring lateral `association` and `jump` links.
- **Zero-Chrome & Sealed Prediction Discipline ([`public/index.html`](../public/index.html), [`src/llm.mjs`](../src/llm.mjs), [`src/ideonomy.mjs`](../src/ideonomy.mjs)):**
  - Fixed `renderAutonomousBranchHtml` to accept both `ideonomyTuple` and `tuple`, and `ideaTitle` and `title`.
  - Unresolved predictions remain sealed (`🔒 Sealed prediction — resolve decision card to unseal`) in the Model drawer until the user resolves the decision.
  - Decision option buttons render full labels (`max-width: 100%`) with neutral styling so Option A is not visually pre-biased.
  - `.keep-btn` (`✓ Keep`) on speculative branch cards is hidden at rest (`opacity: 0; pointer-events: none`) and reveals only on card hover, focus, or deep zoom (`>= 112%`).
  - Added smart 4-side Bezier edge anchor selection, `Alt+Drag` (or `Connect` button) association linking, 5-second undo toast on card deletion, confirmation before workspace reset, and missing `GET /api/views/table` and `GET /api/views/timeline` JSON endpoints.

---

## 3. The 4 Surprise Additions — How to Try Them

### Surprise 1: Interactive Counterfactual Swap & Branch Regrowth ("What-If Time Machine")
Every resolved decision card now embeds a zero-chrome **Counterfactual Receipt Footer** inside its surface.
- **How to try it in UI:** Resolve any decision card (or inspect an already-resolved decision card), hover the card to reveal its subtle footer (`✓ Resolved: ... · Brier ... · Counterfactual ▾`), and click **`Swap to <Option>`**, **`Keep Both (A ∧ B)`**, or **`Neither (Custom)`**.
- **What happens:** Archived sibling branches are resurrected in-place (`archived = false`, `stage = 'speculative'`) without layout jumps, the newly chosen branch is promoted to `'surface'`, the user model's sealed prediction is re-scored against the counterfactual choice, and a calibration delta toast appears.
- **API:** `POST /api/decisions/counterfactual` with `{ nodeId, predictionId, action: "swap" | "keep_both" | "neither", targetOptionIds }`.

### Surprise 2: Semantic Zoom Constellation Mode & One-Click Magnetic Tidy
Zooming out turns the canvas into a high-signal semantic radar; a one-click solver untangles crowded workspaces.
- **How to try Constellation Mode:** Zoom out below `60%` (`scale < 0.60`) on the 2D canvas. `body.zoom-constellation` activates: cards smoothly morph into compact `52px`-high glowing constellation pills with high-contrast `15px` titles, thicker SVG lineage connectors, and color-coded status beacons (amber pulsing = unresolved decision, emerald = autonomous branch, purple = speculative sibling, cyan = active surface).
- **How to try Magnetic Tidy:** Open the **`Asterism ▾`** workspace menu in the top-left bar and click **`✨ Tidy Canvas Layout`** (or `POST /api/canvas/tidy`). Cards snap into a zero-overlap topological layout while preserving their spatial neighborhood order.

### Surprise 3: Live User-Model Distillation & Pinning ("Glass-Box Theory of Mind")
Passive workspace actions now distill live behavioral hypotheses that you can inspect, pin as hard constraints, or dismiss.
- **How to try it in UI:** Drag sliders inside interactive cards, switch facet tabs (`ui` / `code` / `test` / `critique`), or create/prune branches, then open the **`Model`** drawer.
- **What happens:** Behavioral hypotheses appear with a purple **`✦ inferred`** badge alongside Brier calibration metrics. Click **`✓ Pin`** on any hypothesis to lock it as a permanent user constraint (`📌 pinned`, `confidence = 1.0`) or **`✕ Dismiss`** to prune it.
- **API:** `POST /api/user-model/observe` (`slider_adjust`, `facet_switch`, `branch_keep`, `branch_prune`, `card_create`) and `POST /api/user-model/hypotheses` (`action: "pin" | "dismiss"`).

### Surprise 4: Morning Coffee Briefing Overlay (`☀ Brief`) & `⌘K` Spatial Spotlight
A calm, zero-chrome executive digest and keyboard-first spatial navigator for your morning review.
- **How to try `☀ Brief`:** Click the **`☀ Brief`** pill in the top bar (or press `b` when not typing in an input). The glassmorphic Morning Briefing overlay summarizes:
  1. **Workspace Vital Signs** (Active Cards, Autonomous Branches, Pending Decisions, Mean Brier Calibration & Accuracy).
  2. **Autonomous Work Overnight** (cards with Ideonomy operator badges and click-to-pan links).
  3. **Decisions Awaiting Your Taste** (unresolved decision cards with sealed prediction status and click-to-pan links).
  4. **Distilled Taste & Model Shifts** (top active/pinned/inferred hypotheses).
- **How to try `⌘K` / `Ctrl+K` Spatial Spotlight:** Press `⌘K` or `Ctrl+K` anywhere in the workspace to open the fuzzy command & card jumper. Filter across all cards, facets, and workspace actions (`Tidy Canvas Layout`, `Open Morning Briefing`, `Toggle Plex 2.5D`, `Compare Selected Cards`) and press `Enter` to pan/zoom smoothly to the target.
- **API:** `GET /api/views/briefing`.
