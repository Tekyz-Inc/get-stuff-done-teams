const test = require('node:test');
const assert = require('node:assert/strict');

const { purge, kind } = require('../bin/gsd-t-test-data-adapters/localstorage-key-prefix.cjs');

test('kind is localStorage-key-prefix', () => {
  assert.equal(kind, 'localStorage-key-prefix');
});

test('purge returns absent when no page is provided', async () => {
  const result = await purge({ store: 'prefix:', id: 'E2E_1', taggedPrefix: 'E2E_' });
  assert.equal(result, 'absent');
});

test('purge calls page.evaluate with composed key and reports purged when removed', async () => {
  let receivedKey = null;
  const fakeStore = { 'prefix:E2E_1': 'value' };
  const page = {
    evaluate: async (fn, k) => {
      receivedKey = k;
      const has = Object.prototype.hasOwnProperty.call(fakeStore, k);
      if (!has) return 'absent';
      delete fakeStore[k];
      return 'purged';
    },
  };
  const result = await purge({ page, store: 'prefix:', id: 'E2E_1', taggedPrefix: 'E2E_' });
  assert.equal(receivedKey, 'prefix:E2E_1');
  assert.equal(result, 'purged');
  assert.equal(Object.prototype.hasOwnProperty.call(fakeStore, 'prefix:E2E_1'), false);
});

test('purge reports absent when key is missing in localStorage', async () => {
  const page = {
    evaluate: async () => 'absent',
  };
  const result = await purge({ page, store: 'prefix:', id: 'E2E_MISSING', taggedPrefix: 'E2E_' });
  assert.equal(result, 'absent');
});

test('purge throws on tag prefix mismatch', async () => {
  const page = { evaluate: async () => { throw new Error('should not be called'); } };
  await assert.rejects(
    () => purge({ page, store: 'p:', id: 'BARE_ID', taggedPrefix: 'E2E_' }),
    /tag prefix mismatch/,
  );
});

test('purge requires non-empty store and id', async () => {
  await assert.rejects(() => purge({ store: '', id: 'E2E_X', taggedPrefix: 'E2E_' }), /non-empty key prefix/);
  await assert.rejects(() => purge({ store: 'p:', id: '', taggedPrefix: 'E2E_' }), /non-empty string/);
});
