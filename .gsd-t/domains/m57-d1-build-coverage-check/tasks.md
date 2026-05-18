# Tasks: m57-d1-build-coverage-check

## Summary

When all tasks complete, `bin/gsd-t-build-coverage.cjs` exports
`checkBuildCoverage({projectDir, baseRef, headRef})` and runs as
`gsd-t build-coverage`, flagging any new top-level path in a milestone commit
range that no CI build artifact references — with a STABLE contract and a test
suite proving SC1 (the TimeTracking `hooks/`-not-COPY'd failure class).

## Files Owned

- bin/gsd-t-build-coverage.cjs
- .gsd-t/contracts/cli-build-coverage-contract.md
- test/m57-d1-build-coverage.test.js
- test/fixtures/m57-build-coverage/**

## Tasks

### M57-D1-T1 — Synthetic fixtures reproducing the TimeTracking failure class
- **Touches**: `test/fixtures/m57-build-coverage/**`
- **Files**: `test/fixtures/m57-build-coverage/docker-cloudbuild/` (Dockerfile with explicit `COPY src/ ./src/` + cloudbuild.yaml, plus an uncovered `hooks/` dir), `test/fixtures/m57-build-coverage/gha-only/` (`.github/workflows/ci.yml`), `test/fixtures/m57-build-coverage/no-ci/` (no CI artifacts), `test/fixtures/m57-build-coverage/copy-dot/` (Dockerfile `COPY . .`)
- **Contract refs**: cli-build-coverage-contract.md (Detection Rules, SC1)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `docker-cloudbuild/` fixture: Dockerfile `COPY` directives reference `src/` but NOT `hooks/`; a `hooks/` dir exists — reproduces SC1 exactly
  - `copy-dot/` fixture: Dockerfile contains `COPY . .` → must resolve as "everything covered"
  - `gha-only/` fixture: workflow yml references some paths, omits one
  - `no-ci/` fixture: no Dockerfile/cloudbuild/workflows present
  - Fixtures are static files (no git needed) consumable by the detector via an injectable path/diff list — see T2 acceptance for the seam

### M57-D1-T2 — checkBuildCoverage detector + CI-artifact parsers
- **Touches**: `bin/gsd-t-build-coverage.cjs`
- **Files**: `bin/gsd-t-build-coverage.cjs` (module export only — no CLI entry yet)
- **Contract refs**: cli-build-coverage-contract.md (API, Detection Rules, Defensive Behavior)
- **Dependencies**: Requires M57-D1-T1 (fixtures to test against)
- **Acceptance criteria**:
  - `checkBuildCoverage({projectDir, baseRef, headRef})` returns `{ok, missing, checkedAgainst, newPaths, note?}` exactly per contract
  - New-path enumeration: `git diff --name-only baseRef..headRef` collapsed to distinct top-level segments; default range `HEAD~1..HEAD` when refs omitted
  - Dockerfile parser: line-based `COPY`/`ADD` scan; `COPY . .` / `ADD . .` ⇒ all covered; handles `COPY --from=` multi-stage
  - cloudbuild.yaml parser: line/regex scan of `steps[].args` + artifact/copy paths (no YAML lib)
  - `.github/workflows/*.yml` parser: path-substring scan across all workflow files (no YAML lib)
  - Defensive: no git repo / detached HEAD / identical refs → throws a typed/usage error (caught by CLI in T3); no CI artifacts → `ok:true` + `note`; empty diff → `ok:true`, `newPaths:[]`
  - Zero external runtime deps (Node built-ins only); functions <30 lines where practical; `'use strict';` + contract-naming header docblock

### M57-D1-T3 — CLI entry + exit codes
- **Touches**: `bin/gsd-t-build-coverage.cjs`
- **Files**: `bin/gsd-t-build-coverage.cjs` (add `require.main === module` self-invoke)
- **Contract refs**: cli-build-coverage-contract.md (Exit Codes)
- **Dependencies**: Requires M57-D1-T2 (within domain)
- **Acceptance criteria**:
  - `if (require.main === module)` parses argv (`--json`, optional `--base`/`--head`, default `projectDir=cwd`)
  - Exit **0** when `ok:true`; exit **4** when `ok:false` (`missing[]` non-empty); exit **2** on usage error (bad refs / not a git repo)
  - `--json` prints the full envelope; non-`--json` prints a human one-liner summary
  - Exit-code convention matches `bin/journey-coverage-cli.cjs` (0/4/2)

### M57-D1-T4 — Unit tests incl. SC1 binding
- **Touches**: `test/m57-d1-build-coverage.test.js`
- **Files**: `test/m57-d1-build-coverage.test.js`
- **Contract refs**: cli-build-coverage-contract.md (Success Criterion Binding)
- **Dependencies**: Requires M57-D1-T2, M57-D1-T3 (within domain)
- **Acceptance criteria**:
  - **SC1 test**: `docker-cloudbuild` fixture → `ok:false`, `missing` includes `"hooks"`; CLI subprocess exits 4
  - `copy-dot` fixture → `ok:true` (COPY . . covers everything)
  - `no-ci` fixture → `ok:true`, `note` set, exit 0
  - empty-diff path → `ok:true`, `newPaths:[]`
  - usage error (bad ref) → exit 2
  - gha-only fixture → uncovered path flagged in `missing`
  - All tests use Node built-in test runner (`node --test`); zero new deps; full suite stays green (baseline 2547 + new D1 tests)

### M57-D1-T5 — Contract flip DRAFT → STABLE
- **Touches**: `.gsd-t/contracts/cli-build-coverage-contract.md`
- **Files**: `.gsd-t/contracts/cli-build-coverage-contract.md`
- **Contract refs**: self
- **Dependencies**: Requires M57-D1-T4 (tests prove the contract holds)
- **Acceptance criteria**:
  - `Status: DRAFT` → `STABLE`, `Version: 0.1.0` → `1.0.0`
  - Any API/behavior detail discovered during T2-T4 that diverged from the DRAFT is reconciled into the contract (contract and code must agree)
  - Flip happens only after T4 tests are green

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 1 (T1)
- Blocked tasks (intra-domain ordering only): 4 (T2→T1, T3→T2, T4→T2/T3, T5→T4)
- Cross-domain blockers: 0 (file-disjoint from D2)
- Estimated checkpoints: 1 (C1 — D1 execute clean → integrate wire-in)
