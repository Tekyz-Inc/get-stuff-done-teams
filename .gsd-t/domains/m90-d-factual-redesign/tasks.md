# Domain Tasks: m90-d-factual-redesign

> Shape D — `### Mxx-Dx-Tx`, each task carries a `**Touches**:` line.

## Files Owned
- `bin/gsd-t-research-gate.cjs`
- `test/m89-research-classifier-corpus.test.js`
- `test/fixtures/m89-labeled-corpus.json`

## Wave 2 — edit-in-place (gated on Wave 1 prove-or-kill clearing)

### M90-DF-T1 — DELETE the vendor-list machinery (R-FACT-1) [HEADLINE]
Remove `EXTERNAL_VENDOR_NOUNS`, `EXTERNAL_API_TERMS`, and every `hasStrongExternal`/match
path that consumes them. Grep for all requirers first; inline-then-delete so nothing
dangles. The regex now asserts INTERNAL only on a concrete own-repo path/file (closed set).
**Touches**: `bin/gsd-t-research-gate.cjs`

### M90-DF-T2 — Closed-internal + judge routing (R-FACT-2)
Internal ONLY on the closed own-repo path/file set; everything not-confidently-internal →
`ambiguous` → judge → external/uncertain → research+cite. Keep the house-style envelope +
bad-input guard.
**Touches**: `bin/gsd-t-research-gate.cjs`

### M90-DF-T3 — Time-anchored protocol override (R-FACT-3)
Add the always-verify override: fast-moving lib/API/version OR "current/latest best
practice" → research regardless of confidence (CoVe-style). Deterministic.
**Touches**: `bin/gsd-t-research-gate.cjs`

### M90-DF-T4 — KEEP §7 fail-closed cite gate (R-FACT-4)
Verify the fail-closed cite gate is preserved unchanged: uncited external claim → verify
FAILS. (No-regression check on the existing behavior.)
**Touches**: `bin/gsd-t-research-gate.cjs`

### M90-DF-T5 — Corpus + classifier test redesign [HEADLINE]
Update `test/m89-research-classifier-corpus.test.js` + `test/fixtures/m89-labeled-corpus.json`:
assert NO external-enumeration path remains (vendor-deletion negative test — out-of-list
vendor like GitHub/Slack/OpenAI no longer string-matches → judge, never silent-internal);
assert the closed INTERNAL set + time-anchored override classify the 13-item labeled corpus
deterministically; re-label vendor-dependent rows to the safe (judge) direction; keep the
held-out generalization guard.
**Touches**: `test/m89-research-classifier-corpus.test.js`, `test/fixtures/m89-labeled-corpus.json`

## Dependency / gating
- **Gated on Wave 1** clearing prove-or-kill (risk-first build order). If Wave 1 R1-exits to
  factual-only, THIS domain carries the milestone.
- T1→T5 build the same module + its test; write in order.
- File-disjoint from all other domains.
