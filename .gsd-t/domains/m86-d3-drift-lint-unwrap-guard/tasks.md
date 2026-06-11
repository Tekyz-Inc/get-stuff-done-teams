# Tasks: m86-d3-drift-lint-unwrap-guard

## Files Owned

- `test/m85-workflow-tier-policy-lint.test.js`
- `test/m86-lint-unwrap-fallback.test.js`

---

### M86-D3-T1 — Unwrap the `??` form in the literal extractor
**Touches:** `test/m85-workflow-tier-policy-lint.test.js`
Extend the model-literal extractor/regex so it recognizes
`model: overrides["<stage>"] ?? "<premium-literal>"` and yields the FALLBACK literal for
validation. Keep recognizing bare `model: "<literal>"`. Validate the extracted literal against
the published tier set (D1's `MODEL_IDS` keys) AND the designated-stage policy (premium fallback
per stage). Fail-closed: any `model:`-bearing line the extractor cannot parse FAILS.

### M86-D3-T2 — Designated-stage labelPattern assertions
**Touches:** `test/m85-workflow-tier-policy-lint.test.js`
Update discovery so each designated stage's `labelPattern` still matches its `??` line, and the
extracted fallback equals the expected premium-active tier (solution-space-probe/partition-probe/
competition-judge/pre-mortem/red-team/debug-cycle-2 → fable; producers → bare opus). Preserve the
M85 non-empty-match meta-assertion (≥1 line matched per stage).

### M86-D3-T3 — Mandatory negative fixtures (NEW)
**Touches:** `test/m86-lint-unwrap-fallback.test.js`
Three fixtures fed to the extractor/validator, each asserted to FAIL:
- (i) drifted BARE literal (e.g. `model: "claude-opus-4-7"`) → FAILS (M85 invariant preserved).
- (ii) `??` form with a drifted fallback (e.g. `overrides["red-team"] ?? "claude-opus-4-7"`) → FAILS.
- (iii) `??` form with a fallback outside the tier set (e.g. `?? "gpt-4"`) → FAILS.
Use a fixture-string harness (not edits to real workflows) so D3 stays write-disjoint from D2.

### M86-D3-T4 — Green run + cross-check against D2's real workflows
**Touches:** (verification — no new file)
Run both test files. Confirm: D2's actual edited workflows PASS the unwrap lint, all three
negatives FAIL as designed, M85 invariants intact. This is SC(c)'s killing test.

---

## Acceptance bindings (this domain)

- SC(c) lint bites both forms: T1+T3 — drifted bare AND drifted-fallback both FAIL; the
  deliberately-drifted fallback fixture is the mandatory negative test.
