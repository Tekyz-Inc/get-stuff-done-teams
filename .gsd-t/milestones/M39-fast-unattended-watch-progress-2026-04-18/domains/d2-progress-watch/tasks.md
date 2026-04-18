# Tasks: d2-progress-watch

**Domain**: D2 progress-watch (M39 Wave 1)
**Total tasks**: 12
**Parallelism**: Wave 1 — runs in parallel with D3 and D4 (no cross-domain deps)

All tasks are internally ordered (T1 → T12). Each listed prerequisite is intra-domain only.

---

## T1. Finalize `watch-progress-contract.md` v1.0.0 (stub → full spec)

**Prerequisite**: none (first task of domain)

**Files modified**:
- `.gsd-t/contracts/watch-progress-contract.md`

**Change**: promote the partition stub to a full v1.0.0 contract. Body sections to write:

1. **State-file JSON schema** — exact shape:
   ```json
   {
     "agent_id": "string (uuid or session-derived)",
     "parent_agent_id": "string | null (null = root)",
     "command": "string (gsd-t-{name})",
     "step": "integer (numbered step index)",
     "step_label": "string (one-line label)",
     "status": "pending | in_progress | done | skipped | failed",
     "started_at": "ISO-8601 string",
     "completed_at": "ISO-8601 string | null",
     "metadata": "object (free-form, optional)"
   }
   ```
2. **File path convention** — `.gsd-t/.watch-state/{agent_id}.json`, one file per agent. Runtime-only, gitignored.
3. **Status lifecycle** — `pending → in_progress → done | skipped | failed`. `completed_at` MUST be set when leaving `in_progress`.
4. **Stale-state expiry** — 24h from `completed_at`. Builder skips expired files; they're harmless until deleted.
5. **State-writer CLI contract** — subcommands `start|advance|done|skip|fail`, required args, exit codes (0/1/2), atomic-write guarantee via `fs.rename()`.
6. **Renderer contract** — tree-structure rules, collapsed vs expanded branches, marker set (done/in_progress/pending/skipped/failed), indentation = 2 spaces/level, append-below-banner guarantee.
7. **Integration invariants** — watch callers MUST preserve existing banner; render output appended below; empty state dir returns empty string (no "no tasks yet" chatter).
8. **Interaction with event stream** — disjoint surface from `unattended-event-stream-contract.md` (state file drives live watch; JSONL drives archival). No schema overlap.

**Success criteria**: file parses as valid markdown; all 8 section headers present; v1.0.0 marked `Status: FINAL` (not STUB).

**Tests**: none new (markdown doc; linting-only).

---

## T2. Implement state-writer CLI `scripts/gsd-t-watch-state.js`

**Prerequisite**: T1 (contract defines CLI interface)

**Files created**:
- `scripts/gsd-t-watch-state.js`

**Change**: Node.js CLI with zero deps. Subcommands:
- `start --agent-id X --parent-id Y|null --command Z --step N --step-label "..." [--metadata '{"k":"v"}']`
- `advance --agent-id X --parent-id Y|null --command Z --step N --step-label "..."`
- `done --agent-id X`
- `skip --agent-id X`
- `fail --agent-id X [--metadata '{"error":"..."}']`

Write path: `.gsd-t/.watch-state/{agent_id}.json`. Atomic writes via `fs.writeFileSync` to tmp + `fs.renameSync`. Creates `.gsd-t/.watch-state/` if missing.

Exit codes (match `event-schema-contract` convention):
- `0` — success
- `1` — validation (missing/invalid args)
- `2` — filesystem (EACCES/ENOSPC/etc)

**Success criteria**: invoking each subcommand round-trips a readable JSON file matching the T1 schema; concurrent writes to different agent IDs never corrupt; invalid invocations exit 1 with stderr hint.

**Tests**: `test/watch-progress-writer.test.js` — REAL fs, tmp dir per test:
- `writer_round_trip_all_subcommands` — start/advance/done/skip/fail each update the on-disk file correctly.
- `writer_missing_required_args_exit_1` — exit 1 with stderr.
- `writer_concurrent_writes_different_agents_no_corrupt` — spawn 5 concurrent writes with 5 different agent_ids, assert all 5 files are valid JSON.
- `writer_creates_state_dir_if_missing` — remove dir, invoke start, assert dir created and file written.
- `writer_transition_preserves_started_at` — `start` sets `started_at`; later `advance` preserves it; `done` sets `completed_at`.

---

## T3. Implement tree builder in `bin/watch-progress.js`

**Prerequisite**: T2 (state files must exist for builder to consume)

**Files created**:
- `bin/watch-progress.js` — export `buildTree(stateDir)`.

**Change**: function reads every `.json` file under `stateDir`, parses each as a state record, links children under their `parent_agent_id`. Returns tree shape:

