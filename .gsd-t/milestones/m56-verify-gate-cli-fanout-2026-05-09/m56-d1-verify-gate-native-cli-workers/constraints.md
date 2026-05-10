# Constraints: m56-d1-verify-gate-native-cli-workers

## Must Read Before Using (no black-box treatment)
- `bin/parallel-cli.cjs::runParallel({workers, maxConcurrency, failFast?, teeDir?})` envelope shape and worker spec — D1 produces workers conforming to this signature
- `bin/gsd-t-token-capture.cjs::captureSpawn` invariant — every native CLI worker spawn MUST flow through this wrapper (M41 rule)
- `.gsd-t/contracts/parallel-cli-contract.md` v1.0.0 STABLE — determinism rules, fail-fast policy, per-worker timeout semantics
- `.gsd-t/contracts/verify-gate-contract.md` v1.0.0 STABLE — current envelope, two-track hard-fail rule, ≤500-token summary discipline
- Existing Track 2 worker registration in `bin/gsd-t-verify-gate.cjs` — understand the current Task-subagent-wrapped pattern before replacing it for the three named CLIs

## Must Follow
- **Additive-only edits to `bin/gsd-t-verify-gate.cjs`** — DO NOT change the v1.0.0 envelope shape (`{ok, schemaVersion, track1, track2, summary}`). New workers register as additional Track 2 entries.
- **captureSpawn invariant** — every spawn flows through `bin/gsd-t-token-capture.cjs`. No bare `spawn('claude', …)` or `child_process.exec(…)` for the new workers without `captureSpawn` wrap.
- **Token-delta measurement is mandatory, not optional** — D1 is the milestone's path to closing M55 SC4. The baseline+actual JSON file MUST exist and MUST be referenced from CHANGELOG before complete-milestone.
- **Wall-clock measurement under 34s** — verify-gate dogfood scenario must beat M55's 34s. Measured via `time gsd-t verify-gate --json > /dev/null` on the same scenario.
- **Honor `peakConcurrency=12`** from `.gsd-t/ratelimit-map.json` — fan-out caps at the substrate-default value.
- **Defensive-on-missing-map default** — if `.gsd-t/ratelimit-map.json` is absent, fallback to `maxConcurrency=2` (per M55 D5 contract).

## Must Not
- Modify files outside owned scope
- Change `runVerifyGate` envelope shape (v1.0.0 STABLE — schema additions require contract bump)
- Spawn Task subagents for the three named CLIs (`playwright test`, `npm test`, `gsd-t check-coverage`) — they MUST run as native `runParallel` workers
- Bypass `captureSpawn` for native CLI workers — even though they don't produce a `usage` envelope (token cell renders `—`, never `0` or `N/A`)
- Regress to regex-based 429 classification (probe v3+ uses API result envelope per M55 D3 charter)
- Touch `commands/*.md` (D3 + D4 own command-file edits)

## Dependencies
- Depends on: D2 (upper-stage brief kinds) — NO. D1 is independent of D2.
- Depended on by: D6 verify (verify phase will dogfood the new Track 2 native workers)
- Concurrent with: D2, D3, D4, D5 (file-disjoint, can wave in parallel)

## Test Baseline
- Pre-D1: 2487/2487 unit (recorded 2026-05-09 19:23 PDT)
- Post-D1 expected: 2487 + new D1 tests (estimate 8-12 new), all green
