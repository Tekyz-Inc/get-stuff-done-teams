# Tasks: m44-d2-parallel-cli

## Wave 3 — Integration (D2 runs first within Wave 3)

### M44-D2-T1 — CLI scaffold + mode-aware config extension skeleton
- **Status**: [ ] pending
- **Dependencies**: M44-D1-T5 (D1 complete), M44-D4-T4 (D4 complete), M44-D5-T4 (D5 complete), M44-D6-T5 (D6 complete), M44-D7-T5 (D7 complete)
- **Acceptance criteria**:
  - `bin/gsd-t-parallel.cjs` file exists, exports `runParallel({projectDir, mode, milestone, domain, dryRun})`
  - `bin/gsd-t-orchestrator-config.cjs` extended with stubs for `computeInSessionHeadroom` and `computeUnattendedGate` (implementation in T2)
  - `gsd-t parallel --help` prints usage without crashing
- **Files touched**: `bin/gsd-t-parallel.cjs` (new), `bin/gsd-t-orchestrator-config.cjs` (modified), `bin/gsd-t.js` (add `parallel` subcommand routing)

### M44-D2-T2 — Mode-aware gating math implementation
- **Status**: [ ] pending
- **Dependencies**: M44-D2-T1
- **Acceptance criteria**:
  - `computeInSessionHeadroom({ctxPct, workerCount, summarySize})` returns `{ok, reducedCount}` — `ok=true` if `ctxPct + workerCount × summarySize ≤ 85`, else suggests reduced count until N=1
  - `computeUnattendedGate({estimatedCwPct, threshold=60})` returns `{ok, split}` — if `estimatedCwPct > threshold`, `split=true` and the caller must slice the task into multiple iters
  - [in-session] path: `runParallel` calls `computeInSessionHeadroom` before fan-out; if reduced, logs the reduction decision to `.gsd-t/events/YYYY-MM-DD.jsonl` as a `parallelism_reduced` event
  - [unattended] path: `runParallel` calls D6 estimator + `computeUnattendedGate` before spawning; if split required, emits a `task_split` event and spawns multiple iters
- **Files touched**: `bin/gsd-t-parallel.cjs`, `bin/gsd-t-orchestrator-config.cjs`

### M44-D2-T3 — `--dry-run` output + end-to-end gate wiring
- **Status**: [ ] pending
- **Dependencies**: M44-D2-T2
- **Acceptance criteria**:
  - `gsd-t parallel --dry-run` prints: proposed worker plan table (task id | domain | estimated CW% | disjoint? | deps ok? | decision), total worker count, mode used
  - Three gates wired: D4 dep-validation, D5 disjointness prover, D6 economics all called in sequence; any gate veto logs a `gate_veto` event and falls back to sequential for the affected task pair
  - `--mode in-session` and `--mode unattended` explicitly tested against the synthetic 2-task fixture
- **Files touched**: `bin/gsd-t-parallel.cjs`

### M44-D2-T4 — wave-join-contract bump + unit tests
- **Status**: [ ] pending
- **Dependencies**: M44-D2-T3
- **Acceptance criteria**:
  - `.gsd-t/contracts/wave-join-contract.md` bumped to v1.1.0 with §"Mode-Aware Gating Math" section describing both mode paths, thresholds, and fallback behavior
  - `test/m44-parallel-cli.test.js` covers: in-session headroom computation (ok and reduced cases), unattended gate (ok and split cases), dry-run output format, gate veto fallback
  - All tests pass via `npm test`
- **Files touched**: `.gsd-t/contracts/wave-join-contract.md`, `test/m44-parallel-cli.test.js` (new)

### M44-D2-T5 — Doc-ripple + tests-pass commit
- **Status**: [ ] pending
- **Dependencies**: M44-D2-T4
- **Acceptance criteria**:
  - `docs/requirements.md` updated with §"M44 Parallel CLI" requirement entry
  - `docs/architecture.md` updated to reflect `bin/gsd-t-parallel.cjs` + orchestrator-config extensions
  - `GSD-T-README.md` commands table updated with `gsd-t parallel` entry
  - `README.md` updated with `gsd-t parallel` mention in CLI reference section
  - All existing tests still pass; Wave 3 D2 gate met
- **Files touched**: `docs/requirements.md`, `docs/architecture.md`, `GSD-T-README.md`, `README.md`, `.gsd-t/progress.md`
