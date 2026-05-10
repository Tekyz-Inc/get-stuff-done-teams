# Domain: m56-d5-stream-json-universality-lint

## Responsibility
Close the three known stream-json gaps (`bin/gsd-t.js:3879 spawnClaudeSession`, `bin/gsd-t-parallel.cjs:378` cache-warm probe, `bin/gsd-t-ratelimit-probe-worker.cjs:89`) by adding `--output-format stream-json --verbose` to each. Extend `bin/gsd-t-capture-lint.cjs` with a `--check-stream-json` mode that mechanically rejects any `claude -p` / `spawn('claude', …)` invocation lacking the flag pair. Allowlist (e.g. probe workers measuring envelopes, not progress) lives in lint config — NOT tribal knowledge.

## Files Owned
- `bin/gsd-t.js` — surgical edit to `spawnClaudeSession` (line ~3879) ONLY. Does NOT touch any other function.
- `bin/gsd-t-parallel.cjs` — surgical edit to `_runCacheWarmProbe` (line ~378) ONLY. Does NOT touch any other function.
- `bin/gsd-t-ratelimit-probe-worker.cjs` — edit to args builder (line ~89) ONLY. Does NOT touch the probe-result envelope or 429 classifier.
- `bin/gsd-t-capture-lint.cjs` — additive `--check-stream-json` mode (new RULE entry alongside existing rules)
- `scripts/hooks/pre-commit-capture-lint` — additive call to the new lint mode
- `test/m56-d5-stream-json-lint.test.js` — new unit tests (3 closure verifications + lint logic + allowlist + pre-commit integration)
- `test/m56-d5-stream-json-gap-closures.test.js` — new unit tests asserting the three sites now use the flag pair

## NOT Owned (do not modify)
- `bin/gsd-t-verify-gate.cjs` — D1 owns
- `bin/gsd-t-context-brief.cjs` — D2 owns
- `commands/*.md` — D3 + D4 own
- The Task subagent / Claude Code dispatch sites in `bin/orchestrator.js`, `bin/gsd-t-orchestrator-worker.cjs`, `bin/gsd-t-unattended.cjs`, `bin/gsd-t-unattended-platform.cjs`, `bin/gsd-t-benchmark-orchestrator.js`, `scripts/gsd-t-design-review-server.js` — these already comply (verified during 19:21 audit); D5 lint will scan them but they should not need source edits.

## Files Touched (audit trail)
- `bin/gsd-t.js` (1 surgical edit at `spawnClaudeSession` only)
- `bin/gsd-t-parallel.cjs` (1 surgical edit at `_runCacheWarmProbe` only)
- `bin/gsd-t-ratelimit-probe-worker.cjs` (1 surgical edit at args builder only)
- `bin/gsd-t-capture-lint.cjs` (additive RULE + `--check-stream-json` mode)
- `scripts/hooks/pre-commit-capture-lint` (additive lint invocation)
- `test/m56-d5-stream-json-lint.test.js` (new)
- `test/m56-d5-stream-json-gap-closures.test.js` (new)
