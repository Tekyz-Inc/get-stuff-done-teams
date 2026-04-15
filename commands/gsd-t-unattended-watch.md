# GSD-T: Unattended Watch — Stateless Watch Tick

**Model**: haiku (polling a state file is mechanical — no reasoning needed)

You are running one tick of the unattended supervisor watch loop. This command is **stateless**: every firing re-reads `.gsd-t/.unattended/supervisor.pid` + `state.json` + `run.log` from disk and makes a fresh decision. There is no in-memory state between ticks, and a `/clear` followed by `/user:gsd-t-resume` during a live unattended run is a no-op.

The watch loop is the user's visibility surface into the running supervisor. It fires every 270 seconds (inside the 5-minute prompt-cache TTL) and either:
1. Renders a compact status block + reschedules itself, OR
2. Prints a terminal report and STOPS rescheduling.

See `unattended-supervisor-contract.md` §8 (Watch Tick Decision Tree), §4 (Status Enum), §3 (state.json schema).

## Decision Tree (Contract §8)

```
1. supervisor.pid absent           → finalized cleanly  → final report, STOP
2. kill -0 {pid} fails             → crashed            → crash diagnostics + log tail, STOP
3. state.json.status:
     - done                        → success report, STOP
     - failed                      → failure summary,  STOP
     - stopped                     → user-stop confirm, STOP
     - initializing | running      → render watch block, go to 4
4. ScheduleWakeup(270, '/user:gsd-t-unattended-watch', reason='unattended tick {iter}')
```

**Critical**: Every branch except `initializing`/`running` is TERMINAL — do NOT reschedule. When you reach a terminal state, print the report and end the turn. Do not add a "Next Up" block — this is a self-rescheduling loop, not a phase workflow.

## Step 1: Check State Directory

Run via Bash:

```bash
if [ ! -d ".gsd-t/.unattended" ]; then
  echo "No supervisor state directory at .gsd-t/.unattended/ — nothing to watch."
  exit 0
fi
```

If the directory does not exist, there is no supervisor to watch. Exit 0, do NOT reschedule. End the turn.

## Step 2: Read State, PID, and Run.log Tail

Run a single `node -e` block that gathers everything needed for the decision tree. This reads the last ~2KB of `run.log` via `fs.open` + `fs.read` with a negative offset from end (not `readFileSync`), so the command stays cheap even when `run.log` is hundreds of MB.

```bash
node -e "
const fs = require('fs');
const path = require('path');

const UDIR = '.gsd-t/.unattended';
const PID_FILE = path.join(UDIR, 'supervisor.pid');
const STATE_FILE = path.join(UDIR, 'state.json');
const LOG_FILE = path.join(UDIR, 'run.log');

function out(k, v) { console.log(k + '=' + JSON.stringify(v ?? null)); }

// --- PID file ---
let pid = null;
let pidFileExists = fs.existsSync(PID_FILE);
if (pidFileExists) {
  try {
    pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (!Number.isFinite(pid)) pid = null;
  } catch (_) { pid = null; }
}
out('PID_FILE_EXISTS', pidFileExists);
out('PID', pid);

// --- kill -0 liveness ---
let alive = null;
if (pid !== null) {
  try { process.kill(pid, 0); alive = true; }
  catch (_) { alive = false; }
}
out('ALIVE', alive);

// --- state.json ---
let state = null;
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
catch (_) {
  // tolerate transient rename race — retry once
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch (_) { state = null; }
}
if (state) {
  out('STATUS', state.status);
  out('SESSION', state.sessionId);
  out('MILESTONE', state.milestone);
  out('WAVE', state.wave);
  out('TASK', state.task);
  out('ITER', state.iter);
  out('MAX_ITER', state.maxIterations);
  out('STARTED_AT', state.startedAt);
  out('LAST_TICK', state.lastTick);
  out('LAST_EXIT', state.lastExit);
  out('LAST_ELAPSED_MS', state.lastElapsedMs);
  out('LOG_PATH', state.logPath || LOG_FILE);
  // elapsed
  const started = state.startedAt ? Date.parse(state.startedAt) : null;
  const elapsedMs = started ? (Date.now() - started) : null;
  out('ELAPSED_MS', elapsedMs);
  // last tick age
  const lt = state.lastTick ? Date.parse(state.lastTick) : null;
  const tickAgeMs = lt ? (Date.now() - lt) : null;
  out('TICK_AGE_MS', tickAgeMs);
} else {
  out('STATUS', null);
}

// --- run.log tail (last ~2KB via fd seek, not full read) ---
let tailLines = [];
try {
  const st = fs.statSync(LOG_FILE);
  const size = st.size;
  const readLen = Math.min(size, 2048);
  const offset = size - readLen;
  const fd = fs.openSync(LOG_FILE, 'r');
  const buf = Buffer.alloc(readLen);
  fs.readSync(fd, buf, 0, readLen, offset);
  fs.closeSync(fd);
  const text = buf.toString('utf8');
  tailLines = text.split('\n').filter(l => l.trim().length > 0);
} catch (_) { tailLines = []; }
// last 50 lines for crash path; last 1 non-empty for normal path
const last50 = tailLines.slice(-50);
const last1 = tailLines.length > 0 ? tailLines[tailLines.length - 1] : '';
out('LOG_TAIL_LAST1', last1);
out('LOG_TAIL_LAST50', last50.join('\n'));
"
```

