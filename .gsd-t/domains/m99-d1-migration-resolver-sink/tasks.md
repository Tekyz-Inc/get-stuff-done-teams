# Tasks: m99-d1-migration-resolver-sink

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

### M99-D1-T1
**What:** Create `bin/gsd-t-graph-store-resolver.cjs` exporting `resolveGraphDir`, `resolveStorePath`, `resolveLogsDir`, `deriveProjectRoot` (3-levels-up, depth-corrected for the `graphDB/` move).
**Touches:** bin/gsd-t-graph-store-resolver.cjs

### M99-D1-T2
**What:** Add the copy-verify-swap `migrateGraphStore()` to the resolver — WAL-checkpoint, idempotent, interruption-safe (old-or-new-never-neither), real-root-only guard, fires on first graph touch / CPUA update-all.
**Touches:** bin/gsd-t-graph-store-resolver.cjs

### M99-D1-T3
**What:** Add the shared `append_ledger_line()` sink to the resolver — `GSDT_GRAPH_TELEMETRY` toggle (default ON), sized rotation (50MB / 250k-entry backstop, `-001`→`-002`), fail-open.
**Touches:** bin/gsd-t-graph-store-resolver.cjs

### M99-D1-T4
**What:** In `gsd-t-graph-query-cli.cjs`: replace local `resolveStorePath` (:95) with the resolver; fix projectRoot depth at :515 / :1246 / :1354; fold `_logGraphEvent` (:1241) sink to `graphDB/logs/` via `resolveLogsDir` + `append_ledger_line`. Keep Layer-1 record shape + fail-open.
**Touches:** bin/gsd-t-graph-query-cli.cjs

### M99-D1-T5
**What:** Route the producer-side literals through the resolver: index (:392,:525), freshness (:130), k1-stream (:81), store-bakeoff (:237).
**Touches:** bin/gsd-t-graph-index.cjs, bin/gsd-t-graph-freshness.cjs, bin/gsd-t-graph-k1-sqlite-stream.cjs, bin/gsd-t-graph-store-bakeoff.cjs

### M99-D1-T6
**What:** Retarget `.gitignore` generated-store ignore to `.gsd-t/graphDB/`.
**Touches:** .gitignore

### M99-D1-T7
**What:** Update the ~20 hardcoded-path tests to route through the resolver; write the 4 owned test files (migration idempotency/interruption-safety, telemetry sink+toggle, rotation, no-raw-literals grep proof).
**Touches:** test/m99-graph-migration.test.js, test/m99-graph-telemetry.test.js, test/m99-graph-rotation.test.js, test/m99-resolver-no-raw-literals.test.js
