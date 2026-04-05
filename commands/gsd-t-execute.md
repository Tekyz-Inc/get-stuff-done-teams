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

**QA Calibration Injection** — Before spawning QA, check for known weak spots:

Run via Bash:
`node -e "const qc = require('./bin/qa-calibrator.js'); const inj = qc.generateQAInjection('.'); if(inj) process.stdout.write(inj);" 2>/dev/null`

If the command produces output (non-empty), store it as `QA_INJECTION` and prepend it to the QA subagent prompt below. If the file doesn't exist or produces no output, skip silently and proceed normally.

**QA subagent prompt:**
```
Task subagent (general-purpose, model: sonnet):
"{QA_INJECTION — if non-empty, insert here as a preamble section before the instructions below}
Run the full test suite for this project and report pass/fail counts.
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

**Token Budget Check (before dispatching each domain's tasks):**

Run via Bash:
`node -e "const tb = require('./bin/token-budget.js'); const s = tb.getSessionStatus('.'); const d = tb.getDegradationActions(s.threshold, '.'); process.stdout.write(JSON.stringify({threshold: s.threshold, actions: d}));" 2>/dev/null`

Apply the result:
- `threshold: 'normal'` or file missing → skip silently, proceed with standard model assignments
- `threshold: 'downgrade'` → apply model overrides from `actions.modelOverride` (e.g., downgrade opus tasks to sonnet)
- `threshold: 'conserve'` → checkpoint progress to `.gsd-t/progress.md` and skip non-essential operations (Red Team, doc-ripple) for this domain
- `threshold: 'stop'` → checkpoint all progress, output: "Token budget exhausted — progress saved. Resume after session reset.", and halt execution for remaining domains

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

Run via Bash to detect project stack and collect matching rules. Local overrides in `.gsd-t/stacks/` take precedence over global templates — if a project has `.gsd-t/stacks/react.md`, it replaces the global `react.md` for that project.

```bash
GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t
STACKS_DIR="$GSD_T_DIR/templates/stacks"
LOCAL_STACKS=".gsd-t/stacks"
STACK_RULES=""

# Helper: read local override if exists, else global
_sf() { local n=$(basename "$1"); [ -f "$LOCAL_STACKS/$n" ] && cat "$LOCAL_STACKS/$n" || cat "$1"; }

# Helper: append a stack file to STACK_RULES
_add() { [ -f "$STACKS_DIR/$1" ] && STACK_RULES="${STACK_RULES}$(_sf "$STACKS_DIR/$1")"$'\n\n'; }

