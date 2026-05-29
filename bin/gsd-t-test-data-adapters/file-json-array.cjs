/**
 * Adapter: file-json-array
 *
 * Purges a record from a JSON file containing an array.
 * `store` is the file path; `id` is the value of the `id` field on the matching row.
 *
 * Refuses to delete a record whose `id` does not start with `taggedPrefix`.
 * `taggedPrefix` is REQUIRED and non-empty — an empty/omitted prefix would
 * disable the guard entirely (Red Team CRITICAL, M60). Atomic rewrite
 * (write-temp + rename).
 *
 * When `projectDir` is supplied, `store` MUST resolve inside it — the adapter
 * refuses paths outside-AND-equal-to projectDir (containment predicate from
 * feedback_destructive_path_ops_containment). Prevents a tampered ledger from
 * becoming a write-anywhere delete primitive.
 */
const fs = require('node:fs');
const path = require('node:path');

const KIND = 'file-json-array';

function assertContained(store, projectDir) {
  if (typeof projectDir !== 'string' || projectDir.length === 0) {
    return; // no projectDir supplied — containment not enforceable, caller's choice
  }
  const root = path.resolve(projectDir);
  const resolved = path.resolve(store);
  if (!(resolved.startsWith(root + path.sep) && resolved !== root)) {
    throw new Error(
      `file-json-array: store path "${store}" resolves outside projectDir "${projectDir}" — refused (containment guard)`
    );
  }
}

function purge({ store, id, taggedPrefix, projectDir }) {
  if (typeof store !== 'string' || store.length === 0) {
    throw new Error('file-json-array: store must be a non-empty file path');
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('file-json-array: id must be a non-empty string');
  }
  if (typeof taggedPrefix !== 'string' || taggedPrefix.length === 0) {
    throw new Error('file-json-array: taggedPrefix is required and must be non-empty (guard cannot be disabled)');
  }
  if (!id.startsWith(taggedPrefix)) {
    throw new Error(`file-json-array: tag prefix mismatch (id="${id}", taggedPrefix="${taggedPrefix}")`);
  }
  assertContained(store, projectDir);

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
