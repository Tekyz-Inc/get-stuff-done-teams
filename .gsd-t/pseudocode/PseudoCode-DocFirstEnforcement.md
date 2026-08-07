# Read The Project's Own Notes Before Reaching For Anything

The first time a session goes to touch the plumbing — a database, a server, credentials, a hosting account, anything set up rather than written — stop it once and make it read what the project already recorded, then make it fix that record if reality has moved on.

```text
A session is about to run any command at all
  Has this session already been stopped once for this:
    Yes: Say nothing, ever again this session
    No:  Could this command be touching the plumbing:
      No:  Say nothing
      Yes: Does this project keep notes about its plumbing:
        No:  Say nothing — there is nothing to point at
        Yes: Add one short passage to what the session sees:
          The names of every section in the notes
          The recorded environments, whichever were written down
          Two instructions, in this order:
            "Read these notes before you decide you cannot reach something."
            "Anything there that disagrees with reality is now your problem to correct."
          Write down that this session has been stopped once
          The command runs untouched either way
```

```text
The session has now read the notes and found them disagreeing with reality
  How sure is it that the notes are wrong, rather than something it just built being wrong:
    Sure — and it can point at something older than this session that proves it:
      Correct the notes
      Record that a correction was made without asking
    Not sure, or the only evidence is work from this very session:
      STOP
      Tell the user what the notes claim, what reality shows, and why it cannot tell which is right
      Record that it had to ask
      Wait — never guess, never quietly pick one
```

---

## What it does today

```text
The session is asked to go look at something outside the code
  It tries one or two things
  Did those work:
    Yes: Carry on
    No:  Decide, on its own, that it has no way in
      Say "I don't have access to that"
      Go hunting for a different problem it can solve instead
      # Nobody opened the notes. Nothing made it.
      # The notes had the answer the whole time.
```

Why it does this: **nothing has ever enforced it.** "Read the notes first" is written in the standing
instructions, and standing instructions are advice a session carries in its head. When the head is
full, advice is the first thing to fall out. This is not an accretion of fixes — it is a rule that
was never given teeth. Every time it worked was the session happening to remember.

```text
The notes themselves drift out of date
  Who checks them:
    Nobody on a schedule
    Only whoever next needs the information
      And that person is the one who currently walks away without reading
      # So the drift is never found either. The same wall gets hit next time.
```

The one piece that does have teeth fires at the wrong moment:

```text
The project keeps a table of recorded environments
  When is it checked:
    At the very end, during the final quality pass:
      Confirm no secret was written into the table
      Confirm the table is not missing when the rule says it should exist
      # This runs AFTER the work. It grades the notes.
      # It never hands them to anyone who needed them.
```

## What changes

```text
One interruption, once per session, at the first sign of plumbing work
  Show the section names, not the contents
  Show the recorded environments that were written down
  Say plainly that correcting stale notes is now this session's job
```

```text
What counts as touching the plumbing
  Anything that is not plainly just reading or editing the code in this folder
  Connecting, provisioning, configuring, starting, deploying, or fetching credentials all count
  A local database counts exactly as much as a cloud one
  A test environment created fresh for one branch counts too
  Deciding by naming the risky tools is the thing we refuse to do:
    Whatever got left off the list is exactly where this fails next
```

```text
Keeping one broad interruption tolerable
  It fires at most once in a session, so a wrong guess costs one passage of text, once
  A wrong fire still sends the session into the notes, which is where we wanted it anyway
  So the interruption leans toward firing, and never toward staying quiet
```

```text
When the notes are found to be wrong
  Is the proof older than this session:
    Yes: Correct the notes, say so, carry on
    No:  Stop and ask
```

```text
Counting how often it has to ask
  Every automatic correction and every stop-and-ask is written to the running tally
  Frequent asking means some part of the workflow never records what it changed
  Near-silence means the notes are keeping up
```

## The rules

- `[RULE] doc-first-fires-at-reach-not-at-verify` — the interruption attaches to the moment a session
  reaches for the plumbing, not to the final quality pass. A check that runs after the work cannot
  prevent the work going wrong.
- `[RULE] doc-first-any-command-not-an-allowlist` — the trigger asks "could this be plumbing", never
  "is this one of the known risky tools". A named list recreates the original failure on the first
  thing left off it.