if [ -d "$STACKS_DIR" ]; then
  # Universal rules (_ prefix — always injected)
  for f in "$STACKS_DIR"/_*.md; do [ -f "$f" ] && STACK_RULES="${STACK_RULES}$(_sf "$f")"$'\n\n'; done

  # Package.json-based detection
  if [ -f "package.json" ]; then
    grep -q '"react-native"' package.json 2>/dev/null && _add react-native.md
    grep -q '"react"' package.json 2>/dev/null && ! grep -q '"react-native"' package.json 2>/dev/null && _add react.md
    grep -q '"next"' package.json 2>/dev/null && _add nextjs.md
    grep -q '"vue"' package.json 2>/dev/null && _add vue.md
    (grep -q '"typescript"' package.json 2>/dev/null || [ -f "tsconfig.json" ]) && _add typescript.md
    grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && _add node-api.md && _add rest-api.md
    grep -q '"tailwindcss"' package.json 2>/dev/null && _add tailwind.md
    grep -q '"vite"' package.json 2>/dev/null && _add vite.md
    grep -q '"@supabase/supabase-js"' package.json 2>/dev/null && _add supabase.md
    grep -q '"firebase"' package.json 2>/dev/null && _add firebase.md
    grep -qE '"(graphql|@apollo/client|urql)"' package.json 2>/dev/null && _add graphql.md
    grep -q '"zustand"' package.json 2>/dev/null && _add zustand.md
    grep -q '"@reduxjs/toolkit"' package.json 2>/dev/null && _add redux.md
    grep -q '"neo4j-driver"' package.json 2>/dev/null && _add neo4j.md
    grep -qE '"(pg|prisma|drizzle-orm|knex)"' package.json 2>/dev/null && _add postgresql.md
    grep -qE '"(prisma|@prisma/client)"' package.json 2>/dev/null && _add prisma.md
    grep -qE '"(bullmq|bull|amqplib|@aws-sdk/client-sqs|bee-queue|agenda)"' package.json 2>/dev/null && _add queues.md
    grep -qE '"(openai|anthropic|@anthropic-ai/sdk|langchain|llama-index|@google/generative-ai)"' package.json 2>/dev/null && _add llm.md
  fi

  # File-based detection (no package.json needed)
  ([ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "Pipfile" ]) && _add python.md
  ([ -f "requirements.txt" ] && grep -q "psycopg" requirements.txt 2>/dev/null || [ -f "pyproject.toml" ] && grep -q "psycopg" pyproject.toml 2>/dev/null) && _add postgresql.md
  ([ -f "requirements.txt" ] && grep -q "neo4j" requirements.txt 2>/dev/null) && _add neo4j.md
  ([ -f "requirements.txt" ] && grep -q "fastapi" requirements.txt 2>/dev/null || [ -f "pyproject.toml" ] && grep -q "fastapi" pyproject.toml 2>/dev/null) && _add fastapi.md
  ([ -f "requirements.txt" ] && grep -qE "(celery|dramatiq|rq|arq)" requirements.txt 2>/dev/null || [ -f "pyproject.toml" ] && grep -qE "(celery|dramatiq|rq|arq)" pyproject.toml 2>/dev/null) && _add queues.md
  ([ -f "requirements.txt" ] && grep -qE "(openai|anthropic|langchain|llama.index)" requirements.txt 2>/dev/null || [ -f "pyproject.toml" ] && grep -qE "(openai|anthropic|langchain|llama.index)" pyproject.toml 2>/dev/null) && _add llm.md
  [ -f "pubspec.yaml" ] && _add flutter.md
  [ -f "Dockerfile" ] && _add docker.md
  [ -d ".github/workflows" ] && _add github-actions.md
  ([ -f "playwright.config.ts" ] || [ -f "playwright.config.js" ]) && _add playwright.md
  [ -f "go.mod" ] && _add go.md
  [ -f "Cargo.toml" ] && _add rust.md
  # Design-to-code detection (design contract, design tokens, Figma config, or Figma MCP configured)
  ([ -f ".gsd-t/contracts/design-contract.md" ] || [ -f "design-tokens.json" ] || [ -d "design-tokens" ] || [ -f ".figmarc" ] || [ -f "figma.config.json" ] || grep -q '"figma"' ~/.claude/settings.json 2>/dev/null) && _add design-to-code.md
fi
```

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
7. **Visual Design Note** (when design-to-code stack rule is active):
   Do NOT perform visual verification yourself — a dedicated Design Verification Agent
   (Step 5.25) runs after all domain tasks complete and handles the full visual comparison.
   Your job: write precise code from the design contract tokens. Use exact hex colors,
   exact spacing values, exact typography. Every CSS value must trace to the design contract.
   The verification agent will open a browser and prove whether your code matches.
8. Run ALL test suites — this is NOT optional, not conditional, not "if applicable":
   a. Detect configured test runners: check for vitest/jest config, playwright.config.*, cypress.config.*
   b. Run EVERY detected suite. Unit tests alone are NEVER sufficient when E2E exists.
   c. If `playwright.config.*` exists → run `npx playwright test` (full suite, not just affected specs)
   d. If E2E tests fail → fix (up to 2 attempts) before proceeding
   e. Report ALL suite results: "Unit: X/Y pass | E2E: X/Y pass" — never report just one
9. Run Pre-Commit Gate checklist from CLAUDE.md — update all affected docs BEFORE committing
10. Commit immediately: feat({domain-name}/task-{task-id}): {description}
11. Update .gsd-t/progress.md — mark this task complete; prefix the Decision Log entry:
    - Completed successfully on first attempt → prefix `[success]`
    - Completed after a fix → prefix `[learning]`
    - Deferred to .gsd-t/deferred-items.md → prefix `[deferred]`
    - Failed after 3 attempts → prefix `[failure]`
12. Spawn QA subagent (model: sonnet) after completing the task:
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
        Stack rule violations have the same severity as contract violations — report as failures, not warnings.

     ## Exploratory Testing (if Playwright MCP available)

     After all scripted tests pass:
     1. Check if Playwright MCP is registered in Claude Code settings (look for "playwright" in mcpServers)
     2. If available: spend 3 minutes on interactive exploration using Playwright MCP
        - Try variations of happy paths with unexpected inputs
        - Probe for race conditions, double-submits, empty states
        - Test accessibility (keyboard navigation, screen reader flow)
     3. Tag all findings [EXPLORATORY] in your report and append to .gsd-t/qa-issues.md with [EXPLORATORY] prefix
     4. If Playwright MCP is not available: skip this section silently
     Note: Exploratory findings do NOT count against the scripted test pass/fail ratio.'
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

## Step 5.25: Design Verification Agent (MANDATORY when design contract exists)

After all domain tasks complete and QA passes, check if `.gsd-t/contracts/design-contract.md` exists. If it does NOT exist, skip this step entirely.

If it DOES exist — spawn a **dedicated Design Verification Agent**. This agent's ONLY job is to open a browser, compare the built frontend against the original design, and produce a structured comparison table. It writes NO feature code. Separation of concerns: the coding agent codes, the verification agent verifies.

⚙ [{model}] Design Verification → visual comparison of built frontend vs design

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

```
Task subagent (general-purpose, model: opus):
"You are the Design Verification Agent. Your ONLY job is to visually compare
the built frontend against the original design and produce a structured
comparison table. You write ZERO feature code. Your sole deliverable is
the comparison table and verification results.

