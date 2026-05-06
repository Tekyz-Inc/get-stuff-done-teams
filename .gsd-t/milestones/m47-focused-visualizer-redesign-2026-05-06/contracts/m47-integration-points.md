# M47 Integration Points

## D1 viewer-redesign ↔ D2 server-helpers

### Top-pane main-session default load
- **D1** calls `GET /api/main-session` once on `/transcripts` page load (no spawnId in URL).
- **D2** returns the most-recently-modified `in-session-*.ndjson` (or `{ filename: null, … }` when none exist).
- **D1** then opens the existing per-spawn SSE stream against `spawnId = "in-session-{sessionId}"` to populate the top pane.
- **Checkpoint**: D2 must publish `/api/main-session` before D1 wires the top-pane default-load path. D1's split-pane scaffolding, splitter, sessionStorage plumbing, and right-rail collapsible toggle are unblocked from task 1 (they don't depend on the new endpoint).

### Rail status badges (Live vs Completed split)
- **D2** adds a `status: 'active' | 'completed'` field to entries from `listInSessionTranscripts` (and propagated through `handleTranscriptsList`).
- **D1** consumes the field in two places: (1) bucket entries into Live vs Completed sections of the left rail, (2) render the badge color/label on completed entries.
- **D1 must not** compute status itself from raw `mtimeMs` — that derivation lives in D2 so a future status-source upgrade (`success` / `failed` / `killed`) is a one-file change.
- **Checkpoint**: D2 publishes the field before D1 wires badges + section split. D1 can pre-render the section markup (empty placeholders) ahead of D2 publish.

## D1 ↔ existing M45 D2 hook (no contract change)

- The M45 D2 conversation-capture hook (`scripts/hooks/gsd-t-conversation-capture.js`) is the producer of `in-session-*.ndjson` files. M47 does not change the hook or the NDJSON frame schema (`conversation-capture-contract.md` v1.0.0 stands).
- D1 reads the existing frame schema (`SessionStart` / `UserPromptSubmit` / `Stop` / `PostToolUse` frames) for the top-pane renderer; the current `💬 conversation` rail badge logic carries forward.

## Existing back-compat surfaces preserved

- `/transcript/:spawnId` — server-side `data-spawn-id="__SPAWN_ID__"` substitution stays intact. Bookmarks and existing IDE links continue to land on the spawn pre-selected in the **bottom** pane (top pane shows main session as usual).
- `/transcript/:spawnId/stream` (SSE) and `/transcript/:spawnId/kill` — unchanged.
- `/transcripts` (rail JSON) — every existing field is preserved; M47 only adds `status` on `in-session-*` entries.

## Test mapping

- **D1 owns**: assertions on rewritten HTML structure (split-pane container, splitter handle, 3-section rail markers, top-pane main-session container, sessionStorage key contracts).
- **D2 owns**: assertions on `listInSessionTranscripts` `status` derivation (active vs completed boundary at 30s), `/api/main-session` happy-path + empty-state + path-traversal guard, and structural fields on the merged `handleTranscriptsList` output.
- **Existing 7 viewer-route/HTML tests**: must stay green. Belongs to whichever domain its assertion targets — most are server-route shape (D2-touchable) and a few are HTML structural (D1-touchable). When a test assertion straddles both, the change touches D2 first (publish field), then D1 (render it).

## Wave orchestration

Both domains are file-disjoint and can run in a single parallel wave:

- D1 files: `scripts/gsd-t-transcript.html`, viewer-structure assertions in `test/dashboard-server.test.js`
- D2 files: `scripts/gsd-t-dashboard-server.js`, server-route assertions in `test/dashboard-server.test.js`, `.gsd-t/contracts/dashboard-server-contract.md`

> **Note**: The original D1 scope document mentioned a `templates/gsd-t-transcript.html` co-edit; inspection of `bin/gsd-t.js::UTILITY_SCRIPTS` (line 1079) shows the viewer ships from `scripts/gsd-t-transcript.html` only — no templates copy exists. D1 treats the scripts copy as the single source of truth.

