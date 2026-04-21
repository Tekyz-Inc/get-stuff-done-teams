# Domain: m43-d5-dialog-channel-meter

> **Revised 2026-04-21**: Originally scoped as a compaction-pressure circuit breaker that would refuse to start in-session commands when growth predicted `/compact`. Under D4's revised channel-separation model, **there are no in-session commands to refuse** — only the dialog channel runs in-session, and the router always spawns. D5 collapses to a much smaller utility: a turn-over-turn growth meter on the dialog itself. Pure read/warn — never refuses, never reroutes.

## Responsibility

Track turn-over-turn token growth in the **dialog channel** (the only thing still running in-session under D4) and surface a one-line warning when growth predicts the next `/compact` within N turns. This lets the user `/clear` or wrap the conversation deliberately rather than getting silently `/compact`-ed mid-thought.

The bee-poc pathology (3 compactions in one workday; interval collapsing 51min → 11min) is the canonical failure mode. Under the revised model, that pathology can only occur in the dialog channel (since everything else spawns). D5 makes the dialog itself observable.

## Owned Files/Directories

- `bin/runway-estimator.cjs` — EXTEND (small addition, not a new module). Add a function:
  - `dialogGrowthSignal({rows, K, modelContextCap}) → {warn: boolean, predicted_turns_to_compact: number, slope: number, reason: string}`
  - Reads the last K per-turn rows from `.gsd-t/metrics/token-usage.jsonl` filtered to the current dialog session.
  - Computes median-of-deltas slope (not linear regression — robust to single-turn outliers).
  - Predicts turns-to-`/compact` given current growth + model cap.
  - Returns `warn: true` if predicted-turns ≤ threshold (default 5).
- `commands/gsd.md` — EDIT. At end of each router turn, call the dialog meter; if `warn: true`, append a one-line footer to the router's response: `⚠ dialog growth high — ~N turns to /compact. Consider /clear when ready.` Single line, never modal, never blocks the response.
- `test/m43-dialog-meter.test.js` — NEW. Fixture tests:
  - Flat trajectory → `warn: false`.
  - Steep positive slope + short horizon → `warn: true`.
  - Single-turn outlier → median absorbs it, `warn: false`.
  - Empty session / cold start → `warn: false`, `reason: "insufficient_data"`.

## NOT Owned

- Refusing or rerouting in-session commands — **deleted from scope**. There are no in-session commands.
- A new contract — **deleted from scope**. The original `compaction-pressure-contract.md` v1.0.0 is no longer needed; the meter is a small extension to the existing runway estimator.
- Auto-`/clear` on warn — explicitly out of scope. The user decides when to wrap.
- Headless spawn observability — D6.
- Per-turn usage writer — D1.

## Contract Surface

- **No new contract.** The original sketch (`compaction-pressure-contract.md`) is dropped.
- Reads from `metrics-schema-contract.md` v2 (`turn_id`, `session_id`).
- Note in `headless-default-contract.md` v2.0.0: D5 watches the dialog channel only; spawned work is observed via the visualizer (D6).

## Consumers

- Router `/gsd` (the only consumer — D5 fires only in the dialog channel).
- `gsd-t status` may optionally print the current dialog slope (nice-to-have, not required).

## Dependencies

- **D5 → D1**: reads D1's per-turn usage rows.
- **D5 → D3**: needs schema v2 `session_id` + `turn_id` to filter to current dialog.
- **D5 || D2, D4, D6**: parallel in Wave 2.

## Why this collapsed

A circuit breaker only makes sense when the default is "in-session, sometimes headless." Under D4's "always headless except dialog" rule, there is nothing to trip — the spawn already happened. The only remaining in-session surface is the router conversation, and the appropriate response to dialog growth is "tell the user," not "refuse to start a command" (no command runs in-session anyway).

What got deleted vs kept:
- ❌ `bin/gsd-t-compaction-pressure.cjs` (new module) — not needed; small extension to existing estimator instead.
- ❌ `compaction-pressure-contract.md` v1.0.0 — not needed.
- ❌ `headless-auto-spawn.cjs` patches — not needed; D4 simplifies that file separately.
- ❌ Refuse-and-reroute behavior — there's nothing to reroute to.
- ✅ Trajectory math, fixture tests, dialog warning — kept, scoped to router only.
