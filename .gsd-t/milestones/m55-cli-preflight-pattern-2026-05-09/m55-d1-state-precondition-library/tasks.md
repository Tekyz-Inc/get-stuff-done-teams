# Tasks: m55-d1-state-precondition-library

**Domain wave**: Wave 1 (parallel with D3 + D4)
**Depends on**: nothing internal — independent
**Depended on by**: D5 (Track 1 of verify-gate)

## T1 — Author `cli-preflight-contract.md` v1.0.0 STABLE

**Output**: `.gsd-t/contracts/cli-preflight-contract.md`
**Acceptance**: schemaVersion field rules, envelope shape (`{ ok, schemaVersion, checks: [{id, ok, severity, msg, details?}], notes: [] }`), severity model (`error` blocks; `warn`/`info` record), check-registry directory-scan idiom, captureSpawn-exemption note, deterministic-output rule, fail-soft-per-check rule.

## T2 — Implement `bin/cli-preflight.cjs` library + thin CLI

**Output**: `bin/cli-preflight.cjs` (library + `if (require.main === module)` CLI block)
**Acceptance**: zero deps; exports `runPreflight({projectDir, checks?, mode?})` returning the v1.0.0 envelope; CLI form supports `--project`, `--json`, `--text`; directory-scan registry of `bin/cli-preflight-checks/*.cjs`; sorted deterministic output; fail-soft on per-check throws (envelope still emits, check marked `ok:false` + note appended).

## T3 — Implement 6 built-in checks under `bin/cli-preflight-checks/`

**Output**: 6 files, one per check: `branch-guard.cjs`, `ports-free.cjs`, `deps-installed.cjs`, `contracts-stable.cjs`, `manifest-fresh.cjs`, `working-tree-state.cjs`.
**Acceptance**: each exports `{ id, severity, run({projectDir}) → { ok, msg, details? } }`. branch-guard reads project CLAUDE.md "Expected branch" line. ports-free uses `lsof -nP -iTCP:PORT -sTCP:LISTEN`. deps-installed compares `package-lock.json` mtime vs `package.json` mtime AND checks `node_modules/` exists. contracts-stable scans `.gsd-t/contracts/*.md` for DRAFT/PROPOSED markers when milestone past PARTITIONED. manifest-fresh compares `.gsd-t/journey-manifest.json` mtime vs every file under `e2e/journeys/`. working-tree-state runs `git status --porcelain` filtered against `dirtyTreeWhitelist` from `.gsd-t/.unattended/config.json`.

## T4 — Author `test/m55-d1-cli-preflight.test.js` + per-check fixture tests

**Output**: `test/m55-d1-cli-preflight.test.js` + `test/m55-d1-cli-preflight-checks/*.test.js` (one per check)
**Acceptance**: ≥1 happy + 1 fail path per check (12 minimum); envelope-shape tests (schemaVersion, sort-stability, fail-soft-on-throw); CLI integration test (`--json` returns parseable envelope, `--text` is human-readable). All tests use Node built-in test runner (`node --test`).

## T5 — Run full test suite; confirm zero regressions

**Output**: green `npm test` (D1 tests added, baseline 2262/2262 preserved)
**Acceptance**: `npm test` reports `2262 + N D1 / 2262 + N D1` pass; D1's added test count documented in commit message.

## T6 — Commit D1

**Output**: single commit `feat(m55-d1): cli-preflight library + 6 checks + contract STABLE`
**Acceptance**: Pre-Commit Gate passes (contract added, no shared-file edits, decision-log entry in progress.md, doc-ripple N/A for D1 since wire-in is D5's job per file-disjointness).

## D1 Checkpoint

After T1–T6: D1 ready for D5 to import. STABLE contract published. Notify supervisor for Wave 1 → Wave 2 gate (D5 needs D1 STABLE; D2 doesn't import D1).
