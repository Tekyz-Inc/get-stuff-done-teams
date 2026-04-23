# GSD-T: Execute — Run Domain Tasks (Solo or Parallel)

You are the lead agent coordinating task execution across domains. Choose solo or team mode based on the plan.

## Argument Parsing

Parse `$ARGUMENTS` before doing any work. M43 D4 removed the `--watch` opt-out; `--in-session`/`--headless` were never shipped. Under `.gsd-t/contracts/headless-default-contract.md` **v2.0.0** every command spawns — the dialog channel is reserved for the `/gsd` router's exploratory turns and is upstream of this command. Any legacy `--watch` token in `$ARGUMENTS` is accepted but ignored (printed as a single stderr deprecation line by the spawn primitive).

## Spawn Primitive — Always Headless (M43 D4, v2.0.0)

Per `.gsd-t/contracts/headless-default-contract.md` v2.0.0. Every Task-subagent spawn below goes headless unconditionally. Classification is kept only for downstream logging:

- `spawnType: 'primary'` — domain task-dispatcher (Step 3 fresh-dispatch)
- `spawnType: 'validation'` — Step 2 QA, Step 5.25 Design Verification, Step 5.5 Red Team, Step 7 doc-ripple

**Spawn path** (unconditional):

```bash
SESSION=$(node -e "
const has = require('./bin/headless-auto-spawn.cjs');
const r = has.autoSpawnHeadless({
  command: 'gsd-t-execute',
  args: [], // optional per-spawn args
  projectDir: process.cwd(),
  spawnType: '{primary|validation}',
  sessionContext: { step: '{step-id}', domain: '{domain-name}', task: '{task-id}' }
});
process.stdout.write(JSON.stringify(r));
")
echo "⚙ [${MODEL:-sonnet}] gsd-t-execute → ${DESC:-subagent} (headless)"
```

Then `bin/check-headless-sessions.js printBannerIfAny()` surfaces the completion on the next user message.

## Model Assignment

Per `.gsd-t/contracts/model-selection-contract.md` v1.0.0. Selection is deterministic via `bin/model-selector.js` — never runtime-overridden by context pressure.

- **Default**: `sonnet` — routine task execution (`selectModel({phase: "execute"})`). Sonnet is the M35 routine tier.
- **Mechanical subroutines** (demote to `haiku`):
  - Test runners (`selectModel({phase: "execute", task_type: "test_runner"})`)
  - Branch guards (`selectModel({phase: "execute", task_type: "branch_guard"})`)
  - File-existence checks (`selectModel({phase: "execute", task_type: "file_check"})`)
- **QA subagent (Step 2)**: `sonnet` — evaluation needs judgment per M31 tier refinement (`selectModel({phase: "execute", task_type: "qa"})`).
- **Red Team (Step 5.5)**: `opus` — adversarial reasoning benefits most from top tier (`selectModel({phase: "execute", task_type: "red_team"})`).
- **Escalation points**: at any declared high-stakes sub-decision (cross-module refactor, contract design, security-boundary change), invoke the convention-based `/advisor` fallback from `bin/advisor-integration.js`. If the `/advisor` tool is unavailable, the caller proceeds at the assigned model and logs a missed escalation to `.gsd-t/token-log.md` (see `.gsd-t/M35-advisor-findings.md`). Never silently downgrade the model or skip Red Team / doc-ripple under context pressure — M35 removed that behavior.

