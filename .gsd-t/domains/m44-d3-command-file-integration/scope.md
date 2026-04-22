# Domain: m44-d3-command-file-integration

## Responsibility

Wire the five primary GSD-T command files to dispatch parallel task execution via the D2 `gsd-t parallel` CLI instead of sequential single-domain spawns. This domain is purely doc-ripple + integration block additions to command files — no new library code.

The five command files that gain parallel dispatch:
- `commands/gsd-t-execute.md` — primary execution command
- `commands/gsd-t-wave.md` — full-cycle orchestration
- `commands/gsd-t-quick.md` — fast task execution
- `commands/gsd-t-debug.md` — debugging with contract awareness
- `commands/gsd-t-integrate.md` — domain wiring

Each file receives an integration block in its Step flow: "If `.gsd-t/domains/` contains multiple pending tasks that pass the D4/D5/D6 gates, dispatch via `gsd-t parallel --mode [auto-detected]` instead of sequential execution."

## Inputs

- D2 `gsd-t parallel` CLI (stable after D2-T5)
- Existing 5 command files in `commands/`

## Outputs

- Updated command files with parallel dispatch blocks
- Updated help text / command reference files

## Files Owned

- `commands/gsd-t-execute.md` — MODIFIED. Adds parallel dispatch block in Step 4 (worker spawn step).
- `commands/gsd-t-wave.md` — MODIFIED. Adds parallel dispatch block in the execution-phase step.
- `commands/gsd-t-quick.md` — MODIFIED. Adds parallel dispatch block (lightweight version: only triggers when > 1 pending task and all gates pass).
- `commands/gsd-t-debug.md` — MODIFIED. Adds parallel dispatch block for multi-domain debug scenarios.
- `commands/gsd-t-integrate.md` — MODIFIED. Adds parallel dispatch block when integrating multiple domains simultaneously.
- `commands/gsd-t-help.md` — MODIFIED. Documents `gsd-t parallel` in the command reference.

## Files Read-Only

- `bin/gsd-t-parallel.cjs` (D2 output) — called by the integration blocks
- All other command files not in the owned list above — no modifications
- `.gsd-t/contracts/headless-default-contract.md` — verified that always-headless invariant is preserved (parallel workers are headless by design)

## Out of Scope

- Implementing the parallel execution logic (D2)
- Implementing any gate logic (D4, D5, D6)
- Modifying `bin/gsd-t.js` (D2 owns the CLI routing additions)
- Creating new test files (command files are validated by use; no new test files needed for D3)
- Changing the commands' non-parallel code paths — only ADDITIVE integration blocks
