# M115 A1 — per-gap hit conditions (SCORING SIDE — held out from the enumerator)

Moved out of the enumerator protocol on 2026-09-03: the first Wave-1 run had these three conditions, and
worked examples drawn from the answer key's own domain, INSIDE the protocol the enumerator read. That run
was therefore not blind — the enumerator was told what to find. These conditions now live only here, beside
the answer key, and the enumerator never sees them. Score the recorded output against them by hand and by
`test/m115-a1-blind-replay.test.js`.

## The three hit conditions (settled before any cold run, per pre-mortem PM-2)

These three conditions are written here, before this protocol has ever been run cold
against the held-out fixture, specifically so that no run can be scored against a
criterion invented after its output already exists. Each is a structural check against
the RECORDED enumeration output — a row's actual cells, or a named open-gap entry's
subject — never a search for a particular word appearing anywhere in the document.

1. **Month close + reopen is surfaced** when the recorded output contains a row (in any
   table) OR a `GAP` entry whose subject is a closed-state for the billing period (a
   "month" or equivalent time period) AND whose companion row/entry addresses re-entry
   (a reopen path) per E6 — either sourced, decided, or explicitly a `GAP` naming that no
   reopen path exists in the requirements. A run that enumerates ONLY the closing action
   with no corresponding row addressing reopening does not meet this condition — E6 requires
   both directions, and a row for only one direction is a near-miss, not a hit.

2. **The wrong permission model is surfaced** when the recorded output contains a row or
   `GAP`/`GAP:CONTRADICTION` entry whose subject is a mismatch between the documented
   permission grid (who is DOCUMENTED as able to do something) and what the per-endpoint
   check (E4, the endpoint half) would actually require or allow, for the feature area
   the requirements describe. A row that merely restates the documented grid without
   comparing it against the endpoint-level implication does not meet this condition — the
   gap is the DISAGREEMENT, not either side alone.

3. **"The owner cannot be deactivated" is surfaced** when the recorded output contains a
   row or `GAP` entry produced by E8 (the refusal-case rule) whose subject is a
   deactivation, removal, or disabling action applied to the single entity the feature area
   treats as irreplaceable (an owner, a sole admin, or equivalent) — naming that no refusal
   for this case is stated in the requirements. A row that enumerates deactivation for an
   ordinary member without ever raising the irreplaceable-entity case does not meet this
   condition.

**Near-misses count as misses.** A run that produces a row adjacent to one of these three
(the closing action alone, the documented grid alone, deactivation of an ordinary member
alone) without producing the specific structural element named above has not surfaced that
gap. The claim under test is that the eight rules FIND these cases mechanically — not that
a reader, looking at the output afterward, can see where they were gesturing.

