# M96 — Make the Code Graph Runnable in Every Project (store-dependency + resolution)

**Status: DEFINED 2026-06-27 — executing to complete this session.**

## The one-breath call
M94/M95 put the graph runtime files into every project's `bin/` (via `PROJECT_BIN_TOOLS`), and the consumers are wired to read them — but the graph **can't actually run** in any project because its storage engine, `better-sqlite3`, is a GSD-T *devDependency* (not shipped) and the copied tools resolve `require('better-sqlite3')` from the *project's* node_modules (which lacks it). M96 makes the graph runnable everywhere: ship `better-sqlite3` as a real dependency and give the runtime a robust multi-location resolver so a copied tool finds the engine from the GSD-T global package regardless of where it runs.

## Origin (discovered during M95 CPUA, 2026-06-26)
- CPUA shipped v4.10.10; `update-all` copied the 6-file graph runtime into 26 projects (verified in binvoice + NiceNote).
- Building the graph in binvoice FAILED: `Error: Cannot find module 'better-sqlite3'`.
- Verified: `better-sqlite3` is `devDependencies` (`deps: {}`), so it's not in the published package; and a copied `binvoice/bin/gsd-t-graph-index.cjs` resolves the require from `binvoice/node_modules`, not GSD-T's.
- K1 store contract explicitly chose SQLite ("install better-sqlite3 as a devDependency") but never solved project-availability — that was a dev-only spike.

## Decisions already locked (do NOT re-litigate)
- **Store engine: better-sqlite3** (K1 PICK, SQLite). Not switching to pure-JS — the indexer/freshness/query are written against its API and it cleared K1.
- **Strategy: bundle as a real dependency** (user-chosen) + a **multi-location resolver** so copied tools find it. PROVEN this session: a resolver trying [project nm → GSD-T global pkg nm → GSD-T dev tree] resolves better-sqlite3 from binvoice's context.
- **Zero-dep is a guiding principle, not a hard rule** ([[feedback_zero_dep_is_guiding_not_hard]]) — a native dep is justified because the graph (an architectural anchor, [[feedback_graph_is_architectural_anchor]]) can't function without a store.

## Scope
1. **Ship the engine** — move `better-sqlite3` from `devDependencies` to `dependencies` so it installs with GSD-T (global + as a transitive dep).
2. **Robust resolver** — a shared `requireBetterSqlite()` helper that resolves the engine from: (a) the project's own node_modules, (b) the GSD-T global package's node_modules, (c) the GSD-T dev tree fallback. Replace the 5 bare `require('better-sqlite3')` sites in the 3 runtime files (graph-index, graph-freshness, graph-query-cli) with it. FAIL LOUD with a clear "graph store engine unavailable — reinstall GSD-T" message if all candidates miss (never a cryptic MODULE_NOT_FOUND).
3. **Build the graph in binvoice** — prove it runs end-to-end on a real non-GSD-T project (601 TS files, SCIP-ready).
4. **Prove a consumer USES it** — run execute-disjointness (or `/impact`) on binvoice with the graph present and confirm it queries the graph (graphAvailable:true), not the grep fallback. This is the falsifiable "no longer grep-dependent" proof.
5. **Re-CPUA** — republish so projects get the shipped engine + resolver; re-verify binvoice builds after a clean update-all.
6. **NiceNote sanity** — confirm it builds too (18GB repo but only 342 source files; SCIP indexes source only).

## Falsifiable acceptance
- AC-1: `better-sqlite3` is in `dependencies`; `npm pack` includes it / it installs with the global package.
- AC-2: a copied `binvoice/bin/gsd-t-graph-index.cjs` resolves the engine and `build_index` produces a queryable store (files+edges > 0).
- AC-3: resolver FAILS LOUD with a remediation message when the engine is genuinely absent (negative test).
- AC-4: execute-disjointness on binvoice returns `graphAvailable:true` and a real blast-radius (consumer actually reads the graph, not grep).
- AC-5: full GSD-T suite stays green (2502+); no regression from the resolver change.
- AC-6: after re-CPUA + update-all, binvoice builds the graph from its propagated bin/ with zero manual dep install.

## Out of scope (follow-ons)
- Building graphs across ALL projects (do binvoice + NiceNote as proof; bulk build is a separate, cheap follow-on once proven).
- Python scip-python resolution branch (M95 follow-on).
- 594K-edge in-memory query optimization (M95 follow-on).
