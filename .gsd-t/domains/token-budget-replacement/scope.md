# Domain: token-budget-replacement

## Responsibility

Rewrite `bin/token-budget.js` to read real context usage from the context meter's state file instead of the (non-functional) `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` environment variables. Remove all task-counter invocations from command files. Retire `bin/task-counter.cjs`. Update the token-budget contract to reflect the new data source.

## Owned Files/Directories

- `bin/token-budget.js` — rewrite the internals of `getSessionStatus()`, `recordUsage()`, `getDegradationActions()`, and `estimateMilestoneCost()` to read real token counts. Public API surface stays the same (existing callers in execute/quick/wave/integrate continue to work without changes).
- `bin/token-budget.test.js` — rewrite tests against the new data source, remove env-var mocks, add state-file mocks
- `bin/task-counter.cjs` — **DELETE** (retirement)
- `bin/task-counter.test.cjs` — **DELETE** (retirement)
- `.gsd-t/contracts/token-budget-contract.md` — update to replace env-var references with hook-state references; mark section 3 "Session Budget Estimation" item 1 as replaced
- `.gsd-t/contracts/context-observability-contract.md` — update to replace `CLAUDE_CONTEXT_TOKENS_USED/MAX` with real count_tokens source; update rule 2 and rule 3 accordingly
- `commands/gsd-t-execute.md` — remove task-counter calls in Steps 0, 3.5, 5 (and replace with context-meter state check if the gate needs preserving — which it does: the orchestrator still needs a stop signal, but the signal comes from token-budget.getSessionStatus() instead of task-counter)
- `commands/gsd-t-wave.md` — remove task-counter phase gate, replace with context-meter-aware gate
- `commands/gsd-t-quick.md` — remove task-counter calls
- `commands/gsd-t-integrate.md` — remove task-counter calls
- `commands/gsd-t-debug.md` — remove task-counter calls
- `commands/gsd-t-resume.md` — remove task-counter references if any
- `bin/orchestrator.js` — if it references task-counter directly, rewrite to use token-budget.getSessionStatus() exclusively

## NOT Owned (do not modify)

- `scripts/gsd-t-context-meter.js` — owned by context-meter-hook
- `.gsd-t/context-meter-config.json` / `bin/context-meter-config.cjs` — owned by context-meter-config
- `bin/gsd-t.js` — owned by installer-integration (it will separately remove task-counter from PROJECT_BIN_TOOLS)
- `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md`, `docs/methodology.md` — owned by m34-docs-and-tests
