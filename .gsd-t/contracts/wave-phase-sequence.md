# Contract: Wave Phase Sequence

## Owner
GSD-T framework (gsd-t-wave is the orchestrator)

## Consumers
gsd-t-wave, gsd-t-resume, gsd-t-status, gsd-t-complete-milestone, all phase commands

## Phase Sequence

Phases execute in this fixed order. No phase may be skipped except Discuss (see below).

```
PARTITION → DISCUSS → PLAN → IMPACT → EXECUTE → TEST-SYNC → INTEGRATE → VERIFY → COMPLETE
```

### Visual Flow
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
```

## Phase Definitions

| # | Phase | Command | Status Set | Purpose |
|---|-------|---------|------------|---------|
| 1 | Partition | gsd-t-partition | PARTITIONED | Decompose into domains + contracts |
| 2 | Discuss | gsd-t-discuss | DISCUSSED | Multi-perspective design exploration |
| 3 | Plan | gsd-t-plan | PLANNED | Create atomic task lists per domain |
| 4 | Impact | gsd-t-impact | IMPACT_ANALYZED | Analyze downstream effects |
| 5 | Execute | gsd-t-execute | EXECUTED | Run tasks (solo or team) |
| 6 | Test Sync | gsd-t-test-sync | TESTS_SYNCED | Full test coverage alignment |
| 7 | Integrate | gsd-t-integrate | INTEGRATED | Wire domains together |
| 8 | Verify | gsd-t-verify | VERIFIED | Run quality gates |
| 9 | Complete | gsd-t-complete-milestone | COMPLETED | Archive + git tag |

## Transition Rules

### Forward-Only
Phases proceed in order. Each phase sets its status in `progress.md` upon completion. The next phase reads the status to confirm the prerequisite phase completed.

### Skippable: Discuss
Discuss is the ONLY skippable phase. Uses a structured 3-condition check (M7):
1. Single domain (no cross-domain design questions)
2. No open questions in the Decision Log
3. All cross-domain contracts already exist

When all 3 conditions are met, skip is automatic. When skipped, transition directly: PARTITIONED → PLANNED (gsd-t-plan runs after partition).

### Decision Gates

**Impact Analysis Gate** (between IMPACT_ANALYZED and EXECUTE):
| Verdict | Action |
|---------|--------|
| PROCEED | Continue to execute |
| PROCEED WITH CAUTION | Report items, continue if no user intervention |
| BLOCK | Stop, add remediation tasks, require user decision |

**Verify Gate** (between VERIFIED and COMPLETE):
- All quality gates must pass
- If VERIFY_FAILED: remediate and re-verify (up to 2 attempts)
- Milestone cannot complete without VERIFIED status (unless `--force`)

**Gap Analysis Gate** (within Complete, before archival):
- Requirements gap analysis against milestone deliverables
- Must reach 100% Implemented for scoped requirements
- Auto-fix cycles (up to 2) before blocking

### Error Recovery
| Failure Point | Recovery |
|---------------|----------|
| Impact BLOCK | Add remediation tasks, re-run impact |
| Test failures during execute | Pause, generate fix tasks, re-run (2 attempts) |
| Verify failure | Remediate, re-run verify (2 attempts) |
| Gap analysis gaps | Auto-fix, re-verify, re-analyze (2 cycles) |

## Autonomy Behavior

### Level 3 (Full Auto)
- Auto-advance between phases after logging status
- Only STOP for: Destructive Action Guard, Impact BLOCK, unrecoverable errors (2 attempts), Discuss phase (always pauses for input)

### Level 1-2
- Pause at each phase for user confirmation (Level 1)
- Pause at milestones only (Level 2)

## Integrity Check (M7)

Wave Step 1 performs a three-field integrity check on `progress.md` before starting:
1. **Status** — must be a recognized value from the Valid Status table
2. **Milestone name** — must have an active milestone identified
3. **Domains table** — must have at least one domain row defined

If any field is missing or invalid, wave reports the error and stops.

## Security Considerations (M5)

The wave orchestrator uses `bypassPermissions` mode for phase agents. This is documented in `gsd-t-wave.md` with security implications:
- Phase agents can modify files without per-file user approval
- The Destructive Action Guard still applies (agents must stop for destructive actions)
- Each phase agent operates in a fresh context window to prevent cross-phase data leakage

## Interruption Handling
When interrupted mid-wave:
1. Finish current atomic task
2. Save state to `.gsd-t/progress.md` with exact resume point
3. Note: `{phase} — {domain} — Task {N}`
4. Resume with `gsd-t-resume`
