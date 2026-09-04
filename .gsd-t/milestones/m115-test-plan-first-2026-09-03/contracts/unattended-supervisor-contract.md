# Contract: Unattended Supervisor

**Version**: 1.5.0
**Status**: ACTIVE for M43
**Owner**: m36-supervisor-core + m36-watch-loop (shared)
**Consumers**: m36-supervisor-core, m36-watch-loop, m36-safety-rails, m36-cross-platform, m36-m35-gap-fixes, m36-docs-and-tests
**Depends on**: `headless-default-contract.md` v1.0.0 (M38; folds-and-supersedes headless-auto-spawn-contract v1.0.0 from M35) — supervisor is a higher-level relay built above the same substrate
**Related**: `token-budget-contract.md` v3.0.0 (M35), `model-selection-contract.md` v1.0.0 (M35), `unattended-event-stream-contract.md` v1.0.0 (M38; heartbeat watchdog consumes its `.gsd-t/events/YYYY-MM-DD.jsonl` append stream as the liveness signal)

---

## 1. Goal

Define the authoritative interface of the cross-platform unattended supervisor: the OS-level process that spawns fresh `claude -p` workers in a relay to run the active GSD-T milestone to completion over hours or days without human intervention.

This contract covers: the state file schema, PID file lifecycle, sentinel file semantics, exit-code table, launch handshake, resume auto-reattach handshake, and the CLI surface. It does NOT cover: how the supervisor is implemented internally, which gutter-detection algorithms safety-rails uses, or how notifications are formatted per platform. Those are implementation details owned by each domain.

---

## 2. Runtime File Layout

All supervisor runtime state lives under `.gsd-t/.unattended/`:

```
.gsd-t/.unattended/
├── supervisor.pid     — JSON fingerprint `{pid, projectDir, startedAt}` of the running supervisor (v1.4.1+). Exists ONLY while a supervisor is alive. Legacy bare-integer form still readable by `bin/supervisor-pid-fingerprint.cjs`.
├── state.json         — Live state snapshot. Atomically rewritten by the supervisor between iterations.
├── run.log            — Append-only worker stdout+stderr. Never truncated during a run. Rotation is v2.
├── stop               — Sentinel file. Absence = run. Presence = user has requested stop. Supervisor checks between workers.
└── config.json        — Optional. Overrides for thresholds. Absence = defaults.
```

The directory is created on first supervisor launch. `.gsd-t/.handoff/` (owned by m36-m35-gap-fixes) is a sibling directory for M35-compatible single-shot handoff locks.

---

## 3. `state.json` Schema (v1)

```json
{
  "version": "1.0.0",
  "sessionId": "unattended-2026-04-15-1100-a3c7",
  "projectDir": "/Users/david/projects/example",
  "status": "running",
  "milestone": "M36",
  "wave": 2,
  "task": "5/12",
  "iter": 37,
  "maxIterations": 200,
  "startedAt": "2026-04-15T11:00:00Z",
  "lastTick": "2026-04-15T14:30:00Z",
  "lastWorkerStartedAt": "2026-04-15T14:25:00Z",
  "lastWorkerFinishedAt": "2026-04-15T14:30:00Z",
  "lastExit": 0,
  "lastElapsedMs": 300000,
  "hours": 24,
  "wallClockElapsedMs": 12600000,
  "supervisorPid": 54321,
  "logPath": ".gsd-t/.unattended/run.log",
  "sleepPreventionHandle": null,
  "platform": "darwin",
  "claudeBin": "/usr/local/bin/claude"
}
```

### Field semantics

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `version` | string | yes | Contract version that wrote this file. Readers must tolerate minor bumps. |
| `sessionId` | string | yes | Unique ID for this supervisor run. Format: `unattended-{ISO-date-slug}-{random4}`. |
| `projectDir` | string | yes | Absolute path to the project the supervisor is driving. |
| `status` | enum | yes | One of: `initializing`, `running`, `done`, `failed`, `stopped`, `crashed`. See §4. |
| `milestone` | string | yes | Milestone ID from `.gsd-t/progress.md` header (e.g., "M36"). |
| `wave` | integer | no | Current wave number if in-wave, else absent. |
| `task` | string | no | Human-readable current task marker (e.g., "5/12"), else absent. |
| `iter` | integer | yes | Count of completed worker iterations. Starts at 0 during `initializing`. |
| `maxIterations` | integer | yes | Cap from CLI `--max-iterations` (default 200). |
| `startedAt` | ISO8601 string | yes | When the supervisor first launched. |
| `lastTick` | ISO8601 string | yes | Last time state.json was written. Watch-loop uses this as a liveness hint. |
| `lastWorkerStartedAt` | ISO8601 string | no | Start of the most recent worker spawn. Absent before iter=1. |
| `lastWorkerFinishedAt` | ISO8601 string | no | End of the most recent worker spawn. Absent before iter=1. |
| `lastExit` | integer | no | Mapped exit code of the most recent worker (see §5). Absent before iter=1. |
| `lastElapsedMs` | integer | no | Duration of the most recent worker in milliseconds. |
| `hours` | number | yes | Wall-clock cap from CLI `--hours` (default 24). |
| `wallClockElapsedMs` | integer | yes | Total elapsed time since `startedAt`. |
| `supervisorPid` | integer | yes | PID of the supervisor process. Duplicates `supervisor.pid` for convenience. |
| `logPath` | string | yes | Absolute or project-relative path to `run.log`. |
| `sleepPreventionHandle` | integer or null | no | Opaque handle (PID of `caffeinate` on darwin, null elsewhere). Released on exit. |
| `platform` | enum | yes | `darwin`, `linux`, `win32`. |
| `claudeBin` | string | yes | Resolved path to the `claude` binary (or `claude.cmd` on win32). |
| `lastExits` | `Array<{idx, code, taskIds, elapsedMs, spawnId}>` | no | v1.5.0 — present only on fan-out iters. Per-worker outcomes from the last multi-worker iter. Omitted on N=1 iters. See §15a. |
| `workerPids` | `Array<string\|null>` | no | v1.5.0 — present only on fan-out iters. Per-worker transcript-tee spawn IDs aligned with `lastExits[i]`. See §15a. |
| `lastFanOutCount` | integer | no | v1.5.0 — present only on fan-out iters. N workers. See §15a. |

