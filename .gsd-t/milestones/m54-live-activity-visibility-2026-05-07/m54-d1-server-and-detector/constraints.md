# Constraints: m54-d1-server-and-detector

## Must Follow

- **Mirror `bin/parallelism-report.cjs` shape line-for-line.** `live-activity-report.cjs` opens with the same `'use strict'`, the same `SCHEMA_VERSION = 1` constant, the same envelope shape (`{schemaVersion, generatedAt, ..., notes}`), the same silent-fail-with-`notes[]` pattern, the same `// ── Public API ──` divider style. Operators learn one detector pattern.
- **Zero runtime deps.** Per project CLAUDE.md § Don't, no new external npm dep enters `bin/` or `scripts/`. `live-activity-report.cjs` is `require('fs')` + `require('path')` + the existing slug helpers — nothing else. `package.json` `dependencies` stays empty.
- **Silent-fail invariant.** Malformed JSONL line → skip + note. Missing slug → return partial + note. Unreadable file → return partial + note. PID-check exception → assume "not running" + note. Detector NEVER throws to its caller. The dashboard handler returns 500 only on contract regression (e.g., detector module unavailable, NOT on data malformation).
- **5-second response cache** on `/api/live-activity` and per-id `/api/live-activity/<id>/tail`. SSE stream is uncached. Match the `/api/parallelism` cadence — D2's rail polls at the same 5s tick.
- **Path-traversal guard on every `<id>`.** Reuse the existing `_slugToProjectDir` rejection pattern: reject `<id>` containing `..`, `/`, `\`, or NUL. Never construct a filesystem path from `<id>` without canonicalising first. Reject before opening any fd.
- **Liveness falsifier order is fixed.** Priority: (1) explicit terminating event arrived (`tool_result`, `monitor_stopped`, `spawn_completed`); (2) PID check fails for kinds that recorded a PID; (3) source-file mtime > 60s old. Entry leaves `activities[]` when ANY falsifier returns true. Order is contractual and tested.
- **Dedup priority is fixed.** Prefer `tool_use_id` when both source streams emit the same id. Fall back to `(kind, label, startedAt)` tuple when `tool_use_id` is absent. Tested both directions.
- **Additive-only edits everywhere.** `scripts/gsd-t-dashboard-server.js` gains 3 new handlers + 3 new route lines. No existing handler refactored. No existing route renamed. No existing import reorganised. `bin/gsd-t.js` gains 1 array entry — nothing else.
- **Universal token capture.** No `Task(...)` / `claude -p` / `spawn('claude', …)` in this domain — pure tooling, no subagents.

## Must Not

- **Modify any file under D2's ownership.** No edits to `scripts/gsd-t-transcript.html`, `e2e/live-journeys/`, or `.gsd-t/journey-manifest.json`. If D1 wants to verify rail rendering, escalate to D2 — never patch the HTML directly.
- **Re-implement slug decoding.** `_slugFromTranscriptPath` and `_slugToProjectDir` already exist in `scripts/hooks/gsd-t-conversation-capture.js` and are exported via `module.exports`. Import them. Never copy-paste their logic.
- **Re-implement spawn-plan reading.** `bin/parallelism-report.cjs` already reads `.gsd-t/spawns/*.json`. The `spawn` kind delegates to that reader (factor a small shared helper if needed, but never duplicate the parsing).
- **Add a CLI dispatch branch in `bin/gsd-t.js`.** D1 only adds the array entry; the existing `installGlobalBinTools()` machinery handles install. No new `gsd-t live-activity` subcommand.
- **Re-implement the tail reader.** Reuse the file-tail pattern from `scripts/hooks/gsd-t-conversation-capture.js::_readFileTail` — open fd, seek to `size - 65536`, drop mid-line leading partial. Imported, not duplicated.
- **Bypass the silent-fail invariant in tests.** Tests must assert that bad inputs produce `notes[]` entries + partial results, not exceptions. A test that asserts `assert.throws` on a malformed-JSONL-line case is wrong by contract.
- **Touch `.gsd-t/spawns/*.json` plan files.** Read-only. D1 reads them through the existing parallelism-report machinery; never writes them.
- **Add a new external runtime dep.** `package.json` `dependencies` stays empty. Verified by post-task `npm ls --depth=0 --prod`.

## Must Read Before Using

- `bin/parallelism-report.cjs` — full file. The shape D1 mirrors line-for-line: header comment block, `SCHEMA_VERSION` constant, public-API divider, `compute*Metrics({projectDir, now}) → envelope` signature, silent-fail-via-notes pattern, `_safeDate` helper style.
- `scripts/gsd-t-dashboard-server.js::handleParallelism` (~ line 635) and `handleParallelismReport` (~ line 670) — the existing handler shape D1 mirrors: `Cache-Control: no-store`, JSON envelope write, error-handling that returns 500 only on contract regression.
- `scripts/gsd-t-dashboard-server.js` URL dispatcher (~ line 880) — additive route insertion point, just after `/api/parallelism/report`.
- `scripts/hooks/gsd-t-conversation-capture.js::_slugFromTranscriptPath` (~ line 124) and `_slugToProjectDir` (~ line 88) — slug-decode helpers D1 imports. D1 reads `module.exports` (~ line 430) to confirm both are exported.
- `scripts/hooks/gsd-t-conversation-capture.js::_readFileTail` (~ line 70) — the 64-KB tail-read pattern D1 reuses for `handleLiveActivityTail`.
- `bin/gsd-t.js::GLOBAL_BIN_TOOLS` (~ line 1178) and `installGlobalBinTools()` (~ line 1180) — install machinery already in place; D1 only adds the array entry.
- `bin/gsd-t.js::checkDoctorGlobalBin` (~ line 2765) — covers the new module automatically once the array gains the entry.

## Dependencies

- **Depends on**: v3.23.11 `GLOBAL_BIN_TOOLS` install machinery (lands in M54 from existing infra — no D1 work needed beyond the array entry). Reads `_slugFromTranscriptPath` / `_slugToProjectDir` / `_readFileTail` from the conversation-capture hook (untouched). Reads spawn-plan parsing from `bin/parallelism-report.cjs` (untouched, factored helper if the call shape diverges).
- **Depended on by**: D2 (endpoint contract, JSON envelope shape, installed module path).

## Branch & Commit

- **Expected branch**: `main` (in-session single-day build, per milestone definition § "in-session-build").
- **Commit cadence**: one commit per task (5 tasks in D1). Each commit's Pre-Commit Gate verifies test + doc updates + contract version bump (PROPOSED → STABLE on T5).
- **Doc-ripple set** (D1's share): `docs/architecture.md` § "Live Activity Observability (M54)" subsection (cross-reference is already drafted in M54 DEFINE; D1 finalises with the live endpoint signatures + `~/.claude/bin/` install path), `CHANGELOG.md` Unreleased entry, `.gsd-t/contracts/live-activity-contract.md` v0.1.0 → v1.0.0 STABLE on T5, `m54-integration-points.md` Checkpoint 1 PROPOSED → PUBLISHED on T5.
