# Tasks: m56-d5-stream-json-universality-lint

## Summary
Close 3 known stream-json gaps (`bin/gsd-t.js:3879 spawnClaudeSession`, `bin/gsd-t-parallel.cjs:378` cache-warm probe, `bin/gsd-t-ratelimit-probe-worker.cjs:89`). Add `--check-stream-json` mode to `bin/gsd-t-capture-lint.cjs` to mechanically reject any new violations. Allowlist via in-source skip-marker comments (no separate config file).

## Tasks

### M56-D5-T1 — Stream-json lint test (TDD red)
- **Touches**: `test/m56-d5-stream-json-lint.test.js` (new), `test/m56-d5-stream-json-gap-closures.test.js` (new)
- **Contract refs**: existing capture-lint pattern in `bin/gsd-t-capture-lint.cjs`
- **Deps**: NONE
- **Acceptance criteria**:
  - 8-10 unit tests written first, all RED:
    - Lint catches `claude -p` invocation without `--output-format stream-json --verbose` flag pair.
    - Lint catches `spawn('claude', …)` arg array missing the flag pair.
    - Lint respects in-source skip marker `// GSD-T-LINT: skip stream-json (reason: …)` — flagged-but-allowed sites are reported in `notes[]` with the reason, not as failures.
    - Lint exits 4 on violation, 0 on clean.
    - Three gap-closure assertion tests: each of the 3 sites (`spawnClaudeSession`, `_runCacheWarmProbe`, ratelimit-probe-worker `runOneProbe`) contains both `--output-format` and `stream-json` literals after T2.

### M56-D5-T2 — Surgical edits to 3 named sites (TDD green for gap-closures)
- **Touches**: `bin/gsd-t.js` (1 line at `spawnClaudeSession`), `bin/gsd-t-parallel.cjs` (1 line at `_runCacheWarmProbe`), `bin/gsd-t-ratelimit-probe-worker.cjs` (1 line at `runOneProbe`)
- **Contract refs**: M55 D3 charter — DO NOT regress 429 classifier (`stop_reason`, `is_error`, `api_error_status` from API result envelope)
- **Deps**: Requires T1
- **Acceptance criteria**:
  - `bin/gsd-t.js:3879` `spawnClaudeSession` invocation gains `--output-format stream-json --verbose` BEFORE the prompt arg. (Adapt parsing of buffered stdout: stream-json output is one JSON object per line; the existing string-consumer needs a thin parser. Alternative: add a skip-marker comment with reason "internal debug-loop summarizer, output is consumed as one string by parseTestResult — not user-watchable". Pick the cheapest correct path.)
  - `bin/gsd-t-parallel.cjs:378` `_runCacheWarmProbe` spawn args gain the flag pair, OR add skip marker (reason: "single-word 'warm' reply, no progress to stream").
  - `bin/gsd-t-ratelimit-probe-worker.cjs:89` `runOneProbe` args gain the flag pair, OR add skip marker (reason: "probe measures rate-limit envelope, not user-watchable progress; must NOT regress 429 classifier on stop_reason/is_error/api_error_status").
  - **Decision rule**: prefer skip-markers for the two probe sites (both are mechanical, single-output spawns). Add the flag pair to `spawnClaudeSession` if the parser change is cheap; otherwise skip-marker it with the same reasoning. The lint catches NEW violations; existing sites with markers are documented exceptions.
  - 3 gap-closure assertion tests now GREEN. (If skip-marker chosen: assertion tests check for marker presence + reason rather than literal flag pair.)

### M56-D5-T3 — Implement stream-json lint rule + CLI mode (TDD green for lint)
- **Touches**: `bin/gsd-t-capture-lint.cjs` (additive RULE entry + `--check-stream-json` flag handling)
- **Contract refs**: existing capture-lint rule structure
- **Deps**: Requires T1
- **Acceptance criteria**:
  - New RULE entry alongside existing rules: `{ name: 'stream-json-flag-pair', re: <regex matching claude -p / spawn('claude', …) without --output-format stream-json>, allowMarker: '// GSD-T-LINT: skip stream-json' }`.
  - `gsd-t capture-lint --check-stream-json [--project DIR] [--json|--text]` CLI form. Exit 0 on clean, 4 on violation, 2 on bad args.
  - Without `--check-stream-json`, existing capture-lint behavior preserved (additive, opt-in).
  - All 8-10 T1 lint tests now GREEN.

### M56-D5-T4 — Wire stream-json check into pre-commit hook
- **Touches**: `scripts/hooks/pre-commit-capture-lint` (additive line)
- **Contract refs**: existing pre-commit-capture-lint shape
- **Deps**: Requires T3
- **Acceptance criteria**:
  - Pre-commit hook gains a second `gsd-t capture-lint --check-stream-json` call alongside the existing capture-lint call. Both must pass.
  - Hook is opt-in (installable via `gsd-t doctor --install-hooks`) — same convention as existing hook. NO auto-install.
  - Hook exits non-zero (blocking commit) if either lint mode fails.

### M56-D5-T5 — SC4 Red-Team-bait test — deliberately broken commit
- **Touches**: `test/m56-d5-stream-json-lint.test.js` (additive within T1's file)
- **Contract refs**: SC4 charter
- **Deps**: Requires T3
- **Acceptance criteria**:
  - Additional test scenario: "deliberately add a new bare `claude -p` invocation in a test fixture file (NOT in production code) → run `gsd-t capture-lint --check-stream-json` against that fixture → assert exit code 4 + violation reported with file path + line number." This is the SC4 evidence test.

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 1 (T1)
- Blocked tasks: 4 (T2/T3 need T1; T4 needs T3; T5 needs T3)
- Parallel-safe within domain: T2 and T3 can run in parallel after T1 (T2 touches code, T3 touches lint — disjoint within domain)
- Estimated context per task: T1 small (~10%), T2 small (~15%), T3 medium (~20%), T4 small (~10%), T5 small (~10%)

## REQ Coverage
- REQ-M56-D5-01 → T2 (3 gap closures)
- REQ-M56-D5-02 → T3 (lint rule + CLI mode)
- REQ-M56-D5-03 → T4 (pre-commit hook integration)
- SC4 evidence → T5
