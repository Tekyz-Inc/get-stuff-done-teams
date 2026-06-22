# Domain Scope: m90-d-factual-redesign

## Milestone
M90 — The Unproven-Assumption Doctrine

## Wave
**Wave 2** (after Wave 1 prove-or-kill clears). **LOWEST RISK — edit-in-place.**

## Mission
Redesign the §1 **factual hook** inside the EXISTING `bin/gsd-t-research-gate.cjs`. M89's
code is sound (preserved at `ed03a8d`, 1824/0 tests) but its recognition layer carries the
exact frozen-belief bug M90 exists to kill: a hardcoded finite **vendor list**
(`EXTERNAL_VENDOR_NOUNS` / `EXTERNAL_API_TERMS`) for an OPEN category. Any out-of-list
vendor (GitHub/Slack/OpenAI) silently routes non-external → the silent miss.

This domain is the safe edit-in-place island, quarantined to the M89-owned classifier
module + its corpus test/fixture. It does **NOT** touch the contract (D-CONTRACT) or any
workflow wiring (D-CONTRACT integrate seam).

## Files Owned (this domain WRITES these — no other domain may)
- `bin/gsd-t-research-gate.cjs` — the classifier module (the ONLY domain editing it)
- `test/m89-research-classifier-corpus.test.js` — corpus test, edited in place
- `test/fixtures/m89-labeled-corpus.json` — labeled corpus fixture, edited in place
- `.gsd-t/domains/m90-d-factual-redesign/{scope,constraints,tasks}.md`

## NOT Owned (other domains / integrate seam)
- `.gsd-t/contracts/auto-research-contract.md` + the new doctrine contract — m90-d-contract-doctrine-integrate
- ALL `templates/workflows/*.workflow.js` — m90-d-contract-doctrine-integrate
- `bin/gsd-t.js` dispatch — m90-d-contract-doctrine-integrate (research-gate dispatch already registered; any change is D-CONTRACT's)
- The two Wave-1 bin modules + their tests

## Deliverables (the R-FACT redesign)
1. **R-FACT-1** — DELETE the `EXTERNAL_VENDOR_NOUNS` / vendor-list machinery. The regex
   asserts INTERNAL only on a concrete own-repo path/file (a CLOSED, knowable set).
2. **R-FACT-2** — everything not-confidently-internal is handed to the LLM judge →
   external/uncertain → research+cite. The mechanical layer recognizes only the closed
   internal set; the open external world is the judge's call.
3. **R-FACT-3** — add the time-anchored protocol override: a fast-moving lib/API/version OR
   "current/latest best practice" → research regardless of confidence (CoVe-style
   always-verify).
4. **R-FACT-4** — KEEP the §7 fail-closed cite gate: an external claim left uncited → verify
   FAILS.
5. Update the M89 corpus test to assert NO external-enumeration path remains AND that the
   closed INTERNAL set + time-anchored override classify the 13-item labeled corpus
   deterministically. Add a vendor-deletion negative test (out-of-list vendor like
   GitHub/Slack/OpenAI no longer string-matches → goes to judge, never silent-internal).

## Sequencing
Gated AFTER Wave 1 (risk-first build order). File-disjoint from all other domains — its
only shared dependency is the doctrine envelope shape pinned by D-CONTRACT's contract,
which D-FACTUAL CONSUMES (reads) but does not write.
