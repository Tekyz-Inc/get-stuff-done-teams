/**
 * M58-D1 — Test Data Ledger core tests
 * SC1: ledger records 5 inserts from a synthetic fixture
 * SC2: purgeRunInserts removes those 5 from a file-json-array store and reports purged.length===5
 * SC3: adapter failure → row goes to errors[], remaining rows still processed
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  appendInsert,
  listInserts,
  purgeRunInserts,
  registerAdapter,
  ledgerPathFor,
} = require('../bin/gsd-t-test-data-ledger.cjs');

function makeProjectDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm58-d1-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  return dir;
}

test('appendInsert validates required fields', () => {
  const projectDir = makeProjectDir();
  assert.throws(() => appendInsert({}), /projectDir is required/);
  assert.throws(() => appendInsert({ projectDir }), /runId is required/);
  assert.throws(() => appendInsert({ projectDir, runId: 'r1' }), /kind is required/);
  assert.throws(() => appendInsert({ projectDir, runId: 'r1', kind: 'file-json-array' }), /store is required/);
  assert.throws(
    () => appendInsert({ projectDir, runId: 'r1', kind: 'file-json-array', store: '/tmp/x' }),
    /id is required/,
  );
});

test('appendInsert refuses id without taggedPrefix', () => {
  const projectDir = makeProjectDir();
  assert.throws(
    () => appendInsert({
      projectDir,
      runId: 'r1',
      kind: 'file-json-array',
      store: '/tmp/x',
      id: 'BARE_ID',
    }),
    /does not start with taggedPrefix/,
  );
});

test('appendInsert writes one JSONL line per call', () => {
  const projectDir = makeProjectDir();
  const ledger = ledgerPathFor(projectDir);
  appendInsert({ projectDir, runId: 'r1', kind: 'file-json-array', store: '/tmp/a', id: 'E2E_1' });
  appendInsert({ projectDir, runId: 'r1', kind: 'file-json-array', store: '/tmp/a', id: 'E2E_2' });
  const raw = fs.readFileSync(ledger, 'utf8');
  const lines = raw.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 2);
  for (const line of lines) JSON.parse(line); // each line must be valid JSON
});

test('SC1 — ledger records 5 inserts from synthetic fixture', () => {
  const projectDir = makeProjectDir();
  const runId = 'verify-m58-test';
  for (let i = 1; i <= 5; i++) {
    appendInsert({
      projectDir,
      runId,
      kind: 'file-json-array',
      store: path.join(projectDir, 'data.json'),
      id: `E2E_TEST_${i}`,
    });
  }
  const rows = listInserts({ projectDir, runId });
  assert.equal(rows.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.equal(rows[i].id, `E2E_TEST_${i + 1}`);
    assert.equal(rows[i].runId, runId);
    assert.equal(rows[i].taggedPrefix, 'E2E_');
  }
});

test('listInserts filters by runId', () => {
  const projectDir = makeProjectDir();
  appendInsert({ projectDir, runId: 'run-A', kind: 'file-json-array', store: '/tmp/a', id: 'E2E_A' });
  appendInsert({ projectDir, runId: 'run-B', kind: 'file-json-array', store: '/tmp/b', id: 'E2E_B' });
  appendInsert({ projectDir, runId: 'run-A', kind: 'file-json-array', store: '/tmp/a', id: 'E2E_A2' });
  const all = listInserts({ projectDir });
  assert.equal(all.length, 3);
  const runA = listInserts({ projectDir, runId: 'run-A' });
  assert.equal(runA.length, 2);
  const runB = listInserts({ projectDir, runId: 'run-B' });
  assert.equal(runB.length, 1);
});

test('listInserts returns [] on missing ledger', () => {
  const projectDir = makeProjectDir();
  const rows = listInserts({ projectDir, runId: 'nonexistent' });
  assert.deepEqual(rows, []);
});

test('listInserts skips malformed JSONL lines', () => {
  const projectDir = makeProjectDir();
  const ledger = ledgerPathFor(projectDir);
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, [
    JSON.stringify({ runId: 'r1', kind: 'file-json-array', store: '/x', id: 'E2E_1', taggedPrefix: 'E2E_', insertedAt: 'now' }),
    'not-json',
    '',
    JSON.stringify({ runId: 'r1', kind: 'file-json-array', store: '/x', id: 'E2E_2', taggedPrefix: 'E2E_', insertedAt: 'now' }),
  ].join('\n'));
  const rows = listInserts({ projectDir, runId: 'r1' });
  assert.equal(rows.length, 2);
});

test('SC2 — purgeRunInserts removes 5 rows from file-json-array and reports purged.length===5', async () => {
  const projectDir = makeProjectDir();
  const dataPath = path.join(projectDir, 'data.json');
  const initialData = [
    { id: 'REAL_USER_1', name: 'Alice' },
    { id: 'E2E_TEST_1', name: 't1' },
    { id: 'E2E_TEST_2', name: 't2' },
    { id: 'E2E_TEST_3', name: 't3' },
    { id: 'E2E_TEST_4', name: 't4' },
    { id: 'E2E_TEST_5', name: 't5' },
    { id: 'REAL_USER_2', name: 'Bob' },
  ];
  fs.writeFileSync(dataPath, JSON.stringify(initialData));
  const runId = 'verify-m58-sc2';
  for (let i = 1; i <= 5; i++) {
    appendInsert({
      projectDir, runId,
      kind: 'file-json-array', store: dataPath, id: `E2E_TEST_${i}`,
    });
  }
  const envelope = await purgeRunInserts({ projectDir, runId });
  assert.equal(envelope.purged.length, 5);
  assert.equal(envelope.skipped.length, 0);
  assert.equal(envelope.errors.length, 0);
  const after = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.equal(after.length, 2);
  assert.deepEqual(after.map((r) => r.id).sort(), ['REAL_USER_1', 'REAL_USER_2']);
});

test('purgeRunInserts dry-run does not call adapter', async () => {
  const projectDir = makeProjectDir();
  const dataPath = path.join(projectDir, 'data.json');
  fs.writeFileSync(dataPath, JSON.stringify([{ id: 'E2E_X', name: 'x' }]));
  appendInsert({ projectDir, runId: 'r1', kind: 'file-json-array', store: dataPath, id: 'E2E_X' });
  const envelope = await purgeRunInserts({ projectDir, runId: 'r1', dryRun: true });
  assert.equal(envelope.purged.length, 1);
  // File untouched
  const after = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.equal(after.length, 1);
});

test('SC3 — adapter failure routed to errors[], remaining rows still processed', async () => {
  const projectDir = makeProjectDir();
  // Register a custom adapter that fails for id ending in "FAIL", succeeds otherwise
  let callCount = 0;
  registerAdapter('test-flaky', {
    kind: 'test-flaky',
    purge: ({ id }) => {
      callCount++;
      if (id.endsWith('FAIL')) throw new Error('synthetic store-write failure');
      return 'purged';
    },
  });
  const runId = 'r-sc3';
  appendInsert({ projectDir, runId, kind: 'test-flaky', store: 'mem', id: 'E2E_1' });
  appendInsert({ projectDir, runId, kind: 'test-flaky', store: 'mem', id: 'E2E_FAIL' });
  appendInsert({ projectDir, runId, kind: 'test-flaky', store: 'mem', id: 'E2E_3' });
  const envelope = await purgeRunInserts({ projectDir, runId });
  assert.equal(callCount, 3, 'all 3 rows must be attempted');
  assert.equal(envelope.purged.length, 2);
  assert.equal(envelope.errors.length, 1);
  assert.equal(envelope.errors[0].record.id, 'E2E_FAIL');
  assert.match(envelope.errors[0].message, /synthetic store-write failure/);
});

test('unknown adapter kind produces structured error', async () => {
  const projectDir = makeProjectDir();
  appendInsert({ projectDir, runId: 'r1', kind: 'nonexistent-kind', store: 'x', id: 'E2E_X' });
  const envelope = await purgeRunInserts({ projectDir, runId: 'r1' });
  assert.equal(envelope.errors.length, 1);
  assert.match(envelope.errors[0].message, /no adapter registered for kind/);
});

test('registerAdapter validates inputs', () => {
  assert.throws(() => registerAdapter(), /kind must be/);
  assert.throws(() => registerAdapter('', {}), /kind must be/);
  assert.throws(() => registerAdapter('x', {}), /must export a purge/);
  assert.throws(() => registerAdapter('x', { purge: 'notfn' }), /must export a purge/);
});

test('purgeRunInserts validates inputs', async () => {
  await assert.rejects(() => purgeRunInserts({}), /projectDir is required/);
  await assert.rejects(() => purgeRunInserts({ projectDir: '/tmp' }), /runId is required/);
});

test('ledgerPathFor returns canonical relative path under projectDir', () => {
  const p = ledgerPathFor('/proj');
  assert.equal(p, path.join('/proj', '.gsd-t', 'test-data-ledger.jsonl'));
});
