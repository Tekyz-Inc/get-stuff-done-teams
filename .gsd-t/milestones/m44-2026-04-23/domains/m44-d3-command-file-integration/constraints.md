# Constraints: m44-d3-command-file-integration

## Hard Rules

1. D3 is PURELY ADDITIVE. Existing sequential code paths must remain intact. The integration block is a conditional: "IF parallel mode is available AND gates pass, dispatch via `gsd-t parallel`; ELSE proceed as before." No existing behavior is removed.
2. D3 must not start until D2-T5 is complete. The CLI surface must be stable before any command file references it.
3. The mode argument passed to `gsd-t parallel` MUST be auto-detected (via `GSD_T_UNATTENDED` env var), not hardcoded. Command files should not hardcode `--mode in-session` or `--mode unattended`.
4. The OBSERVABILITY LOGGING block format (from global CLAUDE.md) must be present in every integration block that spawns subagents. D3 does not add new spawns — the parallel path uses D2's spawn machinery — but the integration block must document that D2 owns the spawn observability.
5. Command file changes follow the project CLAUDE.md Pre-Commit Gate: every command file change that touches the integration interface requires a `GSD-T-README.md` + `README.md` + `commands/gsd-t-help.md` update.

## Mode Awareness

**[in-session]**:
- The integration block must note that in-session mode uses orchestrator-CW headroom check (D2 handles this transparently). Command files should not re-implement the check.
- Must explicitly state: "NEVER interrupts the user with a pause/resume prompt — if gates fail, falls back to sequential silently."

**[unattended]**:
- The integration block must note that unattended mode uses per-worker CW headroom (D2 + D6 handle this). The command file only needs to set `GSD_T_UNATTENDED=1` if the calling supervisor already set it.
- Must explicitly state the zero-compaction invariant context: "For [unattended], D2 enforces the zero-compaction contract by splitting tasks when D6 estimates > 60% CW utilization."

## Tradeoffs Acknowledged

- Adding a conditional check in 5 command files creates a maintenance surface. If D2's CLI surface changes, all 5 files need updating. Acceptable: the integration block is a single call site per file, and D2's contract (wave-join-contract v1.1.0) locks the interface.
- `gsd-t-quick.md` gets the lightest integration (only triggers when > 1 pending task). Quick tasks are designed for single-focus work; forcing parallel on every quick invocation would add gate overhead without benefit.

## Out-of-scope clarifications

- D3 does not add tests. Command files are "validated by use" per project CLAUDE.md conventions.
- D3 does not change the subagent prompt bodies. It only adds the dispatch decision block to the Step flow.
