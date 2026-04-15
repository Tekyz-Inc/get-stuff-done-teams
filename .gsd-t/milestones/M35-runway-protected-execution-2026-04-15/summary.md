# Milestone Complete: M35 — Runway-Protected Execution

**Completed**: 2026-04-15
**Duration**: 2026-04-14 → 2026-04-15 (two days, five waves)
**Status**: VERIFIED
**Version**: 2.75.10 → **2.76.10**

## What Was Built

M35 **rips out silent quality-degradation under context pressure** and replaces it with a runway-protected execution model:

1. **Three-band context gate** — `normal` (<70%), `warn` (70–85%, log and proceed at full quality), `stop` (≥85%, halt cleanly). The v2.x `downgrade` and `conserve` bands are **deleted**, along with `applyModelOverride`, `skipPhases`, and all related machinery. No compat shim — clean break on `token-budget-contract.md` v3.0.0.
2. **Surgical per-phase model selection** — `bin/model-selector.js` with a declarative 13+ phase rules table; complexity-signal escalation (`cross_module_refactor`, `security_boundary`, `data_loss_risk`, `contract_design`) pushes sonnet→opus at plan time. Model choice is a plan-time decision, never a runtime pressure response.
3. **Pre-flight runway estimator + headless auto-spawn** — `bin/runway-estimator.js` projects per-phase cost from `.gsd-t/token-metrics.jsonl` history via three-tier query fallback (exact → command+phase → command). If the projection would cross 85%, the command refuses to start and `bin/headless-auto-spawn.js` spawns a detached child process to continue the work with a fresh context window. **The user never types `/clear`** under normal operation.
4. **Per-spawn token telemetry** — `bin/token-telemetry.js` writes a frozen 18-field JSONL record per subagent spawn to `.gsd-t/token-metrics.jsonl`. `gsd-t metrics --tokens [--by ...]`, `--halts`, and `--tokens --context-window` surface the history.
5. **Optimization backlog (detect-only)** — `bin/token-optimizer.js` runs at `complete-milestone`, scans the last 3 milestones, and appends recalibration recommendations (demote/escalate/runway-tune/investigate) to `.gsd-t/optimization-backlog.md`. Recommendations are **never auto-applied** — the user promotes via `/user:gsd-t-optimization-apply {ID}` or rejects via `/user:gsd-t-optimization-reject {ID} [--reason "..."]` with a 5-milestone fingerprint-based cooldown.
6. **Headless read-back banner** — `bin/check-headless-sessions.js` renders completed-but-unsurfaced sessions on the next `gsd-t-resume` Step 0.5 or `gsd-t-status` Step 0.

**Structural guarantee**: with `STOP_THRESHOLD_PCT = 85` and pre-flight refusal, the runtime's 95% native compact is unreachable under healthy operation. `halt_type: native-compact` in telemetry is now a defect signal.

## Domains

| Domain                      | Tasks | Wave  | Key Deliverables                                                                 |
|-----------------------------|-------|-------|----------------------------------------------------------------------------------|
| m35-degradation-rip-out     | 4/4   | 1–2   | token-budget.js v3.0.0 rewrite; 6-command-file sweep; PRD §3.7 rewrite            |
| m35-model-selector-advisor  | 6/6   | 1–2   | model-selector.js + 13 phase mappings; advisor-integration.js convention fallback |
| m35-token-telemetry         | 6/6   | 1–2   | token-telemetry.js + 18-field schema; gsd-t metrics CLI surface                   |
| m35-runway-estimator        | 5/5   | 3     | runway-estimator.js + three-tier query fallback + confidence grading              |
| m35-headless-auto-spawn     | 5/5   | 3–4   | headless-auto-spawn.js detached child; session file schema; check-headless-sessions.js |
| m35-optimization-backlog    | 4/4   | 4     | token-optimizer.js + 4 detection rules; apply/reject commands; 5-milestone cooldown |
| m35-docs-and-tests          | 8/8   | 5     | README, GSD-T-README, methodology, architecture, infrastructure, requirements, PRD, CHANGELOG, version bump |
| **Total**                   | **38/38** | 1–5 | **all waves shipped**                                                         |

## Contracts Defined/Updated

