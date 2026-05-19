# Domain: m57-d1-build-coverage-check

## Responsibility

Detect new top-level paths added in a milestone's commit range that are NOT
referenced by any CI build artifact (Dockerfile `COPY`/`ADD`, `cloudbuild.yaml`
artifact/copy step, or `.github/workflows/*.yml` path). This is the exact
TimeTracking v1.10.12 failure class: a new `hooks/` directory was committed but
absent from the Dockerfile `COPY` directives, so Cloud Build shipped without it
while local verify reported VERIFIED.

`checkBuildCoverage({projectDir, baseRef, headRef})` →
`{ ok: boolean, missing: string[], checkedAgainst: string[], note?: string }`.

- `ok=false` + non-empty `missing[]` + process exit code **4** when a new
  top-level path is not covered by any detected CI artifact.
- `ok=true` when every new top-level path is referenced, OR when no CI artifacts
  exist at all (nothing to be inconsistent with — record `note`).

## Owned Files/Directories

- `bin/gsd-t-build-coverage.cjs` — NEW. The detector module + CLI entry.
  Exports `checkBuildCoverage(...)`. Zero external runtime deps (Node built-ins
  only, per repo zero-dep invariant). `git diff --name-only baseRef..headRef`
  to enumerate changed paths; collapse to distinct top-level segments; for each,
  grep the detected CI artifacts for a reference.
- `.gsd-t/contracts/cli-build-coverage-contract.md` — NEW. Schema for the return
  envelope, exit codes, CI-artifact reference rules, baseRef/headRef defaulting.
- `test/m57-d1-build-coverage.test.js` — NEW. Unit tests incl. SC1 fixture
  (new-dir-not-COPY'd → `missing[]` non-empty + exit 4).
- `test/fixtures/m57-build-coverage/` — NEW. Synthetic project fixtures
  (Docker+CloudBuild, GHA-only, no-CI) reproducing the TimeTracking pattern.

## Shared (sequenced at integrate — NOT written in parallel wave)

- `bin/gsd-t.js` — add `case "build-coverage":` dispatch (thin spawnSync to
  `bin/gsd-t-build-coverage.cjs`, mirrors `verify-gate` case at line ~4544) +
  add `gsd-t-build-coverage.cjs` to the two global-bin propagation arrays
  (~line 1184 and ~line 2485). **Integrate phase only.**
- `commands/gsd-t-verify.md` — add D1 check as a FAIL-blocking gate.
  **Integrate phase only** (D2 also edits this file).

## NOT Owned (do not modify)

- `bin/gsd-t-ci-parity.cjs` and its contract/tests/fixtures (D2)
- `bin/gsd-t-verify-gate.cjs`, `bin/cli-preflight.cjs` (M55, read-only reference)
- `templates/CLAUDE-global.md`, `GSD-T-README.md`, `README.md`,
  `commands/gsd-t-help.md` — doc-ripple at integrate, not in domain
