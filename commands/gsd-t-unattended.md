# GSD-T: Unattended — Launch the Background Supervisor

**Model**: sonnet (pre-flight reasoning + spawn coordination)

You are launching the GSD-T unattended supervisor — a detached background process that drives the active milestone to completion by spawning `claude -p` worker iterations in a relay, without human intervention. The supervisor runs outside the interactive Claude session and survives `/clear`, terminal close, and session expiry.

This command performs pre-flight checks, spawns the supervisor via the cross-platform helper, verifies liveness, displays the initial status block, and schedules the first watch tick. It then returns — the watch loop takes over.

See `unattended-supervisor-contract.md` §7 (Launch Handshake), §4 (Status Enum), §3 (state.json schema).

## Step 1: Pre-Flight Checks

### 1a: Verify GSD-T Project

Run via Bash:

```bash
if [ ! -f ".gsd-t/progress.md" ]; then
  echo "ERROR: .gsd-t/progress.md not found — not a GSD-T project. Run /gsd-t-init first."
  exit 1
fi
```

If the file is missing, stop immediately with the error above. Do NOT proceed.

### 1b: Check for an Already-Running Supervisor

Run via Bash:

```bash
node -e "
const fs = require('fs');
const PID_FILE = '.gsd-t/.unattended/supervisor.pid';

if (!fs.existsSync(PID_FILE)) {
  console.log('PID_RUNNING=false');
  process.exit(0);
}

let pid = null;
try {
  pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
} catch (_) {}

if (!pid || !Number.isFinite(pid)) {
  console.log('PID_RUNNING=false');
  process.exit(0);
}

let alive = false;
try { process.kill(pid, 0); alive = true; }
catch (e) { alive = e.code === 'EPERM'; }

console.log('PID_RUNNING=' + alive);
console.log('PID=' + pid);
"
```

If `PID_RUNNING=true`, **STOP** and print:

```
🔴  Unattended supervisor is already running (PID {PID}).

    Use /gsd-t-unattended-stop to request a clean halt, then wait for the
    watch loop to confirm it has stopped before relaunching.

    To just watch the current run: /gsd-t-unattended-watch
```

Do NOT spawn a second supervisor. End the turn.

### 1c: Parse Arguments and Resolve Milestone

Parse `$ARGUMENTS` for:
- `--hours=N` — wall-clock cap in hours (default: `24`)
- `--milestone=LABEL` — milestone to drive (default: read from `.gsd-t/progress.md`)
- `--max-iterations=N` — iteration cap (default: `200`)
- `--dry-run` — preflight only; print what would be spawned, do NOT spawn

**Persistent overrides**: create `.gsd-t/.unattended/config.json` to change
defaults per-project (caps, protected branches, dirty-tree whitelist). CLI
flags always win over the config file. See `docs/unattended-config.md` for
the full schema and common recipes (e.g. `{"protectedBranches": []}` for
solo projects that commit directly to main).

Run via Bash to read the current milestone from progress.md:

```bash
node -e "
const fs = require('fs');
let milestone = '';
try {
  const text = fs.readFileSync('.gsd-t/progress.md', 'utf8');
  // Look for '## Current Milestone: M36' or 'Milestone: M36' patterns
  const m = text.match(/(?:##\s*)?(?:Current\s+)?Milestone[:\s]+(\S+)/i);
  if (m) milestone = m[1].replace(/[^A-Za-z0-9_.-]/g, '');
} catch (_) {}
console.log('MILESTONE=' + (milestone || 'unknown'));
"
```

Also read the project name from `package.json` (best-effort):

```bash
node -e "
try {
  const p = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
  console.log('PROJECT_NAME=' + (p.name || ''));
} catch (_) {
  console.log('PROJECT_NAME=');
}
"
```

### 1c.1: Readiness Bootstrap (auto-complete pending state)

**The unattended command must work from ANY workflow state.** If the user says "run unattended," that is an instruction to proceed — not an invitation to ask more questions. Regardless of where the project is in the GSD-T workflow (mid-discussion, pre-milestone, post-partition, between phases), the unattended supervisor should be able to pick up and continue.

The `/gsd-t-resume` worker already knows how to chain through phases automatically. The only thing the unattended command needs is a milestone label in `progress.md` so the supervisor has a target.

