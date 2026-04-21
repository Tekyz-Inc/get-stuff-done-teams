# Tasks: m43-d2-per-tool-attribution

## Wave 2 — Parallel with D3, D4, D5, D6

### D2-T1 — Author `tool-attribution-contract.md` **DONE** (2026-04-21)
- Document the output-byte ratio algorithm.
- Document tie-breaker rules (zero-byte turn, missing tool_result, no tool calls at all, null turn tokens).
- Document the canonical attribution row shape.
- Version 1.0.0.

### D2-T2 — Implement `bin/gsd-t-tool-attribution.cjs` **DONE** (2026-04-21)
- `joinTurnsAndEvents({turnsPath, eventsGlob, since?, milestone?})` — streaming read of both sources, join by `turn_id`.
- `attributeTurn(turn)` — apply the algorithm.
- `aggregateByTool/Command/Domain(rows)` — rankers.
- Export all three.

### D2-T3 — Implement `bin/gsd-t-tool-cost.cjs` CLI **DONE** (2026-04-21)
- Parse `--group-by`, `--since`, `--milestone`, `--format`.
- Call attribution library.
- Print ranked table (default) or line-delimited JSON.
- Zero deps.

### D2-T4 — Register subcommand in `bin/gsd-t.js` **DONE** (2026-04-21)
- Add `tool-cost` to the CLI dispatch.
- Update `gsd-t --help` output.

### D2-T5 — Unit tests **DONE** (2026-04-21)
- `test/m43-tool-attribution.test.js` — 13 cases covering all algorithm branches + join + aggregation determinism.
- `test/m43-tool-cost-cli.test.js` — 8 cases (arg parsing, compute against synthetic fixture, json/table rendering, empty sink, since filter).

### D2-T6 — Wire into `gsd-t tokens` (M41 D4) optional `--show-tool-costs` **DONE** (2026-04-21)
- Patch `bin/gsd-t-token-dashboard.cjs` to accept `--show-tool-costs`.
- When set, print a "Top 10 tools by cost" section below the existing sections.

### D2-T7 — Perf gate **DONE** (2026-04-21)
- `test/m43-tool-attribution-perf.test.js` synthesizes 3k turns × 30k events and asserts joinTurnsAndEvents + aggregateByTool < 3s. Measured: ~30ms on dev laptop.
