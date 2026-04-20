# Milestone Complete: M41 Universal Token Capture Across GSD-T

**Completed**: 2026-04-20
**Duration**: 2026-04-20 (single-day execution, Waves 1→2→3)
**Status**: VERIFIED
**Version**: 3.14.10 → 3.15.10

## What Was Built

A single shared token-capture wrapper (`bin/gsd-t-token-capture.cjs`) that every subagent/claude-p spawn across GSD-T now routes through. Retires the silent `| N/A |` Tokens convention that preceded M41. Adds a historical backfill tool, a dashboard CLI, a status-block tail, and a mechanical capture-lint enforcement layer.

Impact: token usage is no longer a blind spot. Every spawn's input/output/cache tokens and cost land in both the human-readable `.gsd-t/token-log.md` and the machine-readable `.gsd-t/metrics/token-usage.jsonl` (schema v1, reused from M40 D4).

## Domains

| Domain | Tasks | Key Deliverables |
|--------|-------|------------------|
| D1 token-capture-wrapper | 3 | `bin/gsd-t-token-capture.cjs` with `captureSpawn`, `recordSpawnRow`, canonical token-log header, migration-in-place |
| D2 command-file-doc-ripple | 4 | 20 `commands/*.md` converted; `templates/CLAUDE-global.md` + `CLAUDE.md` carry Token Capture Rule; drift-guard test added |
| D3 historical-backfill | 4 | `bin/gsd-t-token-backfill.cjs`; `gsd-t backfill-tokens [--since][--patch-log][--dry-run]`; idempotent via `source: "backfill"` marker |
| D4 token-dashboard | 4 | `bin/gsd-t-token-dashboard.cjs`; `gsd-t tokens [--since][--milestone][--format]`; 3-line block at tail of `gsd-t status`; perf gate 22ms/10k lines |
| D5 enforcement | 5 | `bin/gsd-t-capture-lint.cjs`; `gsd-t capture-lint [--staged|--all]`; opt-in pre-commit hook via `gsd-t init --install-hooks`; Token Capture Rule (MANDATORY) in both CLAUDE files |

## Contracts Defined/Updated

- `metrics-schema-contract.md` (M40 v1) — **reused** unchanged; no new fields
- `stream-json-sink-contract.md` (M40 v1.1.0) — **reused** unchanged
- No new contracts introduced

## Key Decisions

- **Missing-usage rendering = `—`, never `0`, never `N/A`** — chosen so dashboards can distinguish "no data" from "real zero" and so historical log-parsing can tell which rows still need backfill.
- **`.cjs` extension for all new M41 modules** — ESM/CJS compat without package-level `"type": "module"` migration.
- **Opt-in pre-commit hook, not auto-install** — users may have existing pre-commit setups; we append idempotently when asked, never overwrite.
- **String-literal heuristic in capture-lint** — a full JS parser would pull in a dep; balanced-quote counting catches the common false positives (help-text log calls) without breaking the zero-dep invariant.
- **`commands/gsd-t-help.md` whitelisted in linter** — pure-prose reference that documents `claude -p` and `Task(` as concepts; flagging prose as a spawn violation would require polluting the displayed help with skip markers.

## Issues Encountered

None. Wave execution completed clean across 5 domains with zero remediation cycles.

## Test Coverage

- Tests added: +27 net (D1=12, D2=5 drift, D3=11, D4=13, D5=14; some overlap counted once)
- Full suite: 1479/1479 pass (was 1421/1421 before M41 branch merged work)
- Perf gates: D4 aggregate <500ms on 10k lines (observed 22ms), D5 capture-lint <2s on 138 files (observed ~30ms)

## Git Tag

`v3.15.10`

## Files Changed

New:
- `bin/gsd-t-token-capture.cjs` (D1)
- `bin/gsd-t-token-backfill.cjs` (D3)
- `bin/gsd-t-token-dashboard.cjs` (D4)
- `bin/gsd-t-capture-lint.cjs` (D5)
- `scripts/hooks/pre-commit-capture-lint` (D5)
- `test/m41-token-capture.test.js` (D1)
- `test/m41-canonical-block-drift.test.js` (D2)
- `test/m41-token-backfill.test.js` (D3)
- `test/m41-token-dashboard.test.js` (D4)
- `test/m41-capture-lint.test.js` (D5)
- `.gsd-t/domains/d1..d5-*/` spec dirs

Modified:
- `bin/gsd-t.js` — added `backfill-tokens`, `tokens`, `capture-lint` subcommands + `init --install-hooks` branch + `showStatusTokenBlock` tail
- 20 `commands/*.md` files — converted from inline T_START bash blocks to `captureSpawn`/`recordSpawnRow` pattern
- `templates/CLAUDE-global.md` + `/Users/david/projects/GSD-T/CLAUDE.md` — Token Capture Rule section
- `scripts/gsd-t-design-review-server.js` — skip marker (out-of-scope pre-M41 code)
- `package.json` — version bump to 3.15.10
- `.gsd-t/progress.md` + decision log
