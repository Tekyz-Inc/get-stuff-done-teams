# Task 3 — Threshold + additionalContext builder

**Status**: COMPLETE
**Date**: 2026-04-14
**Domain**: context-meter-hook
**Milestone**: M34 — Context Meter

## Deliverables

- `scripts/context-meter/threshold.js` — pure-function module (88 lines, zero deps, CommonJS)
- `scripts/context-meter/threshold.test.js` — unit tests (35 cases)

## API

```js
const { computePct, bandFor, buildAdditionalContext, BANDS } = require('./threshold');
```

### `computePct({ inputTokens, modelWindowSize }) → number`
- Returns `(inputTokens / modelWindowSize) * 100`.
- Returns `0` on any non-finite input, negative input, or zero/negative window (fail-safe).
- Does NOT clamp above 100 — `125%` is returned as-is so the diagnostic log / band mapping can handle it.

### `bandFor(pct) → "normal" | "warn" | "downgrade" | "conserve" | "stop"`
- Uses the same boundaries as `bin/token-budget.js` THRESHOLDS (verified identical).
- Lower-bound inclusive: `pct < 60 → normal`, `60–70 → warn`, `70–85 → downgrade`, `85–95 → conserve`, `>= 95 → stop`.
- Non-finite input (NaN, Infinity, undefined) → `"normal"` (never escalate on garbage).

### `buildAdditionalContext({ pct, modelWindowSize, thresholdPct }) → string | null`
- Returns `null` when `pct < thresholdPct` or either value is non-finite.
- Otherwise returns the **exact** contract string (line 139 of `context-meter-contract.md`):
  ```
  ⚠️ Context window at {pct.toFixed(1)}% of {modelWindowSize}. Run /user:gsd-t-pause to checkpoint and clear before continuing.
  ```
- `pct` is formatted with one decimal place via `.toFixed(1)`.
- `modelWindowSize` is emitted as the raw integer — no commas, no `K` suffix.

### `BANDS` (frozen constant)
- `{ warn: 60, downgrade: 70, conserve: 85, stop: 95 }` — exported so downstream consumers and future tests can reference the canonical boundaries without re-declaring them.

## Cross-reference: bin/token-budget.js

Read `bin/token-budget.js` lines 30–40 and 170–180 to confirm boundaries:

```js
// bin/token-budget.js
const THRESHOLDS = {
  warn: 60,
  downgrade: 70,
  conserve: 85,
  stop: 95,
};

function resolveThreshold(pct) {
  if (pct >= THRESHOLDS.stop) return "stop";
  if (pct >= THRESHOLDS.conserve) return "conserve";
  if (pct >= THRESHOLDS.downgrade) return "downgrade";
  if (pct >= THRESHOLDS.warn) return "warn";
  return "normal";
}
```

`threshold.js` mirrors this byte-for-byte. Both use `Number.isFinite` guards and the same lower-bound-inclusive semantics. The `BANDS === { warn:60, downgrade:70, conserve:85, stop:95 }` test guards against future drift.

**No divergence required.** Consumers that read `threshold` from the state file will get the same band label as `token-budget.getSessionStatus()`.

## Test results

```
node --test scripts/context-meter/threshold.test.js
  35 pass / 0 fail

node --test scripts/context-meter/*.test.js bin/context-meter-config.test.cjs
  71 pass / 0 fail  (full context-meter suite, no regressions)
```

Test coverage:
- `computePct`: happy path, zero window, negative window, negative input, NaN input, NaN window, Infinity, missing args, >100% preserved, tiny fractions
- `bandFor`: every boundary (59.9 / 60 / 69.9 / 70 / 84.9 / 85 / 94.9 / 95 / 150), NaN → normal, Infinity → normal, undefined → normal, `BANDS` parity with token-budget
- `buildAdditionalContext`: below threshold → null, at threshold → string, above threshold exact contract match, decimal formatting enforces one decimal place, raw integer window (no commas / no K), NaN pct / thresholdPct → null, missing args → null, edge case `pct=0 & threshold=0` emits, pct > 100% formats correctly, different window sizes (200K / 1M)

## Acceptance

- [x] Pure functions, zero side effects, zero deps
- [x] `bandFor` boundaries match `bin/token-budget.js` exactly
- [x] `buildAdditionalContext` returns the byte-for-byte contract string
- [x] Fail-safe on all invalid inputs (never throws, never escalates)
- [x] 35 test cases covering boundaries, edge cases, and contract-string format
- [x] Full context-meter suite green (71/71)
