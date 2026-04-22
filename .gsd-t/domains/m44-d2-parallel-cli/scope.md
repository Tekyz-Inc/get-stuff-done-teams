# Domain: m44-d2-parallel-cli

## Responsibility

Deliver the `gsd-t parallel` CLI subcommand, which wraps the existing M40 orchestrator (`bin/gsd-t-orchestrator.js`) with task-level (not just domain-level) parallelism and mode-aware gating math. This is the primary integration point for both delivery layers (L1 and L2).

Key responsibilities:
- Accept `--mode in-session|unattended` flag (or auto-detect from caller environment)
- Consume D1's task graph (via `bin/gsd-t-task-graph.cjs`)
- Apply D4 dep-graph validation gate before any fan-out
- Apply D5 file-disjointness prover gate before any fan-out
- Apply D6 economics estimator gate before any fan-out
- Translate the validated ready-task set into M40 orchestrator task configs
- For [in-session]: apply orchestrator-CW headroom check before spawning N workers; pump fewer-at-a-time if math fails
- For [unattended]: enforce per-worker CW headroom via D6 estimator; never exceed 60% of one CW per task slice
- Bump `wave-join-contract.md` v1.0.0 → v1.1.0 with mode-aware gating math additions

## Inputs

- D1 DAG object (`bin/gsd-t-task-graph.cjs`)
- D4 dep-validation gate (`bin/gsd-t-depgraph-validate.cjs`)
- D5 disjointness gate (`bin/gsd-t-file-disjointness.cjs`)
- D6 economics estimator (`bin/gsd-t-economics.cjs`)
- M40 orchestrator (`bin/gsd-t-orchestrator.js`, `bin/gsd-t-orchestrator-config.cjs`) — extended, not replaced
- `bin/token-budget.cjs` — for [in-session] CW headroom check
- `.gsd-t/.context-meter-state.json` — for `getSessionStatus().pct` in [in-session] mode

## Outputs

- `gsd-t parallel [--mode in-session|unattended] [--milestone Mxx] [--domain Dxx] [--dry-run]` subcommand
- `bin/gsd-t-parallel.cjs` — core module with the CLI dispatch logic
- Updated `bin/gsd-t-orchestrator-config.cjs` — mode-aware gating math extension
- `.gsd-t/contracts/wave-join-contract.md` v1.1.0 — adds mode-aware gating math section

## Files Owned

- `bin/gsd-t-parallel.cjs` — NEW. Core parallel dispatch module. Imports D1, D4, D5, D6, and M40 orchestrator modules.
- `bin/gsd-t-orchestrator-config.cjs` — MODIFIED. Adds mode-aware gating math: `computeInSessionHeadroom({ctxPct, workerCount, summarySize})` and `computeUnattendedGate({estimatedCwPct, threshold})`.
- `.gsd-t/contracts/wave-join-contract.md` — MODIFIED. Bumped v1.0.0 → v1.1.0. Adds §"Mode-Aware Gating Math" section.

## Files Read-Only

- `bin/gsd-t-orchestrator.js` — D2 extends config module; does not rewrite the orchestrator entry
- `bin/gsd-t-orchestrator-recover.cjs` — read to understand resume surface; not modified
- `bin/token-budget.cjs` — called for CW headroom; not modified
- `bin/gsd-t-task-graph.cjs` (D1 output) — consumed
- `bin/gsd-t-depgraph-validate.cjs` (D4 output) — consumed
- `bin/gsd-t-file-disjointness.cjs` (D5 output) — consumed
- `bin/gsd-t-economics.cjs` (D6 output) — consumed
- `.gsd-t/contracts/headless-default-contract.md` — read to verify always-headless invariant is preserved; not bumped

## Out of Scope

- Writing command files (`commands/*.md`) — that is D3
- Implementing the dep-validation logic — that is D4
- Implementing the disjointness proof — that is D5
- Implementing the economics estimation algorithm — that is D6
- Tagging `cw_id` on rows — that is D7
- Replacing the M40 orchestrator — M44 builds on M40
