# Domain: m99-d1-migration-resolver-sink

## Wave: 1 (SERIAL GATE — runs ALONE, gates D2 + D3)

## One-line
The risk firewall. The ENTIRE path/shim/sink stack in one owner so it can never collide on `resolveStorePath`. Tier 0 (migration shim) + Tier 1 (single resolver) + Tier 3 Layer-1 fold-in (sink relocation + rotation + toggle).

## Why this domain exists
M99's only irreversible, data-touching work (the copy-verify-swap migration) and its most-coupled change (routing ~7 scattered `.gsd-t/graph.db` literals + the projectRoot-depth fix through ONE resolver) live here. Concentrating them in one owner means no other domain can open a file that resolves a graph path, so the M96-class silent split-brain can't recur. D2 and D3 IMPORT the resolver this domain exports; they never re-derive a path.

## Owned / Written files
- `bin/gsd-t-graph-store-resolver.cjs` — **NEW**. The single resolver module. Exports `resolveGraphDir()`, `resolveStorePath()`, `resolveLogsDir()`, `deriveProjectRoot()` (3-levels-up, depth-corrected atomically with the move to `graphDB/`), the copy-verify-swap migration shim (`migrateGraphStore()`), and the shared `append_ledger_line()` sink substrate (with `GSDT_GRAPH_TELEMETRY` toggle + sized rotation 50MB / 250k-entry backstop, `-001` → `-002`).
- `bin/gsd-t-graph-query-cli.cjs` — replace local `resolveStorePath()` (`:95`) with the resolver; fix projectRoot depth at `:515` / `:1246` / `:1354`; fold the `_logGraphEvent` sink (`:1241`) move from `.gsd-t/metrics/` to `graphDB/logs/` via `resolveLogsDir` + the shared `append_ledger_line`. Keep the Layer-1 record SHAPE + fail-open invariant (KEPT, no Divergence flag).
- `bin/gsd-t-graph-index.cjs` — route the two `.gsd-t/graph.db` literals (`:392`, `:525`) through the resolver.
- `bin/gsd-t-graph-freshness.cjs` — route the literal (`:130`) through the resolver.
- `bin/gsd-t-graph-k1-sqlite-stream.cjs` — route the literal (`:81`) through the resolver.
- `bin/gsd-t-graph-store-bakeoff.cjs` — route the literal (`:237`) through the resolver.
- `.gitignore` — retarget the generated graph-store ignore to `.gsd-t/graphDB/`.
- `test/m99-graph-migration.test.js` — **NEW**. Copy-verify-swap idempotency + interruption-safety (old-or-new-never-neither) + identical-answer post-migration.
- `test/m99-graph-telemetry.test.js` — **(uncommitted, fold in)** Layer-1 sink at new path + toggle on/off byte-identical.
- `test/m99-graph-rotation.test.js` — **NEW**. Sized rotation `-001` → `-002` at the size/count backstop.
- `test/m99-resolver-no-raw-literals.test.js` — **NEW**. Grep-proves zero raw `.gsd-t/graph.db` literals survive outside the resolver + the legacy-path shim.

## NOT owned (other domains)
- `scripts/gsd-t-graph-intercept.js`, `scripts/gsd-t-read-intercept.js` — **D2 owns both wholly** (D2 repoints their presence checks at this resolver, importing it).
- `bin/gsd-t.js`, `bin/gsd-t-graph-metrics-rollup.cjs`, `.gsd-t/contracts/graph-metrics-contract.md` — **D3**.
- The 6 workflow `.js` files — **D2**.

## Exports D2/D3 depend on
`resolveStorePath`, `resolveLogsDir`, `resolveGraphDir`, `deriveProjectRoot`, `append_ledger_line` — all from `bin/gsd-t-graph-store-resolver.cjs`.

## Done when
1. ONE resolver module exists; every graph-path literal in the 5 producer files routes through it.
2. `test/m99-resolver-no-raw-literals.test.js` proves zero raw literals survive outside resolver + shim.
3. Migration shim is idempotent + interruption-safe + identical-answer, proven in isolation BEFORE telemetry is built on it.
4. Layer-1 sink writes to `graphDB/logs/`, rotates by size/count, respects `GSDT_GRAPH_TELEMETRY`, fail-open.
5. The ~20 hardcoded-path tests route through the resolver and pass.
