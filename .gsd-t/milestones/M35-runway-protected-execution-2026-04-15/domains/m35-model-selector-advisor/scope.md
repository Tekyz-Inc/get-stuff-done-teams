# Domain: m35-model-selector-advisor

## Milestone: M35
## Status: DEFINED
## Wave: 1 (task 1), 2 (tasks 2-6)

## Purpose

Default routine phases to `sonnet`. Escalate to `opus` surgically at decision points that need heavy reasoning, via the Claude Code `/advisor` tool (or convention-based fallback if /advisor isn't programmable).

## Why this domain exists

M35's core principle: model selection is explicit per phase, not runtime-overridden. Sonnet is strong enough for routine GSD-T work (execute step 2, test-sync, doc-ripple, quick tasks, integrate wiring). Opus is reserved for high-stakes reasoning: partition, discuss, Red Team, verify judgment, debug root-cause, complex architecture, contract design. The user confirmed sonnet as default routine model during M34 complete-milestone.

## Files in scope

- `bin/model-selector.js` — NEW module with `selectModel({phase, task_type, domain_type, complexity_signals})`
- `bin/advisor-integration.js` — NEW module wrapping `/advisor` invocation (or convention-based fallback)
- `.gsd-t/contracts/model-selection-contract.md` → v1.0.0 NEW
- `test/model-selector.test.js` — NEW (~15 tests)
- `test/advisor-integration.test.js` — NEW (~10 tests)
- Command files — add `## Model Assignment` block at top:
  - `commands/gsd-t-execute.md`
  - `commands/gsd-t-wave.md`
  - `commands/gsd-t-quick.md`
  - `commands/gsd-t-integrate.md`
  - `commands/gsd-t-debug.md`
  - `commands/gsd-t-partition.md`
  - `commands/gsd-t-discuss.md`
  - `commands/gsd-t-plan.md`
  - `commands/gsd-t-verify.md`
  - `commands/gsd-t-test-sync.md`
  - `commands/gsd-t-doc-ripple.md`
- `templates/CLAUDE-global.md` — new "Model Assignment Block" convention + dual-layer documentation (global ANTHROPIC_MODEL vs per-phase overrides)
- `templates/CLAUDE-project.md` — same

## Files NOT in scope

- `bin/token-budget.js` — m35-degradation-rip-out owns that file
- `bin/runway-estimator.js` — m35-runway-estimator
- Token telemetry — m35-token-telemetry

## Dependencies

- **Depends on**: m35-degradation-rip-out (must land the three-band shape first; Task 1 of this domain can run in Wave 1 parallel as an investigation-only task with no file edits)
- **Blocks**: m35-docs-and-tests (docs must reference the contract); optimization-backlog (reads model assignments to detect demotion candidates)

## Acceptance criteria

1. `bin/model-selector.js` exists with at least 3 tiers (haiku/sonnet/opus) and at least 8 phase mappings
2. `bin/advisor-integration.js` exists with a clear programmable-or-convention path based on Task 1's open-question resolution
3. `.gsd-t/contracts/model-selection-contract.md` at v1.0.0 — tier definitions, selection criteria, escalation hook pattern, /advisor fallback behavior
4. Every listed command file has a `## Model Assignment` block at the top (declarative, not buried in prose)
5. Both CLAUDE templates document the convention and the dual-layer model (global env var stays opus for user sessions; GSD-T subagent spawns override per-phase)
6. Unit tests pass for model-selector mappings and advisor-integration fallback behavior
7. An `execute` run on a sample task logs the declared model tier to `.gsd-t/token-log.md` (pre-E) and eventually to `.gsd-t/token-metrics.jsonl` (post-E)
