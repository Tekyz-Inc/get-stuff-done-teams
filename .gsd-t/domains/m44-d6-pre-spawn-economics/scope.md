# Domain: m44-d6-pre-spawn-economics

## Responsibility

Before any parallel spawn, estimate each candidate task's CW footprint and apply the appropriate mode-specific gate:
- **[in-session]**: feeds the orchestrator-CW headroom check in D2 (`computeInSessionHeadroom`) with estimated per-worker summary size
- **[unattended]**: enforces per-worker CW headroom gate — if a task slice would exceed ~60% of one CW, flag it for splitting into multiple `claude -p` iters

The estimator is calibrated against the existing 525-row token-usage corpus enriched with `cw_id` tags (from D7 Wave 1 work). Historical rows without `cw_id` use a per-iter median as the fallback cost estimate.

The estimator matches tasks by similarity: `command + step + domain` triplet lookup. Falls back to global median when no match found.

## Inputs

- `.gsd-t/metrics/token-usage.jsonl` (525-row calibration corpus + growing; D7 enriches with `cw_id`)
- `.gsd-t/metrics/compactions.jsonl` (72-event calibration corpus; "we failed" signal for estimator calibration)
- D1 DAG task nodes (for `command + step + domain` lookup key construction)

## Outputs

- `estimateTaskFootprint({taskNode, mode, projectDir})` → `{estimatedCwPct, parallelOk, split, workerCount, matchedRows, confidence}`
- Decision logged to `.gsd-t/events/YYYY-MM-DD.jsonl` as `economics_decision` event
- `bin/gsd-t-economics.cjs` — core estimator module
- `.gsd-t/contracts/economics-estimator-contract.md` — new contract (v1.0.0) defining algorithm, calibration procedure, known-failure modes
- Accuracy + known-failure documentation (populated during D6-T3 calibration task)

## Files Owned

- `bin/gsd-t-economics.cjs` — NEW. Exports `estimateTaskFootprint`. Zero external deps. Uses synchronous JSON parsing of the calibration corpus.
- `test/m44-economics.test.js` — NEW. Tests: exact match returns matched data, no-match falls back to global median, confidence field reflects match quality, mode flag routes to correct gate math.
- `.gsd-t/contracts/economics-estimator-contract.md` — NEW. Documents algorithm, calibration data sources, confidence tiers, known-failure modes.

## Files Read-Only

- `.gsd-t/metrics/token-usage.jsonl` — calibration corpus read at estimator init time
- `.gsd-t/metrics/compactions.jsonl` — "we failed" corpus read for calibration accuracy assessment
- `bin/gsd-t-task-graph.cjs` (D1 output) — task node structure consumed
- `bin/gsd-t-orchestrator-config.cjs` (D2 output) — D6 provides the footprint estimate; D2 owns the gating-math callsite in the config module. D6 only reads the extension point to understand the interface.

## Out of Scope

- Dep-graph validation (D4)
- File disjointness proof (D5)
- CW headroom arithmetic (D2 owns `computeInSessionHeadroom` and `computeUnattendedGate`; D6 provides the input estimate, not the gate decision)
- Writing back to token-usage.jsonl (read-only)
- Replacing M40 orchestrator cost model (D6 extends it with task-level granularity; the orchestrator's existing domain-level cost model remains)
