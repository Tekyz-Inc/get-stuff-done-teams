# Tasks: m43-d1-in-session-usage-capture

(Task-level decomposition will be refined in `/gsd-t-plan` M43. Skeleton below.)

## Wave 1 — Foundation

### D1-T1 — Branch spike + decision lock

**Status**: PROBE INSTALLED (2026-04-21 12:56 — pending real Stop payload).

- [x] Probe script shipped: `scripts/hooks/gsd-t-in-session-probe.js` (+ `~/.claude/scripts/gsd-t-in-session-probe.js`). Captures raw hook payload to `.gsd-t/.hook-probe/{event}-{ts}-{sid}.json`. 5/5 unit tests.
- [x] Probe directory created at `.gsd-t/.hook-probe/` (creating/deleting this directory is the on/off switch).
- [x] Verified end-to-end with fabricated Stop payload (produced `Stop-2026-04-21T19-55-18-366Z-probe-test-0.json` with all four `usage.*` fields intact).
- [ ] **Hook wire-up** (blocked by settings.json permission in unattended iter): add probe entry to `Stop` + `SessionEnd` + `PostToolUse` arrays in `~/.claude/settings.json` (or project `.claude/settings.json`):

    ```json
    { "matcher": "", "hooks": [
        { "type": "command",
          "command": "node \"$HOME/.claude/scripts/gsd-t-in-session-probe.js\"",
          "async": true } ] }
    ```

- [ ] One real in-session Stop fires → inspect the first `.gsd-t/.hook-probe/Stop-*.json`:
  - If `usage` object is present → **Branch A** locked (hook-based). Update `docs/requirements.md` + `.gsd-t/contracts/stream-json-sink-contract.md` v1.1.0 → v1.2.0 §"In-session hook entry-point".
  - If `usage` is absent → **Branch B** locked (extend M42 `scripts/transcript-tee.cjs` to interactive sessions). Same contract update, different section.
- [ ] Delete `.gsd-t/.hook-probe/` directory once branch is decided (turns probe OFF — leaves script in place for future re-enablement).
- [ ] Commit the decision record to `.gsd-t/progress.md` Decision Log with the actual JSON field names observed in the probe artifact.

### D1-T2 — Implement capture entry-point
- Branch A: write `scripts/hooks/gsd-t-in-session-usage-hook.js` + wire install/update in `bin/gsd-t.js` (`install --install-in-session-hook` idempotent behavior).
- Branch B: write `scripts/transcript-tee-interactive.cjs` (reuse M42 D1 tee primitives; wrap `claude` or user shell invocation).
- Either branch: write `bin/gsd-t-in-session-usage.cjs` with `captureInSessionUsage({projectDir, sessionId, turnId, usage, model, command?, ts?})` that appends a JSONL line to `.gsd-t/metrics/token-usage.jsonl` conforming to D3's schema v2.
- Unit tests in `test/m43-in-session-usage.test.js`.

### D1-T3 — Integration test (one-turn + multi-turn)
- Fabricate an in-session session with 1 turn, assert 1 row in `.gsd-t/metrics/token-usage.jsonl`.
- Fabricate a 3-turn session, assert 3 rows with distinct `turn_id`.
- Fabricate a session with missing `usage`, assert row written with `usage: null`.
- Run the full suite (`npm test`), confirm no regressions.

### D1-T4 — Documentation
- Update `docs/requirements.md` §"M43 Universal Token Attribution" with the locked branch.
- Update `bin/gsd-t.js --help` if Branch A adds a new install subcommand flag.
- Append entry to `.gsd-t/progress.md` Decision Log.
