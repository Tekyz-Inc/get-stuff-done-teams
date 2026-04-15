# Constraints: m35-runway-estimator

## Hard constraints

1. **Never prompts the user**: On refusal, the estimator hands off to headless auto-spawn. It never outputs "run /clear and resume."
2. **Conservative skew**: When in doubt (low confidence, <10 historical records), over-estimate consumption. Better to refuse a run that would have fit than start a run that can't finish.
3. **Graceful degradation on empty history**: If `.gsd-t/token-metrics.jsonl` is empty or missing (Wave 3 bootstrap scenario), use constant fallback: 4%/task sonnet, 8%/task opus.
4. **Reads only, writes nothing to state**: The estimator is a pure function over `.gsd-t/.context-meter-state.json` + `.gsd-t/token-metrics.jsonl`. It never mutates either file.
5. **Stop threshold is 85%**: Hardcoded from `token-budget-contract` v3.0.0. The estimator's projected_end_pct is compared against 85%, not any other value.

## File boundaries

- **OWNED**: `bin/runway-estimator.js`, `.gsd-t/contracts/runway-estimator-contract.md`, `test/runway-estimator.test.js`
- **EDITED**: 5 command files (Step 0 wire-up)
- **READ ONLY**: `.gsd-t/.context-meter-state.json`, `.gsd-t/token-metrics.jsonl`
- **DO NOT TOUCH**: `bin/token-budget.js`, `bin/model-selector.js`, `bin/headless-auto-spawn.js` (coordinate via contract, not direct edits)

## Testing

- At least 20 unit tests
- Smoke test with fixture-set CTX_PCT
- Target: 941 baseline → ~1000 after this domain's tests land (other domains continue adding)

## Quality gates that cannot be skipped

- Red Team on T1 (the estimator's math directly controls whether M35's self-protection works)
- Red Team on T4 (command-file Step 0 wire-up — must not break existing flows)
