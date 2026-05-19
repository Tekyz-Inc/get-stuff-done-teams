# Domain: m57-d2-ci-command-parity

## Responsibility

Reproduce the project's *actual* CI build locally instead of assuming local
tsc/test parity. Auto-detect the CI config, run exactly those commands with
build caches cleared, and — when a `Dockerfile` is present — auto-run the real
`docker build`. This is the other half of the TimeTracking v1.10.12 failure:
~8 `noImplicitAny` regressions passed a warm-cache local `tsc` but failed CI's
cold build.

`runCiParity({projectDir, ...})` →
`{ ok: boolean, detectedSource: string, commands: [{cmd, exitCode, ok}], dockerBuilt: boolean, note?: string }`.

**Locked detection precedence (user decision — do NOT re-derive):**
1. `cloudbuild.yaml` → `steps[].args` (the real Cloud Build command sequence)
2. `.github/workflows/*.yml` → `jobs[].steps[].run`
3. `Dockerfile` → `RUN` lines
4. fallback → `package.json` `scripts` (`build`, `typecheck`, `test` if present)

**Cache clearing before running detected commands:** remove `*.tsbuildinfo`,
`node_modules/.cache`, tsc incremental artifacts — so a stale local cache cannot
mask a regression CI would catch.

**Docker:** `Dockerfile` present → auto-run `docker build` (presence is the
trigger; **no opt-in flag** — locked user decision). Absent → skip, record note.

## Owned Files/Directories

- `bin/gsd-t-ci-parity.cjs` — NEW. Detector + cache-clearer + command runner +
  optional docker build. Exports `runCiParity(...)`. CLI entry. Zero ext deps.
- `.gsd-t/contracts/ci-parity-contract.md` — NEW. Detection precedence, cache
  paths cleared, docker trigger rule, return envelope, exit codes.
- `test/m57-d2-ci-parity.test.js` — NEW. Unit tests incl. SC2 fixture
  (Dockerfile project + planted tsc strict regression a warm-cache local `tsc`
  would miss → real `docker build` fails → `ok:false`).
- `test/fixtures/m57-ci-parity/` — NEW. Synthetic fixtures: cloudbuild-driven,
  GHA-driven, Dockerfile-RUN-driven, package.json-fallback, planted-regression.

## Shared (sequenced at integrate — NOT written in parallel wave)

- `bin/gsd-t.js` — add `case "ci-parity":` dispatch (thin spawnSync, mirrors
  `verify-gate` at line ~4544) + global-bin propagation arrays. **Integrate.**
- `commands/gsd-t-verify.md` — add D2 check as a FAIL-blocking gate.
  **Integrate phase only** (D1 also edits this file).

## NOT Owned (do not modify)

- `bin/gsd-t-build-coverage.cjs` and its contract/tests/fixtures (D1)
- `bin/gsd-t-verify-gate.cjs`, `bin/cli-preflight.cjs` (M55, read-only ref)
- `templates/CLAUDE-global.md`, `GSD-T-README.md`, `README.md`,
  `commands/gsd-t-help.md` — doc-ripple at integrate, not in domain
