# Tasks: m92-shrink-verdict (M92 D2 — move 2)

## Files Owned
- `bin/gsd-t-shrink-metric.cjs`
- `templates/workflows/gsd-t-verify.workflow.js`
- `test/m92-shrink-metric.test.js`
- `test/m92-verdict-vocabulary.test.js`

---

### M92-D2-T1 — `bin/gsd-t-shrink-metric.cjs` deterministic shrink-metric
**Touches**: `bin/gsd-t-shrink-metric.cjs`
**PseudoCode-Section**: (n/a)
Compute a deterministic leanness readout from a `git diff --stat` (or `--numstat`) envelope.
Input: either run `git diff --numstat <base>..<head>` itself (via a passed range) OR accept a
pre-captured numstat string (testable without a repo). Output:
`{filesAdded, filesRemoved, filesModified, insertions, deletions, netLoc, leaner}` where
`netLoc = insertions - deletions` and `leaner = netLoc <= 0` (a change that removed at least as
much as it added is "leaner"). Zero deps, never throws (bad input → exit 64), pure parsing of
numstat. CLI: `--numstat <path|->` (parse a captured numstat), `--range <base>..<head> --project-dir <p>` (compute live), `--json`.
**Acceptance criteria**: a known numstat with deletions>insertions → `leaner:true`, correct netLoc; insertions>deletions → `leaner:false`; file add/remove/modify counts correct; malformed numstat → exit 64, no throw; binary-file lines (`-\t-\t`) handled (counted as modified, 0 loc delta).
**Files**: `bin/gsd-t-shrink-metric.cjs`.
**Test**: M92-D2-T2.
**Headline**: true

### M92-D2-T2 — Killing test for the shrink-metric
**Touches**: `test/m92-shrink-metric.test.js`
**PseudoCode-Section**: (n/a)
Byte-known numstat fixtures (inline strings — no repo needed):
- a net-NEGATIVE diff (e.g. `2\t40\tfile.js` → +2/−40) → `leaner:true`, `netLoc:-38`;
- a net-POSITIVE diff → `leaner:false`, positive netLoc;
- a pure-deletion diff (file removed) → `filesRemoved:1`, `leaner:true`;
- a binary line `-\t-\tlogo.png` → counted, 0 loc contribution, no throw;
- malformed → exit 64 / error, no throw.
Deterministic, zero LLM.
**Acceptance criteria**: all five fixtures assert the exact `{netLoc, leaner, file counts}`; binary handled; malformed fail-closed.
**Files**: `test/m92-shrink-metric.test.js`.
**Test**: this IS the test.

### M92-D2-T3 — Add the `shrink` dimension to the verify verdict + synthesis
**Touches**: `templates/workflows/gsd-t-verify.workflow.js`
**PseudoCode-Section**: (n/a)
ADD (do NOT replace the `overallVerdict` enum) a `shrink` field to `VERDICT_SCHEMA`
(`{netLoc:number, leaner:boolean}`, optional/additive). Before synthesis, compute the metric
via the `runCli` inline helper calling `bin/gsd-t-shrink-metric.cjs --range <base>..HEAD` for the
milestone's diff (base = the milestone branch-point; if unavailable, skip with a logged reason —
never fabricate). Pass the result into the synthesis prompt so the verdict SURFACES leanness:
the synthesis reports `shrink` alongside `overallVerdict`, and a `leaner:true` change is explicitly
acknowledged as a SUCCESS dimension (not folded into pass/fail). M71 sandbox-clean (delegate the
git call to runCli's Bash — NO require/fs/child_process in the workflow); M85 tier literal for the
metric call = `haiku` (mechanical), consistent with the other deterministic-gate calls.
**Acceptance criteria**: `VERDICT_SCHEMA` gains an additive `shrink` field (existing enum untouched, existing tests green); the metric is computed via runCli (M71-clean) and surfaced in synthesis; absent base → logged skip-with-reason, never fabricated; M71 + M85 lints stay green.
**Files**: `templates/workflows/gsd-t-verify.workflow.js`.
**Test**: M92-D2-T4 + existing `test/m71-...lint`, `test/m85-...lint` (stay green).
**Headline**: true

### M92-D2-T4 — Verdict-vocabulary test (the keystone proof)
**Touches**: `test/m92-verdict-vocabulary.test.js`
**PseudoCode-Section**: (n/a)
Prove the schema can now SAY "smaller": (a) structural assertion that `VERDICT_SCHEMA` includes
the `shrink` field with `netLoc`+`leaner` (a schema that still can't express leanness FAILS — this
is the move's whole point, non-vacuous); (b) the existing `overallVerdict` enum is UNCHANGED
(additive-not-replace proof); (c) the workflow wires the shrink-metric via runCli before synthesis
(M71-clean, asserted structurally against the workflow source the same way M91's wiring test does).
**Acceptance criteria**: schema expresses leanness (`shrink.leaner`); enum untouched (additive); shrink-metric wired via runCli before synthesis (M71 sandbox-clean); a workflow that DROPPED the shrink wiring FAILS.
**Files**: `test/m92-verdict-vocabulary.test.js`.
**Test**: this IS the test.

---

**INTEGRATE-SEAM:** D2 owns `verify.workflow.js`, so at integrate D2's file ALSO reads D1's new arch-trigger envelope fields (`mode:"look"`/`lookDirective`) where verify already consumes `stopDirective` — done in D2's owned file, coordinated at integrate (no cross-domain file write).
