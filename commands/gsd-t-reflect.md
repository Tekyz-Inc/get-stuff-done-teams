# GSD-T: Reflect — Generate Retrospective from Event Stream

You are generating a structured retrospective for the current (or specified) milestone by reading the JSONL event stream and proposing memory updates.

## Step 0: Launch via Subagent

When invoked directly by the user, spawn yourself as a Task subagent for a fresh context window.

**OBSERVABILITY LOGGING — before spawning:**

Run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M") && TOK_START=${CLAUDE_CONTEXT_TOKENS_USED:-0} && TOK_MAX=${CLAUDE_CONTEXT_TOKENS_MAX:-200000}`

```
Task subagent (general-purpose, model: sonnet):
"Run the GSD-T reflect command. Read commands/gsd-t-reflect.md for your full instructions.
Arguments: {$ARGUMENTS}
Skip Step 0 — you are already the subagent."
```

**OBSERVABILITY LOGGING — after subagent returns:**

Run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && TOK_END=${CLAUDE_CONTEXT_TOKENS_USED:-0} && DURATION=$((T_END-T_START))`

Compute tokens:
- No compaction (TOK_END >= TOK_START): `TOKENS=$((TOK_END-TOK_START))`, COMPACTED=null
- Compaction detected (TOK_END < TOK_START): `TOKENS=$(((TOK_MAX-TOK_START)+TOK_END))`, COMPACTED=$DT_END

Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted |` if missing):
`| {DT_START} | {DT_END} | gsd-t-reflect | Step 0 | sonnet | {DURATION}s | retrospective generated | {TOKENS} | {COMPACTED} |`

Return the subagent's output and stop. Only skip Step 0 if you are already running as a subagent.

## Step 1: Load State

Read:
1. `CLAUDE.md` — project context
2. `.gsd-t/progress.md` — current milestone name and start date
3. `.gsd-t/contracts/event-schema-contract.md` — event fields available for reading

Identify the current milestone name and its start date from the `## Current Milestone` table in `progress.md`.

If `$ARGUMENTS` is provided, treat it as a milestone name filter — search for a past milestone matching that name in the `## Completed Milestones` table and use its completion date as the date boundary instead.

## Step 2: Find Events

Look for `.gsd-t/events/*.jsonl` files.

If no `.gsd-t/events/` directory or no `.jsonl` files exist:
```
No events recorded for this milestone yet.
Events are written during execute/wave/debug phases once the event-writer is installed.
```
Stop and exit.

Filter events by milestone period: include only JSONL lines with `"ts"` values on or after the milestone start date (from Step 1). Read all matching `.jsonl` files and collect the event objects.

## Step 3: Generate Retrospective

Parse the collected events and categorize:

**By outcome:**
- `success` events — commands/phases that completed successfully
- `failure` events — commands/phases that failed (capture `reasoning` field)
- `learning` events — insights captured during execution (capture `reasoning`)
- `deferred` events — items postponed (capture `reasoning`)

**Command patterns:**
- Which `command` values appear most in failure events
- Which `phase` values appear most in failure events

**Repeating patterns (threshold ≥ 2):**
- Group events by `reasoning` field value (exact string match)
- Identify any `reasoning` string that appears in 2 or more events

**Summary:**
- What worked: `command`/`phase` values that have only `success` outcomes
- What failed: failure events with their `reasoning` and `command`
- What was learned: `learning` outcome events and their `reasoning`

## Step 4: Write Retrospective File

Create `.gsd-t/retrospectives/` directory if it does not exist.

Determine the output filename:
- Current milestone: `{YYYY-MM-DD}-{milestone-name-kebab-case}.md` (today's date)
- Past milestone (from $ARGUMENTS): use that milestone's completion date

Write the retrospective file:

```markdown
# Retrospective: {Milestone Name}
**Generated**: {YYYY-MM-DD}
**Milestone period**: {start date} → {end date}
**Events analyzed**: {N}

## What Worked
{List each command/phase that had only success outcomes — one per line}
{If none: _No commands with exclusively success outcomes recorded._}

## What Failed
{For each failure event: `- [{command}] {reasoning}`}
{If none: _No failure events recorded._}

## Patterns Found
{For each reasoning string with ≥ 2 occurrences: `- ({N}×) {reasoning}`}
{If none: _No repeating patterns found (threshold: 2 occurrences)._}

## Proposed Memory Updates
{For each pattern found: suggest a concrete rule}
{Format: `- Pattern ({N}×): "{reasoning}" → Rule: "Always/Never {concrete action}"`}
{If none: _No patterns met the threshold for a proposed rule._}
```

## Step 5: Present Proposed Memory Updates

For each item in the **Proposed Memory Updates** section:

1. Present to user: `"Proposed rule (seen {N} times): '{rule}'. Add to CLAUDE.md? [y/n]"`
2. **Wait for user confirmation before writing** (Destructive Action Guard — CLAUDE.md changes require explicit approval)
3. If approved: append the rule to `CLAUDE.md` under the relevant section
4. If none to propose: report "No repeating patterns found — no memory updates proposed."

## Document Ripple

Update `.gsd-t/progress.md` Decision Log:
- Add entry: `- {YYYY-MM-DD HH:MM}: [learning] gsd-t-reflect run — retrospective written to .gsd-t/retrospectives/{filename}.md; {N} events analyzed, {N} patterns found, {N} rules proposed`

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