```js
{
  roots: [ { record, children: [ { record, children: [...] } ] } ],
  orphans: [ ...records whose parent_agent_id points to a missing/expired file ]
}
```

Orphans surface under a synthetic `unknown` root in later rendering (handled by T4). Empty dir → `{ roots: [], orphans: [] }`. Missing dir → same (no throw).

**Success criteria**: three-level flat state files reconstruct to the correct nested tree; orphans are grouped; empty dir returns empty tree without error.

**Tests**: `test/watch-progress-tree.test.js`:
- `tree_three_level_reconstructs_correctly` — fixture with 1 root + 2 children + 4 grandchildren → tree shape matches expected.
- `tree_orphans_grouped_under_unknown` — child whose parent file is missing lands in `orphans[]`.
- `tree_empty_dir_returns_empty_tree` — no throw; shape `{ roots: [], orphans: [] }`.
- `tree_missing_dir_returns_empty_tree` — no throw when `stateDir` doesn't exist.

---

## T4. Implement renderer in `bin/watch-progress.js`

**Prerequisite**: T3 (renderer consumes builder output)

**Files modified**:
- `bin/watch-progress.js` — add export `renderTree(tree, options = { currentAgent: null })`.

**Change**: returns a multi-line string. Rules:
- Top-level agents (roots) always shown with step label.
- The subtree containing `options.currentAgent` (or the most-recently-updated agent if not provided) is shown EXPANDED (all children rendered).
- All other subtrees shown COLLAPSED — one line like `<glyph> <done-marker> N tasks done` (count-only).
- Markers: done (green check), in_progress (rotating), pending (empty box), skipped (forward arrow), failed (red cross). Use the emoji set already standard in the M38 watch output.
- Indentation: 2 spaces per tree level.
- Tree glyphs: branch/last-branch style (ASCII-safe; already in the M38/M37 watch output aesthetic).
- Empty tree → empty string.

Add a small CLI entry at the bottom: `if (require.main === module) { console.log(renderTree(buildTree('.gsd-t/.watch-state/'))) }` so operators can run `node bin/watch-progress.js` standalone.

**Success criteria**: given a fixture tree, output matches a pinned expected string; collapsed branches show the count only; expanded branch shows every child; empty tree returns "".

**Tests**: `test/watch-progress-render.test.js`:
- `render_expands_current_agent_subtree` — currentAgent=child2 → child2's subtree expanded, child1's collapsed.
- `render_collapses_non_current_subtrees` — collapsed branches render as "N tasks done".
- `render_markers_map_to_statuses` — fixture with each status → correct marker appears.
- `render_empty_tree_returns_empty_string`.
- `render_indentation_two_spaces_per_level`.

---

## T5. Stale-state expiry in builder

**Prerequisite**: T3

**Files modified**:
- `bin/watch-progress.js` — add expiry filter inside `buildTree`.

**Change**: skip any state file whose `completed_at` (if non-null) is older than 24h. Keeps `.watch-state/` tolerant of accumulated cruft across long unattended runs.

**Success criteria**: expired files are dropped from the tree silently; non-expired `in_progress` files (no `completed_at`) are always kept regardless of age.

**Tests**: added to `test/watch-progress-tree.test.js`:
- `tree_skips_expired_state_files` — fixture with `completed_at` 25h ago → record not in output.
- `tree_keeps_in_progress_regardless_of_age` — `in_progress` with `started_at` 48h ago → record present.

---

## T6. `.gitignore` entry + directory bootstrap

**Prerequisite**: T2 (writer creates the dir)

**Files modified**:
- `.gitignore` — verify/add `.gsd-t/.watch-state/`.

**Change**: already added during partition (per progress.md 2026-04-17 19:45 note). This task is a verification task — confirm the line is present; if not, add it. Writer already creates the dir (T2).

**Success criteria**: `git check-ignore .gsd-t/.watch-state/foo.json` returns success.

**Tests**: covered by T2's `writer_creates_state_dir_if_missing`.

---

## T7. Integrate renderer into `bin/gsd-t-unattended.cjs` watch printer

**Prerequisite**: T4 (renderer must exist)

**Files modified**:
- `bin/gsd-t-unattended.cjs` — locate the watch printer that emits the "still running…" heartbeat banner. Append renderTree output below the banner.

**Change**: preserve the banner text 100%. After the banner emit, add a conditional block:

```js
try {
  const { buildTree, renderTree } = require('./watch-progress.js');
  const tree = buildTree('.gsd-t/.watch-state/');
  const rendered = renderTree(tree, { currentAgent: activeWorkerId });
  if (rendered) { console.log(rendered); }
} catch (_) { /* watch-progress is best-effort; never crash the watch */ }
```

Fallback: when `.gsd-t/.watch-state/` is empty, `renderTree` returns empty string — no extra output (banner-only printout, unchanged from pre-M39).

**Success criteria**: watch heartbeat still shows the banner; when state files exist, the tree appears below; when absent, banner-only.