FAIL-BY-DEFAULT: Every visual element starts as UNVERIFIED. You must prove
each one matches — not assume it does. 'Looks close' is not a verdict.
'Appears to match' is not a verdict. The only valid verdicts are MATCH
(with proof) or DEVIATION (with specifics).

## Step 1: Get the Design Reference

Read .gsd-t/contracts/design-contract.md for the source reference.
- If Figma MCP available → call get_screenshot with nodeId + fileKey from the contract
- If design image files → locate them from the contract's Source Reference field
- If no MCP and no images → log CRITICAL blocker to .gsd-t/qa-issues.md and STOP
You MUST have a reference image before proceeding.

## Step 2: Build the Element Inventory

Before ANY comparison, enumerate every distinct visual element in the design.
Walk the design top-to-bottom, left-to-right. For each section:
  - Section title text and icon
  - Every chart/visualization (type, orientation, labels, legend, series count)
  - Every data table (columns, row structure, sort indicators)
  - Every KPI/stat card (value, label, icon, trend indicator)
  - Every button, toggle, tab, dropdown
  - Every text element (headings, body, captions, labels)
  - Every spacing boundary (section gaps, card padding, element margins)
  - Every color usage (backgrounds, borders, text, chart fills)
Write each element as a row for the comparison table.
If the inventory has fewer than 20 elements for a full page, you missed items.

Data visualizations MUST expand into multiple rows:
  Chart type, chart orientation, axis labels, axis grid lines, legend position,
  data labels placement, chart colors per series, bar width/spacing,
  center text (donut/pie), tooltip style — each a SEPARATE element.

## Step 3: Open Side-by-Side Browser Sessions

Start the dev server (npm run dev, or project equivalent).
Open TWO browser views simultaneously for direct visual comparison:

VIEW 1 — BUILT FRONTEND:
  Open the implemented page using Claude Preview, Chrome MCP, or Playwright.
  Navigate to the exact route/component being verified.
  You MUST see real rendered output — not just read the code.

VIEW 2 — ORIGINAL DESIGN REFERENCE:
  If Figma URL available → open the Figma page in a browser tab/window.
    Use the Figma URL from the design contract Source Reference field.
    Navigate to the specific frame/component being compared.
  If design image file → open the image in a browser tab/window.
    Use: file://{absolute-path-to-image} or render in an HTML page.
  If Figma MCP screenshot was captured → open that screenshot image.

COMPARISON APPROACH:
  With both views open, walk through each component/section:
    - Position views side-by-side (or switch between tabs)
    - Compare each element visually at the same zoom level
    - Screenshot BOTH views at matching viewport sizes
  Capture implementation screenshots at each target breakpoint:
    Mobile (375px), Tablet (768px), Desktop (1280px) minimum.
  Each breakpoint is a separate screenshot pair (design + implementation).

If Claude Preview, Chrome MCP, and Playwright are ALL unavailable:
  This is a CRITICAL blocker. Log to .gsd-t/qa-issues.md:
  'CRITICAL: No browser tools available for visual verification.'
  STOP — the verification CANNOT proceed without a browser.

## Step 4: Structured Element-by-Element Comparison (MANDATORY FORMAT)

Produce a comparison table with this exact structure. Every element from
the inventory gets its own row. No summarizing, no grouping, no prose.

