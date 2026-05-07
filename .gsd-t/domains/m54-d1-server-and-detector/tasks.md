# Tasks: m54-d1-server-and-detector

## Summary

Build the live-activity detector module + 3 dashboard endpoints + global-bin install entry + STABLE contract. 5 tasks in a sequential chain — each task builds directly on its predecessor. File ownership is 1:1 with `scope.md`. No parallelism opportunity within D1; D2 is blocked until Checkpoint 1 is PUBLISHED at T5.

## Tasks

---

### T1 — `bin/live-activity-report.cjs` core detector module

| Field | Value |
|-------|-------|
| **Status** | planned |
| **REQ** | REQ-M54-D1-01, REQ-M54-D1-03 |
| **Dependencies** | none |

**Deliverables**

| File | Action | Details |
|------|--------|---------|
| `bin/live-activity-report.cjs` | CREATE | Core detector module — `'use strict'`, `SCHEMA_VERSION = 1`, `computeLiveActivities({projectDir, now?}) → {schemaVersion, generatedAt, activities, notes}`. Detects all 4 kinds from `.gsd-t/events/<today>.jsonl` only (orchestrator JSONL wired in T2). Silent-fail invariant: every error path appends to `notes[]` and continues; detector never throws to caller. Mirror `bin/parallelism-report.cjs` header comment, constants section, `// ── Public API ──` divider, `_safeDate` helper style. |

**4 Kind Detectors (all read `.gsd-t/events/<today>.jsonl` in T1)**

| Kind | Signal | Detection Logic |
|------|--------|-----------------|
| `bash` | `run_in_background:true` sentinel in events JSONL | Every event-object with `run_in_background: true` and no matching `tool_result` event (matched by `tool_use_id`) → one `Activity` entry. |
| `monitor` | `Monitor` tool_use in events JSONL, paired with `monitor_stopped` | Open `tool_use` named `Monitor` without a matching `monitor_stopped` → one `Activity` per live watch. |
| `tool` | Any `tool_use` > 30s old without `tool_result` | `now - startedAt > 30_000` AND no `tool_result` for same `tool_use_id` → one `Activity`. |
| `spawn` | Read-through to `.gsd-t/spawns/*.json` plan files | Delegate to the same plan-file reader as `bin/parallelism-report.cjs` (factor a shared helper `_readSpawnPlans(projectDir)` if the call shape diverges; never duplicate the parsing). `endedAt` null + PID alive → `Activity`. |

**3 Liveness Falsifiers (evaluated in priority order on every entry)**

| Priority | Falsifier | When True |
|----------|-----------|-----------|
| 1 | Matching terminating event in source: `tool_result` (by `tool_use_id`), `monitor_stopped`, `spawn_completed` | Remove entry from `activities[]`. |
| 2 | PID check: `process.kill(pid, 0)` throws ESRCH (only when `pid` recorded) | Remove entry. Wrap in try/catch; non-ESRCH exceptions (e.g., EPERM) also treated as "not running" + note appended. |
| 3 | Source-file mtime > 60s old | Remove entry. Handles crash-without-terminator + no-PID cases. |

**Skeleton Dedup (T1 scope — events-only source)**
- Collect all raw activity candidates from events JSONL.
- Dedup by `tool_use_id` first; fall back to `(kind, label, startedAt)` tuple.
- Full cross-stream dedup (events UNION orchestrator JSONL) lands in T2 when second source is wired.

**`Activity` shape emitted by T1**
```
{ id, kind, label, startedAt, durationMs, tailUrl, alive, pid?, toolUseId? }
```
- `id`: prefer `tool_use_id`; else `<kind>:<sha1(label+startedAt)[:12]>`.
- `tailUrl`: `/api/live-activity/<id>/tail` (literal — handler lands in T3).
- `alive`: always `true` (dead entries are removed, not flagged).
- `pid`: present when source event included a PID field.
- `toolUseId`: present when source was a `tool_use` block.

**Silent-fail contract for T1**