- `token-budget-contract.md` v3.0.0 ACTIVE — **REWRITTEN** (clean break from v2.0.0; three bands only; no compat shim)
- `model-selection-contract.md` v1.0.0 ACTIVE — **NEW** (declarative phase→tier mapping, complexity-signal escalation, /advisor hook schema)
- `runway-estimator-contract.md` v1.0.0 ACTIVE — **NEW** (pre-flight projection, three-tier query fallback, confidence grading, refusal + headless handoff)
- `token-telemetry-contract.md` v1.0.0 ACTIVE — **NEW** (frozen 18-field per-spawn JSONL schema, halt_type enum, run_type enum)
- `headless-auto-spawn-contract.md` v1.0.0 ACTIVE — **NEW** (detached continuation, session file schema, macOS notification channel, read-back banner)

## Key Decisions

- **Option X — clean break, no compat shim.** v3.0.0 `token-budget-contract.md` drops `downgrade`/`conserve`/`modelOverrides`/`skipPhases` entirely. No translation layer. The return shape narrows from `{band, pct, modelOverrides, skipPhases, actions, message}` to `{band, pct, message}`. Callers were updated atomically in Wave 1.
- **Sonnet is the routine default.** Opus is applied surgically at declared escalation points (partition, discuss, Red Team, verify judgment, debug root-cause, architecture/contract design), not as a fallback for "important-looking" work. Haiku is strictly for mechanical tasks (test runners, file-existence checks, JSON validation, branch guards).
- **User never types `/clear` under normal operation.** The runway estimator refuses runs projected to cross 85% and hands off to a detached headless continuation. The only time a user sees a `/clear` prompt is when the headless handoff itself fails — explicit degradation, not silent.
- **Optimization backlog is detect-only.** Recommendations are fingerprinted and appended to `.gsd-t/optimization-backlog.md`. Promotion is explicit (`/user:gsd-t-optimization-apply {ID}`); rejection is explicit (`/user:gsd-t-optimization-reject {ID}`) with a 5-milestone cooldown. Tier calibration is a data-driven human decision, not a runtime heuristic.
- **Quality is non-negotiable.** No phase is "non-essential." Red Team, doc-ripple, and Design Verify always run at their designated tier. If a task can't fit, the task pauses — it does not degrade.
- **M35 dogfooded itself from Wave 3 onward.** Runway-estimator and headless-auto-spawn shipped in Wave 3 and were immediately available for Waves 4–5 to self-protect against context exhaustion during their own delivery.

## Issues Encountered

- **DAT-T8 gap-closure reveal**: a global grep for `downgrade|conserve|modelOverrides|skipPhases` during Wave 5 surfaced ~12 residual prose references across `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`, `gsd-t-plan.md`, and `bin/token-budget.js` comment blocks. Audit confirmed all were historical/prose references explaining the removal (acceptable per REQ-070 criterion — "prose discussing the removal is acceptable"). No live-code references remained.
- **`runway-tune` detection rule no-op**: the rule is wired into `bin/token-optimizer.js` but fires zero recommendations until the per-spawn schema is extended with `projected_end_pct` and `actual_end_pct` fields. This is deferred by design — the rule activates the moment those additive fields appear, no code changes needed.
- **`/advisor` is convention-based only**: no programmable Claude Code API exists. `bin/advisor-integration.js` always returns `{available: false}` and appends `missed_escalation` markers to `.gsd-t/token-log.md`. Documented as an explicit non-goal in the M35 definition.
- **Wave 5 verify folded inline**: M35 did not run a separate `/user:gsd-t-verify` invocation. Per the standing "continue until milestone is complete" directive, verification was folded into Wave 5 DAT-T8 (full test suite + forbidden-term grep + REQ-069–078 goal-backward trace). This verify-report was synthesized at complete-milestone time from Wave 5 evidence rather than a dedicated verify phase.

## Test Coverage

