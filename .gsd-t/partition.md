# M55 Partition — CLI-Preflight + Parallel Substrate + Rate-Limit Map + Context Briefs + Verify Gate

**Status**: PARTITIONED
**Date**: 2026-05-09
**Target version**: 3.24.10 → 3.25.10 (planned)
**Domains**: 5 (D1 state-precondition-library · D2 parallel-cli-substrate · D3 ratelimit-probe-map · D4 context-brief-generator · D5 verify-gate-and-wirein)
**Waves**: 3 (Wave 1 parallel — D1 + D3 + D4 · Wave 2 — D2 · Wave 3 — D5)
**Charter source**: `.gsd-t/charters/m55-charter.md` (merged scope, authored 2026-05-09 15:30 PDT)
**Standing directive**: execute through to COMPLETED autonomously; only stop for destructive action, unrecoverable error after 2 fix attempts + debug-loop exit 4, or measurement criteria failure (recalibrate and continue, do not tag).

## Theme

Lift the practical parallelism ceiling from ~3 LLM workers to ~6–10 mixed workers (1 LLM judge + N CLIs) by replacing deterministic LLM work with deterministic CLI work, AND gate every spawn with deterministic state-precondition checks. Prove via empirical measurement (8 falsifiable success criteria — see charter).

Two pain patterns merged: (A) silent-skip regressions from M48/M49/M50/M52 retrofit hooks; (B) Claude rate-limit ceiling at ~3 parallel workers from undocumented ITPM cap.

## Domains

### D1 — m55-d1-state-precondition-library
**Owns**: `bin/cli-preflight.cjs`, `bin/cli-preflight-checks/*.cjs` (6 checks), `.gsd-t/contracts/cli-preflight-contract.md` v1.0.0 STABLE, `test/m55-d1-cli-preflight.test.js`.
**Detail**: see `.gsd-t/domains/m55-d1-state-precondition-library/scope.md` + `constraints.md`.

### D2 — m55-d2-parallel-cli-substrate
**Owns**: `bin/parallel-cli.cjs`, `bin/parallel-cli-tee.cjs`, `bin/m55-substrate-proof.cjs`, `test/m55-d2-parallel-cli.test.js`, `.gsd-t/contracts/parallel-cli-contract.md` v1.0.0 STABLE.
**Detail**: see `.gsd-t/domains/m55-d2-parallel-cli-substrate/scope.md` + `constraints.md`.

### D3 — m55-d3-ratelimit-probe-map
**Owns**: `bin/gsd-t-ratelimit-probe.cjs`, `bin/gsd-t-ratelimit-probe-worker.cjs`, `.gsd-t/fixtures/ratelimit-probe/*` (4 size buckets), `.gsd-t/ratelimit-map.json` (artifact), `.gsd-t/contracts/ratelimit-map-contract.md` v1.0.0 STABLE, `test/m55-d3-ratelimit-probe.test.js`.
**Detail**: see `.gsd-t/domains/m55-d3-ratelimit-probe-map/scope.md` + `constraints.md`.

### D4 — m55-d4-context-brief-generator
**Owns**: `bin/gsd-t-context-brief.cjs`, `bin/gsd-t-context-brief-kinds/*.cjs` (6 kinds), `.gsd-t/briefs/` (gitignored output dir), `.gsd-t/contracts/context-brief-contract.md` v1.0.0 STABLE, `test/m55-d4-context-brief.test.js`.
**Detail**: see `.gsd-t/domains/m55-d4-context-brief-generator/scope.md` + `constraints.md`.

### D5 — m55-d5-verify-gate-and-wirein
**Owns**: `bin/gsd-t-verify-gate.cjs`, `bin/gsd-t-verify-gate-judge.cjs`, additive edits to `bin/gsd-t.js` (3 dispatch subcommands + `GLOBAL_BIN_TOOLS`), additive edits to `commands/gsd-t-execute.md` (Step 1) + `commands/gsd-t-verify.md` (Step 2), additive edits to `templates/prompts/{qa,red-team,design-verify}-subagent.md`, full doc ripple (architecture, requirements, project CLAUDE, help, GSD-T-README, CLAUDE-global template), `.gsd-t/contracts/verify-gate-contract.md` v1.0.0 STABLE, 3 e2e journey specs covering success-criterion-3, 4 test files (verify-gate + 3 wire-in assertions), Pre-Commit Gate addition.
**Detail**: see `.gsd-t/domains/m55-d5-verify-gate-and-wirein/scope.md` + `constraints.md`.

## Shared Files & Conflict Map

