# M35 — No Silent Degradation + Surgical Model Escalation + Token Telemetry

**Status**: DEFINED — ready for `/user:gsd-t-milestone` to formalize, then `/user:gsd-t-partition`.
**Version target**: 2.75.10 → 2.76.10 (minor bump — new features + breaking contract change)
**Owner**: David Hirschfeld
**Defined**: 2026-04-14
**Predecessor**: M34 Context Meter (v2.75.10)

## One-line summary

Rip out silent quality-degradation under context pressure, replace it with surgical per-task model selection, a pre-flight runway estimator that auto-spawns headless to continue work instead of prompting `/clear`, and granular per-spawn token telemetry that feeds an optimization backlog the user selectively promotes.

## Why this milestone exists

M31 introduced "Token-Aware Orchestration" (PRD §3.7, commit `22792fd`, 2026-04-01) under the framing of "graduated degradation thresholds" as a safety net against token exhaustion. The PRD buried the actual tradeoff: the `downgrade` and `conserve` bands silently swap models down (opus→sonnet→haiku) and skip Red Team / doc-ripple / Design Verify under context pressure. The user never agreed to this and only discovered it during M34 complete-milestone. The bands directly violate GSD-T's core principle: **excellent results and completely, deeply tested software.** A milestone finished with degraded models and skipped adversarial QA is not the milestone the user asked for — it is a worse milestone masquerading as done.

M34 preserved these bands byte-for-byte via the token-budget-contract v2.0.0 public-API promise. M34 made them *more* dangerous, not less: with real context-window measurement replacing the task-counter proxy, the degradation bands will fire more reliably and actually produce model downgrades and Red Team skips instead of sitting inert. Shipping v2.75.10 with the bands intact means shipping a regression against GSD-T's core principles.

M35 removes the bands entirely and replaces them with a tighter, principled model: pre-flight runway estimation refuses to start work that can't finish cleanly, pause-and-resume preserves all work across context boundaries via auto-spawned headless, model selection is surgical (sonnet for routine, opus escalated via `/advisor` at specific decision points), and every token consumed is tracked granularly so future optimization is data-driven rather than guesswork.

## Core principles

1. **Quality is non-negotiable.** Under context pressure we pause and resume. We never downgrade models, skip Red Team, skip doc-ripple, or skip Design Verify.
2. **The system is smarter with a clean context.** A fresh resume beats a compressed-context struggle.
3. **Model selection is explicit per phase, not runtime-overridden.** Sonnet is the default for routine work; opus is escalated surgically via `/advisor` at decision points that need heavy reasoning (architecture calls, Red Team adversarial QA, debug root-cause, verify judgment).
4. **The user never types `/clear`.** When runway runs out, GSD-T auto-spawns a headless process to continue. The interactive session stays where it is.
5. **Data before optimization.** Token usage is captured granularly per spawn, aggregatable by any dimension, and surfaces as an opt-in optimization backlog — never auto-applied, never blocking.
6. **Clean break, no compat shims.** Option X was chosen: `token-budget-contract` moves to v3.0.0, callers get updated in the same milestone, no deprecation layer.

## Part A — Silent Degradation Rip-Out

**Goal**: Remove the `downgrade` and `conserve` threshold bands from `bin/token-budget.js` entirely. The only bands that remain are `normal`, `warn` (informational), and `stop` (clean halt).

