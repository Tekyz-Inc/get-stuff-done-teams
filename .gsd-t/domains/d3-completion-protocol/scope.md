# Domain: d3-completion-protocol

## Responsibility
Contract-only domain. Defines what "task done" means for an orchestrator worker: required artifacts (commit on expected branch, progress.md entry, clean test exit), how the orchestrator detects done vs failed, and the retry policy. No code ships from this domain — only the contract and an assertion helper.

## Owned Files/Directories
- `.gsd-t/contracts/completion-signal-contract.md` — **the** definition of done for an M40 worker
- `bin/gsd-t-completion-check.cjs` — pure function `assertCompletion({ taskId, projectDir, expectedBranch })` → `{ ok: boolean, missing: string[], details: {...} }`; reads git + progress.md + test exit to decide
- `test/m40-completion-protocol.test.js` — unit tests: happy path, each missing-artifact case, branch-mismatch case

## NOT Owned (do not modify)
- `bin/gsd-t-orchestrator*.js` (D1 — consumes `assertCompletion`, does not reimplement)
- `bin/gsd-t-task-brief*.cjs` (D2 — embeds the contract checklist in every brief)
- `.gsd-t/progress.md` (D3 reads; commands write)

## Done Signal (what workers must produce)
A worker task is DONE iff all of the following hold after the worker exits:
1. **Worker exit code == 0.**
2. **Git: at least one commit on the expected branch since task start**, authored by the repo's git user, whose message matches the task-id prefix convention (e.g., `m40/d1-t3: ...`).
3. **progress.md Decision Log has a new entry** dated today with the task-id and a brief note.
4. **Test suite exit code == 0** when the task file pattern applies (if task touches `bin/` or `scripts/`, `npm test` must pass; if task is docs-only, skip this check).
5. **No uncommitted changes** in owned scope (staged or unstaged in files claimed by the task).

Any of (1)–(5) missing → task is FAILED, not DONE.

## Retry Policy
- On FAILED: orchestrator MAY retry once with a fresh worker and an appended "previous attempt failed because: {details.missing[0]}" preamble to the brief.
- Second failure in the same task → halt the wave. Do NOT retry a third time silently.
- Timeout (SIGTERM/SIGKILL) → treat as FAILED with `missing: ["worker_exited_via_timeout"]`. Retry eligible.

## Integration Points
- Owned by D3.
- Consumed by: D1 (calls `assertCompletion` after each worker exit), D2 (excerpts the Done Signal section into every brief), D6 (on recovery, recomputes completion for in-flight tasks).
