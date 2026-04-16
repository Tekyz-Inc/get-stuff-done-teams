# Contract: Runway Estimator

## Version: 1.0.0
## Status: ACTIVE
## Owner: m35-runway-estimator
## Consumers: `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-integrate.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-debug.md`, `bin/gsd-t.js` (future: `gsd-t runway` subcommand)

---

## Purpose

`bin/runway-estimator.js` is the **pre-flight context runway projector** for GSD-T. It reads the current context percentage (from the M34 context meter state file) plus historical per-spawn token telemetry (from `.gsd-t/token-metrics.jsonl`) and returns a decision object that callers use to choose between three paths:

1. **`proceed`** — projected end context is comfortably under the v3.0.0 stop threshold (85%). Run normally.
2. **`headless`** — projected end context would trip the stop threshold. Hand off to `bin/headless-auto-spawn.js` to continue in a fresh context. **The user is never prompted.**
3. **`clear-and-resume`** — emitted only when `headless` is unavailable. Last-resort fallback for manual intervention.

The estimator is deterministic, side-effect-free (no writes, no network, no child processes), and tolerant of missing inputs. Running it thousands of times is free.

---

## Core Principle

> The interactive session must never stall at 95% native compaction. We measure current runway, project forward, and pivot to headless before we run out.

M35's guarantee is that **no user-facing `/clear` or `/compact` prompts are emitted under context pressure**. The runway estimator is the gate that enforces this: every long-running command calls it at Step 0, and if projected consumption would cross the stop band the caller pivots to headless auto-spawn instead of proceeding.

The estimator itself never prompts the user. On refusal, it emits a decision object whose `recommendation` field drives the caller to a deterministic handoff path.

---

## API

### `estimateRunway(opts)` → decision object

**Input**:

```typescript
{
  command: string,            // e.g., "gsd-t-execute", "gsd-t-wave"
  domain_type?: string,       // e.g., "bin-script", "frontend-ui". "" if N/A.
  remaining_tasks: number,    // count of tasks the caller intends to execute
  projectDir?: string,        // defaults to process.cwd()
  headlessAvailable?: boolean // defaults to true; set false to get clear-and-resume
}
```

**Return**:

```typescript
{
  can_start: boolean,          // projected_end_pct < STOP_THRESHOLD_PCT (85)
  current_pct: number,         // current context pct from .context-meter-state.json
  projected_end_pct: number,   // current_pct + pct_per_task * remaining_tasks * skew
  confidence: "low" | "medium" | "high",
  confidence_basis: number,    // number of historical records matching query
  pct_per_task: number,        // mean pct delta per spawn used in the projection
  recommendation: "proceed" | "headless" | "clear-and-resume",
  reason: string               // short human-readable explanation
}
```

**Never throws**. Missing files, missing fields, and malformed JSONL lines are treated as empty inputs and drive the fallback path.

---

## Historical Query Tiers

The estimator picks the sharpest historical slice that has enough records:

| Tier | Filter | Confidence if count ≥ threshold |
|---|---|---|
| 1 | `record.command === command && record.domain_type === domain_type` | `medium` ≥ 10, `high` ≥ 50 |
| 2 | `record.command === command` (fallback when Tier 1 is insufficient) | `medium` ≥ 10, `high` ≥ 50 |
| 3 | Constant fallback (when no tier has ≥10 records) | always `low` |

Tier 1 falls through to Tier 2 only when it has **fewer than 10 matching records**. A tier with ≥10 records is always preferred over a broader tier, even if the broader tier has more records — sharper matches are more predictive of runway cost.

---

## Confidence Grading

| Confidence | Matching records | Meaning |
|---|---|---|
| `high` | ≥ 50 | Strong statistical basis — use the mean directly. |
| `medium` | 10 ≤ n < 50 | Usable basis — use the mean directly. |
| `low` | < 10 | Insufficient data — apply 1.25x conservative skew. |

Boundary conditions (frozen):

- `n == 50` → `high`
- `n == 49` → `medium`
- `n == 10` → `medium`
- `n == 9` → `low`

---

## Conservative Skew Policy

When `confidence === "low"`, the raw projection is multiplied by **1.25** (25% over-estimate). This makes the refusal path fire earlier when data is sparse, trading a small amount of false-refusal rate for a strong guarantee that we won't silently run out of runway.

At `medium` and `high` confidence, the raw projection is used as-is.

Constant fallback (used only when total matching records across Tiers 1–2 is zero) — frozen in v1.0.0:

| Command default tier | `pct_per_task` |
|---|---|
| sonnet-default (e.g., `gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick`) | `4` |
| opus-default (`gsd-t-debug`, `gsd-t-integrate`) | `8` |

These values are conservative estimates based on observed spawn costs in M34/M35 Wave 1–2 telemetry; they are refreshable in minor versions once a wider dataset exists.

---

## Refusal Output Format

When `can_start === false` and `recommendation === "headless"`, the calling command file prints this ⛔ block (from M35-definition Part C) before calling `autoSpawnHeadless()`:

