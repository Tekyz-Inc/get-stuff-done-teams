# Tasks: m54-d2-rail-and-spec

## Summary

Build the LIVE ACTIVITY rail section in the viewer + 2 live-journey specs that probe the running dashboard end-to-end. Skeleton only at partition time; tasks fully populated during the PLAN phase. The shape below is locked from the M54 DEFINE — 3 tasks, sequential within the domain, gated on D1 Checkpoint 1.

## Tasks

### Task 1: Rail section markup + CSS + status-dot + kind-icon + pulse keyframes
- **Files**:
  - `scripts/gsd-t-transcript.html` (additive — new `<section id="rail-live-activity">` markup, new CSS rules, `@keyframes accent-pulse`, `.la-pulsing` scoping)
- **Contract refs**: `live-activity-contract.md` § JSON schema (the field shape JS will read), § kinds catalogue (the 4 icons)
- **Dependencies**: D1 Checkpoint 1 PUBLISHED (contract STABLE, endpoint live)
- **Acceptance criteria** (deferred to PLAN — locked at partition):
  - New section inserted between MAIN SESSION and LIVE SPAWNS — verified by DOM order in a smoke test.
  - 4 kind icons rendered (bash $, monitor eye, tool wrench, spawn arrow).
  - `.la-pulsing` class scoped — animation does not bleed onto other rail entries.
  - Status dot variants (`la-dot-running`, `la-dot-stale`) defined.
  - LIVE SPAWNS visually nested inside LIVE ACTIVITY (existing markup untouched; nesting via the new section's layout).

### Task 2: Polling consumer + render helpers + click handler + pulse-stop logic
- **Files**:
  - `scripts/gsd-t-transcript.html` (additive — new JS module / inline-script append)
- **Contract refs**: `live-activity-contract.md` § endpoints (`/api/live-activity`), § cache invariants (5s)
- **Dependencies**: T1
- **Acceptance criteria** (deferred to PLAN):
  - 5s polling timer hits `/api/live-activity`.
  - On new entry: append + add `.la-pulsing`.
  - Pulse stops on (a) user click, (b) entry absent in next response, (c) 30s elapsed.
  - Click loads `tailUrl` from the entry into the bottom pane (no auto-switch on arrival).
  - Duration counter ticks live (wall-clock derived from `startedAt`).
  - Empty / 500 response handled gracefully (no crash, no console error).

### Task 3: 2 live-journey specs + manifest entries + Checkpoint 2 publication
- **Files**:
  - `e2e/live-journeys/live-activity.spec.ts` (new)
  - `e2e/live-journeys/live-activity-multikind.spec.ts` (new)
  - `.gsd-t/journey-manifest.json` (additive — 2 new entries with `covers: []`)
  - `.gsd-t/contracts/m54-integration-points.md` (edit — Checkpoint 2 PROPOSED → PUBLISHED)
  - `docs/architecture.md` (edit — append rail-behavior + 2-spec verification narrative to existing § Live Activity Observability subsection)
- **Contract refs**: `live-activity-contract.md` § JSON schema, § endpoints; `m54-integration-points.md` Checkpoint 2
- **Dependencies**: T1, T2
- **Acceptance criteria** (deferred to PLAN):
  - `live-activity.spec.ts`: spawns real `bash -c "sleep 30"`, asserts entry-within-5s, pulse, duration tick, click loads tail, kill removes within 5s. `test.skip()` on unreachable dashboard. Cleans up bash on teardown.
  - `live-activity-multikind.spec.ts`: 3 concurrent kinds (Monitor + bash + synthetic event), all appear, pulse independently, dedupe correct on orchestrator+events overlap.
  - 2 manifest entries with `covers: []`; `gsd-t check-coverage` reports `OK: 20 listeners, 16 specs` (was 14 → +2).
  - REQ-M54-D2-04, REQ-M54-D2-05 in `docs/requirements.md` flip planned → done.
  - Checkpoint 2 in `m54-integration-points.md` flips PROPOSED → PUBLISHED with timestamp.

## Execution Estimate

- Total tasks: 3
- Independent tasks (no blockers): 0 (all gated on D1 Checkpoint 1)
- Blocked tasks (waiting on other tasks within domain or cross-domain checkpoint): 3 (T1 gated on C1; T2 on T1; T3 on T2)
- Estimated checkpoints: 1 (Checkpoint 2 — `m54-integration-points.md`, after Task 3)
