# M55 Integration Points

> Authored: 2026-05-09 PDT during `/gsd-t-partition M55`. Charter: `.gsd-t/charters/m55-charter.md`.

## Domains

| Domain | Wave | Owns | Depends on |
|--------|------|------|-----------|
| D1 m55-d1-state-precondition-library | 1 | `bin/cli-preflight.cjs` + 6 checks | nothing (independent) |
| D3 m55-d3-ratelimit-probe-map | 1 | `bin/gsd-t-ratelimit-probe.cjs` + `.gsd-t/ratelimit-map.json` | nothing (independent) |
| D4 m55-d4-context-brief-generator | 1 | `bin/gsd-t-context-brief.cjs` + 6 kinds + brief contract | nothing internal (D1 optional) |
| D2 m55-d2-parallel-cli-substrate | 2 | `bin/parallel-cli.cjs` + tee helper + proof CLI | D3's map (calibration) |
| D5 m55-d5-verify-gate-and-wirein | 3 | `bin/gsd-t-verify-gate.cjs` + wire-ins + 3 SC3 e2e specs | D1, D2, D4 |

## File-Disjointness (manual proof)

```
D1: bin/cli-preflight.cjs, bin/cli-preflight-checks/*, test/m55-d1-*
D2: bin/parallel-cli.cjs, bin/parallel-cli-tee.cjs, bin/m55-substrate-proof.cjs, test/m55-d2-*
D3: bin/gsd-t-ratelimit-probe.cjs, bin/gsd-t-ratelimit-probe-worker.cjs, .gsd-t/fixtures/ratelimit-probe/*,
    .gsd-t/ratelimit-map.json, .gsd-t/contracts/ratelimit-map-contract.md, test/m55-d3-*
D4: bin/gsd-t-context-brief.cjs, bin/gsd-t-context-brief-kinds/*, .gsd-t/briefs/.gitignore,
    .gsd-t/contracts/context-brief-contract.md, test/m55-d4-*
D5: bin/gsd-t-verify-gate.cjs, bin/gsd-t-verify-gate-judge.cjs,
    commands/gsd-t-execute.md, commands/gsd-t-verify.md, commands/gsd-t-help.md,
    bin/gsd-t.js (additive subcommand dispatch + GLOBAL_BIN_TOOLS),
    templates/prompts/{qa,red-team,design-verify}-subagent.md,
    docs/architecture.md, docs/requirements.md, CLAUDE.md, templates/CLAUDE-global.md, GSD-T-README.md,
    .gsd-t/contracts/verify-gate-contract.md,
    e2e/journeys/verify-gate-blocks-*.spec.ts, .gsd-t/journey-manifest.json,
    test/m55-d5-*
```

No path overlap across the five sets. `.gsd-t/contracts/cli-preflight-contract.md` is owned by D1; `parallel-cli-contract.md` by D2; `ratelimit-map-contract.md` by D3; `context-brief-contract.md` by D4; `verify-gate-contract.md` by D5.

`bin/gsd-t.js` is touched ONLY by D5 in this milestone (additive subcommand dispatch). D1/D3/D4 deliverables expose CLIs as standalone `node bin/X.cjs`; the `gsd-t X` wrapper is wired by D5.

## Wave Plan

```
Wave 1 (parallel):  D1 + D3 + D4    (file-disjoint, no internal deps)
                       ↓
                       D3 emits .gsd-t/ratelimit-map.json
                       D1 emits bin/cli-preflight.cjs + contract STABLE
                       D4 emits bin/gsd-t-context-brief.cjs + contract STABLE
                       ↓
Wave 2:             D2                (calibration data from D3 lands; substrate ships)
                       ↓
                       D2 emits bin/parallel-cli.cjs + contract STABLE + proof CLI
                       ↓
Wave 3:             D5                (consumes D1, D2, D4; reads D3 map)
                       ↓
                       D5 emits bin/gsd-t-verify-gate.cjs + 3 SC3 e2e specs + all wire-ins + doc ripple
                       ↓
Post-wave:          Red Team → test-sync → integrate → verify (dogfoods D5) → measurement → complete-milestone
```

## Checkpoints

| ID | Description | Blocks |
|----|-------------|--------|
| C1 | D1 publishes `.gsd-t/contracts/cli-preflight-contract.md` v1.0.0 STABLE + `bin/cli-preflight.cjs` shipped + ≥6 unit tests pass | D5 wave-3 start |
| C2 | D3 publishes `.gsd-t/ratelimit-map.json` (real sweep) + `.gsd-t/contracts/ratelimit-map-contract.md` v1.0.0 STABLE | D2 default-concurrency calibration; D5 maxConcurrency selection |
| C3 | D4 publishes `.gsd-t/contracts/context-brief-contract.md` v1.0.0 STABLE + `bin/gsd-t-context-brief.cjs` shipped + ≥6 unit tests pass | D5 wave-3 start |
| C4 | D2 publishes `.gsd-t/contracts/parallel-cli-contract.md` v1.0.0 STABLE + `bin/parallel-cli.cjs` shipped + proof CLI demonstrates ≥3× speedup | D5 wave-3 start (verify-gate Track 2 fans out via D2) |
| C5 | D5 ships verify-gate library + all wire-ins + 3 SC3 e2e specs + manifest entries | Red Team adversarial QA |
| C6 | Red Team GRUDGING PASS — ≥5 broken patches caught | complete-milestone |

## Cross-Domain Surfaces (data-flow, NOT file-overlap)

| Surface | Producer | Consumer | Mechanism |
|---------|----------|----------|-----------|
| `runPreflight()` API | D1 | D5 | `require('../bin/cli-preflight.cjs')` |
| `runParallel()` API | D2 | D5 | `require('../bin/parallel-cli.cjs')` |
| `generateBrief()` API | D4 | D5 | `require('../bin/gsd-t-context-brief.cjs')` |
| `.gsd-t/ratelimit-map.json` | D3 | D2 + D5 | filesystem read (data-only, no code dep) |
| `.gsd-t/briefs/{spawn-id}.json` | D4 (lib) → D5 (commands invoke CLI) | execute/qa/red-team/design-verify subagents | filesystem path passed in env |
| `cli-preflight-contract.md` schema | D1 | D5 | doc reference + lib import |
| `context-brief-contract.md` schema | D4 | D5 | doc reference + lib import |
| `ratelimit-map-contract.md` schema | D3 | D2 + D5 | doc reference |
| `parallel-cli-contract.md` schema | D2 | D5 | doc reference + lib import |
| `verify-gate-contract.md` schema | D5 | (M55 leaf — no internal consumer) | doc reference |

## Contract State (at partition close)

| Contract | State at partition | Owner |
|----------|-------------------|-------|
| `cli-preflight-contract.md` | (will be created) PROPOSED → STABLE during D1 execute | D1 |
| `parallel-cli-contract.md` | (will be created) PROPOSED → STABLE during D2 execute | D2 |
| `ratelimit-map-contract.md` | (will be created) PROPOSED → STABLE during D3 execute | D3 |
| `context-brief-contract.md` | (will be created) PROPOSED → STABLE during D4 execute | D4 |
| `verify-gate-contract.md` | (will be created) PROPOSED → STABLE during D5 execute | D5 |

## Out of Scope (re-iterated from charter)

- Rewriting all 55 command files to call the substrate directly (separate ratchet milestone)
- Cross-project preflight/brief propagation via `gsd-t update-all` (follow-up)
- Replacing `bin/gsd-t-worker-dispatch.cjs` or `bin/gsd-t-unattended.cjs` with the substrate (those are unattended-mode supervisors, distinct surface)
