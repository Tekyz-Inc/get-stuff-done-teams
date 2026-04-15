# GSD-T: Audit — Component Cost/Benefit Analysis and Shadow Testing

You are running a harness self-audit — analyzing the cost and benefit of GSD-T enforcement components, with optional shadow mode testing.

## Step 0: Launch via Subagent

To keep the main conversation context lean, run audit via a Task subagent.

**If you are the orchestrating agent** (you received the slash command directly):

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`

Spawn a fresh subagent using the Task tool:
```
subagent_type: general-purpose
model: sonnet
prompt: "You are running gsd-t-audit with arguments: {$ARGUMENTS}
Working directory: {current project root}
Read CLAUDE.md and .gsd-t/progress.md for project context, then execute gsd-t-audit starting at Step 1."
```

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START)) && CTX_PCT=$(node -e "const tb=require('./bin/token-budget.cjs'); process.stdout.write(String(tb.getSessionStatus('.').pct||'N/A'))" 2>/dev/null || echo "N/A")`
Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |` if missing):
`| {DT_START} | {DT_END} | gsd-t-audit | Step 0 | sonnet | {DURATION}s | audit: {args summary} | | | {CTX_PCT} |`

Relay the subagent's summary to the user. **Do not execute Steps 1–5 yourself.**

**If you are the spawned subagent** (your prompt says "starting at Step 1"):
Continue to Step 1 below.

## Step 1: Load Context

Parse $ARGUMENTS for flags:
- `--component=<id>` → target a specific component ID
- `--shadow` → run in shadow mode (log results, don't enforce)
- `--report-only` → show current cost/benefit ledger without running tasks

Read:
1. `.gsd-t/progress.md` — current milestone
2. `.gsd-t/component-registry.jsonl` — all registered components
3. `.gsd-t/metrics/component-impact.jsonl` — cost/benefit history

If component registry is missing or empty, run:
```
node bin/component-registry.js --seed
```
or call `seedRegistry()` from `bin/component-registry.js`.

## Step 2: Route by Mode

### Mode: --report-only

Skip to Step 3 (Report).

### Mode: --shadow [--component=<id>]

Skip to Step 4 (Shadow Run).

### Mode: --component=<id> (no shadow, no report-only)

Run A/B test: disable the target component for the next task run and compare outcomes. Skip to Step 5 (A/B Test).

### Mode: no flags

Generate a full cost/benefit report for all components. Go to Step 3 (Report).

## Step 3: Cost/Benefit Report

Read all records from `.gsd-t/metrics/component-impact.jsonl`.

For each component in the registry, compute:
- **Total token cost**: sum of `token_cost` across all milestones
- **Total bugs prevented**: sum of `bugs_prevented`
- **Total false positives**: sum of `false_positives`
- **Verdict distribution**: count positive / neutral / negative verdicts
- **Consecutive negative**: latest `consecutive_negative` value
- **Status**: current status from registry (active / flagged / deprecated)

Display a summary table:

```
## Component Cost/Benefit Report — {date}

| Component           | Status   | Milestones | Tokens   | Bugs Prevented | False Positives | Positive | Neutral | Negative | Consec- |
|---------------------|----------|------------|----------|----------------|-----------------|----------|---------|----------|---------|
| Red Team Adv. QA    | active   | N          | N        | N              | N               | N        | N       | N        | N       |
| QA Agent            | active   | N          | N        | N              | N               | N        | N       | N        | N       |
| ...                 |          |            |          |                |                 |          |         |          |         |

Flagged for review (consecutive_negative >= 3):
- {component name} (comp-id) — {N} consecutive negative verdicts
```

If no impact data exists, show:
```
No impact data recorded yet. Impact is recorded during complete-milestone via recordImpact().
```

Write the report to `.gsd-t/audit-report.md`.

## Step 4: Shadow Run

Shadow mode: the target component runs normally but its enforcement actions are logged instead of applied.

1. Identify the target component (from `--component=<id>` or all `shadow_capable: true` components if no ID)
2. For each target component, check `shadow_capable: true` in registry — skip any that cannot shadow
3. Log shadow run to `.gsd-t/audit-report.md`:

```
## Shadow Run — {component name} — {date}

Component: {id}
Shadow capable: {yes/no}
Mode: logging only (enforcement skipped)

Results:
- Would have fired: {yes/no}
- Findings that would have been enforced: {list or "none"}
- Token cost (estimated): {N}

Verdict: {what the component would have concluded}
```

4. Append impact record with verdict `neutral` (shadow runs don't count as real verdicts):
```javascript
recordImpact(componentId, milestone, { token_cost: estimated, bugs_prevented: 0, false_positives: 0, context_pct: 0, verdict: "neutral" })
```

## Step 5: A/B Test (Component Disabled)

A/B test mode: disable the target component for the current task run and compare against baseline.

1. Verify the component has `can_disable: true` — if not, abort with:
   "Component {id} cannot be cleanly disabled (can_disable: false). Use --shadow instead."

2. Note current state:
   - Read last 3 milestones of impact history for this component
   - Establish baseline: avg `bugs_prevented`, avg `token_cost`, avg verdict

3. Run the current task WITHOUT the component:
   - Log to audit report that the component was disabled for this run
   - Document any quality differences observed (bugs missed, regressions, etc.)

4. Compare results and write to `.gsd-t/audit-report.md`:

```
## A/B Test — {component name} — {date}

Component: {id}
Test milestone: {current milestone}
Baseline (last 3 milestones): avg {N} bugs prevented, avg {N} tokens

With component DISABLED:
- Bugs caught by other mechanisms: {N}
- Bugs missed: {N} (estimated)
- Token savings: {N}
- Quality delta: {positive/neutral/negative}

Recommendation: {keep / deprecate / shadow-only}
```

5. Record the impact with verdict based on quality delta.

## Step 6: Update Progress

Append to `.gsd-t/progress.md` Decision Log:
`- {date}: gsd-t-audit ran in {mode} mode — {brief summary of findings}`

## Step 7: Report to User

Present a concise summary:

```
## Audit Complete

Mode: {report-only | shadow | a/b test | full report}
Components analyzed: {N}
Flagged for deprecation: {N}
Report written to: .gsd-t/audit-report.md

Key findings:
- {finding 1}
- {finding 2}
```

If any components have `consecutive_negative >= 3` (flagged status), add:
```
⚠ FLAGGED COMPONENTS — recommend patch lifecycle review:
- {name} ({id}): {N} consecutive negative milestones
  Run: /user:gsd-t-backlog-add to create a deprecation task
```

$ARGUMENTS
