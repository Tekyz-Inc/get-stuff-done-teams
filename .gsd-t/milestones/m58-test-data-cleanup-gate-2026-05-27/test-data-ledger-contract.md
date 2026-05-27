# Contract: test-data-ledger

**Status**: STABLE
**Version**: 1.0.0
**Owner**: M58 D1

## Purpose

Track test data inserted into project data stores during a Verify run, and purge it after the suite completes — closing the gap that produced 2442 orphaned `E2E_*` records in the GSD-T-Board incident.

## Public API

```
const {
  appendInsert,
  listInserts,
  purgeRunInserts,
  registerAdapter,
} = require('@tekyzinc/gsd-t/bin/gsd-t-test-data-ledger.cjs');
```

### `appendInsert({projectDir, runId, kind, store, id, taggedPrefix?, insertedAt?}) → {ok, ledgerPath}`

Append one row to `${projectDir}/.gsd-t/test-data-ledger.jsonl`.

- `runId` — string, must be non-empty. Convention: `verify-<milestone>-<UTC ISO>`.
- `kind` — adapter name (`localStorage-key-prefix` | `file-json-array` | `sqlite-table-where` | custom).
- `store` — adapter-specific store locator (e.g., key-prefix string, file path, `dbPath|table|idColumn`).
- `id` — the test-data identifier. Must start with `taggedPrefix` (default `E2E_`).
- `taggedPrefix` — defaults to `'E2E_'`. Adapter purge-time guard re-checks this.
- `insertedAt` — ISO-8601, defaults to `new Date().toISOString()`.

Returns `{ok: true, ledgerPath: string}` or throws on validation failure.

### `listInserts({projectDir, runId?}) → Row[]`

Read all ledger rows, optionally filtered by `runId`. Returns `[]` on missing ledger.

Each row: `{runId, kind, store, id, taggedPrefix, insertedAt}`.

### `purgeRunInserts({projectDir, runId, dryRun?}) → {purged[], skipped[], errors[]}`

Dispatches each row of `runId` to its `kind`'s adapter.

- `purged[]` — rows the adapter confirmed it deleted (returned `'purged'`).
- `skipped[]` — rows the adapter said weren't present (returned `'absent'`).
- `errors[]` — `{record, message}` for any adapter throw or guard refusal.

`dryRun: true` computes the envelope without calling adapters.

### `registerAdapter(kind, adapter)`

Adds a custom adapter. The adapter exports `purge({store, id, taggedPrefix})` returning one of:
- `'purged'` — record was present and deleted
- `'absent'` — record was not present (already clean)
- throws Error — failure (becomes `errors[].message`)

## Adapter Contract

Adapters MUST:
- Refuse to delete a record whose `id` does not start with `taggedPrefix` (defense in depth — throw with message `'tag prefix mismatch'`).
- Perform no filesystem operations outside `store` (path the caller passed).
- Be idempotent: calling `purge` on an already-purged record returns `'absent'`, not throws.

## Invariants

- Ledger is **append-only**. Purge does not rewrite history; the ledger is the audit trail.
- Ledger path is fixed: `${projectDir}/.gsd-t/test-data-ledger.jsonl`.
- `appendInsert` is single-line `fs.appendFileSync` — safe for parallel writes from a single Node process.
- Errors in one row never abort the rest of a purge run.

## Storage Adapters (initial set)

1. `localStorage-key-prefix` — browser localStorage. `store` is the key prefix, `id` is the key suffix. Removal happens via `page.evaluate` (Playwright host side).
2. `file-json-array` — JSON file containing an array. `store` is the file path, `id` is the matching identifier in the row. Atomic rewrite (write-temp + rename).
3. `sqlite-table-where` — SQLite. `store` is `dbPath|table|idColumn`. `DELETE` with tagged-prefix `LIKE` guard. Dynamic `require('better-sqlite3')` — adapter self-skips when module absent.

## Out of Scope

- Adapters for HTTP APIs / Redis / GraphQL mutations (extension via `registerAdapter`).
- Ledger compaction (file grows linearly per insert — acceptable for test scale).
- Multi-runId purge in one call.

## Versioning

- 0.1.0 DRAFT — initial scope captured during M58 D1 partition.
- 1.0.0 STABLE — flipped at end of D1-T5. 3 initial adapters shipped (file-json-array, localStorage-key-prefix, sqlite-table-where). 35/35 unit tests pass; 2 sqlite tests self-skip when `better-sqlite3` is absent.
