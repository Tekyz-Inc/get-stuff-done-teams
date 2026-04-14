# Constraints: token-budget-replacement

## Must Follow

- **Public API preservation**: `getSessionStatus()`, `estimateCost()`, `recordUsage()`, `getDegradationActions()`, `estimateMilestoneCost()`, `getModelCostRatios()` all keep the same signatures and return shapes defined in `.gsd-t/contracts/token-budget-contract.md`. Internal data source changes only.
- **Real-count primary, heuristic fallback**: `getSessionStatus()` reads the context-meter state file first. If the state file is missing or stale (> 5 minutes old), fall back to the existing heuristic (historical averages from `.gsd-t/token-log.md`) so projects without a meter hook still get approximate numbers. Never crash, never throw.
- **Threshold mapping stays**: the existing `normal / warn / downgrade / conserve / stop` thresholds are preserved. Only the *source* of the `pct` value changes.
- **Zero external dependencies** (same constraint as other domains).
- **Task-counter removal is atomic within this domain**: all references in command files + the .cjs file itself + its tests are removed in the same PR. No half-retirement state.
- **Orchestrator gate preserved**: `bin/orchestrator.js`'s task-count gate is the only thing between Claude and a runaway session; it must not be removed without a replacement. Replace `task-counter.cjs should-stop` with `token-budget.getSessionStatus()` returning `threshold === 'stop'`. Exit code semantics (10 = stop) preserved.
- **Contract updates first, code second**: update `token-budget-contract.md` and `context-observability-contract.md` BEFORE rewriting the implementation. This domain's execute agent must read its own updated contract before coding.

## Must Not

- Change the public API of `bin/token-budget.js` — any caller change means cross-domain impact.
- Leave dead code: every `require('./task-counter.cjs')` or `node bin/task-counter.cjs ...` call must be removed.
- Silently drop the stop-on-budget behavior. Users relied on this as a safety net; the replacement must preserve the behavior with a real signal.
- Edit `bin/gsd-t.js` — even though `PROJECT_BIN_TOOLS` needs updating, that's owned by `installer-integration`. Coordinate via the integration checkpoint.
- Modify user-facing docs — those belong to `m34-docs-and-tests`.
- Reference `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` anywhere (including comments that document the old behavior — use a brief "(historical: see contract v1)" note instead).

## Must Read Before Using

- **`bin/token-budget.js` current implementation** — every caller, every private helper, every test. This is a rewrite of internals; understanding the surface prevents accidental breakage.
- **`bin/task-counter.cjs`** — before deleting, catalogue every state file it creates and every command file that calls it. Grep the whole repo for `task-counter` and `.task-counter`.
- **`bin/orchestrator.js`** — the task-count gate lives here (per project CLAUDE.md). Understand how it's invoked from the execute and wave commands so the replacement preserves semantics.
- **Command files that reference task-counter**: `commands/gsd-t-execute.md` (Steps 0/3.5/5), `commands/gsd-t-wave.md` (phase gate), `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-debug.md`. Read each before editing so the rule engine / model tiering / QA spawns aren't accidentally affected.
- **`.gsd-t/contracts/context-meter-contract.md`** (produced by context-meter-config domain) — the state file format this domain will consume.

## Dependencies

- **Depends on**: `context-meter-hook` (produces the state file this domain reads), `context-meter-config` (writes the contract defining the state file format).
- **Depended on by**: `installer-integration` (PROJECT_BIN_TOOLS removes task-counter.cjs in coordination with this domain's deletion of the file), `m34-docs-and-tests` (documentation must reflect the retired task counter).

## Integration Checkpoints

- **CP1**: context-meter-config must finalize `context-meter-contract.md` state file schema BEFORE this domain rewrites `getSessionStatus()`.
- **CP2**: context-meter-hook must have a working end-to-end hook run (even against a mock count_tokens) BEFORE this domain's tests can validate the real-count path.
- **CP3**: This domain finishes deleting `bin/task-counter.cjs` and updating command files BEFORE `installer-integration` updates `PROJECT_BIN_TOOLS` (so the update-all propagation doesn't briefly push command files that call a deleted script).
