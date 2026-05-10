# Constraints: m55-d3-ratelimit-probe-map

## Must Follow

- **One-shot spend** — full sweep is run ONCE during M55, output committed as `.gsd-t/ratelimit-map.json`. Subsequent CI / dev runs use `--quick` (1×1 smoke). Re-running the full sweep requires explicit user approval (charter: "~140k token spend, approved" was for M55's single run).
- **Real spawns** — sweep workers spawn `claude -p` (NOT mock LLM, NOT API stubs). Synthetic context is the fixture; the API call is real. Use the `dangerously-skip-permissions` flag per `feedback_headless_dangerous_skip_permissions.md`.
- **`captureSpawn` flow** — every probe spawn flows through `bin/gsd-t-token-capture.cjs::captureSpawn` so the ~140k spend lands in `.gsd-t/token-log.md` (auditable, per `feedback_token_measurement_hierarchy.md`).
- **Throwaway worktree** — sweep workers run in `git worktree add` -created scratch directories so the main repo state is never mutated. Worktrees are torn down post-run.
- **Account masking** — the `account` field in the output is a sha256 prefix of the API key, not the key itself. Never write the raw key to the map.
- **429 capture** — every 429 event is logged with: which worker, which cell of the matrix, retry-after header, wall-clock timestamp. No silent retries — record-and-fail-the-cell.
- **Declared-safe rule** — a (workers, context) cell is "declared safe" iff: zero 429s across all `runs_per_cell` AND p95 time-to-first-token ≤ 8000ms. The map's `summary.declaredSafe` field is computed deterministically from the runs array.
- **Schema-versioned** — `schemaVersion: "1.0.0"` in the output. Contract documents the bump rules.
- **Zero runtime deps** for the probe library — only Node built-ins (`fs`, `path`, `child_process`, `crypto`, `os`). Mirror D1 / `parallelism-report.cjs` discipline.
- **Steady-state cadence** — 5-min sustained probe samples ITPM / OTPM at 30s intervals, NOT continuously, so the probe itself doesn't dominate the rate budget being measured.
- **Backoff probe isolation** — the deliberate-429 phase runs LAST in the sweep so any account-level pause it triggers doesn't poison earlier cells.

## Must Not

- Modify any file outside the Owned scope above
- Run the full sweep more than once during M55 (use `--quick` for development / regression)
- Use mock APIs or stubs for the real-spawn layer — the whole point is empirical measurement of the live account
- Default-skip 429 events into "warnings" — they are first-class data points
- Persist the API key into the output map
- Run sweep workers in the main worktree (must use `git worktree add`)
- Block on user input mid-sweep — the probe is fire-and-collect

## Must Read Before Using

The execute agent for D3 must read these files BEFORE writing code:

- **`bin/parallelism-report.cjs`** — zero-dep envelope idiom; D3's output mirrors this style.
- **`bin/m46-iter-proof.cjs`** + **`bin/m46-worker-proof.cjs`** — in-tree proof-CLI shape, including how they spawn real parallel workers and aggregate results.
- **`bin/gsd-t-token-capture.cjs`** — `captureSpawn` signature; D3 spawns flow through it.
- **`feedback_headless_dangerous_skip_permissions.md`** (memory) — every `claude -p` child needs `--dangerously-skip-permissions`.
- **`feedback_anthropic_key_measurement_only.md`** (memory) — D3 USES the key for measurement (this is exactly what it's for); inference goes via Claude Max in normal flow, but the probe is a measurement tool, so API-key path is permitted here.
- **`.gsd-t/metrics/token-usage.jsonl`** — example of the per-turn usage envelope shape; D3 captures the same shape per-worker.

D3 is prohibited from treating any of these as black boxes — read the listed sections before depending on shape.

## Dependencies

- Depends on: nothing internal — independent (Wave 1 candidate, runs parallel with D1 and D4)
- Depended on by: D2 (default-concurrency calibration, operator-mediated) and D5 (wire-in time concurrency selection)
- External: live Claude API (Anthropic account), `git worktree`, ANTHROPIC_API_KEY env var
