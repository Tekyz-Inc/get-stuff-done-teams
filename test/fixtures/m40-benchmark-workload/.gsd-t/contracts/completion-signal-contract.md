# Completion Signal Contract — fixture copy

This is a fixture-local copy so `buildTaskBrief` can resolve the Done
Signal section without reaching into the parent repo.

## Done Signal (all must hold)

| # | Condition | How checked |
|---|-----------|-------------|
| 1 | Worker exit code == 0 | `child_process` exit |
| 2 | ≥1 new commit on expectedBranch | `git log` |
| 3 | progress.md Decision Log has a new entry for `{taskId}` | text scan |
| 4 | `npm test` exit code == 0 (unless skip-test) | `execSync` |
| 5 | No uncommitted changes in owned patterns | `git status` |
