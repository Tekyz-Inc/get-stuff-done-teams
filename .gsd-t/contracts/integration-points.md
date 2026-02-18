# Integration Points — Milestone 3: Count Fix + QA Contract Alignment

## Dependency Graph

### Independent (can start immediately)
- count-contract-fix: All tasks (no cross-domain dependencies)

## Execution Order (solo mode)
1. Task 1: Fix stale command counts (8 line changes across 4 files)
2. Task 2: Add test-sync phase to QA agent (2 files)
3. Task 3: DONE — orphaned domain files already archived
4. VERIFY: grep confirms no stale counts, QA contract has test-sync

## Parallelization Notes
- All tasks are independent — could run in parallel but scope is too small to justify
- Solo sequential recommended