**If `MILESTONE=unknown`** (no active milestone found in progress.md):

1. **Look for a milestone** — check in priority order:
   a. `$ARGUMENTS` — if `--milestone=LABEL` was passed, use it.
   b. Conversation context — if the user discussed a milestone, feature, or work goal in this session, extract the milestone label from that discussion.
   c. `.gsd-t/progress.md` — check for any milestone mentioned anywhere (even if not in the standard "Current Milestone" format, e.g., a Decision Log entry like "created milestone M8").
   d. `.gsd-t/domains/` — if domains exist, infer the milestone from directory names or scope files.

2. **If a milestone is identifiable**:
   - Ensure `.gsd-t/progress.md` has a `## Current Milestone` section with the label and status `IN PROGRESS`. If missing, add it.
   - Run `gsd-t-init` silently to fill in any missing required files (it skips existing files).
   - Print: `ℹ️  Auto-bootstrapped milestone {LABEL} — supervisor workers will continue from current phase.`
   - Re-read the milestone label.

3. **If no milestone is identifiable at all**:
   - Print:
     ```
     ❌  No active milestone found and none identifiable from context.

         Specify one explicitly: /gsd-t-unattended --milestone=M1
     ```
   - **STOP.** Do NOT spawn.

**If `MILESTONE` was found but progress.md shows a pre-execution phase** (e.g., milestone was just created, no partition/plan/domains yet): that's fine — proceed with the spawn. The `/gsd-t-resume` worker will read the current state and advance through partition → plan → execute → ... automatically. The unattended command should never second-guess the resume logic or add pre-conditions beyond "a milestone exists."

### 1d: Check for Stale Stop Sentinel

If `.gsd-t/.unattended/stop` exists from a previous run, remove it before spawning (per contract §10 — the launch command cleans the stale sentinel):

```bash
if [ -f ".gsd-t/.unattended/stop" ]; then
  rm ".gsd-t/.unattended/stop"
  echo "STALE_SENTINEL=removed"
else
  echo "STALE_SENTINEL=none"
fi
```

If the sentinel was removed, print: `ℹ️  Removed stale stop sentinel from previous run.`

### 1e: Verify Required Software is Installed

The unattended supervisor depends on platform-specific helpers. Check them up front and fail fast with clear install instructions rather than crashing mid-run.

Run via Bash:

```bash
node -e "
const { execSync } = require('child_process');
const os = require('os');
const platform = os.platform();

function has(cmd) {
  try {
    const which = platform === 'win32' ? 'where' : 'command -v';
    execSync(which + ' ' + cmd, { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}

const missing = [];
const warnings = [];

// REQUIRED on all platforms
if (!has('node')) missing.push({ name: 'node', install: 'https://nodejs.org (>= 16)' });
if (!has('claude')) {
  missing.push({
    name: 'claude',
    install: platform === 'win32'
      ? 'npm install -g @anthropic-ai/claude-code (then ensure claude.cmd is on PATH)'
      : 'npm install -g @anthropic-ai/claude-code'
  });
}
if (!has('git')) missing.push({ name: 'git', install: 'https://git-scm.com/downloads' });

// PLATFORM-SPECIFIC (warnings only — supervisor runs without them, just less resilient)
if (platform === 'darwin') {
  if (!has('caffeinate')) warnings.push('caffeinate (macOS built-in) — missing means sleep may interrupt long runs');
} else if (platform === 'linux') {
  if (!has('systemd-inhibit') && !has('caffeine')) {
    warnings.push('systemd-inhibit or caffeine — missing means sleep/screen-lock may interrupt long runs');
  }
  if (!has('notify-send')) {
    warnings.push('notify-send (libnotify-bin) — missing means no desktop notifications on milestone events');
  }
} else if (platform === 'win32') {
  warnings.push('Windows: sleep prevention uses PowerShell SetThreadExecutionState — no external helper required');
  warnings.push('Windows: desktop notifications use BurntToast PowerShell module — install with: Install-Module BurntToast');
}

if (missing.length > 0) {
  console.log('PREFLIGHT=fail');
  console.log('MISSING=' + JSON.stringify(missing));
} else {
  console.log('PREFLIGHT=ok');
}
if (warnings.length > 0) {
  console.log('WARNINGS=' + JSON.stringify(warnings));
}
"
```

