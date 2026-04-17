# Domain: d2-progress-watch

## Responsibility

Universal task-list view under every `--watch` surface. State-file-driven (`.gsd-t/.watch-state/{agent_id}.json`) tree builder + renderer. Each workflow command's numbered Step fires a small state-writer CLI call that records `start|advance|done` with `parent_agent_id` lineage so a watcher can reconstruct the full tree (requirements → partition → milestone(s) → plan/execute/verify/complete) and render ✅ / 🔄 / ⬜ markers below the existing `--watch` banner (banner preserved intact).

## Owned Files / Directories

- `bin/watch-progress.js` (NEW) — tree builder + renderer. Reads `.gsd-t/.watch-state/*.json` state files, reconstructs agent tree via `parent_agent_id`, prints task-list tree with ✅/🔄/⬜ markers.
- `scripts/gsd-t-watch-state.js` (NEW) — state writer CLI. Interface: `node gsd-t-watch-state.js start|advance|done --agent-id X --parent-id Y --command Z --step N --step-label "..."`.
- `.gsd-t/.watch-state/` (NEW directory) — gitignored runtime state directory containing `{agent_id}.json` per-agent state files.
- `test/watch-progress.test.js` (NEW) — unit tests for tree builder + renderer + state writer CLI.
- `.gsd-t/contracts/watch-progress-contract.md` v1.0.0 (NEW, stubbed in partition; full body written during execute) — state-file schema, tree reconstruction algorithm, render format, integration contract for watch callers.
- `.gitignore` (EDIT) — add `.gsd-t/.watch-state/` exclusion.

Shims added to the numbered Steps of ~17 workflow command files (additive blocks, no rewriting of command bodies):

- `commands/gsd-t-project.md`
- `commands/gsd-t-feature.md`
- `commands/gsd-t-milestone.md`
- `commands/gsd-t-partition.md`
- `commands/gsd-t-plan.md`
- `commands/gsd-t-execute.md`
- `commands/gsd-t-test-sync.md`
- `commands/gsd-t-integrate.md`
- `commands/gsd-t-verify.md`
- `commands/gsd-t-complete-milestone.md`
- `commands/gsd-t-scan.md`
- `commands/gsd-t-gap-analysis.md`
- `commands/gsd-t-wave.md`
- `commands/gsd-t-quick.md`
- `commands/gsd-t-debug.md`
- `commands/gsd-t-unattended.md`
- `commands/gsd-t-resume.md`

Integration points (additive render calls below banner — banner untouched):

- `bin/gsd-t-unattended.cjs` watch printer — append rendered task list below banner.
- `bin/unattended-watch-format.cjs` — append rendered task list below banner.
- `bin/headless-auto-spawn.cjs` `autoSpawnHeadless` watch fallback — append rendered task list below banner.

## NOT Owned (do not modify)

- `bin/gsd-t-unattended.cjs::_spawnWorker` prompt text — owned by D3 (parallel-exec).
- `bin/gsd-t-unattended.cjs` main relay loop (lines ~861–939) and worker timeout constants — owned by D4 (cache-warm-pacing).
- Any non-workflow command file (backlog-*, optimization-*, help, status, metrics, setup, populate, init, etc.) — outside scope of state-writer shims.
- `unattended-supervisor-contract.md` §15 (D3) and §16 (D4) — D2 does not touch these additions.

## Out of Scope

- Rendering historical archived milestones (D2 renders the active workflow tree only).
- Replacing the existing `--watch` banner (banner preserved intact; task list appears below).
- bee-poc parallel-unattended verification — post-release, not in M39 scope.
