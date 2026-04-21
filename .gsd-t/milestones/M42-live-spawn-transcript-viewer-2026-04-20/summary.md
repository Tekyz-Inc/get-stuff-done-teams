# Milestone Complete: M42 Live Spawn Transcript Viewer

**Completed**: 2026-04-20
**Version**: 3.15.10 → 3.16.10
**Tag**: v3.16.10
**Status**: VERIFIED

## What Was Built

A browser-based transcript viewer served off the existing `:7433` dashboard that renders the full Claude-Code-style conversation stream (user/system/assistant/tool_use/tool_result/thinking) from every unattended spawn. Operator now has the same visual comfort as an in-session Claude CLI run when work happens unattended.

## Domains

| Domain | Tasks Completed | Key Deliverables |
|--------|-----------------|------------------|
| D1 stream-json tee | 3 | `bin/gsd-t-transcript-tee.cjs` (allocateSpawnId + ndjson tee + index); `bin/gsd-t-orchestrator-worker.cjs` tee wiring; `bin/gsd-t-unattended.cjs` post-hoc line tee. |
| D2 SSE + renderer | 2 | Dashboard server routes (`/transcripts`, `/transcript/:id`, `/transcript/:id/stream`); `scripts/gsd-t-transcript.html` zero-dep Claude-Code-style renderer with auto-scroll pause, thinking dim, expandable tool_use, paired tool_result. |
| D3 sidebar + kill | 3 | Sidebar CSS grid layout with parent-indented tree + status dots; `handleTranscriptKill` with ESRCH/EPERM/404/409/400 mapping; POST `/transcript/:id/kill` route. |

## Commits

- `4e5d06e` — m42-d1: stream-json transcript tee + orchestrator + unattended integration
- `3d8a4c6` — m42-d2: per-spawn SSE route + Claude-Code-style transcript renderer
- `8c410d3` — m42-d3: sidebar tree + per-spawn kill controls

## Contracts

No new formal contracts. Viewer is read-only over existing stream-json frames; `.gsd-t/transcripts/.index.json` shape is self-documented in `bin/gsd-t-transcript-tee.cjs`.

## Test Coverage

- 29 M42-specific tests across 4 test files:
  - `test/m42-unattended-tee.test.js` (3)
  - `test/m42-transcript-server.test.js` (8)
  - `test/m42-transcript-renderer.test.js` (7)
  - `test/m42-transcript-sidebar.test.js` (11)
- Full suite: 1522/1522 pass
- E2E: N/A (repo is a CLI package — no Playwright config)

## Key Decisions

- **Out of scope (deferred to follow-up)**: Intervene/SIGSTOP-inject feature. User direction: "let's just get the UI looking proper first."
- **Unattended tee strategy**: Post-hoc line tee (split captured stdout after `spawnSync` exits, `appendFrame` per line) rather than refactoring to streaming spawn. Pragmatic — defers the live-tee-during-spawn refactor.
- **Zero deps**: HTML renderer is hand-rolled dark-mode dispatch on `frame.type`; sidebar polls `/transcripts` every 3s via `fetch`.
- **Security**: `isValidSpawnId` regex `/^[a-zA-Z0-9._-]+$/` blocks path traversal at both the route level and in `handleTranscriptKill`.

## Issues Encountered

None requiring remediation. One renderer test regex needed loosening after D3 refactored `EventSource` into a `connect(id)` function — fixed in the same commit.

## Goal-Backward Verification

All 3 success criteria verified with traceable code paths:
1. Full Claude-Code-style stream → `renderFrame` dispatches 6 frame types, 7 tests.
2. Parent-indented sidebar tree → `buildTree` + depth-based `padding-left`, 4 tests.
3. Per-spawn kill button → `handleTranscriptKill`, 6 tests including real SIGTERM.

## Files Changed

- `bin/gsd-t-transcript-tee.cjs` (new)
- `bin/gsd-t-orchestrator-worker.cjs` (modified)
- `bin/gsd-t-unattended.cjs` (modified)
- `scripts/gsd-t-dashboard-server.js` (modified, +150 lines total)
- `scripts/gsd-t-transcript.html` (new)
- `test/m42-unattended-tee.test.js` (new)
- `test/m42-transcript-server.test.js` (new)
- `test/m42-transcript-renderer.test.js` (new)
- `test/m42-transcript-sidebar.test.js` (new)
