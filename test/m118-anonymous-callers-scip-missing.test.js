'use strict';

/**
 * Anonymous route-handler callers + SCIP-missing files (debug fix, hilo-figma-atos).
 *
 * Symptom: `who-calls resolveFlightSchoolFromLocation` answered [] while 57 call
 * sites sat inside anonymous Hono handlers in a 1.9MB route file. Two causes:
 *   1. calls inside an anonymous handler had no caller identity of their own
 *      (credited to `_toplevel`, and const-arrow bodies were walked twice);
 *   2. scip-typescript skips every file over 1mb by default, silently — the
 *      route file had no SCIP document, so no call in it ever resolved.
 *
 * [RULE] anonymous-caller-synthesized-never-dropped
 * [RULE] scip-missing-file-detected-never-silent
 * [RULE] incomplete-empty-answer-names-a-path-forward
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { extractEdges } = require('../bin/gsd-t-graph-edge-extract.cjs');
const { parse_and_put, openStore, closeStore } = require('../bin/gsd-t-graph-index.cjs');
const cli = require('../bin/gsd-t-graph-query-cli.cjs');
const { readScipIndex, loadScipProto } = require('../bin/gsd-t-scip-reader.cjs');
const upg = require('../bin/gsd-t-graph-scip-upgrade.cjs');

const GUARD = path.join(__dirname, '..', 'scripts', 'gsd-t-graph-search-guard.js');

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

function extract(src, rel = 'src/routes.ts') {
  const dir = tmp('m118-x-');
  try {
    const abs = path.join(dir, path.basename(rel));
    fs.writeFileSync(abs, src);
    return extractEdges(abs, rel);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function callersOf(res, callee) {
  return res.edges
    .filter((e) => e.kind === 'call-site' && e.target === `UNRESOLVED#${callee}`)
    .map((e) => e.source);
}

test('route handler: app.get(\'/x\', async () => helper()) → caller is file#GET /x@line', () => {
  const res = extract("const app: any = {};\napp.get('/x', async () => helper());\n");
  assert.deepEqual(callersOf(res, 'helper'), ['src/routes.ts#GET /x@2']);
  const ent = res.entities.find((e) => e.id === 'src/routes.ts#GET /x@2');
  assert.ok(ent, 'route handler registered as an entity (body + blast-radius can see it)');
  assert.equal(ent.name, 'GET /x');
});

test('route handler with middleware and a :param path, method case-insensitive', () => {
  const res = extract(
    "router.post('/locations/:locationId/curriculum', auth, async (c) => {\n  helper(1);\n});\n" +
    "router.DELETE(`/y`, function () { helper(2); });\n");
  assert.deepEqual(callersOf(res, 'helper').sort(), [
    'src/routes.ts#DELETE /y@4',
    'src/routes.ts#POST /locations/:locationId/curriculum@1',
  ]);
});

test('negative: anonymous callback inside a named function attributes to the named function', () => {
  const res = extract('export function named() {\n  [1].map(() => helper(3));\n}\n');
  assert.deepEqual(callersOf(res, 'helper'), ['src/routes.ts#named@1'],
    'not dropped, not synthetic — the enclosing named scope');
});

test('top-level anonymous callback → file#anonymous@line; direct top-level call stays _toplevel', () => {
  const res = extract('setTimeout(() => helper(9), 1);\nhelper(10);\n');
  assert.deepEqual(callersOf(res, 'helper').sort(), ['src/routes.ts#_toplevel', 'src/routes.ts#anonymous@1']);
});

test('const-arrow body is walked once — no duplicate _toplevel caller', () => {
  const res = extract('export const f = async () => { helper(1); };\n');
  assert.deepEqual(callersOf(res, 'helper'), ['src/routes.ts#f@1']);
});

test('who-calls / blast-radius return the synthetic route caller (with its file and line)', () => {
  const recs = [
    { file: 'src/helper.ts', tier: 'compiler-accurate',
      entities: [{ funcId: 'src/helper.ts#helper@1', name: 'helper' }], edges: [] },
    { file: 'src/routes.ts', tier: 'compiler-accurate',
      entities: [{ funcId: 'src/routes.ts#GET /x@2', name: 'GET /x' }],
      edges: [{ kind: 'CALL', src: 'src/routes.ts#GET /x@2', dst: 'src/helper.ts#helper' }] },
  ];
  const idx = cli.buildIndexFromRecords(recs);
  assert.deepEqual(cli.queryWhoCalls(idx, 'helper').results, ['src/routes.ts#GET /x@2']);
  assert.ok(cli.queryBlastRadius(idx, 'src/helper.ts').results.includes('src/routes.ts#GET /x@2'));
});

test('scip-reader: a reference inside an anonymous function is kept; docPaths lists every document', () => {
  const p = loadScipProto();
  if (!p) { assert.fail('SCIP decoder unavailable — scip-typescript is a GSD-T install requirement'); }
  const SYM = 'scip-typescript npm x 1 src/`helper.ts`/helper().';
  const index = new p.Index({ documents: [
    new p.Document({ relative_path: 'src/helper.ts', occurrences: [
      new p.Occurrence({ symbol: SYM, symbol_roles: 1, range: [0, 16, 22] }),
    ] }),
    // routes.ts: the reference sits in an anonymous handler — no enclosing named def.
    new p.Document({ relative_path: 'src/routes.ts', occurrences: [
      new p.Occurrence({ symbol: 'scip-typescript npm x 1 src/`routes.ts`/', symbol_roles: 1, range: [0, 0, 1] }),
      new p.Occurrence({ symbol: SYM, symbol_roles: 0, range: [1, 30, 36] }),
    ] }),
    new p.Document({ relative_path: 'src/empty.ts', occurrences: [] }),
  ] });
  const dir = tmp('m118-scip-');
  try {
    const f = path.join(dir, 'index.scip');
    fs.writeFileSync(f, index.serialize());
    const read = readScipIndex(f);
    assert.equal(read.ok, true);
    assert.deepEqual(read.fileRefs.get('src/routes.ts'),
      [{ symbol: SYM, funcId: 'src/helper.ts#helper', line: 1 }]);
    assert.deepEqual([...read.docPaths].sort(), ['src/empty.ts', 'src/helper.ts', 'src/routes.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SCIP-missing: a file the indexer produced no document for is labelled, never plain floor', () => {
  const resolver = {
    resolveFileEdges: (rel, edges) => ({ edges, resolved: 0 }),
    coversLanguage: (lang) => lang === 'typescript',
    hasScipDoc: (rel) => rel === 'src/helper.ts',
  };
  upg._resetScipCache({ typescript: true, python: false, rust: false });
  try {
    const missing = upg.tryScipUpgrade('/r/src/routes.ts', 'src/routes.ts', [], [], { resolver });
    assert.equal(missing.tier, 'tree-sitter-floor-SCIP-MISSING');
    const present = upg.tryScipUpgrade('/r/src/helper.ts', 'src/helper.ts', [], [], { resolver });
    assert.equal(present.tier, 'compiler-accurate');
  } finally {
    upg._resetScipCache(null);
  }
});

test('graph status lists the files not in SCIP', () => {
  const dir = tmp('m118-status-');
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'routes.ts'), "app.get('/x', async () => helper());\n");
    fs.writeFileSync(path.join(dir, 'src', 'helper.ts'), 'export function helper() { return 1; }\n');
    const dbPath = path.join(dir, 'graph.db');
    const db = openStore(dbPath);
    const resolver = {
      resolveFileEdges: (rel, edges) => ({ edges, resolved: 0 }),
      coversLanguage: () => true,
      hasScipDoc: (rel) => rel === 'src/helper.ts',
    };
    upg._resetScipCache({ typescript: true, python: false, rust: false });
    try {
      const scip = { tryScipUpgrade: upg.tryScipUpgrade, resolver, projectRoot: dir };
      for (const f of ['src/routes.ts', 'src/helper.ts']) {
        parse_and_put(path.join(dir, f), f, { db, scip });
      }
    } finally {
      upg._resetScipCache(null);
      closeStore(db);
    }
    const loaded = cli.loadStore(dbPath);
    assert.equal(loaded.ok, true);
    const st = cli.queryStatus(loaded.index, dbPath);
    assert.deepEqual(st.scipMissing, { count: 1, files: ['src/routes.ts'] });

    // And who-calls names the unresolved call sites instead of a bare [].
    const wc = cli.queryWhoCalls(loaded.index, 'helper');
    assert.deepEqual(wc.results, []);
    assert.equal(wc.coverage.complete, false);
    assert.deepEqual(wc.coverage.unresolvedCallSites.callers, ['src/routes.ts#GET /x@1']);
    assert.deepEqual(wc.coverage.unresolvedCallSites.files, ['src/routes.ts']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('search guard: after an incomplete empty answer, the block names an allowed path forward', () => {
  const root = tmp('m118-guard-');
  try {
    fs.mkdirSync(path.join(root, '.gsd-t', 'graphDB', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.gsd-t', 'graphDB', 'graph.db'), '');
    cli.writeIncompleteAnswerMarker(root, 'who-calls', 'helper', {
      complete: false,
      note: 'result may be incomplete — 1 file(s) parsed but not compiler-resolved',
      unresolvedCallSites: { count: 1, callers: ['src/routes.ts#GET /x@1'], files: ['src/routes.ts'] },
    });
    const r = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ tool_name: 'Bash', cwd: root, tool_input: { command: 'grep -rn helper src/' } }),
      encoding: 'utf8',
    });
    const out = JSON.parse(r.stdout.trim()).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'deny', 'the search itself stays blocked');
    assert.match(out.permissionDecisionReason, /Allowed path forward/);
    assert.match(out.permissionDecisionReason, /src\/routes\.ts/);
    assert.match(out.permissionDecisionReason, /Read tool/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('search guard: no marker → message unchanged (no path-forward section)', () => {
  const root = tmp('m118-guard0-');
  try {
    fs.mkdirSync(path.join(root, '.gsd-t', 'graphDB', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(root, '.gsd-t', 'graphDB', 'graph.db'), '');
    const r = spawnSync(process.execPath, [GUARD], {
      input: JSON.stringify({ tool_name: 'Bash', cwd: root, tool_input: { command: 'grep -rn helper src/' } }),
      encoding: 'utf8',
    });
    const out = JSON.parse(r.stdout.trim()).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'deny');
    assert.doesNotMatch(out.permissionDecisionReason, /Allowed path forward/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scip-typescript is run with a raised --max-file-byte-size (default 1mb silently skips big files)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'gsd-t-graph-scip-upgrade.cjs'), 'utf8');
  assert.match(src, /'--max-file-byte-size', SCIP_MAX_FILE_BYTES/);
  assert.equal(upg.SCIP_MAX_FILE_BYTES, '64mb');
});
