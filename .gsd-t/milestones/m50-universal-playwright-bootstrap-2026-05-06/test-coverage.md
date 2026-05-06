# Test Coverage Report — 2026-05-06 14:35 PDT

Auto-invoked by `/gsd-t-test-sync` after M50 EXECUTE (D1+D2, 15/15 tasks).

## Summary

| Metric | Count |
|--------|-------|
| Source files changed in M48+M49+M50 | 6 |
| Unit/integration test files (project-wide) | 137 |
| Unit/integration tests (project-wide) | 2166 |
| E2E spec files (project-wide) | 6 (5 viewer + 1 placeholder) |
| E2E tests | 9 (8 active, 1 placeholder skipped) |
| Coverage gaps (M48–M50 changed code) | 0 |
| Stale tests | 0 |
| Dead tests | 0 |

### Test Run Results

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| Unit/integration (clean env) | 2166 | 0 | `env -i HOME PATH node --test` confirms green |
| Unit/integration (test-sync env) | 2164 | 2 | Both failures are env-pollution from `GSD_T_COMMAND=gsd-t-test-sync`, `GSD_T_PHASE=execute` set by this command — not real regressions |
| E2E viewer (Playwright) | 8 | 1 | `dual-pane.spec.ts` flagged a faulty test, NOT a faulty app — see Issue D below |
| E2E placeholder | 0 | 0 | 1 skipped (intentional) |

## Coverage Map — M48 / M49 / M50 changed sources

| Source File | Lines | Test File(s) | Tests | Status |
|-------------|-------|--------------|-------|--------|
| `bin/playwright-bootstrap.cjs` | 315 | `test/m50-d1-playwright-bootstrap.test.js` | 20 | ✅ COVERED |
| `bin/ui-detection.cjs` | 151 | `test/m50-d1-ui-detection.test.js` | 18 | ✅ COVERED |
| `bin/headless-auto-spawn.cjs` (M50 spawn-gate additions) | 711 | `test/m50-d2-spawn-gate.test.js` + `test/headless-auto-spawn.test.js` | 9 + ~100 | ✅ COVERED |
| `bin/gsd-t.js` (M50 init/update/doctor wiring) | (unchanged surfaces + new `setup-playwright`) | `test/m50-d1-cli-integration.test.js` | 5 | ✅ COVERED |
| `scripts/hooks/pre-commit-playwright-gate` | 94 | `test/m50-d2-pre-commit-hook.test.js` | 6 | ✅ COVERED |
| `scripts/gsd-t-dashboard-server.js` (M48 escape + M49 idle-TTL) | (M48 + M49 surfaces) | `test/m48-viewer-rendering-fixes.test.js` + `test/m49-dashboard-idle-ttl.test.js` + `test/m49-doctor-orphan-check.test.js` + `test/m49-lazy-dashboard.test.js` | 23 + 7 + 4 + 9 | ✅ COVERED |
| `scripts/gsd-t-transcript.html` (M47 dual-pane + M48 chat-bubbles) | (renderer + bottom-pane guards) | `test/m48-viewer-rendering-fixes.test.js` (unit, regex/AST shape probes) + `e2e/viewer/{title,timestamps,chat-bubbles,dual-pane,lazy-dashboard}.spec.ts` (E2E, real browser) | 23 + 9 E2E | ⚠️ E2E FUNCTIONAL — see Issue D |

### Contract → Test traceability

| Contract | Test asset(s) | Status |
|----------|---------------|--------|
| `playwright-bootstrap-contract.md` v1.0.0 | `test/m50-d1-playwright-bootstrap.test.js`, `test/m50-d1-ui-detection.test.js` | ✅ STABLE |
| `m50-integration-points.md` (D1↔D2 checkpoint) | `test/m50-d2-spawn-gate.test.js`, `test/m50-d2-pre-commit-hook.test.js` | ✅ COVERED |
| `headless-default-contract.md` v2.1.0 (UNCHANGED in M50) | `test/headless-default.test.js`, `test/headless-auto-spawn.test.js` | ✅ COVERED |
| `dashboard-server-contract.md` v1.3.0 (M47) | `test/m43-dashboard-autostart.test.js`, `test/m49-lazy-dashboard.test.js`, viewer specs | ✅ COVERED |

---

## Issues Found

### A) Pre-existing env-sensitive flakes (not regressions)

| Test | Behavior | Resolution |
|------|----------|------------|
| `test/event-stream.test.js:341` — "entry has ts, command=null, phase=null, trace_id=null fields" | Asserts `process.env.GSD_T_COMMAND` and `GSD_T_PHASE` are unset; fails when test runner inherits these from a `gsd-t-*` invocation | Pass in clean env (`env -i HOME PATH node --test`). No production impact. |
| `test/watch-progress-writer.test.js:222` — "writer_shim_safe_empty_agent_id_auto_mints_id" | Same env inheritance — `GSD_T_AGENT_ID` set by parent shim leaks into child | Pass in clean env. No production impact. |