`test/dashboard-server.test.js` is **append-only** for both domains — each adds new test cases without modifying the other's assertions. The file-disjointness invariant holds at the assertion-block level; the file is co-edited but conflicts are mechanical.

---

## Dependency Graph (M47 task-level, after `/gsd-t-plan`)

### Independent (can start immediately, parallel within and across domains)
- D1: Task 1 (read-only context load)
- D2: Task 1 (status field), Task 2 (`/api/main-session`), Task 3 (contract docs alignment)

### First Checkpoint — D2 publishes integration surfaces
- **GATE**: D2 Task 1 + D2 Task 2 must complete (status field + `/api/main-session` endpoint live)
- **UNLOCKS**: D1 Task 4 (top-pane SSE wiring), D1 Task 5 (rail bucketing + status badges)
- **VERIFY**: hit `/api/main-session` → returns `{ filename, sessionId, mtimeMs }` shape (or `{ null, null, null }` empty state); hit `/transcripts` → in-session entries carry `status: 'active' | 'completed'`

### Second Checkpoint — D1 implementation complete
- **GATE**: D1 Tasks 2–6 complete (markup, panes, rail buckets, splitter, sessionStorage)
- **UNLOCKS**: D1 Task 7 (E2E + integration tests)
- **VERIFY**: rendered HTML carries all M47 structural markers; existing 7 viewer-route/HTML tests still pass

## Wave Execution Groups

Single parallel wave covers all M47 work — both domains run concurrently from task 1, with one cross-domain checkpoint mid-wave.

### Wave 1 — Parallel (D1 + D2 independent prefixes)
- D1: Task 1 (read context)
- D2: Task 1 (status derivation), Task 2 (/api/main-session), Task 3 (contract docs)
- D1: Task 2 (split-pane scaffolding) — starts after D1 Task 1, runs parallel to D2
- D1: Task 3 (3-section rail markup) — starts after D1 Task 2
- D1: Task 6 (splitter wiring) — starts after D1 Task 2
- **Shared files**: `test/dashboard-server.test.js` is append-only across both domains — co-edits land at different assertion blocks; mechanical merge if both touch concurrently
- **Completes when**: D1 Tasks 1–3, 6 done AND D2 Tasks 1–3 done

### Wave 1 Checkpoint — verify D2 surfaces before D1 consumes
- D2 publishes `status` field on `/transcripts` payload (Task 1)
- D2 publishes `/api/main-session` (Task 2)
- D2 contract bumped to v1.3.0 (Task 3)

### Wave 2 — D1 consumption + tests (parallel pair, then test sweep)
- D1: Task 4 (dual SSE — top pane wires `/api/main-session`)
- D1: Task 5 (rail bucketing + status badges — wires `status` field)
- D2: Tasks 4, 5 (regression tests — append-only on `test/dashboard-server.test.js`)
- **Shared files**: `test/dashboard-server.test.js` again — append-only invariant holds
- **Completes when**: All listed tasks done AND `npm test` passes

### Wave 3 — Final test sweep
- D1: Task 7 (E2E + integration tests — append-only on `test/dashboard-server.test.js`)
- **Note**: must run after both domains' implementation tasks finish; this is the success-criterion-5 fence (suite total ≥ 2047 + new M47 tests)

### Integration
- M47 has no cross-cutting "wire everything together" integration step beyond what Waves 1–3 already cover. The `/transcripts` payload + `/api/main-session` endpoint + rendered HTML compose at runtime via fetch + SSE; there is no shared module or CLI surface to wire.

## Execution Order (for solo mode)
1. D1 Task 1 (read context) — blocks all other D1 tasks
2. D2 Tasks 1, 2, 3 (parallel-safe with D1 Task 1)
3. D1 Tasks 2, 3, 6 (parallel-safe with each other within D1, parallel-safe with D2 still in flight)
4. CHECKPOINT: verify D2 publishes status + /api/main-session
5. D1 Tasks 4, 5 (parallel-safe with each other)
6. D2 Tasks 4, 5 (parallel-safe with D1 4-5; append-only test file)
7. D1 Task 7 (final fence)
