# Integration Points

## Current State: Milestone 15 — Real-Time Agent Dashboard (3 domains)

## Dependency Graph

```
server Task 1  ──▶  command Tasks 1, 2, 3  (command needs server.js to exist)
dashboard Task 1  ──▶  command Tasks 1, 2  (command needs dashboard.html to exist)
server and dashboard ──▶  parallel-safe (different files, no shared state)
```

## Wave Execution Groups

### Wave 1 — Independent (parallel-safe)
- server: Task 1 (create gsd-t-dashboard-server.js)
  - Zero external deps, module.exports, SSE endpoints, --detach flag
- dashboard: Task 1 (create gsd-t-dashboard.html)
  - React Flow + Dagre via CDN, ≤200 lines, dark theme, SSE connect
- **Shared files**: NONE — server owns scripts/gsd-t-dashboard-server.js; dashboard owns scripts/gsd-t-dashboard.html
- **Completes when**: Both tasks done + tests pass (test/dashboard-server.test.js)

### Checkpoint 1 — Between Wave 1 and Wave 2
- **GATE**: server Task 1 AND dashboard Task 1 both complete
- **VERIFY**:
  - `scripts/gsd-t-dashboard-server.js` exists and exports startServer/tailEventsFile/readExistingEvents/parseEventLine/findEventsDir
  - `scripts/gsd-t-dashboard.html` exists and is ≤200 lines
  - `node -e "require('./scripts/gsd-t-dashboard-server.js')"` exits cleanly (no import errors)
  - `node scripts/gsd-t-dashboard-server.js --ping 2>&1 | grep -q ok || true` (optional smoke check)
- **UNBLOCKS**: command Tasks 1, 2, 3

### Wave 2 — After Checkpoint 1 (sequential within command domain)
- command: Task 1 (create commands/gsd-t-visualize.md)
  - Step 0 self-spawn, OBSERVABILITY LOGGING, spawn server + open browser, write command_invoked event
- command: Task 2 (update bin/gsd-t.js — add dashboard files to UTILITY_SCRIPTS)
  - Add gsd-t-dashboard-server.js and gsd-t-dashboard.html to UTILITY_SCRIPTS array
- command: Task 3 (update 4 reference files + increment counts 47→48 / 43→44)
  - README.md, docs/GSD-T-README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md
  - test/filesystem.test.js count assertions 47→48 / 43→44
- **Internal ordering**: Task 1 first (command file must exist), Task 2 next (installer), Task 3 last (docs need command to exist)
- **Completes when**: All 3 tasks done + all 153+ tests pass

### Checkpoint 2 — Final (pre-verify)
- **GATE**: All 2 waves complete
- **VERIFY**:
  - `scripts/gsd-t-dashboard-server.js` exists, module.exports complete
  - `scripts/gsd-t-dashboard.html` exists, ≤200 lines
  - `commands/gsd-t-visualize.md` exists, has Step 0 OBSERVABILITY LOGGING
  - `bin/gsd-t.js` UTILITY_SCRIPTS includes both dashboard files
  - All 4 reference files show count 48 (GSD-T commands: 44)
  - `npm test` 153+ tests pass

## Execution Order (Solo Mode)

1. **server Task 1**: Create gsd-t-dashboard-server.js (parallel-safe with dashboard)
2. **dashboard Task 1**: Create gsd-t-dashboard.html (parallel-safe with server)
3. **CHECKPOINT 1**: Verify both files exist, module.exports work
4. **command Task 1**: Create commands/gsd-t-visualize.md
5. **command Task 2**: Update bin/gsd-t.js UTILITY_SCRIPTS array
6. **command Task 3**: Update 4 reference files + filesystem.test.js counts
7. **CHECKPOINT 2**: Full verification — all files, all tests pass

## History
- **Milestone 3** (Count Fix + QA Contract Alignment): Single domain, no integration points needed.
- **Milestones 4-8**: All single-domain milestones — no integration points.
- **Milestone 14** (Execution Intelligence Layer): 3 domains, 2 wave checkpoints. event-stream is foundational (must complete Task 1 first). learning-loop and reflect run in parallel after Checkpoint 1. reflect Task 3 (docs) waits for reflect Task 2 (new command).
- **Milestone 15** (Real-Time Agent Dashboard): 3 domains, 2 wave checkpoints. server + dashboard run in parallel (Wave 1, different files). command runs after both complete (Wave 2, sequential within domain). command Task 3 (docs) waits for Task 1 (new command file).

---

## Current State: Milestone 17 — Scan Visual Output (4 domains)

## Dependency Graph

