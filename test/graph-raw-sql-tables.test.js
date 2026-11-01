'use strict';

/**
 * The code graph indexes plain-SQL database tables.
 *
 * Before: only Drizzle `pgTable(...)` declarations were tables. TimeTracking
 * (express + pg, schema as SQL text) had 0 tables in the graph, so every table
 * question dead-ended, and a table named by a variable (`DELETE FROM ${table}`)
 * was invisible even to a text search.
 *
 * Fixture: test/fixtures/raw-sql-graph — a .sql schema, a migration kept as a TS
 * string (re-declares a table with a clashing column type, adds and drops
 * columns), repository functions that read and write, each way a table name can
 * arrive in a variable (a caller's argument, a list of records, a returned list,
 * a list in the same function), names that cannot be traced, UI text that only
 * looks like SQL, a Python module, and a Drizzle table with a generated migration.
 *
 * [RULE] raw-sql-tables-in-graph
 * [RULE] raw-sql-table-one-per-name
 * [RULE] raw-sql-use-credited-to-holder
 * [RULE] variable-table-name-traced-never-guessed
 * [RULE] blast-radius-follows-table-writes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { scanSql, holeMarker } = require('../bin/gsd-t-graph-sql-scan.cjs');
const { build_index } = require('../bin/gsd-t-graph-index.cjs');

const FIXTURE = path.join(__dirname, 'fixtures', 'raw-sql-graph');
const QUERY_CLI = path.join(__dirname, '..', 'bin', 'gsd-t-graph-query-cli.cjs');

// Fixture sources are checked in as `*.fixture` so the test runner never executes them.
function materialize() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-sql-graph-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.fixture')) fs.renameSync(p, p.slice(0, -'.fixture'.length));
    }
  };
  walk(dir);
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  return dir;
}

let PROJECT = null;
let BUILD = null;
function project() {
  if (PROJECT) return PROJECT;
  PROJECT = materialize();
  // scip: {} → no SCIP; callers come from the name-matched call graph.
  BUILD = build_index(PROJECT, { scip: {} });
  return PROJECT;
}

function query(...args) {
  const r = spawnSync(process.execPath, [QUERY_CLI, ...args], { cwd: project(), encoding: 'utf8' });
  return { status: r.status, env: JSON.parse(r.stdout.trim().split('\n').pop()) };
}

const byUser = (env) => Object.fromEntries(env.results.map((r) => [r.user.split('#')[1], r]));

test.after(() => { if (PROJECT) fs.rmSync(PROJECT, { recursive: true, force: true }); });

// ── 1. The scanner ───────────────────────────────────────────────────────────

test('scanner: declarations, reads, writes and holes', () => {
  const r = scanSql([
    'CREATE TABLE IF NOT EXISTS a (id TEXT PRIMARY KEY, b_id TEXT REFERENCES b(id), CONSTRAINT fk FOREIGN KEY (c_id) REFERENCES c (id));',
    'ALTER TABLE a ADD COLUMN IF NOT EXISTS x INT, DROP COLUMN y;',
    'INSERT INTO a (id) SELECT id FROM b, d JOIN c ON c.id = b.c_id;',
    'UPDATE a SET x = 1 FROM e WHERE a.id = e.id;',
    'DELETE FROM a USING f WHERE a.id = f.id;',
    `DELETE FROM ${holeMarker(0)} WHERE id = $1;`,
  ].join('\n'), { line: 10 });
  assert.deepEqual(r.decls.map((d) => `${d.kind}:${d.table}@${d.line}`), ['create:a@10', 'alter:a@11']);
  const a = r.decls[0];
  assert.deepEqual(a.columns.map((c) => c.name), ['id', 'b_id']);
  assert.equal(a.columns[0].primaryKey, true);
  assert.deepEqual(a.columns[1].references, { table: 'b', column: 'id' });
  assert.deepEqual(a.foreignKeys, [{ columns: ['c_id'], table: 'c', foreignColumns: ['id'] }]);
  assert.deepEqual(r.decls[1].dropped, ['y']);
  assert.deepEqual(r.uses.map((u) => `${u.access}:${u.op}:${u.table}`), [
    'WRITE:insert:a', 'READ:from:b', 'READ:from:d', 'READ:join:c',
    'WRITE:update:a', 'READ:from:e', 'WRITE:delete:a', 'READ:using:f',
  ]);
  assert.deepEqual(r.holes, [{ hole: 0, op: 'delete', access: 'WRITE', line: 15 }]);
});

test('scanner: text that only looks like SQL names no table', () => {
  const none = (text) => { const r = scanSql(text); assert.deepEqual([r.uses, r.holes, r.decls], [[], [], []], text); };
  none(`block truncate ${holeMarker(0)}`);          // a styling class
  none(`Update ${holeMarker(0)} now`);              // a UI label
  none('SELECT 1 FOR UPDATE');                     // a row lock
  none('SELECT * FROM information_schema.columns'); // the catalog
  none('SELECT * FROM unnest($1) AS t');            // a function, not a table
  assert.deepEqual(scanSql('WHERE a IS DISTINCT FROM b').uses, []);
});

// ── 2. Tables: one per name, merged across declarations ─────────────────────

test('a table declared in a .sql file and changed in a code string is ONE table with every site', () => {
  project();
  assert.equal(BUILD.sqlTableCount, 3);
  assert.equal(BUILD.tier.sql, 2, 'two .sql files indexed on their own tier');
  const { status, env } = query('table', 'users');
  assert.equal(status, 0);
  assert.equal(env.table.dialect, 'sql');
  assert.deepEqual(env.table.columns.map((c) => c.name), ['id', 'email', 'phone']);
  assert.deepEqual(env.table.declaredAt.map((d) => `${d.file}:${d.line} ${d.kind}`), ['db/schema.sql:2 create', 'src/schema.ts:7 alter']);
  assert.deepEqual(env.table.referencedBy.map((r) => `${r.table}.${r.column}`), ['orders.user_id']);
});

test('a dropped column is marked, and a clashing column type is named — never picked quietly', () => {
  const { env } = query('table', 'ORDERS'); // SQL names compare case-insensitively
  const cols = Object.fromEntries(env.table.columns.map((c) => [c.name, c]));
  assert.equal(cols.total.dropped, 'src/schema.ts:8');
  assert.ok(cols.note, 'a column only the second CREATE has');
  assert.deepEqual(env.table.unresolved, ['column id: serial at db/schema.sql:7, integer at src/schema.ts:3']);
});

test('a Drizzle table owns its SQL name: the generated migration attaches, raw SQL counts as a use', () => {
  const { env } = query('table', 'invoices');
  assert.equal(env.table.dialect, 'pg', 'the Drizzle declaration stays the table');
  assert.deepEqual(env.table.alsoDeclaredAt.map((d) => d.file), ['drizzle/0001_invoices.sql']);
  const uses = query('who-uses', 'invoices').env;
  assert.deepEqual(uses.results.map((r) => r.user), ['src/drizzle.ts#rawInvoiceCount@8']);
});

// ── 3. Uses, including traced table names ────────────────────────────────────

test('who-uses credits the code holding the SQL, with read/write and operation', () => {
  const u = byUser(query('who-uses', 'orders').env);
  assert.deepEqual(u['saveOrder@8'].operations, { insert: [9] });
  assert.deepEqual(u['saveOrder@8'].access, ['WRITE']);
  assert.deepEqual(u['yearly@12'].operations, { from: [13] }, 'EXTRACT(YEAR FROM created) is not a table');
  assert.deepEqual(u['totals@1'].operations, { from: [2] }, 'Python strings are read too');
});

test('a table in a variable is traced to where its name is written out', () => {
  const orders = byUser(query('who-uses', 'orders').env);
  const users = byUser(query('who-uses', 'users').env);
  // A caller's argument: deleteUser calls countIn('orders', …).
  assert.deepEqual(orders['countIn@17'].via, ['src/repo.ts#deleteUser@26']);
  assert.equal(users['countIn@17'], undefined, 'no caller passes users to countIn');
  // A list of records: blockers([{ table: 'users', … }]).
  assert.deepEqual(users['blockers@22'].via, ['src/repo.ts#deleteUser@26']);
  // A returned list, and a list in the same function — both tables, as writes.
  for (const t of [orders, users]) {
    assert.deepEqual(t['purge@36'].via, ['src/repo.ts#cleanupOrder@32']);
    assert.deepEqual(t['purge@36'].access, ['WRITE']);
    assert.deepEqual(t['wipeAll@41'].operations, { truncate: [42] });
  }
});

test('a name that cannot be traced is listed with the reason, never guessed', () => {
  const { env } = query('who-uses', 'users');
  const sites = Object.fromEntries(env.runtimeChosen.sites.map((s) => [s.at, s.why.join('; ')]));
  assert.deepEqual(Object.keys(sites).sort(), ['py/report.py:7', 'src/repo.ts:47', 'src/repo.ts:51']);
  assert.match(sites['src/repo.ts:47'], /nothing calls fromAnywhere/);
  assert.equal(env.results.some((r) => r.user.includes('fromAnywhere')), false);
  assert.equal(query('status').env.runtimeTableSites, 3);
});

test('UI text that looks like SQL leaves no use and no runtime site', () => {
  const all = ['users', 'orders'].flatMap((t) => query('who-uses', t).env.results.map((r) => r.user));
  assert.equal(all.some((u) => u.includes('label')), false);
});

// ── 4. Blast radius follows table writes ─────────────────────────────────────

test('blast-radius of code that writes a table lists the code that reads it', () => {
  const { env } = query('blast-radius', 'src/repo.ts#saveOrder@8');
  const orders = env.dataLinked.find((d) => d.table === 'orders');
  assert.deepEqual(orders.writes, [{ by: 'src/repo.ts#saveOrder@8', op: 'insert', line: 9 }]);
  assert.ok(orders.readers.includes('py/report.py#totals@1'), 'a reader nothing calls across to');
  assert.ok(orders.readers.includes('src/repo.ts#yearly@12'));
  assert.equal(orders.readers.includes('src/repo.ts#saveOrder@8'), false);
  const reader = query('blast-radius', 'src/repo.ts#getUser@4').env;
  assert.equal(reader.dataLinked, undefined, 'reading a table links nothing');
});

// ── 5. A .sql file stays fresh like code ─────────────────────────────────────

test('editing a .sql file re-indexes it before the next answer', () => {
  project();
  fs.appendFileSync(path.join(PROJECT, 'db', 'schema.sql'), '\nCREATE TABLE audits (id TEXT PRIMARY KEY);\n');
  const { status, env } = query('table', 'audits');
  assert.equal(status, 0);
  assert.deepEqual(env.table.declaredAt.map((d) => d.file), ['db/schema.sql']);
});

test('the scanner ships with the graph tools every project gets', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'gsd-t.js'), 'utf8');
  const list = /const PROJECT_BIN_TOOLS = \[([\s\S]*?)\];/.exec(src)[1];
  assert.ok(list.includes('"gsd-t-graph-sql-scan.cjs"'));
});

// ── 6. Every way a table name reaches SQL is followed, or listed ─────────────
// Each shape below once dropped a real writer with nothing listed, so
// `who-uses --writes` read as complete when it was not.

let SHAPES = null;
function shapes() {
  if (SHAPES) return SHAPES;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-sql-shapes-'));
  const files = {
    'package.json': '{}',
    'db/schema.sql': [
      ...['tb_a', 'tb_b', 'tb_c', 'tb_d', 'tb_e', 'tb_f', 'tb_users', 'tb_orders', 'tb_log'].map((t) => `CREATE TABLE ${t} (id int);`),
      // One edge per table and operation in a .sql file, however many rows a dump holds.
      ...Array.from({ length: 50 }, (_, i) => `INSERT INTO tb_log VALUES (${i});`),
    ].join('\n') + '\n',
    'db/broken.sql': "SELECT 'it\\'s' FROM tb_a;\nUPDATE tb_b SET id = 2;\n",
    'src/mixed.ts': [
      'export async function wipe(db: any, table: string) { await db.query(`DELETE FROM ${table}`); }',
      "export async function routeA(db: any) { await wipe(db, 'tb_a'); }",
      'export async function routeB(db: any, req: any) { await wipe(db, req.body.table); }',
      "export async function choose(db: any, admin: boolean, other: string) { const t = admin ? other : 'tb_b'; await db.query(`DELETE FROM ${t}`); }",
      "export async function listed(db: any, extra: string) { for (const t of ['tb_c', extra]) await db.query(`DELETE FROM ${t}`); }",
      "export async function reassigned(db: any, flag: boolean) { let t = 'tb_d'; if (flag) t = 'tb_e'; await db.query(`DELETE FROM ${t}`); }",
      "const TABLES = { users: 'tb_users', orders: 'tb_orders' };",
      'export async function field(db: any) { await db.query(`DELETE FROM ${TABLES.users}`); }',
      '',
    ].join('\n'),
    'src/built.js': [
      "function concat(db, table) { return db.query('DELETE FROM ' + table + ' WHERE id = $1', [1]); }",
      "function concatCaller(db) { return concat(db, 'tb_a'); }",
      "function joined(db, table) { return db.query(['DELETE FROM', table].join(' ')); }",
      "function joinedCaller(db) { return joined(db, 'tb_b'); }",
      "function upsert(db) { return db.query('INSERT OR REPLACE INTO tb_f (id) VALUES (1)'); }",
      "function message() { return 'Failed to create table tb_orders'; }",
      'module.exports = { concat, concatCaller, joined, joinedCaller, upsert, message };',
      '',
    ].join('\n'),
    'db/bodies.sql': [
      'CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN DELETE FROM tb_c WHERE id = 1; END $$ LANGUAGE plpgsql;',
      'CREATE TRIGGER t AFTER INSERT ON tb_a BEGIN INSERT INTO tb_d (id) VALUES (1); END;',
      'CREATE TABLE ms_a (id int)',
      'GO',
      'CREATE TABLE ms_b (id int)',
      '',
    ].join('\n'),
    'src/prefix.js': [
      "function twoLines(db) { return db.query(`DELETE FROM tb_e WHERE id = 1\nDELETE FROM tb_f WHERE id = 2`); }",
      "function held(db, t) { let sql = 'DELETE FROM '; sql += t; return db.query(sql); }",
      "function field(db) { const T = { x: 'tb_users' }; T.x = 'tb_orders'; return db.query(`DELETE FROM ${T.x}`); }",
      "function cls(on) { return ['truncate', on ? 'tb_a' : 'x'].join(' '); }",
      'module.exports = { twoLines, held, field, cls };',
      '',
    ].join('\n'),
    'src/verbs.js': [
      "function qid(db, t) { return db.query(`INSERT INTO \"${t}\" (id) VALUES (1)`); }",
      "function qidCaller(db) { return qid(db, 'tb_a'); }",
      "function bt(db, t) { return db.query(`INSERT INTO \\`${t}\\` (id) VALUES (1)`); }",
      "function btCaller(db) { return bt(db, 'tb_b'); }",
      "function qq(conn, t) { return conn.query('DELETE FROM ?? WHERE id = ?', [t, 1]); }",
      "function sch(db, t) { let sql = 'DELETE FROM public.'; sql += t; return db.query(sql); }",
      "function low(db, t) { let sql = 'update '; sql += t + ' set id = 2'; return db.query(sql); }",
      "function ign(db) { return db.query('UPDATE IGNORE tb_c SET id = 2'); }",
      "function noInto(db) { return db.query('INSERT tb_d (id) VALUES (1)'); }",
      "function glued(db, t) { return db.query(`DELETE FROM tb_${t} WHERE id = 1`); }",
      "function dots(db) { return db.query('INSERT INTO tb_e ...'); }",
      'module.exports = { qid, qidCaller, bt, btCaller, qq, sch, low, ign, noInto, glued, dots };',
      '',
    ].join('\n'),
    'py/held.py': [
      'FMT = "DELETE FROM {} WHERE id = 1"',
      'PCT = "DELETE FROM %s WHERE id = 1"',
      '',
    ].join('\n'),
    'db/load.sql': [
      "CREATE FUNCTION purge() RETURNS void AS $$ BEGIN EXECUTE 'DELETE FROM tb_f WHERE id = 1'; END $$ LANGUAGE plpgsql;",
      'COPY tb_users FROM STDIN;',
      '',
    ].join('\n'),
    'py/fmt.py': [
      'def pct(cur, table):',
      '    cur.execute("DELETE FROM %s WHERE id = 1" % table)',
      '',
      'def fmt(cur, table):',
      '    cur.execute("DELETE FROM {} WHERE id = 1".format(table))',
      '',
    ].join('\n'),
  };
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  build_index(dir, { scip: {} });
  SHAPES = dir;
  return dir;
}
function shapeQuery(...args) {
  const r = spawnSync(process.execPath, [QUERY_CLI, ...args], { cwd: shapes(), encoding: 'utf8' });
  return JSON.parse(r.stdout.trim().split('\n').pop());
}
const writers = (t) => byUser(shapeQuery('who-uses', t, '--writes'));
const runtimeAt = () => Object.fromEntries(shapeQuery('status').runtimeTableSites === 0 ? [] :
  shapeQuery('who-uses', 'tb_a').runtimeChosen.sites.map((s) => [s.at, s.why.join('; ')]));
test.after(() => { if (SHAPES) fs.rmSync(SHAPES, { recursive: true, force: true }); });

test('one caller passes a name, another a value chosen while running: the use is credited AND listed', () => {
  assert.deepEqual(writers('tb_a')['wipe@1'].via, ['src/mixed.ts#routeA@2']);
  assert.match(runtimeAt()['src/mixed.ts:1'], /routeB/);
});

test('a choice, a list or a reassigned variable is followed down every branch', () => {
  assert.ok(writers('tb_b')['choose@4'], 'the written-out side of a ? b : c');
  assert.match(runtimeAt()['src/mixed.ts:4'], /choose/, 'the parameter side is listed');
  assert.ok(writers('tb_c')['listed@5']);
  assert.match(runtimeAt()['src/mixed.ts:5'], /listed/);
  assert.ok(writers('tb_d')['reassigned@6'], 'the first value');
  assert.ok(writers('tb_e')['reassigned@6'], 'the value given later');
});

test('a record field names only that field', () => {
  assert.ok(writers('tb_users')['field@8']);
  assert.equal(writers('tb_orders')['field@8'], undefined);
});

test('SQL built by + or .join, and INSERT OR REPLACE, are writes', () => {
  assert.deepEqual(writers('tb_a')['concat@1'].via, ['src/built.js#concatCaller@2']);
  assert.deepEqual(writers('tb_b')['joined@3'].via, ['src/built.js#joinedCaller@4']);
  assert.deepEqual(writers('tb_f')['upsert@5'].operations, { insert: [5] });
});

test('Python % and .format slots are listed, never dropped', () => {
  const at = runtimeAt();
  assert.ok(at['py/fmt.py:2'] && at['py/fmt.py:5']);
});

test('a message that only mentions a table declares nothing', () => {
  assert.deepEqual(shapeQuery('table', 'tb_orders').table.declaredAt.map((d) => d.file), ['db/schema.sql']);
});

test('a quote that never closes is listed: the SQL after it may write any table', () => {
  assert.match(runtimeAt()['db/broken.sql:1'], /never closes/);
  assert.equal(writers('tb_b')['_toplevel'], undefined, 'the UPDATE after it was not read');
});

test('a .sql file keeps one edge per table and operation', () => {
  assert.deepEqual(writers('tb_log')['_toplevel'].operations, { insert: [10] });
});

test('a write inside a function or trigger body, or on a line after another, is a write', () => {
  assert.ok(writers('tb_c')['_toplevel'], 'DELETE inside a $$ body');
  assert.ok(writers('tb_d')['_toplevel'], 'INSERT after a trigger BEGIN');
  assert.ok(writers('tb_f')['twoLines@1'], 'a second statement with no ; between');
  assert.equal(shapeQuery('table', 'ms_b').table.declaredAt[0].file, 'db/bodies.sql', 'CREATE after GO');
});

test('SQL whose table is added elsewhere (a prefix held in a variable) is listed', () => {
  assert.match(runtimeAt()['src/prefix.js:3'], /added to this SQL elsewhere/);
});

test('a field given a new value is followed to it', () => {
  assert.ok(writers('tb_orders')['field@4']);
  assert.ok(writers('tb_users')['field@4']);
});

test('a lower-case styling class `truncate` is not a write', () => {
  assert.equal(writers('tb_a')['cls@5'], undefined);
  assert.ok(writers('tb_e')['twoLines@1'], 'the same project does read cls: a writer on its line would show');
});

test('scanner: a write whose table is not written as a name is listed, never skipped', () => {
  const open = (text) => scanSql(text).open.map((o) => o.op);
  for (const text of ['DELETE FROM ?? WHERE id = ?', 'DELETE FROM %s WHERE id = 1', 'DELETE FROM {table} WHERE id = 1',
    'DELETE FROM :table WHERE id = 1', 'UPDATE %s SET a = 1', 'TRUNCATE TABLE ??', 'MERGE INTO {} USING b ON 1']) {
    assert.equal(open(text).length, 1, text);
  }
  assert.deepEqual(open('DELETE FROM public.'), ['delete'], 'a dotted name cut short');
  assert.deepEqual(open('UPDATE public.'), ['update']);
  assert.deepEqual(open('BEGIN; update '), ['update'], 'lower case, starting a statement');
  assert.deepEqual(open(`DELETE FROM tb_${holeMarker(0)} WHERE id = 1`), ['delete'], 'a name built partly from a hole');
  // Messages seen in a real project (Hilo): none is a write.
  for (const text of ['UPDATE', 'Failed to update ', 'no update needed.', 'still on Main after update.', 'sends the guard inside the UPDATE', 'the value handed to db.update().set() is clean']) {
    assert.deepEqual(open(text), [], text);
  }
  assert.deepEqual(scanSql(`DELETE FROM [${holeMarker(0)}] WHERE id = 1`).holes.map((h) => h.hole), [0], 'T-SQL [name]');
  assert.deepEqual(scanSql(`INSERT INTO "${holeMarker(0)}" (a) VALUES (1)`).holes.map((h) => h.hole), [0], 'a quoted hole');
  const uses = (text) => scanSql(text).uses.map((u) => `${u.access}:${u.op}:${u.table}`);
  assert.deepEqual(uses('UPDATE LOW_PRIORITY a SET x = 1'), ['WRITE:update:a']);
  assert.deepEqual(uses('UPDATE a WITH (ROWLOCK) SET x = 1'), ['WRITE:update:a']);
  assert.deepEqual(uses('REPLACE a SET x = 1'), ['WRITE:insert:a']);
  assert.deepEqual(uses('INSERT INTO db.dbo.a (x) VALUES (1)'), ['WRITE:insert:a'], 'the last part is the table');
  assert.deepEqual(uses('COPY a (x) FROM STDIN'), ['WRITE:copy:a'], 'stdin is not a table');
  assert.deepEqual(uses('COPY a TO STDOUT'), ['READ:copy:a']);
  assert.deepEqual(uses("EXEC sp_executesql N'DELETE FROM a WHERE id = 1'"), ['WRITE:delete:a']);
  assert.deepEqual(uses('SELECT REPLACE(name, 1, 2) FROM a'), ['READ:from:a'], 'REPLACE() is a function');
});

test('a quoted or backtick hole is traced; a placeholder, a cut-short name or a held format string is listed', () => {
  assert.ok(writers('tb_a')['qid@1'], '"${t}"');
  assert.ok(writers('tb_b')['bt@3'], 'backtick ${t}');
  const at = runtimeAt();
  for (const line of ['src/verbs.js:5', 'src/verbs.js:6', 'src/verbs.js:7', 'src/verbs.js:10', 'py/held.py:1', 'py/held.py:2']) {
    assert.ok(at[line], line);
  }
  assert.match(at['src/verbs.js:5'], /not written as a name/);
  assert.match(at['src/verbs.js:6'], /added to this SQL elsewhere/);
});

test('UPDATE IGNORE, INSERT without INTO, an ellipsis, EXECUTE in a body and COPY are writes', () => {
  assert.ok(writers('tb_c')['ign@8']);
  assert.ok(writers('tb_d')['noInto@9']);
  assert.ok(writers('tb_e')['dots@11'], 'INSERT INTO t ... in a test');
  assert.ok(writers('tb_f')['_toplevel'], 'EXECUTE a string inside a $$ body');
  assert.deepEqual(writers('tb_users')['_toplevel'].operations, { copy: [2] });
});

test('scanner: MySQL multi-table and aliased DELETE, TOP, MERGE without INTO, SQL run from a variable', () => {
  const writes = (text) => scanSql(text).uses.filter((u) => u.access === 'WRITE').map((u) => `${u.op}:${u.table}`);
  assert.deepEqual(writes('DELETE t1, t2 FROM t1 JOIN t2 ON t1.id = t2.id'), ['delete:t1', 'delete:t2']);
  assert.deepEqual(writes('DELETE b FROM accounts a JOIN audit b ON a.id = b.id'), ['delete:audit'], 'the alias names the table');
  assert.deepEqual(writes('DELETE a.* FROM accounts a'), ['delete:accounts']);
  assert.deepEqual(writes('DELETE LOW_PRIORITY QUICK FROM t'), ['delete:t']);
  assert.deepEqual(writes('DELETE t WHERE id = 1'), ['delete:t'], 'no FROM');
  assert.deepEqual(writes('UPDATE TOP (10) t SET a = 1'), ['update:t']);
  assert.deepEqual(writes('INSERT TOP (5) INTO t (a) VALUES (1)'), ['insert:t']);
  assert.deepEqual(writes('MERGE t AS x USING s ON 1 = 1 WHEN MATCHED THEN UPDATE SET a = 1'), ['merge:t']);
  assert.deepEqual(writes('CREATE FUNCTION f() RETURNS void AS $$DELETE FROM t$$ LANGUAGE sql'), ['delete:t'], '$$ glued to a name');
  assert.deepEqual(writes("DO $$ DECLARE q text; BEGIN q := 'DELETE FROM t'; EXECUTE q; END $$"), ['delete:t']);
  assert.deepEqual(writes("SET @sql = N'DELETE FROM t'; EXEC sp_executesql @sql"), ['delete:t']);
  // Not writes: a SQLite pragma mode, a stage load into "into", a value.
  for (const text of ['PRAGMA wal_checkpoint(TRUNCATE)', 'COPY INTO t FROM @stage', "WHERE status = 'UPDATE'", 'delete it now']) {
    assert.deepEqual([writes(text), scanSql(text).open], [[], []], text);
  }
});
