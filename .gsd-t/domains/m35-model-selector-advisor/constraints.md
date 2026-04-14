# Constraints: m35-model-selector-advisor

## Hard constraints

1. **Sonnet is default routine**: User confirmed during M34 complete-milestone gate. Do not second-guess this.
2. **Opus is surgical, not default**: Reserved for high-stakes reasoning (partition, discuss, Red Team, verify judgment, debug root-cause, architecture, contract design).
3. **Haiku is mechanical only**: Test runners, branch guards, file existence checks, JSON validation, token-count bracket calls themselves. Never for reasoning tasks.
4. **Escalation via /advisor**: Not via model swap mid-phase. The sonnet-default phase invokes `/advisor` at a declared checkpoint and the advisor consults opus.
5. **Graceful degradation**: If /advisor is unavailable at runtime, the caller proceeds at the assigned model and logs a missed escalation. No hard crash, no block.
6. **Dual-layer preserved**: Global `ANTHROPIC_MODEL=opus` stays for user-initiated sessions so the user always talks to the strongest model. GSD-T subagent spawns override per-phase via `model:` directive.

## File boundaries

- **OWNED**: `bin/model-selector.js`, `bin/advisor-integration.js`, `test/model-selector.test.js`, `test/advisor-integration.test.js`, `.gsd-t/contracts/model-selection-contract.md`, `.gsd-t/M35-advisor-findings.md`
- **EDITED (sweep)**: 11 command files for Model Assignment blocks, 2 CLAUDE templates
- **DO NOT TOUCH**: `bin/token-budget.js`, `bin/runway-estimator.js`, `bin/token-telemetry.js`

## Testing

- ~25 new unit tests (15 for model-selector, 10 for advisor-integration)
- Integration test: run `execute` on a sample task, verify the declared model tier appears in `.gsd-t/token-log.md`

## Quality gates that cannot be skipped

- Red Team on T2 (model-selector.js is foundational and its mappings affect every future spawn)
- Red Team on T3 (advisor-integration fallback must actually work)
- Doc-ripple on T5 (11 command files touched)
