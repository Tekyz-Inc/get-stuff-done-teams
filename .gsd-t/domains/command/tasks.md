# Tasks: command

## Summary
Create the `gsd-t-visualize` command (48th command), update `bin/gsd-t.js` to install dashboard files alongside existing utility scripts, and update all 4 reference files with the new command entry and count 47→48 / 43→44.

## Tasks

### Task 1: Create commands/gsd-t-visualize.md
- **Files**: `commands/gsd-t-visualize.md` (create — ≤200 lines, pure markdown, no frontmatter)
- **Contract refs**:
  - `.gsd-t/contracts/dashboard-server-contract.md` — server flags (--detach, --port, --stop), PID file path
  - `.gsd-t/contracts/event-schema-contract.md` — command_invoked event type, required fields
- **Must read before implementing**:
  - `commands/gsd-t-execute.md` — copy exact OBSERVABILITY LOGGING block (T_START/TOK_START/T_END/TOK_END Bash pattern + token-log.md append)
  - `commands/gsd-t-health.md` — Step 0 self-spawn subagent pattern
  - `.gsd-t/contracts/dashboard-server-contract.md` — CLI flags, PID file location, /ping endpoint
  - `bin/gsd-t.js` lines ~1355-1365 — `doChangelog()` function for OS platform detection pattern (open/xdg-open/start)
- **Dependencies**: BLOCKED by server Task 1 (gsd-t-dashboard-server.js must exist) + dashboard Task 1 (gsd-t-dashboard.html must exist) — Checkpoint 1 must pass first
- **Acceptance criteria**:
  - File ≤ 200 lines, pure markdown, no frontmatter
  - **Step 0**: Launch self as Task subagent (general-purpose, model: sonnet, bypassPermissions). OBSERVABILITY LOGGING:
    - Before spawn: run `T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`
    - After subagent returns: run `T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`, compute tokens (with compaction detection), append to `.gsd-t/token-log.md`
    - Only skip Step 0 if already running as subagent
  - **Step 1 (Write event)**: Run via Bash: `node ~/.claude/scripts/gsd-t-event-writer.js --type command_invoked --command gsd-t-visualize --reasoning "Launching dashboard" || true`
  - **Step 2 (Check server)**: If `.gsd-t/dashboard.pid` exists, run `curl -sf http://localhost:7433/ping 2>/dev/null` — if response contains `"ok"`, server is already running
  - **Step 3 (Start server if needed)**: If not running, run via Bash: `node ~/.claude/scripts/gsd-t-dashboard-server.js --detach || true`; wait up to 5s polling /ping for confirmation
  - **Step 4 (Open browser)**: Run via Bash: `node -e "const {execFileSync}=require('child_process'); const url='http://localhost:7433'; if(process.platform==='win32'){execFileSync('cmd',['/c','start','',url],{stdio:'ignore'})}else{execFileSync(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'})}" 2>/dev/null || true`
  - **Step 5 (Stop support)**: If `$ARGUMENTS` contains "stop" — read `.gsd-t/dashboard.pid`, run `curl -sf http://localhost:7433/stop || kill {pid} || true`, remove pid file
  - **Document Ripple**: Note: reference files updated in Task 3 (not this task)
  - **Auto-Clear**: Include `## Auto-Clear` section instructing `/clear` after command completes

### Task 2: Update bin/gsd-t.js — add dashboard files to UTILITY_SCRIPTS
- **Files**: `bin/gsd-t.js` (modify — add 2 entries to UTILITY_SCRIPTS array only)
- **Contract refs**: none (internal installer change)
- **Must read before implementing**:
  - `bin/gsd-t.js` lines ~519-537 — `UTILITY_SCRIPTS` array and `installUtilityScripts()` function (understand the copy-from-PKG_SCRIPTS pattern)
- **Dependencies**: Requires Task 1 (command file must exist before testing); also depends on server Task 1 and dashboard Task 1 (files must exist in scripts/ to copy)
- **Acceptance criteria**:
  - Change: `const UTILITY_SCRIPTS = ["gsd-t-tools.js", "gsd-t-statusline.js", "gsd-t-event-writer.js"];`
  - To: `const UTILITY_SCRIPTS = ["gsd-t-tools.js", "gsd-t-statusline.js", "gsd-t-event-writer.js", "gsd-t-dashboard-server.js", "gsd-t-dashboard.html"];`
  - `installUtilityScripts()` is unchanged — its loop already handles any file extension (copies src → dest)
  - No other changes to bin/gsd-t.js
  - `npm test` still passes (all 153+ tests pass — no installer logic changed, just array contents)

### Task 3: Update 4 reference files + test/filesystem.test.js count assertions
- **Files**:
  - `README.md` (modify — add gsd-t-visualize row, update counts 47→48 / 43→44)
  - `docs/GSD-T-README.md` (modify — add gsd-t-visualize row, update counts)
  - `templates/CLAUDE-global.md` (modify — add gsd-t-visualize row to Commands Reference table, update counts)
  - `commands/gsd-t-help.md` (modify — add visualize entry to UTILITIES section, update counts)
  - `test/filesystem.test.js` (modify — update count assertions 47→48 / 43→44)
- **Contract refs**: none (documentation only)
- **Must read before implementing**:
  - `commands/gsd-t-reflect.md` — use as reference for the row/entry format that was added for command #47 (same pattern for #48)
  - `README.md` — find gsd-t-reflect row and replicate pattern for gsd-t-visualize
  - `docs/GSD-T-README.md` — find gsd-t-reflect row and replicate pattern
  - `templates/CLAUDE-global.md` — find gsd-t-reflect row and replicate pattern
  - `commands/gsd-t-help.md` — find reflect entry and replicate pattern
  - `test/filesystem.test.js` — find the 47/43 assertions to update to 48/44
- **Dependencies**: Requires Task 1 (gsd-t-visualize.md must exist before documenting it)
- **Acceptance criteria**:
  - `README.md`: add `| `/user:gsd-t-visualize` | Launch browser dashboard — SSE server + React Flow agent visualization |` row in the Automation & Utilities section; update total command count 47→48 and GSD-T command count 43→44
  - `docs/GSD-T-README.md`: same row addition and count update
  - `templates/CLAUDE-global.md`: add `| `/user:gsd-t-visualize` | Launch browser dashboard | — |` row in Commands Reference table; update counts 47→48 / 43→44
  - `commands/gsd-t-help.md`: add `visualize` line in UTILITIES section + `### visualize Command Summary` entry consistent with existing command summaries
  - `test/filesystem.test.js`: change all assertions that check count 47 → 48 and GSD-T count 43 → 44 (typically 2-4 assertions)
  - `npm test` all 153+ tests pass after count updates

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 0
- Blocked tasks (waiting on other domains): 1 (Task 1 blocked by Checkpoint 1; Tasks 2 and 3 blocked by Task 1)
- Estimated checkpoints: 2 (Checkpoint 1 unblocks Task 1; Checkpoint 2 is final verification)
