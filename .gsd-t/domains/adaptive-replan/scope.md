# Domain: adaptive-replan

## Purpose
After each domain completes during execute, check whether execution revealed new constraints that invalidate remaining domains' plans. Revise plans on disk before dispatching next domain.

## Owned Files
- `commands/gsd-t-execute.md` (post-domain replan check)
- `commands/gsd-t-wave.md` (execute phase replan integration)

## Key Responsibilities
1. Post-domain summary reader: extract constraints/findings from completed domain's summary
2. Constraint-vs-remaining-plan checker: compare findings against remaining domains' tasks.md
3. Plan revision: write updated tasks.md to disk for affected domains
4. Replan cycle guard: max 2 replan cycles per execute run
5. Log all replan decisions to Decision Log

## Contracts Consumed
- domain-structure.md (tasks.md format)
- graph-query-contract.md (assess which domains are affected by new constraints)
- fresh-dispatch-contract.md (summary format from completed domains)

## Contracts Produced
- adaptive-replan-contract.md

## Constraints
- Orchestrator stays lightweight: only reads summaries (~500 tokens each), not full domain context
- Max 2 replan cycles per execute run — after that, pause for user
- Plan revision writes updated tasks.md to disk (next domain reads from disk in fresh context)
- Replan decisions logged in progress.md Decision Log
- Must not break existing execute flow — additive enhancement
