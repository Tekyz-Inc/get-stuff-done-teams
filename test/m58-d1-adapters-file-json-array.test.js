const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { purge, kind } = require('../bin/gsd-t-test-data-adapters/file-json-array.cjs');

function mktmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm58-d1-fja-'));
}

test('kind is file-json-array', () => {
  assert.equal(kind, 'file-json-array');
});

test('purge removes matching row and reports purged', () => {
  const dir = mktmp();
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify([
    { id: 'E2E_1', name: 't1' },
    { id: 'REAL', name: 'r' },
  ]));
  const result = purge({ store: file, id: 'E2E_1', taggedPrefix: 'E2E_' });
  assert.equal(result, 'purged');
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(after.length, 1);
  assert.equal(after[0].id, 'REAL');
});

test('purge returns absent when id not present', () => {
  const dir = mktmp();
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'REAL', name: 'r' }]));
  const result = purge({ store: file, id: 'E2E_MISSING', taggedPrefix: 'E2E_' });
  assert.equal(result, 'absent');
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(after.length, 1);
});

test('purge returns absent when file does not exist', () => {
  const dir = mktmp();
  const file = path.join(dir, 'missing.json');
  const result = purge({ store: file, id: 'E2E_X', taggedPrefix: 'E2E_' });
  assert.equal(result, 'absent');
});

test('purge throws on tag prefix mismatch', () => {
  const dir = mktmp();
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'NOT_TAGGED', name: 'x' }]));
  assert.throws(
    () => purge({ store: file, id: 'NOT_TAGGED', taggedPrefix: 'E2E_' }),
    /tag prefix mismatch/,
  );
  // File untouched
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(after.length, 1);
});

test('purge throws on non-array contents', () => {
  const dir = mktmp();
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify({ not: 'array' }));
  assert.throws(
    () => purge({ store: file, id: 'E2E_X', taggedPrefix: 'E2E_' }),
    /not an array/,
  );
});

test('purge throws on malformed JSON', () => {
  const dir = mktmp();
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, 'not json');
  assert.throws(
    () => purge({ store: file, id: 'E2E_X', taggedPrefix: 'E2E_' }),
    /parse failed/,
  );
});

test('purge requires non-empty store and id', () => {
  assert.throws(() => purge({ store: '', id: 'E2E_X', taggedPrefix: 'E2E_' }), /non-empty file path/);
  assert.throws(() => purge({ store: '/tmp/x', id: '', taggedPrefix: 'E2E_' }), /non-empty string/);
});

test('purge is atomic (write-temp + rename leaves no debris on success)', () => {
  const dir = mktmp();
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'E2E_1' }]));
  purge({ store: file, id: 'E2E_1', taggedPrefix: 'E2E_' });
  const entries = fs.readdirSync(dir);
  assert.equal(entries.length, 1);
  assert.equal(entries[0], 'data.json');
});
