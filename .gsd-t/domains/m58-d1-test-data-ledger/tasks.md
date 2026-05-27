# M58-D1 — Test Data Ledger — Tasks

### M58-D1-T1 — Baseline fixtures (frozen)
**Touches**: `test/fixtures/m58-test-data/`

Create the falsification corpus. Each fixture is an input scenario the ledger or adapters MUST handle correctly. Frozen — written once, then closed.

- `fixture-1-five-inserts.jsonl` — 5 valid ledger rows, same runId, mixed adapter kinds
- `fixture-2-empty-ledger.jsonl` — empty file (purge must return all-empty envelope, not throw)
- `fixture-3-mixed-runids.jsonl` — 10 rows across 3 runIds; purge of runId#2 must touch only its 4 rows
- `fixture-4-tagged-prefix-mismatch.jsonl` — row whose id doesn't start with taggedPrefix; adapter must refuse + log error
- `fixture-5-localstorage-store.json` — sample localStorage snapshot keys
- `fixture-6-file-json-array.json` — sample data file with `E2E_*` and non-test rows mixed
- `fixture-7-sqlite-db.sql` — SQL script that builds a minimal table with both test and non-test rows

### M58-D1-T2 — Ledger core (`appendInsert`, `listInserts`)
**Touches**: `bin/gsd-t-test-data-ledger.cjs`, `test/m58-d1-test-data-ledger.test.js`

Implement append-only JSONL writer and reader. Tests bind T1 fixtures 1–3.

- `appendInsert` validates shape, defaults `insertedAt` to `new Date().toISOString()`, appends single line, returns `{ok, ledgerPath}`
- `listInserts({projectDir, runId?})` reads ledger, parses each line, optionally filters by runId
- Unit tests: empty ledger → `[]`; appending 5 rows → 5 read back; mixed-runId fixture → correct filtering

### M58-D1-T3 — Adapter framework + 3 initial adapters
**Touches**: `bin/gsd-t-test-data-adapters/{localstorage-key-prefix,file-json-array,sqlite-table-where}.cjs`, `test/m58-d1-adapters-{localstorage,file-json-array,sqlite}.test.js`

- `registerAdapter(kind, adapter)` + 3 built-in adapters auto-registered on module load
- `localStorage-key-prefix`: exports a Playwright-side helper signature `purge({page, store, id})` — adapter wraps `page.evaluate` calls; unit tests stub `page`
- `file-json-array`: reads file, filters array, writes back atomically (write-temp + rename)
- `sqlite-table-where`: dynamic require of `better-sqlite3`; runs DELETE with tagged-prefix guard; unit-test self-skips when module absent
- Tag-prefix mismatch test binds T1 fixture 4

### M58-D1-T4 — `purgeRunInserts` engine
**Touches**: `bin/gsd-t-test-data-ledger.cjs`, `test/m58-d1-test-data-ledger.test.js`

- Reads ledger, filters by runId, dispatches each row to its adapter
- Collects `{purged[], skipped[], errors[]}` — one failure does not abort the rest
- `dryRun: true` short-circuits adapter call
- Tests: SC1 (ledger records 5) + SC2 (purge returns purged.length===5 against in-memory store stub); error-propagation test (adapter throws → row goes to errors[], remaining rows still processed)

### M58-D1-T5 — CLI dispatch + contract STABLE
**Touches**: `bin/gsd-t-test-data-ledger.cjs` (exports `main(argv)`), `.gsd-t/contracts/test-data-ledger-contract.md`

- `gsd-t test-data --list [--run <id>]` — pretty table or `--json`
- `gsd-t test-data --purge --run <id> [--dry-run] [--json]` — runs purge, prints envelope, exits 0 on `errors.length===0` else 4
- Contract: API + envelope shapes + adapter contract + invariants → STABLE
- Note: integrate-step wires this into `bin/gsd-t.js` dispatch (separate file, D2 + integrate phase)

## Wave plan

- T1 (sequential, foundation)
- T2 → T3 → T4 (sequential within D1 — each depends on prior)
- T5 (sequential after T4)

D1 runs in **parallel with D2** (file-disjoint at the file level — only `bin/gsd-t.js` is shared, deferred to integrate).
