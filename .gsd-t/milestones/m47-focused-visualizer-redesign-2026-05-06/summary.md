# Milestone Complete: M47 Focused Visualizer Redesign

**Completed**: 2026-05-06
**Duration**: 2026-05-06 (single in-session day — plan + execute + verify + complete)
**Status**: VERIFIED

## What Was Built

Replaced the visualizer's single-pane "click to view one spawn" model with a dual-pane focused layout:

- **Top pane**: streams the orchestrator's main in-session conversation (zero-click default — fetched via new `GET /api/main-session`).
- **Bottom pane**: streams the user-selected spawn (preserves all prior `/transcript/:spawnId` bookmark behavior).
- **Splitter**: keyboard- and mouse-resizable handle between the two panes; position persisted in `sessionStorage` so it survives reloads.
- **Left rail**: split into three sections — `★ Main Session` (the in-session conversation), `Live Spawns` (active workers), and `Completed` (last 100 spawns, newest first, status-badged, collapsible). Reactive bucketing — when a spawn transitions Live → Completed it moves sections without a full reload, and stays selected if focused.
- **Right rail**: existing Spawn Plan / Parallelism / Tool Cost panels preserved under a new collapsible toggle.
- **Server-side**: `listInSessionTranscripts` now derives a `status: 'active' | 'completed'` field per entry from a 30-second mtime window; new `GET /api/main-session` endpoint returns `{ filename, sessionId, mtimeMs }` for the most-recently-modified `in-session-*.ndjson` file (or nulls when none), path-traversal-guarded by the existing `isValidSpawnId` filter and served with `Cache-Control: no-store`.

## Domains

| Domain | Tasks Completed | Key Deliverables |
|--------|-----------------|------------------|
| m47-d1-viewer-redesign | 7 / 7 | Split-pane HTML scaffolding (`#main-stream` + splitter + `#spawn-stream`); 3-section left rail (`data-rail-section` markers); dual SSE wiring (`connectMain` + bottom-pane `connect`); rail bucketing (`bucketAndRender`) consuming D2 status field; mouse + keyboard splitter (ArrowUp/Down ±5%, Home/End snap); 4 sessionStorage keys (`gsd-t.viewer.selectedSpawnId`, `splitterPct`, `completedExpanded`, `rightRailCollapsed`); right-rail collapse toggle. |
| m47-d2-server-helpers | 5 / 5 | 30s-window `status` field on `listInSessionTranscripts`; new `handleMainSession` + `GET /api/main-session` route + module export; contract bumped to v1.3.0; 9 regression tests (status field 4, /api/main-session 5). |

## Contracts Defined/Updated
- `dashboard-server-contract.md`: v1.2.0 → **v1.3.0** (additive — `GET /api/main-session` section, In-Session Entry Status Field section, Module Exports refresh).
- `m47-integration-points.md`: **new** — D1↔D2 wiring, dependency graph, single-wave parallel execution plan with 1 cross-domain checkpoint.

## Key Decisions
- **Single source of truth for the viewer**: corrected the D1 scope's mention of `templates/gsd-t-transcript.html` co-edit. `bin/gsd-t.js::UTILITY_SCRIPTS` (line 1079) ships only `scripts/gsd-t-transcript.html`; no templates copy exists. M47 treats the scripts copy as authoritative.
- **D1 must NOT compute status itself**: bucketing logic in `bucketAndRender` reads `spawn.status` directly. Future status-source upgrades (`success` / `failed` / `killed` from orchestrator exit codes) light up automatically without a viewer change — code branches on the value, falls back to a neutral `completed` badge.
- **Sandbox-friendly IIFE init**: `_ssGet`/`_ssSet` wrappers + null-checks on `getComputedStyle` and `document.body.style` so the existing DOM-shim test sandboxes (in `m44-compact-marker-frame.test.js`) continue to parse the M47 wiring without `sessionStorage`/`getComputedStyle` shims.
- **Test-file co-edit invariant**: `test/dashboard-server.test.js` is shared by both domains, treated as append-only — D1 and D2 add new describe blocks at distinct positions, mechanical merge.

## Issues Encountered
- 4 existing viewer-route tests (`m44-d8-transcript-renderer-panel`, `m44-transcript-timestamp`, `m44-compact-marker-frame`, `m45-d1-transcripts-route-viewer`, `transcripts-html-page`) updated mechanically to track the new structure: `grid-template-columns` regex now allows `var(--right-rail-w)`, `<main id="stream">` regex now allows the `#stream` div nested inside `#spawn-stream`. These are intentional contract drift, not regressions.
- Initial `_ssGet`/`_ssSet` were inline `try { sessionStorage.getItem }` calls; tests that sandbox the IIFE without `sessionStorage` failed with `ReferenceError`. Refactored to module-scope wrappers that early-return `null` when undefined.
- `gsd-t parallel --milestone m47 --command gsd-t-execute` exited 2 (sequential fallback) because the in-session orchestrator has `GSD_T_UNATTENDED` unset, so the dispatcher correctly determined N<2 workers. Both domains executed in dependency order with zero conflict.

## Test Coverage
- Tests added: **13 new** (D2 T4 status field: 4; D2 T5 /api/main-session: 5; D1 T7 final fence: 4 — HTML markers + sessionStorage keys + collapsed-section CSS rule).
- Tests updated: 4 existing structural tests in `m44-d8-transcript-renderer-panel`, `m44-transcript-timestamp`, `m45-d1-transcripts-route-viewer`, `transcripts-html-page` (regex relaxation for the new grid-template-columns / nested `#stream` structure).
- Suite: **2058 / 2060** (was 2045 / 2047 baseline; M47 net add +13/+13). Same 2 pre-existing flakes preserved (event-stream env-leak, watch-progress-writer shim format) — confirmed via stash-and-rerun on bare main.

## Verification
- All 9 verify dimensions: PASS or N/A (E2E and Design Fidelity N/A — framework repo, no playwright config, no design-contract).
- Goal-Backward: PASS (0 placeholder patterns across 11 requirements; traced REQ → file:line → real arithmetic / DOM mutation / HTTP behavior).
- Adversarial Red Team: GRUDGING PASS (13 attack vectors examined, 0 bugs found).
- Quality Budget: PASS (no data, no violations).

## Git Tag
`v3.21.10`

## Files Changed
- `scripts/gsd-t-dashboard-server.js` — M, +50 / −5 (handleMainSession, status field derivation, route wiring, exports)
- `scripts/gsd-t-transcript.html` — M, ~+250 / −15 (split-pane CSS+markup, 3-section rail, dual SSE, splitter, bucketing, sessionStorage)
- `.gsd-t/contracts/dashboard-server-contract.md` — M, +20 (v1.3.0 with new endpoint + status field sections)
- `.gsd-t/contracts/m47-integration-points.md` — new
- `.gsd-t/domains/m47-d1-viewer-redesign/{scope,constraints,tasks}.md` — new (planned during M47 plan)
- `.gsd-t/domains/m47-d2-server-helpers/{scope,constraints,tasks}.md` — new
- `test/dashboard-server.test.js` — M, +13 tests (~+200 lines)
- `test/m44-d8-transcript-renderer-panel.test.js` — M, regex-relaxation
- `test/m45-d1-transcripts-route-viewer.test.js` — M, regex-relaxation
- `test/transcripts-html-page.test.js` — M, regex-relaxation
- `docs/requirements.md` — M, +11 REQ-M47-* entries (all marked done)
- `.gsd-t/progress.md` — M (M47 PLANNED → EXECUTED → VERIFIED → COMPLETE)
- `.gsd-t/verify-report.md` — replaced (M44 → M47 verify report)
