# Tasks: m55-d4-context-brief-generator

**Domain wave**: Wave 1 (parallel with D1 + D3)
**Depends on**: nothing internal — independent
**Depended on by**: D5 (wires brief into commands + subagent protocols)

## T1 — Author `context-brief-contract.md` v1.0.0 STABLE

**Output**: `.gsd-t/contracts/context-brief-contract.md`
**Acceptance**: schema, freshness rules (mtime hash-stamp invalidation), fail-open default vs `--strict` fail-closed, idempotent-join rule (byte-identical output for same inputs), kind registry shape, ≤2k size budget per brief, allowed CLI summarization patterns, captureSpawn-exemption note.

## T2 — Implement `bin/gsd-t-context-brief.cjs` library + thin CLI

**Output**: `bin/gsd-t-context-brief.cjs`
**Acceptance**: zero deps; exports `generateBrief({projectDir, kind, domain, spawnId})`; CLI form `gsd-t brief --kind X --domain Y --json` (stdout) or `--out path` (file); registry is directory-scan of `bin/gsd-t-context-brief-kinds/*.cjs`; deterministic-output (sorted arrays, stable keys); fail-open on missing optional source (null field), structured error on missing required source.

## T3 — Implement 6 kind collectors under `bin/gsd-t-context-brief-kinds/`

**Output**: 6 files: `execute.cjs`, `verify.cjs`, `qa.cjs`, `red-team.cjs`, `design-verify.cjs`, `scan.cjs`
**Acceptance**: each exports `{ name, collect(ctx) }` returning a kind-specific object that fits inside the ≤2k brief budget. execute pulls domain scope/constraints/contracts/files-owned/branch/expected-outputs. verify pulls verify-gate plan + prior results + contract DRAFT/STABLE state + success criteria. qa pulls qa protocol path + test runner detection + qa-issues. red-team pulls protocol + recent commits + attack vector seeds. design-verify pulls design contract path(s) + Figma URL(s) + screenshot manifest. scan pulls repo file inventory hash + prior scan output mtime + exclusions.

## T4 — Author `test/m55-d4-context-brief.test.js` + per-kind fixture tests

**Output**: `test/m55-d4-context-brief.test.js` + `test/m55-d4-context-brief-kinds/*.test.js` (one per kind)
**Acceptance**: kind-dispatch test, freshness-invalidation test (mutate source mtime → brief stale), schema-version test, idempotent-join test (run twice → byte-identical), fail-open test (missing optional source → null field), per-kind happy-path test (mini repo fixture → expected brief shape).

## T5 — Add `.gsd-t/briefs/` to `.gitignore`

**Output**: `.gitignore` additive line: `.gsd-t/briefs/`
**Acceptance**: line present; existing `.gitignore` entries preserved.

## T6 — Run full test suite; confirm zero regressions

**Output**: green `npm test`
**Acceptance**: baseline 2262/2262 preserved + D4 tests added.

## T7 — Commit D4

**Output**: single commit `feat(m55-d4): context-brief generator + 6 kinds + contract STABLE`
**Acceptance**: Pre-Commit Gate passes; `.gitignore` updated; brief library + 6 kinds + contract committed.

## D4 Checkpoint

After T1–T7: D4 ready for D5 to wire. STABLE contract published. Wave 1 contribution complete.
