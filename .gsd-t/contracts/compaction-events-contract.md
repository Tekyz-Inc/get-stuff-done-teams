# Compaction Events Contract

**Status**: v1.0.0 — M44 pre-req (shipped ahead of M44 milestone body)
**Sink**: `.gsd-t/metrics/compactions.jsonl`
**Producers**:
- Live: `scripts/gsd-t-compact-detector.js` (SessionStart hook, `source=compact`)
- Backfill: `scripts/gsd-t-compaction-scanner.js` (historical scan of `~/.claude/projects/<slug>/*.jsonl`, `source=compact-backfill`)

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

## Wiring

`~/.claude/settings.json` → `hooks.SessionStart[]` includes **both**:

1. The existing version-check hook (`gsd-t-update-check.js`). **Never remove.**
2. The compact detector (`gsd-t-compact-detector.js`). Added by this contract.

Matchers are separate entries so either can be disabled without touching
the other.

## Consumers (future, not required by this contract)

- `gsd-t metrics` — per-CW rollups.
- M44 orchestrator — CW-scoped attribution.
- `gsd-t tokens --regenerate-log` — timeline annotation.

None of these are dependencies; this contract only defines the producer
shape.