If `PREFLIGHT=fail`, **STOP** and print:

```
❌  Required software missing — cannot launch unattended supervisor.

    Missing:
{for each item in MISSING:}
      • {name}
        Install: {install}

    Install the missing software and retry: /gsd-t-unattended
```

End the turn. Do NOT spawn.

If `WARNINGS` were emitted, print them as a non-blocking advisory before proceeding:

```
⚠️  Platform advisories (non-blocking):
{for each warning:}
      • {warning}

    Supervisor will still launch, but consider installing these for best reliability.
```

## Step 2: Spawn the Detached Supervisor

⚙ [sonnet] gsd-t-unattended → spawning detached supervisor

**Before spawn — read starting context tokens (observability bracket):**

```bash
T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")
T0_TOKENS=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).inputTokens||0))}catch(_){process.stdout.write('0')}")
T0_PCT=$(node -e "try{const tb=require('./bin/token-budget.cjs');process.stdout.write(String(tb.getSessionStatus('.').pct||0))}catch(_){process.stdout.write('0')}")
```

If `--dry-run` was specified, print:

```
🔎  Dry-run mode — would spawn:
    node bin/gsd-t-unattended.cjs --hours={hours} --milestone={milestone} --max-iterations={maxIterations}
    Project: {cwd}

    No supervisor launched. Remove --dry-run to proceed.
```

Then end the turn.

Otherwise, run the actual spawn:

```bash
node -e "
const path = require('path');
const { spawnSupervisor } = require('./bin/gsd-t-unattended-platform.cjs');

// Parse CLI args forwarded from the launch command
const hours = parseInt(process.env.GSD_T_HOURS || '24', 10) || 24;
const milestone = process.env.GSD_T_MILESTONE || '';
const maxIterations = parseInt(process.env.GSD_T_MAX_ITERATIONS || '200', 10) || 200;

const binPath = path.resolve(__dirname, 'bin', 'gsd-t-unattended.cjs');
const cwd = process.cwd();

const extraArgs = [];
if (hours !== 24)         extraArgs.push('--hours=' + hours);
if (milestone)            extraArgs.push('--milestone=' + milestone);
if (maxIterations !== 200) extraArgs.push('--max-iterations=' + maxIterations);

const result = spawnSupervisor({ binPath, args: extraArgs, cwd });
console.log('SPAWNED_PID=' + result.pid);
" \
  GSD_T_HOURS={hours} \
  GSD_T_MILESTONE={milestone} \
  GSD_T_MAX_ITERATIONS={maxIterations}
```

Capture `SPAWNED_PID` from the output.

**After spawn — record observability bracket:**

```bash
T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))
T1_TOKENS=$(node -e "try{const s=require('fs').readFileSync('.gsd-t/.context-meter-state.json','utf8');process.stdout.write(String(JSON.parse(s).inputTokens||0))}catch(_){process.stdout.write('0')}")
T1_PCT=$(node -e "try{const tb=require('./bin/token-budget.cjs');process.stdout.write(String(tb.getSessionStatus('.').pct||0))}catch(_){process.stdout.write('0')}")
COUNTER=$(node bin/task-counter.cjs status 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s).count||''))}catch(_){process.stdout.write('')}})")
```

Append to `.gsd-t/token-log.md` (create with header if missing):

```bash
node -e "
const fs = require('fs');
const LOG = '.gsd-t/token-log.md';
const header = '| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Tasks-Since-Reset |\n|---|---|---|---|---|---|---|---|---|---|\n';
const row = '| ${DT_START} | ${DT_END} | gsd-t-unattended | Step 2 | sonnet | ${DURATION}s | supervisor spawned PID ${SPAWNED_PID} | | | ${COUNTER} |\n';
if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, header);
fs.appendFileSync(LOG, row);
"
```

## Step 3: Verify Supervisor Liveness

Wait up to 2 seconds for the supervisor to write its PID file and transition out of `initializing`:

