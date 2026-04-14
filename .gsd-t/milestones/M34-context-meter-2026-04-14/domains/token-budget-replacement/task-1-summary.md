# Task 1 Summary — token-budget-contract v2.0.0

**Domain**: token-budget-replacement
**Task**: 1 — Update `.gsd-t/contracts/token-budget-contract.md` to v2.0.0
**Status**: PASS
**Date**: 2026-04-14

## What changed

Full polish of the partition-era v2.0.0 draft of `.gsd-t/contracts/token-budget-contract.md` (120 lines → 255 lines). No code changes.

### New/restructured sections (canonical ordering)

1. Header (Version 2.0.0, Status ACTIVE, Owner, full Consumers list)
2. **Purpose** — 4-paragraph explanation of v2.0.0's state-file-first data source and what it replaces
3. **Public API Surface** — every exported function from `bin/token-budget.js` documented with exact signature, parameter types, return shape, and "v2.0.0 changes" subsection:
   - `estimateCost(model, taskType, options?)`
   - `getSessionStatus(projectDir?)` — the only function whose internals changed
   - `recordUsage(usage)`
   - `getDegradationActions(projectDir?)`
   - `estimateMilestoneCost(remainingTasks, projectDir?)`
   - `getModelCostRatios()`
4. **Session Budget Estimation** — ASCII flowchart showing state-file-first → heuristic fallback; explicit 5-minute staleness window; explicit "no env var reads" assertion
5. **Threshold Bands** — table + code fragment showing lower-bound-inclusive / upper-exclusive semantics matching `resolveThreshold()` in `bin/token-budget.js`
6. **Degradation Actions** — actions + model-override map per threshold band; explicit note that `stop` emits exit code 10 + `/clear` + `/user:gsd-t-resume`
7. **Integration Points** — table of all 9 consumers:
   - `bin/orchestrator.js` (task-budget gate) — Task 5
   - `gsd-t-execute.md` Step 2 — Task 6
   - `gsd-t-wave.md` Step 0 — Task 7
   - `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md` — Task 8
   - `gsd-t-complete-milestone.md`
   - `bin/gsd-t.js doStatus` (already wired, commit `dc34881`)
   - `bin/gsd-t.js doDoctor` (already wired, commit `becf318`)
8. **Task Counter Retirement** — timeline (v1.0.x → v2.74.12 → v2.75.10) + migration path referencing every future task (Tasks 3–9 in this domain, installer-integration Task 5)
9. **Removed / Retired (v1.x → v2.0.0 migration notes)** — explicit table of every retired artifact with rationale:
   - `process.env.CLAUDE_CONTEXT_TOKENS_USED/MAX`
   - `Tasks-Since-Reset` column
   - `bin/task-counter.cjs`
   - orchestrator task-increment calls
   - env-var-based tests
10. **Backward Compatibility** — caller-side, test-side, downstream-project-side promises
11. **Breaking Changes** — "None for callers" + internal breakages list
12. **Change Log** — v1.0.0 (M31) → v1.x (v2.74.12 stopgap) → v2.0.0 (M34)

## Acceptance criteria verification

| Criterion | Status |
|---|---|
| Version bumped to 2.0.0 | ✅ Header line 3 |
| Session Budget Estimation reads from context-meter state file, not env vars | ✅ Section 4, ASCII diagram + "No environment variable reads" assertion |
| Task Counter Retirement section present (references v2.75.10) | ✅ Section 8, full timeline + migration path |
| All `CLAUDE_CONTEXT_TOKENS_*` references removed or explicitly marked as retired | ✅ 9 hits total, all in retirement-context prose (Purpose, Session Budget negative assertion, Retirement section, Removed/Retired table, Backward Compat, Breaking Changes, Change Log). No live-path reference. |
| Public API surface preserved (same signatures as v1.x) | ✅ All 6 exports documented with v1.x signatures; "v2.0.0 changes: None" on every function except `getSessionStatus` (internals only) |

## Grep checks

```
grep -n 'CLAUDE_CONTEXT_TOKENS' .gsd-t/contracts/token-budget-contract.md
```

Returns 9 hits on lines 16, 54, 126, 195, 207, 217, 229, 240, 250 — **all inside explicit retirement prose**. Acceptance criterion permits "removed OR explicitly marked as retired"; every remaining hit is labeled as retired, inert, or historical.

## Tests

`npm test` → **924/924 green** (sanity check only; no code changed in this task).

## Constraint discoveries

1. **No separate `threshold.js` module**. The band boundaries live exclusively in `bin/token-budget.js` as the `THRESHOLDS` constant (`{warn: 60, downgrade: 70, conserve: 85, stop: 95}`) and `resolveThreshold()` function. The task spec flagged "if there's a disagreement between existing modules, flag it and pick the one token-budget.js uses" — there is no disagreement because there is no second module. `scripts/context-meter/threshold.js` exists inside the context-meter domain and already uses the same constants (confirmed in progress.md 2026-04-14 21:10 entry). Contract now documents `bin/token-budget.js` as the single source of truth.

2. **Current `bin/token-budget.js` `getSessionStatus()` already does NOT read env vars**. It reads `.gsd-t/.task-counter` (v2.74.12 stopgap introduced when the env-var gate was found inert). The Change Log correctly documents all three stages: v1.0.0 env-var → v1.x task-counter proxy → v2.0.0 state file. This means Task 3's actual rewrite is task-counter→state-file, not env-var→state-file. This clarification is now reflected in the contract's Change Log and the Task Counter Retirement section.

3. **`task-counter.cjs` is NOT referenced from `bin/token-budget.js`**. The file reads the `.gsd-t/.task-counter` state file directly via `fs.readFileSync`. Task 3's rewrite therefore only needs to replace the `readTaskCounter()` helper body — not remove any `require()` call. Task 5 (orchestrator) is the task that removes `require('./task-counter.cjs')` + child-process calls.

## Deferred items

None. Contract is ready for Task 3 (rewrite internals) to consume.

## Files modified

- `.gsd-t/contracts/token-budget-contract.md` (full rewrite)
- `.gsd-t/progress.md` (Decision Log entry)
- `.gsd-t/domains/token-budget-replacement/task-1-summary.md` (new — this file)
