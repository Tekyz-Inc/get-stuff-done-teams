# M55 Charter — CLI-Preflight + Parallel Substrate + Rate-Limit Map + Context Briefs + Verify Gate

> Authored: 2026-05-09 15:30 PDT (merged scope) from Desktop conversation alignment + 15:04 in-session definition.
> This file is the canonical scope. The unattended supervisor and partition phase consume it.
> Archive to `.gsd-t/milestones/m55/charter.md` during complete-milestone.

## Context

Two pain patterns merged into one milestone:

**Pattern A — Silent-skip regressions (from M48/M49/M50/M52 retrofit hooks)**: ad-hoc `Promise.all([Task,Task,...])` patterns scattered across command files bypass `bin/gsd-t-token-capture.cjs` so token attribution goes blind on fan-out; "verify" steps report PASS when their precondition checks were never actually run; silent-skip regressions only caught later by retrofit hooks.

**Pattern B — Claude rate-limit ceiling at ~3 parallel workers (from Desktop conversation 2026-05-09)**: undocumented ITPM cap, not concurrency cap. Every parallel worker re-loads CLAUDE.md + contracts + domain scope (~60k each) within the same 60s window, tripping the silent cap. Decision: build a CLI-first preflight pattern so most "workers" are deterministic CLIs (zero ITPM) and only the join is an LLM. Stays inside Claude Max — no codex/gemini.

Per memory `feedback_claude_max_subscription.md`: local features must use Max subscription, not API key (API key is measurement-only per `feedback_anthropic_key_measurement_only.md`).

Per memory `feedback_measure_dont_claim.md`: this milestone has measurable success criteria — not complete until measurement is run AND reported in progress.md + CHANGELOG with numbers.

## Goal

Lift the practical parallelism ceiling from ~3 LLM workers to ~6–10 mixed workers (1 LLM judge + N CLIs) by replacing deterministic LLM work with deterministic CLI work, AND gate every spawn with deterministic state-precondition checks. Prove via empirical measurement.

## Domains (5 file-disjoint — partition will refine task lists)

### D1 — State-Precondition Library
- `bin/cli-preflight.cjs` — pluggable check registry: `branch-guard`, `ports-free`, `deps-installed`, `contracts-stable`, `manifest-fresh`, `working-tree-state`
- Deterministic `{ok, checks[], notes[]}` envelope, schema-versioned, zero deps mirroring `bin/parallelism-report.cjs`
- Pure state inspector — no token spend, no LLM calls

### D2 — Parallel-CLI Substrate
- `bin/parallel-cli.cjs` — N-worker pool runner
- Every spawn flows through `captureSpawn` (token-capture invariant)
- Log-stream tee to per-worker NDJSON, lifecycle/timeout/fail-fast policy
- Engine-only — does NOT touch command files yet
- **Concurrency defaults calibrated from D3's empirical map** (D2 depends on D3 output)

### D3 — Rate-Limit Probe + Empirical Map (one-shot ~140k token spend, approved)
- `bin/gsd-t-ratelimit-probe.cjs` — synthetic-worker harness mirroring real GSD-T spawn shape (Nk context read, Mk output)
- Sweep matrix: `parallel_workers ∈ {1,2,3,4,5,6,8} × context_size ∈ {10k, 30k, 60k, 100k}`
- Captures per-worker time-to-first-token, 429 count + which worker, total wall-clock, effective ITPM/OTPM achieved
- Backoff probe (post-429 recovery window) + steady-state probe (5-min sustained at 3 workers)
- Real spawns into throwaway worktree (accuracy matters more than ~140k one-shot token cost)
- Output: `.gsd-t/ratelimit-map.json` — account's empirical ceiling. Future spawn decisions consult this.

### D4 — Context-Brief Generator (renamed from "preflight" to avoid collision with D1)
- `bin/gsd-t-context-brief.cjs` — single entry: `gsd-t brief --kind {execute|verify|qa|red-team|design-verify|scan} --domain X --json`
- Produces `.gsd-t/briefs/{spawn-id}.json` (~2k JSON snapshot) replacing the 30–60k context re-read per worker
- `.gsd-t/contracts/context-brief-contract.md` v1.0.0 — schema, freshness rules (mtime hash-stamp), fail-open vs fail-closed, allowed CLIs, idempotent-join rule
- Workers consume the brief instead of re-reading repo files

### D5 — Verify-Gate (two-track) + Wire-In + Doc Ripple
- `bin/gsd-t-verify-gate.cjs` — two-track gate:
  - **Track 1 (state)**: consumes D1 envelope, hard-fails on any non-`ok` check
  - **Track 2 (parallel CLI)**: fans out via D2 substrate — typecheck (tsc), lint (biome/ruff), tests (existing runners), dead-code (knip), secrets (gitleaks), complexity (lizard)
  - Returns ≤500-token JSON summary; LLM judges summary, never raw output