## Step 0.1: Verify Context Gate Readiness (MANDATORY — first thing in a fresh session)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 0 --step-label ".1: Verify Context Gate Readiness (MANDATORY — first thing in a fresh session)" 2>/dev/null || true
```

Run via Bash:

```bash
node -e "const tb = require('./bin/token-budget.cjs'); const s = tb.getSessionStatus('.'); console.log(JSON.stringify(s));"
```

This calls `getSessionStatus()` (v2.0.0) which reads `.gsd-t/.context-meter-state.json` produced by the Context Meter PostToolUse hook. If the state file is fresh (timestamp within 5 min), you get real `pct` and `threshold` values; if missing or stale, the call falls back to the historical heuristic from `.gsd-t/token-log.md`.

Use the returned `threshold` as the gate signal for the rest of this run. The gate logic is in Step 3.5; do NOT skip it. If the Context Meter hook isn't installed (`.gsd-t/.context-meter-state.json` missing and doctor reports it), run `gsd-t doctor` to diagnose — the gate still works via the heuristic fallback but real-time readings give much better guardrails.

Why: every `/gsd-t-execute` invocation is a fresh orchestrator session and needs a current reading of context utilization before spawning any subagents. The authoritative source is the Context Meter state file; the fallback keeps the gate functional on projects that haven't installed the hook yet.

## Step 1: Load State

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 1 --step-label "Load State" 2>/dev/null || true
```

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

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 1 --step-label ".5: Graph-Enhanced Domain Isolation Check (if available)" 2>/dev/null || true
```

If `.gsd-t/graph/meta.json` exists, run graph queries before execution begins:

1. **Reindex** (if stale): `query('reindex', { force: false })` — ensure graph reflects current code
2. **Domain boundary check**: For each domain about to execute, `query('getEntitiesByDomain', { domain })` — verify the domain's entities match its scope.md
3. **Pre-execution snapshot**: Record entity counts per domain — after execution, compare to detect scope creep (domain agent modified entities outside its domain)
4. **Cross-domain dependencies**: `query('getDomainBoundaryViolations', {})` — flag existing violations before work begins so they aren't confused with new violations introduced during execution

After each domain completes, re-run `getDomainBoundaryViolations` and diff against pre-execution snapshot. If new violations appear, flag them immediately before proceeding to the next domain.

## Step 2: QA Subagent

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 2 --step-label "QA Subagent" 2>/dev/null || true
```

In solo mode, QA runs inside each domain subagent (see Step 3). In team mode, the lead spawns QA subagents at each domain checkpoint using the pattern below.

**QA subagent prompt** — `spawnType: 'validation'` (always headless per headless-default-contract v2.0.0):
```
Task subagent (spawnType: validation, general-purpose, model: sonnet):
"Run the full test suite for this project and report pass/fail counts.
Read .gsd-t/contracts/ for contract definitions.
Write edge case tests for any new code paths in this task: {task description}.
Report: test pass/fail status and any coverage gaps found."
```

If QA found issues, append each to `.gsd-t/qa-issues.md` (create with header `| Date | Command | Step | Model | Duration(s) | Severity | Finding |` if missing):
`| {DT_START} | gsd-t-execute | Step 2 | haiku | {DURATION}s | {severity} | {finding} |`

## Step 3: Choose Execution Mode

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 3 --step-label "Choose Execution Mode" 2>/dev/null || true
```

### Optional — Parallel Dispatch (M44)

**Conditional check** — if `.gsd-t/domains/` contains more than one pending task that passes the D4 depgraph, D5 file-disjointness, and D6 economics gates, dispatch the ready batch via `gsd-t parallel` instead of the sequential task-dispatcher below. If the conditional fails (single pending task, or any gate vetoes, or disjointness is unprovable), fall through silently to the existing sequential path — there is no user prompt, no pause, no opt-out flag.

- **Mode auto-detection** — mode is auto-detected by `bin/gsd-t-parallel.cjs` from `GSD_T_UNATTENDED=1`. Do not hardcode `--mode` in this command file. Explicit `--mode` overrides env; omitted flag falls back to env; missing env defaults to in-session.
- **Fallback** — every gate veto (D4 `dep_gate_veto`, D5 `disjointness_fallback`, D6 estimated > threshold) removes the affected task(s) from the parallel batch. Tasks fall back to the sequential task-dispatcher silently; the dry-run plan table still lists them with decision `sequential` or `veto-deps` so the operator can see why.
- **Observability** — D2 owns the spawn observability. The parallel path writes the same `.gsd-t/events/YYYY-MM-DD.jsonl` event stream (`gate_veto`, `parallelism_reduced`, `task_split`) and the same `.gsd-t/token-log.md` rows that sequential spawns produce via `captureSpawn`. D3 adds no new spawn machinery — integration is purely a dispatch decision.
- **Zero-compaction invariant (unattended)** — for `[unattended]` runs, D2 enforces the zero-compaction contract by splitting tasks when D6 estimates per-worker CW > 60%. Mid-run compaction is not tolerated; the splitter slices before fan-out.
- **In-session invariant** — the parallel path NEVER interrupts the user with a pause/resume prompt. If the in-session headroom check reduces the worker count below the requested N, D2 emits `parallelism_reduced` and proceeds at the reduced count. The final floor is N=1 (sequential). If all gates fail, D2 falls back to sequential silently — no opt-out flag exists (consistent with M43 D4: `--in-session` / `--headless` were never shipped).

**Dispatch call** (example; resolve `--mode` via env):

```bash
# Dry-run first if you want to see the plan table without spawning:
gsd-t parallel --milestone {milestone} --dry-run

