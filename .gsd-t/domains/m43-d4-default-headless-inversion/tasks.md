# Tasks: m43-d4-default-headless-inversion

## Wave 2 — Parallel with D2, D5, D6

### D4-T1 — Bump `headless-default-contract.md` to v2.0.0
- Document new default + `--in-session` opt-out + 15% low-water bypass.
- Link back to M43 rationale (attribution data from D1/D2 makes the inversion safe).

### D4-T2 — Invert `bin/headless-auto-spawn.cjs::shouldSpawnHeadless`
- Old: `pct > threshold → headless`.
- New: `!inSession && pct >= 15 → headless`.
- Keep the 85% "hard escalate" branch as-is (headless).
- Add unit tests covering the three branches + the explicit flag.

### D4-T3 — Edit 14 command files
- For each: update the spawn-mode shim at the top so "default = headless".
- Add the `--in-session` flag parse.
- Preserve OBSERVABILITY LOGGING + Document Ripple sections intact.
- Propagate `--in-session` from `$ARGUMENTS` → `autoSpawnHeadless({inSession: …})`.

### D4-T4 — Router (`/gsd`) inverse hint
- In `commands/gsd.md` Step 2.5, add the banner text for the inverted default.
- Classifier: exploratory queries → stay in-session; action verbs (execute, build, run, fix, deploy) → spawn detached unless `--in-session` on the end.

### D4-T5 — Matrix tests
- `test/m43-headless-default-inversion.test.js`: for each of the 14 command files + the router, assert the spawn-mode decision against (default, `--in-session`, low-water).
- Use fixture command invocations; no real spawns.

### D4-T6 — Doc ripple
- Update `CLAUDE.md` (global + project) Headless-by-Default sections.
- Update `GSD-T-README.md` + `README.md` workflow section.
- Update `commands/gsd-t-help.md`.
- Progress Decision Log.
