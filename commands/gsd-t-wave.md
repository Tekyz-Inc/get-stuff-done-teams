# GSD-T: Wave — Full Cycle Orchestration

You are running a complete GSD-T cycle through all phases for the current milestone. This is the "just go" command — it runs partition → discuss → plan → impact → execute → test-sync → integrate → verify → complete-milestone in sequence, using teams where beneficial.

## Step 1: Load State

Read:
1. `CLAUDE.md`
2. `.gsd-t/progress.md`
3. All `.gsd-t/` files

Determine current status and resume from wherever the milestone left off.

## Step 2: Execute Remaining Phases

Work through each phase that hasn't been completed:

### INITIALIZED or DEFINED → Run Partition
- Decompose into domains with contracts
- Set status to PARTITIONED

### PARTITIONED → Run Discuss (if needed)
- If there are open architectural questions or multiple viable approaches: discuss
- If the path is clear (simple milestone, clear requirements): skip to plan
- Set status to DISCUSSED

### DISCUSSED → Run Plan
- Create atomic task lists per domain
- Map dependencies and checkpoints
- Set status to PLANNED

### PLANNED → Run Impact Analysis
- Analyze downstream effects of all planned changes
- Check for contract violations
- Trace dependencies and consumers
- Produce `.gsd-t/impact-report.md`

**Decision Gate:**
- If PROCEED: continue to execute
- If PROCEED WITH CAUTION: report items, continue if no user intervention
- If BLOCK: stop, add remediation tasks, require user decision

- Set status to IMPACT_ANALYZED

### IMPACT_ANALYZED → Run Execute
- **Auto-select mode**:
  - Count total independent starting tasks across domains
  - If 3+ domains with independent work AND teams are enabled: use team mode
  - Otherwise: solo mode
  
- **After each task:**
  - Run quick test-sync (affected tests only)
  - If test failures: pause and report
  - If all pass: continue

- Run through all tasks, respecting checkpoints
- Set status to EXECUTED

### EXECUTED → Run Full Test Sync
- Complete test coverage analysis
- Run all tests
- Generate/update test tasks if gaps found
- If critical test failures: add fix tasks, re-execute
- Set status to TESTS_SYNCED

### TESTS_SYNCED → Run Integrate
- Wire domains together
- Verify contract compliance at boundaries
- Run integration tests
- Set status to INTEGRATED

### INTEGRATED → Run Verify
- **Auto-select mode**:
  - If teams enabled and milestone is complex (3+ domains): team verify
  - Otherwise: solo verify
- Run quality gates across all dimensions
- Handle remediation if needed
- Set status to VERIFIED

### VERIFIED → Run Complete Milestone
- Archive milestone documentation to `.gsd-t/milestones/{name}/`
- Generate summary.md
- Clean working state for next milestone
- Create git tag
- Set status to COMPLETED

## Step 3: Phase Transitions

Between each phase:
1. Update `.gsd-t/progress.md`
2. Report brief status to user
3. If any phase produces findings that need user input, STOP and ask
4. If all clear, continue to next phase

Status messages:
```
✅ Partition complete — 3 domains defined, 4 contracts written
✅ Discuss complete — 2 design decisions logged
✅ Plan complete — 12 tasks across 3 domains
⚠️ Impact analysis found 2 items requiring attention — proceeding
✅ Execute complete — 12/12 tasks done
✅ Test sync — 8 tests affected, all passing, 1 gap noted
✅ Integrate complete — all domain boundaries wired
✅ Verify complete — all quality gates passed
✅ Milestone archived and tagged
```

## Step 4: Completion

When all phases are done:
```
═══════════════════════════════════════════════════════════════════════════════
✅ Milestone "{name}" complete!
═══════════════════════════════════════════════════════════════════════════════

📁 Archived to: .gsd-t/milestones/{name}-{date}/
🏷️  Tagged as: milestone/{name}

Summary:
- Domains: {list}
- Tasks completed: {N}
- Contracts: {N} defined/verified
- Tests: {N} added/updated
- Impact items addressed: {N}
- Decision log entries: {N}

Next steps:
- Push tag: git push origin milestone/{name}
- Start next: /user:gsd-t-milestone "{next}"
- View roadmap: /user:gsd-t-status
═══════════════════════════════════════════════════════════════════════════════
```

## Interruption Handling

If the user interrupts or the session needs to end:
1. Finish the current atomic task
2. Save all state to `.gsd-t/progress.md`
3. Note exactly where to resume: "{phase} — {domain} — Task {N}"
4. Report: "Paused at {location}. Run `/user:gsd-t-resume` to continue."

## Error Recovery

### If impact analysis blocks:
- Report blocking issues
- Generate remediation tasks
- Add to appropriate domain
- Ask: "Address blockers now, or pause?"
- If address: execute remediation tasks, re-run impact
- If pause: save state, exit

### If tests fail during execute:
- Pause execution
- Report failing tests
- Generate fix tasks
- Ask: "Fix now or continue?"
- If fix: execute fix tasks, re-run tests
- If continue: note failures, proceed (will catch in verify)

### If verify fails:
- Report failures
- Generate remediation tasks
- Do NOT run complete-milestone
- Ask: "Address issues now?"
- If yes: execute remediation, re-run verify
- If no: save state with VERIFY_FAILED status

## Workflow Visualization

```
┌─────────┐   ┌─────────┐   ┌──────┐   ┌────────┐   ┌─────────┐
│PARTITION│ → │ DISCUSS │ → │ PLAN │ → │ IMPACT │ → │ EXECUTE │
└─────────┘   └─────────┘   └──────┘   └────────┘   └────┬────┘
                                            │            │
                                         BLOCK?      test-sync
                                            ↓         after each
                                        remediate        task
                                            │            │
┌──────────┐   ┌────────┐   ┌───────────┐   │   ┌────────┴────────┐
│ COMPLETE │ ← │ VERIFY │ ← │ INTEGRATE │ ← └── │ FULL TEST-SYNC  │
└──────────┘   └────────┘   └───────────┘       └─────────────────┘
     │
     ↓
  archive
  git tag
```

$ARGUMENTS
