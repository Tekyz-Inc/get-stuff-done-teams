# M61 Retire → Native Replacement Map (SC6)

For every capability retired in M61, names the native Claude Code (or external) replacement. Measure-don't-claim: every entry is verifiable.

## D1 — Context-Meter / Runway

| Retired surface | Native replacement | Notes |
|----------------|--------------------|---|
| `bin/token-budget.cjs` (in-session ctxPct meter) | `/context` slash command | Claude Code shows context-window usage natively. |
| `bin/runway-estimator.cjs` (dialog growth predictor) | Native compaction + 1M context window | Compaction is automatic when window fills; Opus 4.7/4.8 ship 1M windows, drastically reducing the runway-prediction need. |
| `bin/model-windows.cjs` (model→window table) | `--model` flag + native model registry | Claude Code knows the window per model. |
| `bin/context-meter-config.cjs` | None — config was for the now-deleted meter | The meter itself was the consumer; nothing else read this. |
| `bin/context-budget-audit.cjs` | None — audit was a debug tool for the meter | Same. |
| `scripts/gsd-t-context-meter.js` (PostToolUse hook) | None | The hook updated a state file the CLI no longer reads. |
| `.gsd-t/.context-meter-state.json` | None | State the hook wrote; now gone. |

## D2 — Unattended Relay / Supervisor

| Retired surface | Native replacement | Notes |
|----------------|--------------------|---|
| `bin/gsd-t-unattended.cjs` + safety + platform + heartbeat (the supervisor loop) | Native background Workflows (`Workflow` tool) + `/loop` skill | Workflows run in the background, notify on completion, and survive within a session. `/loop` schedules recurring tasks. |
| `bin/headless-auto-spawn.cjs` (detached `claude -p` spawner) | Native Workflow `agent()` calls | The native Workflow tool spawns concurrent agents inherently. |
| `bin/handoff-lock.cjs` (cross-session handoff coordination) | None needed | Workflows are session-scoped; no cross-session handoff. |
| `bin/supervisor-pid-fingerprint.cjs` (PID-file verification) | None needed | No long-running supervisor to fingerprint. |
| `bin/check-headless-sessions.js` (read-back banner) | Native task notifications | `<task-notification>` tags appear automatically when background work completes. |
| `bin/gsd-t-worker-dispatch.cjs` (worker sub-fanout) | Workflow `parallel()` / `pipeline()` | Native primitives. |
| `bin/gsd-t-orchestrator-recover.cjs` (in-flight reconcile) | Workflow `resumeFromRunId` | Native resume reads the journal and resumes the longest unchanged prefix. |
| `commands/gsd-t-unattended.md` + `-watch` + `-stop` | None | These were the user-facing surface of the relay; no longer needed. |

## D3 — Token Telemetry

| Retired surface | Native replacement | Notes |
|----------------|--------------------|---|
| `bin/gsd-t-token-capture.cjs` (`captureSpawn` wrapper) | Native `/usage` command + Workflow `budget` global | `/usage` shows per-session token costs; `budget.total` / `budget.spent()` / `budget.remaining()` available inside Workflow scripts. |
| `bin/gsd-t-token-dashboard.cjs` (status block aggregator) | `/usage` | Same. |
| `bin/gsd-t-token-backfill.cjs` (historical log reconstruction) | None — historical analysis was never load-bearing (M38 admission) | Accepted loss. |
| `bin/gsd-t-tool-attribution.cjs` + `gsd-t-tool-cost.cjs` (per-tool cost) | OpenTelemetry exports (Enterprise) or `/usage` aggregate | Per-tool granularity is Enterprise-only natively; accepted loss for non-Enterprise users. |
| `bin/gsd-t-in-session-usage.cjs` + hook | None | Hook wrote to a log the dashboard read; both gone. |
| `bin/gsd-t-economics.cjs` (per-task footprint estimator) | Workflow `budget` for the running script + `/usage` historical | Stubbed at retire time to zero-footprint; planner runs with default assumptions. |
| `bin/metrics-rollup.js` | None | Rollup aggregated task-metrics for milestone reports; that aggregation isn't user-facing. |
| `bin/gsd-t-capture-lint.cjs` (pre-commit OBSERVABILITY block enforcement) | None — the OBSERVABILITY convention itself is retired | The lint was enforcement of a convention M61 removes. |
| `.gsd-t/token-log.md` (rolling cost log) | Manual `/usage` checks | Live log is gone; historical archive moved under `.gsd-t/milestones/m61-*/`. |