| Failure | Action |
|---------|--------|
| Malformed JSONL line | Skip + append `"skipped malformed JSONL line at <path>:<lineno>"` to `notes`. |
| `.gsd-t/events/<today>.jsonl` missing | Return `{activities: [], notes: ["no events file for today"]}`. |
| `.gsd-t/spawns/*.json` unreadable | Append `"could not read spawn plan <path>: <error>"` to `notes`, continue with other sources. |
| `process.kill(pid, 0)` throws non-ESRCH | Append `"PID check error for pid <pid>: <err.code>"` to `notes`, treat as dead. |

**Must-Read Before Coding** (see constraints.md § Must Read Before Using)
- `bin/parallelism-report.cjs` — full file, for shape + silent-fail pattern.
- `scripts/hooks/gsd-t-conversation-capture.js::_readFileTail` — 64 KB tail reader re-used in T3.
- `bin/gsd-t.js::GLOBAL_BIN_TOOLS` (~ line 1178) — array D1 T4 will extend.

**Acceptance Criteria**
- [ ] `require('./bin/live-activity-report.cjs')` exports `computeLiveActivities`.
- [ ] Calling `computeLiveActivities({projectDir: '/tmp/fake'})` returns `{schemaVersion: 1, generatedAt, activities: [], notes: [...]}` without throwing.
- [ ] With a synthetic events JSONL fixture containing one `run_in_background: true` bash event and no matching `tool_result`, `activities` contains exactly 1 entry with `kind: "bash"`.
- [ ] With a synthetic monitor start/stop pair, `activities` is empty (F1 removes the stopped monitor).
- [ ] Malformed JSONL line produces a `notes` entry and does not throw.
- [ ] `npm ls --depth=0 --prod` reports no new dependencies.

---

### T2 — Orchestrator JSONL source + cross-stream dedup

| Field | Value |
|-------|-------|
| **Status** | planned |
| **REQ** | REQ-M54-D1-02 |
| **Dependencies** | T1 (detector module must exist) |

**Deliverables**

| File | Action | Details |
|------|--------|---------|
| `bin/live-activity-report.cjs` | EXTEND | Add second source stream: `~/.claude/projects/<slug>/<sid>.jsonl`. Wire slug discovery via `_slugFromTranscriptPath` / `_slugToProjectDir` imported from `scripts/hooks/gsd-t-conversation-capture.js`. UNION results from both streams before dedup. |

**Slug Discovery Logic**
1. Derive `<slug>` from `projectDir` using `_slugToProjectDir` (reverse: `_slugFromProjectDir` if exported, else recompute from the known conversion formula in the hook).
2. Glob `~/.claude/projects/<slug>/*.jsonl` for active session files (most recent mtime wins when multiple present).
3. On slug resolution failure: append note + fall through to events-only detection (partial result — never throw).

**Cross-Stream Dedup (full implementation)**

```
UNION(events_activities, orchestrator_activities)
  → group by tool_use_id (when both have it)
  → group by (kind, label, startedAt) tuple (when tool_use_id absent)
  → emit one Activity per group (merge fields: prefer orchestrator pid when present)
```

**Must-Read Before Coding**
- `scripts/hooks/gsd-t-conversation-capture.js` — focus on `_slugFromTranscriptPath` (~ line 124), `_slugToProjectDir` (~ line 88), and `module.exports` (~ line 430) to confirm both are exported.

**Acceptance Criteria**
- [ ] Same `tool_use_id` in both streams → exactly 1 entry in `activities[]`.
- [ ] Different `tool_use_id` for entries with same label/start → 2 entries (correctly distinct).
- [ ] Tuple-fallback dedup when `tool_use_id` missing on both → 1 entry.
- [ ] Missing slug (e.g., running from a temp dir) → partial result + note, no throw.
- [ ] `_slugFromTranscriptPath` and `_slugToProjectDir` are imported, not re-implemented.

---

### T3 — 3 dashboard handlers + URL routes + 5s cache

| Field | Value |
|-------|-------|
| **Status** | planned |
| **REQ** | REQ-M54-D1-04 |
| **Dependencies** | T2 (detector must be fully wired before handlers call it) |

**Deliverables**

| File | Action | Details |
|------|--------|---------|
| `scripts/gsd-t-dashboard-server.js` | EXTEND (additive) | Add `handleLiveActivity`, `handleLiveActivityTail`, `handleLiveActivityStream` + 3 route lines. No existing handler refactored. No existing route renamed. |

**Handler Specifications**

