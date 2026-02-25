# GSD-T: Debug — Systematic Debugging with Contract Awareness

You are debugging an issue in a contract-driven project. Your approach should identify whether the bug is within a domain or at a contract boundary.

## Step 0: Launch via Subagent

To give this debug session a fresh context window and prevent compaction, always execute via a Task subagent.

**If you are the orchestrating agent** (you received the slash command directly):

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

Spawn a fresh subagent using the Task tool:
```
subagent_type: general-purpose
prompt: "You are running gsd-t-debug for this issue: {$ARGUMENTS}
Working directory: {current project root}
Read CLAUDE.md and .gsd-t/progress.md for project context, then execute gsd-t-debug starting at Step 1."
```

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted |` if missing):
`| {DT_START} | {DT_END} | gsd-t-debug | Step 0 | sonnet | {DURATION}s | debug: {issue summary} | {TOKENS} | {COMPACTED} |`

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
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

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
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`
Compute tokens and compaction:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END
Append to `.gsd-t/token-log.md`:
`| {DT_START} | {DT_END} | gsd-t-debug | Step 1.5 | sonnet | {DURATION}s | deep research loop break: {issue summary} | {TOKENS} | {COMPACTED} |`

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

## Step 2: Classify the Bug

Based on the user's description ($ARGUMENTS), determine:

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

**3-attempt limit**: If your fix doesn't work after 3 attempts within this session, treat it as a loop. Do NOT keep trying the same approach. Log the attempt to `.gsd-t/progress.md` Decision Log, then return to Step 1.5 and run Deep Research Mode before any further attempts. Present findings and options to the user before proceeding.

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
1. **`.gsd-t/progress.md`** — Add to Decision Log: what broke, why, and the fix
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

### Skip what's not affected — don't update docs for the sake of updating them.

## Step 5: Test Verification (run tests confirming fix)

Before committing, ensure the fix is solid:

1. **Update tests**: If the bug reveals a missing test case, add one that would have caught it
2. **Run affected tests**: Execute all tests related to the changed files and domain
3. **Verify passing**: All tests must pass. If any fail, fix before proceeding (up to 2 attempts)
4. **Run E2E tests**: If the fix changed UI, routes, or user flows and an E2E framework exists, run affected specs
5. **Regression check**: Confirm the fix doesn't break any adjacent functionality

Commit: `[debug] Fix {description} — root cause: {explanation}`

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
