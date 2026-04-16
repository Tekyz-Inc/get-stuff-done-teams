# GSD-T: Unattended Stop — Signal Supervisor to Halt

**Model**: haiku (trivial sentinel toucher — no reasoning needed)

You are signaling the unattended supervisor to halt cleanly between worker iterations by writing the stop sentinel file at `.gsd-t/.unattended/stop`. This is a fire-and-forget command: no PID kill, no wait, no confirmation prompt.

See `unattended-supervisor-contract.md` §10 (Stop Mechanism) for the full handshake.

## Step 1: Check Supervisor State Directory Exists

Run via Bash:

```bash
if [ ! -d ".gsd-t/.unattended" ]; then
  echo "No supervisor state directory — nothing to stop."
  exit 0
fi
```

If the directory does not exist, exit 0 (not an error — there is simply nothing to signal).

## Step 2: Check Supervisor PID File Exists

Run via Bash:

```bash
if [ ! -f ".gsd-t/.unattended/supervisor.pid" ]; then
  echo "No supervisor running in this project (no PID file at .gsd-t/.unattended/supervisor.pid)."
  exit 0
fi
```

If the PID file is missing, the supervisor has already finalized cleanly. Exit 0 without writing the sentinel.

## Step 3: Read Current Session Snapshot

Run via Bash to grab the session ID and current iteration from `state.json` (best-effort — tolerate missing or partial state):

```bash
node -e "
try {
  const s = JSON.parse(require('fs').readFileSync('.gsd-t/.unattended/state.json', 'utf8'));
  console.log('SESSION=' + (s.sessionId || 'unknown'));
  console.log('ITER=' + (s.iter ?? 'unknown'));
  console.log('STATUS=' + (s.status || 'unknown'));
} catch (e) {
  console.log('SESSION=unknown');
  console.log('ITER=unknown');
  console.log('STATUS=unknown');
}
"
```

## Step 4: Write the Stop Sentinel

Write `.gsd-t/.unattended/stop` containing the current ISO timestamp as the body (for diagnostics — the supervisor only checks for the file's existence, not its contents):

```bash
node -e "require('fs').writeFileSync('.gsd-t/.unattended/stop', new Date().toISOString())"
```

This is race-free, terminal-close-safe, and language-agnostic (per contract §10).

## Step 5: Print Confirmation

Output the confirmation block:

```
🛑  Stop sentinel written. Supervisor will halt after the current worker finishes (up to ~5 min).

   Session: {SESSION from Step 3}
   Iter:    {ITER from Step 3}
   Status:  {STATUS from Step 3}

   The current worker runs to completion. Stop is honored at the next pre-worker checkpoint.
   The watch loop (if running) will detect status=stopped on its next tick and stop itself.
   If a watch tick fires before the supervisor processes the sentinel, it may reschedule once
   more — this is expected. It will catch the terminal status on the following tick.
```

## Step 6: Return Immediately

Do NOT wait for the supervisor to acknowledge. Do NOT poll state.json. Do NOT call ScheduleWakeup. The supervisor will finalize state.json with `status=stopped` on its next iteration check — that's the watch loop's job to observe, not this command's.

$ARGUMENTS
