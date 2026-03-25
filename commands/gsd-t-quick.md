# GSD-T: Quick — Fast Task Execution with Contract Awareness

You are executing a small, focused task that doesn't need full phase planning. This is for bug fixes, config changes, small features, and ad-hoc work.

## Step 0: Launch via Subagent

To give this task a fresh context window and prevent compaction during consecutive quick runs, always execute via a Task subagent.

**If you are the orchestrating agent** (you received the slash command directly):

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

**Stack Rules Detection (before spawning subagent):**
Run via Bash to detect project stack and collect matching rules:
`GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t; STACKS_DIR="$GSD_T_DIR/templates/stacks"; STACK_RULES=""; if [ -d "$STACKS_DIR" ]; then for f in "$STACKS_DIR"/_*.md; do [ -f "$f" ] && STACK_RULES="${STACK_RULES}$(cat "$f")"$'\n\n'; done; if [ -f "package.json" ]; then grep -q '"react-native"' package.json 2>/dev/null && [ -f "$STACKS_DIR/react-native.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/react-native.md")"$'\n\n'; grep -q '"react"' package.json 2>/dev/null && ! grep -q '"react-native"' package.json 2>/dev/null && [ -f "$STACKS_DIR/react.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/react.md")"$'\n\n'; grep -q '"next"' package.json 2>/dev/null && [ -f "$STACKS_DIR/nextjs.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/nextjs.md")"$'\n\n'; grep -q '"vue"' package.json 2>/dev/null && [ -f "$STACKS_DIR/vue.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/vue.md")"$'\n\n'; (grep -q '"typescript"' package.json 2>/dev/null || [ -f "tsconfig.json" ]) && [ -f "$STACKS_DIR/typescript.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/typescript.md")"$'\n\n'; grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/node-api.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/node-api.md")"$'\n\n'; grep -q '"tailwindcss"' package.json 2>/dev/null && [ -f "$STACKS_DIR/tailwind.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/tailwind.md")"$'\n\n'; grep -q '"vite"' package.json 2>/dev/null && [ -f "$STACKS_DIR/vite.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/vite.md")"$'\n\n'; grep -q '"@supabase/supabase-js"' package.json 2>/dev/null && [ -f "$STACKS_DIR/supabase.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/supabase.md")"$'\n\n'; grep -q '"firebase"' package.json 2>/dev/null && [ -f "$STACKS_DIR/firebase.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/firebase.md")"$'\n\n'; grep -qE '"(graphql|@apollo/client|urql)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/graphql.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/graphql.md")"$'\n\n'; grep -q '"zustand"' package.json 2>/dev/null && [ -f "$STACKS_DIR/zustand.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/zustand.md")"$'\n\n'; grep -q '"@reduxjs/toolkit"' package.json 2>/dev/null && [ -f "$STACKS_DIR/redux.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/redux.md")"$'\n\n'; grep -q '"neo4j-driver"' package.json 2>/dev/null && [ -f "$STACKS_DIR/neo4j.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/neo4j.md")"$'\n\n'; grep -qE '"(pg|prisma|drizzle-orm|knex)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/postgresql.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/postgresql.md")"$'\n\n'; grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/rest-api.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/rest-api.md")"$'\n\n'; fi; ([ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "Pipfile" ]) && [ -f "$STACKS_DIR/python.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/python.md")"$'\n\n'; ([ -f "requirements.txt" ] && grep -q "psycopg" requirements.txt 2>/dev/null || [ -f "pyproject.toml" ] && grep -q "psycopg" pyproject.toml 2>/dev/null) && [ -f "$STACKS_DIR/postgresql.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/postgresql.md")"$'\n\n'; ([ -f "requirements.txt" ] && grep -q "neo4j" requirements.txt 2>/dev/null) && [ -f "$STACKS_DIR/neo4j.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/neo4j.md")"$'\n\n'; [ -f "pubspec.yaml" ] && [ -f "$STACKS_DIR/flutter.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/flutter.md")"$'\n\n'; [ -f "Dockerfile" ] && [ -f "$STACKS_DIR/docker.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/docker.md")"$'\n\n'; [ -d ".github/workflows" ] && [ -f "$STACKS_DIR/github-actions.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/github-actions.md")"$'\n\n'; ([ -f "playwright.config.ts" ] || [ -f "playwright.config.js" ]) && [ -f "$STACKS_DIR/playwright.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/playwright.md")"$'\n\n'; [ -f "go.mod" ] && [ -f "$STACKS_DIR/go.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/go.md")"$'\n\n'; [ -f "Cargo.toml" ] && [ -f "$STACKS_DIR/rust.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/rust.md")"$'\n\n'; fi`

If STACK_RULES is non-empty, append to the subagent prompt:
```
## Stack Rules (MANDATORY — violations fail this task)

{STACK_RULES}

These standards have the same enforcement weight as contract compliance.
Violations are task failures, not warnings.
```

If STACK_RULES is empty (no templates/stacks/ dir or no matches), skip silently.

Spawn a fresh subagent using the Task tool:
```
subagent_type: general-purpose
prompt: "You are running gsd-t-quick for this request: {$ARGUMENTS}
Working directory: {current project root}
Read CLAUDE.md and .gsd-t/progress.md for project context, then execute gsd-t-quick starting at Step 1.
{STACK_RULES block — if non-empty, append the ## Stack Rules section defined above; omit if empty}"
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
   - **Functional tests only** — every E2E assertion must verify an action produced the correct outcome (state changed, data loaded, content updated). Tests that only check element existence (`isVisible`, `toBeEnabled`) are shallow/layout tests and are not acceptable. If a test would pass on an empty HTML page with the right IDs, rewrite it.
2. **Run ALL configured test suites** — not just affected tests, not just one suite:
   a. Detect all runners: check for vitest/jest config, playwright.config.*, cypress.config.*
   b. Run EVERY detected suite. Unit tests alone are NEVER sufficient when E2E exists.
   c. If `playwright.config.*` exists → `npx playwright test` (full suite)
   d. Report ALL results: "Unit: X/Y pass | E2E: X/Y pass"
   - Fix any failures before proceeding (up to 2 attempts)
3. **Verify against requirements**:
   - Does the change satisfy its intended requirement?
   - Did the change break any existing functionality? (the full test run catches this)
   - If a contract exists for the interface touched, does the code still match?
4. **No test framework?**: Set one up, or at minimum manually verify and document how in the commit message

## Step 6: Doc-Ripple (Automated)

After all work is committed but before reporting completion:

1. Run threshold check — read `git diff --name-only HEAD~1` and evaluate against doc-ripple-contract.md trigger conditions
2. If SKIP: log "Doc-ripple: SKIP — {reason}" and proceed to completion
3. If FIRE: spawn doc-ripple agent:

⚙ [{model}] gsd-t-doc-ripple → blast radius analysis + parallel updates

Task subagent (general-purpose, model: sonnet):
"Execute the doc-ripple workflow per commands/gsd-t-doc-ripple.md.
Git diff context: {files changed list}
Command that triggered: quick
Produce manifest at .gsd-t/doc-ripple-manifest.md.
Update all affected documents.
Report: 'Doc-ripple: {N} checked, {N} updated, {N} skipped'"

4. After doc-ripple returns, verify manifest exists and report summary inline

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
