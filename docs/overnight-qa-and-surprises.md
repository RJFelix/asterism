# Overnight Usability, Multi-Model QA Panel & Surprise Additions Brief

**Date:** 2026-11-13  
**Repository:** `/home/exedev/agent-attic/repos/asterism`  
**Live Server:** `http://127.0.0.1:3456` (`https://agentbox-101.exe.xyz:3456/`)  
**Coordinator:** `antigravity` / `gemini-4-argon` (via T3 Code `delegate_task`)

---

## 1. Product Vision & Non-Negotiable UX Invariants

Asterism is an exploration of **post-chat, Sovereign Compute human-AI collaboration** on an infinite spatial HTML canvas. Earlier harness/orchestration projects suffered from **busy, overstimulating chrome**—cards covered in badges, status pills, model pickers, and repetitive action toolbars. Every fix and feature added tonight **must** preserve and deepen these core principles:

1. **Zero-Chrome Resting Cards ("Calm Spatial UI"):**
   - Resting cards on the canvas show **only** a drag grip, title, subtle hover `✕`, and the rich interactive HTML surface itself.
   - Never add persistent metadata badges, timestamps, project tags, or orchestration toolbars to resting cards. Lineage, operator trails, and controls stay tucked inside progressive disclosure (`⋯` menu) or deep semantic zoom (`scale >= 1.12`).
2. **"Agents" Are a View Concept, Not Mandatory Chrome:**
   - Compute is an ambient resource allocated across the decision graph (including **Basal Free-Energy** background exploration when idle).
   - The UI exists to show *only* the information the user wants to see, and elicit *only* the decisions actually worth interrupting human attention for.
3. **Path vs. State Equivalence (`LRR ≡ R` Ergodicity) & Power-Set Decisions ($\mathcal{P}(A)$):**
   - Choices are evaluated over the **power set** (`{✦ Both}`, `{Option A}`, `{Option B}`, `{∅ Neither / Status Quo}`), never a forced binary `A xor B` by default.
   - **Ergodic / Reversible** transitions (`LRR ≡ R`, where picking `A` does not foreclose `B` later except for negligible transition time) should **auto-commit (`act-single`)** or **co-fork (`✦ Both`)** rather than nagging the user out of risk aversion.
   - Only **irreversible sink transitions** with high expected regret ($VOI(d) > C_{\text{interrupt}}$)—or rare **sealed calibration probes**—pause for human input.
4. **Unanchored Elicitation & Brier-Scored `UserModel`:**
   - Whenever the system asks the user a decision (`ask-regret` or `probe-calibration`), it commits a **sealed probability distribution** over `{both, a, b, neither}` *before* rendering, and renders **zero hint or recommendation badge** prior to click so human feedback stays unanchored.
   - After resolution, multi-subset Brier scoring updates hypothesis confidence and flags stale hypotheses when preference drift occurs.
5. **Global T3-Style Workspace Projects (`agent-attic (misc)` Default):**
   - Cards are never blocked waiting for per-card file/repo assignments. Everything defaults globally to `proj-misc-attic` (`/home/exedev/agent-attic`) unless the user switches the workspace project pill.

---

## 2. Phase 1 — Planned & Exploratory 4-Model QA Panel

The Argon coordinator **is explicitly authorized and instructed** to call `orchestrator_capabilities` once in its thread and then spawn **4 QA reviewers** via T3 `delegate_task` to inspect and test Asterism thoroughly from complementary angles:

| Seat | T3 `providerInstanceId` | `model` | Testing Charter |
| :--- | :--- | :--- | :--- |
| **1. Sol** | `codex` | `gpt-6.1-sol` | **Planned Functional, API & Invariant QA:** Systematically test every HTTP endpoint (`/api/state`, `/api/events` SSE, `/api/projects`, `/api/user-model`, `/api/user-model/hypotheses`, `/api/decisions/compile`, `/api/decisions/resolve`, `/api/views/plex`, `/api/views/table`, `/api/views/timeline`, `/api/ideonomy/*`, `/api/seed`, `/api/branch`, `/api/reset`), state persistence/recovery, edge consistency (`lineage` vs `association`), and `packages/asterism-core` math invariants. |
| **2. Opus** | `claudeAgent` | `claude-opus-5-5` | **Deep UX, Cognitive Load & Accessibility Critique:** Audit `public/index.html`, `src/llm.mjs`, and live rendered HTML surfaces for visual clutter, confusing affordances, typography/contrast rough edges, iframe `postMessage` interaction bugs, keyboard focus traps, and projection lens transitions (`Canvas` ↔ `Plex` ↔ `Table` ↔ `Timeline` ↔ `Model`). *(Note: Use Claude ONLY for this single QA panel seat!)* |
| **3. Muse Wonder-Full** | `muse` | `muse-wonder-full-1.0` | **Exploratory & Adversarial Edge-Case QA:** Probe race conditions, rapid double-clicks on decision options, malformed/empty payloads, legacy or partially missing `canvas-state.json` fields, extreme zoom/pan values, iframe height thrashing, XSS/HTML escaping in card titles/hypotheses/table cells, and deletion of cards referenced by edges or Plex focus. |
| **4. Separate Argon** | `antigravity` | `gemini-4-argon` | **Live Browser & Spatial Choreography QA:** Drive the live interface at `http://127.0.0.1:3456` (using T3 `preview_*` tools—`preview_status` first, `preview_open` if needed, closing any newly opened tab when done—or Playwright if `preview_open` is unsupported). Test panning, wheel-zooming, dragging cards, `Alt+drag` association linking, switching lenses, triggering `+ Compile Decision`, resolving `{✦ Both}` / `{∅ Neither}`, and checking card overlap/layout cleanliness. |

