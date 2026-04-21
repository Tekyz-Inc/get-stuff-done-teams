# GSD-T: Resume — Continue From Last State

You are resuming work after an interruption. This handles both same-session pauses (user pressed Esc to interject) and cross-session recovery (new Claude Code session).

## Step 0: Unattended Supervisor Auto-Reattach

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 0 --step-label "Unattended Supervisor Auto-Reattach" 2>/dev/null || true
```

**This step runs FIRST, before reading any docs, contracts, or continue-here files.**

**Worker bypass**: If the environment variable `GSD_T_UNATTENDED_WORKER=1` is set, this resume is being invoked by the unattended supervisor as a worker iteration. **SKIP this entire Step 0** — do NOT check for supervisor.pid, do NOT auto-reattach, do NOT schedule a watch tick. Fall through directly to Step 0.1. The worker's job is to do actual work, not watch itself.

Check whether an unattended supervisor is actively running for this project:

1. Check if `.gsd-t/.unattended/supervisor.pid` exists.
   - **Does not exist** → no supervisor running. Fall through to Step 0.1.

2. **File exists**: Run the liveness + fingerprint check via the helper:
   ```bash
   node -e "
   const { readPidFile, verifyFingerprint } = require('./bin/supervisor-pid-fingerprint.cjs');
   const entry = readPidFile(process.cwd());
   if (!entry) { console.log('no_pid_file'); process.exit(0); }
   try { process.kill(entry.pid, 0); } catch { console.log('dead:' + entry.pid); process.exit(0); }
   const r = verifyFingerprint(entry, process.cwd());
   if (r.ok === true)  console.log('alive_verified:' + entry.pid);
   else if (r.ok === null) console.log('alive_legacy_pid:' + entry.pid);
   else console.log('alive_but_stale:' + entry.pid + ':' + r.reason);
   "
   ```

   Five possible outcomes:
   - `no_pid_file` → no supervisor running, fall through to Step 0.1.
   - `dead:<pid>` → supervisor exited (cleanly or crashed). PID file stale. Log: `[resume] supervisor PID <pid> no longer alive — stale PID file, falling through to normal resume`. Fall through.
   - `alive_verified:<pid>` → our supervisor, same project, ps confirms command line. Proceed to step 3 (AUTO-REATTACH).
   - `alive_legacy_pid:<pid>` → PID file is legacy bare-integer form; we can only confirm "some process with this PID exists." Log a one-line warning: `[resume] supervisor PID <pid> file uses legacy bare-integer form — next supervisor launch will upgrade to JSON fingerprint`. Proceed to step 3 as if verified (preserves behavior for any already-running legacy supervisors).
   - `alive_but_stale:<pid>:<reason>` → process alive but **not** our supervisor (different project recycled PID, or non-gsd-t process). Log: `[resume] supervisor PID <pid> no longer identifies our supervisor (reason: <reason>) — treating as stale, falling through to normal resume`. Fall through to Step 0.1.

3. **Supervisor is alive**: Read `.gsd-t/.unattended/state.json`. Check `state.status`:
   - **Terminal status** (`done`, `failed`, `stopped`, `crashed`) → the supervisor has finished and is waiting for cleanup. Fall through to Step 0.1 so normal resume flow runs (it will see progress.md state and continue from where the supervisor left off).
   - **Non-terminal status** (`initializing`, `running`, or any unrecognized value) → **AUTO-REATTACH**:
     - Print the current watch status using the data in `state.json` (elapsed time, current iteration, milestone/wave/task, last worker exit code).
     - Call `ScheduleWakeup(270, '/gsd-t-unattended-watch', reason='resumed watch')`.
     - **STOP reading resume.md entirely. Do NOT proceed to Step 0.1 or any later step. Do NOT read docs, contracts, or continue-here files. Do NOT display a headless read-back banner.** The watcher will display the live status block and re-schedule itself. Return now.

Contract reference: `unattended-supervisor-contract.md` §9 (Resume Auto-Reattach Handshake)

---

## Step 0.1: Detect Resume Mode

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 0 --step-label ".1: Detect Resume Mode" 2>/dev/null || true
```

**Same-session** (conversation context still available — you can see prior messages about the active phase/task):
- Skip to Step 2 — you already have the context loaded
- Do NOT re-read all state files

**Cross-session** (first command in a new session, no prior conversation context):
- Run Step 1 to load full state

