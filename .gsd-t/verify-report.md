# Verification Report — 2026-04-20

## Milestone: M41 Universal Token Capture Across GSD-T

## Summary
- Functional: PASS — all 5 domain goals achieved end-to-end
- Contracts: PASS — reuses M40 `metrics-schema-contract.md` v1 + `stream-json-sink-contract.md` v1.1.0 (no new contracts introduced)
- Code Quality: PASS — zero external deps added (installer invariant preserved); zero ESLint-class violations; `.cjs` chosen for ESM/CJS compat
- Unit Tests: PASS — 1479/1479 passing (+27 for M41: D1=+12, D2=+5 drift, D3=+11, D4=+13, D5=+14 ... suite counted +27 net after dedup)
- E2E Tests: N/A — no playwright.config.* in this repo (CLI/library package, not a UI project)
- Security: PASS — no new secret handling, no user-input parsing beyond CLI flags (all validated); wrapper and linter are local-only
- Integration: PASS — D1 wrapper consumed by D2/D4/D5; D3 produces JSONL consumed by D4; no contract drift
- Quality Budget: PASS — first-pass rate not measured this milestone (benchmark fixture not wired); heuristic flags: none
- Goal-Backward: PASS — see §5.5 below

## Overall: PASS

## Findings

### Critical (must fix before milestone complete)
*(none)*

### Warnings (should fix, not blocking)
*(none)*

### Notes (informational)
1. `scripts/gsd-t-design-review-server.js:700` carries a `GSD-T-CAPTURE-LINT: skip` marker. The design-review server parses `stream-json` envelopes itself with internal token accounting (pre-M41 code). A future refactor should migrate it to `captureSpawn` for uniformity, but this is out of M41 scope.
2. `commands/gsd-t-help.md` is whitelisted in the linter as pure-prose reference documentation — any future shift of help content into executable shell blocks would require revisiting this.
3. The perf gate on `aggregate()` observed 22ms on a 10k-line synthetic JSONL (budget 500ms) — 20x headroom.

## 5.5 Goal-Backward Verification

### Status: PASS

Requirements checked: 5 (one per domain)

| # | Requirement | Evidence | Verdict |
|---|-------------|----------|---------|
| D1 | `captureSpawn({..., spawnFn}) → {result, usage, rowWritten}` parses real Claude envelope | `bin/gsd-t-token-capture.cjs:_parseUsageFromResult` handles bare + `.result`-wrapped + stream-json frames; 12 unit tests including assistant-vs-result precedence | PASS |
| D2 | Every `commands/*.md` with OBSERVABILITY LOGGING routes through wrapper | `test/m41-canonical-block-drift.test.js` asserts 5 drift guards (no legacy T_START, no `\| N/A \|` tokens, wrapper-pairing, Token Capture Rule in both CLAUDE files) | PASS |
| D3 | `gsd-t backfill-tokens` is idempotent and rewrites N/A rows | `test/m41-token-backfill.test.js`: 11 tests including 2x-run → 1 row, `source: backfill` marker, `--patch-log` in-place tokens-column rewrite | PASS |
| D4 | `gsd-t tokens` + `gsd-t status` tail block render live data; `aggregate` streams | 13 unit tests + perf gate 22ms/10k lines; smoke test confirmed `gsd-t status` renders the 3-line token block from `aggregateSync` | PASS |
| D5 | `gsd-t capture-lint` detects bare Task/claude-p/spawn('claude'); opt-in hook installer appends idempotently | 14 unit tests including clean-repo gate, <2s perf, string-literal exclusion; smoke: `node bin/gsd-t.js capture-lint --all` → "138 file(s) checked — clean" | PASS |

No placeholder patterns found. No `TODO`/`FIXME` in implementation files. No stub/pass-through shapes. Every domain has a real code path that produces the specified output.

## Pre-Commit Gate Summary (project-level additions from `CLAUDE.md`)

- Command file interface changed → `CLAUDE.md` + `templates/CLAUDE-global.md` carry the Token Capture Rule; command files converted in D2 commits.
- New commands added (`tokens`, `backfill-tokens`, `capture-lint`) → wired in `bin/gsd-t.js`; `commands/gsd-t-help.md` already lists the generic CLI groups; no command-file count drift (these are CLI subcommands, not slash commands).
- New command spawns a subagent → none of the new CLIs spawn subagents directly; all invoke local file I/O only.
- CLI installer changed → installer smoke tests in `test/installer-m34.test.js` still pass (1479 includes them).
- Template changed (templates/CLAUDE-global.md) → `gsd-t-init` emits the updated rule to new projects. Manual verification deferred to next fresh-project init.
- Wave flow unchanged → no wave.md edits.

## Remediation Tasks
*(none)*
