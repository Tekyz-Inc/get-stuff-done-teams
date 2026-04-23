# Compaction Events Contract

**Status**: v1.1.0 — M44 D7 (calibration event added 2026-04-22)
**Sink**: `.gsd-t/metrics/compactions.jsonl`
**Producers**:
- Live: `scripts/gsd-t-compact-detector.js` (SessionStart hook, `source=compact`) — emits the `compact` row defined in v1.0.0.
- Live: `scripts/gsd-t-calibration-hook.js` (SessionStart hook, `source=compact`) — emits the `compaction_post_spawn` calibration event defined in v1.1.0. Runs alongside the detector; both are independent listeners on the same hook payload.
- Backfill: `scripts/gsd-t-compaction-scanner.js` (historical scan of `~/.claude/projects/<slug>/*.jsonl`, `source=compact-backfill`) — emits the `compact-backfill` row defined in v1.0.0.

## Versions

- **v1.1.0** (2026-04-22, M44 D7) — adds `compaction_post_spawn` calibration event type appended to the same sink. Pairs `estimatedCwPct` (D6's pre-spawn prediction) with `actualCwPct` (derived from the live compaction event) so D6's estimator can self-calibrate. Backward-compatible: every v1.0.0 row is a valid v1.1.0 row; consumers MUST treat `type` as optional and default missing values to `"compact"`.
- **v1.0.0** (2026-04-22, M44 pre-req) — initial schema for the `compact` and `compact-backfill` rows.

## Why this exists

The canonical token-measurement hierarchy is:

```
Run → Iter → Context Window → Turn → Tool call
```

A **Context Window** (CW) is bounded by compactions. Without compaction
events recorded, every iter looks like a single CW regardless of how many
times Claude Code actually auto-compacted mid-run — so per-CW accounting,
drift analysis, and the M44 parallel orchestrator's CW-scoped attribution
all quietly decay to iter-level. Neither the transcript NDJSON nor
`token-usage.jsonl` surfaces these transitions today.

Claude Code **already** fires a `SessionStart` hook after an auto-compaction
with `source: "compact"` (vs `"startup"` or `"resume"`). Nothing consumed
the signal until now.

## Row schema (v1)

Each row is one NDJSON line in `compactions.jsonl`:

```json
{
  "ts": "2026-04-22T12:34:56.000Z",
  "schemaVersion": 1,
  "session_id": "new-abc",
  "prior_session_id": "old-xyz",
  "source": "compact",
  "cwd": "/Users/david/projects/GSD-T",
  "hook": "SessionStart"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `ts` | ISO-8601 string | When the row was written (detector wall-clock; for backfill, the compact_boundary's own `timestamp`). |
| `schemaVersion` | integer | `1`. Bump on breaking change. |
| `session_id` | string \| null | New session id after compaction. |
| `prior_session_id` | string \| null | Previous session id if Claude Code supplies one (`prior_session_id` or `previous_session_id` accepted). Often null for in-place compactions. |
| `source` | string | `"compact"` (live hook) or `"compact-backfill"` (scanner). Never anything else. |
| `cwd` | string | Absolute working directory at the time of the event. |
| `hook` | string | Always `"SessionStart"` (for provenance; backfill rows carry the same tag so joiners treat them uniformly). |

Backfill may also include two optional fields when they can be recovered
from the historical `compact_boundary` record:

| Field | Type | Notes |
|-------|------|-------|
| `preTokens` | integer | Input tokens just before compaction. |
| `postTokens` | integer | Input tokens just after compaction. |
| `trigger` | string | `"auto"` or `"manual"` from `compactMetadata.trigger`. |
| `durationMs` | integer | `compactMetadata.durationMs`. |

Consumers MUST treat unknown fields as ignorable. Consumers MUST NOT fail
when optional fields are absent.

## Hook lifecycle

1. Claude Code fires `SessionStart` with a JSON payload on stdin.
2. The hook reads stdin (1 MiB cap, UTF-8).
3. If `source !== "compact"` → no-op, exit 0.
4. If `<cwd>/.gsd-t/` does not exist → no-op, exit 0 (off-switch).
5. Append one row to `<cwd>/.gsd-t/metrics/compactions.jsonl`.
6. **Exit 0, always.** Throwing or non-zero exit breaks Claude Code.

### Guardrails

- **Fail-open**: any exception is swallowed. No row is better than a broken
  session start.
- **1 MiB stdin cap**: abort (no write) when stdin exceeds cap.
- **Path-traversal guard**: resolved output path MUST stay under
  `<cwd>/.gsd-t/metrics/`. Otherwise no-op.
- **Strict cwd**: when `payload.cwd` is present but not an absolute path (or
  is a non-string), the hook silently no-ops rather than falling back to
  `process.cwd()`. Only a wholly-missing `cwd` defaults to `process.cwd()`.
- **Off-switch**: deleting `.gsd-t/` in a project disables recording in that
  project. Deleting the hook matcher from `~/.claude/settings.json` disables
  it globally.

## Backfill semantics

`scripts/gsd-t-compaction-scanner.js` scans
`~/.claude/projects/<cwd-slug>/*.jsonl` session transcripts. Each session
JSONL contains a sequence of records; compaction boundaries are emitted by
Claude Code itself as:

```json
{ "type": "system", "subtype": "compact_boundary",
  "timestamp": "…", "sessionId": "…", "cwd": "…",
  "compactMetadata": { "trigger": "auto", "preTokens": …,
                       "postTokens": …, "durationMs": … } }
```

The scanner walks every file, finds these rows, deduplicates against the
existing `compactions.jsonl` by `(ts, session_id)`, and — only when
`--write` is passed — appends new rows with `source: "compact-backfill"`.

Default is dry-run: summary counts + sample rows to stdout, no mutation.

**Empirical note (2026-04-22 initial run)**: 72 historical compactions
found across 112 GSD-T session files spanning Apr 4–21. Older Claude Code
archives do not consistently include `postTokens`; backfilled rows omit
the field rather than guessing. Consumers MUST handle missing optional
fields without error.

**Prior-session-id on backfill**: live detector rows carry Claude Code's
own `prior_session_id` (when present). Backfill rows map the session
JSONL's `logicalParentUuid` into this field — it's the UUID of the last
message in the pre-compact window, NOT a true Claude Code session id, but
it's the closest stable boundary anchor the archive exposes for in-place
compactions. Consumers treating this field as "anything that uniquely
identifies the boundary" are correct; consumers assuming it's always a
session id are not.

## Wiring

`~/.claude/settings.json` → `hooks.SessionStart[]` includes **all three**:

1. The existing version-check hook (`gsd-t-update-check.js`). **Never remove.**
2. The compact detector (`gsd-t-compact-detector.js`). Added by v1.0.0.
3. The calibration hook (`gsd-t-calibration-hook.js`). Added by v1.1.0 (M44 D7).

Matchers are separate entries so any one can be disabled without touching
the others. The calibration hook is independent of the detector — both
listen for `source=compact` payloads on stdin and write to the same sink,
but neither reads or writes the other's rows.

## Calibration event row schema (v1.1.0)

The calibration hook appends one NDJSON line per recognized post-spawn
compaction event:

```json
{
  "type": "compaction_post_spawn",
  "schemaVersion": 1,
  "ts": "2026-04-22T12:34:56.000Z",
  "cw_id": "spawn-d3b0-...",
  "task_id": "M44-D7-T3",
  "spawn_id": "spawn-d3b0-...",
  "estimatedCwPct": 0.85,
  "actualCwPct": 0.97
}
```

| Field            | Type           | Notes |
|------------------|----------------|-------|
| `type`           | string         | Always `"compaction_post_spawn"`. Distinguishes calibration rows from v1.0.0 `compact` rows in the same sink. v1.0.0 rows have NO `type` field (or default to `"compact"` when consumers normalize). |
| `schemaVersion`  | integer        | `1` (the calibration event schema is independent of the v1.0.0 row schema; both happen to start at `1`). |
| `ts`             | ISO-8601 string | When the calibration row was written (hook wall-clock). |
| `cw_id`          | string \| null | Per-CW attribution key (matches the value the orchestrator wrote into `token-usage.jsonl` rows for this spawn). For unattended workers, equals `spawn_id`. |
| `task_id`        | string \| null | Task identifier from the supervisor's active spawn correlation (e.g. `"M44-D7-T3"`). Null when the supervisor did not record a task at spawn time. |
| `spawn_id`       | string \| null | Stable spawn identifier (matches `cw_id` for unattended workers). |
| `estimatedCwPct` | number \| null | D6's pre-spawn prediction (0.0–1.0 fraction of the CW ceiling). Null when no estimate was recorded for this spawn. |
| `actualCwPct`    | number         | Observed CW utilization at the moment of compaction (0.0–1.0 fraction of the CW ceiling, derived from the compaction event's `input_tokens` divided by the configured CW ceiling). |

### Hook lifecycle (v1.1.0 calibration hook)

1. Claude Code fires `SessionStart` with a JSON payload on stdin.
2. The hook reads stdin (1 MiB cap, UTF-8).
3. If `payload.source !== "compact"` → no-op, exit 0.
4. If `<cwd>/.gsd-t/.unattended/state.json` is missing/unreadable, OR
   parsing fails, OR `state.status !== "running"`, OR no active spawn
   correlation can be derived → no-op (silent), exit 0.
5. Derive `actualCwPct` from the compaction payload's `input_tokens` (or
   nested `compactMetadata.preTokens`) divided by the configured CW
   ceiling (default `200000` input tokens). Clamp to `[0.0, 2.0]`.
6. Append one calibration row to `<cwd>/.gsd-t/metrics/compactions.jsonl`.
7. **Exit 0, always.** Throwing or non-zero exit breaks Claude Code.

### Calibration hook guardrails

- **Fail-open**: any exception is swallowed. No row is better than a
  broken session start.
- **Silent no-op when no active spawn**: the supervisor may not be running
  when a manual session compacts. Accepted.
- **Append-only, same sink**: calibration rows go into
  `compactions.jsonl` next to v1.0.0 rows. Consumers distinguish them by
  the `type` field (`"compaction_post_spawn"` vs absent / `"compact"`).
- **Independent of detector**: removing the calibration hook from
  settings.json disables only the calibration row; v1.0.0 detector rows
  continue to flow.
- **CW ceiling override**: if `state.json` carries an explicit CW ceiling
  (`cwCeilingTokens` or similar), the hook uses it; otherwise it falls
  back to a built-in default.

## Consumers (future, not required by this contract)

- `gsd-t metrics` — per-CW rollups.
- M44 orchestrator — CW-scoped attribution.
- `gsd-t tokens --regenerate-log` — timeline annotation.

None of these are dependencies; this contract only defines the producer
shape.
