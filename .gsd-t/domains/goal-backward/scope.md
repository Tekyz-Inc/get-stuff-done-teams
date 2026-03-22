# Domain: goal-backward

## Purpose
Add post-gate behavior verification that checks whether milestone goals are actually achieved end-to-end, catching placeholder implementations that pass all structural quality gates.

## Owned Files
- `commands/gsd-t-verify.md` (add goal-backward verification step)
- `commands/gsd-t-complete-milestone.md` (add goal-backward check before completion)
- `commands/gsd-t-wave.md` (verification phase enhancement)

## Key Responsibilities
1. Requirement-to-behavior verifier: read milestone goals, verify each exists end-to-end
2. Placeholder detector: scan for console.log, TODO, hardcoded returns, static UI, stub implementations
3. End-to-end behavior check: verify from user perspective (click button → expected result)
4. Report findings as blocking issues (must be resolved before milestone completion)

## Contracts Consumed
- pre-commit-gate.md
- graph-query-contract.md (trace requirement → code path → behavior)

## Contracts Produced
- goal-backward-contract.md

## Constraints
- Runs AFTER all 8 quality gates pass (additive, not replacement)
- Scope to critical requirements only — skip trivial tasks
- Must use graph to trace requirement → code path → behavior chain
- Findings are blocking — milestone cannot complete until resolved or user overrides
