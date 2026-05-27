/**
 * Adapter: file-json-array
 *
 * Purges a record from a JSON file containing an array.
 * `store` is the file path; `id` is the value of the `id` field on the matching row.
 *
 * Refuses to delete a record whose `id` does not start with `taggedPrefix`.
 * Atomic rewrite (write-temp + rename).
 */
const fs = require('node:fs');
const path = require('node:path');

const KIND = 'file-json-array';

function purge({ store, id, taggedPrefix }) {
  if (typeof store !== 'string' || store.length === 0) {
    throw new Error('file-json-array: store must be a non-empty file path');
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('file-json-array: id must be a non-empty string');
  }
  if (typeof taggedPrefix === 'string' && taggedPrefix.length > 0 && !id.startsWith(taggedPrefix)) {
    throw new Error(`file-json-array: tag prefix mismatch (id="${id}", taggedPrefix="${taggedPrefix}")`);
  }

  if (!fs.existsSync(store)) {
    return 'absent';
  }
  let raw;
  try {
    raw = fs.readFileSync(store, 'utf8');
  } catch (e) {
    throw new Error(`file-json-array: read failed: ${e.message}`);
  }
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (e) {
    throw new Error(`file-json-array: parse failed: ${e.message}`);
  }
  if (!Array.isArray(arr)) {
    throw new Error('file-json-array: store contents are not an array');
  }
  const before = arr.length;
  const next = arr.filter((row) => !(row && typeof row === 'object' && row.id === id));
  if (next.length === before) {
    return 'absent';
  }
  // Atomic rewrite
  const tmp = `${store}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, store);
  return 'purged';
}

module.exports = { kind: KIND, purge };
