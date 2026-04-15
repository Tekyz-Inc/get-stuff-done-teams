# GSD-T: Resume — Continue From Last State

You are resuming work after an interruption. This handles both same-session pauses (user pressed Esc to interject) and cross-session recovery (new Claude Code session).

## Step 0: Unattended Supervisor Auto-Reattach

**This step runs FIRST, before reading any docs, contracts, or continue-here files.**

Check whether an unattended supervisor is actively running for this project:

1. Check if `.gsd-t/.unattended/supervisor.pid` exists.
   - **Does not exist** → no supervisor running. Fall through to Step 0.1.

2. **File exists**: Read the PID (single integer on one line). Run:
   ```bash
   kill -0 <pid> 2>/dev/null && echo "alive" || echo "dead"
   ```
   - **"dead"** → supervisor exited (cleanly or crashed). The PID file is stale. Log: `[resume] supervisor PID <pid> no longer alive — stale PID file, falling through to normal resume`. Fall through to Step 0.1.
   - **"alive"** → supervisor process is live. Proceed to step 3.

3. **Supervisor is alive**: Read `.gsd-t/.unattended/state.json`. Check `state.status`:
   - **Terminal status** (`done`, `failed`, `stopped`, `crashed`) → the supervisor has finished and is waiting for cleanup. Fall through to Step 0.1 so normal resume flow runs (it will see progress.md state and continue from where the supervisor left off).
   - **Non-terminal status** (`initializing`, `running`, or any unrecognized value) → **AUTO-REATTACH**:
     - Print the current watch status using the data in `state.json` (elapsed time, current iteration, milestone/wave/task, last worker exit code).
     - Call `ScheduleWakeup(270, '/user:gsd-t-unattended-watch', reason='resumed watch')`.
     - **STOP reading resume.md entirely. Do NOT proceed to Step 0.1 or any later step. Do NOT read docs, contracts, or continue-here files. Do NOT display a headless read-back banner.** The watcher will display the live status block and re-schedule itself. Return now.

Contract reference: `unattended-supervisor-contract.md` §9 (Resume Auto-Reattach Handshake)

---

## Step 0.1: Detect Resume Mode

**Same-session** (conversation context still available — you can see prior messages about the active phase/task):
- Skip to Step 2 — you already have the context loaded
- Do NOT re-read all state files

**Cross-session** (first command in a new session, no prior conversation context):
- Run Step 1 to load full state

## Step 0.2: Handoff Lock Wait (headless resume only)

Before reading any continue-here file or state file, check if a parent process wrote a handoff lock for this session:

```bash
node -e "
const sessionId = process.env.CLAUDE_HEADLESS_SESSION_ID;
if (!sessionId) { process.exit(0); }
const hl = require('./bin/handoff-lock.js');
hl.waitForLockRelease('.', sessionId, 5000)
  .then(() => process.exit(0))
  .catch(e => { console.error('[resume] handoff lock wait timed out:', e.message); process.exit(0); });
"
```

- If `CLAUDE_HEADLESS_SESSION_ID` is not set (interactive resume) → the script exits immediately; no wait needed.
- If set → wait up to **5 seconds** for the parent's handoff lock to be released before reading `.gsd-t/continue-here-*.md` or any other state file. On timeout, log and proceed anyway (parent may have crashed after spawning).

This prevents the child side of a headless runway-handoff from reading a partial continue-here file written by the parent. Contract: `headless-auto-spawn-contract.md` v1.0.0, m35-gap-fixes T2 deferred hook.

---

## Step 0.5: Headless Read-Back Banner (MANDATORY)

Before loading full state, surface any completed headless sessions the user hasn't seen yet. Run this once at the start of every resume invocation:

```bash
node bin/check-headless-sessions.js . 2>/dev/null || true
```

This prints a `## Headless runs since you left` banner listing any completed sessions with their duration, outcome, and log path, then marks them surfaced so the banner never re-appears for the same session. If no completed sessions exist, it prints nothing.

Contract: `.gsd-t/contracts/headless-auto-spawn-contract.md` v1.0.0

## Step 1: Load Full State (cross-session only)