| # | Section | Element | Design (specific) | Implementation (specific) | Verdict |
|---|---------|---------|-------------------|--------------------------|---------|
| 1 | Summary | Chart type | Horizontal stacked bar | Vertical grouped bar | ❌ DEVIATION |
| 2 | Summary | Chart colors | #4285F4, #34A853, #FBBC04 | #4285F4, #34A853, #FBBC04 | ✅ MATCH |

Rules:
- 'Design' column: SPECIFIC values (chart type name, hex color, px size, font weight)
- 'Implementation' column: SPECIFIC observed values from the SCREENSHOT — not code assumptions
- Verdict: only ✅ MATCH or ❌ DEVIATION — never 'appears to match' or 'need to verify'
- NEVER write 'Appears to match' or 'Looks correct' — measure and verify
- If the table has fewer than 30 rows for a full-page comparison, you skipped elements

## Step 5: Report Deviations

For each ❌ DEVIATION, write a specific finding:
  'Design: {exact value}. Implementation: {exact value}. File: {path}:{line}'

Write the FULL comparison table to .gsd-t/contracts/design-contract.md
under a '## Verification Status' section.

Any ❌ DEVIATION → also append to .gsd-t/qa-issues.md with severity HIGH
and tag [VISUAL]:
| {date} | gsd-t-execute | Step 5.25 | opus | {duration} | HIGH | [VISUAL] {description} |

## Step 6: Verdict

Count results: '{MATCH_COUNT}/{TOTAL} elements match at {breakpoints} breakpoints'

VERDICT:
- ALL rows ✅ MATCH → DESIGN VERIFIED
- ANY rows ❌ DEVIATION → DESIGN DEVIATIONS FOUND ({count} deviations)

Write verdict to .gsd-t/contracts/design-contract.md Verification Status section.

Report back:
- Verdict: DESIGN VERIFIED | DESIGN DEVIATIONS FOUND
- Match count: {N}/{total}
- Breakpoints verified: {list}
- Deviations: {count with summary of each}
- Comparison table: {the full table}"
```

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Append to `.gsd-t/token-log.md`:
`| {DT_START} | {DT_END} | gsd-t-execute | Design Verify | opus | {DURATION}s | {VERDICT} — {MATCH}/{TOTAL} elements | {TOKENS} | {COMPACTED} | | | {CTX_PCT} |`

**Artifact Gate (MANDATORY):**
After the Design Verification Agent returns, check `.gsd-t/contracts/design-contract.md`:
1. Read the file — does it contain a `## Verification Status` section?
2. Does that section contain a comparison table with rows?
3. If EITHER is missing → the verification agent failed its job. Log:
   `[failure] Design Verification Agent did not produce comparison table — re-spawning`
   Re-spawn the agent (1 retry). If it fails again, log to `.gsd-t/deferred-items.md`.

**If VERDICT is DESIGN DEVIATIONS FOUND:**
1. Fix all deviations (spawn a fix subagent, model: sonnet, with the deviation list)
2. Re-spawn the Design Verification Agent to re-verify (max 2 fix-and-verify cycles)
3. If deviations persist after 2 cycles, log to `.gsd-t/deferred-items.md` and present to user

**If VERDICT is DESIGN VERIFIED:** Proceed to Red Team.

## Step 5.5: Red Team — Adversarial QA (MANDATORY)

After all domain tasks pass their tests, spawn an adversarial Red Team agent. This agent's sole purpose is to BREAK the code that was just built. It operates with inverted incentives — its success is measured by bugs found, not tests passed.

⚙ [{model}] Red Team → adversarial validation of executed domains

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

