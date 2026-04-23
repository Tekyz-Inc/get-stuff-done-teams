# M44-D8 — Spawn Plan Visibility — Tasks

## Wave 3 (parallel-safe with D2; independent of D3)

- [x] done (2026-04-23 · commit eed80bb) **M44-D8-T1** — `bin/spawn-plan-writer.cjs` module + `.gsd-t/contracts/spawn-plan-contract.md` skeleton
  - Pure module exporting `writeSpawnPlan({spawnId, kind, milestone, wave, domains, tasks, projectDir})`
  - Atomic write: temp file + rename
  - Returns absolute path of written file
  - touches: `bin/spawn-plan-writer.cjs`, `.gsd-t/contracts/spawn-plan-contract.md`, `.gsd-t/spawns/.gitkeep`

- [x] done (2026-04-23 · commit 5a5dae6) **M44-D8-T2** — `bin/spawn-plan-status-updater.cjs` + post-commit hook
  - Module exporting `markTaskDone({spawnId, taskId, commit, tokens?, projectDir})` and `markSpawnEnded({spawnId, endedReason, projectDir})`
  - Hook script `scripts/gsd-t-post-commit-spawn-plan.sh` greps commit msg for `\[M\d+-D\d+-T\d+\]` matches, scans active spawn plans, looks up token attribution from `.gsd-t/token-log.md` for the task within the spawn's time window, calls updater with `{taskId, commit, tokens}`
  - Token attribution lookup: parse token-log rows where `Task` column matches the id and `Datetime-start >= spawn.startedAt`; sum `in/out/cr/cc/cost_usd` across matching rows; null if no matches
  - Hook template `templates/hooks/post-commit-spawn-plan.sh` for `gsd-t init` to install
  - touches: `bin/spawn-plan-status-updater.cjs`, `scripts/gsd-t-post-commit-spawn-plan.sh`, `templates/hooks/post-commit-spawn-plan.sh`

- [x] done (2026-04-23 · commit 83a8227) **M44-D8-T3** — Writer integration in 3 chokepoints
  - `bin/gsd-t-token-capture.cjs` `captureSpawn()` calls `writeSpawnPlan` before `await spawnFn()` and `markSpawnEnded` after (success/error both)
  - `bin/headless-auto-spawn.cjs` `autoSpawnHeadless()` calls `writeSpawnPlan` before spawn
  - `commands/gsd-t-resume.md` Step 0 (under `GSD_T_UNATTENDED_WORKER=1`) calls `writeSpawnPlan` once at iteration start
  - touches: `bin/gsd-t-token-capture.cjs`, `bin/headless-auto-spawn.cjs`, `commands/gsd-t-resume.md`

- [x] done (2026-04-23 · commit 1a86735) **M44-D8-T4** — Plan derivation helper
  - `bin/spawn-plan-derive.cjs` exporting `derivePlanFromPartition({projectDir, milestone, currentIter})`
  - Reads `.gsd-t/partition.md` + `.gsd-t/domains/*/tasks.md`
  - Returns `{wave, domains, tasks}` for the current incomplete-tasks slice
  - Used by all three writer chokepoints
  - touches: `bin/spawn-plan-derive.cjs`

- [x] done (2026-04-23 · commit 42456e3) **M44-D8-T5** — Dashboard server endpoint + SSE channel
  - `scripts/gsd-t-dashboard-server.js` adds `GET /api/spawn-plans` returning array of plan files where `endedAt === null`
  - Adds `spawn-plan-update` SSE channel; fs.watch on `.gsd-t/spawns/*.json` emits `{spawnId, plan}` on change
  - touches: `scripts/gsd-t-dashboard-server.js`

- [x] done (2026-04-23 · commit d7b1297) **M44-D8-T6** — Transcript renderer right-side panel
  - `scripts/gsd-t-transcript.html` adds `<aside class="spawn-panel">` with two `<section>` (Layer 1 project, Layer 2 active spawn)
  - CSS: right-side fixed panel, scrollable, dim active card when no spawn; token cell right-aligned, monospace font, dim color
  - JS: SSE consumer for `spawn-plan-update`, initial GET to `/api/spawn-plans`, render functions for both layers, status icon mapping (`☐ ◐ ✓`)
  - Token cell renderer: `fmtTokens({in, out, cr, cc, cost_usd})` → `in=12.5k out=1.7k $0.42` with k-suffix above 1000; `—` when null
  - Cumulative totals: Layer 1 milestone header sums all done-task tokens; Layer 2 spawn header sums spawn's done-task tokens
  - touches: `scripts/gsd-t-transcript.html`

- [x] done (2026-04-23 · commit pending) **M44-D8-T7** — Tests + doc ripple
  - `test/m44-d8-spawn-plan-writer.test.js`
  - `test/m44-d8-spawn-plan-status-updater.test.js` — covers tokens field write
  - `test/m44-d8-post-commit-hook.test.js` — covers token-log attribution lookup
  - `test/m44-d8-dashboard-spawn-plans-endpoint.test.js`
  - `test/m44-d8-transcript-renderer-panel.test.js` — covers fmtTokens helper + cumulative totals
  - `docs/architecture.md` — Observability subsection
  - `.gsd-t/progress.md` — Decision Log entry
  - `commands/gsd-t-help.md` — note panel + token attribution
  - touches: 5 test files + `docs/architecture.md` + `.gsd-t/progress.md` + `commands/gsd-t-help.md`
