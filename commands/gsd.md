# GSD-T: Smart Router — Tell GSD-T What You Need

You are the GSD-T smart router. The user describes what they want in plain language and you route to the correct GSD-T command automatically.

## Step 1: Load Context

Read:
1. `CLAUDE.md` — project context
2. `.gsd-t/progress.md` — current state, active milestone/phase

## Step 2a: Continuation Check

Before semantic evaluation, determine if this is a **continuation** of an already-running command.

**Continuation indicators (any = continuation):**
- Message is a follow-up, answer, acknowledgment, or status report — not a new task request
- Message contains tool output, code, file content, or work artifacts from ongoing work
- Message reads as mid-task input (e.g., "both files parse cleanly", "yes continue", "looks good", "done")
- Progress.md shows an active/in-progress phase AND the message doesn't clearly start a new task

**If continuation detected** → skip Step 2, go to Step 3 using the **continuation format**.

**If NOT a continuation** → proceed to Step 2 (normal semantic evaluation).

---

## Step 2: Semantic Evaluation

Read the **Command Summaries** section of `commands/gsd-t-help.md` (or the in-memory skill list). For each command, evaluate whether the user's request matches that command's **Summary** and **Use when** criteria.

### Evaluation process:

1. **Read the request**: Understand what the user is actually asking for — not just keywords, but intent, scope, and context
2. **Evaluate each command**: For every GSD-T command, ask: "Would this command raise its hand for this request?" Consider:
   - Does the request match the command's stated purpose?
   - Does the scope align? (small task vs. large feature vs. full project)
   - Does the current project state matter? (e.g., if mid-milestone, does this fit the active phase?)
3. **Collect candidates**: Commands that match get shortlisted
4. **Select the best fit**: From the candidates, pick the one whose purpose most closely matches the request

### Resolution rules:

- **0 matches** → Ask one clarifying question to narrow down
- **1 match** → Route immediately
- **2+ matches** → Pick the best fit based on scope and context. Show the runner-up:
  ```
  → Routing to /user:gsd-t-{command}: {reason}
    (also considered: gsd-t-{runner-up} — Esc to switch)
  ```

### Scope disambiguation:

When the same request could fit multiple commands at different scales:
- **Touches 1-3 files, straightforward** → `quick`
- **New capability spanning multiple files/components** → `feature`
- **Requires its own milestone with domains** → `milestone` or `project`
- **Needs investigation before fixing** → `debug` (not `quick`)
- **Spec/requirements to verify against code** → `gap-analysis` (not `scan`)

## Step 3: Confirm and Execute

**MANDATORY — output one of these lines as the VERY FIRST thing in your response, before any tool calls or other output.**

### New request (from Step 2):
```
→ Routing to /user:gsd-t-{command}: {brief reason}
```

### Continuation (from Step 2a):
```
→ /gsd ──▶ continue /user:gsd-t-{last-command}
```

Where `{last-command}` is:
1. The command most recently active in this conversation, OR
2. Inferred from progress.md current phase:

| Phase in progress.md | Command slug |
|----------------------|--------------|
| EXECUTE | `execute` |
| PLAN | `plan` |
| PARTITION | `partition` |
| VERIFY | `verify` |
| INTEGRATE | `integrate` |
| TEST-SYNC | `test-sync` |
| COMPLETE | `complete-milestone` |
| SCAN | `scan` |
| WAVE | `wave` |
| QUICK | `quick` |
| DEBUG | `debug` |

**CRITICAL: `{command}` and `{last-command}` MUST be a real GSD-T command slug — never a free-form description.**

Valid command slugs: `quick`, `debug`, `feature`, `execute`, `milestone`, `project`, `scan`, `gap-analysis`, `plan`, `partition`, `discuss`, `impact`, `integrate`, `verify`, `test-sync`, `complete-milestone`, `wave`, `status`, `populate`, `setup`, `init`, `health`, `log`, `pause`, `resume`, `prd`, `brainstorm`, `prompt`, `backlog-add`, `backlog-list`, `backlog-promote`, `promote-debt`, `triage-and-merge`, `version-update`, `version-update-all`

**WRONG ❌** — do not do this:
```
→ Routing to research + PRD update: reading web app auth code
→ Routing to implementation: adding the login feature
→ /gsd ──▶ continue: mid-task work
```

**RIGHT ✅** — always use the exact command slug:
```
→ Routing to /user:gsd-t-execute: implement auth feature across backend
→ Routing to /user:gsd-t-debug: investigate login bug before fixing
→ /gsd ──▶ continue /user:gsd-t-execute
→ /gsd ──▶ continue /user:gsd-t-quick
```

This MUST be the very first line of your response. Then immediately execute that command's full workflow, passing `$ARGUMENTS` through.

**Do NOT ask "is this the right command?" — just route and go.** The user can interrupt with Esc if it's wrong.

## Step 4: No Arguments

If called with no arguments, show:

```
Usage: /user:gsd {describe what you want}

Examples:
  /user:gsd Fix the login timeout bug
  /user:gsd Add dark mode support
  /user:gsd Scan the codebase for tech debt
  /user:gsd What's the current progress?
  /user:gsd Compare this spec against our code

I'll route to the right GSD-T command automatically.
```

$ARGUMENTS