```
Task subagent (general-purpose, model: opus):
"You are a Red Team QA adversary. Your job is to BREAK the code that was just written.

Your value is measured by REAL bugs found. More bugs = more value.
If you find zero bugs, you must prove you were thorough — list every
attack vector you tried and why it didn't break. A short list means
you didn't try hard enough.

Rules:
- False positives DESTROY your credibility. If you report something
  as a bug and it's actually correct behavior, that's worse than
  missing a real bug. Never report something you haven't reproduced.
- Style opinions are not bugs. Theoretical concerns are not bugs.
  A bug is: 'I did X, expected Y, got Z.' With proof.
- You are done ONLY when you have exhausted every category below
  and either found a bug or documented exactly what you tried.

## Attack Categories (exhaust ALL of these)

1. **Contract Violations**: Read .gsd-t/contracts/. Does the code EXACTLY
   match every contract? Test each endpoint/interface/schema shape.
2. **Boundary Inputs**: Empty strings, null, undefined, huge payloads,
   special characters, SQL injection attempts, XSS payloads, path traversal.
3. **State Transitions**: What happens when actions are performed out of
   order? Double-submit? Concurrent access? Refresh mid-flow?
4. **Error Paths**: Remove env vars. Kill the database. Send malformed
   requests. Does the code handle failures gracefully or crash?
5. **Missing Flows**: Read docs/requirements.md. Are there user flows that
   exist in requirements but have NO test coverage? Write tests for them.
6. **Regression**: Run the FULL test suite. Did any existing tests break?
7. **E2E Functional Gaps**: Review ALL Playwright specs. Do they test actual
   behavior (state changes, data loaded, navigation works) or just check
   that elements exist? Flag and rewrite any shallow/layout tests.
8. **Design Fidelity** (if .gsd-t/contracts/design-contract.md exists):
   FAIL-BY-DEFAULT: assume NOTHING matches. Prove each element individually.
   a. Open every implemented screen in a real browser. Screenshot at mobile
      (375px), tablet (768px), desktop (1280px). Get Figma reference via
      Figma MCP get_screenshot (or design contract images).
   b. Build an element inventory: enumerate every distinct visual element
      in the design top-to-bottom. Every chart, label, icon, heading, card,
      spacing boundary, and color. Data visualizations expand: chart type,
      orientation, axis labels, legend position, bar colors, data labels,
      grid lines, center text — each a separate item.
   c. Produce a structured comparison table (MANDATORY):
      | # | Section | Element | Design (specific) | Implementation (specific) | Verdict |
      Every element gets specific values in both columns (hex colors, chart
      type names, px sizes, font weights — never vague descriptions).
      Only valid verdicts: ✅ MATCH or ❌ DEVIATION.
      NEVER write "appears to match" or "looks correct."
   d. Any ❌ DEVIATION is a CRITICAL bug with full reproduction:
      'Design: horizontal stacked bar with % labels inside bars.
       Build: vertical grouped bar with labels above bars.' — this is a bug.
      'Design: 32px Inter SemiBold. Build: 24px Inter Regular.' — this is a bug.
   e. If the comparison table has fewer than 30 rows for a full page, the
      audit is incomplete — go back and find the missing elements.

## Exploratory Testing (if Playwright MCP available)

After all scripted tests pass:
1. Check if Playwright MCP is registered in Claude Code settings (look for "playwright" in mcpServers)
2. If available: spend 5 minutes on adversarial interactive exploration using Playwright MCP
   - Attempt race conditions, double-submits, concurrent access patterns
   - Try unexpected input sequences, boundary values, rapid state transitions
   - Probe error recovery: does the app recover after failures or get stuck?
3. Tag all findings [EXPLORATORY] in your report
4. If Playwright MCP is not available: skip this section silently
Note: Exploratory findings are additive — they do not replace scripted test results.

## Report Format

For each bug found:
- **BUG-{N}**: {severity: CRITICAL/HIGH/MEDIUM/LOW}
  - **Reproduction**: {exact steps to reproduce}
  - **Expected**: {what should happen}
  - **Actual**: {what actually happens}
  - **Proof**: {test file or command that demonstrates the bug}

Summary:
- BUGS FOUND: {count} (with severity breakdown)
- COVERAGE GAPS: {untested flows from requirements}
- SHALLOW TESTS REWRITTEN: {count}
- CONTRACTS VERIFIED: {N}/{total}
- ATTACK VECTORS TRIED: {list every category attempted and results}
- VERDICT: FAIL ({N} bugs found) | GRUDGING PASS (exhaustive search, nothing found)

Write all findings to .gsd-t/red-team-report.md.
If bugs found, also append to .gsd-t/qa-issues.md."
```

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Append to `.gsd-t/token-log.md`:
`| {DT_START} | {DT_END} | gsd-t-execute | Red Team | sonnet | {DURATION}s | {VERDICT} — {N} bugs found | {TOKENS} | {COMPACTED} | | | {CTX_PCT} |`

**If Red Team VERDICT is FAIL:**
1. Fix all CRITICAL and HIGH bugs immediately (up to 2 fix attempts per bug)
2. Re-run Red Team after fixes
3. If bugs persist after 2 fix cycles, log to `.gsd-t/deferred-items.md` and present to user

**If Red Team VERDICT is GRUDGING PASS:** Proceed to completion.

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

Execute modifies source code, so the Pre-Commit Gate (referenced in Step 10) covers document updates. For clarity, the key documents affected by execution:

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
