# Read The Project's Own Notes Before Reaching For Anything

Hand every session the map of what its own project already wrote down, then stop it once — the first time it reaches for the plumbing — and make it check that record against reality and fix what has drifted.

```text
A session starts, resumes, or has its memory compressed and starts again
  Does this project keep its own notes:
    No:  Say nothing
    Yes: Add one short passage to what the session sees:
      The names of every section in each of the five kinds of notes
      One instruction: "The answer is probably already in here. Look before you conclude you cannot."
      # Nothing is stopped. Nothing waits. Text is added, and that is all.

A session is about to run any command at all
  Has this particular worker already been stopped once for this:
    Yes: Say nothing, ever again for this worker
    No:  Could this command be touching the plumbing:
      No:  Say nothing
      Yes: Does this project keep notes about its plumbing:
        No:  Say nothing — there is nothing to point at
        Yes: Add one short passage to what the session sees:
          The names of every section in the plumbing notes
          The recorded environments, whichever were written down
          Two instructions, in this order:
            "Read these notes before you decide you cannot reach something."
            "Anything there that disagrees with reality is now your problem to correct."
          Write down that this worker has been stopped once
          The command runs untouched either way
```

```text
The session has now read the notes and found them disagreeing with reality
  How sure is it that the notes are wrong, rather than something it just built being wrong:
    Sure — and it can point at something older than this session that proves it:
      Correct the notes
    Not sure, or the only evidence is work from this very session:
      STOP
      Tell the user what the notes claim, what reality shows, and why it cannot tell which is right
      Wait — never guess, never quietly pick one
```

```text
Someone later asks how often the notes had to be corrected, and how often we had to ask
  Read the record every session already keeps of every tool it used
  Count the times a note was edited soon after a session was stopped
  Count the times the session put a question to the user soon after
  # Nothing new is written down. The counting reads what is already there.
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

And the nearest thing we already built to what this plan proposed is **silently doing nothing**:

```text
A reminder already fires just before code is written
  It works out whether to speak
  It decides yes, and prints its sentence
  Where does that sentence go:
    Into a debug log nobody reads
    # Printing plain words at this moment is not how you reach the model.
    # The reminder has to be wrapped and labelled to be delivered.
    # It has never been wrapped. It has been printing into the dark.

Its tests
  Do they check the sentence was printed:
    Yes — and it is, so they pass
  Do they check the sentence arrived:
    No
    # Green tests over a dead feature.
```

## What changes

```text
Two moments, two different jobs
  When a session starts, resumes, or restarts after its memory is compressed:
    Hand it the section names of all five kinds of notes
    This is the map — where anything might be written down
  When a session first reaches for the plumbing:
    Hand it the plumbing sections and the recorded environments
    This is the audit — read them, and fix what has drifted
```

```text
Why the map has to arrive twice
  A session is told at the start where everything is written down
  Then its memory is compressed, and the early part is summarised away
  So the map arrives again on every restart, because that is when it was lost
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
  It fires at most once for each worker, so a wrong guess costs one passage of text, once
  A wrong fire still sends the worker into the notes, which is where we wanted it anyway
  So the interruption leans toward firing, and never toward staying quiet
```

```text
Which worker has already been stopped
  A session and every helper it sends off all report the same session name
  So counting by session name would stop the first worker and silence all the others
  Each helper does carry its own separate name
  Use that name where there is one, and the session name where there is not
```

```text
The passage has a hard size limit, and five sets of section names nearly fill it
  Measured on a real project, the five sets together come to about three quarters of the limit
  A bigger project would go over, and going over replaces the text with a file path
  So the map is trimmed to fit before it is ever sent:
    Keep the top-level section names, drop the ones nested beneath them
    Keep the plumbing notes whole, since that is the one being reached for
    Say plainly when something was trimmed, and where the whole thing lives
