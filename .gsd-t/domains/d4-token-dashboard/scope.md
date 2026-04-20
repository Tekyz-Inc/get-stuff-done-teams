# Domain: d4-token-dashboard

## Responsibility

Turn the now-complete `.gsd-t/metrics/token-usage.jsonl` (live + backfilled) into something operators actually look at. Two surfaces:

1. **`gsd-t tokens`** — a new CLI subcommand that prints a summary table: totals by day / command / model, top-10 expensive spawns, rolling 7-day burn rate, cache-read hit rate.
2. **`gsd-t status` integration** — inline a compact two-line token summary at the bottom of `gsd-t status` output so every status check surfaces current-milestone spend without asking.

The existing `scripts/gsd-t-stream-feed.html` (M40 D5) already displays per-task tokens live; D4 is the **cumulative/historical** view, not the live stream.

## Owned Files/Directories

- `bin/gsd-t-token-dashboard.cjs` (NEW) — the aggregation + rendering module
- `bin/gsd-t.js` — add `tokens` subcommand; inject token summary block into `status` output
- `test/m41-token-dashboard.test.js` (NEW)

## NOT Owned (do not modify)

- `scripts/gsd-t-stream-feed.html` — M40 D5's live UI
- `scripts/gsd-t-token-aggregator.js` — M40 D4 aggregator (D4 **reads via** it, doesn't modify)
- `bin/gsd-t-token-capture.cjs` / `bin/gsd-t-token-backfill.cjs` — D1 and D3 outputs; D4 only reads their JSONL output

## Public API

### `gsd-t tokens [--since YYYY-MM-DD] [--milestone Mxx] [--format table|json]`

Default output (table):

```
Token Usage Summary (since 2026-04-10)

By day:
  Date         Spawns   Input     Output    Cache-R    Cost
  2026-04-20   42       18.4k     9.1k      124.3k     $0.87
  2026-04-19   31       14.1k     6.7k      89.2k      $0.62
  ...

By command:
  Command                  Spawns   Tokens-in   Tokens-out   Cost
  gsd-t-execute            58       42.1k       21.8k        $1.94
  gsd-t-verify             22       15.7k       8.2k         $0.71
  ...

By model:
  Model    Spawns   Cost     Cache-hit%
  sonnet   71       $2.14    87%
  opus     9        $1.23    42%
  haiku    32       $0.18    91%

Rolling 7-day burn: $4.23/day avg | $29.61 projected-monthly

Top-10 expensive spawns: (startedAt, command, step, model, cost)
  ...
```

### `gsd-t status` injection

A two-line block at the very end:

```
───
Tokens (current milestone): 1,247 spawns | $8.14 spent | 92% cache-read hit rate
Last 24h: 42 spawns | $0.87 | avg 20s/spawn
```

## Inputs

- `.gsd-t/metrics/token-usage.jsonl` (schema v1) — the source of truth, written by D1 (live) and D3 (backfilled)
- `.gsd-t/progress.md` — current milestone name for "current milestone" filter

## Budget

- `gsd-t tokens` MUST run in < 500ms on a 10k-line JSONL (no external deps, streaming read, in-memory aggregation)
- `gsd-t status` token block MUST add < 100ms to the existing status command
