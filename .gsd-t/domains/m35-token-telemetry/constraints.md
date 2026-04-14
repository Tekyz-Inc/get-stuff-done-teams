# Constraints: m35-token-telemetry

## Hard constraints

1. **Frozen schema**: Once token-telemetry-contract v1.0.0 ships, fields are additive only. Never remove or rename. Breaking changes require a contract version bump.
2. **Append-only**: `.gsd-t/token-metrics.jsonl` is never rewritten in place. Records are appended. Aggregation happens on read.
3. **Raw access always available**: Tools can slice the JSONL directly without going through the CLI.
4. **No API calls in recordSpawn**: The bracket reads `.gsd-t/.context-meter-state.json` which is already maintained by M34's PostToolUse hook. No new `count_tokens` API calls in this domain.
5. **Usage only, not cost**: M35 tracks tokens consumed, not dollars. Cost translation is explicitly out of scope.
6. **Single-writer assumption**: No lockfile. GSD-T is single-session and single-writer at M35 scope.

## File boundaries

- **OWNED**: `bin/token-telemetry.js`, `.gsd-t/contracts/token-telemetry-contract.md`, `test/token-telemetry.test.js`, `.gsd-t/token-metrics.jsonl` (new file, created on first write)
- **EDITED**: `bin/gsd-t.js` (add metrics subcommands), 6 command files (per-spawn bracket)
- **PRESERVED (legacy)**: `.gsd-t/token-log.md` — kept in parallel during M35 for historical continuity; deprecation captured in M35 docs
- **DO NOT TOUCH**: `bin/token-budget.js`, `bin/runway-estimator.js`, `bin/token-optimizer.js`

## Testing

- ~15 unit tests (8 for token-telemetry.js, 5 for --tokens CLI, 2 for --halts/--context-window)
- Integration: run one wave, confirm JSONL has records for every spawn

## Quality gates that cannot be skipped

- Red Team on T2 (recordSpawn is the source of truth for all downstream telemetry)
- Red Team on T4 (aggregation math must be correct — p95 is easy to get wrong)
- Doc-ripple on T3 (6 command files touched)
