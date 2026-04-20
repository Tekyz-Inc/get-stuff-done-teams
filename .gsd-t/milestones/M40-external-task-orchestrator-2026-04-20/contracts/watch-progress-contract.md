# Watch-Progress Contract

**Version**: 1.0.0
**Status**: FINAL
**Owner**: D2 (`d2-progress-watch`, M39)
**Consumers**:
- `bin/gsd-t-unattended.cjs` watch printer (supervisor startup banner / resume banner)
- `bin/unattended-watch-format.cjs` (`formatWatchTick`)
- `bin/headless-auto-spawn.cjs` `autoSpawnHeadless` watch fallback
- Any future `--watch` surface added to GSD-T

## Purpose

Defines the universal task-list progress view rendered under every `--watch`
output. State-file-driven (`.gsd-t/.watch-state/{agent_id}.json`),
tree-reconstructed via `parent_agent_id` lineage, rendered with ✅ / 🔄 / ⬜
markers below the existing `--watch` banner (banner preserved intact).

Disjoint surface from `unattended-event-stream-contract.md`: the state-file
feed drives **live watch rendering** (ephemeral, single-file-per-agent), the
JSONL feed drives **archival** (append-only events). No schema overlap.

## 1. State-File JSON Schema

Each agent writes exactly one state file at
`.gsd-t/.watch-state/{agent_id}.json`. File shape:

```json
{
  "agent_id": "string (uuid or session-derived; required, primary key)",
  "parent_agent_id": "string | null (null = root)",
  "command": "string (gsd-t-{name})",
  "step": "integer (numbered step index within the command)",
  "step_label": "string (one-line label for the current step)",
  "status": "pending | in_progress | done | skipped | failed",
  "started_at": "ISO-8601 string (set by first `start`, preserved thereafter)",
  "completed_at": "ISO-8601 string | null (set when leaving in_progress)",
  "metadata": "object (free-form, optional)"
}
```

### Field Rules

- `agent_id` and `parent_agent_id` together form the lineage graph. A root has
  `parent_agent_id: null`. Any non-null parent that does not have a matching
  state file is treated as an **orphan** parent (see §3).
- `command` MUST be a GSD-T command name with the `gsd-t-` prefix stripped or
  present; the renderer is tolerant of either form.
- `step` is a non-negative integer; `0` is permitted but unusual (typically
  reserved for a root "start" marker).
- `status` values follow the lifecycle in §2. Any value outside the enum is
  rejected by the writer (§4) and skipped by the builder (§3).
- `metadata` is opaque to builder/renderer; callers may stash free-form
  diagnostic data (error strings, bytes written, etc.) without breaking
  compatibility.

## 2. Status Lifecycle

```
pending → in_progress → done
                    ↘→ skipped
                    ↘→ failed
```

- `start` transitions a new record to `in_progress`; `started_at` is set once.
- `advance` keeps the status at `in_progress` and rewrites `step`, `step_label`,
  preserving `started_at`.
- `done`, `skip`, `fail` all set `completed_at = now` and change `status`
  accordingly. These are terminal; subsequent writes for the same `agent_id`
  overwrite the file with the new status but `started_at` is preserved.
- Whenever a record leaves `in_progress`, `completed_at` MUST be set.

## 3. Tree Reconstruction Algorithm

1. Scan `.gsd-t/.watch-state/` for `*.json` files. Missing dir → empty tree
   without error. Empty dir → empty tree.
2. Parse each file. Skip files that fail JSON.parse or fail schema validation
   (warn silently; never throw).
3. Apply **stale-state expiry** (§5): drop any record whose `completed_at` is
   non-null and older than 24 hours. `in_progress` records are kept
   regardless of age (they represent possibly-still-running agents).
4. Build an index `{ agent_id → { record, children: [] } }` over surviving
   records.
5. For each record, attach it to its parent's `children[]` if the parent is
   present in the index. If the parent is missing (orphan), push the node to
   the builder's `orphans[]` list.
6. Roots (records with `parent_agent_id: null`) are collected in `roots[]`.
7. Return `{ roots, orphans }`.

