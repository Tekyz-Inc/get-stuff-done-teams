/**
 * GSD-T M58 — Playwright Test Data fixture
 *
 * Auto-registers test data inserts with the GSD-T ledger so the Test Data
 * Cleanup Gate (gsd-t-verify Step 4.5) can purge them after the suite.
 *
 * Usage:
 *
 *   import { test as base } from '@playwright/test';
 *   import { withTestData } from '@tekyzinc/gsd-t/templates/test-helpers/test-data-fixture';
 *
 *   export const test = base.extend(withTestData());
 *
 *   test('drag idea creates new column', async ({ page, testData }) => {
 *     const id = testData.tag('E2E_DRAG');
 *     await testData.register({
 *       kind: 'localStorage-key-prefix',
 *       store: 'gsd-t-board:idea:',
 *       id,
 *       taggedPrefix: 'E2E_',
 *     });
 *     // ... UI interactions that insert {key: 'gsd-t-board:idea:' + id} ...
 *   });
 *
 * Tagging convention: `{PREFIX}_{verifyRunId}_{counter}`.
 *
 * Run id comes from `process.env.GSD_T_VERIFY_RUN_ID` (set by gsd-t-verify).
 * If absent, the fixture falls back to a per-process UUID so local runs still
 * write a coherent ledger.
 */

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

// Resolve the ledger module path at runtime so this template file does not
// require build-time linkage to the published package.
function resolveLedger(): {
  appendInsert: (row: LedgerRow) => { ok: boolean; ledgerPath: string };
} {
  // Caller can override via env (used by synthetic suites under test/fixtures/m58-d2/).
  const override = process.env.GSD_T_LEDGER_MODULE_PATH;
  const modulePath = override
    ? path.resolve(override)
    : require.resolve('@tekyzinc/gsd-t/bin/gsd-t-test-data-ledger.cjs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(modulePath);
}

type AdapterKind = 'localStorage-key-prefix' | 'file-json-array' | 'sqlite-table-where' | string;

interface LedgerRow {
  projectDir: string;
  runId: string;
  kind: AdapterKind;
  store: string;
  id: string;
  taggedPrefix?: string;
  insertedAt?: string;
}

export interface TestDataHandle {
  /**
   * Compose a tagged identifier of the form `{PREFIX}_{runId}_{counter}`.
   * Default prefix is `E2E_`.
   */
  tag(prefix?: string): string;

  /**
   * Record an insert in the ledger. Must be called before / immediately
   * after the test inserts the row in its store so the verify-final-step
   * can purge it.
   */
  register(opts: {
    kind: AdapterKind;
    store: string;
    id: string;
    taggedPrefix?: string;
  }): Promise<void>;

  /**
   * The runId this fixture is writing under (read-only).
   */
  readonly runId: string;
}

export interface WithTestDataOptions {
  /**
   * Project directory (defaults to process.cwd()).
   */
  projectDir?: string;

  /**
   * Default tag prefix when `tag()` is called without one (defaults to `E2E_`).
   */
  defaultPrefix?: string;

  /**
   * Opt-in: per-test purge in `test.afterEach`. Default false — the canonical
   * purge point is gsd-t-verify Step 4.5 (`gsd-t test-data --purge --run`).
   */
  purgePerTest?: boolean;
}

export function withTestData(opts: WithTestDataOptions = {}) {
  const projectDir = opts.projectDir || process.cwd();
  const defaultPrefix = opts.defaultPrefix || 'E2E_';
  const runId = process.env.GSD_T_VERIFY_RUN_ID || `local-${randomUUID()}`;

  // Playwright fixture factory shape: { testData: [async ({}, use) => {...}, { scope: 'test' }] }
  return {
    testData: [
      async ({}, use: (handle: TestDataHandle) => Promise<void>) => {
        let counter = 0;
        const ledger = resolveLedger();
        const handle: TestDataHandle = {
          runId,
          tag(prefix?: string) {
            const p = prefix || defaultPrefix;
            counter += 1;
            // Normalise prefix to end with '_' so composed IDs match the
            // taggedPrefix the adapter will guard against.
            const base = p.endsWith('_') ? p : `${p}_`;
            return `${base}${runId}_${counter}`;
          },
          async register({ kind, store, id, taggedPrefix }) {
            const prefix = taggedPrefix || defaultPrefix;
            ledger.appendInsert({
              projectDir,
              runId,
              kind,
              store,
              id,
              taggedPrefix: prefix,
            });
          },
        };
        await use(handle);
        // Per-test purge is opt-in; canonical sweep is the verify-final-step.
        if (opts.purgePerTest) {
          // Lazy-load purgeRunInserts only when opted in.
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const ledgerMod = require(
            process.env.GSD_T_LEDGER_MODULE_PATH
              ? path.resolve(process.env.GSD_T_LEDGER_MODULE_PATH)
              : '@tekyzinc/gsd-t/bin/gsd-t-test-data-ledger.cjs',
          );
          await ledgerMod.purgeRunInserts({ projectDir, runId });
        }
      },
      { scope: 'test' },
    ],
  };
}
