# Contract: Token Budget

## Version: 2.0.0
## Status: ACTIVE
## Owner: token-budget-replacement
## Consumers: orchestrator, gsd-t-execute, gsd-t-wave, gsd-t-quick, gsd-t-integrate, gsd-t-debug, gsd-t-complete-milestone, m34-docs-and-tests, installer-integration (via doStatus/doDoctor)

---

## Purpose

`bin/token-budget.js` is the **session-level token budgeter** for GSD-T. It estimates per-task cost, tracks actual consumption, classifies session state into graduated-degradation thresholds (`normal → warn → downgrade → conserve → stop`), and exposes a single signal every pre-spawn gate consumes to decide whether to continue, downgrade models, checkpoint, or stop.

As of v2.0.0 (M34), `getSessionStatus()` reads the **Context Meter state file** (`.gsd-t/.context-meter-state.json`) produced by the PostToolUse hook defined in `context-meter-contract.md`. The state file contains real `input_tokens` values from Anthropic's `count_tokens` endpoint — this is the authoritative source. When the state file is missing or its `timestamp` is older than 5 minutes, `getSessionStatus()` falls back to a historical heuristic computed from `.gsd-t/token-log.md`, exactly as it did in v1.x.

This replaces two retired mechanisms from v1.x: the inert `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` env-var check (v1.0.x) and the `bin/task-counter.cjs` proxy gate that briefly stood in for it (v2.74.x). See **Removed / Retired** and **Task Counter Retirement** below.

The public API surface is unchanged. Callers see no behavioral break.

---

## Public API Surface

Every function below is exported from `bin/token-budget.js` via `module.exports` and forms the stable caller contract. v2.0.0 preserves every signature and return shape from v1.x. Only the **internal data source** of `getSessionStatus()` changed.

### `estimateCost(model, taskType, options?)`

**Signature**: `(model: 'haiku' | 'sonnet' | 'opus', taskType: string, options?: { complexity?: number, historicalAvg?: number, projectDir?: string }) => number`

**Behavior**: Returns an estimated token cost for spawning a subagent of the given `model` on the given `taskType`. Resolution order:
1. If `options.historicalAvg` is provided → `round(historicalAvg * modelRatio)`
2. Else consult `.gsd-t/token-log.md` for a per-(model, taskType) historical average
3. Else fall back to `BASE_ESTIMATES[taskType] * modelRatio * (complexity || 1.0)`

`modelRatio` comes from `getModelCostRatios()` — `{ haiku: 1, sonnet: 5, opus: 25 }`.

**v2.0.0 changes**: None. Identical to v1.x.

---

### `getSessionStatus(projectDir?)`

**Signature**: `(projectDir?: string) => { consumed: number, estimated_remaining: number, pct: number, threshold: 'normal' | 'warn' | 'downgrade' | 'conserve' | 'stop' }`

**Behavior (v2.0.0)**:
1. Read `{projectDir || cwd}/.gsd-t/.context-meter-state.json`.
2. **If present AND `timestamp` within the last 5 minutes**: use real values.
   - `consumed = state.inputTokens`
   - `estimated_remaining = state.modelWindowSize - state.inputTokens`
   - `pct = state.pct` (already computed by the hook as `(inputTokens / modelWindowSize) * 100`)
   - `threshold = resolveThreshold(pct)` (see Threshold Bands below)
3. **Else (missing or stale)**: fall back to the historical heuristic from `.gsd-t/token-log.md` (same code path that served v1.x), preserving graceful degradation for projects that have not yet installed the context-meter hook.

**v1.x → v2.0.0 migration notes**: The return shape is byte-compatible with v1.x. The sole change is the internal data source. Callers compile unchanged. Tests that previously mocked `process.env.CLAUDE_CONTEXT_TOKENS_USED` must be rewritten to stage a fake `.gsd-t/.context-meter-state.json` fixture (handled by token-budget-replacement Task 4).

---

### `recordUsage(usage)`

**Signature**: `(usage: { model: string, taskType: string, tokens: number, duration_s: number, projectDir?: string }) => void`

**Behavior**: Appends a row to `.gsd-t/token-log.md` recording actual tokens consumed by a just-completed subagent. Creates the file with header if missing.

**v2.0.0 changes**: None. Identical to v1.x.

---

### `getDegradationActions(projectDir?)`

**Signature**: `(projectDir?: string) => { threshold: string, actions: string[], modelOverrides: Record<string, string> }`

