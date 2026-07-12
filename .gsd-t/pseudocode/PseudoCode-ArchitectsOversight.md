# Architect's Oversight — Plan Before You Build (Pseudo-Code)

Before GSD-T writes any code, an "architect" asks a fixed set of questions in order.
Any question can stop the plan. The goal: the simplest design that reuses what already exists —
so we never build the wrong thing correctly (the Binvoice whole-page scan that re-read a count
we already had stored).

Three pieces: the QUESTIONS (doctrine), the REMINDER (hook), the DOER (workflow gate).

---

## PIECE 1 — The Six Questions  (asked before every build)

```text
# Ask these IN ORDER. Answer each with EVIDENCE (look it up), never a hunch.
# Any "no / not sure" stops the plan until fixed.

FUNCTION architectPass(objective):
    # 1. OBJECTIVE — are we even solving the right thing?
    ask: what is the core objective, and why is it the objective?

    # 2. CONFLICT — does solving this break something else we already decided?
    ask: does it clash with another objective? must we re-open an old one?

    # 3. REUSE — do we already have this, or already have the ANSWER to it?
    look in the code graph (not memory) for existing work
    ask: can I reuse the PROCESS?  or reuse its OUTPUT (a value already stored)?
    # ← THIS question kills the completeness-scan waste: the count was already saved.

    # 4. SIMPLICITY — is this the simplest path?
    ask: simplest, most efficient plan? — prove it, don't just feel sure.

    # 5. REUSE FORECAST — will this new piece be needed again? (see PIECE 1b)
    forecast HIGH or LOW; build accordingly.

    # 6. RISK — does this plan create security or stability/scale risk?
    ask: any risk? am I sure?

    # Passed all six → build. Otherwise → stop and re-plan.
    return "build" OR "stop-and-replan"
```

---

## PIECE 1b — Reuse forecast + avoiding duplicate sprawl  (inside Question 5)

```text
# Predict how likely this function is to be reused, and build to match.
FUNCTION reuseForecast(newThing):
    IF it handles a core thing (comment/post/seller/order), recurs in the roadmap,
       or is a pure input→output transform:
        forecast = HIGH → build it clean + easy to extract later
                          (NOT loaded with knobs for imagined callers)
                          register it in the graph as "reuse-likely"
    ELSE:
        forecast = LOW  → build the simplest inline version, no abstraction

# When something SIMILAR already exists but isn't reusable as-is:
FUNCTION handleSimilarExisting(existing, newNeed):
    IF same JOB (just different inputs):
        extract the shared core into one reusable piece    # DON'T edit the working original
        old callers keep calling it unchanged              # nothing breaks
    ELSE IF only looks similar (different job):
        build new                                          # forcing them together = a mess

    IF touching the original is too risky (many callers / would change behavior):
        build new BUT register a "reuse-candidate" link in the graph → the twin
        # so the duplicate ANNOUNCES itself; next person re-decides the merge.
        # never build a silent rogue twin — that hides it from the reuse check.

# A wrong forecast is fine:
#   LOW thing reused anyway → the graph's similarity check finds it next time
#   → the reuse-candidate debt fires → self-corrects. Act on the forecast, don't agonize.
```

---

## PIECE 2 — The Reminder  (hook: fires right before code is written)

```text
# A doctrine sitting in context can be MISSED under load. So fire a nudge at the
# exact moment code is about to be written. One line, points at the doctrine.

ON about-to Write/Edit a file:
    IF this is a GSD-T project AND the file is CODE (not a doc/pseudocode/config):
        print one line: "run the Six Questions first — see the doctrine"
    ELSE:
        stay silent                      # writing a doc? don't nag.

    # NEVER block the write. Any error → stay silent, let it through. (fail-open)
```

---

## PIECE 3 — The Doer  (workflow gate: actually runs the questions, with proof)

```text
# The reminder only reminds. The workflow makes it happen and checks the proof.

DURING plan/milestone, BEFORE writing code:
    run the Six Questions as real steps
    Question 3 (reuse) MUST run a real graph query (or loudly say the graph is missing)
    write every answer, in plain English, into the milestone's PseudoCode file

DURING verify:                              # fail-closed checks
    IF the PseudoCode file is missing or doesn't answer the six → FAIL   # A-FAIL-1
    IF Question 3 has no reuse-evidence (no graph query logged)   → FAIL # A-FAIL-2
    IF a new function duplicates an existing one with no
       "reuse-candidate" link registered                         → FAIL # A-FAIL-3
```

---

## PIECE 4 — Plain language is the audit  (why the pseudocode matters)

```text
# Jargon hides waste: "scan role=button/span/div to compute renderedCount" SOUNDS
# like real work. "scan the whole page twice to get a number we already saved" does not.
# Same operation — only the plain words expose it.

RULE for every reply / plan / options / mid-work note:
    say it in plain words; gloss any shorthand on first use
    NEVER stack several shorthand terms in one sentence (becomes unreadable)
    IF the reader would need an "I don't understand" option → the sentence already failed
# The plain-English pseudocode lets David approve DIRECTION before any code is written.
```

---

## Summary

| Piece | What it is | Job |
|-------|-----------|-----|
| 1 Six Questions | the doctrine (CLAUDE.md) | the definition — always available |
| 2 Reminder | PreToolUse hook on Write/Edit | the trigger — can't be missed, no context cost |
| 3 Doer | plan/milestone + verify gate | the execution — runs it, proves it, blocks on fail |
| 4 Plain language | Reader Contract + this pseudocode style | the audit — waste can't hide in plain words |

The one question that would have prevented the Binvoice waste: **"can I reuse the OUTPUT —
a value already stored?"** The count was already saved locally; the scan re-derived it.