## Step 0.2: Handoff Lock Wait (headless resume only)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 0 --step-label ".2: Handoff Lock Wait (headless resume only)" 2>/dev/null || true
```

Before reading any continue-here file or state file, check if a parent process wrote a handoff lock for this session:

```bash
node -e "
const sessionId = process.env.CLAUDE_HEADLESS_SESSION_ID;
if (!sessionId) { process.exit(0); }
const hl = require('./bin/handoff-lock.cjs');
hl.waitForLockRelease('.', sessionId, 5000)
  .then(() => process.exit(0))
  .catch(e => { console.error('[resume] handoff lock wait timed out:', e.message); process.exit(0); });
"
```

- If `CLAUDE_HEADLESS_SESSION_ID` is not set (interactive resume) → the script exits immediately; no wait needed.
- If set → wait up to **5 seconds** for the parent's handoff lock to be released before reading `.gsd-t/continue-here-*.md` or any other state file. On timeout, log and proceed anyway (parent may have crashed after spawning).

This prevents the child side of a headless spawn from reading a partial continue-here file written by the parent. Contract: `headless-default-contract.md` v1.0.0, m35-gap-fixes T2 deferred hook.

---

## Step 0.3: Orchestrator Run Recovery (M40 D6)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 0 --step-label ".3: Orchestrator Run Recovery (M40 D6)" 2>/dev/null || true
```