### Write semantics

- State is written atomically: write to `state.json.tmp`, then `fs.renameSync('state.json.tmp', 'state.json')`. Readers tolerate transient absence and retry once.
- State is rewritten AT MINIMUM on: supervisor start (`initializing`), before every worker spawn (`running`, iter++), after every worker return (`lastExit`, `lastElapsedMs` updated), and on any terminal transition.
- Writers MUST update `lastTick` on every write.
- Readers (watch-loop, status command) MUST treat a stale `lastTick` (> 2× tick cadence = > 540s) as a "supervisor unhealthy" signal but NOT a crash. Use `kill -0` + PID for crash detection.

---

## 4. Status Enum

| Value | Meaning | Terminal? |
|-------|---------|-----------|
| `initializing` | Supervisor is starting up. PID file written but state not yet fully populated. | no |
| `running` | Main loop active. Workers spawning. | no |
| `done` | Milestone reached COMPLETED status via the normal workflow. | yes |
| `failed` | Supervisor halted due to unrecoverable error (worker exit 4, dispatch failure exit 5, preflight refusal, etc.). | yes |
| `stopped` | User requested stop via `.gsd-t/.unattended/stop` sentinel and supervisor honored it. | yes |
| `crashed` | Supervisor process is no longer alive but state file status is not terminal. Detected by readers, never written by the supervisor itself. | yes (detected) |

Terminal states mean: the supervisor has finalized its state file and removed its PID file. Watch loop and resume auto-reattach STOP rescheduling / reattaching when they observe a terminal status.

---

## 5. Exit Code Table (Unified with `bin/gsd-t.js` `mapHeadlessExitCode`)

| Code | Name | Meaning | Source |
|------|------|---------|--------|
| 0 | success | Worker completed normally; milestone may or may not be done. | Worker exit 0 + no sentinel match |
| 1 | worker-generic-failure | Worker exited non-zero, no specific sentinel. | Worker exit ≠ 0 |
| 2 | preflight-failure | Config error, state corruption, missing project dir, malformed state.json. | Supervisor or safety rails |
| 3 | timeout | Worker wall-clock timeout (default 1h per iter post-v1.4.0 — absolute backstop; heartbeat is primary). | spawn timeout |
| 4 | unrecoverable | Worker reported unrecoverable error (2 fix attempts failed + debug-loop exit 4). | mapHeadlessExitCode sentinel |
| 5 | command-dispatch-failed | `Unknown command:` in worker stdout. Worker invocation form is broken. | mapHeadlessExitCode, added in M36 Phase 0 |
| 6 | gutter-detected | Safety rails detected a stall pattern (repeated error / file thrash / no progress for N iters). | m36-safety-rails |
| 7 | protected-branch-refusal | Pre-flight: current git branch is in the protected list. | m36-safety-rails |
| 8 | dirty-tree-refusal | Pre-flight: git status failed (non-file error only — dirty files are auto-whitelisted). | m36-safety-rails |
| 124 | worker-timeout | Wall-clock absolute-backstop timeout (default 1h post-v1.4.0). Set `lastExitReason="worker_timeout"`. | spawn timeout |
| 125 | stale-heartbeat | Heartbeat watchdog fired — events.jsonl mtime stopped advancing for `staleHeartbeatMs` (default 5min). Supervisor SIGTERM'd the worker. Set `lastExitReason="stale_heartbeat"`. | §16a heartbeat watchdog |

Codes 6–8 are **supervisor-level halts** (safety rails), not worker exit codes. They are recorded in `state.json.lastExit` and trigger `status = failed`.

---

## 6. CLI Surface

```
gsd-t unattended [OPTIONS]
  --hours=24              Wall-clock cap (default 24)
  --max-iterations=200    Iteration cap (default 200)
  --project=.             Project directory (default cwd)
  --branch=AUTO           Branch to run on; AUTO = current non-protected branch
  --on-done=print         Terminal action: print | merge-commit (merge-commit is v2)
  --dry-run               Preflight only; no spawn
  --verbose               Extra log detail
  --test-mode             Uses stub worker; for CI and smoke tests
  --worker-timeout=3600000    Per-iter absolute-backstop timeout in ms.
                              Default 3_600_000 (1 h) post-v1.4.0. See §16.
                              This is a BACKSTOP; the heartbeat watchdog
                              (§16a) is the primary stuck-worker detector.
  --stale-heartbeat-ms=300000 Heartbeat staleness threshold in ms. Default
                              300_000 (5 min). See §16a.
```

