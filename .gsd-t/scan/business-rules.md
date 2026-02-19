# Business Rules — 2026-02-18 (Scan #6, Post-M10-M13)

## Scan Context
Package: @tekyzinc/gsd-t v2.28.10
Previous scan: #5 at v2.24.4
Focus: New business rules introduced by M10-M13

---

## QA Agent Dispatch Rules (M10)

### Which phases spawn QA and how:
| Phase | QA Behavior |
|-------|-------------|
| partition | Removed (was spawning unnecessarily) |
| plan | Removed (was spawning unnecessarily) |
| execute | Task subagent spawned after each task |
| test-sync | Inline contract testing (no separate agent) |
| verify | Inline full audit |
| complete-milestone | Inline final gate check |
| quick | Inline (no separate QA agent) |
| debug | Inline (no separate QA agent) |
| integrate | Task subagent |
| wave | QA handled by each phase agent |

### Rule: QA failure blocks phase completion
- Lead cannot proceed until QA reports PASS or user overrides with explicit approval
- Source: qa-agent-contract.md, gsd-t-qa.md

### Undocumented: QA contract still lists "partition" and "plan" as phases
The qa-agent-contract.md Output table still lists partition and plan as phases that produce output. In practice (post-M10), partition and plan no longer spawn QA. Contract is stale (see contract-drift.md).

---

## Subagent Self-Spawn Rules (M10)

### Rule: Step 0 pattern for standalone commands
Commands quick, debug, scan, health must spawn themselves as Task subagents when directly invoked:
1. Check if already running as subagent (prompt says "starting at Step 1" or "Skip Step 0")
2. If not subagent: spawn fresh Task subagent, wait, relay output, stop
3. If subagent: continue from Step 1

### Undocumented: "How to detect" is ambiguous
The detection mechanism ("if prompt says 'starting at Step 1'") relies on the orchestrating agent correctly instructing the subagent to skip Step 0. No formal detection contract. Risk: infinite spawn loops if the prompt doesn't match expected text.

---

## Deviation Rules (M11)

### Rule: 4-rule protocol applies to execute, quick, debug
When executor encounters unexpected situations:
1. Bug blocking progress → fix, max 3 attempts. If unresolved after 3: log to deferred-items.md, move on
2. Missing functionality clearly required → add minimum code to unblock, note in commit
3. Blocker (missing file, wrong API) → fix and continue, log if non-trivial
4. Architectural change required → STOP. Apply Destructive Action Guard. Never self-approve.

### Rule: 3-attempt limit is hard
Stop attempting any fix after 3 failures. Add to .gsd-t/deferred-items.md. Continue to next task.

### Undocumented: Team mode Deviation Rules
execute.md team mode section mentions Deviation Rules but the instructions to teammates omit the specific 3-attempt limit. Teammate instructions say "(1) Bug blocking progress → fix, 3 attempts max" — abbreviated vs. the full solo rules. Risk of teammates not creating deferred-items.md entries.

---

## Per-Task Commit Rules (M11)

### Rule: Commit immediately after each task in execute
Format: `feat({domain}/task-{N}): {description}`
- Do NOT batch commits at phase end
- Applies to both solo and team mode
- Run Pre-Commit Gate checklist before each commit

### Undocumented: Wave mode team commits
When wave spawns a team of phase agents, each agent handles its own commits. The wave spot-check verifies "at least one commit per task completed" after execute. But the wave-phase-sequence contract does not specify per-task commit format or requirements.

---

## Wave Spot-Check Rules (M11)

### Rule: After each phase, wave performs 3-field spot-check
1. Status check: read progress.md, verify status matches expected phase completion
2. Git check: run git log --oneline -5, verify commits made during phase
3. Filesystem check: verify key output files exist on disk

### Rule: Discrepancy handling
If spot-check fails: re-spawn phase agent once, re-verify. If still failing: stop and report to user.

---

## CONTEXT.md Fidelity Rules (M12)

### Rule: Every Locked Decision must map to at least one task
- discuss creates .gsd-t/CONTEXT.md with Locked Decisions
- plan reads CONTEXT.md and MUST map every Locked Decision to a task
- Plan cannot proceed if any Locked Decision is unmapped
- plan validation checker (Task subagent) enforces this

### Rule: Deferred Ideas must NOT be implemented
Plan must not implement anything in the "Deferred Ideas" section of CONTEXT.md.

### Rule: Plan validation checker runs up to 3 iterations
If validation fails: fix gaps, re-validate. Stop after 3 iterations — report gaps to user.

### Undocumented: CONTEXT.md lifecycle
CONTEXT.md is created by discuss and consumed by plan, but:
- Not deleted after plan phase completes
- Not checked by gsd-t-health
- If discuss is skipped (wave structured-skip), CONTEXT.md is never created — plan must handle missing CONTEXT.md gracefully (plan.md Step 1 says "if CONTEXT.md exists" — handled)
- Accumulates across milestones unless manually deleted

---

## Continue-Here File Rules (M13)

### Rule: /pause creates .gsd-t/continue-here-{timestamp}.md
Contains: milestone, phase, version, last completed action, next action, open items, user note.

### Rule: /resume reads most recent continue-here file
Identified by highest timestamp. After reading, deletes the file.

### Undocumented: Multiple continue-here files
If user runs /pause multiple times without /resume, multiple files accumulate. Resume reads most recent — older files are orphaned indefinitely. No cleanup, no warning.

---

## Health Repair Rules (M13)

### Rule: --repair creates missing files from templates
Repairs MISSING items only. Does NOT repair INVALID items (e.g., empty contracts, bad status values).

### Rule: Domain repair
Creates minimal scope.md and tasks.md for any domain directory missing them.

### Undocumented: Template paths not validated
--repair assumes templates/ exist relative to the installed command file location. If the package was partially installed, template reads may fail silently.

---

## Validation Rules

### stateGet/stateSet (gsd-t-tools.js)
- stateGet: key existence validated via regex match on progress.md
- stateSet: key existence validated; value is injected raw into file with no sanitization
- Risk: multiline value in stateSet corrupts progress.md markdown structure (see security.md)

### validate() in gsd-t-tools.js
Checks presence of: .gsd-t/progress.md, .gsd-t/contracts, .gsd-t/domains, CLAUDE.md
Does NOT check: backlog.md, backlog-settings.md, docs/ directory, docs/*.md files
Narrower than gsd-t-health.md's checks (health checks 12 items; validate() checks 4).

---

## Undocumented Rules (logic with no comments or docs)

| File | Location | What it does | Risk if changed |
|------|----------|--------------|-----------------|
| gsd-t-tools.js | findProjectRoot() | Falls back to cwd if no .gsd-t found — silent failure | Operations in wrong directory |
| gsd-t-tools.js | stateSet() | Writes value to progress.md with no newline sanitization | Markdown structure corruption |
| gsd-t-tools.js | templateScope/Tasks | domain arg used directly in path.join — no traversal check | Arbitrary file read outside .gsd-t/domains/ |
| gsd-t-resume.md | Step 2 | Deletes continue-here file after reading | Loses checkpoint if resume fails mid-way |
| gsd-t-pause.md | Step 5 | Explicitly does NOT auto-continue after creating file | User intent: pause = stop; "and continue" = continue |