- `[RULE] doc-first-once-per-session` — at most one interruption per session. This is what makes a
  deliberately broad trigger affordable: the total cost of every wrong guess is one passage, once.
- `[RULE] doc-first-biased-toward-firing` — when it cannot tell whether a command touches the
  plumbing, it fires. A wrong fire sends the session to the notes; a missed fire is the original bug.
- `[RULE] doc-first-shows-map-not-contents` — it carries the section names plus the recorded
  environment rows, never the notes' full text. The file is too big to hold in the head; copying it
  in solves nothing.
- `[RULE] doc-first-read-is-also-an-audit` — the interruption instructs the session to correct the
  notes when reality disagrees. Pointing at the notes without this leaves the drift in place for the
  next session to hit.
- `[RULE] doc-first-confident-means-evidence-older-than-this-session` — a note may be corrected
  automatically only on proof that existed before this session started. Work this session produced is
  never sufficient proof, because the likeliest explanation is that the new work is what is broken.
- `[RULE] doc-first-unsure-halts` — anything short of that standard stops and asks. It never guesses,
  never picks the more likely of two readings, never quietly proceeds.
- `[RULE] doc-first-ask-rate-is-observable` — every automatic correction and every stop-and-ask is
  recorded, so the rate can be read rather than felt.
- `[RULE] doc-first-never-blocks` — it only adds text. It can never stop, delay, or alter a command.
- `[RULE] doc-first-silent-without-notes` — a project with no notes gets no interruption, and no
  prompting to start some.
- `[RULE] doc-first-no-fallback` — when the notes cannot be read, it stays silent and the command runs
  unchanged. It never guesses, never substitutes another source, never reconstructs an access path.

## ⚠ Divergence

**The first version of this plan was too narrow in two ways, and both were corrected by the user.**

First, it proposed deciding by tool name — a database tool, a cloud tool, a web address that is not
this machine. That is an allowlist, and an allowlist fails on whatever is not on it. The plumbing a
project needs includes local databases, local servers, mail set up on a box, and environments created
on demand for a single branch. The trigger is now "could this be plumbing", biased toward firing.

Second, it treated the read as a lookup only. The read is also **the only audit these notes will ever
get** — nobody reviews them on a schedule, so drift is only ever found by someone who needed the
information and hit a wall. A version that only points at the notes leaves stale notes stale, which
is the same failure one level up.

**A separate correction to the brief that commissioned this work:** it assumed the triggering incident
was answered by the recorded-environments table. It was not. The question was how to read the server's
trace logs; that table has seven rows and none concerns trace logs. The answer sat in two ordinary
prose sections of the same file. This is why the interruption must advertise what the file **covers**,
not one table inside it.

## Why this shape

**The core objective** is to make a session open a file it already has, at the moment it is about to
decide it cannot do something — and to leave that file more accurate than it found it.

**Does it conflict with anything already built?** No. The recorded-environments table, its writer and
its end-of-run check all keep doing exactly what they do. This adds a reader at a new moment and an
instruction to correct what is read.

**What can be reused.** Nearly everything. The project already has an interruption that fires just
before code is written and one that fires just after a file is read; both are the same shape — watch a
tool call, add text, never block, fail silent. This is a third of those on a different tool. The
reader for the recorded rows exists and is already shared, as does the reader for any marked block in
a document. Session identity arrives in the tool call already, and there is an existing pattern for
using it safely as part of a filename. The running tally has an existing home and an existing command
that reads it — no second tally gets built.

**Why one interruption, deliberately broad.** The honest position is that no pattern can cleanly
separate "touches the plumbing" from "does not". Starting the development server, running the test
suite that may create its own database, and reading a local settings file all sit on the boundary.
Rather than pretend the boundary is crisp, the design makes being wrong cheap: firing at most once per
session means the entire cost of every misfire in a session is a single passage of text. And because a
misfire still sends the session to the notes — where it may catch drift — a wrong fire is not purely
waste. That is what makes the broad trigger affordable, and it is why the trigger leans toward firing.