The algorithm is O(N) over surviving records. No recursion is required during
build; child ordering is insertion-order (the filesystem read order is
stable-enough for a human render).

## 4. State-Writer CLI Contract

Binary: `scripts/gsd-t-watch-state.js`. Invocation:

```bash
node scripts/gsd-t-watch-state.js <subcommand> [flags]
```

### Subcommands

| Subcommand | Required flags | Effect |
|---|---|---|
| `start` | `--command`, `--step`, `--step-label` | Create/overwrite file; `status=in_progress`; `started_at=now`; `completed_at=null` |
| `advance` | `--command`, `--step`, `--step-label` | Update `step`/`step_label`; keep `in_progress`; preserve `started_at`; if no file exists, behave like `start` |
| `done` | (none) | `status=done`; `completed_at=now` |
| `skip` | (none) | `status=skipped`; `completed_at=now` |
| `fail` | (none) | `status=failed`; `completed_at=now` |

### Agent-id resolution (shim-safe)

`--agent-id` is **optional**. Resolution order:

1. Non-empty `--agent-id` arg value.
2. `GSD_T_AGENT_ID` env var (set by `_spawnWorker` as `supervisor-iter-{N}` and
   by `autoSpawnHeadless` as `headless-{id}`).
3. Auto-minted `shell-{pid}-{ts}` fallback. This path is hit by command-file
   shims invoked in a shell that has no producer (e.g., during interactive
   `/gsd-t-quick` runs). Each shim call is a fresh `node` process, so `pid`
   changes per call; combined with ms timestamp, collisions are not possible.

### Optional Flags (all subcommands)

- `--agent-id <id>` — override resolution (see above).
- `--parent-id <id\|null>` — lineage. `null` or omitted = root.
- `--metadata '<json>'` — merged into the record's `metadata` object.

### Exit Codes

- `0` — success.
- `1` — validation (missing `--command`/`--step`/`--step-label` on
  `start`/`advance`, or unknown subcommand). An empty `--agent-id` is no
  longer an error — it triggers the resolution chain above.
- `2` — filesystem (EACCES, ENOSPC, permission denied). Stderr carries a
  one-line hint.

### Atomic Write

Each write:
1. Serialize the new record to JSON with 2-space indent + trailing newline.
2. Write to `{path}.tmp-{pid}-{random}` in the same dir.
3. `fs.renameSync(tmp, path)` — atomic on POSIX.

Concurrent writes against different `agent_id`s never corrupt each other
because they target disjoint files. Concurrent writes against the SAME
`agent_id` last-write-wins; callers are expected to serialize writes for a
single agent (shim-per-step guarantees this in practice).

### Idempotency

- `done`/`skip`/`fail` on an already-terminal record is a no-op status-wise
  but refreshes `completed_at`.
- `start`/`advance` is idempotent in the sense that re-writing with identical
  fields produces an identical file on disk.

### Zero Dependencies

Node.js built-ins only: `fs`, `path`, `process`, `crypto` (for tmp-file
randomness). No external npm runtime deps.

## 5. Stale-State Expiry

- A record with `completed_at` (non-null) older than **24 hours** is treated
  as stale and dropped silently by `buildTree`.
- A record with `completed_at: null` (i.e. `pending` or `in_progress`) is
  kept regardless of `started_at` age. Rationale: the agent may still be
  running; the renderer surfaces it as `🔄` even if stale, which is more
  informative than silently hiding it.
- Stale files on disk are harmless — the builder skips them. Disk cleanup is
  a separate (not-yet-implemented) housekeeping concern and is out of scope
  for this contract.

## 6. Renderer Contract

Entry: `renderTree(tree, options)` in `bin/watch-progress.js`.

### Options

```js
{
  currentAgent: "<agent_id>" | null,  // agent whose subtree is expanded
  now:          <ms>            | null // override for stale-check in tests
}
```

If `currentAgent` is absent, the renderer picks the most-recently-started
`in_progress` record as the expanded subtree.

### Render Rules