```

```text
When the notes are found to be wrong
  Is the proof older than this session:
    Yes: Correct the notes, say so, carry on
    No:  Stop and ask
```

```text
Counting how often it has to ask
  Every session already writes down every tool it used, with what it touched and when
  A note edited soon after a stop is a correction
  A question put to the user soon after a stop is an ask
  Both are already in that record, so nothing new is recorded and no new watcher is installed
  Frequent asking means some part of the workflow never records what it changed
  Near-silence means the notes are keeping up
```

## The rules

```text
The map arrives at session start and again after every memory compression   [RULE] doc-map-arrives-at-session-start-and-after-compaction
The plumbing audit fires at the moment of reach, never at the final pass     [RULE] doc-first-fires-at-reach-not-at-verify
The trigger asks "could this be plumbing", never "is this a known risky tool" [RULE] doc-first-any-command-not-an-allowlist
At most one plumbing audit per worker                                        [RULE] doc-first-once-per-worker
A worker is identified by its own helper name, falling back to the session name [RULE] doc-first-keyed-on-agent-id-not-session-id
When it cannot tell whether a command is plumbing, it fires                   [RULE] doc-first-biased-toward-firing
It carries section names and recorded rows, never the notes' full text        [RULE] doc-first-shows-map-not-contents
Every passage is wrapped and labelled so it reaches the model, never bare text [RULE] doc-first-delivered-as-labelled-context-not-bare-text
Every passage is measured against the size limit and trimmed before sending   [RULE] doc-first-fits-the-size-limit-or-is-trimmed-aloud
The reminder instructs the session to correct notes that disagree with reality [RULE] doc-first-read-is-also-an-audit
A note is corrected without asking only on proof older than this session       [RULE] doc-first-confident-means-evidence-older-than-this-session
Anything short of that standard stops and asks                                [RULE] doc-first-unsure-halts
Corrections and asks are counted by reading the record already kept           [RULE] doc-first-ask-rate-read-not-recorded-again
It only ever adds text, never stops, delays, or changes a command             [RULE] doc-first-never-blocks
A project with no notes gets no interruption and no prompting to start some   [RULE] doc-first-silent-without-notes
Unreadable notes mean silence and an unchanged command, never a substitute     [RULE] doc-first-no-fallback
A test proves the passage arrived, not merely that it was printed             [RULE] doc-first-tested-at-the-front-door
```

## ⚠ Divergence

**The 2026-08-06 plan folded the map and the audit into one interruption at the moment of reach.
The 2026-09-02 interview split them: the map now arrives at session start, and only the plumbing
audit fires at the reach.** They were separated because they answer different questions at different
moments. The map answers "where might this be written down at all", and it is needed before the
session forms any belief about what it can reach — including after a memory compression, which is
exactly when the early reasoning is summarised away and the map is lost. The audit answers "what
does the plumbing record say, and is it still true", and it is only worth its space at the moment
something is actually being reached for. Folded together, the map arrived too late to prevent the
wrong belief and never came back after a compression.

**A second correction, found during this pass rather than supplied.** The plan named an existing
reminder as the shape to copy. That reminder prints its sentence as plain words at a moment where
plain words are written to a debug log rather than shown to the model. Its tests assert the sentence
was printed, which it is, so they pass over a feature that has never delivered anything. Copying that
shape would have reproduced the same silence. The passage must instead be wrapped and labelled as
context. The existing reminder is broken in the same way and is named here as evidence; repairing it
is a separate change, not folded into this one.

**A third correction, to a decision made in the interview.** The interview settled that one
interruption per worker would be kept by the worker's session name, and specifically not by the root
session name. Reading a real session's own records shows every helper reports the *same* session name
as the session that sent it; what actually distinguishes them is a separate helper name carried
alongside. Keeping by session name would therefore stop the first worker and silence every other one
— the opposite of what was decided. The intent is honoured by keying on the helper name where there
is one and the session name where there is not.

**The earlier plan was also too narrow in two ways, both corrected by the user in the first
interview.** It proposed deciding by tool name, which is an allowlist, and an allowlist fails on
whatever is not on it. And it treated the read as a lookup only, when the read is the only audit
these notes will ever get.

**A correction to the brief that commissioned the original work:** it assumed the triggering incident
was answered by the recorded-environments table. It was not. The question was how to read the server's
trace logs; that table has seven rows and none concerns trace logs. The answer sat in two ordinary
prose sections of the same file. This is why every passage must advertise what a file **covers**,
not one table inside it.

## Why this shape

**The core objective** is to make a session open notes it already has, before it forms the belief
that it cannot reach something — and to leave those notes more accurate than it found them.

**Does it conflict with anything already built?** No. The recorded-environments table, the thing that
writes it and the end-of-run check that grades it all keep doing exactly what they do. This adds
readers at two new moments and an instruction to correct what is read. It does surface one conflict
it does not resolve: the reminder that fires before code is written has the same delivery defect,
and the standing instructions still describe a retired guard as enforced. Both are named as evidence
of the very drift this work targets, and both are left alone.

**What can be reused, and what turned out not to be there.** The two moments both have an established
shape in this project — watch an event, add text, never block, fail silent — and there are working
examples of each. The place where corrections and asks would be counted already exists, and so does
the record they would be counted from: every session already writes down every tool it used, with the
file it touched or the question it asked, timestamped. That record is what makes the counting free.
Two things the earlier plan expected to reuse are not actually reusable: the reader for the recorded
rows is private to its own file and cannot be called from outside it, and the command that shows
these counts reads two specific files and would need a small edit to show a third. **Say this plainly:
the code map could not confirm any of this.** Every relationship question asked of it came back empty
while also reporting its own answer incomplete, with three hundred and thirty-three files parsed but
unresolved. So reuse was established by hand-searching, and reuse detection here is REDUCED, not
clean.

**Is it the same pattern as something that exists, and could one thing serve all of it?** Partly, and
deliberately not entirely. The map and the audit read the same notes and share almost all their
machinery, so they are one piece of code told which of two jobs to do. The counting is a different
job — it reads a record rather than watching an event, and it runs when someone asks rather than
continuously — so it stays separate and is read on demand. Two things doing one job each, not four
things, and not one thing doing two unrelated jobs behind a switch.

**Why this is the simplest version.** The counting was the expensive half of the earlier plan: it
called for watching every file edit and every question in order to write a second record of what had
happened. Every watcher of that kind costs a small program launched on every matching action, in
every project, forever. But the record it would have written already exists and is already complete
enough to answer the question. So that half becomes a reader, and costs nothing that runs. What is
left is one new piece of code and two new places it is switched on — one at session start, one before
commands — plus a small edit so the existing counts command shows the new numbers, and a repair to the
one registration helper, which today cannot say which tools a hook should watch.

**Will this be reused?** The delivery wrapper will — every future reminder of this kind needs it, and
the existing broken one is proof that getting it wrong is easy and silent. So it is written once as a
shared piece. The trimming and the note-reading serve this job alone and stay where they are.

**Why one interruption, deliberately broad.** No pattern can cleanly separate "touches the plumbing"
from "does not". Starting the development server, running a test suite that may create its own
database, and reading a local settings file all sit on the boundary. Rather than pretend the boundary
is crisp, the design makes being wrong cheap: firing at most once per worker means the entire cost of
every misfire is a single passage of text. And because a misfire still sends the worker to the notes,
where it may catch drift, a wrong fire is not purely waste.

**Why "confident" means evidence older than this session.** The worry to design against is a session
mistaking its own freshly-broken work for a documentation error and writing that error into the source
of truth — corrupting the thing everyone else trusts. Proof that predates the session cannot have been
produced by the session's own mistakes. Anything looser lets a bad afternoon rewrite the record.

**What could still go wrong.** It may fire on genuinely code-only work — bounded, one passage, one
time per worker. It may not fire on a command that touches the plumbing in a way no pattern
anticipated, which leaves that case exactly where it is today and no worse. The passage may crowd the
size limit on a project with more sections than the one measured, which is why it is trimmed before
sending and says so when it trims. And a session may judge its confidence wrongly; the
older-than-this-session rule is what keeps that from reaching the notes.

**The first thing the build must do, before anything else.** Prove a passage sent at the moment of a
command actually arrives, by running it and looking. The published documentation says the wrapper is
the way and bare text is discarded, and the broken reminder is consistent with that. But the only
evidence that this project's own combination works is going to be a live run, and everything else
here rests on it.

**The fallback question.** The failure that started this was itself a chain of continuing past
failures: blocked, so try something else, so hunt an unevidenced bug in unrelated code. Nothing here
adds such a branch. Unreadable notes mean silence and an unchanged command. A passage too large is
trimmed and says so, rather than being quietly dropped. An uncertain correction means stopping, not
choosing. The one place that looks like a fallback and is not is the worker name: using the session
name when there is no helper name is not recovery from a failure, it is the ordinary case of a session
with no helper.

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
- **The map goes at session start** (2026-09-02, first decision), because that moment also fires
  after a memory compression, which is when the map is lost. It covers all five kinds of notes. The
  plumbing audit still fires separately at the first reach.
- **The counting is measured, not self-reported** (2026-09-02, second decision) — approximate is
  accepted, and it goes in the existing place with the existing command. This pass found the
  measurement can be read from a record that already exists, so it costs nothing that runs.
- **One interruption per worker, not per session tree** (2026-09-02, third decision), so each fresh
  helper gets its own. This pass found the identifier named in that decision does not distinguish
  helpers and the one carried alongside it does; the intent is unchanged, the identifier is corrected.
- **Held fixed, not re-opened:** the recorded table never holds a secret value; a missing row means
  stop and ask rather than guess; a row is written the moment it is learned; an interruption must
  never block; nothing that continues past a failure gets built without asking first; reuse before
  build, with no second counting system.

Unresolved, needing the user: none.

## Where it lives

| Step in the flow | File |
|------------------|------|
| The one new script, doing the map job and the audit job | `scripts/gsd-t-doc-first.js` (new) |
| The shared wrapper that makes a passage actually arrive | inside the same script, exported for reuse |
| Turning it on at session start | `configureEventHook(settingsPath, "SessionStart", …)` in `bin/gsd-t.js` |
| Turning it on before commands | needs a matcher-capable registrar in `bin/gsd-t.js` — `configureEventHook` hardcodes `matcher: ""`, and `configureWriteEditHook` hardcodes `"Write\|Edit"` |
| Shipping the script to every project | the global hook-script set installed by `install()` in `bin/gsd-t.js` |
| The recorded rows it reads | `lookupEnvironment` / `ENV_COLUMNS` in `bin/gsd-t-env-registry.cjs` — note `parseRows` is NOT exported |
| The marked block inside the notes | `extractMarkedDocBlock` in `bin/gsd-t-doc-marker.cjs` |
| The record the counts are read from | `.gsd-t/heartbeat-<session>.jsonl`, written by `scripts/gsd-t-heartbeat.js` |
| Where the counts are shown | `commands/gsd-t-metrics.md` — reads only `task-metrics.jsonl` + `rollup.jsonl` today |
| The end-of-run check that stays unchanged | `bin/gsd-t-env-registry-check.cjs`, run by `bin/gsd-t-verify-gate.cjs` |
| The broken sibling, named as evidence, not fixed here | `scripts/gsd-t-architect-oversight-guard.js` + `test/m101-architect-oversight-hook.test.js` |
| Triggering-case evidence | `/Users/david/projects/binvoice/docs/infrastructure.md` — prose sections, not the table at lines 83-90 |
