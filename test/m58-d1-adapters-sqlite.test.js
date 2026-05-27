const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { purge, kind } = require('../bin/gsd-t-test-data-adapters/sqlite-table-where.cjs');

let Database = null;
try {
  Database = require('better-sqlite3');
} catch {
  // module not installed — sqlite-specific tests will self-skip
}

test('kind is sqlite-table-where', () => {
  assert.equal(kind, 'sqlite-table-where');
});

test('purge rejects malformed store strings', () => {
  assert.throws(() => purge({ store: 'only-one-segment', id: 'E2E_X', taggedPrefix: 'E2E_' }), /dbPath\|table\|idColumn/);
  assert.throws(() => purge({ store: 'a|b|c|d', id: 'E2E_X', taggedPrefix: 'E2E_' }), /dbPath\|table\|idColumn/);
  assert.throws(() => purge({ store: 'a||c', id: 'E2E_X', taggedPrefix: 'E2E_' }), /empty segment/);
});

test('purge rejects SQL-unsafe identifiers', () => {
  assert.throws(
    () => purge({ store: '/tmp/x.db|users; DROP TABLE x|id', id: 'E2E_X', taggedPrefix: 'E2E_' }),
    /invalid table identifier/,
  );
  assert.throws(
    () => purge({ store: '/tmp/x.db|users|id" AND 1=1', id: 'E2E_X', taggedPrefix: 'E2E_' }),
    /invalid idColumn identifier/,
  );
});

test('purge requires non-empty taggedPrefix', () => {
  assert.throws(
    () => purge({ store: '/tmp/x.db|users|id', id: 'E2E_X' }),
    /taggedPrefix is required/,
  );
  assert.throws(
    () => purge({ store: '/tmp/x.db|users|id', id: 'E2E_X', taggedPrefix: '' }),
    /taggedPrefix is required/,
  );
});

test('purge refuses tag prefix mismatch', () => {
  // Use a path that doesn't exist so we don't need better-sqlite3 for this branch
  // But the prefix check happens BEFORE the file-exists check, so this works either way.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm58-sqlite-'));
  const dbPath = path.join(dir, 'x.db');
  fs.writeFileSync(dbPath, ''); // placeholder so file-exists passes
  assert.throws(
    () => purge({ store: `${dbPath}|users|id`, id: 'BARE_ID', taggedPrefix: 'E2E_' }),
    /tag prefix mismatch/,
  );
});

test('purge returns absent when db file does not exist', () => {
  const result = purge({
    store: '/tmp/nonexistent-m58.db|users|id',
    id: 'E2E_X',
    taggedPrefix: 'E2E_',
  });
  assert.equal(result, 'absent');
});

test('purge actually deletes from sqlite when row present', { skip: !Database }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm58-sqlite-real-'));
  const dbPath = path.join(dir, 'real.db');
  const db = new Database(dbPath);
  db.exec("CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)");
  db.prepare("INSERT INTO items VALUES (?, ?)").run('E2E_TEST_1', 'one');
  db.prepare("INSERT INTO items VALUES (?, ?)").run('REAL_USER', 'real');
  db.close();

  const result = purge({ store: `${dbPath}|items|id`, id: 'E2E_TEST_1', taggedPrefix: 'E2E_' });
  assert.equal(result, 'purged');

  const db2 = new Database(dbPath);
  const rows = db2.prepare("SELECT id FROM items ORDER BY id").all();
  db2.close();
  assert.deepEqual(rows.map((r) => r.id), ['REAL_USER']);
});

test('purge returns absent for missing sqlite row', { skip: !Database }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm58-sqlite-real2-'));
  const dbPath = path.join(dir, 'real.db');
  const db = new Database(dbPath);
  db.exec("CREATE TABLE items (id TEXT PRIMARY KEY)");
  db.close();
  const result = purge({ store: `${dbPath}|items|id`, id: 'E2E_MISSING', taggedPrefix: 'E2E_' });
  assert.equal(result, 'absent');
});