- Wire-in:
  - `gsd-t-execute` Step 1: orchestrator runs D4 context-brief once + D1 state-preflight, workers consume brief instead of re-reading repo
  - `gsd-t-verify` Step 2: invoke verify-gate; summary feeds the existing verify report
  - Update validation-subagent prompts (`templates/prompts/qa-subagent.md`, `red-team-subagent.md`, `design-verify-subagent.md`) with hard rule: "If you're about to grep/read/run-test, check the brief first."
- Doc ripple: `docs/architecture.md` (CLI-Preflight Pattern section), `docs/requirements.md` (REQ-M55-D1..D5-*), `CLAUDE.md` project (mandatory preflight before spawn), `commands/gsd-t-help.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`
- Update Pre-Commit Gate: "brief regenerated if preflight inputs changed"

## Domain Dependency Graph

```
D1 (state checks)        ← independent, can start anytime
D3 (ratelimit probe)     ← independent, can start anytime
                              ↓ produces ratelimit-map.json
D2 (parallel substrate)  ← depends on D3 (calibration)
                              ↓ produces parallel-cli.cjs
D4 (context briefs)      ← independent of D1/D2/D3 internals; can run parallel with D1 and D3
D5 (verify-gate + wire)  ← depends on D1, D2, D4
```

**Wave plan** (refined at /gsd-t-plan):
- Wave 1 parallel: D1 + D3 + D4 (file-disjoint, no internal deps)
- Wave 2: D2 (after D3 produces map)
- Wave 3: D5 (after D1, D2, D4)
- Post-wave: Red Team adversarial QA across all 5 domains
- Then test-sync → integrate → verify (dogfoods D5) → measurement → complete-milestone

## Falsifiable Success Criteria (8 — measure before tag/publish)

Measured against trailing 3 pre-M55 milestones (M52, M54, prior) using `.gsd-t/token-log.md` + `.gsd-t/metrics/`:

1. **State-preflight schema published as STABLE contract** — `cli-preflight-contract.md` v1.0.0
2. **Substrate proves ≥3× speedup on a real fan-out scenario** via in-tree `bin/m55-substrate-proof.cjs`
3. **Verify-gate blocks ≥3 distinct state-preflight failure classes** (wrong-branch, port-conflict, contract-DRAFT) in `e2e/journeys/`-shape tests with `.gsd-t/journey-manifest.json` entries
4. **≥40% token reduction per milestone** for execute+verify cycles vs trailing-3 baseline. Numbers in progress.md Decision Log AND CHANGELOG v3.25.10
5. **Zero 429 errors at parallelism level D3 declared safe + peak parallelism ≥6 concurrent workers**. Captured in `.gsd-t/metrics/ratelimit-events.jsonl`
6. **Verify-gate wall-clock ≤ ½ trailing-3 median**
7. **Red Team GRUDGING PASS** — ≥5 broken patches, all caught: preflight-skip-on-error, parallel-substrate-bypasses-capture, verify-gate-falsy-true, branch-guard-typo, contract-staleness-ignored, brief-staleness-ignored
8. **Zero regressions on `npm test`** — baseline 2262/2262 unit + 1 documented `event-stream.test.js` env-bleed when run in-session under `gsd-t-milestone`

If ANY criterion fails → DO NOT tag, DO NOT publish, recalibrate, document the gap in progress.md, continue iterating. If ALL pass → bump 3.24.10 → 3.25.10 (minor: new feature), tag v3.25.10, npm publish, gsd-t-version-update-all.

## Out of Scope

- Rewriting all 55 command files to call the substrate directly (separate ratchet milestone, pending M55 ship)
- Cross-project preflight/brief propagation via `gsd-t update-all` (follow-up)
- Replacing `bin/gsd-t-worker-dispatch.cjs` or `bin/gsd-t-unattended.cjs` with the substrate (those are unattended-mode supervisors, distinct surface)

## Standing Directive (survives compaction)

Per Desktop alignment 2026-05-09 + reaffirmed 15:30: execute M55 in-session through to COMPLETED. Auto-advance through partition → plan → execute → test-sync → integrate → verify → complete-milestone without stopping. Do not pause for "should I continue?" Only stop for: destructive action, unrecoverable error after 2 fix attempts + debug-loop exit 4, or measurement criteria failure (in which case recalibrate and continue, do not tag).

## Resume Hint

The unattended supervisor running this charter should treat each domain as a separate spawn (use the supervisor's worker fan-out) and consult this file at every phase boundary to confirm scope hasn't drifted. The 15:04 initial M55 definition is SUPERSEDED by this merged scope.
