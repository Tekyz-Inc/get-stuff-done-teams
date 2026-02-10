# Integration Points

## Dependency Graph

### Independent (can start immediately)
- templates: Tasks 1-2 (no dependencies)

### First Checkpoint
- GATE: templates domain must complete (file formats defined)
- UNLOCKS: commands domain Tasks 1-7 (needs file format to implement read/write logic)
- VERIFY: Lead confirms template files match file-format-contract.md

### Second Checkpoint
- GATE: commands domain must complete (all 7 command files created)
- UNLOCKS: integration domain Tasks 1-5 (needs command list to update help, README, etc.)
- VERIFY: Lead confirms all 7 commands exist and match command-interface-contract.md

### Final
- GATE: integration domain must complete
- VERIFY: All references consistent across init, status, help, CLAUDE-global, README

## Execution Order (solo mode)
1. templates Task 1: Create backlog.md template
2. templates Task 2: Create backlog-settings.md template
3. CHECKPOINT: verify both templates match file-format-contract.md
4. commands Task 1: backlog-add (depends on settings format)
5. commands Task 2: backlog-list (depends on backlog format)
6. commands Task 3: backlog-move (depends on backlog format)
7. commands Task 4: backlog-edit (depends on settings format)
8. commands Task 5: backlog-remove (depends on backlog format)
9. commands Task 6: backlog-settings (depends on settings format)
10. commands Task 7: backlog-promote (depends on backlog format)
11. CHECKPOINT: verify all 7 commands match command-interface-contract.md
12. integration Task 1: Update gsd-t-init.md
13. integration Task 2: Update gsd-t-status.md
14. integration Task 3: Update gsd-t-help.md
15. integration Task 4: Update CLAUDE-global.md
16. integration Task 5: Update README.md
17. CHECKPOINT: verify all cross-references are consistent

## Parallelization Notes
- templates Tasks 1-2 can run in parallel (no interdependency)
- commands Tasks 1-7 can run in parallel after templates checkpoint (each creates an independent file)
- integration Tasks 1-5 can run in parallel after commands checkpoint (each modifies a different file)
