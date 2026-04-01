# Domain: qa-calibrator

## Responsibility
QA miss-rate tracking, category aggregation, weak-spot detection, and dynamic QA prompt injection to close the Red Team → QA feedback loop.

## Files Owned
- `bin/qa-calibrator.js` — miss-rate aggregation, weak-spot detection, prompt injection helper

## Files Touched (shared)
- `commands/gsd-t-execute.md` — inject weak spots into QA subagent prompt
- `commands/gsd-t-quick.md` — same injection for inline QA
- `commands/gsd-t-integrate.md` — same injection for integration QA
- `bin/metrics-rollup.js` — incorporate QA miss rates into ELO calculation
- `templates/CLAUDE-global.md` — document QA calibration in QA Agent section

## Constraints
- Zero external dependencies (Node.js built-ins only)
- JSONL format for qa-miss-log.jsonl
- Weak spot threshold: >30% miss rate per category
- Damping: changes only after 3+ milestones of consistent signal
- Categories: contract-violation, boundary-input, state-transition, error-path, missing-flow, regression, e2e-gap
