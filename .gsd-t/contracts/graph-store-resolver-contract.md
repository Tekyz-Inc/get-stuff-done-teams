# Contract: Graph Store Resolver

## Version: 1.0.0 (M99 — Graph Observability & Consolidation)
## Status: DEFINED (authored at partition; implemented in M99 D1)
## Owner (writer): m99-d1-migration-resolver-sink
## Consumers (importers): m99-d2-decision-logging, m99-d3-metrics-rollup

---

## Purpose
Defines the single resolver module `bin/gsd-t-graph-store-resolver.cjs` — the ONE place a graph
path is derived after M99. D2 (intercepts + workflows) and D3 (rollup) import from it; they never
re-derive a path or contain a raw `.gsd-t/graph.db` / `.gsd-t/graphDB/` literal. This is the seam
that prevents the M96-class silent split-brain (two code paths disagreeing on where the store lives).

## Exported surface

| Export | Signature | Returns |
|--------|-----------|---------|
| `resolveGraphDir(projectRoot?)` | `(string?) => string` | absolute path to `.gsd-t/graphDB/` |
| `resolveStorePath(projectRoot?)` | `(string?) => string` | absolute path to `.gsd-t/graphDB/graph.db` |
| `resolveLogsDir(projectRoot?)` | `(string?) => string` | absolute path to `.gsd-t/graphDB/logs/` |
| `deriveProjectRoot(storePath)` | `(string) => string` | repo root — **3 levels up** from `graphDB/graph.db` (depth-corrected atomically with the move) |
| `migrateGraphStore(projectRoot?)` | `(string?) => {migrated:bool, reason:string}` | copy-verify-swap shim; idempotent; interruption-safe; real-root-only |
| `append_ledger_line(record)` | `(object) => void` | fail-open append to `graphDB/logs/graph-events-NNN.jsonl`; honors `GSDT_GRAPH_TELEMETRY`; sized rotation (50MB / 250k backstop, `-001`→`-002`) |

## Invariants the consumers rely on
- **Path single-source:** every graph-path literal routes through this module. Enforced by `test/m99-resolver-no-raw-literals.test.js` (D1).
- **Depth-corrected:** `deriveProjectRoot` is corrected for the 3-levels-up move atomically with the path change (`[RULE] projectroot-depth-corrected-with-move`).
- **Fail-open sink:** `append_ledger_line` throwing never blocks or alters any graph/grep/read decision; byte-identical with `GSDT_GRAPH_TELEMETRY` on vs off (default ON, never silent-off).
- **Never-orphan migration:** `migrateGraphStore` is copy → verify → swap; an old-OR-new readable graph exists at every interruption point; never fires inside `mkdtemp` fixtures.

## Boundary
- D1 WRITES this module. D2/D3 IMPORT it read-only (call the functions; never redefine).
- The ledger event SHAPE + rollup output shape live in `graph-metrics-contract.md` (D3-owned). This
  contract governs only the resolver/sink/migration SURFACE.