Exit codes of the `gsd-t unattended` CLI itself mirror §5 at termination time.

---

## 7. Launch Handshake

1. **User** invokes `/gsd-t-unattended` in an interactive Claude session.
2. **Launch command** pre-flights:
   - Reads project; verifies `.gsd-t/progress.md` exists and has an active non-COMPLETED milestone.
   - Checks `.gsd-t/.unattended/supervisor.pid` — if present AND `kill -0` succeeds, refuse with "already running" message and ScheduleWakeup a watch tick instead. Singleton.
   - Invokes safety rails pre-flight: branch check, dirty-tree check, state-validation.
   - If any pre-flight fails → report reason, exit without spawning. No state file written.
3. **Launch command** spawns the supervisor:
   ```js
   // binPath = absolute path to bin/gsd-t-unattended.cjs
   const child = spawn('node', [binPath, ...args], {
     cwd: projectDir,
     detached: true,
     stdio: 'ignore',
     windowsHide: true,  // win32 only
   });
   child.unref();
   ```
4. **Launch command** polls for supervisor readiness: wait up to 5 seconds for `.gsd-t/.unattended/supervisor.pid` to appear AND `state.json.status === 'running'` (not `initializing`).
5. **Launch command** displays the initial watch block and calls `ScheduleWakeup(270, '/gsd-t-unattended-watch', reason='unattended tick 0')`.
6. Launch command returns. Interactive Claude session continues.

---

## 8. Watch Tick Decision Tree

Each `/gsd-t-unattended-watch` firing:

1. Read `supervisor.pid` — absent → supervisor finalized cleanly. Read final `state.json`, print report, STOP.
2. `kill -0 {pid}` — fails → `crashed`. Print diagnostics + `run.log` tail, STOP.
3. Read `state.json`:
   - `status === 'done'` → success report, STOP.
   - `status === 'failed'` → failure summary + log path, STOP.
   - `status === 'stopped'` → user-stop confirmation, STOP.
   - `status === 'initializing'` or `'running'` → render watch block, go to 4.
4. `ScheduleWakeup(270, '/gsd-t-unattended-watch', reason='unattended tick {iter}')`, end turn.

"Print report" means: emit a final one-block summary with total elapsed, total iterations, final status, and a pointer to `run.log` and `state.json`. Do not reschedule.

---

## 9. Resume Auto-Reattach Handshake

When `/gsd-t-resume` runs, its NEW Step 0 (owned by m36-watch-loop) executes BEFORE any other resume logic:

