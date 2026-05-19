# Tasks: m52-d1-journey-coverage-tooling

## Summary
Build the mechanical journey-coverage layer: a regex-based listener detector, a `gsd-t check-coverage` CLI, a pre-commit gate hook, and the `bin/gsd-t.js` wiring that auto-installs the hook. When D1 lands, viewer-source commits with uncovered listeners are blocked at commit time.

## Tasks

### Task 1: `bin/journey-coverage.cjs` listener-detector module
- **Files**:
  - `bin/journey-coverage.cjs` (new)
  - `test/m52-d1-journey-coverage.test.js` (new)
- **Contract refs**: `journey-coverage-contract.md` §3 (listener-pattern catalogue), §4 (gap rules)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Exports `detectListeners(filepaths) → Listener[]`, `loadManifest(projectDir) → Manifest`, `findGaps(listeners, manifest) → Gap[]`, `formatReport(gaps) → string`.
  - Source-form walking only — regex + minimal string splitting; no `acorn`/`@babel/parser`/esprima imports (verify via `require` audit in test).
  - Recognises all 6 kinds in contract §3: `addEventListener`, `inline-handler`, `function-call`, `mutation-observer`, `hashchange`, `delegated`.
  - Selector canonical forms: `<id-or-classname>:<event>`, `window:<event>`, `<function-name>`, `mutation-observer:<unique-id>`.
  - Emits one `Listener` per match with `{file, line, selector, kind, raw}`.
  - Ignores `if (!el.addEventListener) return;` feature-detect guards and `// eslint-disable` exempt comments.
  - Ignores anything inside `e2e/viewer/*.spec.ts` (M50/M51 scope).
  - 15-case unit test covers: static `addEventListener`, inline `onclick`, inline `onkeydown`, `window.addEventListener('hashchange')`, MutationObserver instantiation, delegated `body.addEventListener('click', e => …)`, multiple events same id, eslint-disable exempt, feature-detect guard ignored, missing manifest path, stale manifest entry, fresh manifest no gaps, function-call without call site (ignored), nested addEventListener inside string literal (ignored), ignore-list for `e2e/viewer/`.
  - Speed: < 100ms on full viewer file set (assert in test via `process.hrtime`).

### Task 2: `journey-coverage-contract.md` flip to STABLE + manifest schema lock
- **Files**:
  - `.gsd-t/contracts/journey-coverage-contract.md` (edit)
- **Contract refs**: self
- **Dependencies**: Requires Task 1 (detector emits exactly the listener shapes the contract documents)
- **Acceptance criteria**:
  - Status field updated PROPOSED → STABLE.
  - Version bumped 0.1.0 → 1.0.0 once D1 task-1 detector matches the catalogue exactly.
  - `m52-integration-points.md` Checkpoint 1 sub-item "contract committed with Status: STABLE" satisfied.
  - REQ-M52-D1-CONTRACT row in `docs/requirements.md` flips planned → done.
  - No schema fields renamed mid-stream — contract is locked before D2 starts authoring.

### Task 3: `bin/journey-coverage-cli.cjs` + `gsd-t check-coverage` CLI surface
- **Files**:
  - `bin/journey-coverage-cli.cjs` (new)
  - `test/m52-d1-cli-integration.test.js` (new)
- **Contract refs**: `journey-coverage-contract.md` §5 (CLI surface)
- **Dependencies**: Requires Task 1
- **Acceptance criteria**:
  - Supports `--staged-only`, `--manifest PATH`, `--quiet` flags per contract §5.
  - Exit code 0 (covered, manifest fresh), 4 (gap or stale entry), 2 (manifest missing/unreadable — fail-closed).
  - Stdout (exit 0): silent in `--quiet` mode, otherwise one-line `OK: N listeners, N specs`.
  - Stderr (exit 4): `GAP: <file>:<line>  <selector>  (<kind>)  no spec covers this` and `STALE: spec=<name>  covers <file> selector=<selector>  no such listener`.
  - 4 integration tests: clean exit 0 (vacuous-pass empty manifest), gap exit 4 with formatted report, `--staged-only` mode (no staged viewer files = silent pass), custom-manifest-path `--manifest PATH` flag works.
  - Wired through `bin/gsd-t.js` `check-coverage` subcommand (covered in Task 5).

