# Tasks: m43-d5-dialog-channel-meter

> **Scope revised 2026-04-21** per M43 channel-separation decision (see `.gsd-t/progress.md` M43 "Current Milestone" block + Decision Log 2026-04-21 14:43). Superseded task set (D5-T1..T6 describing a circuit breaker + new module + new contract + `headless-auto-spawn.cjs` wire-up + `gsd-t status` integration + CLAUDE.md prose) retained in git history at commit `4b45114`. The revised scope below is what shipped.

## Wave 2 — Parallel with D2, D6

### D5-T1 (revised) — `estimateDialogGrowth` in `bin/runway-estimator.cjs` — DONE
- New module (runway-estimator.cjs did not previously exist despite the M35 contract sketch).
- Signature: `estimateDialogGrowth({projectDir, sessionId, k = 5, modelContextCap = 200000, warnThresholdTurns = 5}) → {shouldWarn, slope, median_delta, latest_input_tokens, predicted_turns_to_compact, k, history_len, reason?}`.
- Reads `.gsd-t/metrics/token-usage.jsonl`, filters to rows with `sessionType: "in-session"` + matching `session_id`, sorts by `ts` then `turn_id`, takes last K turns, computes median-of-deltas slope.
- `predicted_turns_to_compact = ceil((modelContextCap × 0.92 − latest_input_tokens) / slope)` when `slope > 0`, else `Infinity`. The `× 0.92` reflects Claude Code's pre-auto-compact headroom.
- Returns `{shouldWarn: false, reason: 'insufficient_history'}` when fewer than 3 in-session turns exist for the session.
- Zero external deps. `.cjs` for ESM/CJS compat.

### D5-T2 (revised) — Router warning footer in `commands/gsd.md` — DONE
- Added "## Step 5: Dialog-Channel Growth Warning (M43 D5)" after Step 4.
- Router runs a `node -e` shim that imports `estimateDialogGrowth`, uses `$CLAUDE_SESSION_ID` (with fallback), and prints a two-line blockquote when `shouldWarn` is true:
  ```
  > ⚠  Dialog pressure: ~{N} turns to /compact (last K={K} turns, growth ~{delta}/turn).
  > Consider spawning the next action detached (`/gsd ... --detach`) or running `/compact` now.
  ```
- Classifier / router logic untouched — the warning is a pure footer, emitted once per turn.

### D5-T3 (revised) — Fixture tests `test/m43-dialog-channel-meter.test.js` — DONE
- Flat trajectory → `shouldWarn=false`.
- Steep linear growth → `shouldWarn=true`, sensible `predicted_turns_to_compact`.
- Outlier resistance — one turn spikes 50K, median absorbs it → `shouldWarn=false`.
- Insufficient history (2 in-session rows) → `shouldWarn=false`, `reason: 'insufficient_history'`.
- Session isolation — rows from another `session_id` ignored.
- Empty JSONL file → graceful, `reason: 'no_rows'`.
- Missing JSONL file → graceful, `reason: 'no_rows'`.
- `sessionType !== "in-session"` rows ignored.
- Missing `sessionId` → `reason: 'missing_session_id'`.
- **Result: 9/9 pass.**

### D5-T4 (revised) — Contract subsection in `.gsd-t/contracts/context-meter-contract.md` — DONE
- Bumped version 1.3.0 → 1.4.0 (minor, additive).
- Added §Dialog Growth Meter subsection describing the module, signature, semantics, consumer, and rules.
- Added D5 co-ownership line next to M38's primary ownership.

### D5-T5 (revised) — Doc ripple — DONE
- `.gsd-t/progress.md` Decision Log entry: `2026-04-21 HH:MM: [execute M43 D5 W2] dialog-channel growth meter — runway-estimator extension + router footer + tests`.
- No `CLAUDE.md` prose changes — the circuit breaker is OUT OF SCOPE under channel separation.
- No `docs/architecture.md` "Token Pipeline" changes in this task — the meter is a small router utility, not a pipeline component.

## Dropped / not implemented (per revised scope)

- ❌ `bin/gsd-t-compaction-pressure.cjs` — NOT CREATED. Logic is a small extension to `bin/runway-estimator.cjs` instead.
- ❌ `compaction-pressure-contract.md` v1.0.0 — NOT AUTHORED. Added as a subsection to `context-meter-contract.md` (v1.4.0) instead.
- ❌ `bin/headless-auto-spawn.cjs` patches — NOT MADE. Under always-headless (D4), the spawn decision does not consult this signal.
- ❌ `gsd-t status` integration — DEFERRED. The scope doc flags it as nice-to-have, not required.
- ❌ Refuse / reroute / `--force-in-session` override — DELETED. Under always-headless there is nothing to refuse and nothing to reroute to.
- ❌ `CLAUDE.md` "circuit breaker" prose — DELETED.
