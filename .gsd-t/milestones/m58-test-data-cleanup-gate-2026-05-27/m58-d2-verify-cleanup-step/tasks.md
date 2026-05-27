# M58-D2 — Verify Cleanup Step + Tagging Convention — Tasks

### M58-D2-T1 — Synthetic Playwright suite fixture
**Touches**: `test/fixtures/m58-d2/synthetic-suite/`

Build the minimum Playwright project structure used by SC1 + SC4 evidence tests:
- `playwright.config.ts` (1 spec, no real browser launch — uses `test.describe.configure({ mode: 'serial' })` + spy-page stub)
- `synthetic.spec.ts` exercising 5 inserts through the fixture against an in-memory `file-json-array` adapter
- Stub `data.json` (initial state — 5 non-test rows; 5 test rows added during run; 5 test rows removed by purge)

### M58-D2-T2 — Fixture helper
**Touches**: `templates/test-helpers/test-data-fixture.ts`, `templates/test-helpers/README.md`, `test/m58-d2-fixture-helper.test.js`

- `withTestData(opts?)` returns a Playwright fixture object suitable for `test.extend`
- Exposes `testData.tag(prefix='E2E') → string`, `testData.register({...})`, `testData.flush()` (manual flush)
- Reads `process.env.GSD_T_VERIFY_RUN_ID || randomUUID()` for runId
- Calls `appendInsert` from `@tekyzinc/gsd-t/bin/gsd-t-test-data-ledger.cjs`
- README documents the fixture, the tagging convention, opt-in `purgePerTest`
- Unit tests: tag composition, register-then-flush behaviour, env-var fallback

### M58-D2-T3 — Tagging convention contract STABLE
**Touches**: `.gsd-t/contracts/test-data-tagging-contract.md`

- Author normative tagging-convention text
- Sections: tag composition rule, allowed prefixes, adapter-side enforcement, opt-in custom prefix via `.gsd-t/test-data-config.json`
- Flip status DRAFT → STABLE at end of task

### M58-D2-T4 — Verify-step content + SC4 evidence
**Touches**: `test/m58-d2-fixture-helper.test.js`, `test/fixtures/m58-d2/synthetic-suite/`

- Add SC1 evidence test: synthetic suite runs → ledger has 5 rows with matching runId
- Add SC4 evidence test: subsequent `purgeRunInserts({runId})` removes those 5 from `data.json` and reports `purged.length === 5, errors.length === 0`
- SC3 evidence test: planted adapter-failure fixture → verify-step would FAIL (assertion `errors.length > 0`)
- These tests are pre-staged for integrate to wire the verify-step text in.

### M58-D2-T5 — Doc-ripple prep
**Touches**: prepares deltas for integrate (no command-file edits yet)

- Draft text for `templates/CLAUDE-global.md` E2E section: "After Playwright runs, GSD-T's verify-final-step automatically purges test data registered via the `withTestData()` fixture; tests MUST use the fixture for any data they insert."
- Draft `gsd-t-help.md` entry for `gsd-t test-data`
- Draft `GSD-T-README.md` + `README.md` snippet
- File this work as `templates/test-helpers/README.md` (it's a real file D2 owns) — integrate phase pulls from it into the shared command files

## Wave plan

T1 → T2 → T3 → T4 → T5 (sequential within D2). Runs in parallel with D1.