| Handler | Route | Cache | Returns |
|---------|-------|-------|---------|
| `handleLiveActivity(req, res, projectDir)` | `GET /api/live-activity` | 5s response cache (1 detector call per 5s window). `Cache-Control: no-store`. | 200 + JSON envelope. 500 only when detector module itself unavailable. |
| `handleLiveActivityTail(req, res, projectDir, id)` | `GET /api/live-activity/<id>/tail` | 5s per-id cache (`(path, id)` key). `Cache-Control: no-store`. | 200 + text/plain body. 400 on invalid `<id>`. 404 on unknown id. |
| `handleLiveActivityStream(req, res, projectDir, id)` | `GET /api/live-activity/<id>/stream` | Uncached (SSE). | `Content-Type: text/event-stream`. 15s heartbeat ping. Closes when activity removed. 400 on invalid `<id>`. |

**Tail Content by Kind**
- `bash`: last ~64 KB stdout/stderr — use `_readFileTail` pattern from `gsd-t-conversation-capture.js` (open fd, seek to `size - 65536`, drop partial leading line).
- `monitor`: last 200 lines of the watched output.
- `tool`: JSON snapshot of the `tool_use` block contents.
- `spawn`: last ~64 KB of the spawn's stream-json transcript.

**Path-Traversal Guard (`isValidActivityId`)**
```js
function isValidActivityId(id) {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 256) return false;
  if (id.indexOf('..') !== -1) return false;
  if (id.indexOf('/') !== -1) return false;
  if (id.indexOf('\\') !== -1) return false;
  if (id.indexOf('\0') !== -1) return false;
  return true;
}
```
Applied at the start of `handleLiveActivityTail` and `handleLiveActivityStream` before any fd is opened or any path is constructed.

**5s Cache Implementation**
- Mirror the existing `/api/parallelism` cache: one `Map` keyed by `(method, path, projectDir)` for the list endpoint; `Map` keyed by `(path, projectDir, id)` for tail.
- `Date.now()` delta < 5000ms → return cached body. Else invoke detector/reader + overwrite cache entry.
- SSE stream: no cache object; connection held open, incremental reads every 1s, 15s heartbeat ping frame.

**Route Insertion Point**
- Dispatcher block in `scripts/gsd-t-dashboard-server.js` at ~ line 880, just after the `/api/parallelism/report` route. 3 new `else if` branches added, no existing branch touched.

**Must-Read Before Coding**
- `scripts/gsd-t-dashboard-server.js::handleParallelism` (~ line 635) — envelope shape, cache pattern, `Cache-Control: no-store` header.
- `scripts/gsd-t-dashboard-server.js` URL dispatcher (~ line 880) — insertion point.
- `scripts/hooks/gsd-t-conversation-capture.js::_readFileTail` (~ line 70) — 64 KB tail reader.

**Acceptance Criteria**
- [ ] `GET /api/live-activity` returns 200 + JSON with `schemaVersion: 1` on running dashboard.
- [ ] Two requests within 5s window → single detector invocation (cache verified by test spy).
- [ ] `GET /api/live-activity/bad..id/tail` returns 400 + `{error: "invalid_id"}`.
- [ ] `GET /api/live-activity/<id>/stream` returns `Content-Type: text/event-stream`.
- [ ] No existing handler or route modified (verified by `git diff` showing only additive lines).

---

### T4 — `bin/gsd-t.js` `GLOBAL_BIN_TOOLS` array entry + hot-patch verification

| Field | Value |
|-------|-------|
| **Status** | planned |
| **REQ** | REQ-M54-D1-05 |
| **Dependencies** | T1 (module file must exist on disk before install machinery copies it) |

**Deliverables**

| File | Action | Details |
|------|--------|---------|
| `bin/gsd-t.js` | EXTEND (1-line) | Append `"live-activity-report.cjs"` to the `GLOBAL_BIN_TOOLS` array. No other change. |

**Verification Steps (run after the edit)**
1. Run `node bin/gsd-t.js install` (or the equivalent `installGlobalBinTools()` call path) → confirm `~/.claude/bin/live-activity-report.cjs` is written.
2. Run `node bin/gsd-t.js doctor` → confirm `checkDoctorGlobalBin()` output includes `live-activity-report.cjs OK`.
3. Run `node -e "require('./bin/live-activity-report.cjs')"` from `~/.claude/` to verify the installed copy loads cleanly.

