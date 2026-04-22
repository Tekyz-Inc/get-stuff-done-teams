# Tasks: m44-d3-command-file-integration

## Wave 3 — Integration (D3 runs after D2 lands)

### M44-D3-T1 — Integration block design + execute.md integration
- **Status**: [ ] pending
- **Dependencies**: M44-D2-T5 (D2 fully complete)
- **Acceptance criteria**:
  - Standard integration block prose drafted (reusable template for all 5 files): conditional check, mode auto-detection, fallback behavior, observability note, zero-compaction invariant note for unattended
  - `commands/gsd-t-execute.md` Step 4 (worker spawn step) updated with the integration block
  - Block is additive only — existing sequential path is preserved
- **Files touched**: `commands/gsd-t-execute.md`

### M44-D3-T2 — wave.md + integrate.md integration
- **Status**: [ ] pending
- **Dependencies**: M44-D3-T1
- **Acceptance criteria**:
  - `commands/gsd-t-wave.md` execution-phase step updated with integration block (matches the execute.md pattern, adjusted for wave context)
  - `commands/gsd-t-integrate.md` updated with integration block (triggers when integrating > 1 domain simultaneously)
  - Both files preserve their existing sequential code paths
- **Files touched**: `commands/gsd-t-wave.md`, `commands/gsd-t-integrate.md`

### M44-D3-T3 — quick.md + debug.md integration
- **Status**: [ ] pending
- **Dependencies**: M44-D3-T2
- **Acceptance criteria**:
  - `commands/gsd-t-quick.md` updated with lightweight integration block (only triggers for > 1 pending task AND all gates pass)
  - `commands/gsd-t-debug.md` updated with integration block (triggers only for multi-domain debug scenarios; single-domain debug is unaffected)
  - Both blocks are clearly labeled as "lightweight" / "conditional-only" with explicit fallback to sequential for single-task invocations
- **Files touched**: `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md`

### M44-D3-T4 — Doc-ripple: help + README + GSD-T-README
- **Status**: [ ] pending
- **Dependencies**: M44-D3-T3
- **Acceptance criteria**:
  - `commands/gsd-t-help.md` updated with `gsd-t parallel` entry in the commands reference table
  - `GSD-T-README.md` commands table updated to reflect parallel dispatch behavior in execute/wave/quick/debug/integrate
  - `README.md` workflow section updated to mention task-level parallelism
  - `docs/requirements.md` §"M44 Command-File Integration" requirement marked complete
- **Files touched**: `commands/gsd-t-help.md`, `GSD-T-README.md`, `README.md`, `docs/requirements.md`

### M44-D3-T5 — In-session + unattended smoke test validation + doc-ripple commit
- **Status**: [ ] pending
- **Dependencies**: M44-D3-T4
- **Acceptance criteria**:
  - In-session smoke test passes: `gsd-t-execute` against a small multi-domain fixture using the parallel path completes in ≤ T/2 of the sequential baseline with zero pause/resume prompts
  - Unattended smoke test passes: `gsd-t unattended --max-iterations 5` over a multi-task milestone produces zero new entries in `.gsd-t/metrics/compactions.jsonl` during the run window
  - `docs/architecture.md` updated to document the parallel dispatch decision flow (command file → D2 → gates → orchestrator)
  - `.gsd-t/progress.md` decision log entry added for Wave 3 completion
- **Files touched**: `docs/architecture.md`, `.gsd-t/progress.md`