```
scan-schema (bin/scan-schema.js)
  └──▶ scan-diagrams (bin/scan-diagrams.js + scan-renderer.js)
         └──▶ scan-report (bin/scan-report.js + commands/gsd-t-scan.md)
                └──▶ scan-export (bin/scan-export.js + bin/gsd-t.js --export flag)
```

- scan-schema and scan-diagrams are pure modules (no file output beyond their .js files)
- scan-report owns the only user-visible output file: scan-report.html
- scan-export is terminal — runs last, only when --export flag is passed

## Wave Execution Groups

### Wave 1 — Independent (parallel-safe)
- scan-schema: all tasks (creates bin/scan-schema.js)
  - Owned file: `bin/scan-schema.js`
  - Produces: `extractSchema(projectRoot)` function per scan-schema-contract.md
- scan-diagrams: all tasks (creates bin/scan-diagrams.js + bin/scan-renderer.js)
  - Owned files: `bin/scan-diagrams.js`, `bin/scan-renderer.js`
  - Produces: `generateDiagrams(analysisData, schemaData, options)` function per scan-diagrams-contract.md
- **Shared files**: NONE — each domain owns distinct files
- **Completes when**: Both domains done + unit tests pass for each module

### Checkpoint 1 — Between Wave 1 and Wave 2
- **GATE**: scan-schema AND scan-diagrams both complete
- **VERIFY**:
  - `bin/scan-schema.js` exists and exports `extractSchema`
  - `bin/scan-diagrams.js` exists and exports `generateDiagrams`
  - `bin/scan-renderer.js` exists and exports `renderDiagram`
  - `node -e "require('./bin/scan-schema.js')"` exits cleanly
  - `node -e "require('./bin/scan-diagrams.js')"` exits cleanly
  - Both functions return correct shapes per contracts when called with minimal test input
- **UNBLOCKS**: scan-report all tasks

### Wave 2 — After Checkpoint 1
- scan-report: all tasks (creates bin/scan-report.js, modifies commands/gsd-t-scan.md)
  - Owned files: `bin/scan-report.js`, `commands/gsd-t-scan.md`
  - Adds Steps 2.5, 3.5 to gsd-t-scan.md; creates `generateReport()` function
  - Output: `scan-report.html` (generated at scan runtime, not during build)
- **Internal ordering**: bin/scan-report.js first, then commands/gsd-t-scan.md integration
- **Completes when**: scan-report.js exports `generateReport`, scan.md updated, npm test passes

### Checkpoint 2 — Between Wave 2 and Wave 3
- **GATE**: scan-report complete
- **VERIFY**:
  - `bin/scan-report.js` exists and exports `generateReport`
  - `commands/gsd-t-scan.md` has Step 2.5 (schema extraction) and Step 3.5 (diagram generation)
  - `node -e "require('./bin/scan-report.js')"` exits cleanly
  - npm test passes (all existing tests still pass)
- **UNBLOCKS**: scan-export all tasks

### Wave 3 — After Checkpoint 2
- scan-export: all tasks (creates bin/scan-export.js, adds --export flag to bin/gsd-t.js)
  - Owned files: `bin/scan-export.js`, `bin/gsd-t.js` (--export flag only)
  - Graceful skip if Pandoc/md-to-pdf absent
- **Completes when**: scan-export.js exports `exportReport`, gsd-t.js --export flag works, npm test passes

### Checkpoint 3 — Final (pre-verify)
- **GATE**: All 3 waves complete
- **VERIFY**:
  - `bin/scan-schema.js` exports `extractSchema`
  - `bin/scan-diagrams.js` exports `generateDiagrams`, `bin/scan-renderer.js` exports `renderDiagram`
  - `bin/scan-report.js` exports `generateReport`
  - `bin/scan-export.js` exports `exportReport`
  - `commands/gsd-t-scan.md` has Step 2.5 and Step 3.5
  - `bin/gsd-t.js` accepts `--export=docx` and `--export=pdf` flags
  - `npm test` passes (178+ tests)

## Execution Order (Solo Mode)

1. **scan-schema**: Create bin/scan-schema.js (parallel-safe with scan-diagrams)
2. **scan-diagrams**: Create bin/scan-diagrams.js + bin/scan-renderer.js (parallel-safe with scan-schema)
3. **CHECKPOINT 1**: Verify both modules export correct functions, contracts satisfied
4. **scan-report Task 1**: Create bin/scan-report.js
5. **scan-report Task 2**: Update commands/gsd-t-scan.md (add Steps 2.5 and 3.5)
6. **CHECKPOINT 2**: Verify scan-report.js exports, scan.md updated, tests pass
7. **scan-export Task 1**: Create bin/scan-export.js
8. **scan-export Task 2**: Add --export flag to bin/gsd-t.js
9. **CHECKPOINT 3**: Full verification — all modules, all flags, all tests pass
