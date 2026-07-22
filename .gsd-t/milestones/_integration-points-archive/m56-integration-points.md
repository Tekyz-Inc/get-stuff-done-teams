# M56 Integration Points

## Status: PARTITIONED — 2026-05-09 19:38 PDT

## Wave Plan (file-disjoint, parallel-safe)

### Wave 1 (parallel — 4 domains)
- **D1** m56-d1-verify-gate-native-cli-workers (independent)
- **D2** m56-d2-upper-stage-brief-kinds (independent)
- **D4** m56-d4-quick-debug-wirein (independent — kinds already shipped in M55 D4)
- **D5** m56-d5-stream-json-universality-lint (independent)

### Wave 2 (after D2)
- **D3** m56-d3-upper-stage-command-wirein — REQUIRES D2's 5 new kinds to be registered

### Wave 3 (verify)
- All-domain Red Team adversarial QA + SC1-SC7 measurement + dogfood verify-gate

## Cross-Domain Dependencies

### D3 ← D2
- **What**: D3's wire-ins call `gsd-t brief --kind {partition|plan|discuss|impact|milestone}`. D2 must publish those kinds first or D3's `gsd-t brief` invocations fail at runtime.
- **Checkpoint C1**: D2 publishes 5 new kinds in `KIND_REGISTRY` + their resolvers + tests green → unblocks D3 wire-in tasks.
- **Verification**: D3's first task is a marker-presence test (TDD red); D3 runs `gsd-t brief --kind partition --domain m56-d1 --out /tmp/test.json` against D2's published kinds before writing any wire-in block.

### SC4 ← D5
- **What**: M56 SC4 (lint blocks deliberately broken commit dropping `--output-format stream-json`) is verified by Red Team. D5 must complete + tests green before Red Team runs.
- **Checkpoint C2**: D5 publishes lint rule + tests pass → unblocks Red Team SC4 attack.

### SC5 ← D1
- **What**: M55 SC4 retroactive closure requires M56 to record `M55-baseline-tokens` and `M56-actual-tokens`. D1 owns the baseline+actual JSON files and the CHANGELOG delta entry.
- **Checkpoint C3**: D1 writes `.gsd-t/metrics/m56-token-baseline.json` with both numbers + CHANGELOG `[3.26.10]` block references the delta → unblocks complete-milestone.

### SC1 ← D1
- **What**: Verify wall-clock < M55's 34s. D1's native CLI worker fan-out is the speedup vector.
- **Checkpoint C4**: D1 writes `.gsd-t/metrics/m56-verify-gate-wallclock.json` with measured time < 34s → unblocks verify report.

## File-Disjointness Verification

| File | D1 | D2 | D3 | D4 | D5 |
|------|----|----|----|----|----|
| `bin/gsd-t-verify-gate.cjs` | ✓ | | | | |
| `bin/gsd-t-context-brief.cjs` | | ✓ | | | |
| `bin/gsd-t.js` | | | | | ✓ (line ~3879 only) |
| `bin/gsd-t-parallel.cjs` | | | | | ✓ (line ~378 only) |
| `bin/gsd-t-ratelimit-probe-worker.cjs` | | | | | ✓ (line ~89 only) |
| `bin/gsd-t-capture-lint.cjs` | | | | | ✓ |
| `commands/gsd-t-partition.md` | | | ✓ | | |
| `commands/gsd-t-plan.md` | | | ✓ | | |
| `commands/gsd-t-discuss.md` | | | ✓ | | |
| `commands/gsd-t-impact.md` | | | ✓ | | |
| `commands/gsd-t-milestone.md` | | | ✓ | | |
| `commands/gsd-t-quick.md` | | | | ✓ | |
| `commands/gsd-t-debug.md` | | | | ✓ | |
| `scripts/hooks/pre-commit-capture-lint` | | | | | ✓ |
| `.gsd-t/metrics/m56-token-baseline.json` | ✓ (new) | | | | |
| `.gsd-t/metrics/m56-verify-gate-wallclock.json` | ✓ (new) | | | | |

**Pairwise disjoint**: ✓ confirmed. No file is owned by 2+ domains.

## Risk Notes

- **D5 scope discipline**: surgical-only edit to 3 named lines in 3 files. Any temptation to "while I'm here" refactor must be resisted — it would create cross-domain conflict and regress the file-disjoint plan.
- **D2 token-cap discipline**: ≤2,500 token cap per brief is a hard invariant. Failure mode is silent over-cap (brief grows, token reduction SC2 unmeasurable). D2 tests must measure cap, not assume it.
- **D1 envelope-shape discipline**: `runVerifyGate` v1.0.0 envelope is STABLE. D1 adds Track 2 entries within the envelope, NEVER changes the top-level shape.

## Charter Reference
- progress.md M56 row (DEFINED entry)
- Pause snapshot: `.gsd-t/continue-here-*.md` (Open Items section, D5 added 19:23 PDT)
- `~/.claude/CLAUDE.md` Brief-First Worker Rule + Mandatory Preflight + Two-Track Verify-Gate sections (M55 inheritance)
