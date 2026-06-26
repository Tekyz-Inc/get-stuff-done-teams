# Contract: Graph Scan Consumer Wiring

**Status:** DRAFT — authored by D6 during Wave-3 wiring (after the Wave-2 build trio integrates).
**Owner:** d6-scan-wiring
**Consumers:** none (terminal consumer — the falsifiable payoff)
**Version:** 0.1.0 (DRAFT)

## Purpose
How `/scan` (the FIRST narrow consumer) uses the deterministic query CLI instead of re-reading the whole Atos repo (~1.5M LOC, ~2hr today).

## Wiring
- **run-1 (cold):** if `store.exists()` is false → `build_index(repo)` first
- **run-2 (warm):** read-once-query-after via the D5 query CLI (`who-imports` / `who-calls` / `blast-radius`) — NOT a whole-repo re-read
- `[RULE] scan-run2-reads-index-not-source` — run-2 answers from the index; both run wall-clocks reported (AC-4)

## Fallback
- query CLI returns `{ok:false, reason:"graph-unavailable"}` → scan falls back to today's grep mode, ANNOUNCED (never silent). No grep when the index is live.

## Sandbox (M81)
- `templates/workflows/gsd-t-scan.workflow.js` stays runtime-native — the query-CLI call is delegated to an inline `agent()` Bash helper; no `require`/`fs`/`child_process`.

## AC-4 measurement protocol
- Measure run-1 (build) + run-2 (warm) wall-clocks on the real Atos repo; record both in `.gsd-t/spikes/ac4-scan-run2-speedup-results.md`, progress.md, and CHANGELOG.md.

## Consumed (frozen)
- `graph-query-cli-contract.md` (D5) — the JSON envelope
