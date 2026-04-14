# Domain: m35-optimization-backlog

## Milestone: M35
## Status: DEFINED
## Wave: 4

## Purpose

Detect optimization opportunities from token-telemetry data (demote phases on opus with 100% success, escalate phases on sonnet with high fix-cycle count, tune runway estimator over/under-shoot patterns, flag p95 outliers) and surface them as a user-reviewable backlog. Never auto-applies. User selectively promotes.

## Why this domain exists

M35's data-before-optimization principle: gather per-spawn token usage first, then let the user decide what to change. This domain is the review loop that runs at `gsd-t-complete-milestone` and appends recommendations to `.gsd-t/optimization-backlog.md`. Rejections have a 5-milestone cooldown to prevent spam.

## Files in scope

- `bin/token-optimizer.js` — NEW module
- `.gsd-t/optimization-backlog.md` — NEW file (format defined here)
- `commands/gsd-t-optimization-apply.md` — NEW command file
- `commands/gsd-t-optimization-reject.md` — NEW command file
- `test/token-optimizer.test.js` — NEW (~10 tests)
- `commands/gsd-t-complete-milestone.md` — add token-optimizer invocation at end
- `commands/gsd-t-backlog-list.md` — add `--file` flag for listing optimization-backlog.md
- `commands/gsd-t-help.md` — reference new commands
- `commands/gsd-t-status.md` — show "N pending optimization recommendations" one-liner

## Files NOT in scope

- `bin/token-telemetry.js` — m35-token-telemetry
- `bin/model-selector.js` — m35-model-selector-advisor (but optimization-backlog reads model assignments to detect demotion candidates)

## Dependencies

- **Depends on**: m35-token-telemetry (reads `.gsd-t/token-metrics.jsonl`), m35-model-selector-advisor (reads current model assignments)
- **Blocks**: Nothing in Wave 5 — docs-and-tests just needs to reference the new files

## Acceptance criteria

1. `bin/token-optimizer.js` exists, runs at end of `gsd-t-complete-milestone`
2. Reads last N (default 3) milestones of `.gsd-t/token-metrics.jsonl`, joins with `.gsd-t/task-metrics.jsonl` for outcome signals
3. Detection rules: opus+100%success→demote candidate, sonnet+high-fix-cycle→escalate candidate, runway-estimator outlier→tune candidate, p95 outlier→investigate candidate
4. Writes recommendations to `.gsd-t/optimization-backlog.md` in the format specified by M35 definition (§E.4)
5. Empty-signal runs append `## Complete-milestone review — no recommendations (M{N})` line
6. `/user:gsd-t-optimization-apply {ID}` promotes entry to milestone or backlog
7. `/user:gsd-t-optimization-reject {ID} [--reason "..."]` marks rejected with 5-milestone cooldown
8. `gsd-t-backlog-list --file optimization-backlog.md` works
9. `gsd-t-status` shows pending count
10. Never auto-applies, never blocks, never prompts
