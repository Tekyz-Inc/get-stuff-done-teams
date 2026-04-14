# M34 / installer-integration / Task 4 — status-line for real context%

**Status**: PASS
**Date**: 2026-04-14
**Files modified**:
- `bin/gsd-t.js` (+76 lines) — added `formatRelativeTime` helper and `showStatusContextMeter` sub-display wired into `doStatus`

## Change

`doStatus` now emits a new "Context Meter" section between "Agent Teams" and "Current Project". The new sub-fn reads `.gsd-t/.context-meter-state.json` (defensively — any error = "meter hook not run this session"), picks a color from the threshold band, and prints one line matching the format from tasks.md acceptance criteria.

### Helper: `formatRelativeTime(iso)`
5-line helper, zero-dep, returns `"Xs ago"` / `"Xm ago"` / `"Xh ago"` / `"X days ago"`. Clock-skew safe — negative deltas clamp to `0s ago`. Invalid ISO → `"unknown"`.

### Sub-fn: `showStatusContextMeter()`
Four output modes:
1. **Missing / corrupt JSON / invalid shape** → dim `Context: N/A (meter hook not run this session)`
2. **Error** (`inputTokens === 0` AND `lastError` truthy) → dim `Context: N/A (meter error: {lastError.code}) — last check {rel}`. Prints ONLY the `code` field, never `message` (contract rule #3).
3. **Fresh** (timestamp within last 5 min) → `Context: {pct.toFixed(1)}% of {modelWindowSize} tokens ({threshold} band) — last check {rel}`, colored by threshold band.
4. **Stale** (>5 min) → same as fresh plus ` (stale)` suffix.

Color mapping:
- `normal` → GREEN
- `warn` → YELLOW
- `downgrade` → YELLOW
- `conserve` → RED
- `stop` → BOLD + RED
- N/A → DIM

## Smoke tests (all 7 PASS)

| # | Scenario | Expected | Result |
|---|----------|----------|--------|
| 1 | State file absent | `Context: N/A (meter hook not run this session)` + exit 0 | PASS |
| 2 | Fresh warn band (62.175%) | `Context: 62.2% of 200000 tokens (warn band) — last check 0s ago`, no `(stale)` | PASS |
| 3 | Stale 10 min old | Same line + ` (stale)` suffix; relative time shows `10m ago` | PASS |
| 4 | Error state (`lastError.code="api_error"`, message="something secret here", `inputTokens=0`) | Shows `meter error: api_error`; message string NOT present in output | PASS — code shown, no message leak |
| 5 | Corrupt JSON (`not json{`) | `Context: N/A` + no crash + exit 0 | PASS |
| 6 | Diff before/after edit | Delta = exactly 3 new lines (heading + data + blank); all pre-existing lines preserved | PASS (`+3 -0`) |
| 7 | `npm test` full suite | 924/924 green | PASS (924/924) |

Working tree restored to original state file after smoke tests (backup in `/tmp`, copied back, tmp files deleted).

## Contract compliance

- **Rule 1 (fail open)** — N/A (read-only consumer; never blocks Claude).
- **Rule 2 (no key storage)** — N/A (doStatus doesn't touch API keys).
- **Rule 3 (no message content in logs)** — ENFORCED. Error output prints `state.lastError.code` only; the `message` field is never passed to `log()` or `console`. Verified by Test 4 which writes `"something secret here"` into the message field and greps the output for "something" → not found.
- **Rule 4 (state file is not committed)** — N/A at read time; the installer handles .gitignore.
- **Rule 5 (transcript tolerance)** — N/A (this task reads the state file, not the transcript).
- **Rule 6 (backward-compatible)** — YES. Missing state file degrades gracefully to "N/A (meter hook not run this session)". Corrupt JSON degrades to the same. No crashes.

## Constraints honored

- Zero new dependencies (only `fs`, `path` — already imported)
- Zero external npm deps
- Color helpers reused (BOLD, GREEN, YELLOW, RED, DIM, RESET) — no new escape codes
- All pre-existing status output preserved (diff confirms)
- No destructive filesystem operations — edit is purely additive
- Smoke test state-file mutations cleaned up; working tree matches pre-task state for tracked files

## Constraint discoveries

- The existing real state file (`.gsd-t/.context-meter-state.json` on this repo) has `timestamp: null` in its `lastError` shape (because the meter has never succeeded — no API key). This exercised the `formatRelativeTime` "unknown" fallback on the invalid-timestamp path. Output: `Context: N/A (meter error: missing_key) — last check unknown`. Confirms defensive ISO parsing doesn't crash on null.
- The contract's threshold enum includes `downgrade` which token-budget-contract.md also distinguishes from `warn` — gave both the YELLOW color to avoid alarming the user in a display-only context. The hook itself still decides whether to emit `additionalContext` based on `thresholdPct`; this status line is purely informational.

## Deferred items

None.

## Next

Task 5 — `task-counter` retirement migration.
