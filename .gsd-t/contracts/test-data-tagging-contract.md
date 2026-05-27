# Contract: test-data-tagging

**Status**: STABLE
**Version**: 1.0.0
**Owner**: M58 D2

## Purpose

Normative convention for how test data MUST be tagged so the M58 Test Data Cleanup Gate can identify it, purge it, and refuse to touch anything else.

## Tagging Rule

Every test-inserted record's identifier MUST:

1. Start with a recognized prefix — the default is `E2E_`. Projects may declare additional opt-in prefixes in `.gsd-t/test-data-config.json`:
   ```json
   { "taggedPrefixes": ["E2E_", "FIXTURE_", "INTEGRATION_"] }
   ```
2. Be composed by the fixture's `tag()` helper as `{PREFIX}_{verifyRunId}_{counter}`, where:
   - `PREFIX` is one of the recognized prefixes
   - `verifyRunId` is `process.env.GSD_T_VERIFY_RUN_ID` (set by the verify command)
   - `counter` is a per-test monotonic integer allocated by the fixture

Example: `E2E_DRAG_verify-m58-20260527T091800Z_3`.

## Enforcement Points

- **Insert side (fixture)** — `testData.tag(prefix)` returns a string starting with `prefix + '_'`. Use of the fixture is the test author's contract acceptance.
- **Adapter side (defense in depth)** — every adapter refuses to delete a record whose `id` does not start with the ledger row's `taggedPrefix`. Prevents tampered ledgers from being weaponized.

## Project Config

Optional `.gsd-t/test-data-config.json`:

```json
{
  "taggedPrefixes": ["E2E_", "FIXTURE_"],
  "ledgerPath": ".gsd-t/test-data-ledger.jsonl"
}
```

Both fields have defaults — config is fully optional.

## Out of Scope

- Run-time enforcement that tests use the fixture (we rely on the verify step finding orphans and FAILing the gate).
- Cross-test-framework support beyond Playwright in the initial ship.

## Versioning

- 0.1.0 DRAFT — initial scope captured during M58 D2 partition.
- 1.0.0 STABLE — flipped at end of D2-T3. Tagging convention adopted by `templates/test-helpers/test-data-fixture.ts` `withTestData()`; enforced at adapter purge time by all 3 built-in adapters (`file-json-array`, `localStorage-key-prefix`, `sqlite-table-where`).