## Step 3: Branch on PID File Absence (Finalized Cleanly)

If `PID_FILE_EXISTS=false`:

The supervisor has finalized cleanly and removed its own PID file. Read the final `state.json` status and iter, then print the terminal report:

```
✅  Unattended supervisor finalized cleanly.

   Session:       {SESSION}
   Milestone:     {MILESTONE}
   Final status:  {STATUS}
   Iterations:    {ITER} / {MAX_ITER}
   Total elapsed: {Hh Mm — formatted from ELAPSED_MS}
   Log:           {LOG_PATH}
   State:         .gsd-t/.unattended/state.json
```

If `state.json` was also unreadable (null STATUS), emit:

```
⚠️   Unattended supervisor PID file absent but state.json unreadable.
    Manual inspection required: ls -la .gsd-t/.unattended/
```

**STOP** — do NOT reschedule. End the turn.

## Step 4: Branch on Dead PID (Crashed)

If `PID_FILE_EXISTS=true` AND `ALIVE=false`:

The supervisor process is gone but it did not remove its PID file — this is a crash. Print crash diagnostics including the last 50 lines of `run.log`:

```
💥  Unattended supervisor CRASHED (PID {PID} no longer alive).

    Last known state:
      Session:   {SESSION}
      Status:    {STATUS}
      Iter:      {ITER} / {MAX_ITER}
      Last tick: {LAST_TICK} (age {tickAgeMs → seconds})
      Last exit: {LAST_EXIT}

    Last 50 lines of run.log:
    ──────────────────────────────────────────────
    {LOG_TAIL_LAST50}
    ──────────────────────────────────────────────

    Recovery: inspect .gsd-t/.unattended/run.log and .gsd-t/.unattended/state.json.
    Remove the stale PID file with: rm .gsd-t/.unattended/supervisor.pid
    Then relaunch with: /user:gsd-t-unattended
```

**STOP** — do NOT reschedule. End the turn.

## Step 5: Branch on Terminal Status

If `PID_FILE_EXISTS=true` AND `ALIVE=true` AND `STATUS` is terminal (`done` | `failed` | `stopped`):

The supervisor is still alive but has transitioned to a terminal status on its last tick. The next supervisor pass will remove the PID file — we just caught it mid-cleanup. Print the matching report and STOP.

### 5a: STATUS=done

```
🎉  Unattended supervisor COMPLETED the milestone.

    Session:       {SESSION}
    Milestone:     {MILESTONE} — DONE
    Iterations:    {ITER} / {MAX_ITER}
    Total elapsed: {Hh Mm}
    Log:           {LOG_PATH}

    The supervisor will clean up its PID file momentarily.
```

