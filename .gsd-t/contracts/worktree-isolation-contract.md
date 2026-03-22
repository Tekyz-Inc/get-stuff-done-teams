# Contract: Worktree Isolation

## Version: 1.0.0
## Status: DRAFT
## Owner: worktree-isolation domain
## Consumers: execute (team mode), wave, integrate commands

---

## Purpose

Defines the protocol for parallel domain execution using git worktrees, including lifecycle management, atomic merges, and rollback.

## Worktree Lifecycle

### Creation
Each domain agent is dispatched with `isolation: "worktree"` on the Agent tool:
```
Agent({
  prompt: "{domain execution prompt}",
  isolation: "worktree",
  ...
})
```
Claude Code creates a temporary git worktree automatically. The agent works on an isolated copy of the repo.

### Completion
When the agent completes:
- **Changes made**: Agent returns worktree path and branch name
- **No changes**: Worktree is automatically cleaned up

### Merge Protocol (Sequential)
```
1. Sort completed domains by dependency order
2. For each domain:
   a. Merge domain's worktree branch to main working tree
   b. Run integration tests
   c. If tests PASS → continue to next domain
   d. If tests FAIL → rollback this domain's merge, log failure, continue with remaining
3. Clean up all worktree branches
```

### Rollback
- Per-domain granularity: discard one domain's entire contribution
- Other domains' merges are preserved
- Rollback logged in Decision Log with reason

## Rules

1. Each domain gets exactly ONE worktree — no shared worktrees between domains
2. Merges are SEQUENTIAL with tests between each — never parallel merges
3. Contract validation runs between merges (verify domain didn't break other domains' contracts)
4. Graph used post-merge to validate no domain modified files outside its scope.md ownership
5. If a domain's merge causes test failures, its worktree is discarded and the failure is reported
6. Worktree cleanup is mandatory — no orphaned worktrees after execute completes

## File Ownership Validation

After each merge, check via graph:
- Files modified by the domain agent are within its scope.md file list
- No files owned by other domains were modified
- Shared files (if any) are explicitly listed in both domains' scopes

## Breaking Changes

Changes to the merge protocol order or rollback behavior are breaking. Bump version.
