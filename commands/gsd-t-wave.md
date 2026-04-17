# GSD-T: Wave — Full Cycle Orchestration (Agent-Per-Phase)

You are the wave orchestrator. You do NOT execute phases yourself. Instead, you spawn an **independent agent for each phase**, giving each a fresh context window. This eliminates context accumulation across phases and prevents mid-wave compaction.

## Argument Parsing

Parse `$ARGUMENTS`. Detect `--watch` (sets `WATCH_FLAG=true`; default `false`). Per `.gsd-t/contracts/headless-default-contract.md` §2, `--watch` propagates to **primary** phase-agent spawns only. Validation spawns (doc-ripple in Step 7) always go headless regardless of the flag.

## Spawn Primitive — Default Headless (M38 Domain 1)

Per `.gsd-t/contracts/headless-default-contract.md` v1.0.0. Spawn classifications used below:

- `spawnType: 'primary'` — per-phase agents (partition, discuss, plan, impact, execute, test-sync, integrate, verify+complete)
- `spawnType: 'validation'` — post-phase spot-checks, doc-ripple agent

Default path is `autoSpawnHeadless({command, spawnType, watch: WATCH_FLAG, projectDir, sessionContext})` with the read-back banner surfacing completion. When `WATCH_FLAG=true` AND `spawnType='primary'`, `autoSpawnHeadless` returns `{mode:'in-context'}` and the orchestrator falls back to the in-context Task-agent pattern documented inline.

## Model Assignment

Per `.gsd-t/contracts/model-selection-contract.md` v1.0.0. Each phase spawn picks its tier from `bin/model-selector.js` — the wave orchestrator itself is routine coordination work.

- **Wave orchestrator (this agent)**: `sonnet` (`selectModel({phase: "wave"})`).
- **Per-phase spawns**: each phase agent selects its own tier — `partition` → opus, `discuss` → opus, `plan` → sonnet, `execute` → sonnet (with mechanical haiku subroutines and opus Red Team), `test-sync` → sonnet, `integrate` → sonnet, `verify` → opus, `doc-ripple` → sonnet. The phase command files carry their own Model Assignment blocks.
- **Escalation**: `/advisor` convention-based fallback from `bin/advisor-integration.js` at declared high-stakes sub-decisions (see `.gsd-t/M35-advisor-findings.md`). Never silently downgrade the model or skip phases under context pressure — M35 removed that behavior.

## Step 0.1: Verify Context Gate Readiness (MANDATORY — first thing in a fresh session)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-wave --step 0 --step-label ".1: Verify Context Gate Readiness (MANDATORY — first thing in a fresh session)" 2>/dev/null || true
```

Run via Bash:

```bash
node -e "const tb = require('./bin/token-budget.cjs'); const s = tb.getSessionStatus('.'); console.log(JSON.stringify(s));"
```

This calls `getSessionStatus()` which reads `.gsd-t/.context-meter-state.json` produced by the Context Meter PostToolUse hook. The returned `threshold` is `normal` or `threshold` (single-band model per `context-meter-contract.md` v1.3.0) and drives the gate logic in the Phase Agent Spawn Pattern below. When the state file is absent, `getSessionStatus()` returns `{pct: 0, threshold: 'normal'}`. `thresholdPct` (default `75`) and `modelWindowSize` are configured in `.gsd-t/context-meter-config.json`.

## Step 1: Load State (Lightweight)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-wave --step 1 --step-label "Load State (Lightweight)" 2>/dev/null || true
```

Read ONLY:
1. `.gsd-t/progress.md` — current status, milestone name, phase state
2. `CLAUDE.md` — autonomy level only (scan for Level 1/2/3)

Do NOT read contracts, domains, docs, or source code. You are the orchestrator — phase agents handle their own context loading.

### Integrity Check

After reading progress.md, verify it contains the required fields before proceeding:
- **Status field**: A `Status:` line with a recognized value (DEFINED, PARTITIONED, PLANNED, etc.)
- **Milestone name**: A `Milestone` heading or table entry identifying the current milestone
- **Domains table**: A `| Domain |` table with at least one row