Read in this exact order:
1. `CLAUDE.md` — project context and conventions
2. **Check for continue-here files first**: List `.gsd-t/continue-here-*.md` files. If any exist, read the most recent one (highest timestamp). It contains exact position, next action, and open items — use this as the primary resume point.
3. `.gsd-t/progress.md` — current status, decisions, blockers (always read this too)
4. `.gsd-t/contracts/` — all contract files
4. `.gsd-t/domains/*/scope.md` — domain boundaries
5. `.gsd-t/domains/*/tasks.md` — task lists with completion status
6. `.gsd-t/domains/*/constraints.md` — domain rules
7. `.gsd-t/contracts/integration-points.md` — dependency graph
8. `.gsd-t/verify-report.md` (if exists) — verification findings

## Step 2: Determine Current Position

From the continue-here file (if present) OR progress.md (or conversation context if same-session), identify:
- Current milestone and status
- Which phase we're in
- Which tasks are done, in progress, or blocked
- Any pending decisions or user-input-needed items
- Last entry in the Decision Log

**If a continue-here file was found**: Use its "Next Action" field as the primary resume point. The continue-here file is more precise than progress.md alone. After resuming, delete the continue-here file (it has been consumed).

## Step 3: Report and Continue

**Level 3 (Full Auto)**: Log a brief status line and auto-resume from the current task/phase. Do NOT wait for user input.

```
🔄 Resuming: {milestone name} — {phase} — {next task or action}
```

**Level 1–2**: Present fuller context and wait for confirmation:

```
🔄 GSD-T Resuming: {milestone name}
Phase: {current phase}
Last activity: {last Decision Log entry}

Progress:
  {domain-1}: {completed}/{total} tasks
  {domain-2}: {completed}/{total} tasks

Next up: {specific next action}
Blockers: {any pending items} | None

Ready to continue? Or run /user:gsd-t-status for full details.
```

## Step 4: Continue

If $ARGUMENTS specifies what to do next, proceed with that.
Otherwise, pick up from the logical next action based on current state:
- Mid-execution → Continue with next unblocked task
- Between phases → Start next phase
- Blocked → Explain what's needed to unblock
- Verify failed → Show remediation tasks

## Step 5: Auto-Advance Through End of Milestone (MANDATORY)

**Resume does NOT stop at the end of a wave or phase. It must chain all the way to `COMPLETED` status.**

When the resumed work reaches a natural handoff point, do NOT print a "Next Up" hint and wait for the user. At Level 3 Full Auto, keep going. The successor mapping in CLAUDE-global.md is the contract — resume honors it exactly like any other command:

| If resume just finished… | Auto-advance to |
|--------------------------|-----------------|
| A task (mid-wave, tasks remaining) | next task in the same wave |
| The last task of a wave (waves remaining) | next wave |
| The last task of the last wave | `/user:gsd-t-verify` (which auto-invokes `/user:gsd-t-complete-milestone` per verify Step 8) |
| `/user:gsd-t-verify` (VERIFIED or VERIFIED-WITH-WARNINGS) | `/user:gsd-t-complete-milestone` (verify already spawns this — do not re-invoke) |
| `/user:gsd-t-complete-milestone` | honor any outstanding multi-step user directive (see below) |

**Never stop at "Wave N complete" or "Task N done" and wait.** The only stopping points are:
1. VERIFY-FAILED (report failures)
2. Destructive action needing approval
3. Unrecoverable error after 2 fix attempts + debug-loop exit 4
4. `COMPLETED` status reached AND no outstanding user directive

**Outstanding User Directive** (from the continue-here file): If the continue-here file contains an `## Outstanding User Request` or `## User Note` section with a multi-step chain (e.g., "run until milestone complete, then checkin publish update-all"), resume MUST continue executing that chain AFTER complete-milestone finishes. Parse the remaining steps and invoke them in order. Do not stop and ask — the directive was already given.

**Self-check before printing a "Next Up" hint**: Before emitting any `## ▶ Next Up` block, ask: "Is this a Level 3 auto-advance transition?" If yes (which it almost always is at end-of-wave or end-of-milestone under Level 3), SKIP the hint and invoke the next command directly. The hint exists for commands with no successor OR for lower autonomy levels, NOT for the resume-driven path back to COMPLETED.

$ARGUMENTS
