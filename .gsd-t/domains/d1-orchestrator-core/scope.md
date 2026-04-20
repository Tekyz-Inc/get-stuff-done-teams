# Domain: d1-orchestrator-core

## Responsibility
The external JS orchestrator. Owns the task queue, worker spawn via `claude -p` (one task per spawn = no compaction possible), completion detection, kill/respawn on timeout or crash, and wave-join semantics (`Promise.all` over parallel-safe tasks per wave).

## Owned Files/Directories
- `bin/gsd-t-orchestrator.js` — main entry; CLI: `gsd-t orchestrate --milestone Mxx [--max-parallel N] [--watch]`
- `bin/gsd-t-orchestrator-queue.cjs` — task queue + wave partitioning (reads .gsd-t/domains/*/tasks.md, groups by wave-id)
- `bin/gsd-t-orchestrator-worker.cjs` — single-worker lifecycle: spawn `claude -p`, pipe stream-json stdout, detect completion per D3 contract, kill on timeout
- `bin/gsd-t-orchestrator-config.cjs` — config merge: CLI flags → env → `.gsd-t/orchestrator.config.json` → defaults
- `test/m40-orchestrator-core.test.js` — unit tests for queue, worker, config

## NOT Owned (do not modify)
- `bin/gsd-t-unattended.cjs` (stays as the detached supervisor, per M40 scope §Explicitly NOT in scope)
- `commands/gsd-t-execute.md` — unchanged
- `scripts/gsd-t-agent-dashboard*` — D4 consumes orchestrator's stream-json output; D1 does not reach into the dashboard
- Task brief rendering (D2)
- Completion semantics (D3 defines; D1 consumes the contract)

## Integration Points
- Reads: D2's `buildTaskBrief(taskId)` → per-task prompt string.
- Writes: stream-json frames to stdout of each worker, captured by D4's stream-feed-server on a named pipe / unix socket or via stdio piping.
- Writes: `.gsd-t/events/YYYY-MM-DD.jsonl` task-start/task-done events (reuses existing event schema).
- Writes: `.gsd-t/orchestrator/state.json` for D6 recovery — current wave index, per-task status, worker PIDs.

## Wave Semantics
- Wave = set of tasks marked with the same `wave: N` field in tasks.md.
- Waves execute strictly sequentially. Within a wave, `Promise.all` up to `maxParallel` (default 3, max 15 per Team Mode §15).
- Wave-join: a wave completes only when ALL its tasks hit the D3 done-signal. First failure kills remaining workers in the wave and halts.