If ANY of these are missing or malformed, STOP and report:
"Wave cannot proceed — progress.md is missing required fields: {list}. Run `/gsd-t-status` to inspect, or `/gsd-t-init` to repair."
Do NOT attempt to fix progress.md yourself — that risks data loss.

## Step 2: Determine Resume Point

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-wave --step 2 --step-label "Determine Resume Point" 2>/dev/null || true
```

From progress.md status, determine which phase to start from:

| Status | Next Phase |
|--------|------------|
| READY | Need milestone first — prompt user or run milestone |
| INITIALIZED / DEFINED | Partition |
| PARTITIONED | Discuss (or skip to Plan if path is clear) |
| DISCUSSED | Plan |
| PLANNED | Impact |
| IMPACT_ANALYZED | Execute |
| EXECUTED | Test-Sync |
| TESTS_SYNCED | Integrate |
| INTEGRATED | Verify |
| VERIFIED | Complete |
| VERIFY_FAILED | Remediate → re-Verify |

## Step 2.5: Token Budget Pre-Flight (if available)

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-wave --step 2 --step-label ".5: Token Budget Pre-Flight (if available)" 2>/dev/null || true
```

Before starting the phase loop, check the projected token cost for this milestone:

Run via Bash:
`node -e "const tb = require('./bin/token-budget.cjs'); const est = tb.estimateMilestoneCost('.'); if(est) process.stdout.write(JSON.stringify(est));" 2>/dev/null`

If the command returns data, display to user:
- `estimated_tokens`: projected total tokens for this milestone
- `warning`: if `estimated_tokens > budget_ceiling * 0.8`, warn: "Token budget pre-flight: {estimated_tokens} tokens estimated — approaching session ceiling. Consider splitting milestone."

If the file doesn't exist or returns nothing, skip silently and proceed.

## Step 3: Phase Orchestration Loop

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-wave --step 3 --step-label "Phase Orchestration Loop" 2>/dev/null || true
```

For each remaining phase, spawn an **independent agent** using the Task tool. Each agent gets a fresh context window, loads its own state from files, and reports back.

### Graph Availability

If `.gsd-t/graph/meta.json` exists, the code graph is available for all phases. Each phase agent's spawn prompt should include:
"If .gsd-t/graph/meta.json exists, use graph queries (getCallers, getDomainBoundaryViolations, getTestsFor, etc.) to enhance analysis per the phase command instructions."

### Phase Agent Spawn Pattern

For each phase, spawn the agent like this:

**Stack Rules Detection (before spawning subagent):**
Run via Bash to detect project stack and collect matching rules:
`GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t; STACKS_DIR="$GSD_T_DIR/templates/stacks"; STACK_RULES=""; if [ -d "$STACKS_DIR" ]; then for f in "$STACKS_DIR"/_*.md; do [ -f "$f" ] && STACK_RULES="${STACK_RULES}$(cat "$f")"$'\n\n'; done; if [ -f "package.json" ]; then grep -q '"react"' package.json 2>/dev/null && [ -f "$STACKS_DIR/react.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/react.md")"$'\n\n'; (grep -q '"typescript"' package.json 2>/dev/null || [ -f "tsconfig.json" ]) && [ -f "$STACKS_DIR/typescript.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/typescript.md")"$'\n\n'; grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/node-api.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/node-api.md")"$'\n\n'; fi; [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] && [ -f "$STACKS_DIR/python.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/python.md")"$'\n\n'; [ -f "go.mod" ] && [ -f "$STACKS_DIR/go.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/go.md")"$'\n\n'; [ -f "Cargo.toml" ] && [ -f "$STACKS_DIR/rust.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/rust.md")"$'\n\n'; ([ -f ".gsd-t/contracts/design-contract.md" ] || [ -f "design-tokens.json" ] || [ -d "design-tokens" ] || [ -f ".figmarc" ] || [ -f "figma.config.json" ] || grep -q '"figma"' ~/.claude/settings.json 2>/dev/null) && [ -f "$STACKS_DIR/design-to-code.md" ] && STACK_RULES="${STACK_RULES}$(cat "$STACKS_DIR/design-to-code.md")"$'\n\n'; fi`

