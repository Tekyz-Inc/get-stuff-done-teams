# Milestone Complete: M30 — Stack Rules Engine

**Completed**: 2026-03-24
**Duration**: 2026-03-24 → 2026-03-24
**Status**: VERIFIED

## What Was Built

Execute-time stack detection and best practice enforcement for all subagent-spawning commands. The system automatically detects the project's tech stack from manifest files (package.json, go.mod, Cargo.toml, etc.) and injects mandatory best practice rules into every subagent prompt. A universal security template (`_security.md`) is always injected regardless of detected stack. Stack-specific templates (react.md, typescript.md, node-api.md) inject when the matching stack is detected. QA subagents receive and enforce the same rules — violations are task failures, not warnings. Adding a new stack = dropping a `.md` file in `templates/stacks/` with no code changes.

## Domains

| Domain              | Tasks Completed | Key Deliverables                                                                    |
|---------------------|-----------------|-------------------------------------------------------------------------------------|
| stack-templates     | 3               | `_security.md` (OWASP Top 10, XSS, prompt injection), `react.md`, `typescript.md`, `node-api.md` |
| command-integration | 4               | Stack detection block in execute/quick/integrate/wave/debug; QA enforcement; 135 new tests; README/GSD-T-README/CLAUDE-global/gsd-t-help updated |

## Contracts Defined/Updated

- `stack-rules-contract.md`: new — detection protocol, template convention, prompt injection format, QA enforcement
- `integration-points.md`: updated — M30 dependency graph, 2 waves, 2 checkpoints

## Key Decisions

- Universal template prefix convention: `_` prefix = always injected; no prefix = stack-specific
- Detection runs at subagent spawn time (not at init/setup) — purely additive, never blocks execution
- Stack rule violations have same enforcement weight as contract violations (task failure, not warning)
- `_security.md` is 243 lines (over 200-line guideline) — accepted as universal security requires comprehensive coverage
- Extensible by file drop: new stacks require zero code changes to the detection engine

## Issues Encountered

None — all 7 tasks completed without rework cycles. No fix cycles required.

## Test Coverage

- Tests added: 135 (test/stack-rules.test.js)
- Tests updated: 0
- Total passing: 672/672
- Coverage: stack detection logic, template matching, injection format, QA enforcement, resilience (malformed package.json, missing stacks dir)

## Git Tag

`v2.48.10`

## Files Changed

**New files:**
- `templates/stacks/_security.md`
- `templates/stacks/react.md`
- `templates/stacks/typescript.md`
- `templates/stacks/node-api.md`
- `test/stack-rules.test.js`

**Modified files:**
- `commands/gsd-t-execute.md` — stack detection block added
- `commands/gsd-t-quick.md` — stack detection block added
- `commands/gsd-t-integrate.md` — stack detection block added
- `commands/gsd-t-wave.md` — stack detection block added
- `commands/gsd-t-debug.md` — stack detection block added
- `README.md` — Stack Rules Engine feature documented
- `GSD-T-README.md` — stack-rules command reference updated
- `templates/CLAUDE-global.md` — stack rules conventions added
- `commands/gsd-t-help.md` — stack rules described
- `CLAUDE.md` — stack rules conventions added
- `.gsd-t/contracts/stack-rules-contract.md` — new contract
- `.gsd-t/contracts/integration-points.md` — updated

## Process Metrics

- ELO: N/A (no historical task-metrics baseline — first execution of stack rules feature)
- First-pass rate: 100% (7/7 tasks, 0 fix cycles)
- Tests: 672/672 pass (135 new)
- Distillation: No repeating failure patterns found
- Rule engine: No rules fired, no patches generated
- Quality budget: PASS (0% rework)