**Tests**: `test/watch-unattended-integration.test.js`:
- `watch_printer_preserves_banner` — fixture state dir + captured printer output contains banner verbatim.
- `watch_printer_appends_tree_below_banner` — output has banner line, then tree lines.
- `watch_printer_empty_state_dir_banner_only` — no state files → banner only, no tree markers.

---

## T8. Integrate renderer into `bin/unattended-watch-format.cjs`

**Prerequisite**: T4

**Files modified**:
- `bin/unattended-watch-format.cjs` — same pattern as T7. Locate the banner emit; append renderer output below with the same try/catch guard.

**Success criteria**: unattended-watch format output preserves its banner; tree appears below when state exists.

**Tests**: covered by T7's `test/watch-unattended-integration.test.js` (extends fixture to exercise both printers).

---

## T9. Integrate renderer into `bin/headless-auto-spawn.cjs`

**Prerequisite**: T4

**Files modified**:
- `bin/headless-auto-spawn.cjs` — in the `autoSpawnHeadless` watch fallback path (when `--watch` is passed to the headless spawn), append renderer output below the existing banner using the same try/catch guard.

**Success criteria**: `autoSpawnHeadless({ watch: true })` prints banner + tree when state files exist; banner-only otherwise.

**Tests**: covered by T12 smoke test (exercises the real binaries end-to-end).

---

## T10. Command-file shims — batch 1 (high-traffic workflow commands)

**Prerequisite**: T2 (state-writer CLI must be callable)

**Files modified** (7 command files):
- `commands/gsd-t-milestone.md`
- `commands/gsd-t-partition.md`
- `commands/gsd-t-plan.md`
- `commands/gsd-t-execute.md`
- `commands/gsd-t-test-sync.md`
- `commands/gsd-t-verify.md`
- `commands/gsd-t-complete-milestone.md`

**Change**: at the TOP of each numbered Step, insert a Bash one-liner shim:

```bash
node scripts/gsd-t-watch-state.js advance --agent-id "$GSD_T_AGENT_ID" --parent-id "${GSD_T_PARENT_AGENT_ID:-null}" --command gsd-t-{name} --step {N} --step-label "{short label}" 2>/dev/null || true
```

Where `{name}` is the command (e.g., `partition`), `{N}` is the step number, and `{short label}` is a one-line description of the step. Shim is ADDITIVE — no rewriting of existing Step bodies. Trailing `|| true` ensures the shim never crashes the command when the state dir is unavailable.

**Success criteria**: every listed command file contains one `gsd-t-watch-state.js` call per numbered Step.

**Tests**: `test/watch-shims-present.test.js` — grep-based unit test:
- Per command file, count occurrences of `gsd-t-watch-state.js`.
- Assert each listed command has at least N shim calls (N = number of numbered Steps in that file; derived by counting `^#{1,6}\s*Step\s+\d+` matches).
- Failure message names the file that's short.

---

## T11. Command-file shims — batch 2 (secondary commands)

**Prerequisite**: T10 (same shim pattern; keeps the two batches parallelizable if needed later, but safely sequential here)

**Files modified** (10 command files):
- `commands/gsd-t-project.md`
- `commands/gsd-t-feature.md`
- `commands/gsd-t-integrate.md`
- `commands/gsd-t-scan.md`
- `commands/gsd-t-gap-analysis.md`
- `commands/gsd-t-wave.md`
- `commands/gsd-t-quick.md`
- `commands/gsd-t-debug.md`
- `commands/gsd-t-unattended.md`
- `commands/gsd-t-resume.md`

**Change**: identical shim pattern to T10, applied to each numbered Step in each file.

**Success criteria**: every listed command file contains one `gsd-t-watch-state.js` call per numbered Step.

**Tests**: covered by T10's `test/watch-shims-present.test.js` — the list of files + expected min-counts extends to batch 2.

---

## T12. Smoke test — render a real 3-level tree in this repo

**Prerequisite**: T11 (all shims in place; full writer + renderer path live)

**Files created**:
- `test/watch-progress-smoke.test.js` — executable end-to-end smoke test that uses the REAL binaries (not mocks).

**Change**: test script:
1. Creates a tmp `.watch-state/` dir.
2. Invokes `scripts/gsd-t-watch-state.js start ...` via `child_process.execSync` for 1 root + 2 children + 4 grandchildren (7 state files).
3. Runs `node bin/watch-progress.js` against the tmp dir (via env-var override or temporary `cwd`).
4. Asserts output contains: root step label, expanded current subtree (4 grandchildren), collapsed sibling subtree ("N tasks done" pattern), at least one of each relevant marker.

**Success criteria**: smoke test passes using the actual shipped binaries. Proves the end-to-end chain (writer CLI → state files on disk → builder → renderer → stdout) works.

**Tests**: the task IS the test.
