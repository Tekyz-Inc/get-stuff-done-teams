# Constraints: command-integration

## Must Follow
- Minimal insertion — add only the doc-ripple spawn block, do not refactor surrounding code
- Follow existing spawn patterns in each command file (observability logging, model display)
- Doc-ripple spawn must be AFTER test verification but BEFORE completion reporting
- Update all 4 reference files when adding a new command (README, GSD-T-README, CLAUDE-global, gsd-t-help)

## Must Read Before Using
- commands/gsd-t-doc-ripple.md — the command being integrated (must exist before integration)
- .gsd-t/contracts/doc-ripple-contract.md — trigger conditions that determine when to spawn
- Each target command file — understand existing structure before inserting

## Must Not
- Modify the doc-ripple command file or contract (owned by doc-ripple-agent domain)
- Change existing behavior of the 5 target commands — only append the doc-ripple spawn
- Remove or modify existing Document Ripple sections in commands — doc-ripple supplements them
- Change the wave phase sequence

## Dependencies
- Depends on: doc-ripple-agent domain (must complete first — produces the command file and contract)
- Depended on by: none (terminal domain)