**Behavior**: Calls `getSessionStatus()`, maps the resulting `threshold` to a degradation response — the list of actions callers should take and the model-override map (e.g., `sonnet:execute → haiku`). See **Degradation Actions** below for the full mapping.

**v2.0.0 changes**: None. Reads through the new `getSessionStatus()` data source transitively.

---

### `estimateMilestoneCost(remainingTasks, projectDir?)`

**Signature**: `(remainingTasks: Array<{ model: string, taskType: string, complexity?: number }>, projectDir?: string) => { estimatedTokens: number, estimatedPct: number, feasible: boolean }`

**Behavior**: Sums `estimateCost()` across all remaining tasks, compares the result against current session headroom (`getSessionStatus().estimated_remaining`), and returns a feasibility verdict used by `wave` and `execute` for pre-flight budget checks.

**v2.0.0 changes**: None. Purely a per-task estimate path — does not touch the state file directly.

---

### `getModelCostRatios()`

**Signature**: `() => { haiku: 1, sonnet: 5, opus: 25 }`

**Behavior**: Returns a shallow copy of the model cost multipliers (Haiku baseline = 1).

**v2.0.0 changes**: None.

---

## Session Budget Estimation

The v2.0.0 data flow is:

```
getSessionStatus(projectDir)
  │
  ├─ Read .gsd-t/.context-meter-state.json
  │     │
  │     ├─ File present AND (now - state.timestamp) < 5 min
  │     │      → Use real { inputTokens, modelWindowSize, pct }
  │     │      → threshold = resolveThreshold(pct)
  │     │      → return { consumed, estimated_remaining, pct, threshold }
  │     │
  │     └─ File missing OR stale (> 5 min) OR parse error
  │            → fallback path
  │
  └─ Fallback: historical heuristic
        ├─ Sum tokens from .gsd-t/token-log.md rows dated today
        ├─ pct  = (sumTokens / assumedBudget) × 100
        ├─ threshold = resolveThreshold(pct)
        └─ return { consumed, estimated_remaining, pct, threshold }
```

**Staleness window**: 5 minutes. Rationale: the context-meter hook runs every Nth PostToolUse invocation (default N=5). Under active tool use, a fresh reading lands well inside that window. Idle sessions fall back to heuristic, which is correct — a stale meter reading is worse than a coarse current estimate.

**Authoritative source**: `.gsd-t/.context-meter-state.json`. The historical heuristic is a graceful-degradation fallback, not a parallel signal. Never blend the two.

**No environment variable reads.** v2.0.0 does not touch `process.env.CLAUDE_CONTEXT_TOKENS_*` under any code path. Those variables were never exported by Claude Code; see **Removed / Retired**.

---

## Threshold Bands

| `pct` range | `threshold` | Band semantics |
|---|---|---|
| `pct < 60`  | `normal`    | Full speed. No restrictions. |
| `60 ≤ pct < 70` | `warn`      | Budget alert. Tighten iteration budgets. |
| `70 ≤ pct < 85` | `downgrade` | Apply model overrides for non-critical spawns. |
| `85 ≤ pct < 95` | `conserve`  | Checkpoint. Skip non-essential phases. |
| `pct ≥ 95`  | `stop`      | Hard stop. Save state, exit gate with code 10. |

**Boundary convention**: **lower-bound inclusive, upper-bound exclusive**, matching `resolveThreshold()` in `bin/token-budget.js` (strict `>=` comparisons):

```javascript
if (pct >= 95) return "stop";
if (pct >= 85) return "conserve";
if (pct >= 70) return "downgrade";
if (pct >= 60) return "warn";
return "normal";
```

**Single source of truth**: The band boundaries live in `bin/token-budget.js` only. There is no separate `threshold.js` module. `context-meter-contract.md` v1.0.0 mirrors these bands for its own `state.threshold` field — both contracts reference this table, but the canonical implementation lives in the token budgeter.

---

## Degradation Actions

| Threshold   | Actions                                                                                          | Model Overrides                                                                                       |
|-------------|--------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| `normal`    | (none)                                                                                           | (none)                                                                                                |
| `warn`      | Display budget alert; reduce iteration budgets to minimum (2)                                    | (none)                                                                                                |
| `downgrade` | Downgrade non-critical Sonnet → Haiku; skip exploratory testing; disable shadow-mode audit       | `sonnet:qa → sonnet` (kept — QA is critical); `sonnet:execute → haiku`; `sonnet:doc-ripple → skip`; `opus:red-team → sonnet`; `haiku:* → haiku` |
| `conserve`  | Pause doc-ripple; pause design brief generation; checkpoint all progress                        | Same override map as `downgrade`                                                                      |
| `stop`      | Hard stop; save all progress; display resume instruction                                        | (none — execution halts)                                                                              |

