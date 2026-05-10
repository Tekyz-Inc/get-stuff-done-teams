# Constraints: m56-d5-stream-json-universality-lint

## Must Read Before Using (no black-box treatment)
- `bin/gsd-t-capture-lint.cjs` — current rule structure (regex-based pattern + skip markers + opt-in pre-commit hook). D5 mirrors this for stream-json.
- `bin/gsd-t.js` lines 3865-3887 (`spawnClaudeSession`) — understand current flag set BEFORE adding stream-json
- `bin/gsd-t-parallel.cjs` lines 365-393 (`_runCacheWarmProbe`) — same
- `bin/gsd-t-ratelimit-probe-worker.cjs` lines 71-130 (`runOneProbe`) — same; CRITICAL: DO NOT touch the 429 classifier (lines using `stop_reason`/`is_error`/`api_error_status` from API result envelope per M55 D3 charter)
- `scripts/hooks/pre-commit-capture-lint` — current hook shape (bash, marker idiom)
- `feedback_claude_p_stream_json.md` (memory) — directive that prompted M56 D5

## Must Follow
- **Surgical edits only** — D5 changes EXACTLY 3 lines/sites in 3 files (one each in `bin/gsd-t.js`, `bin/gsd-t-parallel.cjs`, `bin/gsd-t-ratelimit-probe-worker.cjs`). DO NOT refactor surrounding code.
- **Allowlist via skip-marker comment** — pattern: `// GSD-T-LINT: skip stream-json (reason: probe-worker measures rate-limit envelope, not user-watchable progress)`. Same idiom as existing `// GSD-T-CAPTURE-LINT: skip` markers in the codebase. Allowlist lives in source, not in a separate config file (consistent with M41 capture-lint).
- **Lint must be deterministic** — regex-based pattern detection, no AST parsing. Same as `bin/gsd-t-capture-lint.cjs`.
- **Lint exits 4 on violation** — per GSD-T exit code convention (0 ok, 4 fail).
- **Pre-commit hook is opt-in** — installable via `gsd-t doctor --install-hooks`, not auto-installed. Same convention as existing capture-lint hook.
- **DO NOT regress 429 classifier** — `bin/gsd-t-ratelimit-probe-worker.cjs` MUST keep using API result envelope (`stop_reason`, `is_error`, `api_error_status`) for 429 detection. Adding `--output-format stream-json` MUST NOT break the existing classification logic.
- **TDD** — write the lint test first (asserting it catches a deliberately broken commit dropping `--output-format stream-json`). Watch fail. Implement. Watch pass.

## Must Not
- Modify files outside owned scope
- Touch `bin/gsd-t-verify-gate.cjs` (D1) or `bin/gsd-t-context-brief.cjs` (D2)
- Touch any `commands/*.md` (D3 + D4)
- Refactor `bin/gsd-t-capture-lint.cjs` rule structure — additive new rule only
- Add allowlist via separate config file when in-source skip markers work (don't multiply config surfaces)
- Regress the 429 API-result-envelope classifier in `bin/gsd-t-ratelimit-probe-worker.cjs`

## Dependencies
- Depends on: nothing (D5 is purely lint + 3 surgical site fixes)
- Depended on by: SC4 verification (Red Team will deliberately break a commit to confirm lint catches it)
- Concurrent with: D1, D2, D3, D4 (file-disjoint)

## Test Baseline
- Pre-D5: 2487/2487 unit
- Post-D5 expected: 2487 + ~10 new D5 tests (3 closure verifications + lint match/no-match + allowlist + pre-commit integration), all green
- SC4 evidence: deliberately-broken-commit test asserts lint exits 4 with informative message