### 5b: STATUS=failed

```
❌  Unattended supervisor HALTED — status=failed.

    Session:       {SESSION}
    Milestone:     {MILESTONE}
    Iterations:    {ITER} / {MAX_ITER}
    Last exit:     {LAST_EXIT}
    Total elapsed: {Hh Mm}
    Log:           {LOG_PATH}

    See run.log for the halt reason. The supervisor finalized state.json before exiting.
```

### 5c: STATUS=stopped

```
🛑  Unattended supervisor STOPPED by user.

    Session:       {SESSION}
    Milestone:     {MILESTONE}
    Iterations:    {ITER} / {MAX_ITER}
    Total elapsed: {Hh Mm}
    Log:           {LOG_PATH}

    Stop sentinel was honored between worker iterations. Relaunch with /user:gsd-t-unattended.
```

**STOP** — do NOT reschedule. End the turn.

## Step 6: Render Live Watch Block (Non-Terminal)

If `PID_FILE_EXISTS=true` AND `ALIVE=true` AND `STATUS` is `initializing` or `running`:

Render the compact watch block below. Format rules:
- One extra space after each emoji (per CLAUDE.md markdown table rules — preserves alignment in terminal views).
- Elapsed formatted as `{H}h{M}m` from `ELAPSED_MS`.
- Last-tick age formatted as `{S}s` or `{M}m{S}s`. If age > 540s (2× tick cadence), append ` ⚠️  stale` as a soft warning (not a crash — per contract §3 write semantics).
- `LAST_EXIT` duration from `LAST_ELAPSED_MS` rendered as seconds.
- Wave/task lines are omitted when absent from state.
- Last non-empty `run.log` line is truncated to 80 chars.

```
⚙  Unattended — {MILESTONE}{ Wave {WAVE}}{ · Task {TASK}}
⏱  Iter {ITER} / {MAX_ITER} · elapsed {Hh Mm} · last tick {tickAge}
📊  Last exit: {LAST_EXIT} ({durationSec}s) · PID {PID} · session {SESSION}
📝  {truncated last log line or "(no output yet)"}
⏰  Next tick in 270s · Stop: /user:gsd-t-unattended-stop
```

(5 lines — the contract §8 format allows up to 10. Keep it tight.)

## Step 7: Reschedule via ScheduleWakeup (Non-Terminal Only)

**This step runs ONLY when Step 6 rendered a live watch block.** All terminal branches (Steps 3, 4, 5) must NOT reach this step — they STOP.

Call the harness `ScheduleWakeup` tool with these exact parameters:

- `delaySeconds`: `270` (fixed — inside the 5-minute prompt-cache TTL)
- `prompt`: `/user:gsd-t-unattended-watch`
- `reason`: `unattended tick {ITER}` — substituting the integer `ITER` from Step 2

Tool invocation pattern (make this real tool call, not a bash command):

```
ScheduleWakeup(
  delaySeconds: 270,
  prompt: "/user:gsd-t-unattended-watch",
  reason: "unattended tick {ITER}"
)
```

After the tool call, end the turn. Do NOT output a "Next Up" hint, do NOT continue with further steps, do NOT summarize. The watch block from Step 6 plus the ScheduleWakeup tool call IS the entire turn output.

## Notes

- **Stateless**: every tick re-reads state from disk. No memory between firings.
- **Terminal = STOP**: any terminal branch (3, 4, 5) ends the loop. The user relaunches via `/user:gsd-t-unattended` if needed.
- **Never spawn subagents**: this is a pure polling command — no Task, no TeamCreate, no observability logging block.
- **No branch guard, no pre-commit gate, no doc ripple**: this command does not modify any files.
- **Stale-tick tolerance**: if `lastTick` is >540s old but PID is still alive, warn soft (`⚠️  stale`) but still reschedule — the supervisor may be mid-worker.

$ARGUMENTS
