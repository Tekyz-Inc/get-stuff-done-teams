# Constraints: command-integration

## Must Follow
- Command files are pure markdown — no frontmatter, step-numbered workflow
- All commands accept $ARGUMENTS at the end
- Additions to command files must be additive — do not remove or rename existing steps
- New steps use integer numbering (no fractional step numbers — project convention)
- Any step that spawns a Task subagent MUST include the OBSERVABILITY LOGGING block
- Quality budget governance is non-blocking by default — it triggers warnings and constraint tightening, not hard stops
- Rule injection into subagent prompts must be concise (max 10 lines of injected rules)
- Pre-mortem output must be non-blocking — informs task design, does not prevent planning

## Must Not
- Modify files outside owned scope (especially bin/*.js and .gsd-t/metrics/)
- Remove or rename existing steps in command files
- Add external dependencies
- Make quality budget governance a hard blocker (it tightens constraints, doesn't stop execution)
- Inject more than 10 lines of rule context into subagent prompts (token efficiency)

## Must Read Before Using
- `commands/gsd-t-execute.md` — understand existing pre-flight and pre-task steps (M25)
- `commands/gsd-t-plan.md` — understand existing pre-mortem step (M25)
- `commands/gsd-t-complete-milestone.md` — understand existing distillation step (M14) and rollup step (M25)
- `bin/rule-engine.js` — understand API for active rule queries (created by rule-engine domain)
- `bin/patch-lifecycle.js` — understand API for patch operations (created by patch-lifecycle domain)
- `.gsd-t/contracts/rule-engine-contract.md` — canonical schemas and APIs

## Dependencies
- Depends on: rule-engine for active rule queries (getActiveRules, matchRules)
- Depends on: patch-lifecycle for patch operations (createCandidate, checkPromotionGate, graduate)
- Depends on: M25 metrics-collection for pre-flight warnings (existing)
- Depends on: M25 metrics-rollup for rollup data (existing)
- Depended on by: none (command files are leaf consumers)
