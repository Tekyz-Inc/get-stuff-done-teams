# Live Activity Contract

- **Version**: 1.0.0
- **Status**: STABLE
- **Owner**: `m54-d1-server-and-detector`
- **Consumers**: `m54-d2-rail-and-spec` (rail JS + 2 live-journey specs), future cross-project aggregation (M55 candidate)
- **Last updated**: 2026-05-07

## Purpose

Document the contract between the live-activity detector + 3 dashboard endpoints (D1) and every consumer (the viewer rail in D2; future cross-project rollups). This contract is the only cross-domain interface in M54 — there is no shared source file. The rail is a read-only consumer of `/api/live-activity*`; D2 ships zero detector logic.

This v0.1.0 PROPOSED draft establishes the locked shape so D2 can plan against it. D1 ships v1.0.0 STABLE on task-5 once the implementation matches the contract 1:1; no schema field is renamed mid-stream.

---

## §1 — Kinds Catalogue

The detector recognises exactly four kinds of live activity. Each `Activity` entry in the envelope's `activities[]` carries a `kind` field set to one of these literal strings.

| Kind     | Source signal | Detection rule | Liveness |
|----------|---------------|----------------|----------|
| `bash`   | `run_in_background:true` sentinel in `.gsd-t/events/<today>.jsonl` OR orchestrator JSONL `tool_use` named `Bash` with no matching `tool_result` | One entry per backgrounded bash invocation. `label` derived from the command string (truncated to 40 chars by D2 — D1 returns full). | Falsifier 1: matching `tool_result` arrived. Falsifier 2 (when PID known): `process.kill(pid, 0)` throws ESRCH. Falsifier 3: source-file mtime > 60s old. |
| `monitor`| Orchestrator JSONL OR events JSONL `tool_use` named `Monitor`, paired with a `monitor_stopped` event or its `tool_result`. | One entry per active Monitor watch. `label` = the watched-path or watched-process descriptor. | Falsifier 1: matching `monitor_stopped` / `tool_result`. Falsifier 2: PID gone (when recorded). Falsifier 3: source mtime stale. |
| `tool`   | Any orchestrator-JSONL `tool_use` block whose `startedAt` is > 30s ago AND no matching `tool_result` has been seen. | Catches the long-tail of slow tool calls (file uploads, long Reads, heavy Greps) that aren't `Bash` or `Monitor`. | Same 3 falsifiers; a `tool_result` with the matching `tool_use_id` is the canonical terminator. |
| `spawn`  | Read-through to existing `.gsd-t/spawns/*.json` plan files (delegates to the same readers `bin/parallelism-report.cjs` uses). | One entry per active detached `claude -p` worker. `label` = plan id + command. | Falsifier 1: spawn plan's `endedAt` is non-null. Falsifier 2: plan PID gone. Falsifier 3: spawn-plan-file mtime stale. |

**Source-of-truth UNION**: the detector reads BOTH `.gsd-t/events/<date>.jsonl` files (project-local heartbeats — written by hooks) AND `~/.claude/projects/<slug>/<sid>.jsonl` (Claude Code orchestrator transcript). The slug is discovered via `_slugFromTranscriptPath` / `_slugToProjectDir` re-exported from `scripts/hooks/gsd-t-conversation-capture.js`.

---

## §2 — Dedup Rules

When the same activity is observable in both source streams (e.g., a `tool_use` recorded in the orchestrator JSONL AND a sentinel event in `.gsd-t/events/<date>.jsonl`), the detector must emit it exactly once.

### Priority 1 — `tool_use_id`

If both stream entries carry the same `tool_use_id`, emit a single `Activity` with that id. The `tool_use_id` is the tiebreaker.

### Priority 2 — `(kind, label, startedAt)` tuple fallback

If `tool_use_id` is absent (e.g., `spawn` kind reads from `.gsd-t/spawns/*.json` which has no `tool_use_id`, or a synthetic event was written without one), dedupe by the tuple `(kind, label, startedAt)`.

