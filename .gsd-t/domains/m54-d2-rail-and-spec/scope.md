# Domain: m54-d2-rail-and-spec

## Responsibility

Build the **client-side render layer** + the **live-setup verification** that proves M54 works end-to-end against a running dashboard. Adds a new "LIVE ACTIVITY" left-rail section to the viewer (between MAIN SESSION and LIVE SPAWNS), polls `/api/live-activity` every 5s, renders entries with kind icons + truncated label + duration counter + pulsing border, handles click-to-load-tail in the bottom pane, and ships 2 new live-journey specs that probe the running dashboard against real backgrounded processes.

This is the *render + verify* half of M54. D1 is the *detection + transport* half (the detector module, 3 endpoints, STABLE contract).

## Owned Files/Directories

- `scripts/gsd-t-transcript.html` — additive only.
  - New left-rail section markup: `<section id="rail-live-activity">` with the heading "LIVE ACTIVITY", positioned between the existing MAIN SESSION and LIVE SPAWNS sections in the rail-stack order.
  - New CSS rules:
    - `@keyframes accent-pulse` (~1.5s cycle).
    - `.la-pulsing` class scoping the keyframes to entries within their first 30s of life or until clicked (whichever comes first).
    - Status-dot variants (`.la-dot-running` green, `.la-dot-stale` dimmed).
    - Kind-icon styling (4 glyphs: `$` bash, `eye` monitor, `wrench` tool, `arrow` spawn — exact code points TBD in execute).
    - Layout grid: status-dot · kind-icon · 40-char truncated label · live wall-clock duration counter.
  - New JS module(s) for the rail consumer:
    - 5s polling timer hitting `GET /api/live-activity`.
    - `appendActivity(entry)` / `removeActivity(id)` / `updateDuration(id)` render helpers.
    - Click handler: invokes `tailUrl` from the entry response, loads the bottom pane.
    - Pulse stop conditions: (a) user click, (b) entry no longer in next response, (c) 30s elapsed.
    - Visual nesting: existing LIVE SPAWNS data continues to populate, but D2 nests the spawn entries as a sub-grouping inside LIVE ACTIVITY (kind=`spawn` entries from D1).
  - All edits additive. NO existing rail markup, CSS rule, JS function, or render path renamed/replaced.

- `e2e/live-journeys/live-activity.spec.ts` — NEW.
  - Probes the **running** dashboard (post-M52 doctrine — no in-process `startServer(0, ...)` fixture).
  - Spawns a real `bash -c "sleep 30"` via `child_process.spawn`.
  - Asserts `/api/live-activity` returns the entry within 5s.
  - Asserts the rail entry appears within 5s with `.la-pulsing` class.
  - Asserts the duration counter ticks (compares two snapshots ≥1s apart).
  - Asserts click loads the tail in the bottom pane (verifies non-empty tail content).
  - Kills the bash and asserts the entry disappears within 5s.
  - Self-skips with `test.skip()` when no live dashboard reachable (`GSD_T_LIVE_DASHBOARD_URL` env override; default `http://localhost:7488`).
  - Cleans up the spawned bash on teardown (kill before describe-end).

- `e2e/live-journeys/live-activity-multikind.spec.ts` — NEW.
  - Spawns 3 concurrent activities of 3 different kinds:
    - real `Monitor` watch (the test issues a `Monitor` tool call against a tail-able file).
    - real `bash` backgrounder (`bash -c "sleep 30 && echo done"`).
    - synthetic `tool_use_started` event written to `.gsd-t/events/<today>.jsonl` (no orchestrator transcript counterpart — exercises events-only path).
  - Asserts all 3 appear in `/api/live-activity` within 5s.
  - Asserts they pulse independently in the rail (3 distinct `.la-pulsing` entries).
  - Asserts dedupe correctness when one of them is also present in the orchestrator JSONL — the entry appears once, not twice.
  - Self-skips like the sibling spec.
  - Cleans up all 3 on teardown.

- `.gsd-t/journey-manifest.json` — additive entries only.
  - 2 new entries (1 per spec) with `covers: []` per M52 doctrine for live-journeys (live specs probe live URLs, not viewer-source listeners — the journey-coverage tool ignores covers=[] entries; manifest exists for catalogue completeness).
  - `gsd-t check-coverage` continues to report `OK: 20 listeners, 16 specs` (was 14 in M53b → 16 here; spec count grows but listener count stays 20).

## NOT Owned (do not modify)

- `bin/live-activity-report.cjs` — D1 owns. (D2 is a read-only consumer of the JSON envelope.)
- `scripts/gsd-t-dashboard-server.js` — D1 owns. (D2 calls D1's endpoints; never patches them.)
- `bin/gsd-t.js` — D1 owns the `GLOBAL_BIN_TOOLS` array entry. D2 doesn't touch this file.
- `.gsd-t/contracts/live-activity-contract.md` — D1 owns. (D2 reads it for the JSON shape; never edits.)
- `test/m54-d1-*.test.js` — D1 unit tests; off-limits to D2.
- Existing rail sections (MAIN SESSION, LIVE SPAWNS, COMPLETED, transcript pane, splitter, right rail, etc.) — additive only; D2 inserts new section above LIVE SPAWNS but does not touch existing sections.
- Existing `e2e/journeys/*.spec.ts` and `e2e/viewer/*.spec.ts` — pre-existing M50/M51/M52/M53 specs; off-limits.
- Production server runtime — D2 ships zero server-code changes. If a journey spec reveals a real server bug, file as backlog.

## Public API (what D1 reads from D2)

D1 reads nothing from D2 at the file level. The interface is one-way: D2 consumes D1's contract.

The cross-domain handshake is exclusively through:
1. **The `live-activity-contract.md`** (D1 publishes STABLE; D2 reads).
2. **The 3 endpoints** (D1 publishes; D2 calls).
3. **The `~/.claude/bin/live-activity-report.cjs`** install path (D1 publishes; D2's specs assume populated).

D2 publishes the verification that proves the contract holds end-to-end. Both live-journey specs serve as the executable contract attestation that survives Red Team's broken patches.
