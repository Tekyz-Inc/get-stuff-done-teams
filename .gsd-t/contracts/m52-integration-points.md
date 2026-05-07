# M52 Integration Points

- **Status**: PROPOSED (flips to PUBLISHED at each checkpoint as it lands)
- **Owner**: M52 partition (this file is shared between D1 and D2)
- **Last updated**: 2026-05-06

## Domain map

| Domain | Owns | Touches in shared file |
|--------|------|------------------------|
| `m52-d1-journey-coverage-tooling` | `bin/journey-coverage.cjs`, `bin/journey-coverage-cli.cjs`, `scripts/hooks/pre-commit-journey-coverage`, `journey-coverage-contract.md`, M52 D1 tests | `bin/gsd-t.js` (additive: ~50 lines under § scope.md) |
| `m52-d2-journey-specs-and-fixtures` | `e2e/journeys/`, `e2e/fixtures/journeys/`, `.gsd-t/journey-manifest.json`, Red Team additive section | `templates/prompts/red-team-subagent.md` (additive subsection) |

The two domains are **file-disjoint** at all owned paths. The only shared
file is `bin/gsd-t.js`, and only D1 edits it during M52. D2 reads
`bin/gsd-t.js` only to verify `gsd-t check-coverage` exists.

## Integration Checkpoints

### Checkpoint 1 — D1 publishes `bin/gsd-t.js` wiring + CLI

**Status**: PUBLISHED — 2026-05-06 18:05

**Blocks**: D2 task 4 (manifest authoring + integration).

**Definition of done**:
- ✅ `gsd-t check-coverage` CLI returns exit 0 against an empty manifest
  (no gaps, no specs, no listeners — vacuous pass).
- ✅ `gsd-t check-coverage --staged-only` runs cleanly when no viewer files
  are staged (silent pass).
- ✅ `gsd-t doctor --install-journey-hook` installs the bash hook idempotently
  in `.git/hooks/pre-commit`.
- ✅ `bin/journey-coverage.cjs` exports `detectListeners`, `loadManifest`,
  `findGaps`, `formatReport`.
- ✅ `.gsd-t/contracts/journey-coverage-contract.md` is committed with
  Status: STABLE.
- ✅ This file (`m52-integration-points.md`) flips Checkpoint 1 to PUBLISHED.