If STACK_RULES is non-empty, append to the subagent prompt:
```
## Stack Rules (MANDATORY — violations fail this task)

{STACK_RULES}

These standards have the same enforcement weight as contract compliance.
Violations are task failures, not warnings.
```

If STACK_RULES is empty (no templates/stacks/ dir or no matches), skip silently.

**OBSERVABILITY LOGGING (MANDATORY) — repeat for every phase spawn:**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`

```
Task agent (spawnType: primary, subagent_type: "general-purpose", mode: "bypassPermissions"):
  "Execute the {PHASE} phase of the current GSD-T milestone.

   Read and follow the full instructions in commands/gsd-t-{phase}.md
   Read .gsd-t/progress.md for current milestone and state.
   Read CLAUDE.md for project conventions.
   Read .gsd-t/contracts/ for domain interfaces.

   Complete the phase fully:
   - Follow every step in the command file
   - Update .gsd-t/progress.md status when done
   - Run document ripple as specified
   - Commit your work

   Report back: one-line status summary."
```

After phase agent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))`

**Wave Orchestrator Context Gate (MANDATORY) — single-band measurement via Context Meter state file:**

Run via Bash AFTER each phase agent returns:

```bash
node -e "const tb=require('./bin/token-budget.cjs'); const s=tb.getSessionStatus('.'); process.stdout.write(JSON.stringify(s));"
```

The JSON on stdout contains `{pct, threshold}` where `threshold` is `normal` or `threshold` (single-band model per `context-meter-contract.md` v1.3.0). Capture `pct` as `{CTX_PCT}` for the token-log row.

