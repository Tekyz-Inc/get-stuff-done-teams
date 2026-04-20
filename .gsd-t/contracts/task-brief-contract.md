# Task Brief Contract — v1.0.0

**Milestone**: M40 — External Task Orchestrator
**Owner**: d2-task-brief-builder
**Consumers**: d1-orchestrator-core, d0-speed-benchmark

## Purpose
Defines the per-task prompt string that a fresh `claude -p` worker receives. Briefs are self-contained: the worker starts with no prior context and must complete the task from the brief alone.

## API

```js
buildTaskBrief({
  milestone: "M40",        // milestone id
  domain: "d1-orchestrator-core",
  taskId: "d1-t3",         // tasks.md entry id
  projectDir: "/abs/path", // orchestrator cwd
  expectedBranch: "main"   // branch worker must commit on
}) → string                // 2000–5000 bytes
```

Deterministic: same inputs → byte-identical output.

## Required Sections (in order)

| # | Section | Source | Non-droppable |
|---|---------|--------|---------------|
| 1 | Preamble | computed | YES |
| 2 | Task statement | tasks.md entry verbatim | YES |
| 3 | Scope excerpt | domain scope.md Owned + NOT Owned | YES |
| 4 | Constraints excerpt | domain constraints.md Must Follow + Must Not | YES |
| 5 | Contract excerpts | only contracts listed in tasks.md `contracts:` field | NO (drop low-priority) |
| 6 | Stack rules | bin/rule-engine.js output | NO |
| 7 | Completion spec | completion-signal-contract.md Done Signal checklist | YES |
| 8 | CWD invariant | fixed prose | YES |

## Preamble Template

```
You are a GSD-T orchestrator worker. You have ONE task. You will not be asked to do anything else.

Project: {projectName}
Milestone: {milestone}
Domain: {domain}
Task: {taskId}
Expected branch: {expectedBranch}
Project dir: {projectDir}

Operate under --dangerously-skip-permissions. Be autonomous. Do not ask questions. Commit your work on the expected branch before exiting.
```

## CWD Invariant Block (required verbatim)

```
# CWD Invariant
As your FIRST bash action, run: `pwd`
If the output does not equal {projectDir}, STOP and fail fast. Do not proceed.
If you must `cd` into a subdirectory, do it inside a subshell `(cd ... && ...)` so the parent cwd is preserved.
```

## Size Budget
- Target 2 KB; hard max 5 KB.
- Over budget → compactor drops sections in this order: stack rules (6) → contract excerpts (5) → constraints beyond Must Not (4). Sections 1,2,3 (Must Follow only),7,8 are non-droppable.
- If non-droppable sections alone exceed 5 KB → throw. Author must trim the task statement or split the task.

## Versioning
- Bump minor for new sections or new required fields.
- Bump major for changes to Done Signal semantics (also requires D3 contract bump).
