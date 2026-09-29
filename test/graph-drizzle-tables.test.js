'use strict';

/**
 * The code graph indexes Drizzle database tables.
 *
 * Before: `export const scheduleEvents = pgTable('schedule_events', {...})` left no
 * entity, so `graph body scheduleEvents` said not-found, `who-calls pgTable` said
 * [], and every table question dead-ended at the search guard (hilo-figma-atos,
 * 2026-09-29: 431 tables, 63 enums, none in the graph).
 *
 * Fixture: test/fixtures/drizzle-graph — pg + sqlite tables, a column FK, a
 * table-level foreignKey(), an enum, Hono route handlers that read and write, a
 * repository class using a namespace import and db.query, a types-only file, a
 * copied GSD-T tool in bin/, and a design/ folder nothing imports.
 *
 * [RULE] drizzle-table-entity-and-usage-edges
 * [RULE] table-not-indexed-distinct-from-no-users
 * [RULE] drizzle-table-shape-gap-named-never-skipped
 * [RULE] status-counts-files-table
 * [RULE] graph-excludes-gsdt-copied-tools-by-default
 * [RULE] search-guard-routes-table-questions
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { extractEdges } = require('../bin/gsd-t-graph-edge-extract.cjs');
const { build_index, openStore, closeStore, putRecord } = require('../bin/gsd-t-graph-index.cjs');
const { loadGraphExcludes, GSDT_TOOL_FILES } = require('../bin/gsd-t-graph-exclude.cjs');

const FIXTURE = path.join(__dirname, 'fixtures', 'drizzle-graph');
const QUERY_CLI = path.join(__dirname, '..', 'bin', 'gsd-t-graph-query-cli.cjs');
const GUARD = path.join(__dirname, '..', 'scripts', 'gsd-t-graph-search-guard.js');

// Fixture sources are checked in as `*.fixture` so the test runner never executes them.
function materialize() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drizzle-graph-'));
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
  // scip: {} → no SCIP upgrade; table entities + usage edges are tree-sitter facts.
  BUILD = build_index(PROJECT, { scip: {} });
  return PROJECT;
}

function query(...args) {
  const r = spawnSync(process.execPath, [QUERY_CLI, ...args], { cwd: project(), encoding: 'utf8' });
  return { status: r.status, env: JSON.parse(r.stdout.trim().split('\n').pop()) };
}

function extract(rel) {
  const abs = path.join(project(), rel);
  return extractEdges(abs, rel);
}

test.after(() => { if (PROJECT) fs.rmSync(PROJECT, { recursive: true, force: true }); });

// ── 1. Entities ──────────────────────────────────────────────────────────────

test('pgTable / sqliteTable / pgEnum declarations become table and enum entities', () => {
  project();
  assert.equal(BUILD.tableCount, 5, 'flightSchools, scheduleEvents, unusedTable, cacheOwners, cacheEntries');
  assert.equal(BUILD.enumCount, 1);
  assert.deepEqual(BUILD.tablesUnresolved, []);
  const schema = extract('src/db/schema.ts');
  const byName = Object.fromEntries(schema.entities.filter((e) => e.meta).map((e) => [e.name, e]));
  assert.equal(byName.scheduleEvents.type, 'table');
  assert.equal(byName.scheduleEvents.meta.sqlName, 'schedule_events');
  assert.equal(byName.scheduleEvents.meta.dialect, 'pg');
  assert.equal(byName.statusEnum.type, 'enum');
  assert.deepEqual(byName.statusEnum.meta.values, ['scheduled', 'done']);
  const local = extract('src/db/local.ts');
  const entries = local.entities.find((e) => e.name === 'cacheEntries');
  assert.equal(entries.meta.dialect, 'sqlite');
});

test('columns carry code name, SQL name, type builder, notNull, primaryKey and the FK', () => {
  const t = extract('src/db/schema.ts').entities.find((e) => e.name === 'scheduleEvents');
  const cols = Object.fromEntries(t.meta.columns.map((c) => [c.name, c]));
  assert.deepEqual(cols.id, { name: 'id', sqlName: 'id', type: 'uuid', notNull: false, primaryKey: true });
  assert.equal(cols.flightSchoolId.sqlName, 'flight_school_id');
  assert.equal(cols.flightSchoolId.notNull, true);
  assert.deepEqual(cols.flightSchoolId.references, { table: 'flightSchools', column: 'id' });
  assert.equal(cols.status.type, 'statusEnum', 'an enum column names its enum as the builder');
  assert.equal(cols.startAt.type, 'timestamp');
});

test('a table whose shape cannot be read is still an entity, and the gap is NAMED', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drizzle-gap-'));
  try {
    fs.writeFileSync(path.join(dir, 't.ts'), "const NAME = 'x';\nexport const odd = pgTable(NAME, buildColumns());\n");
    const { entities } = extractEdges(path.join(dir, 't.ts'), 't.ts');
    const odd = entities.find((e) => e.name === 'odd');
    assert.equal(odd.type, 'table');
    assert.deepEqual(odd.meta.unresolved, ['table name is not a string literal', 'columns argument is not an object literal']);
    fs.mkdirSync(path.join(dir, '.gsd-t'));
    const r = build_index(dir, { scip: {} });
    assert.equal(r.tablesUnresolved.length, 1);
    assert.equal(r.tablesUnresolved[0].name, 'odd');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 2. Usage edges: READ / WRITE, named by the enclosing function or route ────

test('route handlers are the users, named the way who-calls names them, with READ/WRITE labels', () => {
  const edges = extract('src/routes/events.ts').edges.filter((e) => e.kind.startsWith('TABLE-'));
  const has = (kind, src, target) => edges.some((e) => e.kind === kind && e.source === src && e.target.startsWith(target));
  assert.ok(has('TABLE-READ', 'src/routes/events.ts#GET /events/:id@8', 'TABLE#scheduleEvents#from@'));
  assert.ok(has('TABLE-READ', 'src/routes/events.ts#GET /events/:id@8', 'TABLE#flightSchools#innerJoin@'));
  assert.ok(has('TABLE-WRITE', 'src/routes/events.ts#POST /events@17', 'TABLE#scheduleEvents#insert@19'));
  assert.ok(has('TABLE-WRITE', 'src/routes/events.ts#DELETE /events/:id@23', 'TABLE#scheduleEvents#delete@24'));
  // eq(scheduleEvents.id, …) inside a delete chain is a WRITE; inside a select it is a READ.
  assert.ok(has('TABLE-WRITE', 'src/routes/events.ts#DELETE /events/:id@23', 'TABLE#scheduleEvents#ref@'));
  assert.ok(has('TABLE-READ', 'src/routes/events.ts#GET /events/:id@8', 'TABLE#scheduleEvents#ref@'));
  assert.ok(!edges.some((e) => e.source.endsWith('#_toplevel')), 'no use is credited to _toplevel');
});

test('a repository method using a namespace import and db.query is the user', () => {
  const edges = extract('src/repositories/event-repository.ts').edges.filter((e) => e.kind.startsWith('TABLE-'));
  const find = (src, target) => edges.find((e) => e.source === src && e.target.startsWith(target));
  assert.equal(find('src/repositories/event-repository.ts#findBySchool@6', 'TABLE#scheduleEvents#query@').kind, 'TABLE-READ');
  assert.equal(find('src/repositories/event-repository.ts#reschedule@10', 'TABLE#scheduleEvents#update@11').kind, 'TABLE-WRITE');
});

test('foreign keys inside a table declaration are metadata, not usage edges', () => {
  const edges = extract('src/db/schema.ts').edges.filter((e) => e.kind.startsWith('TABLE-'));
  assert.deepEqual(edges, []);
});

// ── 3. Query verbs ────────────────────────────────────────────────────────────

test('who-uses lists every user with operations; --writes and --reads filter', () => {
  const all = query('who-uses', 'scheduleEvents');
  assert.equal(all.status, 0);
  assert.deepEqual(all.env.results.map((r) => r.user), [
    'src/repositories/event-repository.ts#findBySchool@6',
    'src/repositories/event-repository.ts#reschedule@10',
    'src/routes/events.ts#DELETE /events/:id@23',
    'src/routes/events.ts#GET /events/:id@8',
    'src/routes/events.ts#POST /events@17',
  ]);
  assert.deepEqual(
    { insert: all.env.summary.byOperation.insert, update: all.env.summary.byOperation.update, delete: all.env.summary.byOperation.delete, from: all.env.summary.byOperation.from },
    { insert: 1, update: 1, delete: 1, from: 1 },
  );
  const writes = query('who-uses', 'scheduleEvents', '--writes').env.results.map((r) => r.user);
  assert.deepEqual(writes, [
    'src/repositories/event-repository.ts#reschedule@10',
    'src/routes/events.ts#DELETE /events/:id@23',
    'src/routes/events.ts#POST /events@17',
  ]);
  const reads = query('who-uses', 'scheduleEvents', '--reads').env.results.map((r) => r.user);
  assert.deepEqual(reads, ['src/repositories/event-repository.ts#findBySchool@6', 'src/routes/events.ts#GET /events/:id@8']);
});

test('the SQL name finds the same table (case-insensitive)', () => {
  assert.equal(query('who-uses', 'SCHEDULE_EVENTS').env.table.id, 'src/db/schema.ts#scheduleEvents@10');
});

test('not indexed is a not-found with a reason; indexed with no users is ok with []', () => {
  const missing = query('who-uses', 'noSuchTable');
  assert.equal(missing.status, 1);
  assert.equal(missing.env.ok, false);
  assert.equal(missing.env.reason, 'not-found');
  assert.match(missing.env.detail, /no table or enum named 'noSuchTable' is indexed \(6 tables\/enums/);
  const unused = query('who-uses', 'unusedTable');
  assert.equal(unused.status, 0);
  assert.equal(unused.env.ok, true);
  assert.deepEqual(unused.env.results, []);
  assert.equal(unused.env.note, "'unusedTable' is indexed; no code in the index uses it");
});

test('table shows columns and foreign keys in both directions', () => {
  const events = query('table', 'scheduleEvents').env.table;
  assert.deepEqual(events.references.map((r) => [r.column, r.table, r.targetColumn, r.tableIds]),
    [['flightSchoolId', 'flightSchools', 'id', ['src/db/schema.ts#flightSchools@5']]]);
  const schools = query('table', 'flight_schools').env.table;
  assert.deepEqual(schools.referencedBy.map((r) => [r.tableId, r.column, r.sqlColumn]),
    [['src/db/schema.ts#scheduleEvents@10', 'flightSchoolId', 'flight_school_id']]);
  // table-level foreignKey() in the extras argument (sqlite)
  const owners = query('table', 'cacheOwners').env.table;
  assert.deepEqual(owners.referencedBy.map((r) => [r.table, r.column]), [['cacheEntries', 'ownerId']]);
  const status = query('table', 'statusEnum').env.table;
  assert.deepEqual(status.usedByColumns.map((c) => [c.table, c.column]), [['scheduleEvents', 'status']]);
});

test('blast-radius of a table = tables referencing it by FK + the code that uses it', () => {
  const r = query('blast-radius', 'flightSchools').env;
  assert.deepEqual(r.referencingTables.map((t) => t.id), ['src/db/schema.ts#scheduleEvents@10']);
  // build-helpers.ts passes the table itself (Object.keys(flightSchools)) — a READ ref.
  assert.deepEqual(r.users, ['src/db/build-helpers.ts#schoolColumns@2', 'src/routes/events.ts#GET /events/:id@8']);
  assert.deepEqual(r.results, ['src/db/schema.ts#scheduleEvents@10', 'src/db/build-helpers.ts#schoolColumns@2', 'src/routes/events.ts#GET /events/:id@8']);
});

test('body of a table slices its declaration and carries its columns', () => {
  const r = query('body', 'scheduleEvents').env;
  assert.equal(r.ok, true);
  assert.deepEqual(r.lineRange, [10, 21]);
  assert.match(r.source, /^export const scheduleEvents = pgTable\(/);
  assert.equal(r.table.columns.find((c) => c.name === 'flightSchoolId').references.table, 'flightSchools');
});

test('who-calls on a table name points at the table verbs instead of a bare []', () => {
  const r = query('who-calls', 'scheduleEvents').env;
  assert.deepEqual(r.results, []);
  assert.match(r.hint, /gsd-t graph who-uses scheduleEvents/);
  assert.match(query('who-calls', 'pgTable').env.hint, /gsd-t graph table <name>/);
});

// ── 4. status: reads the files table, reports tiers, suggests excludes ────────

test('status counts every indexed file (a types-only file too) and reports per-tier counts', () => {
  const Database = require('../bin/gsd-t-require-store.cjs').requireBetterSqlite();
  const db = new Database(BUILD.dbPath, { readonly: true });
  const files = db.prepare('SELECT count(*) AS n FROM files').get().n;
  db.close();
  const s = query('status').env;
  assert.equal(s.fileCount, files);
  assert.equal(s.fileCount, BUILD.fileCount);
  assert.deepEqual(s.tiers, { 'tree-sitter-floor': BUILD.fileCount });
  assert.equal(s.tableCount, 5);
  assert.equal(s.enumCount, 1);
});

test('GSD-T tools copied into bin/ are excluded by default; status suggests unlinked folders', () => {
  const s = query('status').env;
  assert.equal(extract('src/db/types.ts').entities.length, 0, 'the types-only file has no entity');
  assert.ok(!BUILD.skippedFiles.some((f) => f.file.startsWith('bin/')));
  assert.equal(s.excludes.defaults.length, 1);
  assert.deepEqual(s.excludeSuggestions, [{ folder: 'design/', files: 1, reason: 'no import edges to or from src/' }]);
  const Database = require('../bin/gsd-t-require-store.cjs').requireBetterSqlite();
  const db = new Database(BUILD.dbPath, { readonly: true });
  const binRows = db.prepare("SELECT count(*) AS n FROM files WHERE file LIKE 'bin/%'").get().n;
  db.close();
  assert.equal(binRows, 0, 'bin/gsd-t-graph-index.cjs (a copied tool) is not indexed');
});

test('the default exclude covers every tool in PROJECT_BIN_TOOLS, and never GSD-T\'s own repo', () => {
  const { PROJECT_BIN_TOOLS } = require('../bin/gsd-t.js');
  const missed = PROJECT_BIN_TOOLS.filter((t) => !GSDT_TOOL_FILES.test(`bin/${t}`));
  assert.deepEqual(missed, [], 'a new PROJECT_BIN_TOOLS entry the default exclude does not cover');
  const own = loadGraphExcludes(path.join(__dirname, '..'));
  assert.equal(own.isExcluded('bin/gsd-t-graph-index.cjs'), false);
  assert.deepEqual(own.defaults, []);
});

test('an older graph without the meta column is migrated on first write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drizzle-mig-'));
  try {
    const Database = require('../bin/gsd-t-require-store.cjs').requireBetterSqlite();
    const dbPath = path.join(dir, 'graph.db');
    const old = new Database(dbPath);
    old.exec(`CREATE TABLE files (file TEXT PRIMARY KEY, content_hash TEXT NOT NULL, tier TEXT NOT NULL, indexed_at TEXT NOT NULL);
      CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, tier TEXT NOT NULL, content_hash TEXT NOT NULL, file TEXT NOT NULL, name TEXT, func_id TEXT, end_line INTEGER);
      CREATE TABLE edges (kind TEXT NOT NULL, src TEXT NOT NULL, dst TEXT NOT NULL, partial INTEGER NOT NULL DEFAULT 0);`);
    putRecord(old, { file: 'a.ts', contentHash: 'h', tier: 'tree-sitter-floor', edges: [],
      entities: [{ id: 'a.ts#t@1', type: 'table', name: 't', endLine: 2, meta: { kind: 'table', sqlName: 't' } }] });
    assert.equal(JSON.parse(old.prepare('SELECT meta FROM nodes').get().meta).sqlName, 't');
    old.close();
    const reopened = openStore(dbPath);
    closeStore(reopened);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 5. The search guard routes table questions to the table verbs ────────────

test('the search guard names who-uses / table for a table question instead of dead-ending', () => {
  const run = (command) => {
    const r = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ tool_name: 'Bash', cwd: project(), tool_input: { command } }), encoding: 'utf8',
    });
    return JSON.parse(r.stdout.trim()).hookSpecificOutput;
  };
  const insert = run('grep -rn "insert(scheduleEvents" src');
  assert.equal(insert.permissionDecision, 'deny');
  assert.match(insert.permissionDecisionReason, /gsd-t graph who-uses scheduleEvents --writes/);
  assert.match(insert.permissionDecisionReason, /gsd-t graph table scheduleEvents/);
  const decl = run("rg 'pgTable\\(' src");
  assert.match(decl.permissionDecisionReason, /database-table question/);
  const bare = run('grep -rn scheduleEvents src');
  assert.match(bare.permissionDecisionReason, /gsd-t graph who-uses scheduleEvents/);
});

// ── 6. The graph keeps exactly the project's files ───────────────────────────

test('freshness never drops a FILE whose name starts like a skipped dir (build-helpers.ts)', () => {
  const fr = require('../bin/gsd-t-graph-freshness.cjs');
  const db = fr.openDb(project());
  const t = fr.compute_touched_files(db, project());
  db.close();
  assert.deepEqual({ edits: t.edits, adds: t.adds, deletes: t.deletes }, { edits: [], adds: [], deletes: [] });
  assert.equal(query('status').env.fileCount, BUILD.fileCount, 'src/db/build-helpers.ts survives a query');
});

test('a rebuild prunes files that became excluded; a freshness DELETE removes the files row too', () => {
  const dir = materialize();
  try {
    const first = build_index(dir, { scip: {} });
    fs.writeFileSync(path.join(dir, '.gsd-t', 'graph-exclude.json'), JSON.stringify({ exclude: ['design/'] }));
    const second = build_index(dir, { scip: {} });
    assert.equal(second.fileCount, first.fileCount - 1);
    const Database = require('../bin/gsd-t-require-store.cjs').requireBetterSqlite();
    let db = new Database(second.dbPath, { readonly: true });
    assert.equal(db.prepare("SELECT count(*) AS n FROM files WHERE file LIKE 'design/%'").get().n, 0);
    db.close();
    fs.rmSync(path.join(dir, 'src', 'db', 'build-helpers.ts'));
    const r = spawnSync(process.execPath, [QUERY_CLI, 'status'], { cwd: dir, encoding: 'utf8' });
    assert.equal(JSON.parse(r.stdout.trim()).fileCount, second.fileCount - 1);
    db = new Database(second.dbPath, { readonly: true });
    assert.equal(db.prepare("SELECT count(*) AS n FROM edges WHERE src LIKE 'src/db/build-helpers.ts#%'").get().n, 0);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
