# M58-D2 — Verify Cleanup Step + Tagging Convention

## Purpose

Make test data cleanup automatic from the test author's perspective (Playwright fixture) and mandatory from the gate's perspective (new Step in gsd-t-verify).

## Files Owned

- `templates/test-helpers/test-data-fixture.ts` (NEW)
- `templates/test-helpers/README.md` (NEW)
- `test/m58-d2-fixture-helper.test.js` (NEW)
- `test/fixtures/m58-d2/synthetic-suite/` (NEW — synthetic Playwright suite used by SC1+SC4 evidence tests)
- `.gsd-t/contracts/test-data-tagging-contract.md` (NEW — tagging convention normative)

## Public Surface (Playwright host side)

```ts
import { test as base } from '@playwright/test';
import { withTestData } from '@tekyzinc/gsd-t/test-helpers/test-data-fixture';

export const test = base.extend(withTestData());

// in a spec:
test('drag idea creates new column', async ({ page, testData }) => {
  const id = testData.tag('E2E_DRAG');           // returns "E2E_DRAG_<runId>_<n>"
  await testData.register({
    kind: 'localStorage-key-prefix',
    store: 'gsd-t-board:idea:',
    id,
    taggedPrefix: 'E2E_DRAG',
  });
  // … perform UI work that inserts {key: "gsd-t-board:idea:" + id} into localStorage
});
// On test.afterAll, fixture flushes ledger and (optionally) runs adapter purges per-test.
// On verify-final-step (D2), gsd-t test-data --purge --run <runId> sweeps anything remaining.
```

## Verify Step Wire-In (delivered at integrate)

D2 owns the **content** of the new Step (the wording, ordering, FAIL conditions). The actual `commands/gsd-t-verify.md` edit is sequenced at integrate (shared file with future updates).

Step inserted **after** the E2E suite runs, **before** the VERDICT block:

```
### Step 4.5 — Test Data Cleanup Gate (MANDATORY)

Run `gsd-t test-data --purge --run "$VERIFY_RUN_ID" --json > /tmp/m58-purge.json || true`.

Read the envelope:
- `errors.length > 0` → verify FAIL (Test Data Cleanup Gate). Append `purged/skipped/errors` counts + first 5 error.message values to the verify report.
- `errors.length === 0` → record `Test data: purged=<N> skipped=<M>` in the verify report; continue to VERDICT.

`$VERIFY_RUN_ID` is set at the top of verify Step 1 as `verify-${MILESTONE}-$(date -u +%Y%m%dT%H%M%SZ)`. Playwright fixtures read it from `process.env.GSD_T_VERIFY_RUN_ID` and use it as the ledger `runId`.
```

## Tagging Convention (contract `test-data-tagging-contract.md`)

- All test-inserted IDs MUST be prefixed with `E2E_` (default) or a project-specific opt-in prefix declared in `.gsd-t/test-data-config.json`.
- Tag composition: `{PREFIX}_{verifyRunId}_{counter}` — counter is per-test monotonic, allocated by the fixture's `tag(prefix)` helper.
- Adapters refuse to purge records whose stored `id` does not start with the ledger row's `taggedPrefix`.

## Non-Goals

- D2 does NOT implement the ledger or adapters (D1's job).
- D2 does NOT directly write `bin/gsd-t.js` CLI dispatch (integrate-sequenced).

## Acceptance

- SCs SC3 (verify FAIL on residual+errors), SC4 (clean E2E → orphaned=0 reported), SC7 (doc-ripple).
- Fixture works end-to-end in a synthetic Playwright suite (T1 fixture).
- Contract `test-data-tagging-contract.md` flipped DRAFT → STABLE.