# Live dispatch (mode auto-detected from GSD_T_UNATTENDED):
gsd-t parallel --milestone {milestone}
```

`runParallel` produces the validated worker plan; the existing M40 orchestrator machinery owns the actual worker spawn, retry policy, wave barriers, and state-file lifecycle. Contract: `.gsd-t/contracts/wave-join-contract.md` v1.1.0. When the conditional is not met — or when every candidate task falls back via veto — proceed to the existing Wave Scheduling + Solo/Team Mode flow below.

### Wave Scheduling (read first)

Before choosing solo or team mode, read the `## Wave Execution Groups` section in `.gsd-t/contracts/integration-points.md` (added by the plan phase).

**If wave groups are present**:
- Execute wave-by-wave: complete all tasks in Wave 1 before starting Wave 2
- Within each wave, tasks marked as parallel-safe can run concurrently (team mode) or be interleaved (solo mode)
- At each wave boundary: run the CHECKPOINT — verify contract compliance — before proceeding
- **Design Hierarchy Checkpoint** (when `.gsd-t/contracts/design/INDEX.md` exists):
  At each wave boundary for design hierarchy waves (elements → widgets → pages):
  - **After element wave**: For each built element component, verify it renders and matches
    its element contract (chart type, dimensions, colors, props). Spot-check in a browser
    or headless render. Any element that doesn't match its contract → fix before widget wave.
  - **After widget wave**: For each built widget, verify it imports (not rebuilds) its element
    components and assembles them per the widget contract layout. Check: does the widget
    import from src/components/elements/? If it contains inline chart/card implementations
    that duplicate element components → FAIL the checkpoint, fix before page wave.
  - **After page wave**: Proceed to full Design Verification Agent (Step 5.25) for Figma comparison.
  These checkpoints are MANDATORY gates — not advisory. The entire point of hierarchical
  execution is that each layer is correct before the next layer builds on it.
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

**OBSERVABILITY LOGGING (MANDATORY) — wrap every task subagent spawn with `captureSpawn`:**

Route the spawn through `bin/gsd-t-token-capture.cjs` so the real `usage` envelope is parsed. The wrapper owns banner + timing + envelope parse + row write + JSONL record. Example for a per-task dispatch:

```
node -e "
const { captureSpawn } = require('./bin/gsd-t-token-capture.cjs');
(async () => {
  await captureSpawn({
    command: 'gsd-t-execute',
    step: 'task:{task-id}',
    model: 'sonnet',
    description: 'domain: {domain-name} task: {task-id}',
    projectDir: '.',
    domain: '{domain-name}',
    task: '{task-id}',
    notes: '{pass/fail}',
    spawnFn: async () => { /* Task(...) or spawn('claude', ...) call */ },
  });
})();
"
```

`captureSpawn` writes the row to `.gsd-t/token-log.md` under the canonical header (`| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Tokens | Notes | Domain | Task | Ctx% |`) — upgrading old headers in place. The **Tokens** cell renders as `in=N out=N cr=N cc=N $X.XX` when `result.usage` is present, or `—` when absent. Never `0`. Never `N/A`. The wrapper also pulls `Ctx%` from `getSessionStatus()` automatically (Step 3.5 context) — `pct` reads the real `input_tokens` count from `.gsd-t/.context-meter-state.json` produced by the Context Meter PostToolUse hook; when the state file is absent or stale, it reads `N/A`.