- Empty tree → empty string. (No "no tasks yet" chatter.)
- Roots are always shown, one per block.
- The subtree containing `currentAgent` is shown EXPANDED (all children and
  grandchildren rendered with their own lines).
- All other subtrees are shown COLLAPSED: one line per root-level sibling of
  the expanded branch, formatted as `{marker} {step_label} ({N} tasks done)`.
  The count is the number of descendants with `status=done` plus `skipped`.
- Indentation: **2 spaces per tree level**, using ASCII-safe glyphs
  (the renderer emits a plain `  ` prefix; branch glyphs are not required —
  the existing `--watch` aesthetic tolerates either).

### Marker Set

| Status | Marker |
|---|---|
| `done` | `✅` |
| `in_progress` | `🔄` |
| `pending` | `⬜` |
| `skipped` | `➡️` |
| `failed` | `❌` |

(Markers match the ✅ / 🔄 / ⬜ set standardized in the M38 watch output.)

### Orphans

Orphans render under a synthetic root with label `"(orphan subtree — parent
state missing)"`. The synthetic root has no marker of its own; children
render with their actual markers.

### CLI Entry

`node bin/watch-progress.js` prints `renderTree(buildTree('.gsd-t/.watch-state/'))`
to stdout. Empty state dir → empty output (no trailing newline). Used for
manual operator inspection.

## 7. Integration Invariants for `--watch` Callers

Consumers MUST:

1. Preserve the existing banner verbatim. Render the tree **below** the
   banner; never splice into or rewrite the banner text.
2. Wrap the renderer call in `try/catch`. A throw from the tree builder must
   never crash the watch printer — watch is best-effort.
3. Skip emission when `renderTree` returns an empty string (no extra
   blank lines when there is no state).
4. Never read `.gsd-t/.watch-state/` directly for rendering; always go
   through `buildTree` + `renderTree`.

Reference integration pattern (applied at T7/T8/T9):

```js
try {
  const { buildTree, renderTree } = require('./watch-progress.js');
  const tree = buildTree('.gsd-t/.watch-state/');
  const rendered = renderTree(tree, { currentAgent: activeWorkerId });
  if (rendered) { console.log(rendered); }
} catch (_) { /* watch-progress is best-effort; never crash the watch */ }
```

## 8. Interaction with Event Stream

The watch-progress surface and the unattended event stream
(`unattended-event-stream-contract.md`) are **disjoint**:

| Aspect | watch-progress (this contract) | event stream (ES contract) |
|---|---|---|
| Storage | `.gsd-t/.watch-state/{agent_id}.json` (one file per agent, overwrite) | `.gsd-t/events/YYYY-MM-DD.jsonl` (append-only) |
| Lifetime | Ephemeral (24h TTL, overwritten often) | Archival (retained for retrospectives) |
| Purpose | Drive the live tree view under `--watch` | Audit trail, reflect command, metrics |
| Schema overlap | None — distinct fields and file locations | None |
| Producer | Command-file shims (bash one-liner per step) | Event writer CLI + PostToolUse hook |

A future iteration could cross-reference by `agent_id` / `trace_id`, but for
v1.0.0 the surfaces are strictly separate.

## Shim Invocation Pattern (Workflow Commands)

Each numbered Step in a workflow command file opens with:

```bash
node scripts/gsd-t-watch-state.js advance \
  --agent-id "$GSD_T_AGENT_ID" \
  --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" \
  --command gsd-t-{name} \
  --step {N} \
  --step-label "{one-line label}" \
  2>/dev/null || true
```

Rationale for `advance` (not `start`): the writer treats a missing file as a
first-time create, so `advance` is a universal "record current step" verb.
The trailing `2>/dev/null || true` ensures the shim never crashes a command
when the state dir is unavailable (e.g. sandboxed environments, read-only
filesystems).

## Related Contracts

- `.gsd-t/contracts/unattended-event-stream-contract.md` — archival event
  stream (disjoint surface).
- `.gsd-t/contracts/unattended-supervisor-contract.md` — supervisor/worker
  protocol (the watch printer is one of several consumers).
- `.gsd-t/contracts/headless-default-contract.md` — headless spawn
  invariants the watch tree reflects.
