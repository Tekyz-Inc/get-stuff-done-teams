# Wrong-App Guard

Stop a prompt typed into the wrong app's session, say which app it belongs to in red, and hand back the prompt to paste into that app's session.

```text
You send a prompt
  Was this prompt sent by the guard's own app check (its private helper call):
    Yes: Pass it on untouched
    No:  Go on
  Does the prompt start with "This App - This Session" (any capitals, any dash):
    Yes: Pass it on — you said it belongs here
    No:  Go on
  Which registered app is this session in:
    Read the list of registered apps (the GSD-T project list)
    Walk up from the session's folder to the nearest app on the list
    Not found, and the folder is a side copy of a repo (a worktree):
      Ask git where the main copy lives and look that up instead
    Still no app, or fewer than two apps registered:
      Pass it on — there is no other app to confuse it with
  Ask the small fast model (Haiku) which app the prompt is for:
    Give it each app's name, folder and a one-line description
      Description: the app's rules file overview; without one, its readme; without that, its package description
    Give it the current app and the prompt
    Give it the last six exchanges of this session (from its transcript), when there are any
      A follow-up on the conversation's topic belongs here, even when it names another app
      A question to this session about itself belongs here
      New work in another app that the conversation is not about belongs to that app
    It answers one of: this app, unclear, or another app (its folder or its name)
  The model call failed, timed out, or gave an answer not on the list:
    STOP the prompt — red message naming the failure
    Say: resend it starting with "This App - This Session" to skip the check
  It says this app, or unclear:
    Pass it on
  It names another app:
    STOP the prompt — red message:
      "Wrong app — this is for <other app>, not <this app>"
      The folder to open a session in
      The prompt, ready to copy and paste there
      How to send it here anyway (the "This App - This Session" prefix)
```

---

## What it does today

```text
You send a prompt
  Add the live clock line
  Add the reply-style rules
  Does it ask for a demo video:
    Yes: Add the "use the demo-videos pipeline" note
  Pass it on — nothing checks which app it is about
```

The prompt hook only ever added context; it never blocked.

## What changes

```text
You send a prompt
  Run the wrong-app check first (the flow at the top)
    It stops the prompt:
      Show only the red message — nothing more is added
    It lets the prompt through:
      Carry on exactly as today (clock, reply-style rules, demo-video note)
```

## The rules

- [RULE] Every prompt is checked by the model unless it carries the override prefix (David's choice: catches requests that never name the app; costs about 3 seconds per prompt).
- [RULE] The override prefix is "This App - This Session", matched without regard to capitals.
- [RULE] Sibling repos of one product (Newman back end / admin / mobile; the Hilo repos) are different apps and get blocked.
- [RULE] A failed check stops the prompt and says why — never lets it through quietly (no fallback).
- [RULE] The model call runs on the Max subscription login, never an API key.
- [RULE] The check lives in the existing prompt hook — no new hook to register.

## What I confirmed with you

- Detection: the model checks every prompt.
- Override: the "This App - This Session" prefix.
- Siblings: different apps, blocked.
- Check failure: stop the prompt (you flagged letting it through as a fallback).

## Why this shape

- Objective: catch a prompt sent to the wrong app before any work starts, and make moving it one paste.
- Reuse: the existing prompt hook (already installed everywhere, already registered) and the existing GSD-T project list. Nothing new to install or propagate.
- Simplicity: name matching alone misses requests that never name the app; only a model can read intent. A lean model call (no hooks, no tools, no project files loaded) measured 2.3–5.5 seconds, under the 30-second hook limit.
- Red text: Claude Code does not document colored hook messages, so the message leads with a red circle that always shows red, plus terminal red codes — checked live after install.
- Risk: the helper model call is itself a Claude session and could fire this same hook; it is marked so the hook lets it straight through, and it skips settings hooks entirely.
- Only six of the 29 apps have an overview in their rules file, so the description falls back through readme and package file; an app with none is described by name and folder only.

## Where it lives

- `scripts/gsd-t-auto-route.js` — `wrongAppCheck()` and its helpers (`isOverride`, `findCurrentApp`, `appDescription`, `classifierPrompt`, `parseVerdict`, `blockMessage`); runtime block writes `{decision: "block", reason}`.
- Registry: `~/.claude/.gsd-t-projects`.
- Model call: `claude -p --model haiku --output-format stream-json --verbose --setting-sources "" --tools "" --no-session-persistence`, env `GSDT_APP_GUARD_CHILD=1`, 20 s timeout.
- Tests: `test/wrong-app-guard.test.js` (pure helpers + the hook end-to-end with a stub `claude` on `PATH`).
- Docs: README hooks table, `docs/infrastructure.md` hooks table, `templates/CLAUDE-global.md`, CHANGELOG.