**For each domain (in wave order), run the domain task-dispatcher:**

**Token Budget Check (before dispatching each domain's tasks):**

Run via Bash:
`node -e "const tb = require('./bin/token-budget.cjs'); const s = tb.getSessionStatus('.'); process.stdout.write(JSON.stringify(s));" 2>/dev/null`

Capture `pct` as `{CTX_PCT}` for the token-log `Ctx%` column on the next spawn. The reading is observational only — under headless-default-contract v2.0.0 the spawn decision is no longer gated on `threshold`; every task-dispatcher spawn goes through `autoSpawnHeadless()` regardless of band.

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
4. Run observability Bash (T_START / DT_START)
5. Spawn task subagent — `spawnType: 'primary'` (always headless per headless-default-contract v2.0.0):

```
Task subagent (spawnType: primary, general-purpose, model: sonnet, mode: bypassPermissions):
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
4. **Design Hierarchy Build Rule** (if this task references a design contract):
   - If building an ELEMENT: implement ONLY this element's contract. Use exact values —
     every dimension, color, font size, spacing must trace to the contract or design tokens.
     No guessed values. Render in isolation to confirm before finishing.
   - If building a WIDGET: check src/components/elements/ for already-built element
     components. IMPORT them — do NOT rebuild element functionality inline. If the widget
     contract says 'uses chart-donut', import the chart-donut element. Building a second
     donut implementation inline is a TASK FAILURE.
   - If building a PAGE: check src/components/widgets/ for already-built widget components.
     IMPORT them — do NOT rebuild widget functionality inline. The page's job is composition
     and data wiring, not reimplementing widgets.
   - **Contract is authoritative**: If the element contract says 'bar-vertical-grouped'
     (vertical bars), build vertical bars — even if the Figma screenshot looks like it
     could be horizontal. The contract was written from careful design analysis; the
     screenshot is ambiguous at small sizes. When in doubt, follow the contract.
5. Implement the task
6. Verify acceptance criteria are met
7. Write comprehensive tests (MANDATORY — no feature code without test code):
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
8. **Render-Measure-Compare Loop** (when design-to-code stack rule is active — MANDATORY):
   After implementing the component, you MUST verify it renders correctly by measuring
   the actual DOM output against the contract's layout spec. This is not optional.
   Do NOT rely on visual inspection or screenshots — measure mechanically.

   a. **Render**: Start the dev server if not running. Navigate to a route where the
      component is visible (or create a temporary test route that renders it in isolation).

   b. **Measure via Playwright** — run `page.evaluate()` to extract DOM properties:
      ```javascript
      // For a widget: measure its internal layout
      const el = document.querySelector('.widget-selector');
      const style = getComputedStyle(el);
      return {
        display: style.display,           // 'flex' or 'grid'
        flexDirection: style.flexDirection, // 'row' or 'column'
        gap: style.gap,
        gridTemplateColumns: style.gridTemplateColumns,
        width: el.offsetWidth,
        height: el.offsetHeight,
        childCount: el.children.length,
        children: Array.from(el.children).map(c => ({
          tag: c.tagName,
          width: c.offsetWidth,
          height: c.offsetHeight,
          display: getComputedStyle(c).display,
          flexDirection: getComputedStyle(c).flexDirection,
        }))
      };
      ```

   c. **Compare to contract** — check each measured value against the contract spec:
      - `body_layout: flex-row` → verify `flexDirection === 'row'`
      - `container_height: 334px` → verify `height === 334` (±2px tolerance)
      - Grid `2×2` → verify parent has 2 row children, each with 2 card children
      - Legend position: if contract says `body_sidebar` (beside chart) →
        verify legend and chart share a `flex-row` parent.
        If contract says `footer_legend` (below chart) →
        verify legend is in a `flex-column` parent below the chart.

   d. **Fix mismatches** — if ANY measurement doesn't match the contract:
      - Log: "LAYOUT MISMATCH: {property} expected {contract value}, got {measured value}"
      - Fix the code to match the contract spec
      - Re-render and re-measure (max 2 fix cycles)
      - If still mismatched after 2 cycles → log to `.gsd-t/deferred-items.md`

   e. **All pass** → log "RENDER-MEASURE PASS: {N} layout properties verified" and proceed.

   This loop catches the exact class of errors that visual inspection misses:
   grid-cols-4 instead of 2×2, legend below instead of beside, wrong flex-direction.
   These are data comparisons, not visual judgments — the same kind of check as a unit test.
9. Run ALL test suites — this is NOT optional, not conditional, not "if applicable":
   a. Detect configured test runners: check for vitest/jest config, playwright.config.*, cypress.config.*
   b. Run EVERY detected suite. Unit tests alone are NEVER sufficient when E2E exists.
   c. If `playwright.config.*` exists → run `npx playwright test` (full suite, not just affected specs)
   d. If E2E tests fail → fix (up to 2 attempts) before proceeding
   e. Report ALL suite results: "Unit: X/Y pass | E2E: X/Y pass" — never report just one
10. Run Pre-Commit Gate checklist from CLAUDE.md — update all affected docs BEFORE committing
11. Commit immediately: feat({domain-name}/task-{task-id}): {description}
12. Update .gsd-t/progress.md — mark this task complete; prefix the Decision Log entry:
    - Completed successfully on first attempt → prefix `[success]`
    - Completed after a fix → prefix `[learning]`
    - Deferred to .gsd-t/deferred-items.md → prefix `[deferred]`
    - Failed after 3 attempts → prefix `[failure]`
13. Spawn QA subagent (model: sonnet) after completing the task. Resolve the templated prompt path first so the orchestrator never holds the full prompt body in its own context:
    Run via Bash: `QA_PROMPT="$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t/templates/prompts/qa-subagent.md"; [ -f "$QA_PROMPT" ] || QA_PROMPT="templates/prompts/qa-subagent.md"`
    Then spawn the subagent with this short prompt:
    'You are the QA agent. Read `'"$QA_PROMPT"'` and follow it exactly. Do not deviate from the protocol in that file. Context for this run: domain={domain-name}, task=task-{task-id}, files-modified={list-from-task-summary}.'
    If QA fails OR shallow tests are found, fix before proceeding. Append issues to .gsd-t/qa-issues.md.
14. Write task summary to .gsd-t/domains/{domain-name}/task-{task-id}-summary.md:
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
   - Run observability Bash (T_END / DURATION / CTX_PCT)
   - Append to token-log.md (per-task row)
   - Alert on CTX_PCT thresholds (display to user inline)
   - **Emit task-metrics record** — run via Bash:
     `node bin/metrics-collector.js --milestone {milestone} --domain {domain-name} --task task-{task-id} --command execute --duration_s $DURATION --tokens_used 0 --context_pct ${CTX_PCT:-0} --pass {true|false} --fix_cycles {0|N} --signal_type {pass-through|fix-cycle} --notes "{brief outcome}" 2>/dev/null || true`
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

5. **Per-domain Design Verification** — if `.gsd-t/contracts/design-contract.md` exists AND this domain modified UI files, invoke Step 5.25 (Design Verification Agent) NOW for this domain. Otherwise skip.

6. **Per-domain Red Team** — invoke Step 5.5 (Red Team) NOW for this domain. This is the first place Red Team runs in v2.74.12 — there is no global post-execute Red Team anymore. If Red Team returns FAIL, fix bugs and re-run before proceeding to the next domain (max 2 fix-and-verify cycles); if bugs persist, log to `.gsd-t/deferred-items.md` and present to user.

7. **Context observation** — run `node -e "const tb=require('./bin/token-budget.cjs'); const s=tb.getSessionStatus('.'); process.stdout.write(JSON.stringify(s));"` and capture `pct` for the NEXT spawn's token-log row. No gating: the next domain dispatcher runs through `autoSpawnHeadless()` either way under headless-default-contract v2.0.0.

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

## Step 3.5: Orchestrator Context Gate (MANDATORY)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 3 --step-label ".5: Orchestrator Context Gate (MANDATORY)" 2>/dev/null || true
```

Context observation — the orchestrator captures `getSessionStatus()` BEFORE every spawn for the Ctx% column only. Under headless-default-contract v2.0.0 the band does NOT gate the spawn decision; every task-dispatcher spawn goes through `autoSpawnHeadless()`.

**Before each task spawn — capture ctx reading:**

```bash
node -e "const tb=require('./bin/token-budget.cjs'); const s=tb.getSessionStatus('.'); process.stdout.write(JSON.stringify(s));"
```

The JSON on stdout contains `{pct, threshold}`. Capture `pct` as `{CTX_PCT}` for the token-log `Ctx%` column on the NEXT spawn. The `threshold` field is observational — no longer used for branching.

**Configuring the threshold:**

The threshold percentage (default `75`) lives in `.gsd-t/context-meter-config.json`. The `modelWindowSize` used for the denominator is in the same file (default `200000`). Override either by editing that file.

## Step 4: Checkpoint Handling

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 4 --step-label "Checkpoint Handling" 2>/dev/null || true
```

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

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 5 --step-label "Error Handling" 2>/dev/null || true
```

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

## Step 5.25: Design Verification Agent (per-domain, MANDATORY when design contract exists)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 5 --step-label ".25: Design Verification Agent (per-domain, MANDATORY when design contract exists)" 2>/dev/null || true
```

**IMPORTANT — frequency change in v2.74.12**: Design Verification was previously run once at the end of every execute run, regardless of how many domains existed. It is now run ONCE PER COMPLETED DOMAIN — call this step from the "After all tasks in a domain complete" block (Step 3.5 area), not from a global post-execute hook. This keeps verification co-located with the changes that introduced visual deviation, but stops the agent from re-materializing on every task spawn (which is what commit `b68353e` accidentally caused).

After all tasks in the CURRENT DOMAIN complete and per-task QA has passed, check if `.gsd-t/contracts/design-contract.md` exists. If it does NOT exist, skip this step entirely.

If it DOES exist AND this domain touched UI files — spawn the **Design Verification Agent**. This agent's ONLY job is to open a browser, compare the built frontend against the original design, and produce a structured comparison table. It writes NO feature code.

⚙ [opus] Design Verification → visual comparison for domain {domain-name}

**OBSERVABILITY LOGGING (MANDATORY) — wrap the Design Verification spawn with `captureSpawn`:**

Resolve the templated prompt path first so the orchestrator never holds the full ~3500-token verification protocol in its own context:

```bash
DV_PROMPT="$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t/templates/prompts/design-verify-subagent.md"
[ -f "$DV_PROMPT" ] || DV_PROMPT="templates/prompts/design-verify-subagent.md"
```

Then spawn through `captureSpawn` — `spawnType: 'validation'` (always headless per headless-default-contract v2.0.0):

```
node -e "
const { captureSpawn } = require('./bin/gsd-t-token-capture.cjs');
(async () => {
  await captureSpawn({
    command: 'gsd-t-execute',
    step: 'Design Verify',
    model: 'opus',
    description: 'visual comparison for domain {domain-name}',
    projectDir: '.',
    domain: '{domain-name}',
    task: '-',
    notes: '{VERDICT} — {MATCH}/{TOTAL} elements',
    spawnFn: async () => { /* Task subagent (spawnType: validation, general-purpose, model: opus):
      'You are the Design Verification Agent. Read $DV_PROMPT and follow it exactly.
      Do not deviate from that protocol. Context for this run:
        - domain: {domain-name}
        - design contract: .gsd-t/contracts/design-contract.md
        - files modified by this domain: {list}
      Report back the verdict, match count, breakpoints verified, deviation count
      and summary, and the full comparison table per the protocol's Step 7.' */ },
  });
})();
"
```

`captureSpawn` parses `result.usage` and appends a row to `.gsd-t/token-log.md` under the canonical header. Tokens column renders as `in=N out=N cr=N cc=N $X.XX` or `—`, never `N/A`.

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

## Step 5.5: Red Team — Adversarial QA (per-domain, MANDATORY)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 5 --step-label ".5: Red Team — Adversarial QA (per-domain, MANDATORY)" 2>/dev/null || true
```

**IMPORTANT — frequency change in v2.74.12**: Red Team was promoted to per-task by commit `da6d3ae` on the assumption that the orchestrator would catch context drain via an environment-variable-based self-check. That env-var path was never populated by Claude Code, so the check was inert and the per-task spawning of ~10k-token Red Team subagents was the largest single contributor to the v2.74.x context-burn regression. Red Team is now run ONCE PER COMPLETED DOMAIN — call this step from the "After all tasks in a domain complete" block, not from a per-task hook.

After all tasks in the CURRENT DOMAIN pass their tests, spawn an adversarial Red Team agent. Its sole purpose is to BREAK the domain that was just built.

⚙ [opus] Red Team → adversarial validation for domain {domain-name}

**OBSERVABILITY LOGGING (MANDATORY) — wrap the Red Team spawn with `captureSpawn`:**

Resolve the templated prompt path so the orchestrator never holds the full ~3500-token Red Team protocol in its own context:

```bash
RT_PROMPT="$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t/templates/prompts/red-team-subagent.md"
[ -f "$RT_PROMPT" ] || RT_PROMPT="templates/prompts/red-team-subagent.md"
```

Then spawn through `captureSpawn` — `spawnType: 'validation'` (always headless per headless-default-contract v2.0.0):

```
node -e "
const { captureSpawn } = require('./bin/gsd-t-token-capture.cjs');
(async () => {
  await captureSpawn({
    command: 'gsd-t-execute',
    step: 'Red Team',
    model: 'opus',
    description: 'adversarial validation for domain {domain-name}',
    projectDir: '.',
    domain: '{domain-name}',
    task: '-',
    notes: '{VERDICT} — {N} bugs found',
    spawnFn: async () => { /* Task subagent (spawnType: validation, general-purpose, model: opus):
      'You are a Red Team QA adversary. Read $RT_PROMPT and follow it exactly.
      Do not deviate from that protocol. Context for this run:
        - domain: {domain-name}
        - files modified by this domain: {list}
        - tasks just completed: {task-id list}
      Report back the verdict (FAIL or GRUDGING PASS), bugs found by severity,
      attack categories exhausted, and the path to the written
      .gsd-t/red-team-report.md.' */ },
  });
})();
"
```

`captureSpawn` parses `result.usage` and appends a row to `.gsd-t/token-log.md`. Tokens column renders as `in=N out=N cr=N cc=N $X.XX` or `—`, never `N/A`.

**If Red Team VERDICT is FAIL:**
1. Fix all CRITICAL and HIGH bugs immediately (up to 2 fix attempts per bug)
2. Re-run Red Team after fixes
3. If bugs persist after 2 fix cycles, log to `.gsd-t/deferred-items.md` and present to user

**If Red Team VERDICT is GRUDGING PASS:** Proceed to completion.

## Step 6: Completion

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 6 --step-label "Completion" 2>/dev/null || true
```

When all tasks in all domains are complete:
1. Update `.gsd-t/progress.md` — all tasks marked complete
2. Set status to `EXECUTED`
3. List any contract deviations or decisions made during execution

### Autonomy Behavior

**Level 3 (Full Auto)**: Log a brief status line (e.g., "✅ Execute complete — {N}/{N} tasks done") and auto-advance to the next phase. Do NOT wait for user input.

**Level 1–2**: Report completion summary and recommend proceeding to integrate phase. Wait for confirmation.

## Step 7: Doc-Ripple (Automated)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-execute --step 7 --step-label "Doc-Ripple (Automated)" 2>/dev/null || true
```

After all work is committed but before reporting completion:

1. Run threshold check — read `git diff --name-only HEAD~1` and evaluate against doc-ripple-contract.md trigger conditions
2. If SKIP: log "Doc-ripple: SKIP — {reason}" and proceed to completion
3. If FIRE: spawn doc-ripple agent — `spawnType: 'validation'` (always headless per headless-default-contract v2.0.0):

⚙ [{model}] gsd-t-doc-ripple → blast radius analysis + parallel updates

Task subagent (spawnType: validation, general-purpose, model: sonnet):
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
