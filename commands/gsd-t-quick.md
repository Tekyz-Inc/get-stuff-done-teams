# GSD-T: Quick — Fast Task Execution with Contract Awareness

You are executing a small, focused task that doesn't need full phase planning. This is for bug fixes, config changes, small features, and ad-hoc work.

## Step 0: Launch via Subagent

To give this task a fresh context window and prevent compaction during consecutive quick runs, always execute via a Task subagent.

**If you are the orchestrating agent** (you received the slash command directly):

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

**Token Budget Check (before spawning subagent):**

Run via Bash:
`node -e "const tb = require('./bin/token-budget.js'); const s = tb.getSessionStatus('.'); process.stdout.write(s.threshold);" 2>/dev/null`

Apply the result:
- `normal` or file missing → proceed with default model (sonnet)
- `downgrade` → downgrade subagent model from sonnet to haiku for non-critical tasks; apply `getDegradationActions()` model overrides
- `conserve` → run quick task inline (skip subagent spawn overhead); skip Red Team and doc-ripple
- `stop` → output: "Token budget exhausted — quick task deferred. Resume after session reset." and halt

**Stack Rules Detection (before spawning subagent):**

Run via Bash to detect project stack and collect matching rules. Local overrides in `.gsd-t/stacks/` take precedence over global templates.

```bash
GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t
STACKS_DIR="$GSD_T_DIR/templates/stacks"
LOCAL_STACKS=".gsd-t/stacks"
STACK_RULES=""
_sf() { local n=$(basename "$1"); [ -f "$LOCAL_STACKS/$n" ] && cat "$LOCAL_STACKS/$n" || cat "$1"; }
_add() { [ -f "$STACKS_DIR/$1" ] && STACK_RULES="${STACK_RULES}$(_sf "$STACKS_DIR/$1")"$'\n\n'; }
if [ -d "$STACKS_DIR" ]; then
  for f in "$STACKS_DIR"/_*.md; do [ -f "$f" ] && STACK_RULES="${STACK_RULES}$(_sf "$f")"$'\n\n'; done
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

**QA Calibration Injection** — Before evaluating test results, check for known weak spots:

Run via Bash:
`node -e "const qc = require('./bin/qa-calibrator.js'); const inj = qc.generateQAInjection('.'); if(inj) process.stdout.write(inj);" 2>/dev/null`

If the command produces output, treat it as a preamble to your QA evaluation — pay extra attention to the flagged weak-spot categories when writing and reviewing tests. If the file doesn't exist or returns empty, skip silently.

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

### Exploratory Testing (if Playwright MCP available)

After all scripted tests pass:
1. Check if Playwright MCP is registered in Claude Code settings (look for "playwright" in mcpServers)
2. If available: spend 3 minutes on interactive exploration using Playwright MCP
   - Try variations of happy paths with unexpected inputs
   - Probe for race conditions, double-submits, empty states
   - Test accessibility (keyboard navigation, screen reader flow)
3. Tag all findings [EXPLORATORY] in reports and append to .gsd-t/qa-issues.md
4. If Playwright MCP is not available: skip this section silently
Note: Exploratory findings do NOT count against the scripted test pass/fail ratio.

## Step 5.25: Design Verification Agent (MANDATORY when design contract exists)

After tests pass, check if `.gsd-t/contracts/design-contract.md` exists. If it does NOT, skip to Step 5.5.

If it DOES exist and this task involved UI changes — spawn the Design Verification Agent. This agent's ONLY job is to open a browser, compare the built frontend against the original design, and produce a structured comparison table. It writes NO feature code.

⚙ [{model}] Design Verification → visual comparison of built frontend vs design

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

```
Task subagent (general-purpose, model: opus):
"You are the Design Verification Agent. Your ONLY job is to visually compare
the built frontend against the original design and produce a structured
comparison table. You write ZERO feature code.

FAIL-BY-DEFAULT: Every visual element starts as UNVERIFIED. Prove each matches.

STEP 0 (MANDATORY FIRST): Data-labels cross-check.
For each element contract (or design-contract.md section), read the Test Fixture.
Verify EVERY label, value, percentage from the fixture appears verbatim in the
rendered UI. If any is missing → CRITICAL DEVIATION (wrong data). Wrong data
cannot be redeemed by visual polish.

1. Read .gsd-t/contracts/design-contract.md (flat) OR .gsd-t/contracts/design/ (hierarchical) for design source reference + Test Fixtures
2. Get Figma structured data via `get_metadata` (enumerate nodes) then `get_design_context`
   per widget node. ⚠ Do NOT use `get_screenshot` for Figma extraction — it returns pixels,
   not properties. `get_design_context` returns structured code and tokens.
   If no Figma MCP → use design images from contract as fallback.
3. Start dev server, open the built frontend in browser (Claude Preview/Chrome MCP/Playwright)
4. Compare built page values against `get_design_context` structured data
5. Build element inventory (30+ elements for a full page): every chart, label,
   icon, heading, card, button, spacing, color — each a separate row
6. Produce structured comparison table:
   | # | Section | Element | Design (specific) | Implementation (specific) | Verdict |
   Only valid verdicts: ✅ MATCH or ❌ DEVIATION (never 'appears to match')
7. SVG Structural Overlay Comparison:
   a. Export Figma frame as SVG (or ask user for SVG path if export unavailable)
   b. Parse SVG DOM: extract positions, dimensions, fills, text for every element
   c. Screenshot built page at same viewport width via Playwright
   d. Map SVG elements → built DOM elements by text content + position proximity
   e. Compare: position (≤2px=MATCH, 3-5px=REVIEW, >5px=DEVIATION),
      dimensions, colors (exact hex), text (exact match)
   f. Produce SVG structural diff table:
      | # | SVG Element | SVG Position | Built Position | Δ px | Verdict |
   g. Flag unmapped SVG elements as MISSING, unmapped DOM elements as EXTRA
   This catches aggregate visual drift that property-level checks miss.
8. Write results (property table + SVG diff) to .gsd-t/contracts/design-contract.md
   under '## Verification Status'
9. Any ❌ → append to .gsd-t/qa-issues.md with [VISUAL] tag
10. Report: DESIGN VERIFIED | DESIGN DEVIATIONS FOUND ({count})"
```

After subagent returns — run observability Bash and append to token-log.md.

**Artifact Gate:** Read `.gsd-t/contracts/design-contract.md` — if no `## Verification Status` section with a comparison table exists, re-spawn (1 retry).

**If deviations found:** Fix them (max 2 cycles), re-verify. If persistent, log to `.gsd-t/deferred-items.md`.

## Step 5.5: Red Team — Adversarial QA (MANDATORY)

After tests pass, spawn an adversarial Red Team agent. This agent's sole purpose is to BREAK the code that was just changed. Its success is measured by bugs found, not tests passed.

⚙ [{model}] Red Team → adversarial validation of quick task

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

```
Task subagent (general-purpose, model: opus):
"You are a Red Team QA adversary. Your job is to BREAK the code that was just changed.

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
`| {DT_START} | {DT_END} | gsd-t-quick | Red Team | sonnet | {DURATION}s | {VERDICT} — {N} bugs found | {TOKENS} | {COMPACTED} | | | {CTX_PCT} |`

**If Red Team VERDICT is FAIL:**
1. Fix all CRITICAL and HIGH bugs immediately (up to 2 fix attempts per bug)
2. Re-run Red Team after fixes
3. If bugs persist after 2 fix cycles, log to `.gsd-t/deferred-items.md` and present to user

**If Red Team VERDICT is GRUDGING PASS:** Proceed to doc-ripple.

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
