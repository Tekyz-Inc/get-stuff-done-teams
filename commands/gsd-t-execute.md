# GSD-T: Execute — Run Domain Tasks (Solo or Parallel)

You are the lead agent coordinating task execution across domains. Choose solo or team mode based on the plan.

## Step 1: Load State

Read:
1. `CLAUDE.md` — check for **Branch Guard** (`Expected branch` field)
2. `.gsd-t/progress.md`
3. `.gsd-t/contracts/` — all contracts
4. `.gsd-t/contracts/integration-points.md` — dependency graph
5. `.gsd-t/domains/*/tasks.md` — all task lists

**Branch check (before any work):**
Run `git branch --show-current`. If CLAUDE.md declares an expected branch and you're on a different branch, STOP and warn the user. Do NOT execute tasks on the wrong branch.

Identify:
- Which tasks are already complete (check progress.md)
- Which tasks are unblocked (no pending dependencies)
- Which tasks are blocked (waiting on checkpoints)

## Step 1.5: Graph-Enhanced Domain Isolation Check (if available)

If `.gsd-t/graph/meta.json` exists, run graph queries before execution begins:

1. **Reindex** (if stale): `query('reindex', { force: false })` — ensure graph reflects current code
2. **Domain boundary check**: For each domain about to execute, `query('getEntitiesByDomain', { domain })` — verify the domain's entities match its scope.md
3. **Pre-execution snapshot**: Record entity counts per domain — after execution, compare to detect scope creep (domain agent modified entities outside its domain)
4. **Cross-domain dependencies**: `query('getDomainBoundaryViolations', {})` — flag existing violations before work begins so they aren't confused with new violations introduced during execution

After each domain completes, re-run `getDomainBoundaryViolations` and diff against pre-execution snapshot. If new violations appear, flag them immediately before proceeding to the next domain.

## Step 2: QA Subagent

In solo mode, QA runs inside each domain subagent (see Step 3). In team mode, the lead spawns QA subagents at each domain checkpoint using the pattern below.

**QA subagent prompt:**
```
Task subagent (general-purpose, model: haiku):
"Run the full test suite for this project and report pass/fail counts.
Read .gsd-t/contracts/ for contract definitions.
Write edge case tests for any new code paths in this task: {task description}.
Report: test pass/fail status and any coverage gaps found."
```

If QA found issues, append each to `.gsd-t/qa-issues.md` (create with header `| Date | Command | Step | Model | Duration(s) | Severity | Finding |` if missing):
`| {DT_START} | gsd-t-execute | Step 2 | haiku | {DURATION}s | {severity} | {finding} |`

## Step 3: Choose Execution Mode

### Wave Scheduling (read first)

Before choosing solo or team mode, read the `## Wave Execution Groups` section in `.gsd-t/contracts/integration-points.md` (added by the plan phase).

**If wave groups are present**:
- Execute wave-by-wave: complete all tasks in Wave 1 before starting Wave 2
- Within each wave, tasks marked as parallel-safe can run concurrently (team mode) or be interleaved (solo mode)
- At each wave boundary: run the CHECKPOINT — verify contract compliance — before proceeding
- File conflict detection: if two tasks in the same wave list the same file in their `scope.md` ownership, move one to the next wave

**If no wave groups are defined** (older plans): fall back to the `Execution Order` list.

### Solo Mode (default) — Domain Task-Dispatcher Pattern

Each domain's work runs via a lightweight domain task-dispatcher. The dispatcher spawns one Task subagent PER TASK within that domain, giving each task a completely fresh context window with only the minimum required context. The orchestrator (this agent) stays lightweight — it only spawns dispatchers, collects summaries, verifies checkpoints, and updates progress.

**Context provided to each task subagent (fresh-dispatch-contract.md payload):**
- `scope.md` for the domain
- Relevant contracts (only those referenced by the task)
- The single task from `tasks.md`
- Graph context for the task's files (if available)
- Up to 5 prior task summaries (10-20 lines each, most recent first)
- Past failure/learning entries for this domain (max 5 lines)

**OBSERVABILITY LOGGING (MANDATORY) — repeat for every task subagent spawn:**

Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`

Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END

Compute context utilization — run via Bash:
`if [ "${CLAUDE_CONTEXT_TOKENS_MAX:-0}" -gt 0 ]; then CTX_PCT=$(echo "scale=1; ${CLAUDE_CONTEXT_TOKENS_USED:-0} * 100 / ${CLAUDE_CONTEXT_TOKENS_MAX}" | bc); else CTX_PCT="N/A"; fi`

Alert on context thresholds (display to user inline):
- If CTX_PCT is a number and >= 85: `echo "🔴 CRITICAL: Context at ${CTX_PCT}% — compaction likely. Task MUST be split."`
- If CTX_PCT is a number and >= 70: `echo "⚠️ WARNING: Context at ${CTX_PCT}% — approaching compaction threshold. Consider splitting in plan."`

Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |` if missing):
`| {DT_START} | {DT_END} | gsd-t-execute | task:{task-id} | sonnet | {DURATION}s | {pass/fail} | {TOKENS} | {COMPACTED} | {domain-name} | task-{task-id} | {CTX_PCT} |`

