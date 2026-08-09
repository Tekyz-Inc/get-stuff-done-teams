# The Reply Shortener Calls Itself

The shortener asks a second Claude to shorten a reply, and that second Claude runs the shortener on its own answer — so every shortening waits for a shortening.

```text
A reply finishes and the shortener wakes up
  Is the shortener switched on for this project:
    No:  Show the reply exactly as written
    Yes: Is this wake-up our own doing — we already shortened this reply once:
      Yes: Show it as written, we are done
      No:  Find the words the reply actually showed the reader
        Were there any words, and at least sixty of them:
          No:  Show it as written — too short to be worth it
          Yes: Ask a second Claude for a shorter version
            Start that second Claude with the personal setup switched off,
              so it does not wake a shortener of its own
            Did an answer come back in time:
              Yes: Did it keep every question, file path, code block and number:
                Yes: Did it save at least fifteen words:
                  Yes: Show the reader the shorter version instead
                  No:  Show the original — not worth another turn
                No:  Show the original — a shortening that loses
                     a question is worse than a long reply
              No:  Show the original
                Say plainly on screen that the shortener timed out and
                  every turn is paying that wait
```

---

## What it does today

```text
A reply finishes and the shortener wakes up
  Ask a second Claude for a shorter version
    That second Claude starts with the full personal setup — the same
      end-of-reply shortener attached to it
    It writes its answer in about four seconds
    Its own shortener then wakes up, sees an answer over sixty words,
      and asks a THIRD Claude to shorten that
      The third one takes about forty seconds
    Only then does the second Claude finish and hand its answer back
  Forty-six seconds have passed
  The forty-five second limit has already killed it
  Nothing comes back, and the reader waits for nothing
```

```text
The timeout message
  The shortener writes "I timed out, every turn is paying this wait" to the
    error channel
  The part that called it never reads the error channel
  The message goes into a pipe nobody empties, and no one ever sees it
```

## What changes

```text
Starting the second Claude
  Today: start it with the full personal setup
  Instead: start it with only the project's own setup
    The personal setup is where the shortener is attached, so leaving it out
      means the second Claude has no shortener of its own
    The project setup carries no end-of-reply steps, so nothing is lost
    Signing in still works, so it can still answer

Showing the timeout
  Today: the warning is written somewhere nobody reads
  Instead: pass the error channel straight through to the screen
```

## The rules

- `[RULE] shortener-child-runs-without-personal-setup` — the second Claude is
  always started with the personal setup left out. This is what stops it
  waking a shortener of its own.
- `[RULE] shortener-child-must-still-sign-in` — whatever switches the setup
  off must not switch off signing in. Turning everything off makes the second
  Claude answer "not logged in" instead of shortening.
- `[RULE] shortener-timeout-is-seen` — a timeout is printed where the reader
  can see it, never into a channel nobody reads.
- `[RULE] concise-rewrite-never-changes-a-fact` — unchanged.
- `[RULE] concise-rewrite-preserves-questions-and-warnings` — unchanged.
- `[RULE] concise-hook-never-loops` — unchanged, and now true in two ways:
  the same reply is never shortened twice, and the shortener never triggers
  itself in a nested copy.

## Why this shape

**What we are really trying to do.** Let David read a reply in less time. Not
"run a shortener" — that is only one way to do it.

**Does it fight anything already built.** There is a second thing doing the
same job: a set of writing rules pasted in front of every single turn, telling
the reply to be short before it is written. That one is free and always runs.
The shortener is a second pass after the fact, and it costs a whole extra
turn. Two things doing one job is a problem, so this is a real question about
whether the shortener should exist at all — see the last note below. An older
third mechanism, a pattern-matching gate, was already removed for being easy
to slip past; it is switched off everywhere and does not clash.

**Have we already built any of this.** The searchable code map is live here
(1,519 files, compiler-accurate), so this was checked properly rather than by
guesswork. Nothing else in the project starts a nested Claude and then reads
back its answer, so there is no existing piece to reuse — the fix is a change
to how one command is started, not new machinery.

**Is this the simplest thing that works.** Yes. It adds no file, no setting,
and no new idea — it appends two words to the command that starts the second
Claude. Things deliberately NOT built: no separate copy of the personal setup
for children to read; no marker file or environment flag saying "a shortener
is already running" (that needs new state and a way to clean it up when a run
dies); no rewrite of the shortener to talk to the model directly instead of
through the command line; no change to the sixty-word or fifteen-word
thresholds.

**Will any of this be reused.** No. It is one flag on one command with one
caller. Building anything general here would be inventing a need.

**What could go wrong.** The flag also drops the project's own setup layers,
so if a project ever attached an end-of-reply step of its own, the shortener
would stop honouring it — acceptable, since the shortener only governs how a
reply reads. The bigger risk is the one already paid once on this bug: a
single fast run being treated as proof. Every claim here was measured at
least twice.

**On continuing after a failure.** Every path where the shortener gives up
lets the original reply through unchanged. That is a named pass, not a hidden
patch-over: the shortener governs how a reply *reads*, never whether it is
true, so silencing a correct answer because a shortener broke would be the
worse outcome, and nothing is invented or trimmed on that path. Four such
paths are already written down and approved. The one thing that was wrong is
now fixed: the failure was silent. A pass is only allowed if the reader can
see it happened.

**Should this exist at all.** Open question for David, and the honest answer
is "maybe not". Now that it runs in about nine seconds instead of timing out,
it still costs an extra turn and buys roughly a quarter fewer words — and the
writing rules pasted before every turn are already trying to do the same job
for free. Worth trying live for a few days before deciding.

## What I confirmed with you

Nothing new was asked. Two things were taken as already settled from the
briefing and re-checked in the code rather than assumed: the trigger bug is
fixed and shipped, and the earlier "it was using tools" explanation was wrong
and has been withdrawn.

## Where it lives

- `bin/gsd-t-concise-rewrite.cjs` — `rewrite()` starts the second Claude; this
  is the one line that changes.
- `scripts/gsd-t-concise-hook.js` — `main()` runs the shortener and throws
  away its error channel; this is where the timeout becomes visible.
- `.gsd-t/concise.json` — the on/off switch, currently off in 30 projects.
- `.gsd-t/fallbacks.json` — the four approved let-it-through paths.
