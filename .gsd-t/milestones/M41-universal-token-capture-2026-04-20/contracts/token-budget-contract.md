# Contract: Token Budget

## Version: 3.1.0
## Status: ACTIVE
## Previous: 3.0.0 (added `stale` band, non-breaking for in-repo consumers which are updated in the same patch)
## Owner: m35-degradation-rip-out, updated by v3.10.12 context-meter-regression-fix
## Consumers: `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-debug.md`, `commands/gsd-t-doc-ripple.md`, `commands/gsd-t-resume.md` (Step 0.6), `bin/gsd-t.js` (doStatus, doDoctor), `bin/orchestrator.js`, `bin/runway-estimator.js` (M35 Wave 3)

## Changelog
- **v3.1.0** (2026-04-15) — Added fourth `stale` band. When `.gsd-t/.context-meter-state.json` exists but is dead (`lastError` set, `timestamp` null, or older than 5 min), `getSessionStatus()` now returns `{threshold: "stale", deadReason}` instead of silently falling through to the heuristic. All gated command files treat `stale` as exit-10 STOP but without the runway-estimator handoff — the guardrail is broken, a fresh session would be equally blind. See `context-meter-contract.md` §"Stale Band and Resume Gating" for the full rationale and the M36 regression that motivated this.
- **v3.0.0** (2026-03) — Three-band clean break from v2.0.0 `downgrade`/`conserve`.

---

## Purpose

`bin/token-budget.js` is the **session-level token budgeter** for GSD-T. It exposes a three-band status signal (`normal` / `warn` / `stop`) derived from the real context-window measurement written to `.gsd-t/.context-meter-state.json` by the M34 Context Meter PostToolUse hook. Pre-spawn gates in every long-running command consume this signal to decide whether to proceed, log a warning, or halt cleanly and hand off to the runway estimator / headless auto-spawn pipeline.

**v3.0.0 is a CLEAN BREAK from v2.0.0** — no deprecation shim, no translation layer, no compatibility fields. The `downgrade` and `conserve` bands are gone. Silent model degradation and silent phase-skipping under context pressure are anti-features; they violate GSD-T's core principle that **quality is non-negotiable**. Instead of degrading quality, M35 halts cleanly and resumes in a fresh context.

---

## Core Principle

> Under context pressure, we pause and resume. We never downgrade models, never skip Red Team, never skip doc-ripple, never skip Design Verify.

The three-band model embodies this:

- **`normal`** — context below `WARN_THRESHOLD_PCT` — full speed, no restrictions, no logging noise.
- **`warn`** — context at or above `WARN_THRESHOLD_PCT` and below `STOP_THRESHOLD_PCT` — **informational only**. Log the band to `.gsd-t/token-log.md`, proceed at full quality. This band exists so the system has visibility into how close it is to the stop threshold without altering behavior.
- **`stop`** — context at or above `STOP_THRESHOLD_PCT` — halt cleanly. The caller checkpoints progress and hands off to the runway estimator (which auto-spawns headless via `bin/headless-auto-spawn.js` when M35 Wave 3+ lands). The user is never asked to run `/clear` or `/compact`.

---

## Thresholds (frozen API constants)

```javascript
const WARN_THRESHOLD_PCT = 70;
const STOP_THRESHOLD_PCT = 85;
```

| `pct` range | `threshold` | Band semantics |
|---|---|---|
| `pct < 70`  | `normal` | Full speed. No restrictions. |
| `70 ≤ pct < 85` | `warn` | Log to `token-log.md`. Proceed at full quality. Informational. |
| `pct ≥ 85` | `stop` | Halt cleanly. Checkpoint. Hand off to runway estimator / headless auto-spawn. Never ask the user to `/clear`. |
| **n/a (meter dead)** | **`stale`** (v3.1.0) | **Context meter state file exists but is broken — `lastError` set, or `timestamp` null, or age > 5 min. `deadReason` field identifies the cause. Gated commands exit 10 but DO NOT auto-spawn a fresh session (a fresh session would have the same broken guardrail). User must fix the underlying cause (usually missing `ANTHROPIC_API_KEY`) before resuming.** |

**Boundary convention**: lower-bound inclusive, upper-bound exclusive, matching `resolveThreshold()` in `bin/token-budget.js`:

```javascript
function resolveThreshold(pct) {
  if (!Number.isFinite(pct)) return "normal"; // fail-safe
  if (pct >= STOP_THRESHOLD_PCT) return "stop";
  if (pct >= WARN_THRESHOLD_PCT) return "warn";
  return "normal";
}
```

