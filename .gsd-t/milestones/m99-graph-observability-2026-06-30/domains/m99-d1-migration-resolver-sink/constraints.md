# Constraints: m99-d1-migration-resolver-sink

## Hard rules
- **[RULE] one-resolver-only** — There is exactly ONE function deriving a graph path. After this domain, NO file outside `bin/gsd-t-graph-store-resolver.cjs` (and the explicit legacy-path migration shim inside it) may contain a raw `.gsd-t/graph.db` or `.gsd-t/graphDB/` literal. Enforced by `test/m99-resolver-no-raw-literals.test.js`.
- **[RULE] projectroot-depth-corrected-with-move** — The move from `.gsd-t/graph.db` (2 levels above root) to `.gsd-t/graphDB/graph.db` (3 levels above root) changes the `deriveProjectRoot` depth. `deriveProjectRoot` MUST be corrected ATOMICALLY with the path move — never ship the new path with the old `path.dirname(path.dirname(...))` depth, or the sink/freshness/rollup silently target the wrong tree (the salvaged Candidate-C hazard).
- **[RULE] copy-verify-swap-never-orphan** — Migration is copy → verify → swap, NEVER move-then-hope. WAL-checkpoint (or move `db`+`-wal`+`-shm` together) before the swap. At every interruption point an old-OR-new readable graph exists — NEVER neither. Idempotent: re-running is a no-op once migrated. **Destructive Action Guard already user-approved for this copy-verify-swap shape** (recorded at M99 define).
- **[RULE] migration-real-root-only** — The shim fires on first graph touch / during CPUA `update-all`, against a REAL project root only. NEVER inside `mkdtemp` fixtures (the M94 fake-root OOM lesson). Guard with the root/home check.
- **[RULE] fail-open-telemetry** — A ledger write that throws NEVER blocks or alters a graph query result. Logging is best-effort; the underlying decision is byte-identical with `GSDT_GRAPH_TELEMETRY` on vs off. Default ON, stated explicitly (no silent-off).
- **[RULE] layer1-shape-kept** — The Layer-1 `_logGraphEvent` record SHAPE is KEPT (no Divergence). Only the sink PATH (`metrics/` → `graphDB/logs/`) + added rotation/toggle is the SUPERSEDE (`⚠ Divergence` flagged in the PseudoCode docs).

## Do NOT
- Do NOT open `scripts/gsd-t-graph-intercept.js` or `scripts/gsd-t-read-intercept.js` — D2 owns them.
- Do NOT touch `bin/gsd-t.js` — D3 owns the `doGraph` switch + dispatch.
- Do NOT write the rollup or the contract — D3.
- Do NOT delete the only readable graph at any point.

## Sequencing
This domain MUST complete and the migration shim MUST be proven in isolation BEFORE Wave 2 (D2/D3) starts. It owns all shared path-resolving files so nothing else can run beside it.
