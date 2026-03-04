# Integration Points

## Current State: Milestone 14 — Execution Intelligence Layer (3 domains)

## Dependency Graph

```
event-stream Task 1  ──▶  learning-loop Tasks 1, 2, 3  (all blocked on schema)
event-stream Task 1  ──▶  reflect Tasks 1, 2            (all blocked on schema)
event-stream Task 3  ──▶  (requires Task 1 file to exist for installer)
reflect Task 2       ──▶  reflect Task 3                (docs need command file first)
```

## Wave Execution Groups

### Wave 1 — Independent (parallel-safe)
- event-stream: Tasks 1, 2, 3, 4
  - Task 1 first (creates event-writer.js)
  - Task 2 after Task 1 (heartbeat enrichment)
  - Task 3 after Task 1 (installer needs the file)
  - Task 4 independent (gsd-t-init.md change)
- **Shared files**: NONE between event-stream tasks (Tasks 1/4 are separate files; Tasks 2/3 touch different files)
- **Internal ordering within wave**: Task 1 → Tasks 2+3; Task 4 any time
- **Completes when**: All 4 event-stream tasks done + tests pass

### Checkpoint 1 — Between Wave 1 and Wave 2
- **GATE**: event-stream Task 1 complete
- **VERIFY**: `scripts/gsd-t-event-writer.js` exists; `.gsd-t/contracts/event-schema-contract.md` exists
- **Also verify**: `node scripts/gsd-t-event-writer.js --type command_invoked --command test` runs without crash
- **UNBLOCKS**: learning-loop Tasks 1-3, reflect Tasks 1-2

### Wave 2 — After Checkpoint 1 (parallel-safe between domains, sequential within reflect)
- learning-loop: Tasks 1, 2, 3 (all parallel-safe — different files)
  - execute.md, debug.md, wave.md are all separate files
- reflect: Tasks 1, 2 (parallel-safe with learning-loop — different files)
  - complete-milestone.md, gsd-t-reflect.md are separate files
- **Shared files**: NONE — all 5 tasks in wave 2 touch different files
- **Completes when**: All 5 tasks done + tests pass

### Wave 3 — After Wave 2 (sequential, docs only)
- reflect: Task 3 (update 4 reference files)
- **Requires**: reflect Task 2 complete (gsd-t-reflect.md must exist)
- **Shared files**: README.md, GSD-T-README.md, CLAUDE-global.md, gsd-t-help.md
  - These 4 files are ONLY touched by reflect Task 3 — safe
- **Completes when**: Task 3 done, all 4 reference files updated with count 47

### Checkpoint 2 — Final (pre-integration)
- **GATE**: All 3 waves complete
- **VERIFY**:
  - `scripts/gsd-t-event-writer.js` exists and validates schema
  - `scripts/gsd-t-heartbeat.js` still passes all existing tests
  - `commands/gsd-t-execute.md` has pre-task retrieval block
  - `commands/gsd-t-debug.md` has experience retrieval step
  - `commands/gsd-t-wave.md` has phase_transition event writes
  - `commands/gsd-t-complete-milestone.md` has Step 2.5 distillation
  - `commands/gsd-t-reflect.md` exists
  - All 4 reference files show count 47
  - `npm test` 127+ tests pass

## Execution Order (Solo Mode)

1. **event-stream Task 1**: Create gsd-t-event-writer.js
2. **event-stream Task 4**: Update gsd-t-init.md (independent, can run in parallel with Task 1)
3. **event-stream Task 2**: Enrich heartbeat.js (after Task 1)
4. **event-stream Task 3**: Update bin/gsd-t.js installer (after Task 1)
5. **CHECKPOINT 1**: Verify event-writer.js and schema contract
6. **learning-loop Task 1**: Update execute.md (parallel-safe with learning-loop 2+3 and reflect 1+2)
7. **learning-loop Task 2**: Update debug.md
8. **learning-loop Task 3**: Update wave.md
9. **reflect Task 1**: Update complete-milestone.md
10. **reflect Task 2**: Create gsd-t-reflect.md
11. **reflect Task 3**: Update 4 reference files (after Task 2)
12. **CHECKPOINT 2**: Full verification before test-sync

## History
- **Milestone 3** (Count Fix + QA Contract Alignment): Single domain, no integration points needed.
- **Milestones 4-8**: All single-domain milestones — no integration points.
- **Milestone 14** (Execution Intelligence Layer): 3 domains, 2 wave checkpoints. event-stream is foundational (must complete Task 1 first). learning-loop and reflect run in parallel after Checkpoint 1. reflect Task 3 (docs) waits for reflect Task 2 (new command).