If an orchestrator run was interrupted (crash, SIGINT, kill, parent timeout), `.gsd-t/orchestrator/state.json` will still exist with a non-terminal `status`. Detect this and offer to resume it via the deterministic `--resume` path rather than attempting prose-driven reconciliation:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const fp = path.join('.gsd-t', 'orchestrator', 'state.json');
if (!fs.existsSync(fp)) process.exit(0);
let s; try { s = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { process.exit(0); }
const TERMINAL = new Set(['done','failed','stopped','interrupted','completed']);
if (!s || TERMINAL.has(s.status)) process.exit(0);
const running = Object.entries(s.tasks || {}).filter(([,t]) => t && t.status === 'running');
console.error('▶ Orchestrator run still in-flight (status=' + (s.status||'?') + ', ' + running.length + ' running task(s))');
console.error('  Resume via: node bin/gsd-t-orchestrator.js orchestrate --milestone ' + (s.milestone || '<id>') + ' --resume');
console.error('  This calls recoverRunState() to reconcile in-flight tasks (ok/ambiguous/failed) before continuing.');
" || true
```

Rules:
- **State absent or terminal** → nothing to do; fall through.
- **Non-terminal** → surface the recovery hint and, at Level 3, auto-invoke the orchestrator with `--resume` when the current milestone matches `state.milestone`. Ambiguous tasks (commit but no progress entry) are flagged in the orchestrator output and require operator triage — do **not** silently claim them done.
- The recovery algorithm, archiving, and ambiguous handling are covered by unit tests in `test/m40-recovery.test.js` and implemented in `bin/gsd-t-orchestrator-recover.cjs`.

Contract: stream-json-sink v1.1.0, wave-join v1.x, completion-signal v1.x.

---

## Step 0.5: Headless Read-Back Banner (MANDATORY)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 0 --step-label ".5: Headless Read-Back Banner (MANDATORY)" 2>/dev/null || true
```

Before loading full state, surface any completed headless sessions the user hasn't seen yet. Run this once at the start of every resume invocation:

```bash
node bin/check-headless-sessions.js . 2>/dev/null || true
```

This prints a `## Headless runs since you left` banner listing any completed sessions with their duration, outcome, and log path, then marks them surfaced so the banner never re-appears for the same session. If no completed sessions exist, it prints nothing.

Contract: `.gsd-t/contracts/headless-default-contract.md` v1.0.0

## Step 0.6: Context Meter Health Check (MANDATORY, v3.10.12+)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 0 --step-label ".6: Context Meter Health Check (MANDATORY, v3.10.12+)" 2>/dev/null || true
```

Before loading any other state, verify the Context Meter (M34) is actually alive. A dead meter was the root cause of the M36 `/compact` regression (2026-04-15) — `checkCount=2102` but every hook call failed fail-open because `ANTHROPIC_API_KEY` was unset, and the gate silently reported `pct=0` forever.

Run via Bash:

```bash
node -e "
const tb=require('./bin/token-budget.cjs');
const s=tb.getSessionStatus('.');
if (s.threshold === 'stale') {
  console.error('⚠ Context meter is DEAD — reason: ' + (s.deadReason || 'unknown'));
  console.error('  The context-window guardrail is BROKEN. Without it, long sessions will hit /compact silently.');
  console.error('  Fix: set ANTHROPIC_API_KEY in your shell profile (measurement only, never inference).');
  console.error('  Run: gsd-t doctor');
  process.exit(1);
}
process.stdout.write('context-meter: ok (' + s.threshold + ', ' + s.pct + '%)\\n');
" || true
```

If the meter is stale:
1. **Print the warning** exactly as above (non-fatal — do not halt resume).
2. **Run `node bin/gsd-t.js doctor`** inline and show the output so the user sees the actionable check list.
3. **Continue with resume** — but add a prominent `⚠ CONTEXT METER DEAD — gate will treat future gate checks as STOP until fixed` line to your end-of-resume status block so the user cannot miss it.
4. **Refuse to auto-advance into `execute` / `wave` / `integrate`** until the meter is healthy. If the continue-here file says the next action is one of those gated commands, stop at "meter dead — fix before continuing" instead.

Contract: `context-meter-contract.md` v1.1.0 (v3.10.12) — §"Stale Band and Resume Gating"

## Step 1: Load Full State (cross-session only)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 1 --step-label "Load Full State (cross-session only)" 2>/dev/null || true
```

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

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 2 --step-label "Determine Current Position" 2>/dev/null || true
```

From the continue-here file (if present) OR progress.md (or conversation context if same-session), identify:
- Current milestone and status
- Which phase we're in
- Which tasks are done, in progress, or blocked
- Any pending decisions or user-input-needed items
- Last entry in the Decision Log

**If a continue-here file was found**: Use its "Next Action" field as the primary resume point. The continue-here file is more precise than progress.md alone. After resuming, delete the continue-here file (it has been consumed).

## Step 3: Report and Continue

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 3 --step-label "Report and Continue" 2>/dev/null || true
```

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

Ready to continue? Or run /gsd-t-status for full details.
```

## Step 4: Continue

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 4 --step-label "Continue" 2>/dev/null || true
```

If $ARGUMENTS specifies what to do next, proceed with that.
Otherwise, pick up from the logical next action based on current state:
- Mid-execution → Continue with next unblocked task
- Between phases → Start next phase
- Blocked → Explain what's needed to unblock
- Verify failed → Show remediation tasks

## Step 5: Auto-Advance Through End of Milestone (MANDATORY)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-resume --step 5 --step-label "Auto-Advance Through End of Milestone (MANDATORY)" 2>/dev/null || true
```

**Resume does NOT stop at the end of a wave or phase. It must chain all the way to `COMPLETED` status.**

When the resumed work reaches a natural handoff point, do NOT print a "Next Up" hint and wait for the user. At Level 3 Full Auto, keep going. The successor mapping in CLAUDE-global.md is the contract — resume honors it exactly like any other command:

| If resume just finished… | Auto-advance to |
|--------------------------|-----------------|
| A task (mid-wave, tasks remaining) | next task in the same wave |
| The last task of a wave (waves remaining) | next wave |
| The last task of the last wave | `/gsd-t-verify` (which auto-invokes `/gsd-t-complete-milestone` per verify Step 8) |
| `/gsd-t-verify` (VERIFIED or VERIFIED-WITH-WARNINGS) | `/gsd-t-complete-milestone` (verify already spawns this — do not re-invoke) |
| `/gsd-t-complete-milestone` | honor any outstanding multi-step user directive (see below) |

**Never stop at "Wave N complete" or "Task N done" and wait.** The only stopping points are:
1. VERIFY-FAILED (report failures)
2. Destructive action needing approval
3. Unrecoverable error after 2 fix attempts + debug-loop exit 4
4. `COMPLETED` status reached AND no outstanding user directive

**Outstanding User Directive** (from the continue-here file): If the continue-here file contains an `## Outstanding User Request` or `## User Note` section with a multi-step chain (e.g., "run until milestone complete, then checkin publish update-all"), resume MUST continue executing that chain AFTER complete-milestone finishes. Parse the remaining steps and invoke them in order. Do not stop and ask — the directive was already given.

**Self-check before printing a "Next Up" hint**: Before emitting any `## ▶ Next Up` block, ask: "Is this a Level 3 auto-advance transition?" If yes (which it almost always is at end-of-wave or end-of-milestone under Level 3), SKIP the hint and invoke the next command directly. The hint exists for commands with no successor OR for lower autonomy levels, NOT for the resume-driven path back to COMPLETED.

$ARGUMENTS
