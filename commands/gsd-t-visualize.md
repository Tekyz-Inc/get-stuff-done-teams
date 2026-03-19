# GSD-T: Visualize — Launch Real-Time Agent Dashboard

You are launching the GSD-T real-time agent dashboard — an SSE-backed browser visualization of agent activity.

## Step 0: Launch via Subagent

When invoked directly by the user, spawn yourself as a Task subagent for a fresh context window.

**OBSERVABILITY LOGGING — before spawning:**

Run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

```
Task subagent (general-purpose, model: sonnet):
"Run the GSD-T visualize command. Read commands/gsd-t-visualize.md for your full instructions.
Arguments: {$ARGUMENTS}
Skip Step 0 — you are already the subagent."
```

**OBSERVABILITY LOGGING — after subagent returns:**

Run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`

Compute tokens:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END

Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted |` if missing):
`| {DT_START} | {DT_END} | gsd-t-visualize | Step 0 | sonnet | {DURATION}s | dashboard launched | {TOKENS} | {COMPACTED} |`

Return the subagent's output and stop. Only skip Step 0 if you are already running as a subagent.

## Step 1: Write command_invoked Event

Run via Bash:
```bash
node ~/.claude/scripts/gsd-t-event-writer.js --type command_invoked --command gsd-t-visualize --reasoning "Launching dashboard" || true
```

## Step 1.5: Graph Data for Dashboard

If `.gsd-t/graph/index.json` exists, the dashboard can render entity-relationship visualizations from the graph data. The dashboard server will detect and serve graph data automatically — no additional configuration needed.

## Step 2: Check $ARGUMENTS for "stop"

If `$ARGUMENTS` contains "stop", skip to **Step 5**. Otherwise continue to Step 3.

## Step 3: Check if Server is Already Running

Run via Bash:
```bash
if [ -f .gsd-t/dashboard.pid ]; then
  PID=$(cat .gsd-t/dashboard.pid)
  curl -sf http://localhost:7433/ping 2>/dev/null | grep -q '"ok"' && echo "SERVER_RUNNING=true" || echo "SERVER_RUNNING=false"
else
  echo "SERVER_RUNNING=false"
fi
```

If output is `SERVER_RUNNING=true`, skip Step 3a and go directly to Step 4.

### Step 3a: Start Server if Not Running

Run via Bash:
```bash
node ~/.claude/scripts/gsd-t-dashboard-server.js --detach || true
for i in 1 2 3 4 5; do
  curl -sf http://localhost:7433/ping 2>/dev/null | grep -q '"ok"' && break
  sleep 1
done
```

## Step 4: Open Browser

Run via Bash:
```bash
node -e "const {execFileSync}=require('child_process'); const url='http://localhost:7433'; try { if(process.platform==='win32'){execFileSync('cmd',['/c','start','',url],{stdio:'ignore'})}else{execFileSync(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'})} } catch(e) { console.error('Could not open browser:', e.message); }" || true
```

Report to the user: "Dashboard is running at http://localhost:7433 — browser opened."

## Step 5: Stop Handler

Run only when `$ARGUMENTS` contains "stop".

Run via Bash:
```bash
if [ -f .gsd-t/dashboard.pid ]; then
  PID=$(cat .gsd-t/dashboard.pid)
  curl -sf http://localhost:7433/stop 2>/dev/null || kill $PID 2>/dev/null || true
  rm -f .gsd-t/dashboard.pid
  echo "Dashboard server stopped"
else
  echo "No dashboard server running (no .gsd-t/dashboard.pid found)"
fi
```

## Document Ripple

Note: All 4 reference files (README.md, docs/GSD-T-README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md) are updated in Task 3 of Milestone 15, not here.

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
