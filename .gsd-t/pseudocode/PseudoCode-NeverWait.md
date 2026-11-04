# Never Wait
Nothing Claude or a helper does may sit waiting on David, unless David turned questions on for that session; and nothing is made up to keep moving.

```text
  Claude Code is about to show a permission prompt (bypass mode still asks for a few safety checks)
    Is it approving a plan David asked for (leaving plan mode):
      Yes: Stay silent; David chose to stop there
    Are questions on for this session:
      Yes: Stay silent; the prompt shows as usual
      No:  Answer NO for him, with the reason Claude reads
        The command does not run
        Claude does not retry it or reword it past the check
        Claude lists the exact command under "Left for you" for David to run
        Claude carries on with everything that does not depend on it
  Claude reaches for its ask-the-user tool
    Are questions on for this session:
      Yes: The question is asked
      No:  Refuse it, and give Claude the invention test below
  A connected tool server (MCP) asks David for input mid-task
    Are questions on for this session:
      Yes: The dialog shows
      No:  Decline it; no dialog appears
  Claude's reply ends on a question
    Are questions on for this session, or is this already a sent-back reply:
      Yes: The turn ends as usual
      No:  Send it back once, with the invention test below
  A helper (subagent) starts
    Are questions on for this session:
      Yes: Nothing added
      No:  Give it the standing rule: never wait, never invent, cite each decision, keep deletes simple, leave a refused command for David
  Claude is about to decide something nobody specified (the invention test)
    Does a source (David's docs or words, the existing system, a design David supplied, the law) call for this at all:
      No:  There is no hole; leave it out and ask nothing
      Yes: Does a source answer it or give the options:
        Yes: Pick one and cite the source's exact words
        No:  Build nothing behind it, park one question under "Left for you", carry on with the rest
  Claude writes a new line to a file marked as Claude's recommendation
    Does the line quote a real source, or did David approve this item by name:
      Yes: The write goes through
      No:  The write is refused, and Claude is told to cite it or park it
    A line already in the file is left alone; the audit clears those
  Claude tries to change the list of what David approved
    Are questions on for this session:
      Yes: The change goes through
      No:  The write is refused; an unattended run cannot approve itself
  A reply or a helper's report lists items under the exact heading "Decisions made"
    Are questions on for this session:
      Yes: Nothing is checked
      No:  Is each quote really in its source, and is that source not Claude's own paper or a file written this session:
        Yes: The turn ends as usual
        No:  Is this already a sent-back reply:
          No:  Send it back once, naming each failing item
          Yes: The turn ends and David gets a warning naming each failing item
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
  Eight hooks; seven share one switch, and the invention guard is always on
    The prompt hook answers every permission prompt NO while questions are off
    The question hook refuses the ask-the-user tool while questions are off
    The tool-server hook declines a request for David's input while questions are off
    The end-of-turn hook sends a reply ending on a question back once while questions are off
    The helper hook briefs every helper while questions are off
    The decision hook checks each listed decision's quote against its source while questions are off
    The invention guard checks new marked lines on every write
  The switch is a marker file per Claude session (named from the session's id)
    Present and younger than twelve hours: questions on
    Otherwise: questions off
  The global rules say: an invention is a fallback; cite a source or park one question, keep going; skip unrequested destructive steps
```

## The rules

- [RULE] prompts-answered-no — a permission prompt is answered NO, never YES: a dangerous command is refused, not let through, and never reworded past the check.
- [RULE] questions-off-unless-turned-on — questions, prompts, tool-server input and question endings are off by default; on only after `gsd-t questions on` in that session, for 12 hours.
- [RULE] davids-own-stops-kept — approving a plan in plan mode, which David entered, is never answered automatically.
- [RULE] helpers-get-the-rule — every helper starts with the never-wait rule while questions are off.
- [RULE] no-inventions — "best recommendation, move forward" means choosing among options the sources give; behavior no source calls for is never built, and a real hole is parked as one question, never bundled into a batch approval. A yes given in a batch is weak: raised again if a later fact contradicts it.

## What I confirmed with you

- Questions are always off unless you state otherwise ("3 unless I state otherwise", 2026-11-02).
- Proved live in a throwaway folder with bypass mode on (Claude Code 2.1.316): last night's exact command shape raised the prompt, the prompt hook fired and answered NO, nothing waited; the question hook refused a question; the helper hook's text reached a background helper, whose prompt the same hook answered.
- Red team round 1 (FAIL) found a tool-server input dialog that still waited, the switch following Claude's `cd`, a deny message promising a rewrite would pass the check, question endings not caught, crashes on empty input, and leftover switches after uninstall — all fixed here.
- "On" lasts 12 hours for the session: my choice, not yours; say if you want it different.
- An invention is a fallback (2026-11-04, after the ATOS-V2 overnight run built student self sign-up, which no source asked for).

## Why this shape

- **Simplest:** small hooks share one module and one marker-per-session switch; nothing to parse, so nothing to fail on.
- **Keyed by session, not folder:** hooks receive the session id and the Bash tool sees the same id, while Claude's folder changes with every `cd`.
- **No fallback:** the hook never guesses YES. Refusing is the safe answer, and Claude is told why; the alternative (showing the prompt) is the stall this exists to stop. Empty or session-less input reads as "off", so it still answers NO rather than crashing into a prompt.
- **Same pattern elsewhere:** hook scripts tied one per event with a shared module, as the build-speed guard and its two recorders already do.
- **One fixed format:** two red teams broke a parser that guessed at free-form sections, in both directions (false alarms on status lines, inventions under near-miss headings). Claude writes this format, so an exact heading costs nothing; a near-miss goes back, a differently named section isn't read.
- **What the citation check cannot do:** it proves the words exist in the source, not that they support the decision, and it sees only decisions Claude lists, and only marked lines in files; dropping the marker gets past the guard, which is why the refusal forbids it and the red team's Inventions category checks the work. An unattended run could still edit the approved list through Bash. It also cannot spot Claude's papers from an earlier session outside `.gsd-t/`, or a file made through Bash. A fresh agent (the red team's Inventions category) covers those, after an autonomous run.
- **Risk:** a refused command leaves a step undone; Claude lists the exact command for the morning. The end-of-turn hook sends back only once per turn, so it never loops.

## Where it lives

- `scripts/gsd-t-never-wait.js` — PermissionRequest hook; shared `questionsOn`, `setQuestions`, `switchDir`, `endsOnQuestion`, messages.
- `scripts/gsd-t-no-questions.js` — PreToolUse hook, matcher `AskUserQuestion`.
- `scripts/gsd-t-helper-brief.js` — SubagentStart hook.
- `scripts/gsd-t-mcp-input-decline.js` — Elicitation hook.
- `scripts/gsd-t-question-stop.js` — Stop hook.
- `scripts/gsd-t-decision-check.js` (Stop) and `scripts/gsd-t-helper-decision-check.js` (SubagentStop) — `decisionItems`, `citationProblem`, `checkDecisions`, `decisionHook` in the shared module.
- `scripts/gsd-t-invention-guard.js` — PreToolUse Write|Edit; `inventionProblems`, `inventionGuard`, `.gsd-t/inventions.json`.
- `commands/gsd-t-red-team.md` — Inventions category.
- `bin/gsd-t.js` — `configureNeverWaitHooks`, markers in `GSDT_HOOK_MARKERS`, `gsd-t questions on|off|status`, uninstall removes the switches.
- `templates/CLAUDE-global.md` — "Never Wait on the User" section; `commands/gsd-t-architect.md` Step 2.
- `test/never-wait.test.js`.
