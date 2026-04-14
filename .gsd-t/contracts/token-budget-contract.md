# Token Budget Contract

## Version: 2.0.0 (M34 — real-source rewrite)
## Status: ACTIVE
## Owner: token-budget-replacement domain (M34) — succeeds token-orchestrator
## Consumers: command-integration domain (execute, wave, quick, integrate, debug)

## Overview
Defines the token budget tracking, estimation, and graduated degradation system for session-level token management on the $200 Max plan.

**M34 change**: `getSessionStatus()` now reads real context window usage from the Context Meter state file (`.gsd-t/.context-meter-state.json`) written by the PostToolUse hook. The `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` environment variables are no longer referenced — they never worked (Claude Code does not export them). See `context-meter-contract.md`.

---

## bin/token-budget.js API

```javascript
/**
 * Estimate token cost for a subagent spawn
 * @param {string} model - 'haiku', 'sonnet', 'opus'
 * @param {string} taskType - 'execute', 'qa', 'red-team', 'doc-ripple', etc.
 * @param {object} [options] - { complexity, historicalAvg }
 * @returns {number} - estimated tokens
 */
estimateCost(model, taskType, options)

/**
 * Get current session budget status
 * @returns {{ consumed: number, estimated_remaining: number, pct: number, threshold: string }}
 * threshold: 'normal' | 'warn' | 'downgrade' | 'conserve' | 'stop'
 */
getSessionStatus()

/**
 * Record actual token usage after a subagent completes
 * @param {object} usage - { model, taskType, tokens, duration_s }
 */
recordUsage(usage)

/**
 * Get degradation actions for current budget state
 * @returns {object} - { threshold, actions: string[], modelOverrides: object }
 */
getDegradationActions()

/**
 * Estimate total cost for remaining milestone work
 * @param {object[]} remainingTasks - [{ model, taskType, complexity }]
 * @returns {{ estimatedTokens: number, estimatedPct: number, feasible: boolean }}
 */
estimateMilestoneCost(remainingTasks)

/**
 * Get model cost multipliers
 * @returns {{ haiku: 1, sonnet: 5, opus: 25 }}
 */
getModelCostRatios()
```

---

## Graduated Degradation Thresholds

| Session Budget % | Threshold | Actions |
|-----------------|-----------|---------|
| < 60% | `normal` | All models at assigned tiers. No restrictions. |
| 60-70% | `warn` | Display budget alert. Reduce iteration budgets to minimum (2). |
| 70-85% | `downgrade` | Non-critical Sonnet → Haiku. Skip exploratory testing. Disable shadow-mode audit. |
| 85-95% | `conserve` | Pause doc-ripple, design brief generation. Checkpoint all progress. |
| > 95% | `stop` | Hard stop. Save all progress. Display resume instruction. |

### Model Override Rules at `downgrade` Threshold

| Original Model | Task Type | Override |
|---------------|-----------|----------|
| Sonnet | QA evaluation | Sonnet (keep — QA is critical) |
| Sonnet | Task execution | Haiku (downgrade — non-critical) |
| Sonnet | Doc-ripple | Skip entirely |
| Opus | Red Team | Sonnet (downgrade — still valuable at lower tier) |
| Haiku | Any | Haiku (no change — already lowest) |

---

## Session Budget Estimation

Token budget is computed from:
1. **Primary source (M34)**: `.gsd-t/.context-meter-state.json` — real `input_tokens` from the context meter's last count_tokens call. `pct = (inputTokens / modelWindowSize) * 100`.
2. **Fallback source**: Historical data from `.gsd-t/token-log.md` (average tokens per task type per model) — used when the state file is missing or stale (> 5 minutes old).
3. Model cost ratios: Opus ≈ 5x Sonnet ≈ 25x Haiku (for `estimateCost()` / `estimateMilestoneCost()` only — not for `getSessionStatus()`).

The env vars `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` are NOT used. Claude Code does not export them.

Staleness: if the state file's `timestamp` is more than 5 minutes old, `getSessionStatus()` falls back to the historical heuristic (graceful degradation for projects that haven't yet installed the meter hook).

---

## Pre-Flight Milestone Estimate

Before starting a wave or multi-domain execute:
1. Count remaining tasks from domain `tasks.md` files
2. Estimate per-task cost using `estimateCost()` with historical averages
3. Sum total estimated cost
4. Compare against remaining budget
5. If estimated > 80% of remaining: warn user with breakdown
6. If estimated > 120% of remaining: recommend splitting across sessions

---

## Integration Points

- `execute` Step 2 (before each subagent spawn): call `getSessionStatus()`, apply `getDegradationActions()`
- `wave` before each phase: call `getSessionStatus()`, checkpoint if `conserve`
- `wave` before starting: call `estimateMilestoneCost()` for pre-flight check
- `quick` before spawn: call `getSessionStatus()` for budget-aware model selection
- `bin/orchestrator.js` task-budget gate: uses `getSessionStatus()` to decide whether to stop (exit code 10 on `threshold === 'stop'`). Replaces the retired `task-counter.cjs should-stop` gate in M34.

## Task Counter Retirement (M34)

As of v2.75.10 (M34), `bin/task-counter.cjs` is REMOVED from the installer's `PROJECT_BIN_TOOLS`. All command files that previously invoked `node bin/task-counter.cjs ...` now defer to `bin/token-budget.js` session-status. Existing downstream projects run a one-time migration on `gsd-t update-all` that deletes `bin/task-counter.cjs`, `.gsd-t/task-counter-config.json`, and `.gsd-t/.task-counter-state.json` files.