| File | Owner | Notes |
|------|-------|-------|
| `bin/cli-preflight.cjs` + `bin/cli-preflight-checks/*` | **D1 only** (new) | |
| `bin/parallel-cli.cjs` + `bin/parallel-cli-tee.cjs` + `bin/m55-substrate-proof.cjs` | **D2 only** (new) | |
| `bin/gsd-t-ratelimit-probe.cjs` + worker | **D3 only** (new) | |
| `bin/gsd-t-context-brief.cjs` + kinds | **D4 only** (new) | |
| `bin/gsd-t-verify-gate.cjs` + judge | **D5 only** (new) | |
| `bin/gsd-t.js` | **D5 only** (additive — 3 dispatch entries + `GLOBAL_BIN_TOOLS`) | D1/D2/D3/D4 do NOT touch |
| `commands/gsd-t-execute.md` | **D5 only** (additive Step 1 block) | |
| `commands/gsd-t-verify.md` | **D5 only** (additive Step 2 block) | |
| `templates/prompts/qa-subagent.md` | **D5 only** (additive line) | |
| `templates/prompts/red-team-subagent.md` | **D5 only** (additive line) | |
| `templates/prompts/design-verify-subagent.md` | **D5 only** (additive line) | |
| `docs/architecture.md` | **D5 only** (CLI-Preflight Pattern section) | |
| `docs/requirements.md` | **D5 only** (REQ-M55-D1..D5 entries) | |
| `CLAUDE.md` (project) | **D5 only** (additive sections) | |
| `commands/gsd-t-help.md` | **D5 only** (3 new entries) | |
| `GSD-T-README.md` | **D5 only** (workflow + CLI table) | |
| `templates/CLAUDE-global.md` | **D5 only** (preflight/brief/verify-gate documentation) | |
| `.gsd-t/contracts/cli-preflight-contract.md` | **D1 only** (new v1.0.0 STABLE) | D5 confirms STABLE flip during wire-in |
| `.gsd-t/contracts/parallel-cli-contract.md` | **D2 only** (new v1.0.0 STABLE) | D5 confirms STABLE flip during wire-in |
| `.gsd-t/contracts/ratelimit-map-contract.md` | **D3 only** (new v1.0.0 STABLE) | |
| `.gsd-t/contracts/context-brief-contract.md` | **D4 only** (new v1.0.0 STABLE) | |
| `.gsd-t/contracts/verify-gate-contract.md` | **D5 only** (new v1.0.0 STABLE) | |
| `.gsd-t/ratelimit-map.json` | **D3 only** (artifact write) | D5 reads at wire-in (consume-only) |
| `.gsd-t/fixtures/ratelimit-probe/*` | **D3 only** (new) | |
| `.gsd-t/briefs/` | **D4 only** (new gitignored dir) | |
| `e2e/journeys/verify-gate-blocks-*.spec.ts` | **D5 only** (new, 3 specs) | |
| `test/m55-d1-*.test.js` | **D1 only** (new) | |
| `test/m55-d2-*.test.js` | **D2 only** (new) | |
| `test/m55-d3-*.test.js` | **D3 only** (new) | |
| `test/m55-d4-*.test.js` | **D4 only** (new) | |
| `test/m55-d5-*.test.js` | **D5 only** (new, 4 files) | |

**File-disjointness**: Confirmed. D1, D2, D3, D4 all touch entirely-new directories or new files. D5 is the integration domain — every multi-domain touch lands in D5's wave (Wave 3) when D1/D2/D4 have already shipped, eliminating shared-write race.

## Domain Dependency Graph

```
D1 (state checks)        ← independent, can start anytime
D3 (ratelimit probe)     ← independent, can start anytime
                              ↓ produces ratelimit-map.json (artifact)
D4 (context briefs)      ← independent of D1/D2/D3 internals
D2 (parallel substrate)  ← consumes D3's map at recommend-defaults time (operator-mediated)
D5 (verify-gate + wire)  ← depends on D1, D2, D4
                              (consumes D3's map defensively at wire-in)
```

## Wave Plan

**Wave 1 — D1 + D3 + D4 in parallel** (file-disjoint, no internal deps):
- D1 ships `bin/cli-preflight.cjs` + 6 checks + contract STABLE
- D3 ships `bin/gsd-t-ratelimit-probe.cjs` + fixtures + contract STABLE + the populated `.gsd-t/ratelimit-map.json` artifact (one-shot ~140k spend)
- D4 ships `bin/gsd-t-context-brief.cjs` + 6 kinds + contract STABLE