1. If `.gsd-t/.unattended/supervisor.pid` does not exist → fall through to normal resume flow (unchanged).
2. Read PID. `kill -0 {pid}` fails → supervisor is crashed. Log the crash, remove the stale PID file, fall through to normal resume. (Don't silently swallow — state.json still says "running" in this case, which is valuable diagnostic info.)
3. `kill -0` succeeds → read `state.json`:
   - Terminal status → fall through to normal resume flow (supervisor is done, just hasn't been cleaned up yet by the watch loop or the next tick).
   - Non-terminal → **auto-reattach**: SKIP normal resume flow entirely. Print the current watch block. Call `ScheduleWakeup(270, '/gsd-t-unattended-watch', reason='resumed watch')`. Return.

The resume auto-reattach is idempotent — running it multiple times in the same session with the same live supervisor is a no-op beyond reprinting the watch block.

---

## 10. Stop Mechanism

User invokes `/gsd-t-unattended-stop`:
1. Command creates `.gsd-t/.unattended/stop` (touches the file, writes current ISO timestamp as body for diagnostics).
2. Command prints "Stop requested. Supervisor will halt after the current worker finishes."
3. Command returns immediately. No wait, no kill.

Supervisor, between workers:
1. Checks `fs.existsSync('.gsd-t/.unattended/stop')`.
2. If present → set `status = 'stopped'`, finalize state.json, remove supervisor.pid, exit 0.
3. The sentinel file is NOT removed by the supervisor (leaves evidence). Next launch detects the stale sentinel and removes it before starting, after printing a reassuring message.

The sentinel-file approach is race-free, terminal-close-safe, and language-agnostic.

---

## 11. Notification Levels

`notify(title, message, level)` supports four levels:

| Level | Meaning | Platform mapping |
|-------|---------|-----------------|
| `info` | Informational; routine progress | Silent display, no sound |
| `warn` | Potential issue; gutter warnings | Display with warning icon |
| `done` | Milestone complete | Display with success sound |
| `failed` | Halted due to failure | Display with alert sound |

The supervisor invokes `notify` on terminal transitions (`done`, `failed`, `stopped`) and on significant gutter warnings (v2). v1 only notifies on terminal transitions.

---

## 12. Safety Rails Hook Points

Safety rails check functions are called by the supervisor at defined hook points:

| Hook | When | Functions called |
|------|------|------------------|
| pre-launch | Before spawning supervisor child process | `checkGitBranch`, `checkWorktreeCleanliness` |
| supervisor-init | Supervisor first-iteration setup | `validateState` (with minimal state), `checkGitBranch` (re-verify) |
| pre-worker | Before each `spawnSync` of `claude -p` | `checkIterationCap`, `checkWallClockCap`, `validateState` |
| post-worker | After each worker returns | `detectBlockerSentinel(runLogTail)`, `detectGutter(state, runLogTail)` |

Each check returns `{ ok, reason?, code? }`. A `false` result halts the supervisor with the corresponding exit code and `status = 'failed'` (or `'stopped'` if the check is a user-initiated stop sentinel).

---

## 13. Configuration File (`config.json`)

```json
{
  "protectedBranches": ["main", "master", "develop", "trunk", "release/*", "hotfix/*"],
  "dirtyTreeWhitelist": [
    ".gsd-t/heartbeat-*.jsonl",
    ".gsd-t/.context-meter-state.json",
    ".gsd-t/events/*.jsonl",
    ".gsd-t/token-metrics.jsonl",
    ".gsd-t/token-log.md",
    ".gsd-t/.unattended/*",
    ".gsd-t/.handoff/*",
    ".claude/settings.local.json",
    ".claude/settings.local.json.bak*"
  ],
  "maxIterations": 200,
  "hours": 24,
  "gutterNoProgressIters": 5,
  "workerTimeoutMs": 3600000,
  "staleHeartbeatMs": 300000
}
```

Absence of `.gsd-t/.unattended/config.json` → use hardcoded defaults matching the values above. Presence overrides the defaults field-by-field (missing fields fall back to default).

`workerTimeoutMs` post-v1.4.0 defaults to 3,600,000 ms (1 h) as an absolute
backstop — the heartbeat watchdog (§16a) is the primary stuck-worker
detector. `staleHeartbeatMs` (new in v1.4.0) sets the heartbeat staleness
threshold (default 300,000 = 5 min).

---

## 14. Testing Contract

Every M36 code domain owns unit tests for its exported surface. `m36-docs-and-tests` owns an integration test under `test/m36-integration.test.js` that exercises the full supervisor loop with a shim `claude` binary (a Node script that emits canned output and exits). Coverage targets:

- Happy path: N iterations → milestone reaches COMPLETED → status=done → log+state finalized
- Gutter detection: stall pattern → safety halt → status=failed, exit=6
- Stop sentinel: mid-run stop → status=stopped, exit=0
- Dispatch failure: worker emits `Unknown command:` → exit 5 → halt
- Crash: supervisor killed mid-run (SIGKILL to PID) → watch tick detects, status transitions to crashed on read
- Dirty tree: pre-flight refuses → no state file written, clear error

Test count delta target: ~60 net new tests (supervisor-core 24 + watch-loop 12 + safety 18 + platform 9 + handoff-lock 11 + integration 10 ≈ 1083 → ~1165).

---

## 14a. Event Emission (v1.1.0)

The supervisor MUST emit structured events at phase boundaries via
`bin/event-stream.cjs` `appendEvent(projectDir, ev)`. Emission is additive
(state.json schema unchanged) and non-blocking (file-write failures are
logged but never halt the relay loop).

Schema and consumer rules live in `unattended-event-stream-contract.md` v1.0.0.
The four mandatory supervisor emission points:

| Event | Emitted When | Required fields (beyond ts/iter/type/source) |
|-------|--------------|------------------------------------------------|
| `task_start` | Before each `spawnWorker` call | `milestone`, `wave`, `task` |
| `task_complete` | After a worker exits with code 0 (milestone not yet complete counts) | `task`, `verdict`, `duration_s` |
| `error` | On non-zero worker exit (1/2/3/4/5/6/124) | `error`, `recoverable` |
| `retry` | When the loop continues after a non-terminal exit (0-incomplete / 1/2/3 / 124) | `attempt`, `reason` |

Workers spawned via `claude -p` MAY also emit their own events (file_changed,
test_result, subagent_verdict) — supervisor emission is the floor, not the ceiling.

## 14b. Worker Env Propagation (v1.2.0, v3.12.14)

`_spawnWorker` MUST construct the worker env such that the worker's
event-stream entries (both the `gsd-t-event-writer.js` CLI output and the
PostToolUse heartbeat hook entries) carry routing identity. Without this
propagation, `tool_call` events emit with `command=null, phase=null,
trace_id=null, model=null` even though the writer/hook have env-var fallbacks
(Fix 2, v3.12.12).

Required env block on every `platformSpawnWorker` call:

| Env var | Source | Default |
|---|---|---|
| `GSD_T_UNATTENDED_WORKER` | hard-coded | `"1"` |
| `GSD_T_COMMAND` | hard-coded | `"gsd-t-resume"` |
| `GSD_T_PHASE` | `state.phase` | `"execute"` |
| `GSD_T_PROJECT_DIR` | parent env or `opts.cwd` or `state.projectDir` | — |
| `GSD_T_TRACE_ID` | `state.traceId` or parent env | omitted if neither set |
| `GSD_T_MODEL` | `state.model` or parent env | omitted if neither set |

The token-log row appended by `_appendTokenLog` MUST substitute
`process.env.GSD_T_MODEL` for the previous hardcoded `"unknown"` placeholder
so supervisor iterations are attributable to their model.

## 15. Worker Team Mode (v1.3.0)

Added in v1.3.0 (M39) to close the 3–5× speed gap observed in the bee-poc
relay run (pid 69481: 45+ minutes on v3.12.13 for a milestone that finishes
in 10–15 minutes when executed in-session with Team Mode). Each `claude -p`
worker spawned by `_spawnWorker` now carries Team Mode instructions in its
prompt so it can parallelize intra-wave domain work itself. The supervisor
remains single-worker-per-iter; intra-wave parallelism is a **worker-level**
capability, not a supervisor-level one.

1. **Parallelism scope** — intra-wave only. All domains within a single wave
   may run concurrently. Inter-wave boundaries ALWAYS remain sequential:
   wave-N+1 may depend on wave-N contract updates, scope.md changes, or
   disk-based handoff artifacts, so the worker MUST finish every domain in
   the current wave before advancing to the next.
2. **Concurrency cap** — 15 concurrent Task subagents maximum. This matches
   the `/gsd-t-execute` Team Mode cap and is rooted in Claude Code's
   subagent scheduler budget. Exceeding it produces diminishing returns and
   starvation. Workers MUST NOT raise this cap without an explicit contract
   bump.
3. **Detection heuristic** — the worker reads `.gsd-t/partition.md` to
   identify the current wave and which domains belong to it, then reads
   `.gsd-t/domains/*/tasks.md` to count domains with incomplete tasks in
   that wave. If 2 or more domains have incomplete current-wave tasks →
   parallel path. If exactly 1 domain has incomplete current-wave tasks →
   sequential path. Domains whose current-wave tasks are all committed are
   skipped entirely.
4. **Sequential fallback** — single-domain waves execute sequentially
   inside the worker itself (no Task subagent spawn). Spawning a single
   subagent for a single-domain wave wastes a context and a round-trip
   without any parallelism benefit. The worker does the work directly.
5. **Spawn pattern** — mirrors `/gsd-t-execute` Team Mode exactly:
   `general-purpose` subagent_type, one subagent per domain, same prompt
   skeleton (domain name + `scope.md` + the current-wave slice of
   `tasks.md` + relevant contracts). No new subagent_type, no new prompt
   dialect — Team Mode is a single shape with a single enforcement story.
   Source of truth: `commands/gsd-t-execute.md` Step 3 "Team Mode" section.
6. **Wait semantics** — the worker waits for ALL spawned subagents to
   report back before advancing. No partial-return fast-paths, no
   speculative wave advance on first N-of-M completions. Wave closure is
   an all-or-nothing gate so the disk state is consistent before the next
   wave reads any contract or scope.
7. **Rationale** — closes the 3–5× speed gap from the bee-poc baseline
   (pid 69481 observed 45+ min on v3.12.13 for a milestone that Team Mode
   completes in-session in 10–15 min). Before v1.3.0, the unattended
   worker serialized every domain even when the wave had 3 or 4 parallel
   domains — Team Mode's speedup was available interactively but not in
   the supervisor relay. §15 plus the prompt edit in `_spawnWorker` close
   that gap without touching the supervisor control loop or event schema.

## 15a. Planner-Driven Multi-Worker Iter Fan-Out (v1.5.0)

Added in v1.5.0 (M44 D9) to deliver the supervisor-level parallelism called for
in the `continue-here-2026-04-23T223000.md` Step 2 charter. §15 Worker Team
Mode was a worker-level shim delegating intra-wave parallelism to the LLM via
prompt prose ("spawn up to 15 Task subagents"). Per the
`feedback_deterministic_orchestration` memory ("prompt-based blocking doesn't
work; use JS orchestrators for gates/waits"), that shim is the anti-pattern
§15a replaces for multi-task iters. §15 survives as the *single-task-worker*
fallback, scoped explicitly below.

### Decision flow (runs before every worker iter, inside `runMainLoop`)

1. **Plan**: supervisor calls `runParallel({projectDir, mode:'unattended', milestone, dryRun:true})` from `bin/gsd-t-parallel.cjs`. Plan applies all three upstream gates: D4 dep-graph validation, D5 file-disjointness prover, D6 per-task CW% economics (≤ 60% threshold for unattended mode; tasks over the threshold emit `task_split` events and the orchestrator is expected to slice them).
2. **Branch**:
   - `plan.workerCount >= 2` → **FAN-OUT path**: partition `plan.parallelTasks` via round-robin into N disjoint subsets, spawn N concurrent workers via `Promise.all`, each receiving its subset via env var `GSD_T_WORKER_TASK_IDS`. Emit `fan_out` event (`{type, iter, worker_count, task_ids}`).
   - Otherwise → **SEQUENTIAL fallback**: spawn exactly one worker via the v1.4.x `_spawnWorker` path, byte-for-byte identical behavior.
3. **Planner failure** (thrown exception, missing module) → emit `parallelism_reduced` with `reason: planner_error:…`, fall through to sequential. The parallel path is purely additive — zero failure modes introduced at the supervisor level.
4. **Join**: supervisor awaits all N workers before advancing. Iter counter increments ONCE per fan-out regardless of N. Merged result obeys the single-worker result schema (status = worst exit; stdout = per-worker blocks tagged `[WORKER i/N tasks=…]`; stderr concatenated; `staleHeartbeat`/`timedOut` = any worker).

### Worker Env Additions (v1.5.0)

On the fan-out path, each spawned worker receives these additional env vars (in addition to the §14b set):

| Var | Value | Meaning |
|-----|-------|---------|
| `GSD_T_WORKER_TASK_IDS` | comma-separated task IDs | The worker's disjoint assigned subset. Worker executes ONLY these task IDs. |
| `GSD_T_WORKER_INDEX` | integer | This worker's zero-based index in the fan-out (0..N-1). |
| `GSD_T_WORKER_TOTAL` | integer | Total N for this iter's fan-out. |
| `GSD_T_AGENT_ID` | `supervisor-iter-{iter}-w{idx}` | Per-worker agent id (§14b variant). The un-suffixed form still applies on N=1 iters. |

When `GSD_T_WORKER_TASK_IDS` is SET the worker MUST NOT spawn Task subagents to re-fan-out — supervisor already did. Worker executes its assigned task IDs sequentially and returns. This prevents double fan-out (super-linear subagent explosion when 15-cap Team Mode fires inside an already-4-worker fan-out).

### state.json Schema Additions (v1.5.0)

Additive-only. v1.4.x consumers continue to read the single-worker fields unchanged on N=1 iters; on fan-out iters they see the single-worker fields AS WELL AS the new multi-worker aggregates (or they can ignore the new fields entirely).

| Field | Type | Required | Present when | Meaning |
|-------|------|----------|--------------|---------|
| `lastExits` | `Array<{idx, code, taskIds, elapsedMs, spawnId}>` | no | fan-out iter only | Per-worker outcomes from the last iter's multi-worker spawn. Omitted on N=1 iters so single-worker readers stay clean. |
| `workerPids` | `Array<string\|null>` | no | fan-out iter only | Per-worker spawn IDs (the transcript-tee spawn-id, not OS PIDs, since the spawn layer is driven by transcript allocation). Aligned with `lastExits[i]`. |
| `lastFanOutCount` | integer | no | fan-out iter only | N. Omitted on N=1 iters. |

On the SEQUENTIAL fallback path, `runMainLoop` explicitly `delete`s these three fields from `state` before `writeState` so a fan-out iter followed by a sequential iter does not leave stale data. `lastExit` (singular, v1.0.0 field) is always updated — it reflects the merged worst-exit on fan-out iters.

### Interaction with §15 Worker Team Mode

| This iter's state | §15a decision | §15 (worker's own Team Mode) |
|--|--|--|
| ≥2 parallel-safe tasks, gates pass | Fan-out N workers | SUPPRESSED — each worker sees `GSD_T_WORKER_TASK_IDS` set and skips Task-subagent spawn |
| 1 parallel-safe task OR gates veto | Sequential single worker | ACTIVE — worker may still spawn Task subagents for multi-domain waves per §15 |
| Planner error | Sequential fallback | ACTIVE |

§15 is NOT retired — it remains the worker-internal parallelism lever for single-task iters where the current wave still has multiple independent domains. What §15a eliminates is the *double-parallelism* pathology where the supervisor already fanned out N workers and each worker then tried to spawn 15 more subagents.

### Contract References

- Planner: `bin/gsd-t-parallel.cjs` (M44 D2), contract `wave-join-contract.md` v1.1.0.
- Gates: `bin/gsd-t-depgraph-validate.cjs` (D4), `bin/gsd-t-file-disjointness.cjs` (D5), `bin/gsd-t-economics.cjs` (D6).
- Event schema: `unattended-event-stream-contract.md` (existing `fan_out` / `parallelism_reduced` / `task_split` frames; no new types introduced).

### Verification

- Unit coverage: `test/m44-wire-unattended-to-planner.test.js` asserts (a) N=4 disjoint-fixture plan → 4 concurrent stub spawns joined before iter++; (b) economics-vetoed plan → N=1 fallback, single-worker behavior byte-identical to pre-wire; (c) state.json correctly reflects N workers across iters (fan-out iter writes `lastExits[]`, subsequent sequential iter clears them).
- Integration: a real M44 milestone running unattended must show `fan_out` events in `.gsd-t/events/*.jsonl` and multi-worker aggregates in state.json on iters where the graph supports it.

---

## 16. Cache-Warm Pacing (v1.3.0, superseded-as-primary by §16a in v1.4.0)

Added in v1.3.0 (M39) as the sibling of §15 (D3 Worker Team Mode). Both
sections were added in the same contract version bump but address different
dimensions of the supervisor relay: §15 speeds up a single worker iter by
parallelizing its domains; §16 speeds up the relay ACROSS iters by keeping
the Anthropic prompt cache warm between back-to-back workers. The two
changes are orthogonal and compose.

**Historical v1.3.0 design** — the worker timeout default was 270 s
(270,000 ms), sized to fit inside Anthropic's 5-minute prompt-cache TTL
with ~30 s of handoff headroom. A hung worker would be SIGTERM'd at 270 s
as a side effect of the cache-warm budget, which doubled as a crude
liveness guard.

**v1.4.0 supersession** — the 270 s budget was too aggressive for legitimate
long-running iters (large partition analyses, multi-domain parallel waves)
and too loose for genuine hangs (5 min of a silent worker still wastes 270 s
of wall-clock). M43 introduced a dedicated heartbeat watchdog (§16a) whose
staleness threshold is decoupled from the cache-warm budget. Post-v1.4.0:

1. **Worker timeout default raised to 1 h** (3,600,000 ms). Encoded as
   `DEFAULT_WORKER_TIMEOUT_MS` in `bin/gsd-t-unattended.cjs`. This is now
   an **absolute backstop** — it fires only when the heartbeat watchdog
   has somehow failed to detect a hang and a worker has been running
   without progress for a full hour. It is NOT the cache-warm budget.
2. **Heartbeat watchdog is primary** — see §16a. Default 5-minute
   staleness window (`staleHeartbeatMs = 300_000`) with 60-second polling.
   A stuck worker gets SIGTERM'd with exit code 125 well before the 1 h
   backstop fires.
3. **Cache-pacing invariant still holds** between iterations — the relay
   loop MUST NOT sleep more than 5 seconds between a worker exit and the
   next `spawnWorker` call on the happy path. The Anthropic prompt-cache
   TTL (5 min) is a hard ceiling for cache reuse, so any inter-iter sleep
   approaching that TTL forfeits the caching benefit. Enforced by the
   test at `test/unattended-cache-warm-pacing.test.js`. Error-backoff
   branches may sleep (out of scope for this invariant); the happy-path
   `continue` is synchronous.
4. **Graceful degradation on 125** — when the heartbeat fires, the
   supervisor SIGTERMs the worker, maps the exit to code 125 (see §5),
   sets `state.lastExitReason="stale_heartbeat"`, emits a `retry` event
   with `reason: "stale_heartbeat"`, and continues the relay. Same
   no-hard-failure semantics as the old 270s path — the difference is
   the trigger criterion (event-stream silence vs wall-clock).
5. **Sibling reference** — §15 (Worker Team Mode) is the other v1.3.0
   addition and is unaffected by v1.4.0. §16a (Heartbeat Watchdog) is
   the v1.4.0 supersession of the liveness-detection role §16 used to
   carry.
6. **Cross-platform** — the 1 h backstop and the 5 min heartbeat window
   are both platform-agnostic. M36's cross-platform sleep-prevention
   matrix (macOS `caffeinate` / Linux `systemd-inhibit` / Windows
   unsupported) stands unchanged.

---

## 16a. Heartbeat Watchdog (v1.4.0)

Added in v1.4.0 (M43) to replace the §16 wall-clock guillotine as the
**primary stuck-worker detector**. Motivated by the observation that
workers doing legitimate long-tail work (multi-domain waves, large
partitions, Team-Mode subagent waits) can exceed 270 s without being
stuck, while workers that ARE stuck frequently stop writing to the event
stream within seconds — heartbeat staleness is a much sharper signal
than wall-clock elapsed.

### Design

The supervisor observes the worker's liveness through the **event-stream
append frequency** at `.gsd-t/events/YYYY-MM-DD.jsonl` (schema: see
`unattended-event-stream-contract.md`). Every tool call, model turn, and
phase boundary appends a line. If the file's mtime stops advancing for
more than `staleHeartbeatMs`, the worker is almost certainly hung and
SIGTERM is delivered.

1. **Liveness signal** — file mtime of today's events file. Computed via
   `fs.statSync(eventsPath).mtimeMs`. The reference time for staleness is
   `max(mtimeMs, workerStartedAt)` so a stale events file inherited from
   a prior worker iter cannot immediately kill a fresh worker.
2. **Grace window** — if the events file does not yet exist (fresh
   project, or worker hasn't written its first tool-call frame), the
   worker is considered healthy until `workerStartedAt + staleHeartbeatMs`
   has elapsed. After that, "absent events file" counts as stale.
3. **Poll cadence** — `setInterval` inside `platformSpawnWorker`'s async
   path, firing every `heartbeatPollMs` (default 60,000 = 1 min) for the
   duration of the worker process lifetime. The interval is cleared on
   worker exit or timeout.
4. **Kill path** — when `checkHeartbeat()` returns `{stale: true}`, the
   supervisor calls `child.kill("SIGTERM")`, the spawn promise resolves
   with `{staleHeartbeat: true, heartbeatReason}`, and the main loop
   maps the exit to code 125 with `lastExitReason="stale_heartbeat"`.
   Heartbeat beats wall-clock on ties — if both fire in the same poll
   tick, the heartbeat signal wins because it is the more specific
   diagnosis.
5. **Run-log diagnostic** — on code-125, `runMainLoop` prepends a
   `[stale_heartbeat] iter=N threshold=Nms elapsed=Nms reason="..."` line
   to the iter's run.log block (parallel to the existing `[worker_timeout]`
   marker). Operators can `grep '[stale_heartbeat]'` for a timeline of
   heartbeat firings without parsing state.json.

### Configuration

| Knob | Default | CLI flag | config.json key |
|------|---------|----------|-----------------|
| Staleness threshold | 300,000 ms (5 min) | `--stale-heartbeat-ms=N` | `staleHeartbeatMs` |
| Poll cadence | 60,000 ms (1 min) | not exposed (internal) | not exposed |
| Backstop timeout | 3,600,000 ms (1 h) | `--worker-timeout=N` | `workerTimeoutMs` |

CLI > config.json > default, standard merge precedence.

### State.json fields

When a heartbeat fires, the supervisor writes:

```json
{
  "lastExit": 125,
  "lastExitReason": "stale_heartbeat",
  "lastHeartbeatReason": "events mtime stale 312s > 300s threshold"
}
```

`lastExitReason` is also written for other exit paths (`"clean"`,
`"worker_timeout"`, `"exit_N"`) so watch-tick renderers can surface the
cause without re-deriving it from the exit code.

### Testability

`bin/gsd-t-unattended-heartbeat.cjs` exports `checkHeartbeat({projectDir,
workerStartedAt, staleHeartbeatMs, now, fsShim})` as a pure function so
unit tests can inject a fake clock and fake filesystem. The spawn wrapper
accepts `onHeartbeatCheck` as a callback hook so the main loop's
heartbeat implementation can be substituted in tests.

See `test/m43-heartbeat-watchdog.test.js` for the full coverage matrix.

---

## 17. Version History

| Version | Date | Change | Owner |
|---------|------|--------|-------|
| 1.0.0 | 2026-04-15 | Initial draft during M36 partition | m36-supervisor-core + m36-watch-loop |
| 1.1.0 | 2026-04-16 | Added event-stream emission requirement at phase boundaries; references unattended-event-stream-contract.md v1.0.0 | m38-unattended-event-stream |
| 1.2.0 | 2026-04-17 | Added §14b Worker Env Propagation (GSD_T_COMMAND/PHASE/TRACE_ID/MODEL/PROJECT_DIR) to close the v3.12.13 null-telemetry regression | v3.12.14 |
| 1.3.0 | 2026-04-17 | Added §15 Worker Team Mode (intra-wave parallelism, cap 15, sequential inter-wave) — worker now mirrors `/gsd-t-execute` Team Mode pattern to close the bee-poc 3–5× speed gap | m39-d3-parallel-exec |
| 1.3.0 | 2026-04-17 | Added §16 Cache-Warm Pacing — worker timeout default lowered from 1 h to 270 s to preserve Anthropic's 5-min prompt-cache TTL across back-to-back worker handoffs; graceful degradation on timeout | m39-d4-cache-warm-pacing |
| 1.3.1 | 2026-04-17 | §16 bullet 3 gains a v3.13.11 diagnostic tag: `runMainLoop` writes an explicit `[worker_timeout] iter=N budget=Nms elapsed=Nms` line to `run.log` when the watchdog fires, so timeout-induced cache misses surface in log tails without requiring state.json inspection | v3.13.11 (bee-poc hang triple-fix) |
| 1.4.0 | 2026-04-21 | **M43 Heartbeat Watchdog**. Added §16a — events.jsonl mtime polled every 60s during each worker iter, SIGTERM on staleness > 5 min (default). Added exit code 125 (`stale-heartbeat`) and `state.lastExitReason` field. Raised `workerTimeoutMs` default from 270s to 1h (absolute backstop only). §16 (cache-warm pacing) retained as the inter-iter sleep invariant but no longer the worker-timeout rationale. New CLI flag `--stale-heartbeat-ms`; new config.json key `staleHeartbeatMs`. | M43 quick |
| 1.4.1 | 2026-04-21 | PID file upgraded to JSON fingerprint `{pid, projectDir, startedAt}` via `bin/supervisor-pid-fingerprint.cjs`; resume Step 0 liveness check verifies project + ps command line to distinguish "our supervisor" from macOS PID recycling. Legacy bare-integer files still readable (five-outcome resolution: no_pid_file / dead / alive_verified / alive_legacy_pid / alive_but_stale). | multi-project isolation quick |
| 1.5.0 | 2026-04-23 | **M44 D9 planner-driven multi-worker iter fan-out.** Added §15a. Before each iter, supervisor calls `runParallel({mode:'unattended', dryRun:true})` from `bin/gsd-t-parallel.cjs`. If `plan.workerCount ≥ 2` AND all three upstream gates pass (D4 deps, D5 disjointness, D6 per-task CW ≤ 60%), supervisor spawns N concurrent `claude -p` workers via `Promise.all`. Each worker carries its disjoint task-id subset via env var `GSD_T_WORKER_TASK_IDS` and skips the intra-worker Team Mode block (double fan-out prevention). Planner veto OR N=1 → bit-identical fallback to v1.4.x single-worker path. state.json adds optional `lastExits: [{idx, code, taskIds, elapsedMs, spawnId}]` + `workerPids: [...]` + `lastFanOutCount` fields on multi-worker iters; absent on single-worker iters so v1.4.x readers remain compatible. Iter still counts ONCE per fan-out regardless of N. §15 Team Mode retained but now explicitly scoped to single-task workers that may internally parallelize domains (never both simultaneously). | M44 D9 + continue-here-2026-04-23T223000 Step 2 |

---

## 18. Verification Status

To be populated by `m36-docs-and-tests` at verify time. At milestone completion this section must show:

- All 6 M36 domains ship code that conforms to this contract
- Integration test exercises §7, §8, §9, §10, §12 end-to-end
- CLI surface (§6) matches `bin/gsd-t.js` `doUnattended()` implementation
- Exit codes (§5) match `bin/gsd-t.js` `mapHeadlessExitCode()` implementation
- Status enum (§4) matches `state.json` writes in `bin/gsd-t-unattended.cjs`

Status: **PENDING — awaiting code domain implementation**