**Why this gate exists**: D2 cannot author the manifest without a stable
schema (D1's contract) and cannot write the CI assertion that all 12 specs
plus a green-coverage check pass without `gsd-t check-coverage` existing.

### Checkpoint 2 — D2 publishes 12 specs + manifest + 3 fixtures

**Status**: PUBLISHED — 2026-05-06 18:25

**Blocks**: M52 verify (Red Team adversarial pass + final coverage check).

**Definition of done**:
- ✅ All 12 `e2e/journeys/*.spec.ts` files exist and pass (12/12 green; <1s total).
- ✅ `.gsd-t/journey-manifest.json` has 12 entries that 1:1 map to the spec files.
- ✅ 3 NDJSON fixtures live under `e2e/fixtures/journeys/`.
- ✅ `gsd-t check-coverage` against the live viewer source returns exit 0:
  `OK: 20 listeners, 12 specs` (no gaps, no stale entries).
- ✅ This file (`m52-integration-points.md`) flips Checkpoint 2 to PUBLISHED.

**Why this gate exists**: D1's tooling is theoretical until proven against
a populated manifest from D2. The M52 success criterion ("zero coverage
gaps") cannot be verified before this checkpoint.

### Checkpoint 3 — Red Team adversarial pass (D2-led, both domains assert)

**Status**: PUBLISHED — 2026-05-06 18:30

**Blocks**: `/gsd-t-complete-milestone` for M52.

**Definition of done**:
- ✅ Adversarial run writes 5 broken viewer patches.
- ✅ Each patch caught by ≥1 journey spec (all 5 caught — VERDICT: GRUDGING PASS).
- ✅ Findings captured in `.gsd-t/red-team-report.md` § "M52 JOURNEY-EDITION
  RED TEAM" using the M51 structural template.
- ✅ Pre-commit-journey-coverage hook exercised end-to-end: synthetic
  `fakeBtn:click` listener staged → hook BLOCKED with exit 1 + GAP report;
  manifest updated with covering entry → hook UNBLOCKED with exit 0.

## Wave Execution Groups

Waves allow parallel execution within a wave and sequential execution between
waves. Each wave contains tasks that can safely run in parallel (no shared
files, no cross-domain dependencies within the wave).

### Wave 1 — Independent (parallel-safe)
- **m52-d1-journey-coverage-tooling**: Task 1 (`bin/journey-coverage.cjs` detector module + 15-case unit test)
- **m52-d2-journey-specs-and-fixtures**: Task 1 (3 real-data NDJSON fixtures + `replay-helpers.ts`)
- **Shared files**: NONE — D1 T1 owns `bin/journey-coverage.cjs` + `test/m52-d1-journey-coverage.test.js`; D2 T1 owns `e2e/fixtures/journeys/*`
- **Completes when**: Both listed tasks done

### Wave 2 — D1 Toolchain Build-Out (sequential within domain)
- **m52-d1-journey-coverage-tooling**: Task 2 (contract STABLE), Task 3 (CLI), Task 4 (hook), Task 5 (`bin/gsd-t.js` wiring + Checkpoint 1 publication)
- **Shared files**: D1 alone (no D2 work in this wave) — Tasks 2→3→4→5 are sequential within D1
- **Completes when**: Checkpoint 1 PUBLISHED — `gsd-t check-coverage` exits 0 against an empty manifest, hook installer idempotent, contract STABLE

### Wave 3 — After Checkpoint 1 (sequential within D2)
- **CHECKPOINT 1**: Lead verifies (a) `gsd-t check-coverage` returns exit 0 against empty manifest; (b) `gsd-t doctor --install-journey-hook` is idempotent; (c) `journey-coverage-contract.md` is STABLE; (d) `m52-integration-points.md` Checkpoint 1 flipped to PUBLISHED
- **m52-d2-journey-specs-and-fixtures**: Task 2 (specs 1–4 + manifest 1–4), Task 3 (specs 5–8 + manifest 5–8), Task 4 (specs 9–12 + manifest 12, Checkpoint 2 publication)
- **Shared files**: `.gsd-t/journey-manifest.json` — appended sequentially across D2 T2→T3→T4 (sequential within D2)
- **Completes when**: Checkpoint 2 PUBLISHED — all 12 specs green, manifest at 12 entries, `gsd-t check-coverage` exit 0

### Wave 4 — Red Team + Hook End-to-End (sequential, single task)
- **CHECKPOINT 2**: Lead verifies all 12 journey specs pass + `gsd-t check-coverage` exit 0 + manifest 1:1 with specs
- **m52-d2-journey-specs-and-fixtures**: Task 5 (Red Team category + adversarial run + hook end-to-end exercise + Checkpoint 3 publication)
- **Shared files**: `templates/prompts/red-team-subagent.md` (additive only) and `.gsd-t/red-team-report.md` (append-only)
- **Completes when**: Checkpoint 3 PUBLISHED — adversarial GRUDGING PASS, ≥5 broken patches each caught, hook block-then-unblock exercise logged

## Execution Order (for solo mode)
1. **Wave 1 parallel**: D1 T1 (detector module) ‖ D2 T1 (fixtures + replay-helpers)
2. **Wave 2 sequential**: D1 T2 → D1 T3 → D1 T4 → D1 T5 (Checkpoint 1 published)
3. **CHECKPOINT 1 verification**
4. **Wave 3 sequential**: D2 T2 → D2 T3 → D2 T4 (Checkpoint 2 published)
5. **CHECKPOINT 2 verification**
6. **Wave 4**: D2 T5 (Red Team + hook end-to-end + Checkpoint 3 published)

## Wave Grouping Rules Applied
- **D1 T1 + D2 T1 in same wave**: file-disjoint (D1 T1 writes only `bin/journey-coverage.cjs` + its test file; D2 T1 writes only under `e2e/fixtures/journeys/`). No cross-task dependencies. Safe to parallel-execute.
- **D2 T2/T3/T4 sequential**: all touch `.gsd-t/journey-manifest.json` — manifest append must be serialized to avoid merge conflicts.
- **D1 T2..T5 sequential**: T2 depends on T1's listener output; T3 depends on T1's exports; T4 depends on T3's CLI; T5 publishes Checkpoint 1 after all D1 work lands.
- **Checkpoints between waves**: lead verifies contract publication before unlocking the next wave.

## Cross-domain non-overlap proof

```
$ ls -1 .gsd-t/domains/m52-d1-journey-coverage-tooling/scope.md
$ ls -1 .gsd-t/domains/m52-d2-journey-specs-and-fixtures/scope.md
```

D1 owns: `bin/journey-coverage*.cjs`, `scripts/hooks/pre-commit-journey-coverage`,
`.gsd-t/contracts/journey-coverage-contract.md`, `test/m52-d1-*.test.js`,
plus additive edits to `bin/gsd-t.js`.

D2 owns: `e2e/journeys/`, `e2e/fixtures/journeys/`,
`.gsd-t/journey-manifest.json`, plus additive edits to
`templates/prompts/red-team-subagent.md`.

Intersection (set of files both could touch): {`bin/gsd-t.js`} — D1 only.
Confirmed disjoint.
