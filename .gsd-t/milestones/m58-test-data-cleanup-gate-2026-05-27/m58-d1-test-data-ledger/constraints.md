# M58-D1 Constraints

## Hard

- Zero new npm runtime dependencies (zero-dep invariant).
- Pure Node 16+ APIs. `sqlite-table-where` adapter dynamically requires `better-sqlite3` ONLY at adapter-use time (project may not have it installed; ledger core must not fail to load).
- Append-only ledger writes: each `appendInsert` is `fs.appendFileSync` of one JSONL line. No truncation, no rewrite-from-memory.
- Ledger path is `${projectDir}/.gsd-t/test-data-ledger.jsonl`. Adapter dirs live under `bin/gsd-t-test-data-adapters/`.

## Purge semantics

- `purgeRunInserts` MUST process every ledger row matching `runId`. A single adapter failure does NOT abort the rest — the failure goes into `errors[]` and the next row continues.
- `errors[]` records carry `{record, message}` — never raw exceptions, never stack traces in the structured envelope.
- `dryRun: true` returns `{purged, skipped, errors}` exactly as the wet run would compute it, but never calls the adapter.
- After a successful wet purge, the ledger is NOT rewritten to remove purged rows — the JSONL history is the audit trail. `listInserts({runId})` after purge still returns the rows; a separate `prunedAt` field is NOT introduced (out of scope).

## Adapter contract

- `purge({store, id})` returns `'purged'` (deleted), `'absent'` (not present — already clean), or throws Error (translated into `errors[]`).
- Adapters MUST refuse to delete a record whose `id` does not start with the ledger row's `taggedPrefix` (defense-in-depth — prevents purge from being weaponized against non-test data if the ledger is tampered with).
- No adapter performs filesystem operations outside `store` (the path the caller passed).

## Out of scope

- Adapters for arbitrary HTTP APIs, Redis, GraphQL mutations — these are extension points (`registerAdapter`), not initial adapters.
- Ledger rotation / compaction (file grows linearly with insert count — acceptable for test runs).
- Multi-runId purge in one call (out of scope — caller iterates).
