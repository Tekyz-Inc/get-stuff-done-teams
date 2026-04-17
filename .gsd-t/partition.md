# M39 Partition — Fast Unattended + Universal Watch-Progress Tree

**Status**: PARTITIONED
**Date**: 2026-04-17
**Target version**: 3.13.10
**Domains**: 3 (D2 progress-watch, D3 parallel-exec, D4 cache-warm-pacing)
**Waves**: 1 (all three domains parallel)
**Rationale source**: domain breakdown pre-decided by user during milestone definition — executing as specified (see `.gsd-t/progress.md` M39 "Scope — included" section).

## Domains

### D2 — progress-watch

**Responsibility**: universal task-list view under every `--watch` surface. State-file-driven tree builder + renderer + shims in ~17 workflow command files.

**Owned files** (summary):
- NEW `bin/watch-progress.js`
- NEW `scripts/gsd-t-watch-state.js`
- NEW `.gsd-t/.watch-state/` (gitignored)
- Shims in 17 workflow command files (additive bash one-liners per numbered Step)
- Integration points: `bin/gsd-t-unattended.cjs` watch printer, `bin/unattended-watch-format.cjs`, `bin/headless-auto-spawn.cjs` autoSpawnHeadless watch fallback (append below existing banner; banner preserved)
- NEW `test/watch-progress.test.js`
- NEW `.gsd-t/contracts/watch-progress-contract.md` v1.0.0
- `.gitignore` update

Full detail: `.gsd-t/domains/d2-progress-watch/{scope,constraints}.md`.

### D3 — parallel-exec

**Responsibility**: teach unattended worker Team Mode for multi-domain waves (cap 15 parallel subagents intra-wave, sequential inter-wave; single-domain waves sequential).

**Owned files**:
- EDIT `bin/gsd-t-unattended.cjs::_spawnWorker` (~lines 1120–1145) — worker prompt text.
- EDIT `.gsd-t/contracts/unattended-supervisor-contract.md` — ADD §15 "Worker Team Mode (v1.3.0)".
- NEW `test/unattended-worker-team-mode.test.js`.

Full detail: `.gsd-t/domains/d3-parallel-exec/{scope,constraints}.md`.

### D4 — cache-warm-pacing

**Responsibility**: supervisor pacing — 270s worker timeout keeps iter inside the 5-min Anthropic prompt-cache TTL.

**Owned files**:
- EDIT `bin/gsd-t-unattended.cjs` main relay loop (~lines 861–939) — worker timeout default 270s + inline cache-window rationale.
- EDIT `.gsd-t/contracts/unattended-supervisor-contract.md` — ADD §16 "Cache-Warm Pacing (v1.3.0)".
- NEW `test/unattended-cache-warm-pacing.test.js`.

Full detail: `.gsd-t/domains/d4-cache-warm-pacing/{scope,constraints}.md`.

## Wave Plan

### Wave 1 — all three domains parallel

| Domain | Owner | Parallel-safe? |
|--------|-------|----------------|
| D2 progress-watch | d2-progress-watch | Yes — touches 17 workflow command files (additive shims) + 3 watch-printer call sites (additive render) + new files. No overlap with D3/D4 targets. |
| D3 parallel-exec | d3-parallel-exec | Yes — edits `_spawnWorker` prompt text + `unattended-supervisor-contract.md` §15 (additive). |
| D4 cache-warm-pacing | d4-cache-warm-pacing | Yes — edits supervisor main relay loop timeout + `unattended-supervisor-contract.md` §16 (additive). |

**Shared file note**: D3 and D4 both edit `bin/gsd-t-unattended.cjs` and `unattended-supervisor-contract.md`, but in disjoint regions:

- `bin/gsd-t-unattended.cjs`: D3 edits `_spawnWorker` prompt (~lines 1120–1145); D4 edits main relay loop (~lines 861–939). Non-overlapping line ranges.
- `unattended-supervisor-contract.md`: D3 appends §15; D4 appends §16. Non-overlapping additive sections. Version bump to v1.3.0 is a single-line change; whichever domain's edit lands second picks up the bump if not already applied.

No Wave 2. No inter-wave gate.

## Integration Point (single, minor)

After all three domains land:

- **Smoke test**: run `/gsd-t-quick --watch` in this repo. Verify the task list renders under the existing banner. Verify the banner is preserved intact.

bee-poc parallel-unattended verification is post-release — not in M39 scope.

## Skipped Partition Steps (with rationale)

- **Step 1.5 Assumption Audit**: skipped. All assumptions locked in the milestone definition (see `.gsd-t/progress.md` M39 section). No external references, no ambiguous intent, no new black boxes.
- **Step 1.6 Consumer Surface**: skipped. GSD-T is a framework/CLI package, not a multi-surface app.
- **Step 3.5 Design Brief**: skipped. No UI in this milestone.
- **Step 3.6 Design Contract**: skipped. No UI in this milestone.

## Execution Order (solo mode)

1. Wave 1: D2 + D3 + D4 all runnable in parallel. In a solo agent session, run them sequentially in any order — D2 first (largest surface, lowest risk) is the recommended order, but the wave graph imposes no constraint.
2. After all three land: smoke test `/gsd-t-quick --watch`. Verify banner preserved + task list renders below.
3. `/gsd-t-verify` → auto-invokes `/gsd-t-complete-milestone`.
4. User-gated: `npm publish` v3.13.10 → `gsd-t update-all`.