**Rationale for tightening** (from v2.0.0's `60/70/85/95` ladder): the runtime's own compact trigger sits at approximately 95%. The v2.0.0 `stop` band at 95% left zero headroom — any minor overrun by a subagent could trip native compact before GSD-T's halt logic ran. v3.0.0 moves `stop` to 85% so there is ~10% of runway between our halt and the runtime's. `warn` moves to 70% so the informational signal fires at a level that actually correlates with "approaching the halt boundary."

**Single source of truth**: `scripts/context-meter/threshold.js` `BANDS` constant mirrors these two thresholds for the PostToolUse hook's state-file writer. The test `BANDS constant mirrors bin/token-budget.js v3.0.0 three-band model` guards against drift.

---

## Non-Goals (the v3.0.0 guarantees)

This contract **never** returns:

- **Model overrides** (`sonnet:execute → haiku`, etc). Model selection is the job of `bin/model-selector.js` and the `## Model Assignment` block in command files — *not* token-budget. Runtime model downgrade under context pressure is explicitly prohibited.
- **Phase-skip lists** (`skipPhases: ['doc-ripple', 'red-team']`). Skipping quality gates is never acceptable. If the system cannot run a phase, it halts; it does not silently skip.
- **Checkpoint side-channels** (the old `checkpoint: true` action). Checkpointing is the caller's responsibility when it receives a `stop` band. This contract only reports the band.
- **Silent `conserve` or `downgrade` bands**. These are removed. Any code path that still produces them is a defect.

This list is part of the contract. A future version that reintroduces any of these would be a v4.0.0 breaking change and require an explicit architectural reversal.

---

## Public API Surface

Every function below is exported from `bin/token-budget.js` via `module.exports`.

### `estimateCost(model, taskType, options?)`

**Signature**: `(model: 'haiku' | 'sonnet' | 'opus', taskType: string, options?: { complexity?: number, historicalAvg?: number, projectDir?: string }) => number`

**Behavior**: Returns an estimated token cost for spawning a subagent of the given `model` on the given `taskType`. Resolution order:
1. If `options.historicalAvg` is provided → `round(historicalAvg * modelRatio)`
2. Else consult `.gsd-t/token-log.md` for a per-(model, taskType) historical average
3. Else fall back to `BASE_ESTIMATES[taskType] * modelRatio * (complexity || 1.0)`

**v2.0.0 → v3.0.0 changes**: None. Identical behavior.

---

### `getSessionStatus(projectDir?)`

**Signature**:
```
(projectDir?: string) => {
  consumed: number,
  estimated_remaining: number,
  pct: number,
  threshold: 'normal' | 'warn' | 'stop',
}
```

**Narrowed `threshold` union** is the v3.0.0 breaking change. v2.0.0 callers that type-checked against `'normal'|'warn'|'downgrade'|'conserve'|'stop'` must collapse their handling to three bands: `downgrade → warn`, `conserve → stop`.

**Behavior (unchanged from v2.0.0)**:
1. Read `{projectDir || cwd}/.gsd-t/.context-meter-state.json`.
2. **If present AND `timestamp` within the last 5 minutes**: use real values.
   - `consumed = state.inputTokens`
   - `estimated_remaining = state.modelWindowSize - state.inputTokens`
   - `pct = state.pct`
   - `threshold = resolveThreshold(pct)` (three-band model)
3. **Else (missing or stale)**: fall back to historical heuristic from `.gsd-t/token-log.md`.

**Staleness window**: 5 minutes. The context-meter hook runs every Nth PostToolUse invocation, so a fresh reading reliably lands within this window under active use. Idle sessions fall back gracefully.

---

### `recordUsage(usage)`

**Signature**: `(usage: { model: string, taskType: string, tokens: number, duration_s: number, projectDir?: string }) => void`

**Behavior**: Appends a row to `.gsd-t/token-log.md` recording actual tokens consumed by a just-completed subagent. Creates the file with header if missing.

**v3.0.0 changes**: None.

---

### `getDegradationActions(projectDir?)` — ⚠ CLEAN-BREAK rename semantics

**Signature** (v3.0.0):
```
(projectDir?: string) => {
  band: 'normal' | 'warn' | 'stop',
  pct: number,
  message: string,
}
```

**v2.0.0 shape** (for migration reference — no longer returned): `{threshold: string, actions: string[], modelOverrides: Record<string,string>}`. All three fields are gone. Callers that read `.threshold`, `.actions[]`, or `.modelOverrides` MUST be updated — they will see `undefined`.

**Behavior**: Delegates to `getSessionStatus()` and returns the `band` (renamed from `threshold` for clarity that this is a discrete band, not a numeric threshold), the measured `pct`, and a human-readable `message` suitable for direct logging to `.gsd-t/token-log.md` or stdout. The function name is preserved for ease of grep-based migration, but the name is misleading in v3.0.0 — there are no "degradation actions" because v3.0.0 does not degrade. A future cleanup may rename it to `getBandStatus()`; the v3.0.0 name is a migration convenience.

**Invariants guaranteed by the test suite**:
- `band` is always one of `'normal' | 'warn' | 'stop'` — never `'downgrade'`, never `'conserve'`, never anything else.
- `modelOverrides`, `actions`, `skipPhases`, `threshold`, `checkpoint` fields are never present in the return value.
- `message` is a non-empty string describing the current band and pct.

---

### `estimateMilestoneCost(remainingTasks, projectDir?)`

**Signature**: `(remainingTasks: Array<{ model: string, taskType: string, complexity?: number }>, projectDir?: string) => { estimatedTokens: number, estimatedPct: number, feasible: boolean }`

**v3.0.0 changes**: None. Historical note: M35 introduced `bin/runway-estimator.js` `estimateRunway()` as the intended successor; M38 deleted the runway estimator along with the three-band model (headless-by-default obviates pre-flight projection), and this function is no longer an active callsite.

**Note**: Do NOT delete this function in the T1 rewrite. It is still live through Wave 2.

---

### `getModelCostRatios()`

**Signature**: `() => { haiku: 1, sonnet: 5, opus: 25 }`

**v3.0.0 changes**: None.

---

## Migration Notes — v2.0.0 → v3.0.0

Callers updating from v2.0.0 (Wave 2 sweeps all of these — this section exists for any out-of-tree consumer):

### 1. Collapse threshold handling from five bands to three

| v2.0.0 threshold | v3.0.0 band | What to do |
|---|---|---|
| `normal` | `normal` | unchanged — proceed |
| `warn` | `normal` (if pct < 70) or `warn` (if 70 ≤ pct < 85) | at new `warn` band, log and proceed |
| `downgrade` | `warn` | **stop applying model overrides** — proceed at full quality |
| `conserve` | `stop` | **stop skipping phases** — halt cleanly instead |
| `stop` | `stop` | unchanged — halt cleanly |

### 2. Drop `.modelOverrides` and `.actions` reads from `getDegradationActions()` results

```javascript
// v2.0.0 — DELETE THIS CODE
const actions = getDegradationActions();
if (actions.modelOverrides["sonnet:execute"]) {
  model = actions.modelOverrides["sonnet:execute"];
}
for (const a of actions.actions) { console.log(a); }

// v3.0.0 — REPLACE WITH
const { band, pct, message } = getDegradationActions();
if (band === "stop") {
  console.error(message);
  process.exit(10); // halt cleanly
}
if (band === "warn") {
  appendToTokenLog(message); // informational
}
// band === "normal" → just proceed
```

### 3. Exit-code handling in bash pre-spawn gates

v2.0.0 used exit codes `11` (conserve) and `12` (downgrade) from inline node bootstrappers. v3.0.0 only uses `0` (normal/warn — proceed) and `10` (stop — halt). Command files that check `case $? in 11|12)` must be updated in Wave 2's degradation-rip-out T3 sweep.

---

## Integration Points

| Consumer | Call | Purpose |
|---|---|---|
| `bin/orchestrator.js` task-budget gate | `getSessionStatus()` | Check `threshold === 'stop'` before each phase/task spawn; exit `10` + checkpoint on stop |
| `commands/gsd-t-execute.md` (Step 0, Step 2) | `getSessionStatus()` + `getDegradationActions()` | Pre-spawn three-band gate; Wave 2 sweep adds the handler |
| `commands/gsd-t-wave.md` (Step 0) | `getSessionStatus()` + `estimateMilestoneCost()` | Pre-flight feasibility; will pivot to `estimateRunway()` in Wave 3 |
| `commands/gsd-t-quick.md` (pre-spawn) | `getSessionStatus()` | Quick-task three-band gate (Wave 2 sweep) |
| `commands/gsd-t-integrate.md` (pre-spawn) | `getSessionStatus()` | Integration three-band gate (Wave 2 sweep) |
| `commands/gsd-t-debug.md` (pre-spawn, inter-iteration) | `getSessionStatus()` | Debug-loop three-band gate (Wave 2 sweep) |
| `commands/gsd-t-doc-ripple.md` (pre-spawn) | `getSessionStatus()` | Doc-ripple three-band gate (Wave 2 sweep) |
| `commands/gsd-t-complete-milestone.md` | `recordUsage()` | Final usage accounting at milestone close |
| `bin/gsd-t.js doStatus` | reads `.gsd-t/.context-meter-state.json` directly, three-band color switch | `normal` → GREEN, `warn` → YELLOW, `stop` → BOLD+RED |
| `bin/gsd-t.js doDoctor` | `getSessionStatus()` + config validation | Hook + API key validation |
| `bin/runway-estimator.js` (M35 Wave 3, pending) | `getSessionStatus()` | Reads current pct as the starting point for runway projection |

Pre-spawn gates invoke the module via a small inline node bootstrapper:

```bash
node -e "const {getSessionStatus} = require('./bin/token-budget.js'); const s = getSessionStatus(); if (s.threshold === 'stop') { console.error('stop band — halting cleanly'); process.exit(10); }"
```

---

## Option X — Clean Break (explicit)

M35 adopted **Option X** during the IMPACT phase: a straight v2.0.0 → v3.0.0 rewrite with no translation shim, no dual-export layer, and no deprecation window. Rationale documented in `.gsd-t/impact-report.md` IMP-001 through IMP-004:

- The blast radius (6 command files + 3 JS files + 1 test file) is fully enumerated and contained within M35's own task plan.
- All callers are in-tree. No external packages depend on `bin/token-budget.js`.
- A compat shim would carry the `modelOverrides` field in every return value indefinitely, defeating the contract's non-goal of "never return model overrides."
- A deprecation window would mean shipping a release where silent degradation still fires intermittently depending on which code path ran — worse than the v2.0.0 status quo.

Any attempt to reintroduce compatibility bridging for the removed fields would violate the contract's Non-Goals section. Don't.

---

## Schema Freeze Policy

- `WARN_THRESHOLD_PCT` and `STOP_THRESHOLD_PCT` constants are frozen for the v3.x lifetime. Re-tuning requires a new contract version.
- The `getDegradationActions()` return shape — `{band, pct, message}` — is frozen. Additive fields are allowed in v3.x minor bumps (e.g., `v3.1.0` could add `timestamp`). Removals or renames require a v4.0.0 bump.
- The `band` union `'normal' | 'warn' | 'stop'` is frozen. Adding a fourth band requires a v4.0.0 bump and a discussion about whether that band violates the Non-Goals section.

---

## Test Coverage

- `test/token-budget.test.js` — three-band boundary sweep (69/70/71/84/85/86/95), clean-break guarantees (no `modelOverrides`/`actions`/`skipPhases`/`threshold` leakage), heuristic fallback at 75% → `warn`, bulk-scan invariant that no `'downgrade'` or `'conserve'` string ever surfaces.
- `scripts/context-meter/threshold.test.js` — matching boundary sweep for the hook-side `bandFor()`.
- `scripts/gsd-t-context-meter.test.js` + `.e2e.test.js` — integration tests verifying the state file is written with the three-band vocabulary.

---

## Change Log

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | M31 | Initial contract. `getSessionStatus()` read `process.env.CLAUDE_CONTEXT_TOKENS_*` (inert — Claude Code never exports those vars). Five-band ladder (`normal/warn/downgrade/conserve/stop`) defined. |
| 2.0.0 | M34 / 2026-04-14 | Real-source rewrite. `getSessionStatus()` reads `.gsd-t/.context-meter-state.json` with historical heuristic fallback. Task counter retired. Five-band public API preserved byte-for-byte. |
| 3.0.0 | M35 / 2026-04-14 | **CLEAN BREAK**. Silent degradation bands (`downgrade`, `conserve`) REMOVED. `getDegradationActions()` return shape replaced with `{band, pct, message}` — no `modelOverrides`, no `actions`, no `skipPhases`, no `checkpoint`. Thresholds tightened: `warn@70%`, `stop@85%`. Non-Goals section added. Option X (no compat shim) documented. |
