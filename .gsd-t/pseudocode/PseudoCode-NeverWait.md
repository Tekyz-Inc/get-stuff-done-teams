# Never Wait
Nothing Claude or a helper does may sit waiting on David, unless he turned questions on for that session.

```text
  Claude Code is about to show a permission prompt (bypass mode still asks for a few safety checks)
    Is it approving a plan David asked for (leaving plan mode):
      Yes: Stay silent; he chose to stop there
    Are questions on for this session:
      Yes: Stay silent; the prompt shows as usual
      No:  Answer NO for him, with the reason Claude reads
        The command does not run
        Claude does not retry it or reword it past the check
        Claude lists the exact command under "Decisions made" for David to run
        Claude carries on with everything that does not depend on it
  Claude reaches for its ask-the-user tool
    Are questions on for this session:
      Yes: The question is asked
      No:  Refuse it: decide yourself, pick the safest reasonable option, list it, keep going
  A connected tool server (MCP) asks David for input mid-task
    Are questions on for this session:
      Yes: The dialog shows
      No:  Decline it; no dialog appears
  Claude's reply ends on a question
    Are questions on for this session, or is this already a sent-back reply:
      Yes: The turn ends as usual
      No:  Send it back once: decide, list it, continue
  A helper (subagent) starts
    Are questions on for this session:
      Yes: Nothing added
      No:  Give it the standing rule: never wait, decide and list decisions, keep deletes simple, leave a refused command for David
  David says to stop or ask about something
    Claude turns questions on for this session
    Questions stay on for twelve hours, or until turned off
```

---

## What it does today

```text
  A helper runs a delete chained after a loop
    Claude Code's removal check cannot rule it out
    Bypass mode does not skip that check
    A prompt appears and the whole run waits for a person
      2026-11-02 overnight: one such line waited 314 minutes
  David's "don't stop" rule
    Lives in the main session's memory only
    Never reaches a helper's brief
```

It got this way because the no-prompt rule was a memory, and memories do not travel into helpers or past Claude Code's own safety checks.

## What changes

```text
  Five hooks, one shared switch
    The prompt hook answers every permission prompt NO while questions are off
    The question hook refuses the ask-the-user tool while questions are off
    The tool-server hook declines a request for David's input while questions are off
    The end-of-turn hook sends a reply ending on a question back once while questions are off
    The helper hook briefs every helper while questions are off
  The switch is a marker file per Claude session (named from the session's id)
    Present and younger than twelve hours: questions on
    Otherwise: questions off
  The global rules say: decide, list under "Decisions made", keep going; skip unrequested destructive steps
```

## The rules

- [RULE] prompts-answered-no — a permission prompt is answered NO, never YES: a dangerous command is refused, not let through, and never reworded past the check.
- [RULE] questions-off-unless-turned-on — questions, prompts, tool-server input and question endings are off by default; on only after `gsd-t questions on` in that session, for 12 hours.
- [RULE] his-own-stops-kept — approving a plan in plan mode, which David entered himself, is never answered for him.
- [RULE] helpers-get-the-rule — every helper starts with the never-wait rule while questions are off.

## What I confirmed with you

- Questions are always off unless you state otherwise ("3 unless I state otherwise", 2026-11-02).
- Proved live in a throwaway folder with bypass mode on (Claude Code 2.1.316): last night's exact command shape raised the prompt, the prompt hook fired and answered NO, nothing waited; the question hook refused a question; the helper hook's text reached a background helper, whose prompt the same hook answered.
- Red team round 1 (FAIL) found a tool-server input dialog that still waited, the switch following Claude's `cd`, a deny message promising a rewrite would pass the check, question endings not caught, crashes on empty input, and leftover switches after uninstall — all fixed here.
- Assumed — say if wrong: "on" lasts 12 hours (a working day) for the session.

## Why this shape

- **Simplest:** small hooks share one module and one marker-per-session switch; nothing to parse, so nothing to fail on.
- **Keyed by session, not folder:** hooks receive the session id and the Bash tool sees the same id, while Claude's folder changes with every `cd`.
- **No fallback:** the hook never guesses YES. Refusing is the safe answer, and Claude is told why; the alternative (showing the prompt) is the stall this exists to stop. Empty or session-less input reads as "off", so it still answers NO rather than crashing into a prompt.
- **Same pattern elsewhere:** hook scripts tied one per event with a shared module, as the build-speed guard and its two recorders already do.
- **Risk:** a refused command leaves a step undone; Claude lists the exact command for the morning. The end-of-turn hook sends back only once per turn, so it never loops.

## Where it lives

- `scripts/gsd-t-never-wait.js` — PermissionRequest hook; shared `questionsOn`, `setQuestions`, `switchDir`, `endsOnQuestion`, messages.
- `scripts/gsd-t-no-questions.js` — PreToolUse hook, matcher `AskUserQuestion`.
- `scripts/gsd-t-helper-brief.js` — SubagentStart hook.
- `scripts/gsd-t-mcp-input-decline.js` — Elicitation hook.
- `scripts/gsd-t-question-stop.js` — Stop hook.
- `bin/gsd-t.js` — `configureNeverWaitHooks`, markers in `GSDT_HOOK_MARKERS`, `gsd-t questions on|off|status`, uninstall removes the switches.
- `templates/CLAUDE-global.md` — "Never Wait on the User" section; `commands/gsd-t-architect.md` Step 2.
- `test/never-wait.test.js`.
