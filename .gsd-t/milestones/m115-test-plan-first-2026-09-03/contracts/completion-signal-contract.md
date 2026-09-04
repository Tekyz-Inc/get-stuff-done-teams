# Completion Signal Contract — v1.0.0

**Milestone**: M40 — External Task Orchestrator
**Owner**: d3-completion-protocol
**Consumers**: d1-orchestrator-core, d2-task-brief-builder, d6-recovery-and-resume

## Purpose
Defines what "task done" means for an M40 orchestrator worker. The orchestrator uses this signal to decide: keep going, retry, or halt the wave.

## Done Signal (all must hold)

A task is DONE iff all five conditions are true when the worker exits:

| # | Condition | How checked |
|---|-----------|-------------|
| 1 | Worker exit code == 0 | `child_process` exit |
| 2 | ≥1 new commit on `expectedBranch`, message matches `^{taskId}(\b|:)` | `git log {branch} --since {taskStart}` |
| 3 | progress.md Decision Log has a new entry matching `^- YYYY-MM-DD HH:MM.*{taskId}` | text scan |
| 4 | `npm test` exit code == 0 (unless `skip-test: true` in tasks.md) | `execSync('npm test')` |
| 5 | No uncommitted changes in task's owned file patterns | `git status --porcelain` filtered |

Any failing → FAILED (not DONE).

## API

```js
assertCompletion({
  taskId,           // "d1-t3"
  projectDir,       // abs path
  expectedBranch,   // "main"
  taskStart,        // ISO timestamp
  skipTest,         // bool, from tasks.md
  ownedPatterns     // glob[], from domain scope.md
}) → {
  ok: boolean,
  missing: string[],  // e.g., ["no_commit_on_branch", "no_progress_entry"]
  details: {
    exitCode?: number,
    commits?: string[],
    progressEntry?: string,
    testOutput?: string,
    uncommitted?: string[]
  }
}
```

Pure function (no shared state). `missing[]` lists ALL failures, not the first — operators need full picture.

## Retry Policy

| Scenario | Action |
|----------|--------|
| First FAILED | Retry once with "previous attempt failed: {missing[0]}" appended to brief |
| Second FAILED (same task) | Halt wave; do NOT retry silently |
| Timeout (SIGTERM/SIGKILL) | Treat as FAILED with `missing: ["worker_exited_via_timeout"]`; retry eligible |
| Exit 0 but missing[2..5] | FAILED; retry eligible |

## Non-Goals
- This contract does NOT define HOW the worker produces the signals — that's the worker's job.
- This contract does NOT govern QA/red-team/design-verify — those are separate (see qa-agent-contract.md).
- This contract does NOT replace `gsd-t-verify`. Verify is milestone-level; this is per-task.

## Versioning
- Bump major for condition additions/removals. Bump minor for details field changes.