**For each domain (in wave order), run the domain task-dispatcher:**

**Pre-dispatch experience retrieval (before dispatching each domain's tasks):**
Run via Bash:
`grep -i "\[failure\]\|\[learning\]" .gsd-t/progress.md | grep -i "{domain-name}" | tail -5`

If results found:
- Store as `PAST_FAILURES` — prepend to each task subagent prompt (max 5 lines)
- Write event via Bash: `node ~/.claude/scripts/gsd-t-event-writer.js --type experience_retrieval --command gsd-t-execute --reasoning "{N past failures found for {domain-name}}" --outcome null || true`

If no results found: proceed normally (no warning block, no event write).

**Pre-flight intelligence check (before dispatching each domain's tasks):**
Run via Bash:
`node -e "const m = require('./bin/metrics-collector.js'); const w = m.getPreFlightWarnings('{domain-name}'); if(w.length) w.forEach(x => console.log('⚠️ ' + x));" 2>/dev/null || true`

Display any warnings inline (non-blocking — execution proceeds regardless).

**Active Rule Injection (before dispatching each domain's tasks):**
Run via Bash:
`node -e "const re = require('./bin/rule-engine.js'); const m = re.evaluateRules('{domain-name}', { projectDir: '.' }); if(m.length) m.forEach(x => console.log('RULE: ' + x.rule.name + ' — ' + x.rule.description + ' [' + x.severity + ']')); else console.log('No active rules for {domain-name}');" 2>/dev/null || true`

If rules fire: inject up to 10 lines of rule warnings into each task subagent prompt (concise format: `RULE: {name} — {description}`). These inform the subagent of known patterns — non-blocking.
If no rules fire: log "No active rules for {domain-name}" and continue.

**Stack Rules Detection (before spawning subagent):**
Run via Bash to detect project stack and collect matching rules:
`GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t; STACKS_DIR="$GSD_T_DIR/templates/stacks"; STACK_RULES=""; if [ -d "$STACKS_DIR" ]; then for f in "$STACKS_DIR"/_*.md; do [ -f "$f" ] && STACK_RULES="${STACK_RULES}$(cat "$f")"$'\n\n'; done; if [ -f "package.json" ]; then grep -q '"react-native"' package.json 2>/dev/null && [ -f "$STACKS_DIR/react-native.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/react-native.md")"$'\n\n'; grep -q '"react"' package.json 2>/dev/null && ! grep -q '"react-native"' package.json 2>/dev/null && [ -f "$STACKS_DIR/react.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/react.md")"$'\n\n'; grep -q '"next"' package.json 2>/dev/null && [ -f "$STACKS_DIR/nextjs.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/nextjs.md")"$'\n\n'; grep -q '"vue"' package.json 2>/dev/null && [ -f "$STACKS_DIR/vue.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/vue.md")"$'\n\n'; (grep -q '"typescript"' package.json 2>/dev/null || [ -f "tsconfig.json" ]) && [ -f "$STACKS_DIR/typescript.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/typescript.md")"$'\n\n'; grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/node-api.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/node-api.md")"$'\n\n'; grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/rest-api.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/rest-api.md")"$'\n\n'; grep -q '"tailwindcss"' package.json 2>/dev/null && [ -f "$STACKS_DIR/tailwind.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/tailwind.md")"$'\n\n'; grep -q '"vite"' package.json 2>/dev/null && [ -f "$STACKS_DIR/vite.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/vite.md")"$'\n\n'; grep -q '"@supabase/supabase-js"' package.json 2>/dev/null && [ -f "$STACKS_DIR/supabase.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/supabase.md")"$'\n\n'; grep -q '"firebase"' package.json 2>/dev/null && [ -f "$STACKS_DIR/firebase.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/firebase.md")"$'\n\n'; grep -qE '"(graphql|@apollo/client|urql)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/graphql.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/graphql.md")"$'\n\n'; grep -q '"zustand"' package.json 2>/dev/null && [ -f "$STACKS_DIR/zustand.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/zustand.md")"$'\n\n'; grep -q '"@reduxjs/toolkit"' package.json 2>/dev/null && [ -f "$STACKS_DIR/redux.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/redux.md")"$'\n\n'; grep -q '"neo4j-driver"' package.json 2>/dev/null && [ -f "$STACKS_DIR/neo4j.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/neo4j.md")"$'\n\n'; grep -qE '"(pg|prisma|drizzle-orm|knex)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/postgresql.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/postgresql.md")"$'\n\n'; fi; ([ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "Pipfile" ]) && [ -f "$STACKS_DIR/python.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/python.md")"$'\n\n'; ([ -f "requirements.txt" ] && grep -q "psycopg" requirements.txt 2>/dev/null || [ -f "pyproject.toml" ] && grep -q "psycopg" pyproject.toml 2>/dev/null) && [ -f "$STACKS_DIR/postgresql.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/postgresql.md")"$'\n\n'; ([ -f "requirements.txt" ] && grep -q "neo4j" requirements.txt 2>/dev/null) && [ -f "$STACKS_DIR/neo4j.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/neo4j.md")"$'\n\n'; [ -f "pubspec.yaml" ] && [ -f "$STACKS_DIR/flutter.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/flutter.md")"$'\n\n'; [ -f "Dockerfile" ] && [ -f "$STACKS_DIR/docker.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/docker.md")"$'\n\n'; [ -d ".github/workflows" ] && [ -f "$STACKS_DIR/github-actions.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/github-actions.md")"$'\n\n'; ([ -f "playwright.config.ts" ] || [ -f "playwright.config.js" ]) && [ -f "$STACKS_DIR/playwright.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/playwright.md")"$'\n\n'; [ -f "go.mod" ] && [ -f "$STACKS_DIR/go.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/go.md")"$'\n\n'; [ -f "Cargo.toml" ] && [ -f "$STACKS_DIR/rust.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/rust.md")"$'\n\n'; fi`

If STACK_RULES is non-empty, append to the subagent prompt:
```
## Stack Rules (MANDATORY — violations fail this task)

{STACK_RULES}

These standards have the same enforcement weight as contract compliance.
Violations are task failures, not warnings.
```

If STACK_RULES is empty (no templates/stacks/ dir or no matches), skip silently.

**Domain task-dispatcher (lightweight — sequences tasks, passes summaries):**

For each task in `.gsd-t/domains/{domain-name}/tasks.md` (in order, skip completed):

1. Load prior summaries: Read up to 5 most recent `.gsd-t/domains/{domain-name}/task-*-summary.md` files (10-20 lines each)
2. Load graph context (if `.gsd-t/graph/meta.json` exists): query task's files for relevant graph context
3. Display: `⚙ [sonnet] gsd-t-execute → domain: {domain-name}, task-{task-id}`
4. Run observability Bash (T_START / DT_START / TOK_START / TOK_MAX)
5. Spawn task subagent:

```
Task subagent (general-purpose, model: sonnet, mode: bypassPermissions):
"You are executing a single task for the {domain-name} domain.

{PAST_FAILURES block if any — ## ⚠️ Past Failures (read before acting)\n{lines}}

## Your Task
{full task block from tasks.md — id, description, files, contract refs, dependencies, acceptance criteria}

## Domain Scope
{contents of .gsd-t/domains/{domain-name}/scope.md}

## Relevant Contracts
{contents of each contract file referenced by this task}

## Graph Context (if available)
{graph query results for this task's files — omit section if unavailable}

## Prior Task Summaries (most recent first, max 5)
{contents of task-{N}-summary.md files — 10-20 lines each}

## Stack Rules
{STACK_RULES if non-empty — omit entire section if empty}

## Instructions

Execute the task above:
1. Read the task description, files list, and contract refs carefully
2. Read relevant contracts — implement EXACTLY what they specify
3. Destructive Action Guard: if the task involves DROP TABLE, schema changes that lose
   data, removing working modules, or replacing architecture patterns → write a
   NEEDS-APPROVAL entry to .gsd-t/deferred-items.md, skip the task, stop here
4. Implement the task
5. Verify acceptance criteria are met
6. Write comprehensive tests (MANDATORY — no feature code without test code):
   - Unit/integration: happy path + edge cases + error cases for every new/changed function
   - Playwright E2E (if UI/routes/flows changed): new specs for new features, cover
     all modes, form validation, empty/loading/error states, common edge cases
   - If no test framework exists: set one up as part of this task
   - If the project has a UI but no Playwright E2E specs exist for the features being
     touched: WRITE THEM. A placeholder spec is not sufficient — write real E2E tests
     that exercise the actual UI functionality being built or changed.
   - **FUNCTIONAL E2E TESTS — NOT LAYOUT TESTS (MANDATORY)**:
     E2E tests that only check element existence (isVisible, isEnabled, toBeAttached)
     are LAYOUT tests, not functional tests. Layout tests pass even when every feature
     is broken. Every Playwright spec MUST verify functional behavior:
     a. **State changes**: After an action (click, type, submit), assert the app STATE
        changed — not just that the button was clickable. Example: clicking a tab must
        load different content; verify the content changed, not just that the tab exists.
     b. **Data flow**: Form submissions must verify data arrived (API call made, response
        rendered, list updated). Don't just assert the form rendered.
     c. **Navigation/routing**: Tab/page switches must verify the NEW content loaded.
        Assert on content unique to the destination, not the navigation element itself.
     d. **Interactive widgets**: Terminals must accept input and produce output. Editors
        must save changes. Panels must load their functional content after opening.
     e. **Network integration**: If a feature requires WebSocket/API connection, verify
        the connection status changes (e.g., "Disconnected" → "Connected") and that
        messages flow through the connection.
     f. **Error recovery**: Don't just check error messages render — verify the app
        recovers (retry button works, form can be resubmitted, etc.).
     A test that would pass on an empty HTML page with the right element IDs is useless.
     Every assertion must prove the FEATURE WORKS, not that the ELEMENT EXISTS.
7. Run ALL test suites — this is NOT optional, not conditional, not "if applicable":
   a. Detect configured test runners: check for vitest/jest config, playwright.config.*, cypress.config.*
   b. Run EVERY detected suite. Unit tests alone are NEVER sufficient when E2E exists.
   c. If `playwright.config.*` exists → run `npx playwright test` (full suite, not just affected specs)
   d. If E2E tests fail → fix (up to 2 attempts) before proceeding
   e. Report ALL suite results: "Unit: X/Y pass | E2E: X/Y pass" — never report just one
8. Run Pre-Commit Gate checklist from CLAUDE.md — update all affected docs BEFORE committing
9. Commit immediately: feat({domain-name}/task-{task-id}): {description}
10. Update .gsd-t/progress.md — mark this task complete; prefix the Decision Log entry:
    - Completed successfully on first attempt → prefix `[success]`
    - Completed after a fix → prefix `[learning]`
    - Deferred to .gsd-t/deferred-items.md → prefix `[deferred]`
    - Failed after 3 attempts → prefix `[failure]`
11. Spawn QA subagent (model: haiku) after completing the task:
    'Run ALL configured test suites — detect and run every one:
     a. Unit tests (vitest/jest/mocha): run the full suite, report pass/fail counts
     b. E2E tests: check for playwright.config.* or cypress.config.* — if found, run the FULL E2E suite
     c. NEVER skip E2E when a config file exists. Running only unit tests is a QA FAILURE.
     d. Read .gsd-t/contracts/ for contract definitions. Check contract compliance.
     e. AUDIT E2E test quality: Review each Playwright spec — if any test only checks
        element existence (isVisible, toBeAttached, toBeEnabled) without verifying functional
        behavior (state changes, data loaded, content updated after actions), flag it as
        "SHALLOW TEST — needs functional assertions" in the gap report. A test suite where
        every spec passes but no feature actually works is a QA FAILURE.
     Report format: "Unit: X/Y pass | E2E: X/Y pass (or N/A if no config) | Contract: compliant/violations | Shallow tests: N (list) | Stack rules: compliant/N violations"
     f. Validate compliance with Stack Rules (if injected in the work subagent's prompt).
        Stack rule violations have the same severity as contract violations — report as failures, not warnings.'
    If QA fails OR shallow tests are found, fix before proceeding. Append issues to .gsd-t/qa-issues.md.
12. Write task summary to .gsd-t/domains/{domain-name}/task-{task-id}-summary.md:
    ## Task {task-id} Summary — {domain-name}
    - **Status**: PASS | FAIL
    - **Files modified**: {list}
    - **Constraints discovered**: {any new constraints or surprises}
    - **Tests**: {pass/fail count}
    - **Notes**: {10-20 lines max — key decisions, patterns, warnings}

Deviation rules:
- Bug blocking progress → fix, max 3 attempts; after fix attempt 2 fails:
  1. Write current failure context to .gsd-t/debug-state.jsonl via appendEntry
  2. Log: "Delegating to headless debug-loop (2 in-context attempts exhausted)"
  3. Run: `gsd-t headless --debug-loop --max-iterations 15`
  4. Check exit code:
     - 0: Tests pass, continue with task
     - 1/4: Log to .gsd-t/deferred-items.md and stop (report FAIL in summary)
     - 3: Report error, stop
  If still blocked after debug-loop, log to .gsd-t/deferred-items.md and stop (report FAIL in summary)
- Missing dependency → add minimum needed, document in commit message
- Non-trivial blocker → log to .gsd-t/deferred-items.md
- Architectural change required → write NEEDS-APPROVAL to .gsd-t/deferred-items.md,
  skip the task, stop here — never self-approve structural changes

Report back:
- Task: {task-id}
- Status: PASS | FAIL
- Files modified: {list}
- Tests: {pass/fail count}
- Commit: {hash}
- Deferred items (if any)"
```

6. After task subagent returns:
   - Run observability Bash (T_END / TOK_END / DURATION / CTX_PCT)
   - Append to token-log.md (per-task row)
   - Alert on CTX_PCT thresholds (display to user inline)
   - **Emit task-metrics record** — run via Bash:
     `node bin/metrics-collector.js --milestone {milestone} --domain {domain-name} --task task-{task-id} --command execute --duration_s $DURATION --tokens_used $TOKENS --context_pct ${CTX_PCT:-0} --pass {true|false} --fix_cycles {0|N} --signal_type {pass-through|fix-cycle} --notes "{brief outcome}" 2>/dev/null || true`
     Signal type: `pass-through` if task passed on first attempt; `fix-cycle` if rework was needed.
   - **Emit task_complete event** — run via Bash:
     `node ~/.claude/scripts/gsd-t-event-writer.js --type task_complete --command gsd-t-execute --reasoning "signal_type={signal_type}, domain={domain-name}" --outcome {success|failure} || true`
   - Check `.gsd-t/deferred-items.md` for `NEEDS-APPROVAL` — if found, STOP and present to user before proceeding to the next task
   - Read the task summary from `.gsd-t/domains/{domain-name}/task-{task-id}-summary.md` to use as prior summary for the next task

**After all tasks in a domain complete (orchestrator responsibilities):**
1. Check `.gsd-t/deferred-items.md` for any `NEEDS-APPROVAL` entries — if found, STOP and present to user before spawning the next domain
2. If a CHECKPOINT is reached per `integration-points.md`, verify contract compliance (see Step 4) before proceeding to the next wave/domain
3. Update `.gsd-t/progress.md` with domain completion status
4. **Adaptive Replan Check** (per `adaptive-replan-contract.md`) — run after EVERY domain completes, before dispatching the next domain:

   a. **Read domain summaries**: Read all `.gsd-t/domains/{completed-domain}/task-*-summary.md` files. Extract every `**Constraints discovered**:` field. If ALL are empty or "none", skip to the next domain (fast path — no replan needed).

   b. **Assess affected domains** — two modes:
      - **Graph available** (`.gsd-t/graph/meta.json` exists): For each changed module mentioned in the constraints, run `query('getImporters', { file })` to find which remaining domains import it. Also run `query('getDomainBoundaryViolations', {})` to check if constraint changes affect domain boundaries. Scope replan to ONLY those domains.
      - **Graph unavailable** (fallback): Check ALL remaining unexecuted domains' `tasks.md` files — less precise but functional.

   c. **Check for invalidated assumptions**: Read each affected remaining domain's `.gsd-t/domains/{domain}/tasks.md`. For each task, check whether any assumption is invalidated by the discovered constraints (e.g., wrong column name, deprecated API, wrong library, missing prerequisite, throughput limits).

   d. **If invalidated assumptions found**: Revise the affected domain's `tasks.md` on disk. Append a Revision block at the end of the file (do NOT overwrite existing tasks — append only):
      ```markdown
      ## Revision (Replan Cycle {N})
      - **Trigger**: {completed-domain} — constraint discovered during execution
      - **Constraint**: {exact constraint text from summary}
      - **Changes**: {what was revised in this domain's tasks — list specific task IDs and what changed}
      - **Rationale**: {why this revision is needed — what would break without it}
      ```

   e. **Increment replan cycle counter** (track as `REPLAN_CYCLES` in orchestrator state, starting at 0).

   f. **Cycle guard**: If `REPLAN_CYCLES > 2`, STOP and pause for user input:
      "Replan cycle limit (2) exceeded. {N} constraints are still propagating. Please review `.gsd-t/domains/*/tasks.md` and resolve manually, then re-run execute."

   g. **Log to Decision Log** in `.gsd-t/progress.md`: `- {date}: [replan] Cycle {N} — {completed-domain} constraint propagated to {list of affected domains}: {brief constraint summary}`

   h. The revised `tasks.md` files are now on disk — the next domain's dispatcher will read the updated version automatically (disk-based handoff, no in-memory state sharing needed).

### Team Mode (when agent teams are enabled)
Spawn teammates for domains within the same wave. Only domains in the same wave can run in parallel — do not spawn teammates for domains in different waves simultaneously. Each teammate uses the **domain task-dispatcher pattern** — one subagent per task within their domain (same as solo mode).

```
Create an agent team for execution:

ALL TEAMMATES must read before starting:
1. CLAUDE.md — project conventions (CRITICAL)
2. Your domain's scope.md — what you own
3. Your domain's constraints.md — what you must/must not do
4. ALL files in .gsd-t/contracts/ — your interfaces
5. Your domain's tasks.md — your work

RULES FOR ALL TEAMMATES:
- **Destructive Action Guard**: NEVER drop tables, remove columns, delete data, replace architecture patterns, or remove working modules without messaging the lead first. The lead must get user approval before any destructive action proceeds.
- Only modify files listed in your domain's scope.md
- Implement interfaces EXACTLY as specified in contracts
- **Write comprehensive FUNCTIONAL tests with every task** — no feature code without test code:
  - Unit/integration tests: happy path + edge cases + error cases for every new/changed function
  - Playwright E2E specs (if UI/routes/flows/modes changed): new specs for new features, cover all modes/flags, form validation, empty/loading/error states, common edge cases
  - Tests are part of the deliverable, not a follow-up
  - **E2E tests MUST be functional, not layout tests**: Every assertion must verify an action produced the correct outcome (state changed, data loaded, content updated) — NOT just that an element is visible/clickable. A test that passes on an empty HTML shell with correct IDs is worthless. See the Functional E2E Test Requirements in the solo mode instructions above.
- If a task is marked BLOCKED, message the lead and wait
- Run the Pre-Commit Gate checklist from CLAUDE.md BEFORE every commit — update all affected docs
- **Commit immediately after each task**: `feat({domain}/task-{N}): {description}` — do NOT batch commits
- **Deviation Rules**: (1) Bug blocking progress → fix, 3 attempts max; (2) Missing dependency → add minimum needed; (3) Blocker → fix and log to deferred-items.md; (4) Architectural change → STOP, message lead, never self-approve

**Task-dispatcher pattern per teammate:**
For each task in your domain's tasks.md (in order, skip completed):
1. Load prior summaries: read up to 5 most recent `.gsd-t/domains/{your-domain}/task-*-summary.md` files
2. Load graph context for task's files (if .gsd-t/graph/meta.json exists)
3. Spawn one Task subagent (model: sonnet) with ONLY:
   - scope.md, relevant contracts, the single task, graph context, prior summaries
   - Instruction to write task summary to `.gsd-t/domains/{domain}/task-{id}-summary.md`
     (format per fresh-dispatch-contract.md Task Summary Format)
4. After task subagent returns, read the summary and pass it as prior context to the next task
5. After completing each task, message the lead with:
   "DONE: {domain} Task {N} - {summary of what was created/modified}"
6. If you need to deviate from a contract, STOP and message the lead

Teammate assignments:
- Teammate "{domain-1}": Execute .gsd-t/domains/{domain-1}/tasks.md (task-dispatcher pattern, isolated worktree)
- Teammate "{domain-2}": Execute .gsd-t/domains/{domain-2}/tasks.md (task-dispatcher pattern, isolated worktree)
- Teammate "{domain-3}": Execute .gsd-t/domains/{domain-3}/tasks.md (task-dispatcher pattern, isolated worktree)

**Worktree isolation (per domain teammate):**
Each domain teammate MUST be spawned with `isolation: "worktree"` on the Agent tool:
```
Agent({
  prompt: "{domain execution prompt — include: 'You are working in an isolated git worktree. All your changes are isolated to this worktree branch. Do not push; the lead will merge your branch after all domains complete.'}",
  isolation: "worktree"
})
```
Each teammate works in its own isolated copy of the repository. Changes from one domain do not affect another domain's working tree. This is required for parallel safety — see `.gsd-t/contracts/worktree-isolation-contract.md`.

Lead responsibilities (QA is handled via Task subagent — spawn one after each domain checkpoint):
- Use delegate mode (Shift+Tab)
- Track completions from teammate messages
- When a CHECKPOINT is reached:
  1. Pause blocked teammates
  2. Verify the gate condition (check contract compliance)
  3. Unblock waiting teammates
- Update .gsd-t/progress.md after each completion
- Resolve any contract conflicts immediately

**Sequential Merge Protocol (lead runs after ALL domain agents complete):**

Once all domain teammates report completion, the lead performs sequential atomic merges. This is the critical integration step — see `.gsd-t/contracts/worktree-isolation-contract.md` for the full merge protocol.

1. **Determine merge order**: Read `.gsd-t/contracts/integration-points.md` — use the dependency graph to sort domains. Domains with no upstream dependencies merge first. Example: if domain-A has no deps and domain-B depends on domain-A's output, merge order is [domain-A, domain-B].

2. **For each domain (in dependency order)**:

   a. **File ownership validation (pre-merge)**: Check files the domain agent modified against the domain's `.gsd-t/domains/{domain}/scope.md`:
      - If `.gsd-t/graph/meta.json` exists: run `query('getDomainBoundaryViolations', { domain })` — flag any files modified outside the domain's declared ownership
      - If graph unavailable: list files changed in the worktree branch via `git diff --name-only` and compare against scope.md manually
      - If violations found: log them in `.gsd-t/progress.md` as `[violation] {domain}: modified {file} outside scope`, but do NOT block merge — flag for immediate review after merge

   b. **Merge the domain's worktree branch**:
      ```bash
      # The worktree branch name is returned by the Agent tool when isolation: "worktree" is used
      git merge --no-ff {domain-worktree-branch} -m "integrate({domain}): merge worktree branch"
      ```

   c. **Contract validation (post-merge)**: Read each contract in `.gsd-t/contracts/` — verify the merged code still satisfies all contract shapes (API shapes, schemas, interfaces). If a contract is violated, log it immediately.

   d. **Run integration tests**:
      ```bash
      node --test test/
      # or project's test command from package.json
      ```

   e. **If tests PASS**: Continue to the next domain in merge order.

   f. **If tests FAIL**: Roll back this domain's merge:
      ```bash
      git reset --hard HEAD~1
      # or: git revert HEAD --no-edit
      ```
      Log failure: `[rollback] {domain}: merge rolled back — integration tests failed after merge`
      Record in `.gsd-t/progress.md` Decision Log.
      Continue with remaining domains (other domains' merges are not affected).

3. **Post-merge ownership report**: After all merges complete (successful or rolled back), log a summary in `.gsd-t/progress.md`:
   ```
   ## Worktree Merge Summary — {date}
   - {domain-1}: MERGED | tests: PASS | violations: {N}
   - {domain-2}: ROLLED BACK | reason: integration tests failed
   - {domain-3}: MERGED | tests: PASS | violations: 0
   ```

**Worktree Cleanup (MANDATORY — run after merge protocol, success or failure):**

After all merges complete (whether all passed, some rolled back, or errors occurred):

1. List all worktree branches created during this execution run:
   ```bash
   git worktree list
   git branch --list "gsd-t-worktree-*"
   ```

2. Remove each domain worktree:
   ```bash
   git worktree remove --force {worktree-path}
   git branch -D {worktree-branch}
   ```

3. **Orphaned worktree detection**: If any worktrees remain after cleanup (can happen if an agent crashed):
   ```bash
   git worktree prune
   ```
   Log: `[cleanup] Pruned {N} orphaned worktrees via git worktree prune`

4. Verify no worktrees remain except the main working tree:
   ```bash
   git worktree list
   # should show only: {main-path} {commit} [branch]
   ```

Cleanup is not optional — orphaned worktrees waste disk space and can confuse subsequent executions. Always run cleanup, even if earlier steps failed.
```

## Step 3.5: Orchestrator Context Self-Check (MANDATORY)

After EVERY domain completes (and after every checkpoint), the orchestrator MUST check its own context utilization:

Run via Bash:
`if [ "${CLAUDE_CONTEXT_TOKENS_MAX:-0}" -gt 0 ]; then CTX_PCT=$(echo "scale=1; ${CLAUDE_CONTEXT_TOKENS_USED:-0} * 100 / ${CLAUDE_CONTEXT_TOKENS_MAX}" | bc); else CTX_PCT="N/A"; fi && echo "Orchestrator context: ${CTX_PCT}%"`

**If CTX_PCT >= 70:**
1. **Save checkpoint to disk** — update `.gsd-t/progress.md` with:
   - Which domains are complete, which remain
   - Current wave, next domain to execute
   - Any checkpoint results
2. **Instruct user**: Output exactly:
   ```
   ⚠️ Orchestrator context at {CTX_PCT}% — approaching limit.
   Progress saved. Run `/clear` then `/user:gsd-t-execute` to continue from the next domain.
   ```
3. **STOP execution.** Do NOT spawn another domain subagent. The next session will resume from saved state.

**If CTX_PCT < 70:** Continue normally to the next domain/wave.

This prevents the orchestrator from running out of context mid-milestone, which causes session breaks and summary-based recovery.

## Step 4: Checkpoint Handling

When a checkpoint is reached (solo or team):

1. **Stop** execution of blocked tasks
2. **Read** the relevant contract
3. **Verify** the implemented code matches the contract:
   - API response shapes match?
   - Schema matches?
   - Component interfaces match?
   - Error handling matches?
4. **If mismatch**: Fix the implementation to match the contract, OR update the contract and notify affected domains
5. **Log** in progress.md: `CHECKPOINT {name}: PASSED/FAILED — {details}`
6. **Unblock** downstream tasks

## Step 5: Error Handling

### Contract Violation
A teammate implements something that doesn't match a contract:
1. Stop the teammate
2. Identify the deviation
3. Decide: fix implementation or update contract?
4. If updating contract, message ALL affected teammates with the change
5. Log the decision

### Merge Conflict / File Conflict
Two teammates modified the same file (shouldn't happen with good partitioning):
1. Stop both teammates
2. Identify which domain owns the file (check scope.md)
3. Non-owner reverts their changes
4. Determine if the contract needs updating to prevent recurrence
5. Log the incident

### Blocked Teammate Idle
A teammate finishes independent tasks and is waiting on a checkpoint:
1. Check if checkpoint can be expedited
2. If not, have the teammate work on documentation, tests, or code cleanup within their domain
3. Or shut down the teammate and respawn when unblocked

## Step 6: Completion

When all tasks in all domains are complete:
1. Update `.gsd-t/progress.md` — all tasks marked complete
2. Set status to `EXECUTED`
3. List any contract deviations or decisions made during execution

### Autonomy Behavior

**Level 3 (Full Auto)**: Log a brief status line (e.g., "✅ Execute complete — {N}/{N} tasks done") and auto-advance to the next phase. Do NOT wait for user input.

**Level 1–2**: Report completion summary and recommend proceeding to integrate phase. Wait for confirmation.

## Step 7: Doc-Ripple (Automated)

After all work is committed but before reporting completion:

1. Run threshold check — read `git diff --name-only HEAD~1` and evaluate against doc-ripple-contract.md trigger conditions
2. If SKIP: log "Doc-ripple: SKIP — {reason}" and proceed to completion
3. If FIRE: spawn doc-ripple agent:

⚙ [{model}] gsd-t-doc-ripple → blast radius analysis + parallel updates

Task subagent (general-purpose, model: sonnet):
"Execute the doc-ripple workflow per commands/gsd-t-doc-ripple.md.
Git diff context: {files changed list}
Command that triggered: execute
Produce manifest at .gsd-t/doc-ripple-manifest.md.
Update all affected documents.
Report: 'Doc-ripple: {N} checked, {N} updated, {N} skipped'"

4. After doc-ripple returns, verify manifest exists and report summary inline

## Document Ripple

Execute modifies source code, so the Pre-Commit Gate (referenced in Step 9) covers document updates. For clarity, the key documents affected by execution:

### Always update:
1. **`.gsd-t/progress.md`** — Mark tasks complete, update domain status, log execution summary

### Check if affected (per task):
2. **`.gsd-t/contracts/`** — Did a task change an API endpoint, schema, or component interface? Update the contract
3. **`docs/requirements.md`** — Did a task implement or change a requirement? Mark it complete or revise
4. **`docs/architecture.md`** — Did a task add/change a component or data flow? Update it
5. **`.gsd-t/techdebt.md`** — Did a task resolve a debt item? Mark it done. Did it reveal new debt? Add it

### Scan Doc Micro-Update (if `.gsd-t/scan/` exists):
After all tasks complete, patch structural metadata in scan docs so they stay fresh between full scans. This is near-zero cost — no LLM re-analysis, just updating counts and lists from code.

For each scan doc that exists, apply only the relevant patches:
- **`.gsd-t/scan/architecture.md`** — Update file/directory counts, add new files/modules created during execution
- **`.gsd-t/scan/quality.md`** — Mark resolved TODOs/FIXMEs, update test counts (run `grep -rc "test\|it\|describe" tests/` or equivalent), append new files to Consumer Surfaces table if applicable
- **`.gsd-t/scan/security.md`** — If a security finding was fixed during execution, mark it `[RESOLVED]`
- **`.gsd-t/scan/business-rules.md`** — Append any new validation/auth/workflow rules added during execution
- **`.gsd-t/scan/contract-drift.md`** — If contracts were updated, mark resolved drift items

Skip any scan doc that wasn't affected by the executed tasks. Skip analytical sections (assessments, recommendations) — those require a full scan to update.

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