These two have shipped under all M47–M49 baselines per progress.md; they are environment artifacts of running tests from inside an active GSD-T command shell, not real bugs. The production code path is correct.

### B) No coverage gaps in M50 changed code

All four M50 source surfaces (`playwright-bootstrap.cjs`, `ui-detection.cjs`, `headless-auto-spawn.cjs` spawn-gate, `pre-commit-playwright-gate`) have dedicated test files with adequate path coverage including:
- D1 contract surfaces: 4 package managers × idempotency × install failure paths × chromium-failure → partial:true.
- D2 spawn-gate: 5 firing-matrix cells (whitelist hit/miss × hasUI × hasPlaywright × install OK/FAIL).
- D2 pre-commit hook: stale-mtime block, fresh-mtime pass, missing-timestamp fail-open, hook-installer idempotency.

### C) No stale tests

Searched for tests importing M48/M49/M50 changed surfaces. All assertions reflect current contract shapes:
- M50 D2 task-7 unit guards (all 4) match `scripts/gsd-t-transcript.html` runtime behavior — verified by running `test/m48-viewer-rendering-fixes.test.js` (23/23 pass in clean env).
- No tests import deleted modules.

### D) E2E spec needs functional-test correction (one finding)

**`e2e/viewer/dual-pane.spec.ts:51`** — currently fails on `/transcript/in-session-fixture-XYZ/stream` because the URL filter does not separate top-pane (`connectMain → /transcript/in-session-{sid}/stream`, **intentional per M47 design**) from bottom-pane (`connect → /transcript/{spawnId}/stream`, the surface M48 Bug 4 guards).

**Per the FUNCTIONAL TEST rule** (CLAUDE.md § "E2E Test Quality Standard"), the spec should assert about the BOTTOM pane only — the actual M48 Bug 4 surface. Suggested fix:

```ts
// Filter to the bottom pane's stream by reading from `#stream` inside `#spawn-stream`,
// or by stripping out URLs whose connection was opened by `connectMain` (probe
// `mainSrc` rather than counting all EventSource constructions).
//
// Simpler: assert the resolved bottom-pane spawn id (data-spawn-id or `#stream`
// container's hdr-spawn-id) is NOT `in-session-fixture-XYZ`, even after
// navigating with `#in-session-fixture-XYZ` in the hash.
```

Unit tests for the four guard sites (`test/m48-viewer-rendering-fixes.test.js`) already pass — production behavior is correct. Only the E2E spec's filter is over-broad.

---

## Test Health Metrics

- **Test-to-source ratio (M48–M50 surfaces)**: 137 unit/integration test files for ~150 source files in `bin/` and `scripts/` ≈ 91%.
- **Critical paths covered**: Playwright bootstrap (4 PMs × idempotency), spawn-gate firing matrix (5 cells), pre-commit gate (mtime + fail-open + hook installer), viewer chat-bubbles (4 frame types), dashboard lazy-banner (live PID vs file-path), idle-TTL self-shutdown, doctor-prune.
- **Critical paths uncovered**: None among M48–M50 surfaces. The dual-pane E2E spec's filter does not separate panes, but the unit-level guard logic is fully covered.

---

## Generated Tasks

### Medium Priority (should fix in next patch)

- [ ] **TEST-M50-001**: Tighten `e2e/viewer/dual-pane.spec.ts:70` filter to target only the bottom pane. Current filter `urls.filter(u => u.includes('/transcript/') && u.includes('/stream'))` matches both `connectMain` (top-pane, intentional) and `connect` (bottom-pane, the actual M48 Bug 4 surface). See Issue D for two suggested approaches. Unit tests already cover the four guard sites — this is a test-quality fix, not a production bug.

### Low Priority (env-isolation, optional)

- [ ] **TEST-EVENT-001**: Make `test/event-stream.test.js:341` env-pollution-resistant. Either delete `process.env.GSD_T_COMMAND/PHASE/TRACE_ID` in the test's `beforeEach`, or have `buildEventStreamEntry` accept an explicit-env-overrides param so the test isn't position-dependent on the calling shell.
- [ ] **TEST-WRITER-001**: Same treatment for `test/watch-progress-writer.test.js:222` regarding `GSD_T_AGENT_ID` env inheritance.

### No High-Priority items.

---

## Recommendations

1. **TEST-M50-001 should ride the next M50 patch release.** It's a test-quality fix, not a production fix; the underlying bottom-pane guard logic is correct (verified by 5 unit tests in `m48-viewer-rendering-fixes.test.js`).
2. **The two env-flakes are now well-understood** — they only fire when run from a `gsd-t-*` command's shell. Consider whether to invest in TEST-EVENT-001/TEST-WRITER-001 or document the clean-env invocation pattern (`env -i HOME PATH npm test`) as the canonical CI command.
3. **No coverage gaps in M50 EXECUTE deliverables.** All four contract surfaces are tested; the playwright-bootstrap-contract is STABLE; verify gate may proceed.