```bash
node -e "
const fs = require('fs');
const path = require('path');

const PID_FILE = '.gsd-t/.unattended/supervisor.pid';
const STATE_FILE = '.gsd-t/.unattended/state.json';
const LOG_FILE = '.gsd-t/.unattended/run.log';
const SPAWNED_PID = parseInt(process.env.SPAWNED_PID || '0', 10);
const WAIT_MS = 2000;
const POLL_MS = 100;

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

let alive = false;
let pidFromFile = null;
const deadline = Date.now() + WAIT_MS;

while (Date.now() < deadline) {
  // Check process liveness via process.kill(pid, 0)
  if (SPAWNED_PID > 0) {
    try { process.kill(SPAWNED_PID, 0); alive = true; } catch (e) {
      alive = e.code === 'EPERM';
    }
  }
  // Also try reading the PID file the supervisor writes
  if (fs.existsSync(PID_FILE)) {
    try { pidFromFile = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10); } catch (_) {}
  }
  if (alive || pidFromFile) break;
  sleep(POLL_MS);
}

if (!alive && !pidFromFile) {
  console.log('LIVENESS=dead');
  // Emit last few lines of run.log if it exists
  if (fs.existsSync(LOG_FILE)) {
    try {
      const txt = fs.readFileSync(LOG_FILE, 'utf8');
      const tail = txt.split('\n').filter(l => l.trim()).slice(-20).join('\n');
      console.log('LOG_TAIL=' + JSON.stringify(tail));
    } catch (_) { console.log('LOG_TAIL='); }
  } else {
    console.log('LOG_TAIL=');
  }
} else {
  console.log('LIVENESS=ok');
  console.log('PID_FROM_FILE=' + (pidFromFile || SPAWNED_PID));
}
" SPAWNED_PID=${SPAWNED_PID}
```

If `LIVENESS=dead`, the supervisor crashed at startup. Print diagnostics and **STOP**:

```
💥  Supervisor crashed at startup (PID {SPAWNED_PID} no longer alive after 2s).

    Startup diagnostics (run.log tail):
    ──────────────────────────────────────────────────────────────
    {LOG_TAIL}
    ──────────────────────────────────────────────────────────────

    Common causes:
      • Missing Node.js or claude binary on PATH
      • .gsd-t/progress.md has no active milestone
      • Protected branch or dirty worktree rejected by safety rails
      • Permissions error on .gsd-t/.unattended/ directory

    Fix the issue above and retry: /gsd-t-unattended
```

End the turn without scheduling a watch tick.

## Step 4: Display Initial Status Block

Print the launch confirmation block:

```
🟢  Unattended supervisor launched.

    PID:            {PID_FROM_FILE}
    Project:        {PROJECT_NAME}
    Milestone:      {milestone}
    Max hours:      {hours}
    Max iterations: {maxIterations}
    Log:            .gsd-t/.unattended/run.log
    State:          .gsd-t/.unattended/state.json
    Watch:          ScheduleWakeup every 270s

    The supervisor is running detached — it survives /clear and terminal close.
    Stop gracefully: /gsd-t-unattended-stop
    Watch manually:  /gsd-t-unattended-watch
```

## Step 5: Schedule the First Watch Tick

Call the harness `ScheduleWakeup` tool with these exact parameters:

- `delaySeconds`: `270` (fixed — inside the 5-minute prompt-cache TTL)
- `prompt`: `/gsd-t-unattended-watch`
- `reason`: `first unattended tick`

Tool invocation pattern (make this a real tool call, not a bash command):

```
ScheduleWakeup(
  delaySeconds: 270,
  prompt: "/gsd-t-unattended-watch",
  reason: "first unattended tick"
)
```

After the tool call, end the turn. The in-session watch loop takes over from here. Do NOT output a "Next Up" block — this is a self-rescheduling loop, not a phase workflow.

## Notes

- **Singleton**: only one supervisor per project at a time. PID collision → refuse with "already running" message.
- **Stale stop sentinel**: if `.gsd-t/.unattended/stop` exists from a prior run, Step 1d removes it before spawning.
- **Platform helper**: uses `spawnSupervisor` from `bin/gsd-t-unattended-platform.cjs` — never hand-rolls `child_process.spawn` directly. This handles macOS/Linux/Windows differences.
- **Dry-run**: `--dry-run` prints the would-be invocation without spawning. Useful for validating flags before a long overnight run.
- **No doc ripple, no pre-commit gate**: this command spawns a background process; it does not modify any source files or contracts.
- **watch command is stateless**: after this command returns, every `/gsd-t-unattended-watch` tick re-reads state from disk. There is no in-memory state to preserve.

$ARGUMENTS
