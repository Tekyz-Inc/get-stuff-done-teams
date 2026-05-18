# Domain: m52-d1-journey-coverage-tooling

## Responsibility

Build the **mechanical coverage layer** that prevents journey-spec drift. Walks
viewer source for interactive listeners (`addEventListener`, `onclick`,
`onkeydown`, `onchange`, `hashchange`, MutationObserver wiring), compares
detected handlers against the journey-spec manifest, and blocks commits when
viewer-source files are staged AND uncovered handlers exist.

This is the *enforcement* half of M52. D2 is the *content* half (the actual
journey specs + fixtures the enforcer measures against).

## Owned Files/Directories

- `bin/journey-coverage.cjs` — listener-detector module.
  - Exports: `detectListeners(filepaths) → Listener[]`,
    `loadManifest(projectDir) → Manifest`,
    `findGaps(listeners, manifest) → Gap[]`,
    `formatReport(gaps) → string`.
  - Recognises both static patterns (`el.addEventListener('click', …)`,
    `<button onclick="…">`) and dynamically-bound handlers
    (`window.addEventListener('hashchange', …)`,
    delegated `body.addEventListener('click', e => …)`).
  - Source-form-only walker (regex + minimal tree split). Zero runtime deps.
- `bin/journey-coverage-cli.cjs` — `gsd-t check-coverage` subcommand
  entrypoint. Returns exit code 0 (covered) or 4 (gaps found).
- `scripts/hooks/pre-commit-journey-coverage` — bash hook (mode 0755,
  same shape as `pre-commit-playwright-gate`). Runs only when
  `git diff --cached --name-only` includes `scripts/gsd-t-transcript.html`,
  `scripts/gsd-t-dashboard-server.js`, `bin/gsd-t-dashboard.cjs`, or any file
  under `e2e/journeys/` or `e2e/viewer/`. Invokes
  `node bin/journey-coverage-cli.cjs --staged-only`. Block delimiter:
  `# >>> GSD-T journey-coverage gate >>>` … `# <<< GSD-T journey-coverage gate <<<`.
- `.gsd-t/contracts/journey-coverage-contract.md` — machine-readable
  manifest schema + listener-pattern catalogue + gap rules + exit codes.
- `test/m52-d1-journey-coverage.test.js` — listener-detector unit tests
  (~15 cases: static handlers, delegated handlers, JSX-style handlers,
  hashchange, MutationObserver, ignore-list for test fixtures).
- `test/m52-d1-pre-commit-hook.test.js` — hook integration tests
  (~6 cases: viewer file staged + gap → block, viewer file staged + no gap →
  pass, no viewer file staged → silent pass, missing manifest →
  fail-closed-with-hint, idempotent install, marker round-trip).
- `test/m52-d1-cli-integration.test.js` — `gsd-t check-coverage` CLI
  surface (~4 cases: clean exit 0, gap exit 4 with formatted report,
  `--staged-only` mode, custom-manifest-path flag).

### Touches in `bin/gsd-t.js` (shared file — checkpoint-gated)

D1 adds **only**:
- `installJourneyCoverageHook(projectDir)` (~30 lines, mirrors
  `installPlaywrightGateHook`).
- `check-coverage` command branch in CLI dispatch (~10 lines).
- One `JOURNEY_COVERAGE_HOOK_MARKER` constant (~1 line).
- One `installJourneyCoverageHook(dest)` call inside `installHeartbeat`
  (or whichever installer phase mirrors M50's wiring) (~3 lines).
- One `--install-journey-hook` branch in `checkDoctorProject` (~5 lines).

Total: < 50 lines, all additive, no rewrite of existing M50 wiring. **D1 must
land its `bin/gsd-t.js` edits BEFORE D2 begins** so D2 can rely on
`gsd-t check-coverage` existing for its own CI assertion.

## NOT Owned (do not modify)

- `e2e/journeys/*.spec.ts` — D2 owns. (D1 only *detects gaps* against the
  manifest; D1 never writes or edits a spec.)
- `e2e/fixtures/journeys/*.ndjson` — D2 owns.
- `e2e/viewer/*.spec.ts` — pre-existing M50/M51 specs; off-limits.
- `scripts/gsd-t-transcript.html` — read-only target of the detector.
- `scripts/gsd-t-dashboard-server.js` — read-only target of the detector.
- Production viewer/server runtime code — M52 ships zero production-code
  changes. If the detector reveals a real bug, file as backlog and stop.

## Public API (what D2 consumes)

D2 consumes D1 only at the contract boundary:

1. **The manifest format** (`.gsd-t/journey-manifest.json`) defined in
   `.gsd-t/contracts/journey-coverage-contract.md`. D2 writes one entry per
   journey spec.
2. **The CLI shape**: `gsd-t check-coverage [--staged-only] [--manifest PATH]`
   exits 0 on covered, exits 4 on gaps with a structured stderr report.
3. **The `installJourneyCoverageHook` installer** runs as part of
   `gsd-t install` and `gsd-t doctor --install-hooks`.
