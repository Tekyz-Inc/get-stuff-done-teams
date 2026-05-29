/**
 * Adapter: localStorage-key-prefix
 *
 * Purges a key from browser localStorage. Designed to be called from
 * Playwright host side via `page.evaluate`.
 *
 * Caller passes `page` via `purge({ page, store, id, taggedPrefix })`.
 * `store` is the key prefix; `id` is the suffix. Final key = store + id.
 *
 * When `page` is omitted, the adapter returns 'absent' rather than throwing
 * — this lets ledger.purgeRunInserts run cleanly when no live browser is
 * present (e.g., after Playwright tears down). Verify-step semantics: if
 * Playwright is gone, the data is gone too (unless persisted server-side,
 * which other adapters handle).
 */
const KIND = 'localStorage-key-prefix';

async function purge({ page, store, id, taggedPrefix }) {
  if (typeof store !== 'string' || store.length === 0) {
    throw new Error('localStorage-key-prefix: store must be a non-empty key prefix');
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('localStorage-key-prefix: id must be a non-empty string');
  }
  // taggedPrefix is REQUIRED and non-empty — an empty/omitted prefix would
  // disable the guard entirely (Red Team CRITICAL, M60).
  if (typeof taggedPrefix !== 'string' || taggedPrefix.length === 0) {
    throw new Error('localStorage-key-prefix: taggedPrefix is required and must be non-empty (guard cannot be disabled)');
  }
  if (!id.startsWith(taggedPrefix)) {
    throw new Error(`localStorage-key-prefix: tag prefix mismatch (id="${id}", taggedPrefix="${taggedPrefix}")`);
  }

  // Browser-side cleanup requires a live page. If absent, treat as 'absent'.
  if (!page || typeof page.evaluate !== 'function') {
    return 'absent';
  }

  const key = store + id;
  const result = await page.evaluate((k) => {
    if (typeof window === 'undefined' || !window.localStorage) return 'absent';
    if (window.localStorage.getItem(k) === null) return 'absent';
    window.localStorage.removeItem(k);
    return 'purged';
  }, key);
  return result;
}

module.exports = { kind: KIND, purge };
