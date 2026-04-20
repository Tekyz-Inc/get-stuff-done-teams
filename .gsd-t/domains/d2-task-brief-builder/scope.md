# Domain: d2-task-brief-builder

## Responsibility
Turns a task-id + milestone context into a 2–5 KB self-contained prompt that a fresh `claude -p` worker can execute without reading the whole repo. Owns the brief template, stack-rules injection, and the contract that defines what a brief must contain.

## Owned Files/Directories
- `bin/gsd-t-task-brief.js` — public API: `buildTaskBrief({ milestone, domain, taskId, projectDir })` → string
- `bin/gsd-t-task-brief-template.cjs` — the prose envelope (preamble, constraints excerpt, contract excerpts, done-signal spec, stack rules)
- `bin/gsd-t-task-brief-compactor.cjs` — size budget enforcer; trims/compresses sections to stay under 5 KB while preserving correctness-critical facts
- `test/m40-task-brief.test.js` — unit tests: completeness, size budget, stack-rule injection, contract excerpt fidelity

## NOT Owned (do not modify)
- `templates/stacks/*.md` — D2 reads these; it does not own them
- `.gsd-t/domains/*/tasks.md` — D2 reads; planning phase (`gsd-t-plan`) writes
- `.gsd-t/contracts/*.md` — D2 excerpts these; it does not own them
- Prompt rendering for interactive (`gsd-t-execute`) — unchanged

## Brief Composition (per task)
Every brief MUST contain, in order:
1. **Preamble**: role, cwd, project name, milestone id, domain id, task id, expected branch.
2. **Task statement**: the tasks.md entry verbatim.
3. **Scope**: excerpt of owning domain's `scope.md` "Owned Files/Directories" + "NOT Owned".
4. **Constraints**: excerpt of owning domain's `constraints.md` — Must Follow + Must Not.
5. **Contract excerpts**: only the contract sections this task touches (not the whole contract).
6. **Stack rules**: auto-detected and injected via `bin/rule-engine.js`.
7. **Completion spec**: the exact done-signal from `.gsd-t/contracts/completion-signal-contract.md` (D3), rendered as a checklist.
8. **CWD invariant block**: same prose as M39's unattended supervisor fix.

Size budget: 2–5 KB total. Over 5 KB → compactor drops lowest-priority sections first (stack rules → contract excerpts beyond the task's scope → constraints beyond Must Not).

## Integration Points
- Called by: D1 orchestrator worker just before `claude -p` spawn.
- Reads: `.gsd-t/domains/{domain}/{scope,constraints}.md`, `.gsd-t/domains/{domain}/tasks.md`, `.gsd-t/contracts/*.md`, `CLAUDE.md`, `templates/stacks/*.md`.