**Wave 2 — D2** (after D3's map is on disk for calibration reference):
- D2 ships `bin/parallel-cli.cjs` + tee + proof CLI + contract STABLE
- Initial concurrency defaults are conservative (`maxConcurrency=2`); D5 retunes from D3's map at wire-in time

**Wave 3 — D5** (after D1, D2, D4 — all engines shipped):
- D5 wires verify-gate + execute Step 1 + verify Step 2 + subagent protocols + dispatch + full doc ripple
- D5 confirms STABLE flips on D1/D2 contracts as part of wire-in
- D5 lands its own contract `verify-gate-contract.md` v1.0.0 STABLE

**Post-Wave-3 sequence**:
1. Red Team adversarial QA across all 5 domains (≥6 broken-patch attempts; success-criterion-7)
2. `/gsd-t-test-sync`
3. `/gsd-t-integrate` — confirm D5's wire-ins are reachable end-to-end
4. `/gsd-t-verify` — DOGFOODS the new verify-gate (Track 1 + Track 2 against M55 itself)
5. **Measurement run** (success criteria 2, 4, 5, 6) — write numbers into progress.md Decision Log AND CHANGELOG v3.25.10
6. If all 8 criteria pass → `/gsd-t-complete-milestone` → tag v3.25.10 → npm publish → `/gsd-t-version-update-all`. Otherwise recalibrate and continue (DO NOT tag).

## Integration Points

- **Wave 1 → Wave 2 gate**: D3's `.gsd-t/ratelimit-map.json` exists, D1's contract is STABLE, D4's contract is STABLE.
- **Wave 2 → Wave 3 gate**: D2's contract is STABLE, `bin/m55-substrate-proof.cjs` demonstrates ≥3× speedup (success-criterion-2).
- **Wave 3 → Red Team gate**: All 5 contracts STABLE, all unit tests pass, baseline 2262/2262 green, all 3 e2e journey specs pass.
- **Red Team → measurement gate**: GRUDGING PASS with ≥6 broken-patch attempts, all caught.
- **Measurement → tag gate**: All 8 falsifiable success criteria documented with numbers in progress.md AND CHANGELOG.

## Skipped Partition Steps (with rationale)

- **Step 1.5 Assumption Audit**: No external project references — all surface is in-tree.
- **Step 1.6 Consumer Surface**: framework-internal (commands, subagent prompts, dispatch CLI). No external API.
- **Step 3.5 / 3.6 Design Brief / Contract**: N/A (all surface is CLI / library / docs — no UI).

## Execution Order (supervisor / solo)

```
Wave 1 (parallel):  D1 ── D3 ── D4   (file-disjoint, parallel-safe under M44 D5 prover)
                     ↓     ↓     ↓
                     │     ratelimit-map.json on disk
                     ↓     ↓     ↓
Wave 2:                D2          (consumes D3 map for calibration)
                                    ↓
                                    parallel-cli.cjs ready
                                    ↓
Wave 3:                       D5    (consumes D1 envelope + D2 API + D4 brief; defensive on D3)
                                    ↓
Post-Wave: Red Team → test-sync → integrate → verify (dogfoods) → measure → complete
```

Under M44 parallelism, Wave 1 spawns 3 file-disjoint subagents (D1 + D3 + D4) concurrently per the supervisor's planner. Wave 2 and Wave 3 are single-domain waves. Inter-wave boundaries remain sequential (no parallelization across waves).

## Falsifiable Success Criteria (8 — measure before tag/publish)

(Reproduced from charter for partition-scope reference; canonical source is `.gsd-t/charters/m55-charter.md`.)

1. State-preflight schema published as STABLE contract (`cli-preflight-contract.md` v1.0.0)
2. Substrate proves ≥3× speedup on a real fan-out scenario via `bin/m55-substrate-proof.cjs`
3. Verify-gate blocks ≥3 distinct state-preflight failure classes (wrong-branch, port-conflict, contract-DRAFT) in `e2e/journeys/`-shape tests with manifest entries
4. ≥40% token reduction per milestone for execute+verify cycles vs trailing-3 baseline (M52, M54, prior). Numbers in progress.md + CHANGELOG.
5. Zero 429 errors at parallelism level D3 declared safe + peak parallelism ≥6 concurrent workers. Captured in `.gsd-t/metrics/ratelimit-events.jsonl`.
6. Verify-gate wall-clock ≤ ½ trailing-3 median
7. Red Team GRUDGING PASS — ≥5 broken patches, all caught (preflight-skip-on-error, parallel-substrate-bypasses-capture, verify-gate-falsy-true, branch-guard-typo, contract-staleness-ignored, brief-staleness-ignored)
8. Zero regressions on `npm test` (baseline 2262/2262 unit + 1 documented env-bleed)

If ANY criterion fails → DO NOT tag, DO NOT publish, recalibrate, document gap in progress.md, continue.

## Known Blockers

None. All prerequisite infrastructure is in place:
- `bin/gsd-t-token-capture.cjs` ready (M41)
- `bin/parallelism-report.cjs` ready as envelope-idiom reference (M44 D9)
- M44 parallelism prover + planner ready (Wave 1 fan-out)
- M52 journey-coverage + M54 live-activity rail ready as e2e scaffold for D5's blocking specs
- `git worktree` available for D3's throwaway sweep workers
- `~/.claude/bin/` propagation pattern documented (`project_global_bin_propagation_gap.md`)
