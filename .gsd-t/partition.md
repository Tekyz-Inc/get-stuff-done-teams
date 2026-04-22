# M44 Partition — Cross-Domain & Cross-Task Parallelism (in-session AND unattended)

**Status**: PARTITIONED
**Date**: 2026-04-22
**Target version**: 3.18.10
**Domains**: 7 (D1 task-graph-reader · D2 parallel-cli · D3 command-file-integration · D4 depgraph-validation · D5 file-disjointness-prover · D6 pre-spawn-economics · D7 per-cw-attribution)
**Waves**: 3 (Foundation → Gates → Integration)
**Rationale source**: M44 scope 2026-04-22 (mode-aware parallelism; see `.gsd-t/progress.md` M44 "Current Milestone" + backlog #14).

## Theme Split

- **Layer 1 — Parallel `claude -p` worker spawns**: primary lever for both modes. K workers each with a clean CW. For [unattended], this is the compaction-elimination mechanism — slicing work into smaller per-worker pieces that never approach the CW ceiling. For [in-session], it is primarily a wall-clock reducer. D2 delivers the CLI wrapping M40 orchestrator; D3 wires it into the command files.
- **Layer 2 — Parallel tasks within one worker**: weaker lever, bounded by one CW. Used when L1 isn't economic (small tasks, shared context). Same disjointness/economics gates apply at sub-iter granularity. This layer is part of D2's `--mode in-session` path.

**Mode contracts (NON-NEGOTIABLE)**:
- **[in-session]** Speed + reduce compaction as much as possible. Hard rule: NEVER throw an interactive pause/resume prompt. Silent compaction is acceptable; demanding user attention is not.
- **[unattended]** Zero compaction across an autonomous M1 → M10 run. Per-worker CW headroom is the binding gate. Speed is a side-benefit. Supervisor (Node, no CW) orchestrates `claude -p` workers.

## Domains

### D1 — m44-d1-task-graph-reader
**Responsibility**: parse `.gsd-t/domains/*/tasks.md` and cross-domain dependency declarations; emit a validated DAG of independently-executable task slices. Mode-agnostic.
**Full detail**: `.gsd-t/domains/m44-d1-task-graph-reader/{scope,constraints,tasks}.md`.

### D2 — m44-d2-parallel-cli
**Responsibility**: new `gsd-t parallel` subcommand wrapping M40 orchestrator with task-level (not just domain-level) parallelism. Honors `--mode in-session|unattended` flag (or auto-detects from caller). Both modes. Consumes D1 DAG, D4 dep-gate, D5 disjointness-gate, D6 economics gate.
**Full detail**: `.gsd-t/domains/m44-d2-parallel-cli/{scope,constraints,tasks}.md`.

### D3 — m44-d3-command-file-integration
**Responsibility**: `gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick`, `gsd-t-debug`, `gsd-t-integrate` learn to consume the task-graph via D2 CLI and dispatch parallel workers. Both modes. Depends on D2's stable CLI surface.
**Full detail**: `.gsd-t/domains/m44-d3-command-file-integration/{scope,constraints,tasks}.md`.

### D4 — m44-d4-depgraph-validation
**Responsibility**: pre-spawn validator that confirms task dependencies are honored before fan-out; refuses to spawn tasks whose dependencies have not completed. Mode-agnostic. Read-only against task state artifacts.
**Full detail**: `.gsd-t/domains/m44-d4-depgraph-validation/{scope,constraints,tasks}.md`.

### D5 — m44-d5-file-disjointness-prover
**Responsibility**: walk each task's expected-touch list against every other concurrent task's list; prove no shared write targets before parallel spawn. Falls back to sequential when unprovable. Sources: domain `scope.md`, prior commit history for similar tasks, optional explicit `touches:` field on task stubs. Mode-agnostic.
**Full detail**: `.gsd-t/domains/m44-d5-file-disjointness-prover/{scope,constraints,tasks}.md`.

### D6 — m44-d6-pre-spawn-economics
**Responsibility**: query `.gsd-t/metrics/token-usage.jsonl` for prior-similar-task token cost (matches by command + step + domain); estimate per-worker CW footprint; decide parallel-vs-sequential. Mode-aware: feeds [in-session] orchestrator-CW gate vs [unattended] per-worker-CW gate. Calibrated against the 525-row + 72-event corpus.
**Full detail**: `.gsd-t/domains/m44-d6-pre-spawn-economics/{scope,constraints,tasks}.md`.

### D7 — m44-d7-per-cw-attribution
**Responsibility**: ensure every spawn (parallel or sequential) tags its token-usage rows with `cw_id` so the per-CW rollup keeps working post-M44. Wire the existing `scripts/gsd-t-compact-detector.js` hook output into the supervisor's "we failed to prevent compaction" signal for [unattended] estimator calibration.
**Full detail**: `.gsd-t/domains/m44-d7-per-cw-attribution/{scope,constraints,tasks}.md`.

## Wave Plan

### Wave 1 — Foundation

| Domain | Parallel-safe? | Notes |
|--------|----------------|-------|
| D1 task-graph-reader | Yes — new library, no shared-write conflicts | Parses tasks.md + cross-domain deps → DAG. D2, D4, D5, D6 all consume the DAG object. Lands first. |
| D7 per-cw-attribution | Yes — owns `cw_id` field pass-through in token-capture | Foundation because D6's estimator and the post-spawn calibration loop both require `cw_id`-tagged rows. Touches only `bin/gsd-t-token-capture.cjs` (unique owner). |

**Gate to Wave 2**: D1 emits a well-formed DAG from a synthetic 2-task fixture; D7 `cw_id` pass-through lands in `bin/gsd-t-token-capture.cjs` and rows in `.gsd-t/metrics/token-usage.jsonl` include the field.

### Wave 2 — Gates (parallel-safe)

| Domain | Parallel-safe? | Depends on |
|--------|----------------|-----------|
| D4 dep-graph validation | Yes — new library, reads DAG + task-state artifacts | D1 (DAG emitter) |
| D5 file-disjointness prover | Yes — new library, reads scope.md + git history | D1 (task touch-list field) |
| D6 pre-spawn economics estimator | Yes — new library, reads D7-tagged token-usage.jsonl | D1 (DAG), D7 (cw_id-tagged rows for calibration corpus) |

All three are pre-spawn safety gates and purely read-only against existing artifacts. None touches command files or the orchestrator's execution path — safe to run in parallel.

**Gate to Wave 3**: D4 + D5 gates exercised end-to-end against a synthetic 2-task fixture; D6 estimator produces a decision against a real D7-tagged dataset slice (at minimum: the existing 525-row corpus now enriched with `cw_id`).

### Wave 3 — Integration (D2 first, then D3)

| Domain | Parallel-safe? | Notes |
|--------|----------------|-------|
| D2 `gsd-t parallel` CLI | Runs FIRST in Wave 3 (not parallel with D3) | Wires D1 DAG + D4/D5/D6 gates + M40 orchestrator extensions into the new `parallel` subcommand. Also extends `bin/gsd-t-orchestrator-config.cjs` with mode-aware gating math. Must be stable before D3 can call it. |
| D3 command-file integration | Runs AFTER D2 lands | Edits `commands/gsd-t-{execute,wave,quick,debug,integrate}.md` to dispatch via `gsd-t parallel`. D3 depends on D2's CLI surface being stable. |

**No within-Wave-3 parallelism**: D3 starts only after D2's gate passes.

## Shared Files & Conflict Map

| File | Owner | Notes |
|------|-------|-------|
| `bin/gsd-t-orchestrator.js` | **D2** (parallel subcommand wiring) | D6 callsite for gating math is via the config module, not inline |
| `bin/gsd-t-orchestrator-config.cjs` | **D2** (mode-aware gating math) + **D6** (estimator callsite) | D6 passes estimator result object into config; D2 owns the config file. Both touch different logical sections — D6 adds an `estimateTaskFootprint()` import, D2 adds the in-session orchestrator-CW headroom block. D6 lands in Wave 2 and leaves a clean extension point; D2 completes the wiring in Wave 3. |
| `commands/gsd-t-execute.md` | **D3** only | D3 owns the integration block in all 5 command files |
| `commands/gsd-t-wave.md` | **D3** only | |
| `commands/gsd-t-quick.md` | **D3** only | |
| `commands/gsd-t-debug.md` | **D3** only | |
| `commands/gsd-t-integrate.md` | **D3** only | |
| `bin/gsd-t-token-capture.cjs` | **D7** only | Adds optional `cw_id` field to the row writer and pass-through. No other domain touches this file in M44. |
| `.gsd-t/contracts/wave-join-contract.md` | **D2** owns the bump | Mode-aware gating math addition (v1.0.0 → v1.1.0) |
| `.gsd-t/contracts/metrics-schema-contract.md` | **D7** owns the bump | Adds optional `cw_id` field (v2 → v2.1.0) |
| `.gsd-t/contracts/compaction-events-contract.md` | **D7** owns the bump | Post-spawn calibration loop wiring (v1.0.0 → v1.1.0) |
| `.gsd-t/contracts/headless-default-contract.md` | **D2 + D3 read-only** | Neither bumps unless adding required behavior; the v2.0.0 contract from M43 D4 covers the always-headless invariant and does not need revision for parallelism |
| `bin/gsd-t-orchestrator-recover.cjs` | **D2 read-only** | Recovery semantics unchanged; D2 reads to understand resume surface |

## Integration Points

**Post-Wave-2** (before Wave 3 starts):
- D6 estimator runs `estimateTaskFootprint()` against a real D7-tagged dataset slice from the 525-row corpus enriched with `cw_id`. Assert: returns a decision object with fields `parallelOk`, `estimatedCwPct`, `workerCount`, `mode`. Fixture: simulate a "domain=execute, step=Wave 1" lookup.
- D4 + D5 gates exercised end-to-end against a synthetic 2-task fixture: two task stubs, one with declared dep on the other, one with overlapping file in touch-list. Assert D4 rejects the out-of-order request; assert D5 falls back to sequential for the overlapping pair.

**Post-Wave-3** (before `/gsd-t-integrate`):
- **In-session smoke test**: invoke `gsd-t-execute` against a small multi-domain fixture using the new `parallel` path (`--mode in-session`). Assert wall-clock ≤ T/2 vs sequential baseline for a known fixture, AND zero pause/resume prompts appear in the event stream.
- **Unattended smoke test**: invoke `gsd-t unattended` with a multi-task milestone configuration and `--max-iterations 5`. Assert: (a) every worker completes without compaction — zero entries added to `.gsd-t/metrics/compactions.jsonl` during the run window, (b) D7 `cw_id` tags are present in all new token-usage rows emitted during the run.

## Skipped Partition Steps (with rationale)

- **Step 1.5 Assumption Audit**: D6 has external-dataset reference disposition (the 525-row `.gsd-t/metrics/token-usage.jsonl` calibration corpus + 72-event `.gsd-t/metrics/compactions.jsonl`). These are living files in the repo, not external service dependencies — disposition is "read as calibration input, document known-failure modes in the economics-estimator-contract." D1–D5, D7 inherit framework-internal references only. No external unlocks needed.
- **Step 1.6 Consumer Surface**: N/A (GSD-T is a framework package; the consumer surface is the command files and the `gsd-t parallel` CLI which are both internal).
- **Step 3.5 Design Brief**: N/A (no UI surface; all new surfaces are CLI and JSONL).
- **Step 3.6 Design Contract**: N/A (same reason as 3.5).

## Execution Order (supervisor / solo)

1. **Wave 1** — D1 + D7 in parallel (both Wave-1-safe, disjoint file ownership).
2. **Wave 1 gate** — D1 DAG emits cleanly + D7 `cw_id` field confirmed in token-capture.
3. **Wave 2** — D4 + D5 + D6 in parallel (all read-only against existing artifacts, no shared writes).
4. **Wave 2 gate** — D4/D5 synthetic fixture gates pass + D6 produces a decision from real corpus slice.
5. **Wave 3, step 1** — D2 alone (extends orchestrator + config; lands `gsd-t parallel` CLI; bumps wave-join-contract v1.1.0).
6. **Wave 3, step 2** — D3 alone (edits 5 command files to dispatch via D2).
7. **Wave 3 gate** — in-session + unattended smoke tests above pass.
8. `/gsd-t-integrate` → `/gsd-t-verify` → auto-invokes `/gsd-t-complete-milestone` → tag v3.18.10.
9. `npm publish` → `/gsd-t-version-update-all`.

## Known Blockers

None currently. All M44 pre-reqs landed:
- Q1 token-log regen (`7eefd2c`)
- Q2a compaction detector + scanner (`940e5a8` / `f7de324`)
- Q2b compact_marker frame + visualizer badge (`8abe4ef`)
- Q3 turn→tool join fix (`8f4588b`)
- Optimization report generator (`b5edff2`)
- Adaptive maxParallel (`969462a`)

Calibration corpus exists and is stable: `.gsd-t/metrics/token-usage.jsonl` (525 rows) + `.gsd-t/metrics/compactions.jsonl` (72 events) + `.gsd-t/reports/token-usage-2026-04-22.md` (per-CW rollup).

Note: D7 `cw_id` enrichment of the existing corpus is a post-Wave-1 step — the 525 historical rows will not gain `cw_id` retroactively (backfill is out of scope); D6 calibration uses the subset of rows that carry `cw_id` from new spawns + a fallback to per-iter median for rows without it.