At `stop`, the orchestrator gate exits with code 10 and instructs the user to run `/clear` followed by `/user:gsd-t-resume`. This matches the pre-M34 UX, so downstream projects see no change in stop semantics.

---

## Integration Points

| Consumer                                    | Call                                             | Purpose                                                                                      |
|---------------------------------------------|--------------------------------------------------|----------------------------------------------------------------------------------------------|
| `bin/orchestrator.js` (task-budget gate)    | `getSessionStatus()`                             | Check `threshold === 'stop'` before each phase/task spawn; exit 10 + checkpoint on stop (Task 5 — replaces `task-counter.cjs should-stop`) |
| `commands/gsd-t-execute.md` (Step 2)        | `getSessionStatus()` + `getDegradationActions()` | Pre-spawn gate per subagent; apply model overrides (Task 6)                                  |
| `commands/gsd-t-wave.md` (Step 0)           | `getSessionStatus()` + `estimateMilestoneCost()` | Pre-flight feasibility check; per-phase checkpoint on `conserve` (Task 7)                    |
| `commands/gsd-t-quick.md` (pre-spawn)       | `getSessionStatus()`                             | Budget-aware model selection for quick tasks (Task 8)                                        |
| `commands/gsd-t-integrate.md` (pre-spawn)   | `getSessionStatus()`                             | Same pattern — check before integration spawns (Task 8)                                      |
| `commands/gsd-t-debug.md` (pre-spawn)       | `getSessionStatus()`                             | Same pattern — check before debug-loop spawns (Task 8)                                       |
| `commands/gsd-t-complete-milestone.md`      | `recordUsage()`                                  | Final usage accounting at milestone close                                                    |
| `bin/gsd-t.js doStatus`                     | `getSessionStatus()`                             | Display current `pct` in `gsd-t status` output (already wired — commit `dc34881`)            |
| `bin/gsd-t.js doDoctor`                     | `getSessionStatus()` + config validation        | Validate hook is installed and API key is present (already wired — commit `becf318`)         |

Pre-spawn gates in command files invoke the module via a small inline node bootstrapper, e.g.:

```bash
node -e "const {getSessionStatus} = require('./bin/token-budget.js'); const s = getSessionStatus(); if (s.threshold === 'stop') process.exit(10);"
```

---

## Task Counter Retirement

v2.0.0 completes the retirement of `bin/task-counter.cjs` — the task-counter proxy gate that v2.74.x introduced as a stopgap after the original env-var gate was found to be inert.

**Retirement timeline**:
- **v1.0.x**: Original gate read `process.env.CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX`. Claude Code **never exports** these variables, so `consumed` was always `0` and `threshold` was always `'normal'`. The graduated-degradation machinery was silently inert. The regression was documented in commit notes and `.gsd-t/progress.md` but not discovered until v2.74.x.
- **v2.74.12**: `bin/task-counter.cjs` introduced as a deterministic proxy — it counted tasks rather than tokens, with a hard task limit (default 5). Command files and `bin/orchestrator.js` replaced the env-var checks with `node bin/task-counter.cjs should-stop` calls. This was always intended as a stopgap, not a real measurement.
- **v2.75.10 (M34, this milestone)**: The Context Meter PostToolUse hook (see `context-meter-contract.md`) takes real `count_tokens` readings from the Anthropic API and writes them to `.gsd-t/.context-meter-state.json`. `bin/token-budget.js` v2.0.0 reads that file directly. The task-counter proxy is removed entirely.