### Tested invariants

- Same `tool_use_id` in both streams → single result.
- Different `tool_use_id` for entries with same label/start → two results (correctly distinct).
- Tuple match across streams when `tool_use_id` missing → single result.

---

## §3 — Liveness Falsifiers

The detector decides whether an entry stays in `activities[]` by evaluating three falsifiers in this priority order. ANY falsifier returning true removes the entry.

| Order | Falsifier | Notes |
|-------|-----------|-------|
| 1 | An explicit terminating event arrived: `tool_result` (matched by `tool_use_id`), `monitor_stopped`, or `spawn_completed`. | The canonical signal. Cheapest check. |
| 2 | PID check fails: `process.kill(pid, 0)` throws ESRCH. | Only applies when the `Activity` recorded a `pid` (most kinds will). Wraps in try/catch — exception path treats "not running". |
| 3 | Source-file mtime > 60s old. | Catches the case where the originating process crashed without writing a terminator and we have no PID (e.g., synthetic event with no PID field). 60s buffer matches the 5s polling cadence × 12 windows of grace. |

**Tested invariants**:
- A `tool_use` with a matching `tool_result` line written 1ms later is removed by F1 in the next detector pass (no PID check needed).
- A `bash` whose PID was killed externally — but no `tool_result` was written — is removed by F2.
- A synthetic event with no PID and a stale (>60s) source file is removed by F3.

**Order matters**: if F1 says "terminated" but F2 would say "still running" (because someone reused the PID), F1 wins because the explicit terminator is canonical.

---

## §4 — JSON Schema

### `/api/live-activity` response envelope

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-07T22:11:00.000Z",
  "activities": [
    {
      "id": "tooluse_01ABC...",
      "kind": "bash",
      "label": "node scripts/gsd-t-dashboard-server.js",
      "startedAt": "2026-05-07T22:10:42.000Z",
      "durationMs": 18000,
      "tailUrl": "/api/live-activity/tooluse_01ABC.../tail",
      "alive": true,
      "pid": 41782,
      "toolUseId": "tooluse_01ABC..."
    }
  ],
  "notes": []
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `schemaVersion` | integer | yes | Bumps on breaking change. v1 is the inaugural shape. |
| `generatedAt` | ISO 8601 string | yes | UTC, millisecond precision. The `now` parameter (or `new Date()`) at the moment `computeLiveActivities` ran. |
| `activities` | Activity[] | yes | May be `[]`. Order is unspecified — D2 sorts by `startedAt` for stable rendering. |
| `notes` | string[] | yes | Silent-fail messages. May be `[]`. Each entry is human-readable. Examples: `"skipped malformed JSONL line at events/2026-05-07.jsonl:42"`, `"orchestrator slug unresolvable for cwd=/tmp/foo"`. |

#### Activity field shape

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | URL-safe, path-traversal-rejected by handler. Prefer `tool_use_id` when available; otherwise `<kind>:<sha1(label+startedAt)[:12]>`. |
| `kind` | enum: `"bash"` \| `"monitor"` \| `"tool"` \| `"spawn"` | yes | The 4 kinds in §1. |
| `label` | string | yes | Human-readable. D1 emits full; D2 truncates to 40 chars for the rail. |
| `startedAt` | ISO 8601 string | yes | UTC. The activity's start timestamp. |
| `durationMs` | integer | yes | Computed at `generatedAt - startedAt`. D2 displays a live wall-clock counter independent of this field (uses `startedAt` directly). |
| `tailUrl` | string | yes | Always present. Format: `/api/live-activity/<id>/tail`. Click handler in D2 uses this verbatim. |
| `alive` | boolean | yes | Always `true` in current envelope (entries are removed when they die — `false` is reserved for future "stale-but-still-shown" semantics). |
| `pid` | integer | optional | Present for kinds that recorded a PID at start. Absent for synthetic events. |
| `toolUseId` | string | optional | Present when the activity originated from a `tool_use` block. Used for cross-stream dedup (§2). |

