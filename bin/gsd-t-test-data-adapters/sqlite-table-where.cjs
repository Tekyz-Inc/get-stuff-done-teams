/**
 * Adapter: sqlite-table-where
 *
 * Purges a row from a SQLite table by ID, with a tagged-prefix LIKE guard.
 * `store` is `dbPath|table|idColumn` (three pipe-separated segments).
 *
 * `better-sqlite3` is dynamically required at adapter-use time — adapter
 * still loads when the module isn't installed. Tests self-skip in that case.
 */
const fs = require('node:fs');

const KIND = 'sqlite-table-where';

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseStore(store) {
  if (typeof store !== 'string') {
    throw new Error('sqlite-table-where: store must be "dbPath|table|idColumn"');
  }
  const parts = store.split('|');
  if (parts.length !== 3) {
    throw new Error('sqlite-table-where: store must be "dbPath|table|idColumn"');
  }
  const [dbPath, table, idColumn] = parts.map((s) => s.trim());
  if (!dbPath || !table || !idColumn) {
    throw new Error('sqlite-table-where: empty segment in store');
  }
  if (!IDENT_RE.test(table)) {
    throw new Error(`sqlite-table-where: invalid table identifier "${table}"`);
  }
  if (!IDENT_RE.test(idColumn)) {
    throw new Error(`sqlite-table-where: invalid idColumn identifier "${idColumn}"`);
  }
  return { dbPath, table, idColumn };
}

function purge({ store, id, taggedPrefix }) {
  const { dbPath, table, idColumn } = parseStore(store);
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('sqlite-table-where: id must be a non-empty string');
  }
  if (typeof taggedPrefix !== 'string' || taggedPrefix.length === 0) {
    throw new Error('sqlite-table-where: taggedPrefix is required for SQL safety');
  }
  if (!id.startsWith(taggedPrefix)) {
    throw new Error(`sqlite-table-where: tag prefix mismatch (id="${id}", taggedPrefix="${taggedPrefix}")`);
  }
  if (!fs.existsSync(dbPath)) {
    return 'absent';
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    throw new Error('sqlite-table-where: better-sqlite3 not installed; cannot purge');
  }

  const db = new Database(dbPath);
  try {
    // Identifiers are validated against IDENT_RE; values use bind parameters.
    const sql = `DELETE FROM "${table}" WHERE "${idColumn}" = ? AND "${idColumn}" LIKE ?`;
    const stmt = db.prepare(sql);
    const info = stmt.run(id, taggedPrefix + '%');
    return info.changes > 0 ? 'purged' : 'absent';
  } finally {
    db.close();
  }
}

module.exports = { kind: KIND, purge };
