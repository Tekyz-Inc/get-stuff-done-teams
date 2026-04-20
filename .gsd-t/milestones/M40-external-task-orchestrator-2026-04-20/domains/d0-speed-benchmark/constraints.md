# Constraints: d0-speed-benchmark

## Must Follow
- Zero external npm runtime deps (GSD-T invariant).
- Both sides of the benchmark run the SAME workload file, same cwd, same git state. Any delta here invalidates the comparison.
- Use `Date.now()` for wall-clock; record to millisecond precision.
- Record `node --version`, OS, CPU count, free RAM in the report for reproducibility.
- Run each side 3 times; report median, not mean. Discard warm-cache runs if variance > 20%.
- Benchmark workload MUST include at least one task that can run in parallel with another — otherwise the orchestrator's core value prop (process-level parallelism) isn't being measured.

## Must Not
- Modify `commands/gsd-t-execute.md` to alter how in-session work runs (that would bias the control).
- Count orchestrator startup as "orchestrator time" but exclude in-session thinking from "in-session time" — both include their full lifecycle.
- Skip the benchmark because "we already know it'll be faster." The user explicitly set this as the kill-switch.
- Write to `.gsd-t/events/*.jsonl` from the benchmark driver (pollutes production telemetry).

## Must Read Before Using
- `bin/gsd-t-unattended.cjs` — specifically `_spawnWorker()` — to understand the existing `claude -p` spawn shape. D0 benchmark reuses the same spawn primitive D1 wraps.
- `.gsd-t/contracts/headless-default-contract.md` v1.0.0 — the existing headless spawn contract; D1 must remain compatible.

## Dependencies
- Depends on: D1 (minimal orchestrator-core spawn loop), D2 (minimal task-brief builder) — the smallest slice that can run the benchmark workload end-to-end.
- Depended on by: Wave 3 (D4 stream-feed-server, D5 stream-feed-ui) via the go/no-go gate.