**KEPT (not retired despite being in the "telemetry" group):** `bin/metrics-collector.js` (167 LOC) — read by D7 KEEP `bin/rule-engine.js` for pre-mortem rule evaluation. Small, isolated, useful.

## D4 — Viewer / Dashboard / SSE

| Retired surface | Native replacement | Notes |
|----------------|--------------------|---|
| `scripts/gsd-t-dashboard-server.js` (HTTP SSE server) | `/workflows` slash command + Agent View | Native UI shows workflow progress, agent status, and tool calls. |
| `bin/live-activity-report.cjs` (dashboard widget) | `/workflows` live progress | Same surface. |
| `bin/gsd-t-transcript-tee.cjs` (per-spawn NDJSON writer) | Native transcript persistence | Claude Code persists transcripts under `~/.claude/projects/<project>/`. |
| `bin/gsd-t-stream-feed-client.cjs` (orchestrator→dashboard SSE pipe) | None needed | Workflows have native observability; no separate pipe. |
| `bin/parallelism-report.cjs` (per-CW attribution widget) | Workflow `agent_count` + `budget.spent()` | Live counts during a Workflow run. |
| `bin/log-tail.cjs`, `bin/watch-progress.js`, `bin/event-stream.cjs` | None needed | Were all components of the SSE stack. |
| `scripts/hooks/gsd-t-conversation-capture.js` (M45 in-session capture) | Native session transcript | Hook duplicated what the runtime already records. |
| `commands/gsd-t-visualize.md` | `/workflows` | One-to-one. |

## D5 — Proof Scratch (earlier session)

All M44/M46/M55 proof scripts + benchmark orchestrator. Zero live references at retire; their evidence is the milestone archives.

| Retired surface | Native replacement | Notes |
|----------------|--------------------|---|
| `bin/m44-proof-measure.cjs` + `m46-iter-proof` + `m46-worker-proof` + `m55-substrate-proof` | None — one-time proof artifacts | Evidence preserved in `.gsd-t/milestones/m44-*`, `m46-*`, `m55-*` archives. |
| `bin/gsd-t-benchmark-orchestrator.js` | None | Was an operator-run benchmark driver. |
| `bin/gsd-t-parallel-probe.cjs` + `gsd-t-ratelimit-probe.cjs` + `-worker` | None | One-time empirical measurements. |

## D6 — Orchestration Core (port-then-delete)

| Retired surface | Native replacement | Notes |
|----------------|--------------------|---|
| `bin/gsd-t-orchestrator.js` + `-worker` + `-queue` + `-config` | `templates/workflows/gsd-t-execute.workflow.js` + sibling scripts | The orchestrator is replaced by native Workflow scripts. Per-task orchestration becomes the Workflow's `parallel()` over domain workers. **NOT YET DELETED** — these files are stubbed to load cleanly post-D2/D4 but await final retirement after Workflow scripts are validated by a real M58 reproduction. |
| `bin/gsd-t-parallel.cjs` (M44 task-parallel dispatcher) | Workflow `parallel()` over tasks | Same. **NOT YET DELETED** — see above. |
| `bin/parallel-cli.cjs` + `parallel-cli-tee.cjs` (CLI surface) | Workflow tool invocation | Direct invocation replaces the CLI. **NOT YET DELETED.** |
| `bin/spawn-plan-writer.cjs` | None needed | Spawn plan was a pre-execution artifact for the orchestrator. |

