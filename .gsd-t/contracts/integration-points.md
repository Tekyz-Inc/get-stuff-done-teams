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
