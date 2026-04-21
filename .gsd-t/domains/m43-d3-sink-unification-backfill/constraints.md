# Constraints: m43-d3-sink-unification-backfill

## Must Follow

- Zero external runtime deps.
- Schema v2 is **backward-compatible**: every v1 row is a valid v2 row (new fields are optional). No migration script required for historical data already present in JSONL form.
- `--regenerate-log` is **idempotent and deterministic** — running it twice on the same input yields byte-identical output.
- Wrapper (`bin/gsd-t-token-capture.cjs`) continues to append to `.gsd-t/token-log.md` in real time for live visibility. Regeneration is a separate explicit step, not an auto-rebuild on every write.
- Backfill runs produce a diff that the operator can inspect before commit — dry-run first, then `--apply`.
- No `0` tokens ever. Missing-usage rows render `—` in the markdown view and `null` in the JSONL.

## Must Not

- Delete or mutate existing JSONL rows — backfill is append/augment only (when back-filling, we synthesize a new row matched by `startedAt + sessionId`; we don't rewrite old rows in place).
- Couple to a database. File-based is the invariant.
- Break M41 callers — every existing `recordSpawnRow({...})` call must keep working unchanged. New fields default to `undefined`.
- Touch command files or hooks — those are D1/D4.

## Must Read Before Using

- `bin/gsd-t-token-capture.cjs` end-to-end (~400 lines). Pay attention to `upgradeHeaderIfNeeded` + the `renderTokensCell` function.
- `.gsd-t/contracts/metrics-schema-contract.md` v1 — note every existing field and its source.
- `bin/gsd-t-token-backfill.cjs` + `test/gsd-t-token-backfill.test.js` (M41 D3).
- `scripts/gsd-t-token-aggregator.js::processFrame` — the single place that parses stream-json `result` frames. Understand its output shape before bumping it.
- `.gsd-t/contracts/stream-json-sink-contract.md` v1.1.0 — already at v1.1.0; bump to v1.2.0 is owned by D1 (in-session hook entry-point). D3 consumes v1.1.0 + D1's v1.2.0 addition read-only.

## Dependencies

- **D3 and D1 run in Wave 1 concurrently**. D1 writes rows in v2 shape; D3 owns the schema definition. Coordinate field names via the contract file — D3 lands the contract first (~first 30 min of Wave 1), D1 consumes it, D3 finishes the regenerator after.
- D2, D5, D6 all block on D3 v2 contract.

## Acceptance

- `metrics-schema-contract.md` v2 checked in, references v1 as predecessor, lists every new field + its producer.
- `gsd-t tokens --regenerate-log` run against the live repo produces a `.gsd-t/token-log.md` that (modulo whitespace/ordering normalization) matches the hand-maintained one for rows currently present.
- Backfill dry-run reports the 64 `Tokens=0` / `Tokens=—` historical rows and proposes synthesized replacements with real parsed usage.
- `npm test` green (no regressions).
