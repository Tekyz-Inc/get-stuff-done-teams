# GSD-T: Wave — Full Cycle Orchestration (Agent-Per-Phase)

You are the wave orchestrator. You do NOT execute phases yourself. Instead, you spawn an **independent agent for each phase**, giving each a fresh context window. This eliminates context accumulation across phases and prevents mid-wave compaction.

## Step 1: Load State (Lightweight)

Read ONLY:
1. `.gsd-t/progress.md` — current status, milestone name, phase state
2. `CLAUDE.md` — autonomy level only (scan for Level 1/2/3)

Do NOT read contracts, domains, docs, or source code. You are the orchestrator — phase agents handle their own context loading.

## Step 2: Determine Resume Point

From progress.md status, determine which phase to start from:

| Status | Next Phase |
|--------|------------|
| READY | Need milestone first — prompt user or run milestone |
| INITIALIZED / DEFINED | Partition |
| PARTITIONED | Discuss (or skip to Plan if path is clear) |
| DISCUSSED | Plan |
| PLANNED | Impact |
| IMPACT_ANALYZED | Execute |
| EXECUTED | Test-Sync |
| TESTS_SYNCED | Integrate |
| INTEGRATED | Verify |
| VERIFIED | Complete |
| VERIFY_FAILED | Remediate → re-Verify |

## Step 3: Phase Orchestration Loop

For each remaining phase, spawn an **independent agent** using the Task tool. Each agent gets a fresh context window, loads its own state from files, and reports back.

### Phase Agent Spawn Pattern

For each phase, spawn the agent like this:

```
Task agent (subagent_type: "general-purpose", mode: "bypassPermissions"):
  "Execute the {PHASE} phase of the current GSD-T milestone.

   Read and follow the full instructions in commands/gsd-t-{phase}.md
   Read .gsd-t/progress.md for current milestone and state.
   Read CLAUDE.md for project conventions.
   Read .gsd-t/contracts/ for domain interfaces.

   Complete the phase fully:
   - Follow every step in the command file
   - Update .gsd-t/progress.md status when done
   - Run document ripple as specified
   - Commit your work

   Report back: one-line status summary."
```

### Phase Sequence

Execute phases in this order, spawning one agent per phase:

#### 1. PARTITION
Spawn agent → `commands/gsd-t-partition.md`
- After: Read `progress.md`, verify status = PARTITIONED
- If failed: Report error, stop

#### 2. DISCUSS (conditional)
- Check: Are there open architectural questions or multiple viable approaches?
- If YES: Spawn agent → `commands/gsd-t-discuss.md`
  - **Note**: Discuss always pauses for user input, even at Level 3. The discuss agent will interact with the user directly.
- If NO (path is clear): Skip to Plan

#### 3. PLAN
Spawn agent → `commands/gsd-t-plan.md`
- After: Read `progress.md`, verify status = PLANNED

#### 4. IMPACT
Spawn agent → `commands/gsd-t-impact.md`
- After: Read `progress.md` and `.gsd-t/impact-report.md`
- **Decision Gate**:
  - PROCEED → continue to Execute
  - PROCEED WITH CAUTION → log items, continue
  - BLOCK → stop, report to user, wait for decision

#### 5. EXECUTE
Spawn agent → `commands/gsd-t-execute.md`
- This is the heaviest phase. The execute agent will handle its own domain agent spawning and QA agent internally.
- After: Read `progress.md`, verify status = EXECUTED

#### 6. TEST-SYNC
Spawn agent → `commands/gsd-t-test-sync.md`
- After: Read `progress.md`, verify status = TESTS_SYNCED

#### 7. INTEGRATE
Spawn agent → `commands/gsd-t-integrate.md`
- After: Read `progress.md`, verify status = INTEGRATED

#### 8. VERIFY
Spawn agent → `commands/gsd-t-verify.md`
- After: Read `progress.md`, check status:
  - VERIFIED → proceed to Complete
  - VERIFY_FAILED → handle remediation (see Error Recovery)

#### 9. COMPLETE
Spawn agent → `commands/gsd-t-complete-milestone.md`
- After: Read `progress.md`, verify status = COMPLETED

### Between Each Phase

After each agent completes:
1. Read `.gsd-t/progress.md` to verify the phase updated status correctly
2. Report brief status to user:
   ```
   ✅ {Phase} complete — {agent's one-line summary}
   ```
3. If status was NOT updated correctly: report error and stop
4. Proceed to next phase

## Step 4: Autonomy Behavior

