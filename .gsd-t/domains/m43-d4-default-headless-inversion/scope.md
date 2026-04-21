# Domain: m43-d4-default-headless-inversion

## Responsibility

Flip the spawn-mode default across the GSD-T command surface from **"spawn headless only when over context band"** to **"spawn headless unless the user explicitly passes `--in-session` OR the session-context is below a low-water mark (~15%)"**.

This is the *inversion* half of M43: Part A (D1/D2/D3) measures; D4 acts on what's measured. Also: the router (`/gsd`) gets an inverse hint — "quick exploratory queries run in-session unless you pass `--headless`."

## Owned Files/Directories

- `commands/gsd-t-execute.md`
- `commands/gsd-t-wave.md`
- `commands/gsd-t-integrate.md`
- `commands/gsd-t-quick.md`
- `commands/gsd-t-debug.md`
- `commands/gsd-t-verify.md`
- `commands/gsd-t-complete-milestone.md`
- `commands/gsd-t-test-sync.md`
- `commands/gsd-t-scan.md`
- `commands/gsd-t-gap-analysis.md`
- `commands/gsd-t-populate.md`
- `commands/gsd-t-feature.md`
- `commands/gsd-t-project.md`
- `commands/gsd-t-partition.md`
- `commands/gsd.md` (router — add the inverse hint for conversational use)
- `.gsd-t/contracts/headless-default-contract.md` — BUMP v1.0.0 → v2.0.0. Document:
  - New default: headless.
  - `--in-session` opt-out flag syntax + propagation rules (router → command file → spawn site).
  - Low-water-mark bypass: if `ctxPct < 15`, stay in-session without needing the flag.
  - Heartbeat compatibility: `.gsd-t/events/*.jsonl` writer is unchanged; headless spawns already emit events today.
- `bin/headless-auto-spawn.cjs` — EDIT. Invert the default branch of `shouldSpawnHeadless`: current "yes if pct > threshold" flips to "yes unless `--in-session` or pct < 15%".
- `test/m43-headless-default-inversion.test.js` — NEW. Matrix tests: 14 command files × 3 flag scenarios (default → headless, `--in-session` → in-session, low-water → in-session).

## NOT Owned

- Token capture wrapper — D3.
- In-session usage capture entry-point — D1.
- Transcript viewer URL plumbing — D6 (D4 doesn't print the URL; D6 does).
- Runway estimator / compaction-pressure circuit breaker — D5.

## Contract Surface

- `headless-default-contract.md` v2.0.0 is the single source of truth for spawn-mode decisions.
- Every edited command file references v2.0.0 in its doc-ripple.

## Consumers

- Router `/gsd` is the primary end-user entry point.
- Every command file listed above.
- `bin/headless-auto-spawn.cjs::autoSpawnHeadless` is the single code path.

## Dependencies

- **D4 runs in Wave 2** alongside D2/D5/D6. D4 is independent of D1/D3 (schema-blind).
