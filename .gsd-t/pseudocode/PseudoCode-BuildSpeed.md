# Build Speed Guards

Cut the measured waste in long builds: re-running a failed browser test without changing anything, waiting in sleep loops, and tests that hang for the full limit.

```text
Claude is about to run a command
  Is it a browser test run (Playwright):
    Yes: Which run is it (same project, same settings, same test files)
      Did this same run fail last time:
        Yes: Has any project file changed since that failure:
          No:  Block it — "This run failed and nothing has changed. Read the error and the failure screenshot, fix it, then run it again"
          Yes: Go on
        No: Go on
      Is it every test in the settings file, and did the last full run of that file fail:
        Yes: Has a narrower run of that file passed since (named test files, a name filter, or only the failed ones):
          No:  Block it — "Re-run only what failed first (add the failed test files, or --last-failed); run everything once those pass"
          Yes: Go on
        No: Go on
    No: Go on
  Is it a wait loop (repeat, sleep, check again) in the foreground:
    Will it finish within a minute (a counted loop whose total sleep is a minute or less):
      Yes: Go on
      No:  Block it — "Run this wait in the background; you are told when it ends"
    Running in the background already: Go on
  Run the command

A browser test run finishes
  Did the summary say tests failed:
    Yes: Record "failed", with a fingerprint of the project's files at this moment
  Did it say they all passed:
    Yes: Record "passed"
  No summary (stopped, sent to the background): Record nothing

A new project gets Playwright from GSD-T
  Its settings file gives each click or wait 10 seconds, each page load 15
    So a missing element fails in seconds, not at the 30-second test limit
```

---

## What it does today

```text
A browser test fails
  Claude (often a helper agent) runs it again, often the whole settings file, often unchanged
    One ATOS-V2 build: 1,392 runs, 31% failed, 430 re-runs straight after a failure
Claude waits for a render or a server
  It loops "sleep, check" in the foreground, up to the 10-minute tool limit
    About 8 agent-hours in the two long ATOS-V2 builds
A test waits for an element that never appears
  It hangs until Playwright's 30-second test limit (471 of the timeouts seen)
```

It got this way because nothing stops a repeat: the rules ask for diagnosis first, but a prompt is advice, and helper agents follow it least.

## What changes

```text
A same-run repeat with no change is blocked
A whole-file re-run after a failure is blocked until a narrower run passes
A long foreground wait loop is blocked, pointing at background runs
New projects get short click and page-load limits
```

## The rules

- [RULE] e2e-no-unchanged-rerun — a Playwright run identical to one that failed is blocked until a project file changes.
- [RULE] e2e-narrow-before-full — after a whole-config run fails, the next whole-config run waits until a narrower run of that config has passed.
- [RULE] no-foreground-wait-loops — a foreground loop that sleeps more than a minute in total is blocked; run it in the background.
- [RULE] e2e-fast-fail-timeouts — the GSD-T Playwright template sets a 10 s action and 15 s page-load limit.
- [RULE] guards-decide-from-recorded-facts — the e2e guard decides from what the test summary said and a fingerprint of the files; it never guesses an outcome it did not see.

## What I confirmed with you

- Build duration is the top problem; these three were chosen from the measured breakdown ("all three").
- The red-team attack list is on hold; its cost is small next to these.

## Why this shape

- **Objective:** remove repeat work that a guard can see, without slowing a single correct run.
- **Reuse:** the same hook registrar and block message as the graph search guard; the fingerprint comes from git, which already sees edits made through any tool.
- **Simplicity:** two small hooks and one template change. No new commands.
- **Risk:** a flaky test can't be re-run unchanged to confirm it is flaky. Touching any file allows it; the block message says so.
- **No fallback:** a run whose outcome was not seen records nothing, so it is never blocked on a guess. A guard that cannot read its own state file halts loudly.
- **Verified by:** tests that feed the hooks real payloads, and a live run in a project.

## Where it lives

- `scripts/gsd-t-e2e-guard.js` — PreToolUse Bash (block) and PostToolUse Bash (record); state in `~/.claude/gsd-t-e2e/<project-hash>.json`.
- `scripts/gsd-t-wait-guard.js` — PreToolUse Bash.
- `bin/playwright-bootstrap.cjs` — `PLAYWRIGHT_CONFIG_TEMPLATE` `actionTimeout` / `navigationTimeout`.
- `bin/gsd-t.js` — markers, commands, registrars, install calls.