**Level 3 (Full Auto)**: Auto-advance to next phase after each agent completes. Only STOP for:
- Destructive Action Guard violations (reported by phase agent)
- Impact analysis BLOCK verdict
- Unrecoverable errors after 2 fix attempts
- Discuss phase (always pauses for user input)

**Level 1–2**: Pause between phases, show status, ask to continue.

## Step 5: Completion

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

If the user interrupts or a phase agent fails:
1. The current phase agent saves its own state to `.gsd-t/progress.md`
2. Report: "Paused at {phase}. Run `/user:gsd-t-resume` to continue."
3. Resume will pick up from the last completed phase

## Error Recovery

### If impact analysis blocks:
- Read the impact report from the agent's output
- Report blocking issues to user

**Level 3**: Spawn a remediation agent to fix blocking issues, then re-spawn impact agent. Max 2 attempts.
**Level 1–2**: Ask user for direction.

### If tests fail during execute:
- The execute agent handles test failures internally (up to 2 fix attempts)
- If still failing after 2 attempts, the execute agent reports failure
- Orchestrator stops and reports to user

### If verify fails:
- Read verify report for failure details

**Level 3**: Spawn remediation agent, then re-spawn verify agent. Max 2 attempts.
**Level 1–2**: Ask user for direction.

## Why Agent-Per-Phase

Each phase agent gets a **fresh context window** (~200K tokens). This means:
- Phase 7 doesn't carry the context baggage from phases 1-6
- Mid-phase compaction is eliminated for standard-sized phases
- Each agent loads only what it needs from state files
- The orchestrator stays lightweight (~30KB total)

State handoff happens through `.gsd-t/` files — exactly what they were designed for.

## Security Considerations

### bypassPermissions Mode

Wave spawns each phase agent with `mode: "bypassPermissions"`. This means agents execute bash commands, write files, and perform git operations **without per-action user approval**. This is by design — wave phases would be impractical with manual approval at every step.

### Attack Surface

If command files in `~/.claude/commands/` are tampered with, wave agents will execute the modified instructions with full permissions. The attack requires:
1. Write access to the user's `~/.claude/commands/` directory
2. Knowledge of the GSD-T command file format
3. The user to run `/gsd-t-wave` after tampering

### Current Mitigations

- **npm-installed files**: Command files are installed from the npm registry, providing a known-good source
- **Content comparison on update**: `gsd-t update` compares file contents and reports changes
- **User-owned directory**: `~/.claude/commands/` inherits the user's filesystem permissions
- **Destructive Action Guard**: CLAUDE.md instructions provide soft protection against destructive operations (DROP TABLE, schema changes, etc.), though agents could theoretically ignore these
- **Autonomy levels**: Level 1 and Level 2 pause between phases, giving users visibility into agent activity

### Recommendations

- For sensitive projects, use **Level 1 or Level 2 autonomy** instead of Level 3 to review each phase's output
- Periodically verify command file integrity: `gsd-t doctor` checks installation health
- If security is a concern, audit `~/.claude/commands/gsd-t-*.md` files for unexpected modifications
- Keep GSD-T updated (`gsd-t update`) to receive the latest command files from npm

## Workflow Visualization

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Wave Orchestrator (lightweight)                          │
│                                                                              │
│  ┌─────────┐   ┌─────────┐   ┌──────┐   ┌────────┐   ┌─────────┐          │
│  │PARTITION│ → │ DISCUSS │ → │ PLAN │ → │ IMPACT │ → │ EXECUTE │          │
│  │ agent 1 │   │ agent 2 │   │agent 3│   │agent 4 │   │ agent 5 │          │
│  └────┬────┘   └────┬────┘   └───┬──┘   └───┬────┘   └────┬────┘          │
│       ↓              ↓            ↓           ↓             ↓               │
│    status          status      status      status        status             │
│    check           check       check       check +       check              │
│                                           gate                              │
│                                                                              │
│  ┌──────────┐   ┌────────┐   ┌───────────┐       ┌─────────────────┐       │
│  │ COMPLETE │ ← │ VERIFY │ ← │ INTEGRATE │ ←──── │ FULL TEST-SYNC  │       │
│  │ agent 9  │   │agent 8 │   │  agent 7  │       │    agent 6      │       │
│  └────┬────┘   └────┬────┘   └─────┬─────┘       └────────┬────────┘       │
│       ↓              ↓              ↓                      ↓               │
│    archive        status +       status                 status              │
│    git tag        gate check     check                  check               │
│                                                                              │
│  Each agent: fresh context window, reads state from files, dies when done   │
│  Orchestrator: ~30KB total, never compacts                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

$ARGUMENTS
