# M58-D1 — Test Data Ledger

## Purpose

Append-only JSONL ledger tracking test data inserted during Verify, and a purge engine that removes those records from the underlying store after the suite completes.

## Files Owned

- `bin/gsd-t-test-data-ledger.cjs` (NEW)
- `bin/gsd-t-test-data-adapters/localstorage-key-prefix.cjs` (NEW)
- `bin/gsd-t-test-data-adapters/file-json-array.cjs` (NEW)
- `bin/gsd-t-test-data-adapters/sqlite-table-where.cjs` (NEW)
- `.gsd-t/contracts/test-data-ledger-contract.md` (NEW)
- `test/m58-d1-test-data-ledger.test.js` (NEW)
- `test/m58-d1-adapters-localstorage.test.js` (NEW)
- `test/m58-d1-adapters-file-json-array.test.js` (NEW)
- `test/m58-d1-adapters-sqlite.test.js` (NEW)
- `test/fixtures/m58-test-data/` (NEW dir)

## Public API

```
const { appendInsert, listInserts, purgeRunInserts, registerAdapter } =
  require('./bin/gsd-t-test-data-ledger.cjs');

appendInsert({projectDir, runId, kind, store, id, taggedPrefix?, insertedAt?}) → {ok, ledgerPath}

listInserts({projectDir, runId?}) → [{runId, kind, store, id, taggedPrefix, insertedAt}, …]

purgeRunInserts({projectDir, runId, dryRun?}) →
  {purged[], skipped[], errors[]}

// purged[]:  records actually removed from the store
// skipped[]: records the adapter said weren't present (already gone)
// errors[]:  {record, message} — verify FAILs if errors.length > 0
```

## Storage Adapters (initial set)

Each adapter exports `{kind, purge({store, id}) → 'purged'|'absent'|throws}`.

- `localStorage-key-prefix` — browser localStorage; `store` = key prefix, `id` = key suffix. Purge removes `{prefix}{id}`. (Adapter is Playwright-host-side — uses `page.evaluate` to call `localStorage.removeItem`.)
- `file-json-array` — JSON file containing an array; `store` = file path, `id` = identifier field. Purge rewrites array minus matching records.
- `sqlite-table-where` — SQLite DB; `store` = `dbPath|table|idColumn`. Purge runs `DELETE FROM <table> WHERE <idColumn> = ? AND <idColumn> LIKE '<taggedPrefix>%'` (tag check is a safety belt to refuse deletion of non-tagged records).

## Non-Goals

- D1 does NOT modify any existing GSD-T command files (D2's job).
- D1 does NOT ship a Playwright fixture helper (D2's job).
- D1 does NOT change `commands/gsd-t-verify.md` (integrate-sequenced via D2).

## Acceptance

- All 4 SCs from the milestone definition that target D1 (SC1, SC2, SC3 partial — ledger reports errors) pass.
- Contract `test-data-ledger-contract.md` flipped DRAFT → STABLE.
- Zero regressions on the 2587-test baseline.
