# Tasks: m43-d4-default-headless-inversion

> **Scope revision (2026-04-21)** — superseded the original `--in-session` opt-out model per the channel-separation decision logged in `.gsd-t/progress.md`. v2.0.0 of the contract is the **always-headless inversion**: every command spawns detached, unconditionally. The dialog channel is reserved for human↔Claude conversation; the `/gsd` router is the only in-session surface (and only for dialog-only exploratory turns). Task wording below reflects the shipped form.

## Wave 3 — Always-Headless Inversion

### D4-T1 — Bump `headless-default-contract.md` to v2.0.0 — DONE
- v2.0.0 documents channel-separation invariants, what was deleted from v1.0.0 (the `watch=true + primary → in-context` branch; the `--watch` flag on every user-invocable command file; the "threshold silently reroutes next spawn" prose), propagation matrix with all four rows resolving to headless, migration note for legacy `watch`/`inSession` params (accepted-and-ignored; scheduled removal in v3.0.0), Version History.
- D6 live-transcript URL banner + D5 dialog-growth footer preserved verbatim.

### D4-T2 — Collapse `shouldSpawnHeadless` + remove in-context branch — DONE
- `bin/headless-auto-spawn.cjs` + `.js`: `shouldSpawnHeadless` exported as constant `() => true` (backward-compat for any caller that imported it from a v1.x consumer).
- `autoSpawnHeadless`: removed the `watch && spawnType === 'primary' → {mode: 'in-context'}` early-return. All four propagation-matrix rows now resolve to `mode: 'headless'`.
- Legacy `watch`/`inSession` params accepted-and-ignored with a one-shot stderr deprecation warning (scheduled removal in v3.0.0).

### D4-T3 — Strip command files of flag parse + threshold branching — DONE
- Seven command files had operational prose to strip: `gsd-t-execute.md`, `gsd-t-wave.md`, `gsd-t-integrate.md`, `gsd-t-quick.md`, `gsd-t-debug.md`, `gsd-t-verify.md`, `gsd-t-scan.md`. The `--watch` flag parse block was removed; the "threshold silently reroutes next spawn" prose in Step 3 / Step 3.5 / Step 7 was replaced with observational-only language (band captured for logging; no gating).
- Remaining scope files (`gsd-t-complete-milestone`, `gsd-t-test-sync`, `gsd-t-gap-analysis`, `gsd-t-populate`, `gsd-t-feature`, `gsd-t-project`, `gsd-t-partition`) had no operational `--in-session` / `--headless` / `WATCH_FLAG` to strip; verified by grep-assertion in the D4-T5 matrix test.
- OBSERVABILITY LOGGING + Document Ripple blocks intact on every command file.

### D4-T4 — Router (`/gsd`) v2.0.0 banner — DONE
- `commands/gsd.md` Step 2.5 carries the "Inverted default (M43 D4, v2.0.0)" invariant banner — every workflow turn spawns detached; exploratory turns stay in-session.
- D5 dialog-growth footer (Step 5) preserved verbatim.

### D4-T5 — Matrix tests — DONE
- NEW `test/m43-headless-default-inversion.test.js` — 40 tests:
  - `shouldSpawnHeadless` returns `true` across a 9×3×3 matrix of `pct × watch × inSession`.
  - `autoSpawnHeadless` returns `mode: 'headless'` for each row of `{watch: false/true} × {spawnType: primary/validation}`, plus the legacy `inSession: true` case.
  - 14 command files × 3 grep assertions each (no operational `--in-session`, no operational `--headless`, no operational `WATCH_FLAG` branching) — doc-reference exemption for deprecation/ignored/removed/v2.0.0 markers.
  - Router surface: D5 footer preserved, v2.0.0 invariant banner present, no operational removed flags.
- Adjacent test updates: `test/headless-default.test.js` propagation matrix flipped to all-headless; `test/watch-unattended-integration.test.js` renamed the watch-primary test to assert `MODE=headless`.

### D4-T6 — Doc ripple — DONE
- `templates/CLAUDE-global.md` + `templates/CLAUDE-project.md` — "Headless-by-Default Spawn" section replaced with "Always-Headless Spawn (M43 D4) — Channel Separation". Context Meter section updated to "Observational Only".
- `README.md` — Headless + Context Meter bullets updated to v2.0.0 language.
- `commands/gsd-t-help.md` — no stale `--watch` / `--in-session` references; no changes needed.
- `GSD-T-README.md` does not exist in this repo (original task spec referenced it; confirmed absent).
- `.gsd-t/progress.md` Decision Log — entry added for this commit.
