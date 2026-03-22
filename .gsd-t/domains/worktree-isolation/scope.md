# Domain: worktree-isolation

## Purpose
Enable parallel domain agents to work in isolated git worktrees via the Agent tool's `isolation: "worktree"` parameter. Implement atomic sequential merges with contract validation between each.

## Owned Files
- `commands/gsd-t-execute.md` (team mode worktree dispatch)
- `commands/gsd-t-wave.md` (parallel execution phase worktree dispatch)
- `commands/gsd-t-integrate.md` (merge protocol)

## Key Responsibilities
1. Agent tool `isolation: "worktree"` integration in execute team mode dispatch
2. Sequential merge protocol: merge domain A → test → merge domain B → test
3. Per-domain rollback: discard one domain's worktree without affecting others
4. Worktree cleanup: automatic cleanup after all merges (or on failure)
5. Contract validation between merges

## Contracts Consumed
- domain-structure.md (domain boundaries)
- graph-query-contract.md (file ownership validation)
- pre-commit-gate.md

## Contracts Produced
- worktree-isolation-contract.md

## Constraints
- Must use Claude Code's existing Agent tool `isolation: "worktree"` — no custom worktree management
- Merges are sequential, not parallel (to enable testing between each)
- If merge fails integration tests, only that domain's worktree is discarded
- Graph used to validate no domain agent modified files outside its ownership