```
⛔ Insufficient runway — projected to consume {pct_per_task × remaining_tasks}% context across {remaining_tasks} tasks.
   Current: {current_pct}% used / {100 - current_pct}% free
   Projected end: {projected_end_pct}% (stop threshold: 85%)
   Confidence: {confidence} (based on {confidence_basis} historical records for {command}/{domain_type})

Auto-spawning headless to continue in a fresh context.
Session ID: {headless_id}
Status: tail .gsd-t/headless-{id}.log

Your interactive session remains idle — you can use it for other work.
You will be notified when the headless run completes.
```

The estimator itself emits no output — the command file composes this banner using the returned decision object and the session ID from `autoSpawnHeadless()`.

---

## Handoff Protocol

On `recommendation === "headless"`, the calling command file:

1. Prints the ⛔ block above (composed from the decision object).
2. Calls `require('./bin/headless-auto-spawn.js').autoSpawnHeadless({ command: '<same command>', args: [...], continue_from: '.' })`.
3. Captures the returned `{id, pid, logPath, timestamp}` and prints the final two lines of the ⛔ block with the real session ID.
4. Exits cleanly (`process.exit(0)`). The interactive session remains idle — it never blocks on the headless child.

On `recommendation === "clear-and-resume"` (only when `headlessAvailable === false`), the caller prints a degraded-mode banner and exits, instructing the user to `/clear` and resume manually. This path should be unreachable in practice once M35 Wave 3 lands.

---

## Never Prompts the User

**The estimator guarantees zero user prompts under any input.** Specifically:

- Missing `.gsd-t/.context-meter-state.json` → warn to stderr, assume `current_pct=0`, proceed.
- Missing `.gsd-t/token-metrics.jsonl` → treat as empty, fall to constant fallback, return `confidence=low`.
- Malformed JSONL lines → skipped silently.
- `remaining_tasks <= 0` → projected_end_pct equals current_pct, always `proceed`.
- Any thrown exception from dependencies → caught and converted to the fallback path.

This invariant is enforced by the unit test suite (`test/runway-estimator.test.js`) and is a frozen v1.0.0 guarantee.

---

## Integration Points

| Consumer | Uses | Purpose |
|---|---|---|
| `commands/gsd-t-execute.md` Step 0 | `estimateRunway({command: 'gsd-t-execute', domain_type, remaining_tasks})` | Pre-execute runway gate |
| `commands/gsd-t-wave.md` Step 0 | `estimateRunway({command: 'gsd-t-wave', remaining_tasks: <wave task count>})` | Pre-wave runway gate |
| `commands/gsd-t-integrate.md` Step 0 | `estimateRunway({command: 'gsd-t-integrate', remaining_tasks})` | Pre-integrate runway gate |
| `commands/gsd-t-quick.md` Step 0 | `estimateRunway({command: 'gsd-t-quick', remaining_tasks: 1})` | Lightweight single-task gate |
| `commands/gsd-t-debug.md` Step 0 + mid-loop | `estimateRunway({command: 'gsd-t-debug', remaining_tasks: 1})` | Pre-debug gate + between-iteration check |

---

## Relationship to Other Contracts

| Contract | Relationship |
|---|---|
| `token-telemetry-contract.md` v1.0.0 | **Read-only data source.** Reads `.gsd-t/token-metrics.jsonl` records. Uses `context_window_pct_before` and `context_window_pct_after` fields. Never writes to this file. |
| `token-budget-contract.md` v3.0.0 | **Threshold source.** Mirrors `STOP_THRESHOLD_PCT = 85`. If the threshold changes in token-budget v4, this contract bumps to v2. |
| `headless-auto-spawn-contract.md` v1.0.0 | **Handoff target.** On `recommendation === "headless"`, the caller invokes `autoSpawnHeadless()` from that module. |
| `.gsd-t/.context-meter-state.json` (M34 hook state) | **Read-only data source.** Reads the `pct` field. Missing file → `current_pct=0` with a stderr warning. |

---

## Frozen API for v1.x

- Function signature `estimateRunway(opts)` and return shape are frozen.
- Field names in the return object are frozen (consumers parse by name).
- Confidence thresholds (50 / 10) are frozen.
- Low-confidence skew multiplier (1.25) is frozen.
- Stop threshold reference (85) is frozen — mirrors `token-budget-contract.md` v3.0.0.
- Constant fallback values (4% sonnet, 8% opus) are frozen in v1.0.0 but may be re-tuned in v1.1.x once the historical dataset reaches `high` confidence for most common command/domain_type pairs.

Breaking changes (function rename, return shape change, threshold change independent of token-budget) require a v2.0.0 bump.

---

## Change Log

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | M35 / 2026-04-15 | Initial contract. Frozen `estimateRunway` API, three-tier historical query (pair → command → constant), confidence grading (50/10), 1.25x low-confidence skew, 4%/8% sonnet/opus fallbacks, refusal block format, handoff protocol to `headless-auto-spawn`, never-prompts-the-user guarantee. |