**Migration path**:
1. **token-budget-replacement Task 3**: Rewrite `getSessionStatus()` internals to read the state file.
2. **token-budget-replacement Task 4**: Rewrite `bin/token-budget.test.js` to use state-file fixtures.
3. **token-budget-replacement Task 5**: Remove every `task-counter.cjs` reference from `bin/orchestrator.js`; replace the gate with `getSessionStatus()`.
4. **token-budget-replacement Tasks 6–8**: Remove every `task-counter.cjs` reference from `commands/gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`. Rename the `Tasks-Since-Reset` column in each observability-logging block to `Ctx%` (matches `context-observability-contract.md` v2.0.0).
5. **token-budget-replacement Task 9**: Delete `bin/task-counter.cjs` and any `bin/task-counter.test.cjs` artifacts. Repo-wide grep for `task-counter` must return zero hits in `commands/`, `bin/`, `scripts/`, `templates/`.
6. **installer-integration Task 5** (future — gated by CP3 on this domain's Task 9): Remove `"task-counter.cjs"` from `PROJECT_BIN_TOOLS` in `bin/gsd-t.js`. The `update-all` path additionally deletes `bin/task-counter.cjs`, `.gsd-t/task-counter-config.json`, and `.gsd-t/.task-counter*` from every registered downstream project, writing a `.gsd-t/.task-counter-retired-v1` marker so migration is idempotent.

**Historical documentation references** to `CLAUDE_CONTEXT_TOKENS_*` and `task-counter.cjs` in `.gsd-t/progress.md`, `CHANGELOG.md`, archived milestones, and this contract's **Removed / Retired** section are preserved by design — they describe what the framework used to do, not what it currently does.

---

## Removed / Retired (v1.x → v2.0.0 migration notes)

The following mechanisms are retired in v2.0.0. **Do not reintroduce.** Each entry explains why it existed and why it was removed.

| Retired artifact | Rationale for removal |
|---|---|
| `process.env.CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` | Claude Code **never exports** these variables. Any gate that read them was silently inert — `consumed` was always 0 and `threshold` was always `normal`. `bin/token-budget.js` v2.0.0 does not reference them under any code path. |
| `Tasks-Since-Reset` column in `.gsd-t/token-log.md` | Obsoleted by the `Ctx%` column. See `context-observability-contract.md` v2.0.0. The meaningful signal is context-window percentage, not a task counter. |
| `bin/task-counter.cjs` proxy gate | Replaced by `bin/token-budget.js` `getSessionStatus()` backed by real `count_tokens` readings. Deleted by token-budget-replacement Task 9. |
| `bin/orchestrator.js` task-increment calls | Removed entirely. Context-meter state is the authoritative "progress in session" signal; counting tasks is no longer necessary for degradation decisions. |
| Env-var-based tests in `bin/token-budget.test.js` | Rewritten to use state-file fixtures by token-budget-replacement Task 4. |

---

## Backward Compatibility

**Caller-side**: Every exported function preserves its v1.x signature and return shape. Code that calls `getSessionStatus()`, `estimateCost()`, `recordUsage()`, `getDegradationActions()`, `estimateMilestoneCost()`, or `getModelCostRatios()` compiles and runs unchanged against v2.0.0. No import path change. No new required options.

**Test-side**: Existing tests that exercise the public API through the return shape continue to pass unchanged. Tests that mocked `process.env.CLAUDE_CONTEXT_TOKENS_USED` must be rewritten to stage a tempdir fixture containing `.gsd-t/.context-meter-state.json` — this migration is token-budget-replacement Task 4.

**Downstream-project-side**: Projects that have not yet installed the context-meter hook continue to function. `getSessionStatus()` falls back to the historical heuristic when the state file is missing, so degradation still engages (less precisely, but correctly).

---

## Breaking Changes

**None for callers.** The API surface is byte-compatible with v1.x.

**Internal breakages** (visible only to code inside `bin/token-budget.js` and its test file):
- `getSessionStatus()` internal data source changed from `process.env.CLAUDE_CONTEXT_TOKENS_*` (v1.0.x) → `.gsd-t/.task-counter` (v2.74.x stopgap) → `.gsd-t/.context-meter-state.json` (v2.0.0).
- Tests that mocked environment variables must be rewritten to use state-file fixtures.
- `bin/orchestrator.js` task-counter integration is removed; the gate now calls `getSessionStatus()` directly.

---

## Change Log

| Version | Date       | Change |
|---------|------------|--------|
| 1.0.0   | M31        | Initial contract. `getSessionStatus()` read `process.env.CLAUDE_CONTEXT_TOKENS_*`. Shipped with `bin/token-budget.js` as part of the token-orchestrator domain. |
| 1.x     | v2.74.12   | `bin/task-counter.cjs` stopgap introduced externally after the env-var gate was discovered to be inert. `token-budget.js` was retrofitted to read `.gsd-t/.task-counter` but the contract was not re-versioned. |
| 2.0.0   | M34 / 2026-04-14 | Real-source rewrite. `getSessionStatus()` reads `.gsd-t/.context-meter-state.json` (5-minute staleness window) with historical heuristic fallback. Task counter retired. Env-var references removed throughout. Public API surface unchanged. Backward compatible for all callers. |
