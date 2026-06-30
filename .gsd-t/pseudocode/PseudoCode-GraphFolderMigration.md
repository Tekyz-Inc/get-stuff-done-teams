# PseudoCode-GraphFolderMigration

> **Subject:** GraphFolderMigration — the consolidation of every graph artifact under one folder
> (`.gsd-t/graphDB/`), the ONE path resolver every reader/writer routes through, and the migration
> shim that relocates an existing project's loose `.gsd-t/graph.db` (+ scip) into `graphDB/` without
> ever orphaning or corrupting a live graph. Milestone: **M99 — Graph Observability & Consolidation**.
> `[Title]` is the SUBJECT, not the milestone id. The telemetry subject lives in its sibling doc
> [`PseudoCode-GraphObservability.md`](PseudoCode-GraphObservability.md).

---

## Intention

> **Intention (David, 2026-06-30).** Give the graph ONE home. Today the graph's artifacts are
> scattered across `.gsd-t/` root — `graph.db`, `graph.db-wal`, `graph.db-shm`, `index.scip`,
> `index-python.scip`, and (soon) the telemetry logs. The path is NOT behind one helper: it is ~7
> scattered `path.join(..., '.gsd-t', 'graph.db')` string literals across the indexer, freshness,
> query CLI, k1-stream, store-bakeoff, and both intercept hooks, plus 20 test files hardcoding the
> same path. Consolidate everything under `.gsd-t/graphDB/`, and route every reader/writer through
> ONE resolver so writer and readers can never disagree.
>
> **A real project's graph must NOT be orphaned by the move.** Existing projects already have a live
> `.gsd-t/graph.db`. On first touch after the upgrade, that graph is auto-migrated into
> `.gsd-t/graphDB/` — and it must answer queries identically afterward, with zero re-index forced.
>
> **This is the one irreversible, data-touching step — the Destructive Action Guard applies.** The
> guarded, user-approved decision is COPY-THEN-VERIFY-THEN-SWAP: never move-then-pray. The old graph
> is retained until the new one is proven readable; the shim NEVER deletes the only readable graph.
> An interrupted migration must leave a readable graph (old OR new, never neither). It is idempotent
> (second run = no-op). A project with NO existing graph is untouched.
>
> **The split-brain hazard is why the resolver comes before the move.** If even one literal is missed,
> the writer writes `graphDB/` while a reader still looks at `graph.db` → the graph appears empty —
> the EXACT M96 silent-empty-graph failure. So: introduce ONE resolver FIRST, route every literal
> through it, then grep-prove zero surviving raw `.gsd-t/graph.db` literals outside the resolver + the
> shim.
>
> **The projectRoot-derivation depth is coupled to the move (the subtle one).** The query CLI derives
> `projectRoot` via `path.dirname(path.dirname(storePath))`, assuming the store is 2 levels above the
> repo root (`.gsd-t/graph.db`). Moving to `.gsd-t/graphDB/graph.db` adds ONE directory level → that
> derivation would yield `.gsd-t/` instead of the repo root → the telemetry sink, the freshness root,
> AND the metrics rollup would ALL silently target the wrong tree. So the path-move and the
> depth-correction are ONE atomic change.

---

## Mechanism

Pseudocode grounds in EXISTING GSD-T conventions. The resolver is a new `bin/<tool>.cjs`-style
helper (or an exported function) that every graph reader/writer imports; the shim is invoked lazily
on first graph touch. Concrete SQLite open-options (whether WAL is in effect) are DEFERRED to
plan/execute time — verified by reading the `Database(...)` open call before the shim is finalized.

```
# ============================================================
# TIER 1 — ONE resolver (introduce FIRST, route every literal through it)
# ============================================================

PROCEDURE resolveGraphDir(repoRoot):
    RETURN join(repoRoot, ".gsd-t", "graphDB")           # the single home

PROCEDURE resolveStorePath(repoRoot):
    RETURN join(resolveGraphDir(repoRoot), "graph.db")   # graphDB/graph.db

PROCEDURE resolveLogsDir(repoRoot):
    RETURN join(resolveGraphDir(repoRoot), "logs")       # graphDB/logs/

PROCEDURE deriveProjectRoot(storePath):
    # storePath = <root>/.gsd-t/graphDB/graph.db  => 3 levels up, NOT 2
    RETURN dirname(dirname(dirname(storePath)))          # CORRECTED depth
    #  [RULE] projectroot-depth-corrected-with-move   (atomic with the path move)

# every former literal (indexer :392/:525, freshness :130, query-cli :107/:229/:460/:515,
# k1-stream :81, store-bakeoff :237, intercept :69, read-intercept :74/:108) now CALLS these.
#  [RULE] zero-raw-literals-outside-resolver-and-shim

# ============================================================
# TIER 0 — migration shim (HIGHEST risk; runs on first graph touch; COPY-VERIFY-SWAP)
# ============================================================

PROCEDURE migrate_if_legacy(repoRoot):
    legacyDb   = join(repoRoot, ".gsd-t", "graph.db")
    newDir     = resolveGraphDir(repoRoot)
    newDb      = resolveStorePath(repoRoot)

    IF NOT exists(legacyDb): RETURN                    # no legacy graph => untouched (criterion 2/3d)
    IF exists(newDb) AND readable_graph(newDb): RETURN # idempotent: already migrated => no-op

    mkdir_p(newDir); mkdir_p(resolveLogsDir(repoRoot))
    # COPY each coupled artifact (db + -wal + -shm + index.scip + index-python.scip), do NOT move yet
    FOR f IN [graph.db, graph.db-wal, graph.db-shm, index.scip, index-python.scip]:
        IF exists(legacy(f)): copy(legacy(f), new(f))   # copy-then-verify, never move-then-pray

    # VERIFY the copy opens and answers identically BEFORE removing the old
    IF NOT readable_graph(newDb):
        cleanup_partial(newDir)                         # interrupted/failed copy => old graph intact
        RETURN                                          # leaves a readable graph (the OLD one)
        #  [RULE] interruption-safe-old-or-new-never-neither

    # SWAP: only now remove the legacy artifacts (the new graph is proven readable)
    FOR f IN [graph.db, graph.db-wal, graph.db-shm, index.scip, index-python.scip]:
        IF exists(legacy(f)): remove(legacy(f))         # never deleted the only readable graph
    #  [RULE] never-delete-only-readable-graph   ·   [RULE] copy-verify-swap-not-move-then-pray

PROCEDURE readable_graph(dbPath):
    # opens the store readonly and runs one trivial query; identical result-set vs. a control copy
    RETURN open_and_query_ok(dbPath)
```

