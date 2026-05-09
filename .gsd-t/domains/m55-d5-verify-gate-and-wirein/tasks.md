# Tasks: m55-d5-verify-gate-and-wirein

**Domain wave**: Wave 3 (last — depends on D1, D2, D4; defensive on D3)
**Depends on**: D1 envelope + D2 substrate API + D4 brief library; D3's `.gsd-t/ratelimit-map.json` consumed defensively
**Depended on by**: M55 milestone integrate + verify + complete

## T1 — Author `verify-gate-contract.md` v1.0.0 STABLE

**Output**: `.gsd-t/contracts/verify-gate-contract.md`
**Acceptance**: envelope schema (`{ ok, schemaVersion, track1, track2, llmJudgePromptHint }`); two-track hard-fail rule (BOTH must pass for `ok:true`); 500-token summary discipline; head-and-tail snippet rule per worker; raw-output retention path (`.gsd-t/verify-gate/{runId}/`); idempotent-rerun rule (same inputs → byte-identical track1/track2 results, modulo `meta.timestamps`).

## T2 — Author wire-in assertion tests (TDD shape — land BEFORE implementation)

**Output**: 3 test files
- `test/m55-d5-wire-in-execute.test.js` — asserts `commands/gsd-t-execute.md` Step 1 includes preflight + brief invocation block
- `test/m55-d5-wire-in-verify.test.js` — asserts `commands/gsd-t-verify.md` Step 2 includes verify-gate invocation block
- `test/m55-d5-subagent-prompts.test.js` — asserts all 3 subagent protocols include "check the brief first" hard rule
**Acceptance**: tests FAIL initially (red); will pass after T7–T9 edits land (green).

## T3 — Implement `bin/gsd-t-verify-gate.cjs`

**Output**: `bin/gsd-t-verify-gate.cjs`
**Acceptance**: imports D1's `runPreflight`, D2's `runParallel`, D4's `generateBrief`; runs Track 1 (preflight) + Track 2 (parallel CLIs: tsc, biome/ruff, test runner, knip, gitleaks, lizard); summarizes worker stdout/stderr to head-and-tail snippets ≤500 tokens total; returns the v1.0.0 envelope. CLI form: `gsd-t verify-gate --json`. Defensive on missing `.gsd-t/ratelimit-map.json` (warn + use `maxConcurrency=2`).

## T4 — Implement `bin/gsd-t-verify-gate-judge.cjs`

**Output**: `bin/gsd-t-verify-gate-judge.cjs`
**Acceptance**: takes verify-gate envelope JSON in, produces ≤500-token LLM prompt scaffold; testable in isolation (T6 test).

## T5 — Author `test/m55-d5-verify-gate.test.js`

**Output**: unit tests for the verify-gate library
**Acceptance**: Track-1-hard-fail test (preflight `ok:false` → gate `ok:false` regardless of Track 2), Track-2-fan-out test (mock D2's `runParallel`, assert plan), summary-truncation test (≤500-token head-and-tail), schema-version test, defensive-on-missing-map test (warn + maxConcurrency=2), idempotent-rerun test.

## T6 — Author `test/m55-d5-verify-gate-judge.test.js`

**Output**: judge prompt size budget test
**Acceptance**: judge prompt always ≤500 tokens regardless of input envelope size.

## T7 — Wire-in: edit `bin/gsd-t.js` (3 dispatch subcommands + GLOBAL_BIN_TOOLS)

**Output**: `bin/gsd-t.js` additive edits
**Acceptance**: `gsd-t preflight` dispatches to `bin/cli-preflight.cjs`; `gsd-t brief` dispatches to `bin/gsd-t-context-brief.cjs`; `gsd-t verify-gate` dispatches to `bin/gsd-t-verify-gate.cjs`. All 3 entries added to `GLOBAL_BIN_TOOLS` array per `project_global_bin_propagation_gap.md`. `gsd-t doctor` reports the new tools.

## T8 — Wire-in: additive Step 1 block in `commands/gsd-t-execute.md`

**Output**: `commands/gsd-t-execute.md` additive
**Acceptance**: Step 1 block appended (NOT replacing existing Step 1 prose) instructing orchestrator to run `gsd-t preflight` (hard-fail on non-`ok`) and `gsd-t brief --kind execute --domain X --out .gsd-t/briefs/{spawnId}.json`; workers receive `BRIEF_PATH` in their prompt scaffold. Test T2 (m55-d5-wire-in-execute) now passes.

## T9 — Wire-in: additive Step 2 block in `commands/gsd-t-verify.md`

**Output**: `commands/gsd-t-verify.md` additive
**Acceptance**: Step 2 block appended invoking `gsd-t verify-gate --json`; summary piped to LLM judge per `bin/gsd-t-verify-gate-judge.cjs`. Test T2 (m55-d5-wire-in-verify) now passes.

## T10 — Wire-in: additive line in 3 subagent protocols

**Output**: additive lines in `templates/prompts/qa-subagent.md`, `red-team-subagent.md`, `design-verify-subagent.md`
**Acceptance**: each protocol gets the line "If you're about to grep/read/run-test, check the brief first at $BRIEF_PATH." inserted near the protocol's preamble. Test T2 (m55-d5-subagent-prompts) now passes.

## T11 — Author 3 e2e journey specs (success-criterion-3 evidence)

**Output**:
- `e2e/journeys/verify-gate-blocks-wrong-branch.spec.ts`
- `e2e/journeys/verify-gate-blocks-port-conflict.spec.ts`
- `e2e/journeys/verify-gate-blocks-contract-draft.spec.ts`
**Acceptance**: each spec stages a synthetic project state matching its name's failure class, runs `gsd-t verify-gate`, asserts `ok:false` with the expected check id in `track1.checks[]`. All 3 added to `.gsd-t/journey-manifest.json`.

## T12 — Doc ripple: architecture, requirements, project CLAUDE, help, GSD-T-README, CLAUDE-global template

**Output**: edits to:
- `docs/architecture.md` — new "CLI-Preflight Pattern" section
- `docs/requirements.md` — REQ-M55-D1, REQ-M55-D2, REQ-M55-D3, REQ-M55-D4, REQ-M55-D5 entries
- `CLAUDE.md` (project) — "Mandatory Preflight Before Spawn" + "Brief-First Worker Rule" sections
- `commands/gsd-t-help.md` — 3 new entries (preflight, brief, verify-gate)
- `GSD-T-README.md` — workflow diagram + CLI table updated
- `templates/CLAUDE-global.md` — preflight/brief/verify-gate documentation block
**Acceptance**: all 6 files edited in a single commit (Document Ripple Completion Gate).

## T13 — Pre-Commit Gate update

**Output**: `~/.claude/CLAUDE.md` Pre-Commit Gate addition: "Brief regenerated if preflight inputs changed"
**Acceptance**: line added; uses `bin/gsd-t-context-brief.cjs` as the detection tool.

## T14 — Run full test suite; confirm zero regressions

**Output**: green `npm test`
**Acceptance**: baseline 2262/2262 preserved + D5 tests added (4 new test files).

## T15 — Commit D5

**Output**: single commit `feat(m55-d5): verify-gate + full wire-in + doc ripple`
**Acceptance**: Pre-Commit Gate passes; ALL blast-radius files in one commit; all 3 contract STABLE flips confirmed (D1, D2, D5); decision-log entry in progress.md.

## D5 Checkpoint

After T1–T15: M55 engines + integration complete. Ready for Red Team adversarial QA → test-sync → integrate → verify (dogfoods D5) → measurement → complete-milestone. NOTE: tag/publish ONLY if all 8 falsifiable success criteria pass.
