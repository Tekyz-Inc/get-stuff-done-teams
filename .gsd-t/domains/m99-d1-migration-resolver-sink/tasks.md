# Tasks: m99-d1-migration-resolver-sink

> **Wave 1 — SERIAL GATE.** Runs ALONE. The migration shim MUST be proven in isolation BEFORE
> Wave 2 (D2/D3) starts. Owns every shared path-resolving file so nothing else can run beside it.
> Contract: [`graph-store-resolver-contract.md`](../../contracts/graph-store-resolver-contract.md) v1.0.0.
> Intra-domain note: T1–T5 all touch `bin/gsd-t-graph-store-resolver.cjs` / consumers — `gsd-t parallel`
> reports `disjoint?=no` for them, which is EXPECTED same-owner sequential (`decision=sequential`), not a
> real conflict. Only inter-DOMAIN owned-set overlap matters; that is zero.

## Files Owned
- bin/gsd-t-graph-store-resolver.cjs
- bin/gsd-t-graph-query-cli.cjs
- bin/gsd-t-graph-index.cjs
- bin/gsd-t-graph-freshness.cjs
- bin/gsd-t-graph-k1-sqlite-stream.cjs
- bin/gsd-t-graph-store-bakeoff.cjs
- .gitignore
- test/m99-graph-migration.test.js
- test/m99-graph-telemetry.test.js
- test/m99-graph-rotation.test.js
- test/m99-resolver-no-raw-literals.test.js

---

### M99-D1-T1 — the single resolver module
**What:** Create `bin/gsd-t-graph-store-resolver.cjs` exporting `resolveGraphDir(projectRoot?)`,
`resolveStorePath(projectRoot?)`, `resolveLogsDir(projectRoot?)`, `deriveProjectRoot(storePath)`.
The new store lives at `.gsd-t/graphDB/graph.db` → `deriveProjectRoot` is **3 levels up** (`graphDB/`
adds one level vs. the old `.gsd-t/graph.db` 2-levels-up), depth-corrected atomically with the move.
**Files (ImplPath):** `bin/gsd-t-graph-store-resolver.cjs` (NEW) — `resolveGraphDir`/`resolveStorePath`/`resolveLogsDir`/`deriveProjectRoot`.
**Touches:** bin/gsd-t-graph-store-resolver.cjs
**Contract:** graph-store-resolver-contract.md § Exported surface (rows 1–4).
**Depends on:** —
**Test:** `test/m99-resolver-no-raw-literals.test.js` — asserts the four exports exist and that
`deriveProjectRoot(resolveStorePath(root)) === root` (round-trip proves the 3-levels-up depth).
**AC:** Criterion 4 (single resolver exists), Criterion 1 (graphDB/ layout). `[RULE] one-resolver-only`, `[RULE] projectroot-depth-corrected-with-move`.