**Why 1-line only**: `installGlobalBinTools()` already iterates over the `GLOBAL_BIN_TOOLS` array and copies each `.cjs` file from `bin/` to `~/.claude/bin/`. `checkDoctorGlobalBin()` already checks each entry. Added in v3.23.11 specifically to prevent the `parallelism-report.cjs` gap from recurring (see `project_global_bin_propagation_gap.md`).

**Acceptance Criteria**
- [ ] `GLOBAL_BIN_TOOLS` array contains `"live-activity-report.cjs"` (confirmed by grep).
- [ ] `~/.claude/bin/live-activity-report.cjs` exists and is readable post-install.
- [ ] `gsd-t doctor` reports no missing global bin tools.
- [ ] `git diff bin/gsd-t.js` shows exactly 1 line added (no other changes).
- [ ] `npm ls --depth=0 --prod` still reports no new dependencies.

---

### T5 — `live-activity-contract.md` STABLE + tests + Checkpoint 1 publication

| Field | Value |
|-------|-------|
| **Status** | planned |
| **REQ** | REQ-M54-D1-06 |
| **Dependencies** | T1, T2, T3, T4 (all D1 implementation complete before contract flips) |

**Deliverables**

| File | Action | Details |
|------|--------|---------|
| `test/m54-d1-live-activity-report.test.js` | CREATE | ≥10 unit test cases for `computeLiveActivities`. Named exactly as listed in `live-activity-contract.md §11`. |
| `test/m54-d1-dashboard-handlers.test.js` | CREATE | ≥5 unit test cases for the 3 handlers. Named exactly as listed in `live-activity-contract.md §11`. |
| `.gsd-t/contracts/live-activity-contract.md` | EDIT | Version `0.1.0 PROPOSED` → `1.0.0 STABLE`. Status `PROPOSED` → `STABLE`. All schema fields, endpoint signatures, dedup rules, falsifier order confirmed 1:1 with implementation. |
| `.gsd-t/contracts/m54-integration-points.md` | EDIT | Checkpoint 1 status `PROPOSED` → `PUBLISHED`. Timestamp added. All 7 definition-of-done checkboxes ticked. |
| `docs/architecture.md` | EDIT | Finalise § "Live Activity Observability (M54)" — endpoint signatures, `~/.claude/bin/` install path, liveness falsifier summary. Cross-reference already drafted from M54 DEFINE; T5 fills in the implementation-confirmed details. |

**Test Case Catalogue (`test/m54-d1-live-activity-report.test.js` — ≥10 cases)**

| Test Name | Pinned Contract Section | What It Proves |
|-----------|------------------------|----------------|
| `detect-bash-from-events-jsonl` | §1 bash kind | Synthetic JSONL with `run_in_background:true` + no `tool_result` → 1 entry `kind:"bash"`. |
| `detect-monitor-paired-start-stop` | §1 monitor kind + §3 F1 | Start+stop pair → 0 entries (F1 removes). |
| `detect-tool-over-30s` | §1 tool kind | `tool_use` event with `startedAt` 31s before `now` + no `tool_result` → 1 entry `kind:"tool"`. |
| `detect-spawn-via-spawn-plan-files` | §1 spawn kind | Synthetic `.gsd-t/spawns/plan-test.json` with `endedAt: null` → 1 entry `kind:"spawn"`. |
| `dedup-tool-use-id-priority` | §2 priority 1 | Same `tool_use_id` in events JSONL and orchestrator JSONL → 1 entry (not 2). |
| `dedup-tuple-fallback` | §2 priority 2 | Matching `(kind, label, startedAt)` across streams when `tool_use_id` absent → 1 entry. |
| `falsifier-explicit-terminator` | §3 F1 | `tool_use` followed by matching `tool_result` in next line → 0 entries. |
| `falsifier-pid-esrch` | §3 F2 | Stub `process.kill(pid, 0)` to throw `ESRCH` → entry removed. |
| `falsifier-mtime-stale` | §3 F3 | Provide events file with mtime > 60s ago → entry removed (no PID in synthetic event). |
| `silent-fail-malformed-jsonl` | §7 | One malformed JSON line in events JSONL → `notes[]` has 1 entry, `activities` from valid lines still returned, no exception thrown. |
| `silent-fail-missing-slug` | §7 | Project dir that resolves to no `~/.claude/projects/<slug>/` → partial result (events-only) + note, no exception. |
| `silent-fail-unreadable-file` | §7 | Unreadable spawn plan file (ENOENT mid-glob) → note appended, other entries still returned. |