### `/api/live-activity/<id>/tail` response

For `bash`: last ~64 KB of the captured stdout/stderr buffer (text/plain).
For `monitor`: last 200 lines of the watched output (text/plain).
For `tool`: a JSON snapshot of the tool_use block contents (JSON object).
For `spawn`: last ~64 KB of the spawn's stream-json transcript (text/plain).

5-second per-id response cache.

### `/api/live-activity/<id>/stream` response

`Content-Type: text/event-stream`. SSE frames carrying incremental new content. Frame format per kind matches the tail endpoint's content type. Heartbeat ping every 15s to keep proxies alive. Connection closes when the activity is removed from the next detector pass.

---

## §5 — Endpoint Signatures

| Method + Path | Handler | Cache | Rejection rules |
|---------------|---------|-------|-----------------|
| `GET /api/live-activity` | `handleLiveActivity(req, res, projectDir)` | 5s response cache (1 detector call per 5s window). `Cache-Control: no-store` (browser-side). | None on shape — silent-fail invariant. Returns 500 only on contract regression (e.g., detector module unavailable). |
| `GET /api/live-activity/<id>/tail` | `handleLiveActivityTail(req, res, projectDir, id)` | 5s per-id cache. | `<id>` containing `..`, `/`, `\`, or NUL → 400. Unknown id → 404. |
| `GET /api/live-activity/<id>/stream` | `handleLiveActivityStream(req, res, projectDir, id)` | Uncached (SSE). | Same `<id>` path-traversal rejection. Connection closes when activity removed. |

All three handlers live in `scripts/gsd-t-dashboard-server.js`. The dispatcher block (~ line 880) gains 3 new route lines — additive only, no existing route refactored.

---

## §6 — Cache Invariants

- **Response-level cache**: `/api/live-activity` and `/api/live-activity/<id>/tail` cache for 5 seconds. Within the window, a second request returns the cached envelope/body without re-invoking the detector or re-reading the source files.
- **Cache key**: `(method, path, projectDir)` for the list endpoint; `(method, path, projectDir, id)` for tail.
- **Stream is uncached**: SSE consumers receive every new incremental frame as the source file grows. The 5s cache does not apply.
- **Browser hint**: `Cache-Control: no-store` set on all three responses — the cache is server-side only; browsers must not cache.
- **Cache eviction**: on each new detector invocation, the previous cache for the same key is overwritten. No TTL beyond the 5s window.

---

## §7 — Silent-Fail Invariant

The detector NEVER throws to its caller. Every recoverable failure goes through the `notes[]` channel and produces a partial result.

| Failure mode | Detector action |
|--------------|-----------------|
| Malformed JSONL line | Skip the line, append `"skipped malformed JSONL line at <path>:<lineno>"` to `notes`, continue. |
| Missing `~/.claude/projects/<slug>/` | Append `"orchestrator slug unresolvable for cwd=<projectDir>"` to `notes`, return whatever was readable from `.gsd-t/events/`. |
| Unreadable file (permissions, ENOENT mid-read) | Append `"could not read <path>: <error>"` to `notes`, continue with other sources. |
| `process.kill(pid, 0)` throws an exception other than ESRCH (e.g., EPERM) | Treat as "not running" (conservative — favours hiding stale entries over showing zombies), append note. |
| `_slugFromTranscriptPath` rejects a slug | Append `"rejected slug: <reason>"` to `notes`, fall through to `.gsd-t/events/`-only detection. |

The dashboard handler (`handleLiveActivity`) returns 500 ONLY when the detector module itself is unavailable (e.g., `~/.claude/bin/live-activity-report.cjs` missing — recovered by `gsd-t install`). Data-malformation errors NEVER produce a 500.

---

## §8 — Path-Traversal Defense

Every `<id>` in `/api/live-activity/<id>/tail` and `/api/live-activity/<id>/stream` is validated before any filesystem path is constructed.

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

Pattern matches `_slugToProjectDir`'s rejection rules. Any `<id>` failing this check → handler responds 400 + `{error: "invalid_id"}` and returns early. NO fd is opened, NO path is canonicalised, NO disk activity occurs before validation.

---

## §9 — Install Location

The detector module installs to:

```
~/.claude/bin/live-activity-report.cjs
```

…via the existing `installGlobalBinTools()` machinery in `bin/gsd-t.js` (introduced 2026-05-07 to fix the parallelism-report.cjs gap). D1 task-4 adds `"live-activity-report.cjs"` to the `GLOBAL_BIN_TOOLS` array; no new install code is needed.

The global dashboard at `~/.claude/scripts/gsd-t-dashboard-server.js` resolves the module via `path.join(__dirname, "..", "bin", "live-activity-report.cjs")` — identical to the parallelism-report resolution.

`gsd-t doctor --check-global-bin` (extant, iterates `GLOBAL_BIN_TOOLS`) covers the new module automatically.

---

## §10 — Versioning + Backward Compatibility

- **v0.1.0 PROPOSED** (this file at partition time): the locked shape D2 plans against. No D1 implementation yet.
- **v1.0.0 STABLE** (D1 task-5, 2026-05-07): contract flipped after T1–T4 implementations match the schema 1:1. All 29 unit tests pass.
- **Future minor bumps** (v1.x.0): additive fields on `Activity` (e.g., a `cpuPercent` for monitor) — never rename, never remove.
- **Future major bumps** (v2.0.0): would require a `schemaVersion: 2` in the envelope and a coordinated D2 + cross-project consumer migration. Deferred until cross-project aggregation (M55 candidate) is in scope.

---

## §11 — Test Catalogue (D1 unit tests + D2 live-journey specs that pin this contract)

| Test | Pinned invariant |
|------|------------------|
| `test/m54-d1-live-activity-report.test.js::detect-bash-from-events-jsonl` | Bash kind detection (§1) |
| `test/m54-d1-live-activity-report.test.js::detect-monitor-paired-start-stop` | Monitor kind + F1 falsifier |
| `test/m54-d1-live-activity-report.test.js::detect-tool-over-30s` | Tool kind threshold |
| `test/m54-d1-live-activity-report.test.js::detect-spawn-via-spawn-plan-files` | Spawn kind delegation |
| `test/m54-d1-live-activity-report.test.js::dedup-tool-use-id-priority` | §2 priority 1 |
| `test/m54-d1-live-activity-report.test.js::dedup-tuple-fallback` | §2 priority 2 |
| `test/m54-d1-live-activity-report.test.js::falsifier-explicit-terminator` | §3 F1 |
| `test/m54-d1-live-activity-report.test.js::falsifier-pid-esrch` | §3 F2 |
| `test/m54-d1-live-activity-report.test.js::falsifier-mtime-stale` | §3 F3 |
| `test/m54-d1-live-activity-report.test.js::silent-fail-malformed-jsonl` | §7 silent-fail |
| `test/m54-d1-dashboard-handlers.test.js::api-live-activity-200-empty` | §4 envelope shape |
| `test/m54-d1-dashboard-handlers.test.js::api-live-activity-5s-cache` | §6 cache |
| `test/m54-d1-dashboard-handlers.test.js::tail-rejects-path-traversal` | §8 path-traversal |
| `test/m54-d1-dashboard-handlers.test.js::stream-sse-content-type` | §5 SSE headers |
| `test/m54-d1-dashboard-handlers.test.js::500-only-on-contract-regression` | §7 silent-fail boundary |
| `e2e/live-journeys/live-activity.spec.ts` | End-to-end success criteria (1)–(4) |
| `e2e/live-journeys/live-activity-multikind.spec.ts` | §1 + §2 cross-stream + 3-concurrent-kind rendering |

Red Team (M54 verify) writes ≥5 broken patches; each must be caught by ≥1 row above.