**Why "confident" means evidence older than this session.** The worry to design against is a session
mistaking its own freshly-broken work for a documentation error and then writing that error into the
source of truth — corrupting the very thing everyone else trusts. Proof that predates the session
cannot have been produced by the session's own mistakes. So a note may be corrected without asking
when something older than the session contradicts it, and in every other case it stops and asks.
Anything looser lets a bad afternoon rewrite the record.

**Why the ask-rate is worth recording.** Frequent asking means some part of the workflow is changing
things without recording them; near-silence means the notes are keeping up. That signal only exists if
both outcomes are written down, so both are.

**Why it explains the intermittence.** Nothing enforced the rule, so it rested on recall. Recall holds
early in a session and thins out late in a long one, after the conversation has been compressed and
the early reasoning summarised away. So the rule holds hundreds of times and then quietly does not.
An interruption generated at the moment of the command is immune, because it is not being remembered.

**Where it could still go wrong.** It may fire on genuinely code-only work — bounded, one passage, one
time. It may not fire on a command that touches the plumbing in a way no pattern anticipated, which
leaves that case exactly where it is today and no worse. And a session may judge its confidence
wrongly; the older-than-this-session rule is what keeps that from reaching the notes.

**The fallback question.** The drift in the triggering incident was itself a chain of continuing past
failures: blocked, so try local storage, so hunt an unevidenced bug in unrelated code. Nothing here
adds such a branch. Unreadable notes mean silence and an unchanged command. An uncertain correction
means stopping, not choosing.

## What I confirmed with you

- **The notes are correct and complete** in the triggering case. Told to look, the session found the
  answer immediately. This is a missing enforcement, not a documentation gap.
- **It is intermittent, across several projects.**
- **The trigger must be any command touching infrastructure** — no allowlist of risky tools. Local
  counts as much as cloud; provisioning and configuring count as much as connecting; environments
  created on demand count too.
- **A project with no recorded environments stays silent.**
- **The read is also a drift check.** Re-deriving settled facts is one cost; the other is never
  noticing that a change was made and never written down.
- **Correcting the notes is automatic when confident, and a stop-and-ask when not** — with the
  explicit worry being a session mistaking its own broken work for a documentation error.
- **The ask-rate is a health signal** the user wants to be able to read.
- **Held fixed, not re-opened:** the recorded table never holds a secret value; a missing row means
  stop and ask rather than guess; a row is written the moment it is learned; an interruption must
  never block; nothing that continues past a failure gets built without asking first.

Unresolved, needing the user:

- **Which notes are in scope beyond the plumbing file?** The same reasoning covers the architecture,
  workflows, requirements and contract documents — each is read on demand, none has any reach-time
  enforcement, and each drifts the same way. The plumbing file has the sharpest trigger; the others
  would need their own, and are proposed as a following step rather than folded in here.

## Where it lives

- Fires on: `PreToolUse` matching `Bash`, alongside the existing `claude -p` guard, which is the
  worked example of a Bash-matched hook reading `tool_input.command`.
- Shape to copy: `scripts/gsd-t-architect-oversight-guard.js` (fires before an action, adds text,
  fails open) and `scripts/gsd-t-read-intercept.js` (appends to a tool result, passes through by
  default).
- Once-per-session marker keyed on `session_id` from the payload; reuse the path-traversal allowlist
  in `scripts/gsd-t-heartbeat.js`, which already names files by session.
- Reads recorded rows via `parseRows` in `bin/gsd-t-env-registry.cjs`; reads any marked block via
  `extractMarkedDocBlock` in `bin/gsd-t-doc-marker.cjs`.
- Section names come from the headings of the project's `docs/infrastructure.md`.
- Correction and ask events append to `.gsd-t/metrics/`, the existing home used by
  `bin/gsd-t-architectural-trigger.cjs`; surfaced through the existing `/gsd-t-metrics` command.
- The end-of-run check that stays unchanged: `bin/gsd-t-env-registry-check.cjs`, run by
  `bin/gsd-t-verify-gate.cjs` as the `env-registry` gate.
- Triggering-case evidence: `/Users/david/projects/binvoice/docs/infrastructure.md` lines 258-260
  (monitoring) and 365 (the server's `/logs` address); the recorded-environments table at lines 83-90,
  which does not cover it.