> **Important Rule for Panelists:** Each QA panelist is a leaf reviewer (`role: "review"` or `"test"`). Instruct each panelist **not** to edit files and **not** to spawn further subagents—return a structured prioritized report (`P0` broken/data-loss/security, `P1` usability/visual/state bug, `P2` polish/ergonomics) with exact file paths and line numbers.

---

## 3. Phase 2 — Triage, Bug Fixing & Usability Polish

After collecting reports from all 4 panelists, the Argon coordinator will synthesize a deduplicated punchlist and fix every high-value bug and UX rough edge:

### Provider & Sizing Policy for Worker Subagents (Strict)
- T3 `orchestrator_capabilities` does not report remaining subscription quota percentages, so follow the user's explicit provider rule:
  - **DO NOT use `claudeAgent` (`claude-*`) for any bugfix or feature implementation workers** (conserve Claude subscription quota; Opus's single QA review in Phase 1 is the *only* Claude call tonight).
  - **Distribute worker tasks across Muse, Codex (GPT), and Antigravity (Gemini)**, sized to task complexity:
    - *Small / fast targeted fixes or tests:* `muse` (`muse-spark-1.3` or `muse-ember-1.0`), `codex` (`gpt-6-luna` or `gpt-6-astra`), `antigravity` (`gemini-4-hydrogen`).
    - *Medium / complex multi-file UI or core logic:* `muse` (`muse-wonder-1.0` or `muse-wonder-full-1.0`), `codex` (`gpt-6.1-terra` or `gpt-6.1-sol`), `antigravity` (`gemini-4-argon`).
  - Per T3 rules, fix trivial 1–2 line issues directly in the coordinator if faster, and use `delegate_task` (`isolation: "worktree"` for parallel workers, or sequential `isolation: "shared"`) for substantial workstreams. Instruct all worker subagents not to spawn nested subagents.

---

## 4. Phase 3 — Four Surprise Additions (Implement After QA & Bugfixes!)

Once QA bugs and UX polish items are resolved and tests are green, have worker subagents implement these **4 cohesive surprise additions** designed specifically around today's architectural breakthroughs:

### Surprise 1: Ergodic Counterfactual Swap (`↺ Swap Path` & `✦ Upgrade to Both`)
- **Motivation:** Because ergodic choices (`LRR ≡ R`) auto-commit (`act-single`) without interrupting the user, reversing or expanding an autonomous choice should take **one effortless click**—and that click is the purest unprompted calibration signal `UserModel` could ever ask for!
- **Design:**
  - Enhance `renderAutonomousBranchHtml` in `src/llm.mjs` + `server.mjs` (`POST /api/decisions/counterfactual` or extending `POST /api/decisions/resolve`) + `public/index.html` `postMessage` listener.
  - On any autonomous receipt card (`act-single`), include subtle, calm footer actions:
    - **`↺ Try <Unchosen Option>`** (swaps/spawns the counterfactual sibling path cleanly)
    - **`✦ Keep Both`** (upgrades the single autonomous pick into a side-by-side co-fork)
    - **`∅ Neither`** (prunes/abstains back to status quo)
  - Clicking any of these immediately executes the spatial change **and** scores the user's override against the card's `sealedPredictionId` (or records an implicit counterfactual Brier residual if already scored), teaching `UserModel` where its autonomous confidence overreached!

### Surprise 2: Semantic Zoom Constellation Mode & Collision-Free Spatial Layout ("Breathing Canvas")
- **Motivation:** When 15–40 cards accumulate—or when `✦ Both` co-forks two 460px cards side-by-side—cards can overlap or turn into unreadable miniature iframes when zoomed out.
- **Design:**
  - **Constellation Altitude (`body.zoom-constellation` at `scale < 0.60`):** Smoothly cross-fade zoomed-out cards from busy iframe bodies into calm, legible **Constellation Pills** showing crisp high-contrast title, a tiny semantic aura dot (seed / co-fork / autonomous / awaiting-decision pulse), and clean SVG lineage/association curves. Zooming back in (`scale >= 0.60`) seamlessly restores the interactive HTML surfaces.
  - **Collision-Free Placement (`resolveOpenCanvasPosition`) + Calm `Tidy` Action:** Ensure newly spawned seeds, branches, compiled decisions, and co-forks automatically step clear of existing card bounding boxes so spawned work *never* piles directly on top of another card. Add a gentle non-destructive `Tidy` action (in the canvas controls or `⌘K`) that nudges overlapping cards apart while preserving relative spatial topology.

### Surprise 3: Passive Behavioral Distillation ("Watch Me Curate, Never Make Me Configure")
- **Motivation:** A `UserModel` shouldn't rely solely on manually typed hypotheses or explicit decision gates. How the user curates space—tearing off a branch to keep, pruning/deleting an unwanted branch, overriding an autonomous card, or dwelling at deep zoom—reveals preferences naturally.
- **Design:**
  - Add `recordBehavioralObservation` to `packages/asterism-core/src/user-model.ts` and `POST /api/user-model/observe` to `server.mjs`.
  - Track lightweight, non-creepy spatial curation events (`counterfactual-override`, `co-fork-upgrade`, `branch-pruned`, `tearoff-promoted`).
  - Automatically distill or adjust **inferred `PreferenceHypothesis` entries** (badged `inferred` alongside `explicit` hypotheses in the `Model` projection, with a 1-click `✕ Dismiss` or `✓ Pin` button so the user always stays in sovereign control of their model).

### Surprise 4: Ambient "Morning Coffee" Brief (`☀ Brief`) & `⌘K` Spatial Spotlight
- **Motivation:** When returning after an overnight session (or idle Basal Free-Energy exploration), the user shouldn't have to hunt across an infinite canvas to answer *"What happened while I was away, and does anything need me?"*
- **Design:**
  - **`☀ Brief` Lens (`GET /api/views/briefing` + quiet `Brief` tab in the projection pill):** Renders a serene, scannable "Morning Coffee" digest grouping:
    1. **Needs Your Call** — any paused high-regret irreversible decisions (`ask-regret` / `probe-calibration`) with 1-click *Focus on Canvas*.
    2. **Autonomous & Basal Moves** — ergodic branches committed and idle explorations synthesized, ranked by novelty/surprise, with inline *Focus* or *↺ Swap*.
    3. **Model Shifts** — summary of Brier calibration accuracy, newly inferred preferences, and any stale hypotheses.
  - **`⌘K` / `Ctrl+K` Spatial Spotlight:** A minimalist, zero-clutter keyboard command bar to jump/pan smoothly to any card by title, switch active Project, switch projection lens (`1`–`6` or by name), tidy overlapping cards, or plant a new seed without touching the mouse.

---

## 5. Verification, Live Server Restart & Git Delivery Checklist

Before completing the overnight coordinator run:
1. **Unit & Integration Tests:** Expand `test/core.test.mjs` and `test/server.test.mjs` to cover all bugfixes and all 4 surprise additions. Run `/home/exedev/.local/bin/node --test test/core.test.mjs test/server.test.mjs` and verify **100% pass**.
2. **Final Smoke / Browser Check:** Verify live HTTP 200 and clean JS console / DOM behavior against `http://127.0.0.1:3456`.
   - **Process restart safety:** Never chain `fuser -k 3456/tcp` in the same subshell that starts the server. Kill old PID via `lsof -ti :3456 | xargs -r kill`, wait briefly, then start detached with `setsid /home/exedev/.local/bin/node /home/exedev/agent-attic/repos/asterism/server.mjs > /tmp/asterism.log 2>&1 < /dev/null &`.
3. **Documentation & Release Notes:** Write a concise summary of QA findings fixed + the 4 surprise additions in `/home/exedev/agent-attic/repos/asterism/docs/overnight-changelog.md`.
4. **Commit & Push to `main`:** Ensure `canvas-state.json` is clean (or reset/sanitized if test artifacts polluted it), commit all changes cleanly to `main` in `/home/exedev/agent-attic/repos/asterism`, and `git push origin main`.