**KEPT (the brains):**
- `bin/gsd-t-file-disjointness.cjs` (file-disjointness prover) — invoked from inside Workflow `parallel()` stages as defense in depth.
- `bin/gsd-t-task-graph.cjs` (task-graph reader) — same.
- `bin/gsd-t-context-brief.cjs` (brief generator) — MORE valuable post-M61.
- `bin/cli-preflight.cjs` (preflight envelope) — invoked at the start of every Workflow.

## D7 — Validation (REFRAMED, not retired)

The Red Team / QA / Design-Verify protocols stay unchanged. Only the invocation context changes (Workflow `agent()` stage vs. Task subagent). Locked by `.gsd-t/contracts/orthogonal-validation-contract.md` v1.0.0 STABLE.

| Surface | Native replacement | Notes |
|---------|--------------------|---|
| Red Team Task subagent | Workflow `agent()` stage with schema-validated output | Methodology body unchanged at `templates/prompts/red-team-subagent.md`; preamble updated. |
| QA Task subagent | Same pattern | `templates/prompts/qa-subagent.md` preamble updated. |
| Design-Verify Task subagent | Same pattern | `templates/prompts/design-verify-subagent.md` preamble updated. |
| `/code-review ultra` cooperative pass | Native `/code-review ultra` invocation inside the verify Workflow | New addition per CONTEXT.md Q2. |

## Accepted Losses (documented, not silent)

1. **Historical cross-session token analysis** — `.gsd-t/token-log.md` was a rolling cost log. Native `/usage` is per-session. Trade: cheaper machinery; users who need historical analysis run OpenTelemetry exports (Enterprise).
2. **Per-tool / per-domain / per-phase cost attribution** — same; available only via OTEL natively.
3. **Cross-session handoff via PID-file fingerprint** — Workflows are session-scoped; no equivalent. Long-running jobs that must outlive a session need `/loop` (recurring task) instead.
4. **The `gsd-t benchmark-orchestrator` CLI** — operator-run benchmark driver. Replaced by manual measurement via `/usage` if needed.

## Verification

- D1-D5 zero-reference grep gates were run before each retire (archived under `.gsd-t/scan/m61-d{1..5}-zero-ref-verify.txt`).
- Live deps that couldn't be cleanly broken were stubbed with documented no-ops (rule-engine.js's readTaskMetrics, parallel.cjs's loadTokenBudget try/catch, calibration-hook.js's SAFE_DEFAULT_WINDOW inline, orchestrator.js's createStreamFeedClient/recoverRunState/writeRecoveredState/archiveState, orchestrator-worker.cjs's transcriptTee, parallel-cli.cjs's captureSpawn, parallel.cjs's estimateTaskFootprint).
- 41 test failures remain post-Wave-3; all are command-file format tests for retired conventions (M56-D3 markers, Stack Rules, preflight wire-in, OBSERVABILITY LOGGING, shim_one_liner) + command-count tests for retired subcommands. Zero new regressions.
- bin/ baseline: 37,785 LOC (v3.29.11). bin/ post-D4: 19,855 LOC. Reduction: -17,930 LOC (47% of bin/ retired; 70% of way to SC1 target ≤12,000).

---

## M65 — Orchestration-Shell Retirement (M61 D6 port-then-delete completion)