**Test Case Catalogue (`test/m54-d1-dashboard-handlers.test.js` — ≥5 cases)**

| Test Name | Pinned Contract Section | What It Proves |
|-----------|------------------------|----------------|
| `api-live-activity-200-empty` | §4 envelope shape | Detector returns `[]` → handler returns 200 + `{schemaVersion:1, activities:[], notes:[]}`. |
| `api-live-activity-populated` | §4 envelope shape | Detector returns 1 entry → handler returns 200 + `activities` length 1. |
| `api-live-activity-5s-cache` | §6 cache | 2 requests within 5s → detector invoked exactly once (spy assertion). |
| `tail-rejects-path-traversal` | §8 | `GET /api/live-activity/../../etc/passwd/tail` → 400 + `{error:"invalid_id"}`, no fd opened. |
| `stream-sse-content-type` | §5 SSE | `GET /api/live-activity/<id>/stream` → response `Content-Type: text/event-stream`. |
| `500-only-on-contract-regression` | §7 | Stub detector module to throw → handler returns 500. Stub detector to return malformed data → handler returns 200 (silent-fail boundary). |
| `tail-200-valid-id` | §5 tail | Valid known id → 200 + non-empty text/plain body. |
| `tail-404-unknown-id` | §5 tail | Valid format id not in activities → 404. |

**Contract Flip (`.gsd-t/contracts/live-activity-contract.md`)**
- Header: `Version: 1.0.0`, `Status: STABLE`, `Last updated: 2026-05-07`.
- Verify all 17 test-catalogue rows in §11 match the test file names exactly.
- Verify §4 schema fields match the `Activity` shape in `computeLiveActivities` output exactly.
- Verify §5 endpoint signatures match the handlers in `gsd-t-dashboard-server.js` exactly.

**Checkpoint 1 Publication (`.gsd-t/contracts/m54-integration-points.md`)**
- Checkbox all 7 Checkpoint 1 definition-of-done items.
- Change `Checkpoint 1 Status: PROPOSED` → `PUBLISHED`.
- Add timestamp: `Published: 2026-05-07 HH:MM PDT` (live clock at commit time).

**Acceptance Criteria**
- [ ] `npm test` passes — all existing 2233+ tests green + ≥10 new detector tests + ≥5 new handler tests.
- [ ] `live-activity-contract.md` header shows `Version: 1.0.0` and `Status: STABLE`.
- [ ] `m54-integration-points.md` Checkpoint 1 marked PUBLISHED with timestamp.
- [ ] `docs/architecture.md` § "Live Activity Observability (M54)" contains endpoint signatures and `~/.claude/bin/` install path.
- [ ] REQ-M54-D1-06 in `docs/requirements.md` status column flipped `planned → done`.
- [ ] D2 can start: contract STABLE, all 3 endpoints return 200 on running dashboard, `~/.claude/bin/live-activity-report.cjs` readable.

---

## Execution Estimate

| Metric | Value |
|--------|-------|
| Total tasks | 5 |
| Independent tasks (no blockers) | 1 (T1) |
| Sequential chain | T1 → T2 → T3 → T4 → T5 |
| Parallelism | None within D1 — each task's output is the next task's input |
| Checkpoints emitted | 1 (Checkpoint 1, after T5) |
| New files | `bin/live-activity-report.cjs`, `test/m54-d1-live-activity-report.test.js`, `test/m54-d1-dashboard-handlers.test.js` |
| Modified files | `scripts/gsd-t-dashboard-server.js` (additive), `bin/gsd-t.js` (1-line additive), `.gsd-t/contracts/live-activity-contract.md` (flip), `.gsd-t/contracts/m54-integration-points.md` (Checkpoint 1 flip), `docs/architecture.md` (additive) |
| External deps added | 0 |
