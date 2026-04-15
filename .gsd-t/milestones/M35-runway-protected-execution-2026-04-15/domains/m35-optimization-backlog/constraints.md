# Constraints: m35-optimization-backlog

## Hard constraints

1. **Never auto-applies**: Recommendations are detect-only. The user promotes or rejects explicitly.
2. **Never blocks**: `complete-milestone` always completes successfully whether or not the optimizer found recommendations.
3. **Never prompts**: The optimizer runs silently at end of `complete-milestone` and appends to the backlog file. Surfacing happens via `status` and `backlog-list`, not interactive prompts.
4. **Rejection cooldown**: Rejected recommendations are suppressed for 5 milestones to prevent the same signal from re-surfacing immediately.
5. **Empty runs still append**: Even with zero recommendations, the optimizer appends a marker line so the loop is visibly active.
6. **Noise self-detection**: If M36's optimizer run ends with 100% rejection, the optimizer's signal thresholds themselves become a tuning candidate in M37's run (captured as a meta-signal).

## File boundaries

- **OWNED**: `bin/token-optimizer.js`, `test/token-optimizer.test.js`, `.gsd-t/optimization-backlog.md`, `commands/gsd-t-optimization-apply.md`, `commands/gsd-t-optimization-reject.md`
- **EDITED**: `commands/gsd-t-complete-milestone.md`, `commands/gsd-t-backlog-list.md`, `commands/gsd-t-status.md`, `commands/gsd-t-help.md`
- **READ ONLY**: `.gsd-t/token-metrics.jsonl`, `.gsd-t/task-metrics.jsonl`, model-selection-contract

## Testing

- ~10 unit tests + integration roundtrip test
- Target lands at ~1020/1020 after this domain (token-telemetry + runway-estimator + optimization-backlog test deltas accumulate)

## Quality gates that cannot be skipped

- Red Team on T1 (detection rules must not produce false positives that erode trust)
- Red Team on T2 (apply/reject must be idempotent and safe)