- **Tests added/rewritten**:
  - `test/token-budget.test.js` — rewritten for v3.0.0 three-band model (37/37 green)
  - `test/model-selector.test.js` — 13+ phase mappings × complexity-signal escalation (36/36 green)
  - `test/advisor-integration.test.js` — convention-based fallback + missed-escalation marker (14/14 green)
  - `test/token-telemetry.test.js` — schema, recordSpawn, readAll, aggregate with count/total/mean/median/p95 (16/16 green)
  - `test/runway-estimator.test.js` — three-tier query fallback, confidence grading, refusal path
  - `test/headless-auto-spawn.test.js` — session file schema, completion watcher, read-back banner, non-darwin degradation, E2E shim-process smoke (16/16 green)
  - `test/token-optimizer.test.js` — 4 detection rules + parseBacklog round-trip + cooldown + OB-T4 integration roundtrip (19/19 green)
  - `test/filesystem.test.js` — command-count assertions updated 51→53 / 56→58 for two new command files
- **Baseline**: 833/833 (pre-M34) → 941/941 (M34 exit) → **985/985** (M35 exit, +44 net new)
- **Regression check**: zero pre-existing test failures introduced

## Git Tag

`v2.76.10`

## Files Changed

### New
- `bin/model-selector.js`, `bin/advisor-integration.js`, `bin/runway-estimator.js`, `bin/headless-auto-spawn.js`, `bin/token-telemetry.js`, `bin/token-optimizer.js`, `bin/check-headless-sessions.js`
- `.gsd-t/contracts/model-selection-contract.md`, `runway-estimator-contract.md`, `token-telemetry-contract.md`, `headless-auto-spawn-contract.md` (all v1.0.0 ACTIVE)
- `commands/gsd-t-optimization-apply.md`, `gsd-t-optimization-reject.md`
- `.gsd-t/optimization-backlog.md` (stub)
- `test/model-selector.test.js`, `test/advisor-integration.test.js`, `test/token-telemetry.test.js`, `test/runway-estimator.test.js`, `test/headless-auto-spawn.test.js`, `test/token-optimizer.test.js`

### Modified
- `bin/token-budget.js` — v3.0.0 rewrite (three-band model, state-file first, heuristic fallback)
- `bin/orchestrator.js` — gate semantics updated to normal/warn/stop; no model swaps, no phase skips
- `bin/gsd-t.js` — `doMetrics` adds `--tokens`, `--halts`, `--context-window` flags; retirement migration intact
- `.gsd-t/contracts/token-budget-contract.md` — v2.0.0 → v3.0.0 (clean break rewrite)
- `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`, `gsd-t-doc-ripple.md`, `gsd-t-plan.md`, `gsd-t-partition.md`, `gsd-t-discuss.md`, `gsd-t-verify.md`, `gsd-t-test-sync.md` — Step 0 runway gate, Model Assignment blocks, per-spawn token brackets
- `commands/gsd-t-resume.md` — Step 0.5 Headless Read-Back Banner MANDATORY
- `commands/gsd-t-status.md` — Step 0 Headless Read-Back Banner + Step 0.5 Optimization Backlog Pending Count
- `commands/gsd-t-complete-milestone.md` — Step 14 non-blocking optimizer invocation
- `commands/gsd-t-backlog-list.md` — `--file` flag for optimization-backlog.md rendering
- `commands/gsd-t-help.md` — OPTIMIZATION section
- `README.md`, `docs/GSD-T-README.md`, `docs/methodology.md`, `docs/architecture.md`, `docs/infrastructure.md`, `docs/requirements.md`, `docs/prd-harness-evolution.md`, `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md` — M35 doc ripple
- `CHANGELOG.md` — new `[2.76.10] - 2026-04-15` top-section entry
- `package.json` — version 2.75.10 → 2.76.10
- `.gsd-t/progress.md` — M35 COMPLETE, version 2.76.10

### Removed
- Graduated degradation bands (`downgrade`, `conserve`) from `bin/token-budget.js` and `token-budget-contract.md`
- `applyModelOverride`, `skipPhases`, and all related runtime machinery
- Runtime model downgrade code path (never introduced; conceptually gone)
- Phase-skipping under pressure
- Manual `/clear` prompts under normal operation

## Propagation

Run `/user:gsd-t-version-update-all` from any registered GSD-T project to propagate v2.76.10 to all projects. Command files, templates, and `bin/` scripts are rewritten in place; project state in `.gsd-t/` is preserved.
