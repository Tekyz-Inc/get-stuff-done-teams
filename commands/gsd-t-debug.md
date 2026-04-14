# GSD-T: Debug — Systematic Debugging with Contract Awareness

You are debugging an issue in a contract-driven project. Your approach should identify whether the bug is within a domain or at a contract boundary.

## Step 0: Launch via Subagent

To give this debug session a fresh context window and prevent compaction, always execute via a Task subagent.

**If you are the orchestrating agent** (you received the slash command directly):

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

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`

Spawn a fresh subagent using the Task tool:
```
subagent_type: general-purpose
prompt: "You are running gsd-t-debug for this issue: {$ARGUMENTS}
Working directory: {current project root}
Read CLAUDE.md and .gsd-t/progress.md for project context, then execute gsd-t-debug starting at Step 1."
```

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))`
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tasks-Since-Reset |` if missing):
`| {DT_START} | {DT_END} | gsd-t-debug | Step 0 | sonnet | {DURATION}s | debug: {issue summary} | {COUNTER} |`

Relay the subagent's summary to the user. **Do not execute Steps 1–5 yourself.**

**If you are the spawned subagent** (your prompt says "starting at Step 1"):
Continue to Step 1 below.

## Step 1: Load Context

Read:
1. `CLAUDE.md`
2. `.gsd-t/progress.md`
3. `.gsd-t/contracts/` — all contracts
4. `.gsd-t/domains/*/scope.md` — domain boundaries

## Step 1.5: Debug Loop Detection (MANDATORY)

Before attempting any fix, check whether this issue has been through multiple failed debug sessions. This prevents the 10–20 attempt death spiral that happens when the same approach is retried repeatedly.

**Detection:**
1. Scan `.gsd-t/progress.md` Decision Log for `[debug]` entries related to this issue (match by keyword, error name, or component)
2. Count distinct debug sessions that attempted to fix this issue
3. Check `.gsd-t/deferred-items.md` for any entries matching this issue

**If 3 or more prior sessions found → Enter Deep Research Mode (below). Do NOT attempt another fix with the same approach.**

**If fewer than 3 sessions → Proceed to Step 2 normally.**

---

### Deep Research Mode (triggered when debug loop detected)

The current approach has failed 3+ times. This means the root cause is not yet understood. A different strategy — possibly a fundamentally different technical approach — is required.

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`

```
Spawn a deep research team (run all three in parallel):

- Teammate "researcher-root-cause": Take the broadest possible look at
  the problem. Ignore prior fix attempts. Read the full component,
  its dependencies, contracts, and all error traces from scratch.
  What is the actual root cause — not the symptom? Consider that the
  real issue may be architectural, not in the code being patched.

- Teammate "researcher-alternatives": Enumerate 3–5 fundamentally
  different ways to solve this problem. Include approaches that would
  require refactoring or changing the technical direction entirely.
  For each: what are the trade-offs, effort, and risk?

- Teammate "researcher-prior-art": Search external sources, docs,
  GitHub issues, and known patterns for this class of bug. Has this
  problem been documented elsewhere? What did others find? Are there
  framework-specific pitfalls or known workarounds?

Lead: Wait for all three researchers to complete. Then synthesize:
1. What is the true root cause based on full investigation?
2. What are the viable solution paths (ranked by confidence)?
3. Does any path require a different technical approach than what has been tried?
4. What is the recommended path and why?
```

After team completes — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))`
Append to `.gsd-t/token-log.md`:
`| {DT_START} | {DT_END} | gsd-t-debug | Step 1.5 | sonnet | {DURATION}s | deep research loop break: {issue summary} | {COUNTER} |`

**STOP. Present findings to the user before making any changes:**

```
## Debug Loop Break — Research Findings

**Issue**: {issue summary}
**Prior sessions**: {count} failed attempts

**Root Cause (revised)**: {finding from researcher-root-cause}

**Solution Options**:
| # | Approach | Effort | Risk | Notes |
|---|----------|--------|------|-------|
| 1 | {option} | {effort} | {risk}  | {notes} |
| 2 | {option} | {effort} | {risk}  | {notes} |
| 3 | {option} | {effort} | {risk}  | {notes} |

**Recommendation**: {recommended option and rationale}

**Does this require a different technical direction?** {Yes/No — explain}

Please select an option (or provide your own direction) before I proceed.
```

**Wait for explicit user selection/approval.** Do NOT proceed with any fix until the user confirms the chosen approach. If the recommendation requires refactoring or changing technical direction, the Destructive Action Guard applies — present the full migration path and wait for approval.

---

## Step 1.7: Experience Retrieval

Before proceeding to classification and fix, retrieve relevant past failures from the Decision Log.

Run via Bash:
`grep -i "\[failure\]\|\[learning\]" .gsd-t/progress.md | tail -10`

If results found:
- Display a `## ⚠️ Relevant Past Failures` block showing matching entries (max 5 lines)
- Pass this block as context to any debug subagent spawned in Step 3
- Write event via Bash: `node ~/.claude/scripts/gsd-t-event-writer.js --type experience_retrieval --command gsd-t-debug --reasoning "{N entries found}" --outcome null || true`

If no results found: proceed normally to Step 2.

---

## Step 1.7: Graph-Enhanced Root Cause Tracing (if available)

If `.gsd-t/graph/meta.json` exists, use the graph to accelerate root cause identification:

1. **Call chain from error**: `query('getCallers', { entity: '{error_function}' })` → trace backward from the error location
2. **Transitive callers**: `query('getTransitiveCallers', { entity: '{name}', depth: 5 })` → find the full path from entry point to error
3. **Domain ownership**: `query('getDomainOwner', { entity: '{name}' })` → immediately classify as within-domain or boundary bug
4. **Contract check**: `query('getContractFor', { entity: '{name}' })` → determine if the bug is at a contract boundary
5. **Related tests**: `query('getTestsFor', { entity: '{name}' })` → find existing tests that should have caught this

Graph results replace the manual "classify the bug" analysis in Step 2 — the call chain tells you exactly where the bug type is (within-domain vs boundary) based on whether the caller and callee are in the same domain.

## Step 2: Classify the Bug

Based on the user's description ($ARGUMENTS) and graph analysis (if available), determine:

### A) Within-Domain Bug
The issue is entirely inside one domain's scope. Symptoms:
- Error occurs in files owned by a single domain
- No cross-domain data flow involved
- Logic error, typo, missing validation within one area

→ Debug within that domain's files. Fix and verify against domain's acceptance criteria.

### B) Contract Boundary Bug
The issue occurs where domains interact. Symptoms:
- Data shape mismatch between producer and consumer
- API returns unexpected format
- UI sends wrong payload to backend
- Auth middleware doesn't integrate correctly with routes

→ Check the relevant contract first. Is the contract correct? Does the implementation match?

### C) Contract Gap
The contract didn't specify something it should have. Symptoms:
- Edge case not covered in contract
- Error handling not specified
- Race condition at boundary
- Missing contract entirely

→ Update the contract, then fix implementations on both sides.

## Step 2.5: Reproduce First (MANDATORY — Category 5)

**A fix attempt without a reproduction script is a guess, not a fix.**

Before touching any code:

1. **Write a reproduction script** that demonstrates the bug. Automate as much as possible:
   - Unit/integration bug → write a failing test that proves the bug exists
   - UI/audio/GPU/worker bug (not fully automatable) → write the closest possible script: a headless probe, a log-based trigger, a mock that replicates the failure path. Document the manual remainder explicitly.
   - If you cannot write any form of reproduction → you do not yet understand the bug. Keep investigating until you can.

2. **Run the reproduction** and confirm it fails before attempting any fix.

3. **Never close a debug session with "ready for testing."** A session closes only when the reproduction script passes. If manual steps remain, document them explicitly and confirm they passed.

4. **Log the reproduction script path** in `.gsd-t/progress.md` Decision Log: what it tests, how to run it, what passing looks like.

> This rule exists because code review cannot detect silent runtime failures (GPU compute shaders, audio context state, worker message drops). Only execution proves correctness.

---

## Step 3: Debug (Solo or Team)

### Deviation Rules

When you encounter unexpected situations during the fix:
1. **Related bug found while tracing** → Fix it immediately (up to 3 attempts). Log to `.gsd-t/deferred-items.md` if it recurs.
2. **Missing functionality required for the fix** → Add minimum needed. Note in commit message.
3. **Blocker (missing file, wrong API response)** → Fix blocker and continue. Log if non-trivial.
4. **Architectural change required to fix correctly** → STOP. Explain what exists, what needs to change, what breaks, and a migration path. Wait for user approval. Never self-approve.

**3-attempt limit**: If your fix doesn't work after 3 attempts within this session, treat it as a loop. Do NOT keep trying the same approach. Before entering Deep Research Mode, first try the headless debug-loop:
1. Write current failure context to `.gsd-t/debug-state.jsonl` via appendEntry
2. Log: "Delegating to headless debug-loop (3 in-context attempts exhausted)"
3. Run: `gsd-t headless --debug-loop --max-iterations 10`
4. Check exit code:
   - 0: Tests pass, continue
   - 1/4: Log to `.gsd-t/deferred-items.md`, then enter Deep Research Mode
   - 3: Report error, stop

If the debug-loop also fails (exit 1/4), log the attempt to `.gsd-t/progress.md` Decision Log with a `[failure]` prefix, return to Step 1.5 and run Deep Research Mode before any further attempts. Present findings and options to the user before proceeding.

### Solo Mode
1. Reproduce the issue — **reproduction script must exist before step 2** (see Step 2.5)
2. Trace through the relevant domain(s)
3. Check contract compliance at each boundary
4. Identify root cause
5. **Destructive Action Guard**: If the fix requires destructive or structural changes (dropping tables, removing columns, changing schema, replacing architecture patterns, removing working modules) → STOP and present the change to the user with what exists, what will change, what will break, and a safe migration path. Wait for explicit approval.
6. Fix and test — **adapt the fix to existing structures**, not the other way around
7. Update contracts if needed
8. **Category 6 — Bug Isolation Check**: After applying the fix, run the FULL test suite and all smoke tests — not just the reproduction script. Do not assume the bug was isolated. A fix that resolves one failure frequently uncovers adjacent failures. Every test must pass before the session closes.

### Team Mode (for complex cross-domain bugs)
```
Create an agent team to debug:
- Teammate 1: Investigate in {domain-1} — check implementation 
  against contracts, trace data flow
- Teammate 2: Investigate in {domain-2} — check implementation 
  against contracts, trace data flow
- Teammate 3: Check all contracts for gaps or ambiguities 
  related to the failing scenario

First to find root cause: message the lead with findings.
```

## Step 4: Document Ripple

After fixing, assess what documentation was affected by the change and update ALL relevant files:

### Always check:
1. **`.gsd-t/progress.md`** — Add to Decision Log: what broke, why, and the fix. Prefix the entry with an outcome tag:
   - Debug session start → prefix `[debug]`
   - Fix succeeded → prefix `[success]`
   - Fix failed → prefix `[failure]`
   - Issue deferred → prefix `[deferred]`
2. **`.gsd-t/contracts/`** — Update any contract if the fix changed an interface, schema, or API shape
3. **Domain `constraints.md`** — Add a "must not" rule if the bug was caused by a pattern that should be avoided

### Check if affected:
4. **`docs/requirements.md`** — Did the fix reveal a missing or incorrect requirement? Update it
5. **`docs/architecture.md`** — Did the fix change architectural patterns, data flow, or component relationships? Update it
6. **`docs/schema.md`** — Did the fix modify the database schema? Update it
7. **`.gsd-t/techdebt.md`** — Did the fix reveal related debt? Add a new TD item. Did it resolve an existing one? Mark it complete
8. **Domain `scope.md`** — Did the fix add new files or change ownership? Update it
9. **Domain `tasks.md`** — If the bug was in an active milestone, update task status or add a remediation task
10. **`CLAUDE.md`** — Did the fix establish a new convention or pattern that future work should follow? Add it

### Scan Doc Micro-Update (if `.gsd-t/scan/` exists):
Patch structural metadata in scan docs so they stay fresh between full scans. Near-zero cost — no LLM re-analysis.

For each scan doc that exists, apply only the relevant patches:
- **`.gsd-t/scan/architecture.md`** — Update file/directory counts if the fix added/removed files
- **`.gsd-t/scan/quality.md`** — Mark resolved TODOs/FIXMEs, update test counts if tests were added
- **`.gsd-t/scan/security.md`** — If the bug was a security issue, mark the finding `[RESOLVED]`
- **`.gsd-t/scan/business-rules.md`** — If the fix changed validation/auth/workflow logic, update the rule
- **`.gsd-t/scan/contract-drift.md`** — If contracts were updated as part of the fix, mark resolved drift items

Skip scan docs not affected by this fix. Skip analytical sections — those require a full scan.

### Skip what's not affected — don't update docs for the sake of updating them.

## Step 5: Test Verification (run tests confirming fix)

Before committing, ensure the fix is solid:

1. **Update tests**: If the bug reveals a missing test case, add one that would have caught it
2. **Run ALL configured test suites** — this is NOT optional:
   a. Detect all runners: check for vitest/jest config, playwright.config.*, cypress.config.*
   b. Run EVERY detected suite. Unit tests alone are NEVER sufficient when E2E exists.
   c. If `playwright.config.*` exists → run `npx playwright test` (full suite)
   d. Report ALL results: "Unit: X/Y pass | E2E: X/Y pass"
3. **Verify passing**: All tests must pass. If any fail, fix before proceeding (up to 2 attempts)
4. **If the project has a UI but no E2E specs cover the fixed area**: WRITE THEM.
5. **Functional test quality**: Every E2E assertion must verify an action produced the correct outcome (state changed, data loaded, content updated) — not just that elements exist. Tests that only check `isVisible`/`toBeEnabled` are shallow layout tests and don't catch real bugs. If a test would pass on an empty HTML page with the right IDs, rewrite it.
6. **Regression check**: Confirm the fix doesn't break any adjacent functionality

### Exploratory Testing (if Playwright MCP available)

After all scripted tests pass:
1. Check if Playwright MCP is registered in Claude Code settings (look for "playwright" in mcpServers)
2. If available: spend 3 minutes on interactive exploration using Playwright MCP
   - Specifically probe the area around the bug fix — related flows, boundary conditions
   - Try variations that might expose similar bugs nearby
   - Test the fix path under edge input conditions
3. Tag all findings [EXPLORATORY] in reports and append to .gsd-t/qa-issues.md
4. If Playwright MCP is not available: skip this section silently
Note: Exploratory findings do NOT count against the scripted test pass/fail ratio.

Commit: `[debug] Fix {description} — root cause: {explanation}`

## Step 5.3: Red Team — Adversarial QA (MANDATORY)

After the fix passes all tests, spawn an adversarial Red Team agent to BREAK the fix and find regressions.

⚙ [opus] Red Team → adversarial validation of debug fix

Resolve the templated prompt path via Bash:
```
RT_PROMPT="$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t/templates/prompts/red-team-subagent.md"
[ -f "$RT_PROMPT" ] || RT_PROMPT="templates/prompts/red-team-subagent.md"
T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")
```

Spawn Task subagent (general-purpose, model: opus):
> "Read `$RT_PROMPT` and follow it. Context: post-fix validation for a debug session. **Additional categories for this run:** (a) **Regression Around the Fix** — test every code path adjacent to the changed lines; fixes frequently break neighboring functionality. (b) **Original Bug Variants** — the original bug was {one-line description}; search for SIMILAR bugs in related code (same pattern, different location). Write findings to `.gsd-t/red-team-report.md`."

After subagent returns — run via Bash:
```
T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))
COUNTER=$(node bin/task-counter.cjs status 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s).count||''))}catch(_){process.stdout.write('')}})")
```
Append to `.gsd-t/token-log.md`:
`| {DT_START} | {DT_END} | gsd-t-debug | Red Team | opus | {DURATION}s | {VERDICT} — {N} bugs found | | | {COUNTER} |`

**If FAIL:** fix CRITICAL/HIGH bugs (≤2 cycles) → re-run. Persistent bugs → `.gsd-t/deferred-items.md`.
**If GRUDGING PASS:** proceed to metrics and doc-ripple.

## Step 5.5: Emit Task Metrics

After committing, emit a task-metrics record for this debug session — run via Bash:
`node bin/metrics-collector.js --milestone {current-milestone-or-none} --domain {domain-or-debug} --task debug-{timestamp} --command debug --duration_s {elapsed} --tokens_used {estimated} --context_pct ${CTX_PCT:-0} --pass {true|false} --fix_cycles {attempts} --signal_type debug-invoked --notes "[debug] {description}" 2>/dev/null || true`

Signal type is always `debug-invoked` for debug sessions.

Emit task_complete event — run via Bash:
`node ~/.claude/scripts/gsd-t-event-writer.js --type task_complete --command gsd-t-debug --reasoning "signal_type=debug-invoked, domain={domain}" --outcome {success|failure} || true`

## Step 6: Doc-Ripple (Automated)

After all work is committed but before reporting completion:

1. Run threshold check — read `git diff --name-only HEAD~1` and evaluate against doc-ripple-contract.md trigger conditions
2. If SKIP: log "Doc-ripple: SKIP — {reason}" and proceed to completion
3. If FIRE: spawn doc-ripple agent:

⚙ [{model}] gsd-t-doc-ripple → blast radius analysis + parallel updates

Task subagent (general-purpose, model: sonnet):
"Execute the doc-ripple workflow per commands/gsd-t-doc-ripple.md.
Git diff context: {files changed list}
Command that triggered: debug
Produce manifest at .gsd-t/doc-ripple-manifest.md.
Update all affected documents.
Report: 'Doc-ripple: {N} checked, {N} updated, {N} skipped'"

4. After doc-ripple returns, verify manifest exists and report summary inline

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