Handling:
- `threshold === 'normal'` → proceed to the next phase.
- `threshold === 'threshold'` → the Context Meter's PostToolUse hook has already emitted the `next-spawn-headless:true` marker; the orchestrator routes subsequent subagent spawns through `autoSpawnHeadless()`. No manual checkpoint/halt — the meter + spawn primitive together handle handoff.

Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |` if missing):
`| {DT_START} | {DT_END} | gsd-t-wave | {PHASE} | sonnet | {DURATION}s | phase: {PHASE} | | | {CTX_PCT} |`

Where `{CTX_PCT}` is the `pct` field from the JSON the getSessionStatus command just printed.

### Phase Sequence

Execute phases in this order, spawning one agent per phase:

#### 1. PARTITION
Spawn agent → `commands/gsd-t-partition.md`
- After: Read `progress.md`, verify status = PARTITIONED
- If failed: Report error, stop

#### 2. DISCUSS (conditional)
- **Structured skip check** — skip discuss and go directly to Plan if ALL of these are true:
  - (a) Single domain milestone (only one entry in Domains table)
  - (b) No items containing "OPEN QUESTION" in the Decision Log
  - (c) For multi-domain milestones: all cross-domain contracts exist in `.gsd-t/contracts/`
- If ANY check fails: Spawn agent → `commands/gsd-t-discuss.md`
  - **Note**: Discuss always pauses for user input, even at Level 3. The discuss agent will interact with the user directly.
- If all checks pass: Skip to Plan

#### 3. PLAN
Spawn agent → `commands/gsd-t-plan.md`
- After: Read `progress.md`, verify status = PLANNED

#### 4. IMPACT
Spawn agent → `commands/gsd-t-impact.md`
- After: Read `progress.md` and `.gsd-t/impact-report.md`
- **Decision Gate**:
  - PROCEED → continue to Execute
  - PROCEED WITH CAUTION → log items, continue
  - BLOCK → stop, report to user, wait for decision

#### 5. EXECUTE
Spawn agent → `commands/gsd-t-execute.md`
- This is the heaviest phase. The execute agent uses **task-level dispatch** (fresh-dispatch-contract.md): one Task subagent per task within each domain, each receiving only scope.md + relevant contracts + single task + graph context + up to 5 prior summaries. The execute agent handles domain task-dispatching and QA internally.
- **Adaptive replanning**: After each domain completes, the execute agent runs a replan check (per `adaptive-replan-contract.md`). If a completed domain's task summaries reveal new constraints (e.g., deprecated API, wrong column name, incompatible library), the execute agent checks remaining domains' `tasks.md` files for invalidated assumptions and revises them on disk before dispatching the next domain. Maximum 2 replan cycles per execute run — if exceeded, execution pauses for user input. All replan decisions are logged to the Decision Log in `progress.md`. The wave phase summary includes any replan actions taken.
- **Team/parallel mode**: If the plan defines parallel domains (same wave), the execute agent dispatches each domain teammate with `isolation: "worktree"` (per worktree-isolation-contract.md). Each domain works in an isolated git worktree. After all domains complete, the execute agent runs the Sequential Merge Protocol: merge domain A → test → merge domain B → test. Per-domain rollback if tests fail. Worktrees are cleaned up after all merges complete.
- After: Read `progress.md`, verify status = EXECUTED. Phase summary must include replan actions if any occurred:
  ```
  📋 Phase 5 (EXECUTE): {N}/{N} tasks done | Replan cycles: {N} | Domains revised: {list or "none"}
  ```

#### 6. TEST-SYNC
Spawn agent → `commands/gsd-t-test-sync.md`
- After: Read `progress.md`, verify status = TESTS_SYNCED

#### 7. INTEGRATE
Spawn agent → `commands/gsd-t-integrate.md`
- After: Read `progress.md`, verify status = INTEGRATED

#### 8. VERIFY + COMPLETE
Spawn agent → `commands/gsd-t-verify.md`
- The verify agent runs all 8 standard quality gates **plus** the goal-backward verification step (Step 5.5 in gsd-t-verify.md), which checks that milestone goals are actually achieved end-to-end and scans for placeholder patterns per `.gsd-t/contracts/goal-backward-contract.md`
- Goal-backward runs after all structural gates pass — CRITICAL or HIGH findings block verification; MEDIUM findings are warnings only
- **Verify auto-invokes complete-milestone** (Step 8 of gsd-t-verify.md). The verify agent handles both verification AND milestone completion in a single agent context. Do NOT spawn a separate complete agent.
- After: Read `progress.md`, check status:
  - COMPLETED → milestone done (verify passed and auto-completed)
  - VERIFIED → verify passed but complete-milestone failed — spawn a standalone complete agent as fallback
  - VERIFY_FAILED → handle remediation (see Error Recovery) — includes goal-backward failures
- Phase summary must include the `Goal-Backward:` line from verify-report.md:
  ```
  📋 Phase 8 (VERIFY+COMPLETE): {N} gates passed | Goal-Backward: {PASS/WARN/FAIL} — {N} requirements checked, {N} findings
  ```

#### 9. DOC-RIPPLE (Automated — after verify+complete)

After the final phase completes but before wave reports done:

1. Run threshold check — read `git diff --name-only HEAD~1` and evaluate against doc-ripple-contract.md trigger conditions
2. If SKIP: log "Doc-ripple: SKIP — {reason}" and proceed
3. If FIRE: spawn doc-ripple agent — `spawnType: 'validation'` (always headless, `--watch` ignored):

⚙ [{model}] gsd-t-doc-ripple → blast radius analysis + parallel updates

Task subagent (spawnType: validation, general-purpose, model: sonnet):
"Execute the doc-ripple workflow per commands/gsd-t-doc-ripple.md.
Git diff context: {files changed list}
Command that triggered: wave
Produce manifest at .gsd-t/doc-ripple-manifest.md.
Update all affected documents.
Report: 'Doc-ripple: {N} checked, {N} updated, {N} skipped'"

4. After doc-ripple returns, verify manifest exists and report summary inline

### Between Each Phase

After each agent completes, run this spot-check before proceeding:

1. **Status check**: Read `.gsd-t/progress.md` — verify the phase updated status correctly (no FAILED markers, status matches expected phase completion state)
2. **Git check**: Run `git log --oneline -5` — verify commits were made during this phase (if execute/integrate: at least one commit per task completed)
3. **Filesystem check**: Verify key output files exist on disk — e.g., for partition: `.gsd-t/domains/*/scope.md` and `.gsd-t/contracts/` files; for execute: newly created source files; for verify: `.gsd-t/verify-report.md`. Do not trust agent-reported completions alone.
4. Report to user:
   ```
   ✅ {Phase} complete — {agent's one-line summary}
   📋 Spot-check: {N} commits | {N} output files verified | no FAILED markers
   ```
5. If spot-check fails: write failure event via Bash, then report the discrepancy, re-spawn the phase agent once to correct it, then re-verify. If still failing: stop and report to user.
   ```bash
   node ~/.claude/scripts/gsd-t-event-writer.js \
     --type phase_transition \
     --command gsd-t-wave \
     --phase {COMPLETED_PHASE} \
     --reasoning "Spot-check failed: {one-line discrepancy summary}" \
     --outcome failure \
     --agent-id "${CLAUDE_SESSION_ID:-unknown}" || true
   ```
5a. After spot-check passes, write success event via Bash:
   ```bash
   node ~/.claude/scripts/gsd-t-event-writer.js \
     --type phase_transition \
     --command gsd-t-wave \
     --phase {COMPLETED_PHASE} \
     --reasoning "Phase complete: {one-line spot-check summary}" \
     --outcome success \
     --agent-id "${CLAUDE_SESSION_ID:-unknown}" || true
   ```
   The `|| true` ensures event write failure never blocks wave execution.
6. Proceed to next phase

## Step 4: Autonomy Behavior

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-wave --step 4 --step-label "Autonomy Behavior" 2>/dev/null || true
```

**Level 3 (Full Auto)**: Auto-advance to next phase after each agent completes. Only STOP for:
- Destructive Action Guard violations (reported by phase agent)
- Impact analysis BLOCK verdict
- Unrecoverable errors after 2 fix attempts
- Discuss phase (always pauses for user input)

**Level 1–2**: Pause between phases, show status, ask to continue.

## Step 5: Completion

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-wave --step 5 --step-label "Completion" 2>/dev/null || true
```

When all phases are done:
```
═══════════════════════════════════════════════════════════════════════════════
✅ Milestone "{name}" complete!
═══════════════════════════════════════════════════════════════════════════════

📁 Archived to: .gsd-t/milestones/{name}-{date}/
🏷️  Tagged as: milestone/{name}

Summary:
- Domains: {list}
- Tasks completed: {N}
- Contracts: {N} defined/verified
- Tests: {N} added/updated
- Impact items addressed: {N}
- Decision log entries: {N}

Next steps:
- Push tag: git push origin milestone/{name}
- Start next: /gsd-t-milestone "{next}"
- View roadmap: /gsd-t-status
═══════════════════════════════════════════════════════════════════════════════
```

## Interruption Handling

If the user interrupts or a phase agent fails:
1. The current phase agent saves its own state to `.gsd-t/progress.md`
2. Report: "Paused at {phase}. Run `/gsd-t-resume` to continue."
3. Resume will pick up from the last completed phase

## Error Recovery

### If impact analysis blocks:
- Read the impact report from the agent's output
- Report blocking issues to user

**Level 3**: Spawn a remediation agent to fix blocking issues, then re-spawn impact agent. Max 2 attempts.
If both attempts fail:
1. Write failure context to `.gsd-t/debug-state.jsonl` via `node -e "require('./bin/debug-ledger.js').appendEntry('.', {iteration:1,timestamp:new Date().toISOString(),test:'impact-remediation',error:'2 in-context fix attempts exhausted',hypothesis:'see impact-report.md',fix:'n/a',fixFiles:[],result:'STILL_FAILS',learning:'delegating to headless debug-loop',model:'sonnet',duration:0})"`
2. Log: "Delegating to headless debug-loop (2 in-context attempts exhausted)"
3. Run: `gsd-t headless --debug-loop --max-iterations 10`
4. Exit code 0 → continue; 1/4 → log to `.gsd-t/deferred-items.md`, report to user; 3 → report error
**Level 1–2**: Ask user for direction.

### If tests fail during execute:
- The execute agent handles test failures internally (up to 2 fix attempts)
- If still failing after 2 attempts, the execute agent reports failure
- Orchestrator stops and reports to user

### If verify fails:
- Read verify report for failure details

**Level 3**: Spawn remediation agent, then re-spawn verify agent. Max 2 attempts.
If both attempts fail:
1. Write failure context to `.gsd-t/debug-state.jsonl` via `node -e "require('./bin/debug-ledger.js').appendEntry('.', {iteration:1,timestamp:new Date().toISOString(),test:'verify-remediation',error:'2 in-context fix attempts exhausted',hypothesis:'see verify-report.md',fix:'n/a',fixFiles:[],result:'STILL_FAILS',learning:'delegating to headless debug-loop',model:'sonnet',duration:0})"`
2. Log: "Delegating to headless debug-loop (2 in-context attempts exhausted)"
3. Run: `gsd-t headless --debug-loop --max-iterations 10`
4. Exit code 0 → re-spawn verify agent; 1/4 → log to `.gsd-t/deferred-items.md`, report to user; 3 → report error
**Level 1–2**: Ask user for direction.

## Why Agent-Per-Phase

Each phase agent gets a **fresh context window** (~200K tokens). This means:
- Phase 7 doesn't carry the context baggage from phases 1-6
- Mid-phase compaction is eliminated for standard-sized phases
- Each agent loads only what it needs from state files
- The orchestrator stays lightweight (~30KB total)

State handoff happens through `.gsd-t/` files — exactly what they were designed for.

## Security Considerations

### bypassPermissions Mode

Wave spawns each phase agent with `mode: "bypassPermissions"`. This means agents execute bash commands, write files, and perform git operations **without per-action user approval**. This is by design — wave phases would be impractical with manual approval at every step.

### Attack Surface

If command files in `~/.claude/commands/` are tampered with, wave agents will execute the modified instructions with full permissions. The attack requires:
1. Write access to the user's `~/.claude/commands/` directory
2. Knowledge of the GSD-T command file format
3. The user to run `/gsd-t-wave` after tampering

### Current Mitigations

- **npm-installed files**: Command files are installed from the npm registry, providing a known-good source
- **Content comparison on update**: `gsd-t update` compares file contents and reports changes
- **User-owned directory**: `~/.claude/commands/` inherits the user's filesystem permissions
- **Destructive Action Guard**: CLAUDE.md instructions provide soft protection against destructive operations (DROP TABLE, schema changes, etc.), though agents could theoretically ignore these
- **Autonomy levels**: Level 1 and Level 2 pause between phases, giving users visibility into agent activity

### Recommendations

- For sensitive projects, use **Level 1 or Level 2 autonomy** instead of Level 3 to review each phase's output
- Periodically verify command file integrity: `gsd-t doctor` checks installation health
- If security is a concern, audit `~/.claude/commands/gsd-t-*.md` files for unexpected modifications
- Keep GSD-T updated (`gsd-t update`) to receive the latest command files from npm

## Workflow Visualization

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Wave Orchestrator (lightweight)                          │
│                                                                              │
│  ┌─────────┐   ┌─────────┐   ┌──────┐   ┌────────┐   ┌─────────┐          │
│  │PARTITION│ → │ DISCUSS │ → │ PLAN │ → │ IMPACT │ → │ EXECUTE │          │
│  │ agent 1 │   │ agent 2 │   │agent 3│   │agent 4 │   │ agent 5 │          │
│  └────┬────┘   └────┬────┘   └───┬──┘   └───┬────┘   └────┬────┘          │
│       ↓              ↓            ↓           ↓             ↓               │
│    status          status      status      status        status             │
│    check           check       check       check +       check              │
│                                           gate                              │
│                                                                              │
│  ┌──────────────────┐   ┌───────────┐       ┌─────────────────┐            │
│  │ VERIFY+COMPLETE  │ ← │ INTEGRATE │ ←──── │ FULL TEST-SYNC  │            │
│  │    agent 8       │   │  agent 7  │       │    agent 6      │            │
│  └────────┬─────────┘   └─────┬─────┘       └────────┬────────┘            │
│           ↓                    ↓                      ↓                     │
│    gate check →             status                 status                   │
│    auto-complete            check                  check                    │
│    archive + tag                                                            │
│                                                                              │
│  Each agent: fresh context window, reads state from files, dies when done   │
│  Orchestrator: 8 agents (was 9), ~30KB total, never compacts               │
└──────────────────────────────────────────────────────────────────────────────┘
```

$ARGUMENTS

## Auto-Clear

The full wave cycle is complete. All work is committed to project files. Execute `/clear` to free the orchestrator context window.
