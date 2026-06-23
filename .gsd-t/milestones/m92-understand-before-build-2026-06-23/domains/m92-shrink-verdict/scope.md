# Scope: m92-shrink-verdict (M92 D2 — move 2, the keystone)

## Mission
Make **"we made it smaller"** a first-class verify success — not an absence the schema can't express. Today `verify.workflow.js` freezes `overallVerdict` to `VERIFIED | VERIFIED-WITH-WARNINGS | VERIFY-FAILED`, where `VERIFIED` is a pure AND of additive gates passing. A net-negative diff (removed code, lighter altitude) has NO positive token — success is defined as "everything added passed," and "smaller" isn't sayable. This domain adds:
1. A **deterministic shrink-metric** (`bin/gsd-t-shrink-metric.cjs`) — measures the change's net size from a `git diff --stat` envelope (net LOC, files added/removed/modified, net delta). MEASURED, per [[feedback_measure_dont_claim]] — NOT an LLM self-attesting "this feels simpler."
2. A **first-class "smaller" signal in the verdict** — the synthesis reads the shrink-metric and surfaces a `shrink` field (e.g. `{netLoc, leaner:bool}`) so a net-negative/leaner change is REWARDED, not invisible. (Keep the existing 3-enum for pass/fail correctness; add the shrink dimension ALONGSIDE it — `VERIFIED` stays the correctness gate, `shrink` is the new orthogonal "did it get leaner" readout. Do not collapse them.)

## Files Owned
- `bin/gsd-t-shrink-metric.cjs` (new)
- `templates/workflows/gsd-t-verify.workflow.js` (verdict schema + synthesis: add the shrink dimension; M71 sandbox-clean, M85 tier literals)
- `test/m92-shrink-metric.test.js` (new)
- `test/m92-verdict-vocabulary.test.js` (new)

## Design note — additive-not-replace (avoid the very trap M92 fixes)
Do NOT remove or repurpose the `overallVerdict` enum — existing gates + tests depend on it. ADD `shrink` as a new, orthogonal verdict dimension (a sibling field in VERDICT_SCHEMA), computed deterministically from the diff-stat, surfaced in the synthesis output. This keeps correctness (AND-of-gates) and leanness (the new signal) as distinct objective functions — the same orthogonality principle the triad already uses.

## Out of scope
- The arch-trigger ladder (D1). The command prompts (D3). The 4-workflow envelope wiring for D1's ladder (integrate-seam) — but D2 OWNS verify.workflow, so D2 adds verify's read of D1's new envelope fields at INTEGRATE (coordinate: D2 does the verify-side wiring, since it owns the file).

## Deterministic-gate bar
The shrink-metric is deterministic from `git diff --stat` (or an equivalent passed envelope) — zero LLM. Killing test against byte-known diffs (a net-negative diff → `leaner:true`; a net-positive → `leaner:false`). M71/M85 lints stay green.
