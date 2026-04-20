# Tasks: d1-orchestrator-core

## Summary
The external JS orchestrator that drives `claude -p` workers, one task per spawn. Owns queue, wave semantics, worker lifecycle, state persistence. Ships in two stages: a minimal slice for the D0 benchmark gate, then the full implementation after D0 PASS.

## Tasks

### Task 1: Config loader
- **Files**: `bin/gsd-t-orchestrator-config.cjs` (NEW)
- **Contract refs**: `.gsd-t/contracts/wave-join-contract.md`
- **Dependencies**: NONE
- **Wave**: 0
- **Acceptance criteria**:
  - Exports `loadConfig({ projectDir, cliFlags, env })` → merged config
  - Precedence: default < `.gsd-t/orchestrator.config.json` < CLI flags < env (`GSD_T_MAX_PARALLEL`, `GSD_T_WORKER_TIMEOUT_MS`)
  - Defaults: `maxParallel: 3`, `workerTimeoutMs: 270000`, `retryOnFail: true`, `haltOnSecondFail: true`
  - Rejects `maxParallel > 15` (Team Mode §15 ceiling) with clear error
  - Unit-tested: each precedence layer, each rejection

### Task 2: Task queue + wave partitioning (minimal)
- **Files**: `bin/gsd-t-orchestrator-queue.cjs` (NEW)
- **Contract refs**: `.gsd-t/contracts/wave-join-contract.md`
- **Dependencies**: Requires Task 1
- **Wave**: 0
- **Acceptance criteria**:
  - Parses tasks.md across all `.gsd-t/domains/*/tasks.md`; extracts `wave: N` field per task
  - `groupByWave(tasks)` → `Map<waveNum, Task[]>`, sorted ascending
  - Tasks without explicit wave field default to wave 0 (backward-compat safety)
  - Validates: no task has forward cross-wave dep (e.g., wave 1 task BLOCKED BY wave 2 task)
  - Unit-tested: single-wave, multi-wave, dep validation

### Task 3: Worker lifecycle (minimal — for D0 benchmark)
- **Files**: `bin/gsd-t-orchestrator-worker.cjs` (NEW)
- **Contract refs**: `.gsd-t/contracts/completion-signal-contract.md`, `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: Requires Task 1, BLOCKED BY d3-completion-protocol Task 2 (consumes `assertCompletion`)
- **Wave**: 0
- **Acceptance criteria**:
  - Exports `runWorker({ task, brief, config, onFrame })` → `Promise<{ result, exitCode, durationMs }>`
  - Spawns `claude -p --dangerously-skip-permissions --output-format stream-json --model {task.model||sonnet}` with brief on stdin
  - Pipes worker stdout line-by-line; each line → `onFrame(frame)` (no persistence yet, that's D4's job)
  - Enforces `config.workerTimeoutMs`: SIGTERM, wait 5s, SIGKILL; logs `[worker_timeout] iter=N budget=Nms elapsed=Nms`
  - Worker cwd = `config.projectDir`; env includes `GSD_T_PROJECT_DIR`
  - After exit, calls `assertCompletion(...)` and returns `result: {ok, missing, details}`
  - Unit-tested with a mock `claude` binary (tiny shell script that emits predictable frames)

### Task 4: Main entry CLI + wave-join loop (minimal)
- **Files**: `bin/gsd-t-orchestrator.js` (NEW)
- **Contract refs**: `.gsd-t/contracts/wave-join-contract.md`
- **Dependencies**: Requires Tasks 1–3, BLOCKED BY d2-task-brief-builder Task 3 (needs `buildTaskBrief`)
- **Wave**: 0
- **Acceptance criteria**:
  - CLI: `gsd-t orchestrate --milestone Mxx [--max-parallel N] [--worker-timeout ms]`
  - Iterates waves in order; within wave, `Promise.all` with concurrency cap = `config.maxParallel`
  - Strict wave barrier: wave N+1 never starts until wave N all-done
  - On task fail: retries once (D3 policy); second fail → SIGTERMs siblings, halts wave, exits non-zero
  - Writes `.gsd-t/orchestrator/state.json` atomically (tmp + rename) after every task transition
  - Writes `.gsd-t/events/YYYY-MM-DD.jsonl` task-start/task-done events (reuses existing schema)
  - Integration-tested: 2-wave fixture (4 tasks) drives to completion against mock `claude`

### Task 5: Add `orchestrate` subcommand to main CLI
- **Files**: `bin/gsd-t.js` (MODIFY — additive subcommand block)
- **Contract refs**: N/A (wiring only)
- **Dependencies**: Requires Task 4
- **Wave**: 0
- **Acceptance criteria**:
  - `gsd-t orchestrate ...` dispatches to `bin/gsd-t-orchestrator.js`
  - `gsd-t orchestrate --help` prints flag summary
  - `gsd-t --help` lists `orchestrate` subcommand
  - Does not break existing `gsd-t install/update/status/doctor/headless/metrics/graph` dispatch
  - Smoke-tested: each existing subcommand still works

### Task 6: Full worker — contract excerpt pruning + state.json refinement
- **Files**: `bin/gsd-t-orchestrator-worker.cjs` (MODIFY), `bin/gsd-t-orchestrator.js` (MODIFY)
- **Contract refs**: `.gsd-t/contracts/wave-join-contract.md`, `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: BLOCKED BY d0-speed-benchmark Task 3 (gate)
- **Wave**: 2
- **Acceptance criteria**:
  - Worker emits `task-boundary start` / `done` / `failed` synthetic frames via `onFrame`
  - Orchestrator emits `wave-boundary start` / `done` / `failed` synthetic frames
  - `state.json` schema includes: `currentWave`, `tasks: { [id]: {status, startedAt, exitCode, retryCount, workerPid} }`, `status: running|paused|done|failed|interrupted`
  - SIGINT handler: SIGTERMs all workers, marks state `interrupted`, exits 130
  - Integration test covers: SIGINT mid-wave, second-failure halt, successful 3-wave run

### Task 7: D4 stream sink wiring
- **Files**: `bin/gsd-t-orchestrator-worker.cjs` (MODIFY)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: Requires Task 6, BLOCKED BY d4-stream-feed-server Task 1 (client needs server endpoint)
- **Wave**: 3
- **Acceptance criteria**:
  - `onFrame` callback now ALSO POSTs to `http://127.0.0.1:{config.streamFeedPort}/ingest?workerPid={pid}&taskId={id}` via `bin/gsd-t-stream-feed-client.cjs`
  - On stream-feed unreachable: spools to `.gsd-t/stream-feed/spool-{pid}.jsonl`, logs warning, does NOT fail the task
  - Unit-tested: normal path, unreachable path (spool), slow-server path (no backpressure to orchestrator)

## Execution Estimate
- Total tasks: 7
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other domains): 3 (Task 3 blocked by D3, Task 4 blocked by D2, Task 6 blocked by D0, Task 7 blocked by D4)
- Blocked tasks (within domain): 3 (Task 2 on 1, Task 5 on 4)
- Estimated checkpoints: 2 (D0 gate, D4 ready)
