# Domain: m54-d1-server-and-detector

## Responsibility

Build the **server-side observability layer** for live activity. Walks the orchestrator transcript JSONL + project event JSONL, detects the four "live activity" kinds (`bash`, `monitor`, `tool`, `spawn`), dedupes by `tool_use_id` (preferred) or `(kind, label, startedAt)` tuple (fallback), enforces the 3-falsifier liveness check (terminating event > PID check > mtime > 60s), exposes results through three new dashboard endpoints, and ships the STABLE contract that D2 reads from.

This is the *detection + transport* half of M54. D2 is the *render + verify* half (the rail UI + 2 live-journey specs that probe the running endpoints).

## Owned Files/Directories

- `bin/live-activity-report.cjs` — pure read-only detector module (NEW).
  - Mirrors `bin/parallelism-report.cjs` shape line-for-line: zero deps, `.cjs` for dual-loader compat, `'use strict'`, schema-versioned envelope, silent-fail invariant.
  - Exports `computeLiveActivities({projectDir, now?}) → {schemaVersion: 1, generatedAt, activities: Activity[], notes: string[]}`.
  - `Activity = {id, kind, label, startedAt, durationMs, tailUrl, alive, pid?, toolUseId?}`.
  - Detects 4 kinds:
    - `bash` — `run_in_background:true` sentinel in `.gsd-t/events/<today>.jsonl` OR orchestrator JSONL `tool_use` named `Bash` with no matching `tool_result`.
    - `monitor` — `Monitor` tool start/stop pairing across both source streams.
    - `tool` — any orchestrator-JSONL `tool_use` block > 30s old without a matching `tool_result`.
    - `spawn` — read-through to existing `.gsd-t/spawns/*.json` plan files (delegates to current parallelism-report-style readers; never re-implements them).
  - Source-of-truth UNION over `.gsd-t/events/*.jsonl` + `~/.claude/projects/<slug>/<sid>.jsonl`. Slug discovered via existing `_slugFromTranscriptPath` / `_slugToProjectDir` helpers re-exported from `scripts/hooks/gsd-t-conversation-capture.js`.
  - Silent-fail invariant: malformed JSONL line skipped + appended to `notes[]`, missing slug logged + return partial, unreadable file noted + continue. Never throws.

- `scripts/gsd-t-dashboard-server.js` — additive only (NEW handlers + URL routes; no existing handler refactored).
  - New handler `handleLiveActivity(req, res, projectDir)` mirroring `handleParallelism` shape: 5s response cache, `Cache-Control: no-store`, JSON envelope, returns 500 only on contract regression (never on data malformation).
  - New handler `handleLiveActivityTail(req, res, projectDir, id)`: returns last ~64 KB stdout/stderr for `bash` kind, last 200 lines for `monitor` kind. Per-id 5s cache. Path-traversal guard on `<id>`.
  - New handler `handleLiveActivityStream(req, res, projectDir, id)`: SSE that follows the tail (long-poll fd-based incremental read).
  - New URL routes in the existing dispatcher block:
    - `GET /api/live-activity` → `handleLiveActivity`.
    - `GET /api/live-activity/<id>/tail` → `handleLiveActivityTail`.
    - `GET /api/live-activity/<id>/stream` → `handleLiveActivityStream`.
  - All routes guard `<id>` against path traversal (`..`, `/`, `\`, NUL — pattern from `_slugToProjectDir`).

- `bin/gsd-t.js` — additive only.
  - `GLOBAL_BIN_TOOLS` array gains the literal string `"live-activity-report.cjs"` (1-line edit).
  - No new wiring code needed — the existing `installGlobalBinTools()` and `checkDoctorGlobalBin()` automatically iterate over the array (built for this in v3.23.11).
  - No CLI dispatch branch, no doctor flag, no installer wiring beyond the array entry.

- `.gsd-t/contracts/live-activity-contract.md` — NEW.
  - v0.1.0 PROPOSED at partition time (placeholder fields filled by this command).
  - Flips to v1.0.0 STABLE on D1 task-5.
  - Sections: 4 kinds catalogue, dedup rules, liveness falsifiers, JSON schema for `/api/live-activity` envelope + tail + stream payloads, all 3 endpoint signatures, cache invariants, silent-fail invariant, `<id>` path-traversal defense.

- `test/m54-d1-live-activity-report.test.js` — NEW unit tests (~10 cases).
  - Detector returns envelope with `schemaVersion: 1`.
  - Each of the 4 kinds detected from a synthetic JSONL fixture.
  - Dedup by `tool_use_id` (preferred) — 2 source streams, same id, single result.
  - Dedup fallback by `(kind, label, startedAt)` tuple when `tool_use_id` missing.
  - Liveness falsifier 1: explicit `tool_result` removes entry.
  - Liveness falsifier 2: PID check fails (`process.kill(pid, 0)` throws ESRCH) — entry removed for kinds that record PID.
  - Liveness falsifier 3: source file mtime > 60s old — entry removed.
  - Silent-fail on malformed JSONL line — partial result + note.
  - Silent-fail on missing slug — partial result + note.
  - Silent-fail on unreadable file — partial result + note.

- `test/m54-d1-dashboard-handlers.test.js` — NEW handler tests (~8 cases).
  - `/api/live-activity` returns 200 + schema-versioned envelope when detector empty.
  - `/api/live-activity` returns 200 + populated `activities[]` when detector emits entries.
  - `/api/live-activity` 5s cache: 2 calls within window → second is cached (single detector invocation).
  - `/api/live-activity/<id>/tail` returns 200 + body for valid id; bash variant returns last ~64 KB.
  - `/api/live-activity/<id>/tail` rejects `<id>` containing `..`, `/`, `\`, NUL → 400.
  - `/api/live-activity/<id>/stream` opens SSE channel and streams new lines.
  - 500 only on contract regression (e.g., detector throws despite silent-fail invariant — simulated by stubbing the import).
  - 200 + empty `activities[]` on detector returning empty array.

## NOT Owned (do not modify)

- `scripts/gsd-t-transcript.html` — D2 owns. (D1 only emits the JSON D2 fetches.)
- `e2e/live-journeys/*.spec.ts` — D2 owns. (D1 ships unit tests; D2 ships live-setup specs.)
- `.gsd-t/journey-manifest.json` — D2 owns the manifest entries for D2's specs.
- `bin/parallelism-report.cjs` — read-only template; D1 mirrors its shape but never edits it.
- `scripts/hooks/gsd-t-conversation-capture.js` — read-only source of `_slugFromTranscriptPath` / `_slugToProjectDir` helpers. D1 imports them; never edits the hook.
- Production viewer/server runtime code outside the new handler block — D1 ships zero refactors of existing handlers, parsers, routes, or HTML.

## Public API (what D2 consumes)

D2 consumes D1 only at the contract boundary:

1. **The endpoint contract** documented in `.gsd-t/contracts/live-activity-contract.md`. D2's rail JS fetches `/api/live-activity` every 5s, calls `tailUrl` on click, opens `streamUrl` for SSE follow.
2. **The JSON envelope shape**: `{schemaVersion, generatedAt, activities: [{id, kind, label, startedAt, durationMs, tailUrl, alive, pid?, toolUseId?}], notes}`. D2 pins the shape for its render-loop and its assertion vocabulary in the live-journey specs.
3. **The installed module path**: `~/.claude/bin/live-activity-report.cjs` resolved by the global dashboard. D2's specs (and the SSE handler in D1) assume this path is populated post-`gsd-t install` / `gsd-t update`.
