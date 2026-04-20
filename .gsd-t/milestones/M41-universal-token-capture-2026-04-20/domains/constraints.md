# Constraints: doc-ripple-agent

## Must Follow
- Zero external dependencies — pure markdown command file
- Follow existing GSD-T command file conventions (Step-numbered workflow, $ARGUMENTS, Auto-Clear)
- Include OBSERVABILITY LOGGING block (per CLAUDE.md Observability Logging section)
- Threshold logic must be deterministic — same git diff always produces the same fire/skip decision
- Manifest must be human-readable markdown (not JSON) for audit trail

## Must Read Before Using
- .gsd-t/contracts/pre-commit-gate.md — the checklist items that define what docs need updating
- .gsd-t/contracts/fresh-dispatch-contract.md — the dispatch pattern for spawning parallel subagents
- commands/gsd-t-execute.md — reference for how existing commands spawn subagents and log observability
- commands/gsd-t-qa.md — reference for how QA agent is structured (similar dedicated-agent pattern)

## Must Not
- Modify files outside owned scope (especially the 5 integration target command files)
- Replace the Pre-Commit Gate — doc-ripple supplements it, doesn't replace it
- Auto-commit changes — doc-ripple updates files, the lead agent commits
- Fire on every change regardless of scope — threshold logic must skip trivial changes
- Modify source code files — doc-ripple only touches documentation/contract/template files

## Dependencies
- Depends on: git (runtime — reads git diff for blast radius)
- Depends on: pre-commit-gate.md (reference — cross-references checklist items)
- Depended on by: command-integration domain (consumes the command file and contract)
