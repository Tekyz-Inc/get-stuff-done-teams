# Constraints: d1-orchestrator-core

## Must Follow
- Zero external npm runtime deps. Use node built-ins (`child_process`, `fs`, `path`, `stream`, `events`).
- Every `claude -p` spawn MUST include `--dangerously-skip-permissions` (user-memory rule: headless child exits on first tool use otherwise).
- Worker timeout DEFAULT 270000ms (270s, cache-warm pacing from M39 §16). Configurable via `--worker-timeout` flag.
- One task per spawn. A worker never receives a second task. Fresh context each time = compaction architecturally impossible.
- On worker timeout: send SIGTERM, wait 5s, then SIGKILL. Log `[worker_timeout] iter=N budget=Nms elapsed=Nms` (same format as unattended supervisor, for consistency).
- On worker non-zero exit: treat as task failure, halt the wave, do NOT auto-retry within the orchestrator (D3 retry policy is advisory; D1 respects it but the default is halt).
- Write state.json atomically (tmp file + rename) to survive orchestrator crash mid-write.
- Worker cwd invariant: every spawned worker's `cwd` MUST equal `process.cwd()` of the orchestrator. Pass `GSD_T_PROJECT_DIR` env explicitly (M39 bug-fix pattern).

## Must Not
- Run more than `maxParallel` workers at once (absolute ceiling: 15 per Team Mode §15).
- Merge tasks across waves into a single Promise.all. Waves are strict barriers.
- Retry a failed task silently. D3 contract defines retry-or-halt semantics; orchestrator obeys without hiding the failure.
- Write to worker's stdin after spawn (interactive mode is forbidden; workers read the task brief from the prompt string at spawn time only).
- Read/parse the worker's stream-json frames for semantic meaning. The orchestrator only cares about: (a) completion signal per D3, (b) exit code, (c) timeout. Semantic rendering is D4/D5's job.

## Must Read Before Using
- `bin/gsd-t-unattended.cjs` `_spawnWorker()` — prior art; reuse the spawn shape, the prompt envelope, the CWD Invariant block.
- `.gsd-t/contracts/headless-default-contract.md` v1.0.0.
- `.gsd-t/contracts/completion-signal-contract.md` (D3) — consume this contract.
- `.gsd-t/contracts/task-brief-contract.md` (D2) — consume this contract.
- `.gsd-t/contracts/stream-json-sink-contract.md` (D1↔D4) — producer of this pipe.
- `.gsd-t/contracts/wave-join-contract.md` (D1 owner) — defines its own semantics.

## Dependencies
- Depends on: D2 (task-brief-builder) for prompt content. D3 (completion-protocol contract) for done-signal semantics.
- Depended on by: D0 (speed-benchmark needs a minimal slice), D4 (stream-feed-server pipes orchestrator's worker stdout), D6 (recovery reads state.json).
