# Event Schema Contract

## Overview
Defines the canonical schema for all events written to `.gsd-t/events/YYYY-MM-DD.jsonl`.
This is an append-only file. One JSON object per line. File rotates daily.

**Owner**: event-stream domain
**Consumers**: learning-loop domain, reflect domain, M15 dashboard server

---

## Event Schema

Every event MUST be a single-line JSON object with exactly these fields:

```json
{
  "ts":              "string — ISO 8601 UTC timestamp (e.g., 2026-03-04T11:30:00.000Z)",
  "event_type":      "string — one of the types listed below",
  "command":         "string|null — gsd-t command name (e.g., gsd-t-execute) or null",
  "phase":           "string|null — phase name (e.g., execute, verify) or null",
  "agent_id":        "string|null — session or subagent ID",
  "parent_agent_id": "string|null — parent agent ID (null = root session)",
  "trace_id":        "string|null — groups all events for one wave/milestone run",
  "reasoning":       "string|null — why this event occurred (human-readable)",
  "outcome":         "string|null — one of: success, failure, learning, deferred, null (null = in-progress)",
  "model":           "string|null — model used for this operation (e.g., opus, sonnet, haiku) or null"
}
```

**Rules**:
- All fields must be present — use `null` for absent optional values
- `ts` must be UTC ISO 8601 with milliseconds
- No multi-line values — strings must be single-line (escape newlines as `\n`)

### Event-type-specific optional fields

Some event types carry additional fields beyond the base schema. These are
**additive** (older events without the field are still valid):

| event_type  | Extra field    | Type          | Since    | Purpose |
|-------------|----------------|---------------|----------|---------|
| `tool_call` | `turn_id`      | string\|null  | v3.17.11 | Parent assistant message id (matches `turn_id` in `.gsd-t/metrics/token-usage.jsonl`). Resolved by the heartbeat hook from the transcript via `tool_use_id`. Enables direct `(session_id, turn_id)` join for per-tool token attribution — bypasses the lossy timestamp-window heuristic that failed when many turns were written in the same ms. |
| `tool_call` | `tool_use_id`  | string\|null  | v3.17.11 | Claude Code's unique id for the tool invocation (`toolu_*`). Used to resolve `turn_id` and for downstream correlation. |

**Migration gap**: events written before v3.17.11 do NOT carry `turn_id`. The
per-tool attribution joiner (`bin/gsd-t-tool-attribution.cjs`) still attributes
these via the original timestamp-window matcher as a back-compat fallback, but
accuracy on legacy data is reduced (all turns written in the same hook-fire
instant collapse onto the first turn). A one-shot retro-enrichment job could
replay transcripts against `.gsd-t/events/*.jsonl` to back-fill `turn_id` —
tracked separately; not blocking forward progress.

---

## Event Types

| event_type            | When written                                                                 | Key fields                        |
|-----------------------|------------------------------------------------------------------------------|-----------------------------------|
| `command_invoked`     | Start of any GSD-T command                                                  | command, agent_id                 |
| `phase_transition`    | Wave transitions between phases (partition→plan, execute→test-sync, etc.)   | command=wave, phase, reasoning, outcome |
| `subagent_spawn`      | Task subagent is spawned (from hooks or command files)                       | agent_id=child, parent_agent_id   |
| `subagent_complete`   | Task subagent returns                                                        | agent_id=child, outcome           |
| `session_start`       | SessionStart hook fires — session begins                                     | agent_id=session_id, reasoning=model |
| `session_end`         | SessionEnd hook fires — session ends                                         | agent_id=session_id, reasoning=reason |
| `tool_call`           | PostToolUse hook fires; agent_id = subagent ID if in subagent, else session_id | reasoning (tool name)           |
| `experience_retrieval`| Pre-task grep found relevant [failure]/[learning] entries                   | reasoning (what was found)        |
| `outcome_tagged`      | Decision Log entry written with an outcome tag                               | outcome (the tag used)            |
| `distillation`        | complete-milestone distillation step ran                                     | reasoning (patterns found)        |
| `task_complete`       | Task finished — metrics emitted to task-metrics.jsonl                        | reasoning (signal_type + domain)  |

---

## File Location and Naming

```
.gsd-t/events/
├── 2026-03-04.jsonl    ← events for today
├── 2026-03-05.jsonl    ← events for next day
└── ...
```

Rotation rule: filename = `YYYY-MM-DD.jsonl` based on UTC date at write time.

---

## Event Writer CLI

`scripts/gsd-t-event-writer.js` — installed to `~/.claude/scripts/`

Usage from hooks or command files:
```bash
node ~/.claude/scripts/gsd-t-event-writer.js \
  --type phase_transition \
  --command gsd-t-wave \
  --phase execute \
  --reasoning "Execute phase complete, all 3 domain tasks passed QA" \
  --outcome success \
  --agent-id "$CLAUDE_SESSION_ID" \
  --parent-id null \
  --trace-id "$TRACE_ID"
```

Exit codes:
- `0` — event written successfully
- `1` — missing required field or invalid value
- `2` — filesystem error (could not open/write file)

The writer:
1. Validates all required fields
2. Resolves the events/ directory relative to `$GSD_T_PROJECT_DIR` (env) or current working directory
3. Creates `.gsd-t/events/` if missing
4. Appends the JSON object as a single line to `YYYY-MM-DD.jsonl`

### Env-Var Fallbacks (v3.12.14)

When a CLI flag is omitted, the writer falls back to these process env vars so
that workers spawned by the supervisor / headless / orchestrator / debug paths
produce tagged events without every caller passing every flag:

| Flag | Env fallback | Set by |
|---|---|---|
| `--command` | `GSD_T_COMMAND` | `bin/headless-auto-spawn.cjs`, `bin/gsd-t-unattended.cjs::_spawnWorker`, `bin/gsd-t.js::doHeadlessExec` + `spawnClaudeSession` + `runLedgerCompaction`, `bin/orchestrator.js::_buildOrchestratorEnv`, `scripts/gsd-t-design-review-server.js` |
| `--phase` | `GSD_T_PHASE` | same callers (default `execute` for primary spawns) |
| `--trace-id` | `GSD_T_TRACE_ID` | propagated from parent if set |
| `--model` | `GSD_T_MODEL` | propagated from parent / spawn site |

The SAME env vars are ALSO read by the PostToolUse heartbeat hook
(`scripts/gsd-t-heartbeat.js::buildEventStreamEntry`) so that `tool_call`
entries emitted from inside a detached child inherit the parent's routing
context. Explicit CLI flags always win over env fallbacks.

---

## Integration Checkpoints

- **event-stream Task 1** must be complete (schema contract written, event-writer.js created) before:
  - learning-loop starts adding phase_transition writes to wave.md
  - reflect starts implementing distillation event reads
