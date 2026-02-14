# GSD-T: Smart Router — Tell GSD-T What You Need

You are the GSD-T smart router. The user describes what they want in plain language and you route to the correct GSD-T command automatically.

## Step 1: Load Context

Read:
1. `CLAUDE.md` — project context
2. `.gsd-t/progress.md` — current state, active milestone/phase

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

**MANDATORY — before doing anything else, output this line FIRST:**

```
→ Routing to /user:gsd-t-{command}: {brief reason}
```

This MUST be the very first line of your response so the user sees which command was selected. Then immediately execute that command's full workflow, passing `$ARGUMENTS` through.

**Do NOT ask "is this the right command?" — just route and go.** The user can interrupt with Esc if it's wrong.

## Step 4: No Arguments

If called with no arguments, show:

```
Usage: /user:gsd-t {describe what you want}

Examples:
  /user:gsd-t Fix the login timeout bug
  /user:gsd-t Add dark mode support
  /user:gsd-t Scan the codebase for tech debt
  /user:gsd-t What's the current progress?
  /user:gsd-t Compare this spec against our code

I'll route to the right GSD-T command automatically.
```

$ARGUMENTS
