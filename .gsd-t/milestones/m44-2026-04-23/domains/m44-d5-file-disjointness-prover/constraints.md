# Constraints: m44-d5-file-disjointness-prover

## Hard Rules

1. Unprovable is always safe. When touch-list cannot be determined, the task falls back to sequential. NEVER assume disjointness.
2. D5 is read-only on all domain artifacts. It never writes to tasks.md or scope.md. Its only write surface is appending fallback events to `.gsd-t/events/YYYY-MM-DD.jsonl`.
3. D5 never throws for overlap or unprovable cases — it returns a result object. The caller (D2) decides what to do with sequential and unprovable tasks.
4. Git history fallback MUST be bounded. Maximum `git log --name-only -n 100` to prevent runaway I/O on large repos. If no match found within the limit, mark as unprovable.
5. D5 checks WRITE targets only. Read-only file access (Read tool calls) does not create a disjointness conflict. Only files that a task is expected to WRITE (modify, create, delete) are checked.
6. Zero external runtime dependencies. Git is available as a system tool; use `child_process.execSync` with a try/catch wrapper.
7. The `file-disjointness-contract.md` MUST be created in D5-T1 (skeleton) and finalized in D5-T2.

## Mode Awareness

D5 is **mode-agnostic**. The same `proveDisjointness` function is called identically in both modes. What D2 does with sequential/unprovable tasks differs by mode, but D5 does not know or care about mode.

## Tradeoffs Acknowledged

- Scope.md "Files Owned" is a domain-level list, not a per-task list. A domain with 10 files owned will show all 10 files in the touch-list for EVERY task in that domain, causing many false sequential fallbacks. This is the correct conservative behavior — safe over fast. The fix is explicit `touches:` fields on tasks (improvement for a future quick task or M45).
- Git history heuristic is inherently fuzzy. A task named "M44-D2-T3" might match prior tasks named similarly, or might not match anything. Marking as unprovable (sequential) in the no-match case is always correct.

## Out-of-scope clarifications

- D5 does NOT check whether two tasks in the same domain conflict. Same-domain tasks are never parallelized in M44 (domains serialize internally; only cross-domain parallelism is in scope).
- D5 does NOT check file locks or OS-level file state. It is a static analysis tool operating on declared touch-lists.
