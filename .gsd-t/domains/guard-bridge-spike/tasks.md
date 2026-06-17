# Tasks: guard-bridge-spike (M87 D1 — Wave 1 kill gate)

## Files Owned
- `bin/gsd-t-guard-map.cjs`
- `test/m87-guard-map-bridge.test.js`
- `test/fixtures/m87/PseudoCode-PayPal.md`
- `test/fixtures/m87/PseudoCode-Extension.md`
- `test/fixtures/m87/PseudoCode-PayPal-doctored.md`
- `templates/workflows/gsd-t-verify.workflow.js`

---

### M87-D1-T1 — Build the exemplar fixture corpus
**Touches**: `test/fixtures/m87/PseudoCode-PayPal.md`, `test/fixtures/m87/PseudoCode-Extension.md`, `test/fixtures/m87/PseudoCode-PayPal-doctored.md`
**PseudoCode-Section**: PseudoCode-PayPal#guard-map
Copy the two binvoice exemplars as read-only fixtures, each with a real `[RULE]`
guard map (§2 grammar). Author the doctored PayPal variant identical to the
faithful one EXCEPT exactly one `[RULE]` is contradicted by its embedded
build-map evidence. Fixtures must be self-contained (carry their own
build→rule map inline or as a sibling JSON the test references).
**Acceptance criteria**: faithful + doctored differ by exactly one rule's backing.
**Files**: the three fixtures above.
**Test**: M87-D1-T3.

### M87-D1-T2 — `bin/gsd-t-guard-map.cjs` deterministic gate
**Touches**: `bin/gsd-t-guard-map.cjs`
**PseudoCode-Section**: PseudoCode-PayPal#guard-map
Enumerate every `[RULE] <RULE-ID>: <invariant>` from a doc; read a build→rule
map; gate deterministically. Exit 0 (all backed, none contradicted), 4 (≥1
unbacked/contradicted, name the RULE-ID), 64 (bad input). Zero deps, never
throws, pure. CLI: `--doc <path> --map <path> --json`.
**Acceptance criteria**: SC1 — divergence FAILS at contract-breach severity, deterministic, RULE-ID named.
**Files**: `bin/gsd-t-guard-map.cjs`.
**Test**: M87-D1-T3 (A1).
**Headline**: true

### M87-D1-T3 — A1 falsifiable harness
**Touches**: `test/m87-guard-map-bridge.test.js`
**PseudoCode-Section**: PseudoCode-PayPal#guard-map
The kill-criterion test: faithful exemplar → exit 0; doctored → exit non-zero
with the violated RULE-ID in output; both deterministic (no LLM). Also: unbacked
rule fails; contradicted rule fails; malformed input → 64; module never throws.
**Acceptance criteria**: A1 — exits 0 faithful / non-zero doctored, RULE-ID named.
**Files**: `test/m87-guard-map-bridge.test.js`.
**Test**: this IS the test.
**Headline**: true

### M87-D1-T4 — Wire the gate into verify.workflow.js
**Touches**: `templates/workflows/gsd-t-verify.workflow.js`
**PseudoCode-Section**: PseudoCode-PayPal#mechanism
Add a deterministic guard-map gate step (FAIL-blocking, BEFORE the triad,
alongside verify-gate/CI-parity/test-data) via the `runCli` inline-agent helper.
M71 sandbox-clean; M85 tier literal policy-conformant (`haiku`, like the other
gate calls). Run only when a `PseudoCode-[Title].md` + build-map exist for the
milestone (absent → skip, logged, never silent failure).
**Acceptance criteria**: A6 — M71 runtime-native lint + M85 tier-policy lint stay green; full suite green.
**Files**: `templates/workflows/gsd-t-verify.workflow.js`.
**Test**: `test/m71-workflow-runtime-native-lint.test.js`, `test/m85-workflow-tier-policy-lint.test.js` (existing, must stay green).

---

**WAVE GATE:** M87-D1-T3 (A1) MUST pass before any wave-2 domain begins. If it
cannot be made deterministic, HALT the milestone and escalate.
