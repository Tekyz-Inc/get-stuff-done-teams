# M99 Integration Points — Graph Observability & Consolidation

> Wave groupings + cross-domain seams for M99. Planned 2026-06-30. 3 domains, 2 waves, RISK-FIRST (locked).
> Definition + 16 falsifiable criteria: `.gsd-t/progress.md` (M99). Pseudocode source-of-truth:
> `PseudoCode-GraphObservability.md` + `PseudoCode-GraphFolderMigration.md`.

## Wave structure (LOCKED — risk-first)

| Wave | Domains | Concurrency | Gate |
|------|---------|-------------|------|
| **Wave 1** | `m99-d1-migration-resolver-sink` | runs **ALONE** (serial gate) | the ONLY irreversible / data-touching work (copy-verify-swap migration) — **MUST be proven in isolation BEFORE Wave 2 starts** |
| **Wave 2** | `m99-d2-layer2-decision-logging` ∥ `m99-d3-metrics-rollup` | parallel, **file-disjoint** | both IMPORT D1's resolver; start only after D1's resolver + migration shim land + are proven |

**Why D1 alone:** D1 owns every shared path-resolving file (the resolver + 5 producers + query-cli +
.gitignore + the ~20 path tests). Concentrating them in one owner means no other domain can open a file
that resolves a graph path → the M96-class silent split-brain cannot recur. The migration is the
milestone's only irreversible act (Destructive Action Guard, pre-approved for copy-verify-swap at define).

## The cross-domain seam — D1's resolver (the ONE import surface)

`bin/gsd-t-graph-store-resolver.cjs` (D1 WRITES; D2 + D3 IMPORT read-only). Contract:
`graph-store-resolver-contract.md` v1.0.0.

| Export | Who imports | For what |
|--------|-------------|----------|
| `resolveStorePath()` | D2 (both intercepts) | repoint presence-check + `Database(...)` open at the new `graphDB/graph.db` |
| `resolveLogsDir()` | D2 (workflows), D3 (rollup) | the `graphDB/logs/` sink dir |
| `append_ledger_line(record)` | D2 (intercepts + workflows) | the shared fail-open sink (Layer-2a/2b/2c writes) |
| `migrateGraphStore()` | D1 internal + CPUA `update-all` + first-touch self-heal | the copy-verify-swap shim |
| `deriveProjectRoot()` / `resolveGraphDir()` | D1 internal (query-cli depth fix) | 3-levels-up projectRoot correction |

**Invariant across the seam:** NO domain outside `gsd-t-graph-store-resolver.cjs` may contain a raw
`.gsd-t/graph.db` / `.gsd-t/graphDB/` literal. D2 and D3 are subject to D1's
`test/m99-resolver-no-raw-literals.test.js` grep proof (Criterion 4 — M96 split-brain guard).

## The ledger — shared write target, single reader

| Layer | Writer (domain) | Event `kind` | Reader |
|-------|-----------------|--------------|--------|
| Layer 1 — graph query | D1 (query-cli `_logGraphEvent` fold) | `query` | D3 rollup |
| Layer 2a — grep decision | D2 (`gsd-t-graph-intercept.js`) | `grep` | D3 rollup |
| Layer 2b — read decision | D2 (`gsd-t-read-intercept.js`) | `read` | D3 rollup |
| Layer 2c — wiring mode | D2 (6 workflows) | `wiring` | D3 rollup + scan-header stamp |

All four families share `graphDB/logs/graph-events-NNN.jsonl`; `kind` disambiguates. Schema +
rollup shape: `graph-metrics-contract.md` (D3-owned). **D3 reconciles the documented key set against
the keys D1/D2 actually emit at integrate** (Criterion 15 / `[RULE] contract-matches-emitted-keys`).

## File-ownership disjointness (inter-domain: ZERO overlap)

| Domain | Owned files (count) | Touches `bin/gsd-t.js`? | Touches resolver? |
|--------|--------------------|--------------------------|--------------------|
| D1 | 11 (resolver + 5 producers/query-cli + .gitignore + 4 tests) | NO | WRITES it |
| D2 | 10 (2 intercepts + 6 workflows + 2 tests) | NO | IMPORTS it |
| D3 | 4 (gsd-t.js arm + rollup + contract + 1 test) | YES (sole editor, append-only arm) | IMPORTS it |

Inter-domain owned-set overlap = **zero** (verified at partition: D1=11, D2=10, D3=3 owned, no file
owned by >1 domain). `gsd-t parallel --dry-run` reporting `disjoint?=no` flags INTRA-domain task-to-task
file sharing (e.g. D1-T1..T5 all touch the resolver — expected same-owner sequential, `decision=sequential`),
NOT an inter-domain conflict. Only inter-domain owned-set overlap is a real conflict; it is zero.

## Integration order (within Wave 2)

D2 and D3 are file-disjoint and may land in either order, BUT D3's contract-finalize (T3) must reconcile
against the actual emitted keys from BOTH D1 (Layer-1) and D2 (Layer-2a/2b/2c) — so D3-T3 runs LAST at
integrate, after D2's emitters exist. The rollup (D3-T1) can be built against the contract schema in
parallel with D2; only the final key-set reconciliation waits.

## Verify-phase probes (Red Team / pre-mortem focus)

- **Migration destructive path** (Criteria 2/3): interruption-safety (old-OR-new-never-neither),
  WAL-pending survival, idempotency, real-root-only guard. Destructive Action Guard pre-approved.
- **Fail-open invariant** (Criteria 8/11): a ledger write that throws NEVER blocks/alters a grep, read,
  or query; byte-identical decision with `GSDT_GRAPH_TELEMETRY` on vs off.
- **Silent-disable regression** (Criterion 13 north-star): both intercepts repointed at the resolver so
  they don't disable post-migration; a `fallback-announced` beside a live `outcome:hit` is machine-visible.
