# Tasks: m57-d2-ci-command-parity

## Summary

When all tasks complete, `bin/gsd-t-ci-parity.cjs` exports
`runCiParity({projectDir})` and runs as `gsd-t ci-parity`, auto-detecting the
project's real CI config (locked precedence), clearing build caches, running
exactly those commands, and auto-running `docker build` when a Dockerfile is
present — with a STABLE contract and tests proving SC2 (the TimeTracking
warm-cache-masked tsc-strict-regression failure class).

## Files Owned

- bin/gsd-t-ci-parity.cjs
- .gsd-t/contracts/ci-parity-contract.md
- test/m57-d2-ci-parity.test.js
- test/fixtures/m57-ci-parity/**

## Tasks

### M57-D2-T1 — Synthetic fixtures for each detection source + planted regression
- **Touches**: `test/fixtures/m57-ci-parity/**`
- **Files**: `test/fixtures/m57-ci-parity/cloudbuild/` (cloudbuild.yaml with `steps[].args`), `.../workflows/` (`.github/workflows/ci.yml` with `jobs[].steps[].run`), `.../dockerfile-run/` (Dockerfile with `RUN` lines, no cloudbuild/workflows), `.../pkg-fallback/` (only package.json scripts), `.../planted-regression/` (Dockerfile + a tsc strict `noImplicitAny` violation + a `.tsbuildinfo` that would mask it on a warm-cache local tsc)
- **Contract refs**: ci-parity-contract.md (Detection Precedence, SC2)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - One fixture per detection source so precedence ordering is independently testable
  - `planted-regression/` fixture reproduces SC2: a `noImplicitAny` violation that a warm-cache `tsc` (stale `.tsbuildinfo` present) would skip, but a cold/docker build catches
  - Fixtures runnable without network; docker-dependent assertions guarded so the suite still passes where no Docker daemon exists (see T4)
  - Commands in fixtures are fast no-ops where the test only asserts *detection* (not real compile), and real where the test asserts *regression catching*

### M57-D2-T2 — Detection + cache-clear + command runner
- **Touches**: `bin/gsd-t-ci-parity.cjs`
- **Files**: `bin/gsd-t-ci-parity.cjs` (module export only — docker step in T3)
- **Contract refs**: ci-parity-contract.md (API, Detection Precedence, Cache Clearing)
- **Dependencies**: Requires M57-D2-T1
- **Acceptance criteria**:
  - `runCiParity({projectDir, timeoutMs?})` returns `{ok, detectedSource, commands, dockerBuilt, dockerSkippedReason?, note?}` per contract
  - Detection precedence LOCKED + exact: cloudbuild.yaml → .github/workflows/*.yml → Dockerfile RUN → package.json scripts (build, typecheck, test in that order) → `none`
  - Parsers are minimal line/regex (no YAML lib); documented parse limits in docblock + contract (first job's steps for workflows; args joined w/ spaces for cloudbuild)
  - Cache-clear runs BEFORE detected commands: removes `*.tsbuildinfo`, `node_modules/.cache`, best-effort tsc `outDir`/`tsBuildInfoFile` from `tsconfig*.json`
  - Each command spawned with a bounded timeout, output captured; any non-zero exit → that command `ok:false` → envelope `ok:false`
  - none-detected + no package scripts → `ok:true`, `detectedSource:'none'`, `note` set
  - Zero ext deps; functions <30 lines where practical; `'use strict';` + contract-naming header docblock

### M57-D2-T3 — Auto docker build (presence-triggered, no flag)
- **Touches**: `bin/gsd-t-ci-parity.cjs`
- **Files**: `bin/gsd-t-ci-parity.cjs`
- **Contract refs**: ci-parity-contract.md (Docker Trigger)
- **Dependencies**: Requires M57-D2-T2 (within domain)
- **Acceptance criteria**:
  - `Dockerfile` present → real `docker build` runs (bounded timeout, output captured); build failing → envelope `ok:false`; `dockerBuilt:true`
  - `Dockerfile` absent → `dockerBuilt:false`, `dockerSkippedReason:'no-dockerfile'`, NOT a failure
  - `docker` binary missing → `dockerBuilt:false`, `dockerSkippedReason:'docker-unavailable'`, NOT a hard failure
  - No opt-in flag anywhere — presence of Dockerfile is the sole trigger (locked decision)

### M57-D2-T4 — CLI entry + exit codes + unit tests incl. SC2 binding
- **Touches**: `bin/gsd-t-ci-parity.cjs`, `test/m57-d2-ci-parity.test.js`
- **Files**: `bin/gsd-t-ci-parity.cjs` (add `require.main === module`), `test/m57-d2-ci-parity.test.js`
- **Contract refs**: ci-parity-contract.md (Exit Codes, Success Criterion Binding)
- **Dependencies**: Requires M57-D2-T2, M57-D2-T3 (within domain)
- **Acceptance criteria**:
  - CLI: `require.main === module`, `--json` envelope output, exit **0** `ok:true` / **4** `ok:false` / **2** usage error (matches D1 + journey-CLI convention)
  - Detection-precedence tests: each fixture resolves to the expected `detectedSource`
  - Cache-clear test: a stale `.tsbuildinfo` is removed before commands run (assert file gone or compile not skipped)
  - **SC2 test**: `planted-regression` fixture with a Dockerfile → docker build runs and fails on the planted tsc strict regression → `ok:false`, exit 4. Test self-skips with a clear message when no Docker daemon is available (so suite stays green on Docker-less hosts) but asserts the cache-clear+detection path unconditionally
  - `no-dockerfile` / `docker-unavailable` paths assert non-failure
  - Node built-in test runner; zero new deps; full suite stays green (baseline 2547 + new D2 tests)

### M57-D2-T5 — Contract flip DRAFT → STABLE
- **Touches**: `.gsd-t/contracts/ci-parity-contract.md`
- **Files**: `.gsd-t/contracts/ci-parity-contract.md`
- **Contract refs**: self
- **Dependencies**: Requires M57-D2-T4
- **Acceptance criteria**:
  - `Status: DRAFT` → `STABLE`, `Version: 0.1.0` → `1.0.0`
  - Any divergence discovered during T2-T4 reconciled into the contract (code and contract must agree)
  - Flip only after T4 tests green

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 1 (T1)
- Blocked tasks (intra-domain ordering only): 4 (T2→T1, T3→T2, T4→T2/T3, T5→T4)
- Cross-domain blockers: 0 (file-disjoint from D1)
- Estimated checkpoints: 1 (C2 — D2 execute clean → integrate wire-in)
