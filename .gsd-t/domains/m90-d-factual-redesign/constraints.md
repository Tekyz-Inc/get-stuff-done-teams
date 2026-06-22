# Domain Constraints: m90-d-factual-redesign

## The frozen-belief rule (the whole point of this redesign)
**NEVER hardcode a finite list for an OPEN category.** The vendor list was a frozen belief
about an open set — that is the exact silent-miss bug M89 exists to prevent, committed by
M89 against itself. Mechanical/regex recognizes ONLY closed, knowable sets (this repo's own
files = internal). The open external world is the LLM judge's call; uncertain → research.
([[feedback_coverage_check_structural_not_substring]]: structural, not substring.)

## Edit-in-place, do not regress
M89's code is SOUND (preserved at `ed03a8d`, 1824/0). This is edit-in-place, NOT a rewrite:
- KEEP the house-style JSON envelope + bad-input guard (`{ok:false}` never silent-internal).
- KEEP the §7 fail-closed cite gate (R-FACT-4) exactly — an uncited external claim FAILS verify.
- KEEP deterministic behavior (identical claim → byte-identical envelope).
- The Destructive Action Guard applies to DELETING the vendor machinery: it is in scope and
  approved by the winning proposal (R-FACT-1 explicitly says DELETE), but every requirer of
  `EXTERNAL_VENDOR_NOUNS` must be inlined/removed in the same pass (grep first;
  [[feedback_retire_scan_against_keep_list]]).

## Traced requirements
- **R-FACT-1** — DELETE `EXTERNAL_VENDOR_NOUNS` / vendor-list; regex asserts INTERNAL only on concrete own-repo path/file (closed set).
- **R-FACT-2** — not-confidently-internal → LLM judge → external/uncertain → research+cite.
- **R-FACT-3** — time-anchored override: fast-moving lib/API/version OR "current/latest best practice" → research regardless of confidence.
- **R-FACT-4** — KEEP §7 fail-closed cite gate (uncited external → verify FAILS).

## Corpus discipline
The corpus test must:
- Assert NO external-enumeration path remains (negative test on the deleted vendor list).
- Assert the closed INTERNAL set + time-anchored override classify the 13-item labeled
  corpus DETERMINISTICALLY (re-label rows whose old expected outcome depended on a vendor
  match — those now route to judge/ambiguous, the safe direction).
- Held-out generalization guard stays: "passes seen, fails held-out" = FAILURE.

## Hard rules
- Zero new runtime deps; Node built-ins; sync APIs.
- Runtime-native: `bin/*.cjs` brain; MUST NOT be `require()`d into a `*.workflow.js`.
- Do NOT touch the contract or any workflow — those are D-CONTRACT integrate seams. Read the
  doctrine envelope shape from D-CONTRACT's contract; do not write it.

## File discipline
Touch ONLY scope.md § Files Owned. The classifier module is yours alone; the contract,
workflows, and `bin/gsd-t.js` are D-CONTRACT's.
