# Constraints: metrics-rollup

## Must Follow
- Zero external dependencies — Node.js built-ins only
- All functions <= 30 lines (project convention)
- File under 200 lines
- Module must export functions for testability
- JSONL output: one JSON object per line, append-only
- ELO computation must be deterministic (same input = same output)
- Detection heuristics must return structured findings (not just console output)
- Rollup schema must be defined in metrics-schema-contract.md before implementation

## Must Not
- Modify files outside owned scope
- Write to task-metrics.jsonl (read-only consumer)
- Change existing complete-milestone steps — only ADD new steps
- Change existing verify quality gates — only ADD quality budget check
- Change existing plan validation — only ADD pre-mortem step

## Must Read Before Using
- `bin/metrics-collector.js` — understand task-metrics.jsonl schema (produced by metrics-collection)
- `.gsd-t/contracts/metrics-schema-contract.md` — authoritative schema for both JSONL files
- `commands/gsd-t-complete-milestone.md` — understand current step sequence before adding rollup step
- `commands/gsd-t-verify.md` — understand current quality gates before adding budget check
- `commands/gsd-t-plan.md` — understand current plan flow before adding pre-mortem

## Dependencies
- Depends on: metrics-collection domain (reads task-metrics.jsonl)
- Depended on by: metrics-dashboard domain (reads rollup.jsonl)
- Depended on by: metrics-commands domain (gsd-t-metrics reads rollup.jsonl, gsd-t-status displays ELO)

## External Reference Dispositions
- `.gsd-t/metrics/task-metrics.jsonl` — USE (read as input)
- `.gsd-t/progress.md` — USE (read milestone history for trend comparison)
- AlphaZero ELO concept — INSPECT (use the scoring concept, not the algorithm)
- Google SRE Error Budget — INSPECT (use the quality budget concept, not the implementation)