### M99-D1-T2 — copy-verify-swap migration shim  ⭐ Headline: true
**What:** Add `migrateGraphStore(projectRoot?)` to the resolver: copy → verify → swap. (1) WAL-checkpoint
the SQLite write-ahead log before copy **OR** copy `graph.db`+`-wal`+`-shm` together (WAL mode CONFIRMED:
`gsd-t-graph-index.cjs:141` `journal_mode=WAL`). (2) Idempotent — second run is a no-op once `graphDB/`
holds a readable store. (3) Interruption-safe — at every step an old-OR-new readable graph exists, NEVER
neither (old retained until new is verified-readable, then swapped). (4) Real-root-only guard — refuses to
run inside an `mkdtemp`/throwaway dir (the M94 fake-root OOM lesson: guard root === home / root === '/').
(5) Fires automatically on first graph touch (self-heal) AND during CPUA `gsd-t update-all`.
**Files (ImplPath):** `bin/gsd-t-graph-store-resolver.cjs` — `migrateGraphStore()` + the first-touch
self-heal call site (wired into `resolveStorePath`/the query-cli store-open path in T4).
**Touches:** bin/gsd-t-graph-store-resolver.cjs
**Contract:** graph-store-resolver-contract.md § Exported surface (row `migrateGraphStore`) + § Invariants (never-orphan).
**Depends on:** M99-D1-T1.
**Test:** `test/m99-graph-migration.test.js` — builds a graph at the legacy `.gsd-t/graph.db` (+`-wal`/`-shm`)
in a real temp **project root** (NOT relocated by the real-root guard's allow-list — uses an explicit
`projectRoot` arg so the test opts in), runs the shim, asserts: (a) `graphDB/graph.db` answers IDENTICALLY
to a pre-migration control copy (same `who-imports` result set); (b) `-wal`-pending writes survive (write
uncommitted edge, checkpoint, migrate, query sees it); (c) second run = `{migrated:false}` no-op;
(d) kill-mid-migration simulation (throw between copy and swap) leaves a readable graph (old), re-run completes.
**AC:** Criteria 2 + 3 (the milestone's irreversible data-touching work — THE headline). `[RULE] copy-verify-swap-never-orphan`, `[RULE] migration-real-root-only`. Destructive Action Guard: pre-approved at M99 define for this exact copy-verify-swap shape.

### M99-D1-T3 — shared append_ledger_line sink (Layer-1 substrate)
**What:** Add `append_ledger_line(record)` to the resolver: fail-open append to
`graphDB/logs/graph-events-NNN.jsonl`; honors `GSDT_GRAPH_TELEMETRY` (default **ON**, `"0"`→OFF writes
zero lines); sized rotation backstop at **50 MB OR 250,000 entries** (`-001`→`-002`…) — a runaway
backstop, NOT routine rotation (a full on-flag analysis session lands in ONE file). A throw inside the
sink is swallowed (best-effort) and NEVER propagates to the caller.
**Files (ImplPath):** `bin/gsd-t-graph-store-resolver.cjs` — `append_ledger_line()` + the rotation helper.
**Touches:** bin/gsd-t-graph-store-resolver.cjs
**Contract:** graph-store-resolver-contract.md § `append_ledger_line` + graph-metrics-contract.md § Sink/rotation/toggle.
**Depends on:** M99-D1-T1.
**Test:** `test/m99-graph-rotation.test.js` (size/count rollover `-001`→`-002` at the backstop) +
`test/m99-graph-telemetry.test.js` (toggle OFF ⇒ zero lines written; a thrown fs error inside the sink
does NOT propagate — fail-open).
**AC:** Criteria 6 (sink path), 7 (sized rotation), 8 (toggle + fail-open). `[RULE] fail-open-telemetry`, `[RULE] layer1-shape-kept`.

### M99-D1-T4 — fold Layer-1 + projectRoot-depth fix into query-cli
**What:** In `bin/gsd-t-graph-query-cli.cjs`: (1) replace the local `resolveStorePath` (`:95`) with the
resolver import; (2) fix the projectRoot depth at `:515`, `:1246`, `:1354` (all currently
`path.dirname(path.dirname(storePath))` = 2-up; the `graphDB/` move makes the store 3-up — route through
`deriveProjectRoot` so the depth is corrected in ONE place); (3) move the `_logGraphEvent` sink (`:1241`/`:1278`)
from `.gsd-t/metrics/` to `graphDB/logs/` via `resolveLogsDir` + `append_ledger_line`. KEEP the Layer-1
record SHAPE and the fail-open invariant byte-for-byte (KEPT, no Divergence — only the sink path + rotation/toggle is the supersede).
**Files (ImplPath):** `bin/gsd-t-graph-query-cli.cjs` — `:95` (resolver import), `:515`/`:1246`/`:1354` (depth fix), `:1241`–`:1278` (sink fold).
**Touches:** bin/gsd-t-graph-query-cli.cjs
**Contract:** graph-store-resolver-contract.md § Invariants (depth-corrected, fail-open) + graph-metrics-contract.md § Layer-1 schema (shape KEPT).
**Depends on:** M99-D1-T1, T3.
**Test:** `test/m99-graph-telemetry.test.js` — Layer-1 events land at `graphDB/logs/graph-events-NNN.jsonl`
(NOT `.gsd-t/metrics/`), record shape unchanged (verb/target/outcome/tier/resultCount/latencyMs/consumer/via
+ freshness fields present), query result byte-identical with telemetry on vs. off.
**AC:** Criteria 6 (sink moved), 8 (byte-identical on/off), Criterion 4 (no surviving `:95` local literal). `[RULE] projectroot-depth-corrected-with-move`, `[RULE] layer1-shape-kept`.

### M99-D1-T5 — route producer-side literals through the resolver
**What:** Replace the raw store-path literals in the 4 producer files with `resolveStorePath`/`resolveGraphDir`:
`gsd-t-graph-index.cjs:392` + `:525`, `gsd-t-graph-freshness.cjs:130`, `gsd-t-graph-k1-sqlite-stream.cjs:81`,
`gsd-t-graph-store-bakeoff.cjs:237`. After this, ZERO raw `.gsd-t/graph.db` literals survive in `bin/`
outside the resolver + the migration shim's explicit legacy-path constant.
**Files (ImplPath):** `bin/gsd-t-graph-index.cjs` (`:392`,`:525`), `bin/gsd-t-graph-freshness.cjs` (`:130`), `bin/gsd-t-graph-k1-sqlite-stream.cjs` (`:81`), `bin/gsd-t-graph-store-bakeoff.cjs` (`:237`).
**Touches:** bin/gsd-t-graph-index.cjs, bin/gsd-t-graph-freshness.cjs, bin/gsd-t-graph-k1-sqlite-stream.cjs, bin/gsd-t-graph-store-bakeoff.cjs
**Contract:** graph-store-resolver-contract.md § Invariants (path single-source).
**Depends on:** M99-D1-T1.
**Test:** `test/m99-resolver-no-raw-literals.test.js` — greps `bin/` + `scripts/` for `\.gsd-t/graph\.db`
and `'graph\.db'` literals; PASS only when the sole survivors are inside `gsd-t-graph-store-resolver.cjs`
(resolver + migration-shim legacy constant). FAILS on any surviving producer/reader literal.
**AC:** Criterion 4 (zero raw literals — M96 split-brain guard). `[RULE] one-resolver-only`.

### M99-D1-T6 — retarget .gitignore at graphDB/
**What:** Retarget the generated-store ignore lines (currently `.gsd-t/graph.db`/`-wal`/`-shm` +
`.gsd-t/metrics/graph-events.jsonl`) to `.gsd-t/graphDB/` (db + sidecars + scip indexes + `logs/`).
**Files (ImplPath):** `.gitignore` — the graph-store + telemetry ignore block.
**Touches:** .gitignore
**Contract:** — (build-output hygiene; supports Criterion 1).
**Depends on:** M99-D1-T1.
**Test:** `test/m99-graph-migration.test.js` (shared) asserts a post-build `git status --porcelain`
shows no `graphDB/` artifact tracked (ignore covers the new layout). Lightweight grep-assert on `.gitignore` content.
**AC:** Criterion 1 (all artifacts under graphDB/, none leaking into git).

### M99-D1-T7 — update the ~20 hardcoded-path tests + author the 4 owned tests
**What:** Update the 20 test files that hardcode `graph.db` to route through the resolver / assert the new
`graphDB/graph.db` live path (none may still assert `.gsd-t/graph.db` as the LIVE path). Confirm NO fixture
builds a graph at a path the shim would itself relocate (the shim's real-root guard + explicit-`projectRoot`
opt-in already prevents this — verify, document the zero co-location). Author the 4 owned test files
(migration, telemetry, rotation, no-raw-literals) referenced by T2–T5.
**Files (ImplPath):** the 20 existing `test/*graph*.test.js` (route through resolver) + the 4 NEW owned test files.
**Touches:** test/m99-graph-migration.test.js, test/m99-graph-telemetry.test.js, test/m99-graph-rotation.test.js, test/m99-resolver-no-raw-literals.test.js
**Contract:** graph-store-resolver-contract.md § Invariants (never inside mkdtemp fixtures).
**Depends on:** M99-D1-T1..T6.
**Test:** the full graph test suite green via `npm test` and the heavy subset via
`--test-concurrency=1 GSDT_SLOW_TESTS=1` (per `feedback_slow_tests_starve_workflow_watchdog`).
**AC:** Criterion 5 (all ~20 path tests pass against new layout; no fixture×shim co-location), Criterion 16 (suite green).
