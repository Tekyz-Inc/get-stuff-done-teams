# Broken Graph HALTS, Absent Graph Auto-Builds

When the code map is damaged, stop everything and demand a fix; when it was simply never built, build it and carry on.

```text
Some part of GSD-T asks the code map (our searchable index of the codebase) a question
  Did the answer come back:
    Yes: Use it
    No:  Which kind of failure was it:
      Never built — no map file anywhere on disk:
        Build the map once, ask the question again
        Did it work this time:
          Yes: Use it
          No:  Treat it as damaged — the builder itself is broken
      Damaged — a map file is there but unreadable:
        STOP all work
        Tell the user: "the code map is damaged — run gsd-t graph status"
        Hand back "blocked, needs a human"
      Anything we don't recognise:
        Treat it as damaged, and STOP — never guess it was merely missing
```

---

## What it does today

```text
Some part of GSD-T asks the code map a question
  The answer comes back with one single word for every kind of failure
  Is that word "unavailable":
    Yes: Quietly go search the files by hand instead, and say nothing
    No:  Use the answer
  # Never-built and damaged both produce "unavailable", so both quietly
  # degrade to hand-searching. A damaged map hid for 12 days this way.
```

Two places lose the distinction:

```text
The map reader (the part that opens the map file)
  Is there a map file on disk:
    No:  Report "unavailable"        # never built
    Yes: Try to open it
      Did it open:
        Yes: Answer the question
        No:  Report "unavailable"    # damaged — but reported identically

The caller (the part that runs the map reader as a separate program)
  Run the map reader
  Did it print an answer:
    Yes: Use it
    No:  Report "unavailable"
    # A reader that crashes on startup prints nothing, so a crash also
    # becomes "unavailable". The crash details — the exit code and the
    # error text on screen — are thrown away.
```

## What changes

```text
The map reader
  Is there a map file on disk:
    No:  Report "never built"
    Yes: Try to open it
      Did it open:
        Yes: Answer the question
        No:  Report "damaged", and say why

The caller
  Run the map reader
  Did it finish cleanly and print a proper answer:
    Yes: Pass that answer straight through — trust what the reader said
    No:  Report "damaged", and include the error text it printed
    # A crash is now classified, not disguised.

One shared decision-maker (so nobody re-invents this test)
  Given a failure word:
    "never built": build it once, then continue
    "damaged":     stop and demand a fix
    anything else: stop and demand a fix

Everyone who asks the code map a question
  Route the failure word through the one shared decision-maker
  Was it "build once and continue":
    Yes: Build the map, ask again — still nothing means damaged
    No:  STOP, surface it, hand back "blocked, needs a human"

The three parts that are allowed to carry on without the map
  (scan, verify, integrate — their exemption is announced, not hidden)
  Never built: carry on in hand-search mode, exactly as today
  Damaged:     carry on, but say loudly that it is DAMAGED, not missing
```

---

## The rules

```text
A damaged map never quietly falls back to hand-searching   [RULE] broken-graph-halts-never-greps
Never-built builds exactly once, then re-asks              [RULE] absent-graph-auto-builds-once
A crash is classified from its exit code and error text    [RULE] crash-classified-not-fabricated
An unrecognised failure word counts as damaged, so we stop [RULE] unknown-reason-fails-closed-to-broken
One shared decision-maker owns never-built-vs-damaged      [RULE] one-availability-classifier
A momentary hiccup is retried once before calling it damaged [RULE] false-broken-guarded
```

The one thing that must never happen: a damaged map quietly turning into a
hand-search, so the work continues on worse information and nobody notices. Any
step here can be repeated harmlessly — building an already-built map re-asks the
same question, and stopping twice is still just stopped.

---

## ⚠ Divergence

None. This supersedes no shipped behavior — it splits one failure word into two
and routes on the difference. The existing "blocked, needs a human" verdict, the
existing answer format, and the existing map builder are all reused. No new
stopping system, no new answer format, no new builder.

---

## Why this shape

- **The objective** — a damaged code map must stop work, because continuing on a
  hand-search silently produces worse answers.
- **What it conflicts with** — three parts (scan, verify, integrate) are already
  allowed to work without the map. Their exemption stays, but they must now name
  a damaged map out loud instead of treating it as missing.
- **What already exists that we reuse** — the stopping verdict, the answer
  format, and the map builder all exist. We add one small decision-maker and
  change one word in two places.
- **Why this is the simplest version** — the two places that already know the
  difference are the two places we change. Everyone else routes through one
  shared test rather than repeating a string comparison.
- **Will it be reused** — yes; every part that reads the code map calls it, so it
  is built as one shared piece from the start.
- **What could go wrong** — a momentary hiccup (a busy file, a slow answer) being
  mistaken for damage and stopping all work. That is why it retries once first.

---

## Where it lives

| Step in the flow | File |
|------------------|------|
| The map reader | `bin/gsd-t-graph-query-cli.cjs` |
| The caller that runs it as a separate program | `bin/gsd-t.js` |
| The one shared decision-maker | `bin/gsd-t-graph-availability.cjs` (new) |