Completes the M61 D6 deferral: deletes the M40/M44 orchestration shell the native Workflow scripts replaced. Scope-corrected after live ref-scan (the raw brief's `parallel-cli*`/`gsd-t-parallel` were proven KEEP-list substrate and retained).

| Retired capability | File(s) deleted | Native replacement |
|--------------------|-----------------|--------------------|
| M40 external task orchestrator (`gsd-t orchestrate`) | `bin/gsd-t-orchestrator.js` + `-worker.cjs` + `-queue.cjs` + `-config.cjs` | `templates/workflows/gsd-t-execute.workflow.js` — native `parallel()` over domain workers with deterministic gates |
| Spawn-plan progress files + transcript panel | `bin/spawn-plan-{writer,status-updater,derive}.cjs` + `scripts/spawn-plan-fmt-tokens.cjs` + `scripts/gsd-t-post-commit-spawn-plan.sh` + `templates/hooks/post-commit-spawn-plan.sh` | Native `/workflows` live progress tree + Agent View |
| Headless exit-code mapping (separate-file decoupling for the retired supervisor) | `bin/headless-exit-codes.cjs` | Inlined `mapHeadlessExitCode` into `bin/gsd-t.js` (5-code contract 0/1/2/3/4/5 preserved verbatim incl. M45 boundary-anchored regexes) |
| Mode-aware gating math (orchestrator-config) | `computeInSessionHeadroom` / `computeUnattendedGate` / `DEFAULT_SUMMARY_SIZE_PCT` | Inlined into the KEEP file `bin/gsd-t-parallel.cjs` (the `_lib.proveFileDisjointness` planner) so it no longer depends on the deleted config |

### KEEP (proven substrate, NOT retired)
- `bin/parallel-cli.cjs` + `parallel-cli-tee.cjs` — verify-gate Track-2 engine (`runParallel`), still required at `gsd-t-verify-gate.cjs:31`.
- `bin/gsd-t-parallel.cjs` — file-disjointness/ready-task planner, still shelled by `templates/workflows/_lib.js:107`.

### OUT (flagged for separate decision, NOT M65)
- `bin/orchestrator.js` (1,387 LOC) + `bin/design-orchestrator.js` — the design-build pipeline orchestrator; `gsd-t design-build` is documented but has no live dispatch case (unwired). Wire-back-or-retire is a separate design-pipeline decision (backlogged via spawn-task chip).

### Stale-list cleanup (M61-carryover, fixed opportunistically in the same gsd-t.js edits)
- `PROJECT_BIN_TOOLS` had 10 entries pointing at M61-deleted files (`log-tail`, `context-budget-audit`, `context-meter-config`, `token-budget`, `gsd-t-token-capture`, 3× `gsd-t-unattended*`, `handoff-lock`, `headless-auto-spawn`) — these would have broken `update-all`. Removed alongside `headless-exit-codes.cjs`.
- `commands/gsd-t-help.md` spawn-plan + parallelism panel bullets (referenced the deleted hook + retired dashboard server) — removed.
- `commands/gsd-t-resume.md` Step 0.3 "Orchestrator Run Recovery (M40 D6)" — removed (drove the retired orchestrator + already-deleted `gsd-t-orchestrator-recover.cjs` + `test/m40-recovery.test.js`).

### Verification (M65)
- `mapHeadlessExitCode` inline contract: `0/2/4/1/3/5` golden match + M45 false-positive guard (`0 tests failed` → 0). ✅
- Gating math inline: `computeInSessionHeadroom({ctxPct:50,workerCount:8,summarySize:4})={ok:true,reducedCount:8}`. ✅
- `gsd-t doctor`: passes, no dangling references to deleted modules (1 pre-existing CGC-not-installed info). ✅
- `gsd-t parallel --dry-run` (the `_lib` disjointness canary): runs end-to-end, exit 0. ✅
- Suite: 1361 pass / 23 fail / 3 skip / 1387 total. The 6 deleted test files dropped from the denominator; zero M65-subject failures; all 23 fails are pre-existing M61 D1–D8 carryover (command-format / command-count / `gsd-t-capture-lint.cjs` MODULE_NOT_FOUND / playwright-health flake).
- bin/ LOC: 22,051 → 20,271 (−1,780). M61 umbrella SC1 (≤12,000) tracked, not gated on M65.
