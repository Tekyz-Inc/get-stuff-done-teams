# M58-D2 Constraints

## Hard

- The Playwright fixture helper MUST work with `@playwright/test ^1.40` (the version GSD-T templates and example projects bundle).
- Fixture MUST NOT require D1's ledger to be installed at runtime — it writes ledger rows via `appendInsert` from the published GSD-T package (zero adapter-side npm deps).
- The new verify Step MUST FAIL the verify run when `errors.length > 0`, exactly equivalent to existing FAIL-blocking Steps (e.g., Step 2.6 CI-Parity Gate).
- Tagging is enforced at adapter-purge time (defense in depth), not just at insert time.

## Soft

- Fixture should not auto-purge per-test by default; the verify-final-step is the canonical purge point. Per-test cleanup is opt-in via `withTestData({purgePerTest: true})`.

## Out of scope

- Modifying existing GSD-T-Board test specs to use the fixture (separate downstream concern — handled by GSD-T-Board's next verify run after M58 ships).
- Backfilling test-data ledgers for already-orphaned records in production projects (one-shot cleanup script — backlog candidate).
