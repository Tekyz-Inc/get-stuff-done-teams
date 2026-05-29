/**
 * M60 — Red Team regression suite for the M58 test-data adapters.
 *
 * The M58 milestone shipped (v3.28.10) with a CRITICAL data-destruction bug
 * that its own Red Team missed: the tag-prefix guard in two of three adapters
 * short-circuited on an empty/undefined taggedPrefix, and no adapter enforced
 * projectDir containment on the `store` path. A native-Workflow Red Team bake-off
 * (Opus 4.8, defense-in-depth + containment lenses) found and reproduced it.
 *
 * These tests pin every finding so it can never recur. Each test name maps to a
 * Red Team finding from the bake-off.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const fja = require('../bin/gsd-t-test-data-adapters/file-json-array.cjs');
const lsp = require('../bin/gsd-t-test-data-adapters/localstorage-key-prefix.cjs');
const sql = require('../bin/gsd-t-test-data-adapters/sqlite-table-where.cjs');

function mktmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm60-rt-'));
}

// ── Finding 1 (CRITICAL): empty taggedPrefix disables the guard ────────────

test('CRITICAL: file-json-array refuses empty taggedPrefix (guard cannot be disabled)', () => {
  const dir = mktmp();
  const file = path.join(dir, 'prod.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'prod-account-1', balance: 50000 }]));
  assert.throws(
    () => fja.purge({ store: file, id: 'prod-account-1', taggedPrefix: '' }),
    /taggedPrefix is required/i
  );
  // Production record must survive the refused purge.
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(after.some((r) => r.id === 'prod-account-1'), 'prod record preserved');
});

test('CRITICAL: file-json-array refuses undefined taggedPrefix', () => {
  const dir = mktmp();
  const file = path.join(dir, 'prod.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'prod-account-1' }]));
  assert.throws(
    () => fja.purge({ store: file, id: 'prod-account-1' }),
    /taggedPrefix is required/i
  );
});

test('CRITICAL: localStorage-key-prefix refuses empty taggedPrefix', async () => {
  await assert.rejects(
    () => lsp.purge({ page: null, store: 'app:', id: 'prod-session-99', taggedPrefix: '' }),
    /taggedPrefix is required/i
  );
});

test('CRITICAL: localStorage-key-prefix refuses undefined taggedPrefix', async () => {
  await assert.rejects(
    () => lsp.purge({ page: null, store: 'app:', id: 'prod-session-99' }),
    /taggedPrefix is required/i
  );
});

// ── Finding 2/3 (HIGH): projectDir containment on store path ───────────────

test('HIGH: file-json-array refuses store resolving outside projectDir', () => {
  const projectDir = mktmp();
  const outside = path.join(mktmp(), 'outside.json'); // different tmp dir
  fs.writeFileSync(outside, JSON.stringify([{ id: 'E2E_x' }]));
  assert.throws(
    () => fja.purge({ store: outside, id: 'E2E_x', taggedPrefix: 'E2E_', projectDir }),
    /outside projectDir|containment/i
  );
  // File outside the project must be untouched.
  const after = JSON.parse(fs.readFileSync(outside, 'utf8'));
  assert.ok(after.some((r) => r.id === 'E2E_x'), 'out-of-project file untouched');
});

test('HIGH: file-json-array refuses store equal to projectDir root', () => {
  const projectDir = mktmp();
  assert.throws(
    () => fja.purge({ store: projectDir, id: 'E2E_x', taggedPrefix: 'E2E_', projectDir }),
    /outside projectDir|containment/i
  );
});

test('HIGH: sqlite-table-where refuses dbPath outside projectDir', () => {
  const projectDir = mktmp();
  const outsideDb = path.join(mktmp(), 'evil.db');
  assert.throws(
    () => sql.purge({ store: `${outsideDb}|users|id`, id: 'E2E_x', taggedPrefix: 'E2E_', projectDir }),
    /outside projectDir|containment/i
  );
});

// ── Happy path: legit in-project tagged purge still works (no over-blocking) ─

test('happy path: in-project tagged purge succeeds and preserves untagged rows', () => {
  const projectDir = mktmp();
  const file = path.join(projectDir, 'data.json');
  fs.writeFileSync(file, JSON.stringify([
    { id: 'E2E_legit_1', t: 1 },
    { id: 'keep-me', prod: true },
  ]));
  const result = fja.purge({ store: file, id: 'E2E_legit_1', taggedPrefix: 'E2E_', projectDir });
  assert.equal(result, 'purged');
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(after.some((r) => r.id === 'keep-me'), 'untagged prod row preserved');
  assert.ok(!after.some((r) => r.id === 'E2E_legit_1'), 'tagged test row removed');
});

test('happy path: containment guard stays inert when no projectDir supplied (back-compat)', () => {
  const dir = mktmp();
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'E2E_1' }]));
  // No projectDir → containment not enforceable, but tag guard still applies.
  const result = fja.purge({ store: file, id: 'E2E_1', taggedPrefix: 'E2E_' });
  assert.equal(result, 'purged');
});

// ── Finding: tag guard is a real boundary, not consistency-only ────────────

test('HIGH: tagged prefix mismatch still refused (id must start with prefix)', () => {
  const dir = mktmp();
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'prod-account-1' }]));
  assert.throws(
    () => fja.purge({ store: file, id: 'prod-account-1', taggedPrefix: 'E2E_' }),
    /tag prefix mismatch/i
  );
});