**Scope**:
- `bin/token-budget.js`:
  - `getDegradationActions()` — delete the `downgrade` and `conserve` branches. Return signature becomes `{band: 'normal'|'warn'|'stop', pct: number, message: string}`. No `modelOverride`, no `skipPhases`, no `checkpoint: true` side-channel.
  - Delete `applyModelOverride()` helper if it exists.
  - Delete any `skipPhases` list constants.
  - Threshold tuning: `warn` at 70%, `stop` at 85% (tightened from the old `warn`/`downgrade`/`conserve`/`stop` = 60/70/85/95 ladder so we never reach the runtime's native compact at ~95%).
- `.gsd-t/contracts/token-budget-contract.md` → v3.0.0:
  - Document the three-band model (`normal`, `warn`, `stop`) and their semantics.
  - Explicit "Non-Goals" section: this contract will never return model overrides, phase-skip lists, or anything that weakens quality gates.
  - Migration notes from v2.0.0 (what callers must change).
- Command files — replace the "Token Budget Check" block in every consumer with the new three-band handler:
  - `commands/gsd-t-execute.md`
  - `commands/gsd-t-wave.md`
  - `commands/gsd-t-quick.md`
  - `commands/gsd-t-integrate.md`
  - `commands/gsd-t-debug.md`
  - `commands/gsd-t-doc-ripple.md`
  - Any other file that reads `getDegradationActions()` or references `downgrade`/`conserve`/`skipPhases`
- `docs/prd-harness-evolution.md` §3.7 rewritten:
  - Title: "Pre-Flight Runway + Pause-Resume (replaces Token-Aware Orchestration)"
  - New narrative: the system pre-checks before starting, halts cleanly before running out, and auto-spawns headless to continue. Never downgrades, never skips.
  - Explicit call-out that the M31 framing was wrong.
- `templates/CLAUDE-global.md` and `templates/CLAUDE-project.md` — "Token-Aware Orchestration" section renamed and rewritten. Remove the `downgrade`/`conserve` band references.

**Acceptance criteria**:
- `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" bin/ commands/ docs/ templates/` returns zero hits outside of historical prose (M31 reference, CHANGELOG entry for M35 itself).
- `bin/token-budget.js` `getDegradationActions()` returns one of three band values, never a model override or skip list.
- `test/token-budget.test.js` updated: tests for `downgrade`/`conserve` branches deleted, new tests for the tightened `warn`/`stop` thresholds and the simpler return shape.
- Full test suite green.

## Part B — Surgical Model Escalation via `/advisor`

**Goal**: Default routine phases to `sonnet`. Escalate to `opus` surgically at decision points that need heavy reasoning, via the Claude Code `/advisor` tool (native slash command: "Configure the Advisor Tool to consult a stronger model for guidance at key moments during a task").

**Scope**:
- `bin/model-selector.js` — new module:
  - `selectModel({phase, task_type, domain_type, complexity_signals})` → returns `{model: 'haiku'|'sonnet'|'opus', reason: string, escalation_hook: string|null}`.
  - Declarative rules table in the file, easily extensible. Rough initial map:
    - `haiku` — test runners, branch guards, file existence checks, JSON validation, the token-count bracket calls themselves
    - `sonnet` — routine code execution (execute step 2), test-sync assertion writing, doc-ripple, quick tasks, integrate wiring, debug fix-apply iterations
    - `opus` — partition, discuss, Red Team, verify judgment (the "is this actually done?" call, not the test runner), debug root-cause analysis, complex architecture decisions, contract design
  - Escalation hooks: a `sonnet`-default phase can declare specific in-phase checkpoints that escalate to `opus` via `/advisor`. Example: `execute` runs on sonnet, but the "is this fix correct?" verification step escalates.
- `bin/advisor-integration.js` — new module:
  - Wrapper around invoking `/advisor` programmatically from a subagent prompt (if the native tool supports it), OR a convention block that the command file injects into the subagent's system prompt telling it "at decision point X, invoke `/advisor` for guidance before proceeding."
  - **Open question** (resolve in Part B Task 1 before wiring): does the native `/advisor` tool expose a programmable API, or is it user-initiated only? If the latter, Part B falls back to a convention: command files instruct subagents to `/advisor` at declared escalation points, and the orchestrator logs whether they did. Graceful degradation, no hard dependency on Claude Code runtime API surface we don't control.
- Command files — new `## Model Assignment` block at the top of every subagent-spawning command. Declarative, not buried in prose:
  ```
  ## Model Assignment

  - Default: sonnet
  - Escalation points:
    - Step 5 (verify-fix): escalate to opus via /advisor if test still fails after fix-apply
    - Step 6 (root-cause): escalate to opus via /advisor when hypothesis count exceeds 2
  - Mechanical subroutines: haiku (test runner Step 4, branch guard Step 0)
  ```
- `.gsd-t/contracts/model-selection-contract.md` → v1.0.0 — new:
  - Declares the three tiers and their selection criteria
  - Declares the escalation hook pattern
  - Declares the fallback behavior when `/advisor` is unavailable (always proceed at the assigned model, log the missed escalation)
- `templates/CLAUDE-global.md` — new "Model Assignment Block" convention documented. Global `ANTHROPIC_MODEL` env var stays on opus so user-initiated sessions default to the strongest model, but GSD-T subagent spawns override per-phase via `model:` directives. Document this dual-layer clearly.
- `templates/CLAUDE-project.md` — same.

**Acceptance criteria**:
- `bin/model-selector.js` exists with at least 3 tiers, 8 phase mappings, and unit tests covering each mapping.
- Every command file that spawns a subagent has a `## Model Assignment` block at the top.
- `.gsd-t/contracts/model-selection-contract.md` exists at v1.0.0 and is referenced from `commands/gsd-t-execute.md`.
- An execute run on a sample task logs the declared model tier to `.gsd-t/token-log.md` and (after Part E) to `.gsd-t/token-metrics.jsonl`.

## Part C — Pre-Flight Runway Estimator

**Goal**: Before any long-running phase (wave, execute multi-task, debug-loop, integrate), estimate how much context will be consumed and refuse to start if the projected end would cross the `stop` threshold. Auto-spawn headless instead of prompting the user.

**Scope**:
- `bin/runway-estimator.js` — new module:
  - `estimateRunway({command, domain_type, remaining_tasks, projectDir})` → returns `{can_start: bool, current_pct: number, projected_end_pct: number, confidence: 'low'|'medium'|'high', recommendation: 'proceed'|'headless'|'clear-and-resume'}`.
  - Data sources:
    - Current CTX_PCT from `.gsd-t/.context-meter-state.json` (M34's real measurement)
    - Historical per-task cost from `.gsd-t/token-metrics.jsonl` (Part E output — Part C's estimator gracefully degrades to a conservative constant when the log is empty or has <10 records)
    - Query by `{command, domain_type}` for sharpest match; fall back to `{command}` aggregate if domain-specific has insufficient data
  - Confidence grade based on sample size: `high` ≥ 50 matching records, `medium` ≥ 10, `low` < 10 (fallback to constant 4%/task).
  - Conservative skew: when in doubt, over-estimate consumption (better to refuse a run that would have fit than to start a run that can't finish).
- Wire-up sites (in command files):
  - `commands/gsd-t-execute.md` Step 0 — check runway before Step 1 starts
  - `commands/gsd-t-wave.md` Step 0 — check runway for the full wave
  - `commands/gsd-t-debug.md` Step 0 — check runway for the whole debug loop AND between each fix-iteration (mid-loop check, ties to Part F's inter-iteration halt)
  - `commands/gsd-t-integrate.md` Step 0 — check runway for integration pass
  - `commands/gsd-t-quick.md` Step 0 — lightweight check (single task, short estimate)
- Output format when refusing:
  ```
  ⛔ Insufficient runway — projected to consume {X}% context across {N} tasks.
     Current: {pct}% used / {free}% free
     Projected end: {end_pct}% (stop threshold: 85%)
     Confidence: {confidence} (based on {N} historical records for {command}/{domain_type})

  Auto-spawning headless to continue in a fresh context.
  Session ID: {headless_id}
  Status: tail .gsd-t/headless-{timestamp}.log

  Your interactive session remains idle — you can use it for other work.
  You will be notified when the headless run completes.
  ```
- `.gsd-t/contracts/runway-estimator-contract.md` → v1.0.0 — new:
  - API signature, return shape, confidence grading rules, conservative skew policy
  - Explicit "never prompts the user" guarantee
  - Handoff protocol to headless auto-spawn (Part F)

**Acceptance criteria**:
- `bin/runway-estimator.js` exists with the documented API.
- Unit tests cover: empty history (constant fallback), insufficient history (`low` confidence), sufficient history (`high` confidence), over-estimate skew, refusal path, proceed path.
- At least 5 command files call the estimator at Step 0.
- A smoke test: manually set CTX_PCT to 80% via fixture, invoke a wave, confirm it refuses and triggers headless spawn (Part F).

## Part D — Eliminate Compact Messages

**Goal**: Structurally prevent the Claude Code runtime from reaching its native compaction threshold (~95%), which is the event that surfaces compact messages to the user.

**Scope**:
- This is largely an *emergent* property of Parts A + C, not a separate code component. If the `stop` band is at 85% and the runway estimator refuses starts that would cross 85%, the runtime's 95% compact trigger is never reached.
- Add instrumentation to verify this works in practice:
  - New field in `.gsd-t/token-metrics.jsonl`: `halt_type` — `'clean'` (GSD-T halted at `stop`), `'runway-refusal'` (runway estimator refused to start), `'headless-handoff'` (Part F auto-spawned), `'native-compact'` (runtime compacted — this should never appear in healthy operation).
  - `gsd-t metrics --halts` — CLI surface that counts each halt type across the last N milestones. Any `native-compact` entry is a defect signal.
- Update `project_compaction_regression.md` memory to reflect the fix and what to watch for (native compact appearing in `halt_type` means the thresholds need re-tuning or the estimator is under-predicting).
- Write a smoke test that simulates a pathological runaway scenario (context climbing rapidly past the estimator's prediction mid-iteration) and confirms the mid-loop check in Part F catches it before native compaction.

**Acceptance criteria**:
- `halt_type` field present in `.gsd-t/token-metrics.jsonl` schema and written by all halt paths.
- `gsd-t metrics --halts` implemented and returns a breakdown.
- Smoke test for pathological-runaway scenario passes.
- Across one full milestone of execution (M35 itself, used as dogfood), `halt_type: native-compact` count is 0.

## Part E — Granular Token Telemetry + Optimization Backlog

**Goal**: Capture token usage at per-subagent-spawn granularity, aggregate on demand by any dimension, and surface optimization opportunities as a user-reviewable backlog that is never auto-applied.

**Scope**:

### E.1 — Per-spawn capture
- Every Task subagent spawn in every command file wraps its invocation in a token bracket:
  - Before spawn: read `.gsd-t/.context-meter-state.json` `input_tokens` → `t0_tokens`
  - Spawn subagent
  - After return: read `.gsd-t/.context-meter-state.json` `input_tokens` → `t1_tokens`
  - Compute `tokens_consumed = t1_tokens - t0_tokens`
  - Append a record to `.gsd-t/token-metrics.jsonl`
- New helper: `bin/token-telemetry.js` exposes `recordSpawn({...})` to standardize the append. Command files call it via a one-line bash shim similar to the CTX_PCT shim.

### E.2 — Schema for `.gsd-t/token-metrics.jsonl`
One JSON record per line, append-only:
```json
{
  "timestamp": "2026-04-14T22:45:12Z",
  "milestone": "M35",
  "command": "gsd-t-execute",
  "phase": "execute",
  "step": "Step 2",
  "domain": "model-selector",
  "domain_type": "bin-script",
  "task": "task-3",
  "model": "sonnet",
  "duration_s": 47,
  "input_tokens_before": 43210,
  "input_tokens_after": 51890,
  "tokens_consumed": 8680,
  "context_window_pct_before": 21.6,
  "context_window_pct_after": 25.9,
  "outcome": "success",
  "halt_type": null,
  "escalated_via_advisor": false
}
```

Fields:
- `halt_type`: null for normal spawns, one of Part D's values when the spawn ended in a halt
- `escalated_via_advisor`: true if the subagent invoked `/advisor` during execution (Part B integration)
- `domain_type`: broad category (frontend, backend, bin-script, docs, tests) for sharper runway estimator queries
- `outcome`: one of `success`, `failure`, `blocked`, `escalated` (cross-references `.gsd-t/task-metrics.jsonl` for richer outcome data via `{milestone, task}` join)

### E.3 — Query surface
- **`gsd-t metrics --tokens`** — reads `token-metrics.jsonl`, slices and aggregates.
- Flags: `--by model`, `--by command`, `--by phase`, `--by milestone`, `--by domain`, `--by domain_type`, combinable.
- Outputs: count, total tokens, mean, median, p95 per group.
- **`gsd-t metrics --tokens --context-window`** — buckets by `context_window_pct_before` (0-10%, 10-20%, ...) to show tokens consumed at different levels of fullness.
- **`gsd-t metrics --halts`** — Part D surface.
- Raw JSONL is always accessible — any tool can slice without going through the CLI.

### E.4 — Review loop → optimization backlog
- `bin/token-optimizer.js` — new module, runs at end of `gsd-t-complete-milestone`:
  - Reads last N milestones (default N=3) of `token-metrics.jsonl` and joins with `task-metrics.jsonl` for outcome signals.
  - Detects signals:
    - Phases on opus with 100% success and low fix-cycle count → candidate for sonnet demotion
    - Phases on sonnet with high fix-cycle count → candidate for opus escalation (either baseline or via `/advisor`)
    - Runway estimator over/under-shoot patterns → tuning candidates
    - Per-phase p95 consumption outliers → investigation candidates
  - Writes recommendations to `.gsd-t/optimization-backlog.md` (new file). **Never blocks, never prompts, never auto-applies.**
  - Empty-signal runs still append a `## Complete-milestone review — no recommendations (M{N})` line so the loop is visibly active.
- **`.gsd-t/optimization-backlog.md`** format:
  ```markdown
  # Token Optimization Backlog

  ## [M35-OPT-001] Demote test-sync phase from opus → sonnet
  **Detected**: 2026-04-20 at complete-milestone M36
  **Evidence**: 12 test-sync spawns across M33-M36, 100% success, avg 6400 tokens on opus. Sonnet baseline on similar phases shows equivalent success rate.
  **Projected savings**: ~45% tokens on test-sync (~3.5k per spawn)
  **Proposed change**: `bin/model-selector.js` — add `test-sync` to sonnet tier
  **Risk**: Low — test-sync is mechanical. Escalation to opus available via /advisor if stalled.
  **Status**: pending
  **Rejection cooldown**: 0 (fresh recommendation)
  ```
- **`/user:gsd-t-optimization-apply {ID}`** — new command file:
  - Reads the specified entry, creates a quick milestone or promotes to regular backlog via `/user:gsd-t-backlog-promote`, marks the optimization-backlog entry `status: promoted`.
- **`/user:gsd-t-optimization-reject {ID} [--reason "..."]`** — new command file:
  - Marks entry `status: rejected`, captures reason, sets `rejection_cooldown` to 5 milestones so the same signal doesn't re-surface immediately.
- Existing `/user:gsd-t-backlog-list` gets a `--file` flag so it can list `optimization-backlog.md` too.

### E.5 — Contracts
- `.gsd-t/contracts/token-telemetry-contract.md` → v1.0.0 — new:
  - Defines the per-spawn bracket protocol
  - Defines `token-metrics.jsonl` schema (frozen — additions only, never removals/renames)
  - Defines the query CLI contract
  - Defines the optimization-backlog flow and the never-auto-apply guarantee

**Acceptance criteria**:
- `.gsd-t/token-metrics.jsonl` being written by at least 3 command files (execute, wave, debug) with the full schema.
- `gsd-t metrics --tokens --by model,command` returns a non-empty table after one M35 milestone's worth of spawns.
- `gsd-t metrics --halts` implemented.
- `bin/token-optimizer.js` implemented, runs at `complete-milestone`, appends at least a "no recommendations" line if nothing found.
- `/user:gsd-t-optimization-apply` and `/user:gsd-t-optimization-reject` command files exist and are wired into help/router.
- Full roundtrip test: append a synthetic record, run the optimizer, confirm it surfaces a recommendation, apply it, confirm `optimization-backlog.md` updates.

## Part F — Headless Auto-Spawn on Runway Halt

**Goal**: When the runway estimator refuses a run (Part C), automatically spawn a headless Claude Code process to continue the work in a fresh context. The user never types `/clear`.

**Scope**:
- Leverage the existing `bin/gsd-t.js` `headless` subcommand (already implemented for debug-loop and state queries). Extension is wiring, not new infrastructure.
- `bin/runway-estimator.js` — when refusing a run, instead of printing "run `/clear` and resume," call a new helper `autoSpawnHeadless({command, args, continue_from})`:
  - Writes a continue-here file with full context (current domain, pending tasks, decision log snapshot)
  - Invokes `node bin/gsd-t.js headless {command} --resume --log` as a child process
  - Returns a handle the caller can report to the user
- `bin/headless-auto-spawn.js` — new module wrapping the child-process invocation:
  - Detaches the child so the interactive session is not blocked
  - Captures the child's PID, log file path, and timestamp
  - Writes a `.gsd-t/headless-sessions/{id}.json` status file so the interactive session can query progress
  - Installs a macOS `osascript` notification (leverages existing Stop hook pattern) when the headless run completes
- Mid-loop handoff for debug (ties to Part C debug inter-iteration check):
  - When debug.md's between-iteration runway check refuses iteration N+1, the current iteration's state is persisted (last fix, last test output, hypothesis) and the handoff spawns headless-debug-loop with a resume flag
  - headless-debug-loop picks up at iteration N+1 with clean context
  - Final results converge back into the interactive session's `.gsd-t/` state
- Interactive-session read-back:
  - When the user returns to the interactive session, the next GSD-T command invocation (any command) checks `.gsd-t/headless-sessions/` for completed runs and surfaces their results in a "Headless runs since you left" banner at the top of the response.
- `.gsd-t/contracts/headless-auto-spawn-contract.md` → v1.0.0 — new:
  - API, handoff protocol, continue-here format for auto-spawn, notification channel
  - Explicit guarantee: the interactive session is never blocked waiting for the headless process

**Acceptance criteria**:
- Auto-spawn integration tested end-to-end: simulate a runway refusal, confirm `gsd-t headless ...` child process starts, confirm `.gsd-t/headless-sessions/{id}.json` is written, confirm the macOS notification fires on completion.
- Debug mid-loop handoff tested: simulate pathological context growth mid-iteration, confirm handoff preserves hypothesis + fix + test state, confirm headless-debug-loop picks up correctly.
- Interactive read-back tested: next command invocation after a completed headless run surfaces the results banner.
- User never sees a `/clear` prompt in the entire milestone test.

## Part G — Docs, Tests, and Migration

**Goal**: Everything downstream — documentation, tests, templates, changelogs, PRD — updated to reflect the new model. No silent references to the old bands anywhere.

**Scope**:

### G.1 — Tests
Roughly 80-100 new tests across:
- `test/token-budget.test.js` — updated for three-band model
- `test/model-selector.test.js` — new (~15)
- `test/advisor-integration.test.js` — new (~10)
- `test/runway-estimator.test.js` — new (~20)
- `test/token-telemetry.test.js` — new (~15)
- `test/token-optimizer.test.js` — new (~10)
- `test/headless-auto-spawn.test.js` — new (~8)
- `test/runway-debug-handoff.test.js` — new (~5)
- Command-file integration tests updated: execute, wave, quick, debug, integrate

Target: 941 → ~1030 (+90 net new). Final count not enforced — quality over count.

### G.2 — Documentation
- `README.md` — new section "Runway-Protected Execution" replacing any mention of "graduated degradation"
- `docs/GSD-T-README.md` — model assignment block documented, `/advisor` escalation explained, token telemetry CLI commands documented
- `docs/methodology.md` — "From Silent Degradation to Aggressive Pause-Resume" narrative arc
- `docs/architecture.md` — runway estimator + headless auto-spawn added to architecture diagrams
- `docs/infrastructure.md` — `.gsd-t/token-metrics.jsonl` schema, `gsd-t metrics` CLI surface
- `docs/requirements.md` — new REQs: REQ-069 through REQ-078 (10 REQs covering rip-out, model selection, runway estimator, token telemetry, optimization backlog, headless auto-spawn)
- `docs/prd-harness-evolution.md` — §3.7 completely rewritten
- `CHANGELOG.md` — `[2.76.10] - YYYY-MM-DD` entry with full Added/Changed/Removed/Migration/Propagation sections
- `templates/CLAUDE-global.md` — model assignment convention, runway estimator intro, `/advisor` escalation pattern
- `templates/CLAUDE-project.md` — project-level model assignment overrides

### G.3 — Version + package
- `package.json` version 2.75.10 → 2.76.10
- `.gsd-t/progress.md` version bump + M35 decision log entry

### G.4 — Memory updates
- `feedback_no_silent_degradation.md` — update to reflect that M35 implemented the fix
- `project_compaction_regression.md` — update to reflect that M35 structurally eliminates native compact under healthy operation

## Proposed domain partition (for `/user:gsd-t-partition`)

Six domains, rough task counts:

| Domain | Tasks | Key deliverables |
|--------|-------|------------------|
| degradation-rip-out | 4 | `bin/token-budget.js` rewrite, `token-budget-contract.md` v3.0.0, command-file sweep across all consumers, PRD §3.7 rewrite |
| model-selector-advisor | 6 | `bin/model-selector.js`, `bin/advisor-integration.js`, `model-selection-contract.md` v1.0.0, `## Model Assignment` blocks in all command files, templates update |
| runway-estimator | 5 | `bin/runway-estimator.js`, `runway-estimator-contract.md` v1.0.0, command-file Step 0 wire-up (5 files), inter-iteration debug check, conservative-skew unit tests |
| token-telemetry | 6 | `bin/token-telemetry.js`, `.gsd-t/token-metrics.jsonl` schema + writer, `token-telemetry-contract.md` v1.0.0, `gsd-t metrics --tokens/--halts/--context-window` CLI, command-file bracket wiring, per-spawn bracket helpers |
| optimization-backlog | 4 | `bin/token-optimizer.js`, `.gsd-t/optimization-backlog.md` format, `/user:gsd-t-optimization-apply` + `/user:gsd-t-optimization-reject` command files, `gsd-t-backlog-list --file` flag, integration with `complete-milestone` |
| headless-auto-spawn | 5 | `bin/headless-auto-spawn.js`, `headless-auto-spawn-contract.md` v1.0.0, debug mid-loop handoff, interactive read-back banner, macOS notification integration, `.gsd-t/headless-sessions/` state files |
| m35-docs-and-tests | 8 | README, GSD-T-README, methodology, architecture, infrastructure, requirements (REQ-069–078), PRD §3.7, templates, CHANGELOG, version bump, memory updates |
| **Total** | **38** | |

Six implementation domains + one docs/tests domain = **7 domains**.

## Wave structure (for `/user:gsd-t-plan`)

**Wave 1 (parallel-safe, foundational)**:
- degradation-rip-out (Tasks 1-2: rewrite `getDegradationActions`, `token-budget-contract.md` v3.0.0) — must land first since other parts depend on the new shape
- model-selector-advisor (Task 1: open-question resolution on `/advisor` native API — does it expose a programmable interface?)
- token-telemetry (Tasks 1-2: schema + `bin/token-telemetry.js` skeleton — needed by runway estimator)

**Wave 2 (parallel, depends on Wave 1)**:
- degradation-rip-out (Tasks 3-4: command-file sweep, PRD rewrite)
- model-selector-advisor (Tasks 2-5: `bin/model-selector.js`, `bin/advisor-integration.js`, Model Assignment blocks)
- token-telemetry (Tasks 3-5: spawn bracket integration in command files, `gsd-t metrics` CLI)

**Wave 3 (depends on Wave 2)**:
- runway-estimator (Tasks 1-5: `bin/runway-estimator.js`, wire-up, inter-iteration checks) — needs token-telemetry history feed
- headless-auto-spawn (Tasks 1-3: `bin/headless-auto-spawn.js`, debug handoff, notification) — needs runway-estimator to trigger it

**Wave 4 (depends on Wave 3 — system is self-hosting at this point)**:
- optimization-backlog (all 4 tasks) — needs token-telemetry data + stable runway estimator
- headless-auto-spawn (Tasks 4-5: interactive read-back, final smoke tests)

**Wave 5 (docs + tests ripple + verify + complete)**:
- m35-docs-and-tests (all 8 tasks)
- Full test suite run, goal-backward verify, complete-milestone, tag `v2.76.10`

**Critical property**: Wave 3 onward should be executed with M35's own runway estimator and headless auto-spawn engaged. This is dogfooding — M35 protects its own execution as soon as the protection mechanism self-hosts. If something goes wrong mid-Wave-3, the failure mode tells us the estimator or handoff needs work *before* we ship.

## Risks + mitigations

| Risk | Mitigation |
|------|------------|
| `/advisor` native tool has no programmable API | Part B Task 1 resolves the open question first. Fallback: convention-based escalation (subagent prompt tells agent to `/advisor` at declared points, orchestrator logs whether it did) |
| Runway estimator over-refuses during Wave 3 (chicken-and-egg: no historical data yet for M35 phases) | Conservative constant fallback: 4% tokens/task for sonnet routine, 8% for opus, until 10+ matching records exist. Tune after Wave 3 using real M35 data |
| Headless auto-spawn fails on the first real handoff | Wave 3 smoke tests run before Wave 4 enables optimization backlog. If headless auto-spawn fails, Wave 4 pauses and we debug. User gets a clean fallback: "headless auto-spawn failed, checkpointing, please run /clear and /user:gsd-t-resume" — this is the one path where the user sees a `/clear` prompt, and it means something is broken |
| Token telemetry bracket overhead is significant (adds a few hundred tokens per spawn for the `count_tokens` API call) | The `count_tokens` call already runs in M34's PostToolUse hook. Part E reads the existing state file, doesn't add new API calls. Overhead is a single JSON parse per spawn |
| Optimization backlog produces noisy recommendations that are all rejected | Part E.4 tracks rejection rate. If M36 optimization run ends with 100% rejection, the optimizer's signal thresholds need tuning. Captured as a meta-signal in the optimizer itself |
| Compat break surprises an external consumer | There are no external consumers of `bin/token-budget.js`. Confirmed via grep. Option X (clean break) is safe |

## Non-goals

- **Not a cost model.** M35 tracks token usage per model, not dollar cost. Cost translation is explicitly out of scope.
- **Not auto-optimization.** The optimization backlog never auto-applies recommendations. The user selectively promotes.
- **Not a model marketplace.** M35 does not abstract over other providers. Claude models only.
- **Not a runtime patch to Claude Code.** M35 cannot make Claude Code itself do anything it doesn't already support. `/advisor` integration is convention-based if the native tool isn't programmable.
- **Not a compaction suppression hack.** M35 eliminates compact messages structurally by never reaching the threshold, not by patching the runtime.

## Open questions to resolve in execution

1. Does the Claude Code `/advisor` tool expose a programmable API callable from a subagent prompt, or is it user-initiated only? (Resolve in `model-selector-advisor` domain Task 1. Fallback is convention-based.)
2. Is there a native Claude Code mechanism for a subagent to report "I consulted advisor, here's the guidance I received" back to the orchestrator? (Affects how `escalated_via_advisor` is set in token-metrics records.)
3. When headless auto-spawn completes mid-wave, what's the cleanest UX for the interactive session to "pick up where it left off"? Option A: interactive session re-reads all state files on next command invocation. Option B: the headless run writes a "results ready" file and the next interactive command surfaces a banner. Current plan is Option B, but validate with the user after Wave 3.
4. Should the optimization backlog surface in `/user:gsd-t-status` output, or only when the user explicitly invokes `/user:gsd-t-backlog-list --file optimization-backlog.md`? Current plan: show a one-line "N pending optimization recommendations" in status output, no details.

## Success definition

M35 is complete when:

1. Zero references to `downgrade`/`conserve`/`modelOverride`/`skipPhases` in live code, contracts, command files, templates, or docs (outside of historical prose).
2. `bin/model-selector.js` exists, at least 8 phase mappings, declarative rules.
3. `bin/runway-estimator.js` exists, wires into at least 5 command files, auto-spawns headless on refusal.
4. `.gsd-t/token-metrics.jsonl` captures per-spawn data with the full schema, at least one M35 milestone's worth of records present.
5. `gsd-t metrics --tokens --by model,command` returns real aggregated data.
6. `bin/token-optimizer.js` runs at `complete-milestone`, appends to `.gsd-t/optimization-backlog.md`.
7. `/user:gsd-t-optimization-apply` and `/user:gsd-t-optimization-reject` command files exist and work.
8. Headless auto-spawn tested end-to-end with a simulated runway refusal.
9. Full test suite green (~1030/1030).
10. Goal-backward verification PASS with 0 findings.
11. M35 dogfooded itself during execution: at least one real runway refusal + headless handoff occurred during Wave 3 or later, with no user-facing `/clear` prompt.
12. CHANGELOG, README, docs, templates, memory all updated.
13. `v2.76.10` tag created.

## Estimated effort

- **Scope**: 7 domains, ~38 tasks, 4 new contracts, 2 contract rewrites, ~90 new tests, ~15 documentation files touched
- **Comparison**: similar scale to M34 (5 domains, 32 tasks, 3 contracts, +108 tests) but with more cross-cutting command-file surgery
- **Rough session count**: 4-6 resume sessions if aggressive pause/resume is used correctly (M35 is designed to validate exactly this)
- **Wave cadence**: Wave 1-2 in session 1, Wave 3 in session 2, Wave 4 in session 3, Wave 5 + complete-milestone in session 4. Earlier sessions auto-spawn headless for Wave 3 smoke tests.

---

## Resume instructions for the next session

After `/clear`, invoke:

```
/user:gsd-t-milestone M35 — No Silent Degradation + Surgical Model Escalation + Token Telemetry
```

The milestone command will read this definition file (`.gsd-t/M35-definition.md`) and generate the formal `.gsd-t/progress.md` Active Milestone block + requirements update. Then:

```
/user:gsd-t-partition
```

Partition should produce the 7 domains listed above with scope/tasks/constraints for each. Confirm the partition matches this definition, then:

```
/user:gsd-t-plan
```

Generate atomic task lists aligned to the wave structure above. Then execute at Level 3 Full Auto. Aggressive pause/resume kicks in automatically as soon as Wave 3 (runway estimator) self-hosts.

**Critical reminders for future sessions**:
- Option X: clean break, no compat shims on `token-budget-contract`
- Default routine model: `sonnet` (user confirmed)
- Headless auto-spawn: **never** prompt user to `/clear`
- Option B for interactive read-back (banner on next command)
- Token telemetry: usage only, **not** cost
- Optimization backlog: detect only, never auto-apply, user selectively promotes
- Dogfood M35 as soon as Wave 3 lands — the milestone validates its own protection mechanism
