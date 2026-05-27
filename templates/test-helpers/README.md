# GSD-T Test Helpers

Helpers that test suites can import to keep test data out of production stores.

## `test-data-fixture.ts`

Playwright fixture (`withTestData`) that auto-registers test inserts with the
GSD-T test-data ledger. After Playwright finishes, the verify-final-step
(`gsd-t-verify` Step 4.5) sweeps the ledger and purges every registered row.

### Install

```ts
// playwright.config.ts (no changes — fixture is plugged in per-spec or via a base test)

// test/_base.ts
import { test as base } from '@playwright/test';
import { withTestData } from '@tekyzinc/gsd-t/templates/test-helpers/test-data-fixture';

export const test = base.extend(withTestData());
export { expect } from '@playwright/test';
```

### Use

```ts
import { test } from './_base';

test('drag idea creates new column', async ({ page, testData }) => {
  const id = testData.tag('E2E_DRAG');
  await testData.register({
    kind: 'localStorage-key-prefix',
    store: 'gsd-t-board:idea:',
    id,
    taggedPrefix: 'E2E_',
  });

  // ... interact with the UI; the app inserts a row keyed by `gsd-t-board:idea:${id}` ...
});
```

### Tagging Convention

All IDs that flow through `testData.register()` MUST start with a recognized
prefix. Defaults to `E2E_`. Projects can declare additional prefixes in
`.gsd-t/test-data-config.json`:

```json
{ "taggedPrefixes": ["E2E_", "FIXTURE_", "INTEGRATION_"] }
```

`testData.tag(prefix)` composes IDs of the form
`{PREFIX}_{verifyRunId}_{counter}` — e.g.
`E2E_DRAG_verify-m58-20260527T091800Z_3`.

### How purge happens

1. Each call to `testData.register(...)` appends a JSONL row to
   `.gsd-t/test-data-ledger.jsonl`.
2. After Playwright runs, `gsd-t-verify` Step 4.5 executes
   `gsd-t test-data --purge --run "$GSD_T_VERIFY_RUN_ID"`.
3. The ledger is read; each row is dispatched to its `kind`'s adapter; the
   adapter removes the record from the store (or reports `absent` /
   structured `error`).
4. If any row produces an error, verify FAILs the Test Data Cleanup Gate
   (block-promotion semantics — equivalent to a failing CI-Parity Gate).

### Opt-in per-test purge

For long suites where you want to clean up after every test, pass
`purgePerTest: true`:

```ts
export const test = base.extend(withTestData({ purgePerTest: true }));
```

This invokes `purgeRunInserts` in the fixture's `afterEach` instead of
deferring to the verify-final-step. Most suites should leave it off — the
verify step is the canonical sweep and avoids per-test overhead.

### Verify-run id

The fixture reads `process.env.GSD_T_VERIFY_RUN_ID` and uses it as the
ledger `runId`. `gsd-t-verify` sets this at the top of the verify run as
`verify-${MILESTONE}-$(date -u +%Y%m%dT%H%M%SZ)`. For local development
runs (where the env var is absent), the fixture falls back to
`local-${randomUUID()}` so the ledger is still coherent.

### What this does NOT do

- It does NOT enforce that every test uses the fixture — the gate works by
  finding orphans, not by lint. A test that bypasses the fixture and inserts
  data the gate doesn't know about will leave that data behind.
- It does NOT clean up data inserted before the suite started — that's a
  pre-existing data hygiene concern.
- It does NOT roll back database transactions. Use it for additive inserts
  (rows, keys, files); for transactional cleanup, use your store's native
  rollback.
