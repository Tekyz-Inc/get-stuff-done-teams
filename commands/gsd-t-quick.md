# GSD-T: Quick — Fast Task Execution with Contract Awareness

You are executing a small, focused task that doesn't need full phase planning. This is for bug fixes, config changes, small features, and ad-hoc work.

## Step 0: Launch via Subagent

To give this task a fresh context window and prevent compaction during consecutive quick runs, always execute via a Task subagent.

**If you are the orchestrating agent** (you received the slash command directly):

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

Spawn a fresh subagent using the Task tool:
```
subagent_type: general-purpose
prompt: "You are running gsd-t-quick for this request: {$ARGUMENTS}
Working directory: {current project root}
Read CLAUDE.md and .gsd-t/progress.md for project context, then execute gsd-t-quick starting at Step 1."
```

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted |` if missing):
`| {DT_START} | {DT_END} | gsd-t-quick | Step 0 | sonnet | {DURATION}s | quick: {task summary} | {TOKENS} | {COMPACTED} |`

Relay the subagent's summary to the user. **Do not execute Steps 1–5 yourself.**

**If you are the spawned subagent** (your prompt says "starting at Step 1"):
Continue to Step 1 below.

## Step 1: Load Context (Fast)

Read:
1. `CLAUDE.md`
2. `.gsd-t/progress.md` (if exists)
3. `.gsd-t/contracts/` (if exists) — scan for relevant contracts

## Step 1.5: Graph-Enhanced Scope Check

If `.gsd-t/graph/meta.json` exists (graph index is available):
1. Query `getDomainOwner` for the target function/file to verify it belongs to the expected domain
2. Query `getDomainBoundaryViolations` to check if the quick change would cross domain boundaries
3. If violations found, warn the user before proceeding — the change may need the full execute workflow

If graph is not available, skip this step.

## Step 2: Scope Check

Based on $ARGUMENTS, determine:
- Which domain does this touch? (check `.gsd-t/domains/*/scope.md` if available)
- Does it cross a domain boundary?
- Does it affect any existing contract?

### If it crosses boundaries or affects contracts:
Warn the user:
"This change touches {domain-1} and {domain-2} and may affect {contract}. 
Should I proceed with quick mode or use the full execute workflow?"

### If it's within a single domain or pre-partition:
Proceed.

## Step 3: Execute

### Deviation Rules

When you encounter unexpected situations:
1. **Bug blocking progress** → Fix it, up to 3 attempts. If still blocked, add to `.gsd-t/deferred-items.md` and skip.
2. **Missing dependency clearly needed** → Add minimum required code to unblock. Note in commit.
3. **Blocker (missing file, wrong API)** → Fix blocker and continue. Log if non-trivial.
4. **Architectural change required** → STOP. Apply Destructive Action Guard. Never self-approve.

**3-attempt limit**: Stop looping after 3 failed fix attempts. Log and move on.

1. Identify exactly which files need to change
2. **Destructive Action Guard**: Check if this task involves destructive or structural changes (DROP TABLE, removing columns, deleting data, replacing architecture patterns, removing working modules, changing schema in ways that conflict with existing data). If YES → STOP and present the change to the user with what exists today, what will change, what will break, and a safe migration path. Wait for explicit approval.
3. If a contract exists for the relevant interface, implement to match it
4. Make the change — **adapt new code to existing structures**, not the other way around
5. Verify it works
6. Commit: `[quick] {description}`

## Step 3.5: Emit Task Metrics

After committing, emit a task-metrics record for this quick task — run via Bash:
`node bin/metrics-collector.js --milestone {current-milestone-or-none} --domain {domain-or-quick} --task quick-{timestamp} --command quick --duration_s {elapsed} --tokens_used {estimated} --context_pct ${CTX_PCT:-0} --pass {true|false} --fix_cycles {0|N} --signal_type {pass-through|fix-cycle} --notes "[quick] {description}" 2>/dev/null || true`

Signal type: `pass-through` if task completed on first attempt; `fix-cycle` if rework was needed.

Emit task_complete event — run via Bash:
`node ~/.claude/scripts/gsd-t-event-writer.js --type task_complete --command gsd-t-quick --reasoning "signal_type={signal_type}, domain={domain}" --outcome {success|failure} || true`

## Step 4: Document Ripple (if GSD-T is active)

If `.gsd-t/progress.md` exists, assess what documentation was affected and update ALL relevant files:

### Always update:
1. **`.gsd-t/progress.md`** — Log the quick task in the Decision Log with date and description

### Check if affected:
2. **`.gsd-t/contracts/`** — Did you change an API endpoint, schema, or component interface? Update the contract
3. **Domain `scope.md`** — Did you add new files? Update the owning domain's scope
4. **Domain `constraints.md`** — Did you establish a new pattern or discover a "must not"? Add it
5. **`docs/requirements.md`** — Did this task add, change, or clarify a requirement? Update it
6. **`docs/architecture.md`** — Did this task change how components connect or data flows? Update it
7. **`docs/schema.md`** — Did this task modify the database? Update it
8. **`.gsd-t/techdebt.md`** — Did this task resolve a debt item? Mark it done. Did it reveal new debt? Add it
9. **`CLAUDE.md`** — Did this task establish a convention future work should follow? Add it

### Scan Doc Micro-Update (if `.gsd-t/scan/` exists):
Patch structural metadata in scan docs so they stay fresh between full scans. Near-zero cost — no LLM re-analysis.

For each scan doc that exists, apply only the relevant patches:
- **`.gsd-t/scan/architecture.md`** — Update file/directory counts, add new files/modules created
- **`.gsd-t/scan/quality.md`** — Mark resolved TODOs/FIXMEs, update test counts, append new files to Consumer Surfaces if applicable
- **`.gsd-t/scan/security.md`** — If a security finding was fixed, mark it `[RESOLVED]`
- **`.gsd-t/scan/business-rules.md`** — Append any new validation/auth/workflow rules added
- **`.gsd-t/scan/contract-drift.md`** — If contracts were updated, mark resolved drift items

Skip scan docs not affected by this task. Skip analytical sections — those require a full scan.

### Skip what's not affected — most quick tasks will only touch 1-2 of these.

## Step 5: Test & Verify (MANDATORY)

Quick does not mean skip testing. Before committing:

1. **Write/update tests for every new or changed code path**:
   - Unit tests: happy path + common edge cases + error cases
   - Playwright E2E specs (if UI/routes/flows/modes changed): create new specs for new functionality, update existing specs for changed behavior
   - Cover all modes/flags affected by this change
   - "No feature code without test code" applies to quick tasks too
2. **Run the FULL test suite** — not just affected tests:
   - All unit/integration tests
   - Full Playwright E2E suite (if configured)
   - Fix any failures before proceeding (up to 2 attempts)
3. **Verify against requirements**:
   - Does the change satisfy its intended requirement?
   - Did the change break any existing functionality? (the full test run catches this)
   - If a contract exists for the interface touched, does the code still match?
4. **No test framework?**: Set one up, or at minimum manually verify and document how in the commit message

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