### Task 4: `scripts/hooks/pre-commit-journey-coverage` bash hook + integration test
- **Files**:
  - `scripts/hooks/pre-commit-journey-coverage` (new, mode 0755)
  - `test/m52-d1-pre-commit-hook.test.js` (new)
- **Contract refs**: `journey-coverage-contract.md` §6 (hook contract)
- **Dependencies**: Requires Task 3 (CLI must exist before hook can invoke it)
- **Acceptance criteria**:
  - `#!/usr/bin/env bash`, `set -e`, mode 0755 (assert via `fs.statSync.mode`).
  - Marker delimiter exactly `# >>> GSD-T journey-coverage gate >>>` … `# <<< GSD-T journey-coverage gate <<<`.
  - Runs `node bin/journey-coverage-cli.cjs --staged-only` only when staged-file pattern matches: `scripts/gsd-t-transcript.html`, `scripts/gsd-t-dashboard-server.js`, `bin/gsd-t-dashboard*.cjs`, or any file under `e2e/journeys/` or `e2e/viewer/`.
  - Silent pass when no viewer-source file staged.
  - Fail-open on detector internal exception (stderr warning, exit 0) — matches M50 `pre-commit-playwright-gate` precedent.
  - 6 integration tests: viewer file staged + gap → block (exit 4), viewer file staged + no gap → pass (exit 0), no viewer file staged → silent pass, missing manifest → fail-closed-with-hint (exit 2), idempotent install (run twice, only one marker block), marker round-trip (install → uninstall → install yields identical block).

### Task 5: `bin/gsd-t.js` wiring + Checkpoint 1 publication
- **Files**:
  - `bin/gsd-t.js` (additive edits — total < 50 lines)
  - `.gsd-t/contracts/m52-integration-points.md` (edit — flip Checkpoint 1 to PUBLISHED)
- **Contract refs**: `journey-coverage-contract.md` §7 (installation contract); `m52-integration-points.md` Checkpoint 1
- **Dependencies**: Requires Tasks 1, 2, 3, 4
- **Acceptance criteria**:
  - New constant `JOURNEY_COVERAGE_HOOK_MARKER` (~1 line).
  - New `installJourneyCoverageHook(projectDir)` (~30 lines, mirrors `installPlaywrightGateHook` line-for-line).
  - `installJourneyCoverageHook` called from `installHeartbeat` (or whichever installer phase mirrors M50 wiring) (~3 lines).
  - New `check-coverage` branch in CLI dispatch (~10 lines) — delegates to `bin/journey-coverage-cli.cjs`.
  - New `--install-journey-hook` branch in `checkDoctorProject` (~5 lines).
  - Idempotent: re-running `gsd-t install` or `gsd-t doctor --install-journey-hook` is a no-op when marker block is present.
  - Total addition < 50 lines (assert by diff).
  - `gsd-t check-coverage` returns exit 0 against an empty manifest (vacuous pass).
  - `gsd-t check-coverage --staged-only` runs cleanly when no viewer files are staged (silent pass).
  - `gsd-t doctor --install-journey-hook` installs the bash hook idempotently in `.git/hooks/pre-commit`.
  - `m52-integration-points.md` Checkpoint 1 flipped from PROPOSED → PUBLISHED with timestamp.
  - REQ-M52-D1-WIRING row in `docs/requirements.md` flips planned → done.

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other tasks within domain): 4 (Tasks 2–5 form a sequential chain)
- Estimated checkpoints: 1 (Checkpoint 1 — `m52-integration-points.md`, after Task 5)