---

## One-breath table

| Actor | One-breath responsibility | Guard |
|-------|---------------------------|-------|
| `resolveGraphDir/StorePath/LogsDir` | the SINGLE source of every graph path | `zero-raw-literals-outside-resolver-and-shim` |
| `deriveProjectRoot` | 3-levels-up depth, atomic with the move | `projectroot-depth-corrected-with-move` |
| `migrate_if_legacy` | copy→verify→swap; idempotent; interruption-safe | `copy-verify-swap-not-move-then-pray`, `never-delete-only-readable-graph`, `interruption-safe-old-or-new-never-neither` |
| `readable_graph` | proves the new store answers before old is removed | — |

---

## Guard map ([RULE] IDs → falsifiable acceptance)

| [RULE] | What it guarantees | Falsifier (→ FAIL) | Acceptance # |
|--------|--------------------|--------------------|--------------|
| all artifacts under `graphDB/` after clean build | db/wal/shm/scip/logs consolidated | any written outside `.gsd-t/graphDB/` | 1 |
| `copy-verify-swap-not-move-then-pray` | migrated graph answers identically | post-migration query returns graph-unavailable or a different result-set | 2 |
| idempotent + `interruption-safe-old-or-new-never-neither` | re-run no-op; kill mid-migration leaves a readable graph | re-run errors, or interrupted run leaves zero readable graph | 3 |
| `never-delete-only-readable-graph` | old retained until new proven readable | the only readable graph deleted before verify | 3 |
| `zero-raw-literals-outside-resolver-and-shim` | no M96 split-brain | any surviving raw `.gsd-t/graph.db` literal in a reader/writer | 4 |
| 20 hardcoded-path tests pass on new layout | tests routed through resolver or updated | any graph test still asserting `.gsd-t/graph.db` as the live path | 5 |
| `projectroot-depth-corrected-with-move` | sink/freshness/rollup target the repo root, not `.gsd-t/` | derived projectRoot equals `.gsd-t/` (2-up) post-move | (sibling 6, 13) |

---

## ⚠ Divergence flags (keep-or-supersede over inherited shipped-code models)

The keep-or-supersede protocol was run over the inherited store-path model:

⚠ Divergence: graph-store-path — supersedes shipped store location `.gsd-t/graph.db` (loose at `.gsd-t/` root). Reason: user-locked consolidation of all graph artifacts under `.gsd-t/graphDB/` with an auto-migration shim so no existing graph is orphaned.

⚠ Divergence: projectroot-derivation-depth — supersedes shipped `path.dirname(path.dirname(storePath))` (2-levels-up, assumed `.gsd-t/graph.db`). Reason: the store moves one directory deeper to `.gsd-t/graphDB/graph.db`, so the repo-root derivation must go 3 levels up; the depth-correction is atomic with the path move to avoid a silent wrong-tree sink/freshness/rollup.

**KEPT (no flag):**
- The SQLite store engine + schema (M94/M95/M98, incl. the `nodes.end_line` column) — relocated, not changed.
- The fail-open posture of both intercept hooks' graph-presence checks (`fs.existsSync(...graph.db)`)
  — KEPT; the existence check is repointed at the new path so the hooks do not silently disable.

---

## Appendix — the one guarded action, and the WAL caveat

**Destructive Action Guard (the one guarded action in M99):** this folder consolidation RELOCATES a
real, working store. The user-approved guarded behavior is copy-then-verify-then-swap, old retained
until new proven readable, never orphan, never delete the only readable graph. This is the explicit
approval recorded in the locked scope — no further re-litigation, but criterion 3 (interruption
safety) is the proof obligation.

**WAL caveat (to verify at plan/execute time — `[GUESSED:assumed]`):** SQLite WAL mode produces
sibling `-wal` and `-shm` files that must be handled together; if the store is opened in WAL mode, a
checkpoint/close before relocation is required so no uncommitted pages are stranded. The shim design
above copies all three coupled files, but whether a checkpoint is needed depends on the actual
`Database(...)` open options — verified by Read before the shim is finalized, not asserted here.
