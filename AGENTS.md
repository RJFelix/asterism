# Asterism (`repos/asterism`)

Spatial canvas, Sovereign Compute decision compiler, and Effect-TS multi-provider harness workspace. Inherits machine-wide law and shared memory rules from `/home/exedev/agent-attic/AGENTS.md` and `/home/exedev/agent-attic/knowledge/`.

## Superrepo-First Geometry

- Asterism lives inside the `/home/exedev/agent-attic` superrepo (`repos/asterism`) and is designed to dogfood **both** non-Asterism projects (`repos/hydro`, `repos/intuit`, `dsv41-deepdream`, scratch dirs) and Asterism self-improvement in one workspace.
- `/api/projects` (`bin/asterism projects`) auto-discovers nested repos under `<superrepo>/repos/*` and active top-level project directories under `<superrepo>/*`.
- Live T3 Code threads (`Polaris` + one-shot surface generation in `src/t3-bridge.mjs`) anchor on the outermost superrepo project (`/home/exedev/agent-attic`) so worker harnesses inherit `/home/exedev/agent-attic/AGENTS.md` + `knowledge/` and can read/edit any project repo cleanly.

## Architecture & Module Map (Zero Build Step)

Native Node ESM on the backend and native `<script type="module">` in the browser — no bundler or build step required.

- `server.mjs`: Thin HTTP + Effect-TS SQLite Outbox orchestrator (`createAsterismServer`).
- `src/canvas-state.mjs`: State normalization, atomic JSON persistence, superrepo project discovery, spatial collision placement, and lineage/neighborhood graph walks.
- `src/t3-bridge.mjs`: Live T3 Code Streamable HTTP MCP client (`/mcp` OAuth + PKCE) and `Polaris` Workspace Steward service.
- `src/telemetry.mjs`: Deduplicating browser & card-iframe runtime error ring buffer + canvas state snapshot time-machine.
- `src/llm.mjs` & `src/ideonomy.mjs`: T3-routed HTML surface generation/mutation, power-set decision tree compilation, and Ideonomy operators.
- `src/routes/`:
  - `system-routes.mjs`: `/api/health`, `/api/telemetry/client-error(s)`, `/api/snapshots*`, `/api/providers`, `/mcp`, `/api/events` (SSE), `/api/polaris/*`.
  - `canvas-routes.mjs`: `/api/state`, `/api/reset`, `/api/views/*`, `/api/canvas/tidy`, `/api/projects`, `/api/nodes/*`, `/api/edges`.
  - `decisions-routes.mjs`: `/api/user-model*`, `/api/decisions/*`, `/api/ideonomy/pick`, `/api/energy/basal-tick`, `/api/ideabox/seed`, `/api/shadow/unfold`, `/api/attention/*`.
  - `surfaces-routes.mjs`: `/api/nodes/{mutate,facet,spawn-related,speculate,synthesize,commit-branch,prune-unkept,advance}`, `/api/nodes/implement/*`.
- `public/`:
  - `index.html`: Minimal semantic HTML shell.
  - `css/asterism.css`: All spatial canvas, projection, and Polaris styles.
  - `js/app.mjs`: Canvas viewport/node/edge interactions, iframe `postMessage` bridge, SSE state sync, and `window` bindings for declarative HTML handlers.
  - `js/card-srcdoc.mjs`: Bidirectional `window.asterism` card iframe SDK + iframe runtime error telemetry.
  - `js/projections.mjs`: Organon Table, Timeline, Testable User Model, and Morning Brief views.
  - `js/polaris.mjs`: Polaris peripheral workspace steward drawer & seamless UI reload banner.
  - `js/spotlight.mjs`: `⌘K` Spatial Spotlight command bar (actions, project switcher, cards, Polaris/intent dispatch).
  - `js/telemetry.mjs`: Uncaught browser error & rejection loopback to `/api/telemetry/client-error`.

## Self-Hosting, Canary Preview & Multi-Repo Worktrees

Live Asterism runs on `:3456` (`https://agentbox-101.exe.xyz:3456/`) via `systemctl --user status asterism.service` (logs in `/tmp/asterism-server.log`).

- **Never restart `asterism.service` manually before preflight.** Always use `./bin/asterism`:
  - `./bin/asterism status`: Deep healthcheck (bootId, git SHA, UI bundle hash, Polaris status, T3 providers, client error count).
  - `./bin/asterism errors [--clear]`: Inspect or clear uncaught browser & malleable card-iframe JS errors.
  - `./bin/asterism logs [--lines 80]`: Tail server stdout/stderr logs.
  - `./bin/asterism worktree <list|create|remove> [name] [--repo asterism|hydro|intuit|<path>]`: Provision isolated git worktrees for parallel subagents on any nested repo.
  - `./bin/asterism preview [--port 3457]`: Boot an isolated canary server on `:3457` seeded with a copy of the live canvas and sharing T3 OAuth credentials — zero risk to `:3456`.
  - `./bin/asterism snapshots` / `snapshot-save` / `snapshot-restore [latest|<name>]`: Save or roll back live canvas state (broadcasts immediately over SSE).
  - `./bin/asterism self-check`: Runs `node --check` across all backend + `public/js/*.mjs` modules, verifies UI shell assets, and runs `node --test test/*.test.mjs`.
  - `./bin/asterism self-deploy --message "feat: ..." --push`: Runs `self-check`, snapshots live state, commits, restarts `asterism.service`, verifies a new healthy `bootId`, and auto-reverts if healthcheck fails.

## Design & Quota Conventions

- **Zero-chrome calm UI**: Malleable cards (`node.html`) render inside sandboxed `srcdoc` iframes with `window.asterism`. Keep chrome minimal; inline handlers added in `public/index.html` or dynamic templates must be exposed on `window` in `public/js/app.mjs`.
- **Provider quota preference**: Prefer `antigravity` (`gemini-4-neon`, `gemini-4-argon`), `muse` (`muse-wonder-full-1.0`), and `codex` (`gpt-6.2-sol`). Avoid `claudeAgent` unless explicitly requested.
