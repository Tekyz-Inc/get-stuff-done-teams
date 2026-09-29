'use strict';

/**
 * who-calls completeness + tier honesty (debug fix, hilo-figma-atos 2026-09-29).
 *
 * Symptoms on a real 4,372-file repo, measured against TypeScript findReferences:
 *   1. requireLocationTenant: 8 callers vs 95 use sites — a middleware factory
 *      passed as a route ARGUMENT (`router.get('/x', requireAuth(), mw(), h)`) was
 *      credited to `file#_toplevel`, collapsing every route in a file into one.
 *   2. Unresolved calls to a name defined exactly once in the repo were never
 *      reported as callers at all.
 *   3. A file was labelled compiler-accurate once ONE of its edges resolved.
 *
 * The golden test builds a real graph (scip-typescript) over a checked-in fixture
 * and compares who-calls with TypeScript findReferences for 5 symbols. The golden
 * file was produced by TypeScript itself; regenerate it with
 *   GSDT_REGEN_GOLDEN=<path to typescript.js> node --test test/m119-who-calls-golden.test.js
 *
 * [RULE] route-middleware-args-credited-to-route
 * [RULE] unique-name-unresolved-call-name-matched
 * [RULE] name-match-only-where-scip-never-looked
 * [RULE] scip-tier-proportional
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { extractEdges } = require('../bin/gsd-t-graph-edge-extract.cjs');
const { build_index } = require('../bin/gsd-t-graph-index.cjs');
const cli = require('../bin/gsd-t-graph-query-cli.cjs');
const { readScipIndex, loadScipProto, scipPositionKey } = require('../bin/gsd-t-scip-reader.cjs');
const upg = require('../bin/gsd-t-graph-scip-upgrade.cjs');

const FIXTURE = path.join(__dirname, 'fixtures', 'm119-who-calls-golden');
const GOLDEN = path.join(__dirname, 'fixtures', 'm119-who-calls-golden.expected.json');
const SYMBOLS = [
  ['src/middleware.ts', 'requireAuth'],
  ['src/middleware.ts', 'requireTenant'],
  ['src/helpers.ts', 'resolveOrg'],
  ['src/helpers.ts', 'verifyAccess'],
  ['src/helpers.ts', 'formatName'],
];

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

// Fixture sources are checked in as `*.ts.fixture` — the Node test runner would
// otherwise execute any `.ts` under test/. Materialize a real project to index.
function materializeFixture() {
  const dir = tmp('m119-golden-');
  fs.cpSync(FIXTURE, dir, { recursive: true });
  for (const sub of ['src', 'scripts']) {
    for (const f of fs.readdirSync(path.join(dir, sub))) {
      if (f.endsWith('.fixture')) fs.renameSync(path.join(dir, sub, f), path.join(dir, sub, f.slice(0, -'.fixture'.length)));
    }
  }
  return dir;
}

function extract(src, rel = 'src/routes.ts') {
  const dir = tmp('m119-x-');
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

// ── 1. middleware arguments are credited to the route ────────────────────────

test('middleware factory in route args → caller is the route (method + path + line)', () => {
  const res = extract(
    "router.get('/a', requireAuth(), requireTenant(), handler);\n" +
    "router.post('/b', requireTenant(), async (c) => { helper(); });\n");
  assert.deepEqual(callersOf(res, 'requireTenant').sort(), ['src/routes.ts#GET /a@1', 'src/routes.ts#POST /b@2']);
  assert.deepEqual(callersOf(res, 'requireAuth'), ['src/routes.ts#GET /a@1']);
  assert.deepEqual(callersOf(res, 'helper'), ['src/routes.ts#POST /b@2']);
  assert.ok(res.entities.some((e) => e.id === 'src/routes.ts#GET /a@1'), 'a middleware-only route is an entity too');
});

test('middleware args inside a named function still go to the route, not the function', () => {
  const res = extract("export function register(r) {\n  r.put('/c', requireTenant(), handler);\n}\n");
  assert.deepEqual(callersOf(res, 'requireTenant'), ['src/routes.ts#PUT /c@2']);
});

test('negative: a non-route call with a string key is not mistaken for a route', () => {
  const res = extract("cache.get('key', compute());\nc.get('user');\n");
  assert.deepEqual(callersOf(res, 'compute'), ['src/routes.ts#_toplevel']);
  assert.equal(res.entities.length, 0);
});

// ── 2. unique-name matching (and ambiguous NOT matched) ──────────────────────

function recs(extra) {
  return [
    { file: 'src/helper.ts', tier: 'compiler-accurate',
      entities: [{ funcId: 'src/helper.ts#helper@1', name: 'helper' }], edges: [] },
    { file: 'src/routes.ts', tier: 'compiler-accurate',
      entities: [{ funcId: 'src/routes.ts#GET /x@2', name: 'GET /x' }],
      edges: [{ kind: 'CALL', src: 'src/routes.ts#GET /x@2', dst: 'src/helper.ts#helper' }] },
    ...extra,
  ];
}

test('unique name: UNRESOLVED#helper in a SCIP-missing file is a name-matched caller', () => {
  const idx = cli.buildIndexFromRecords(recs([
    { file: 'scripts/tool.ts', tier: 'tree-sitter-floor-SCIP-MISSING', entities: [],
      edges: [{ kind: 'CALL', src: 'scripts/tool.ts#cli@3', dst: 'UNRESOLVED#helper' }] },
  ]));
  const wc = cli.queryWhoCalls(idx, 'helper');
  assert.deepEqual(wc.results, ['scripts/tool.ts#cli@3', 'src/routes.ts#GET /x@2']);
  assert.equal(wc.nameMatched.resolution, 'name-matched');
  assert.deepEqual(wc.nameMatched.callers, ['scripts/tool.ts#cli@3'], 'only the name-matched caller is labelled');
  assert.equal(wc.coverage.unresolvedCallSites, undefined, 'an accounted caller is not reported as unknown');
  // file-qualified identity answers the same
  assert.deepEqual(cli.queryWhoCalls(idx, 'src/helper.ts#helper').nameMatched.callers, ['scripts/tool.ts#cli@3']);
  // blast-radius follows the name-matched edge and labels it
  const br = cli.queryBlastRadius(idx, 'src/helper.ts');
  assert.ok(br.results.includes('scripts/tool.ts#cli@3'));
  assert.deepEqual(br.nameMatched.callers, ['scripts/tool.ts#cli@3']);
});

test('negative: an ambiguous name (2 definitions) is never name-matched', () => {
  const idx = cli.buildIndexFromRecords(recs([
    { file: 'src/other.ts', tier: 'compiler-accurate',
      entities: [{ funcId: 'src/other.ts#helper@9', name: 'helper' }], edges: [] },
    { file: 'scripts/tool.ts', tier: 'tree-sitter-floor-SCIP-MISSING', entities: [],
      edges: [{ kind: 'CALL', src: 'scripts/tool.ts#cli@3', dst: 'UNRESOLVED#helper' }] },
  ]));
  const wc = cli.queryWhoCalls(idx, 'src/helper.ts#helper');
  assert.deepEqual(wc.results, ['src/routes.ts#GET /x@2']);
  assert.equal(wc.nameMatched, undefined);
  assert.deepEqual(wc.coverage.unresolvedCallSites.callers, ['scripts/tool.ts#cli@3'], 'still named as a place to look');
});

test('negative: an unresolved call in a SCIP-backed file is not name-matched (SCIP said: not this function)', () => {
  const idx = cli.buildIndexFromRecords(recs([
    { file: 'src/test.ts', tier: 'compiler-accurate', entities: [],
      edges: [{ kind: 'CALL', src: 'src/test.ts#anonymous@4', dst: 'UNRESOLVED#helper' }] },
  ]));
  const wc = cli.queryWhoCalls(idx, 'helper');
  assert.deepEqual(wc.results, ['src/routes.ts#GET /x@2']);
  assert.equal(wc.nameMatched, undefined);
});

test('negative: a member call obj.helper() is never name-matched', () => {
  const idx = cli.buildIndexFromRecords(recs([
    { file: 'scripts/tool.ts', tier: 'tree-sitter-floor-SCIP-MISSING', entities: [],
      edges: [{ kind: 'CALL', src: 'scripts/tool.ts#cli@3', dst: 'UNRESOLVED#m.helper' }] },
  ]));
  assert.equal(cli.queryWhoCalls(idx, 'helper').nameMatched, undefined);
});

// ── 3. proportional tier labels ──────────────────────────────────────────────

function tierFor(resolveResult, edges) {
  const resolver = {
    resolveFileEdges: (rel, e) => ({ edges: e, ...resolveResult }),
    coversLanguage: () => true,
    hasScipDoc: () => true,
  };
  upg._resetScipCache({ typescript: true, python: false, rust: false });
  try {
    return upg.tryScipUpgrade('/r/src/a.ts', 'src/a.ts', [], edges, { resolver }).tier;
  } finally {
    upg._resetScipCache(null);
  }
}

test('tier: one resolved edge out of many resolvable is compiler-partial, not compiler-accurate', () => {
  const edges = [{ kind: 'call-site', source: 'a', target: 'UNRESOLVED#x', line: 1, col: 0 }];
  assert.equal(tierFor({ resolved: 1, resolvable: 10 }, edges), 'compiler-partial');
  assert.equal(tierFor({ resolved: 10, resolvable: 10 }, edges), 'compiler-accurate');
  assert.equal(tierFor({ resolved: 9, resolvable: 10 }, edges), 'compiler-accurate', `threshold ${upg.COMPILER_ACCURATE_MIN_FRACTION}`);
  assert.equal(tierFor({ resolved: 0, resolvable: 5 }, edges), 'tree-sitter-floor');
});

test('scip-reader records every occurrence position (a call SCIP saw vs one it never looked at)', () => {
  const p = loadScipProto();
  if (!p) assert.fail('SCIP decoder unavailable — scip-typescript is a GSD-T install requirement');
  const index = new p.Index({ documents: [
    new p.Document({ relative_path: 'src/a.ts', occurrences: [
      new p.Occurrence({ symbol: 'local 1', symbol_roles: 0, range: [3, 9, 15] }),
    ] }),
  ] });
  const dir = tmp('m119-scip-');
  try {
    const f = path.join(dir, 'index.scip');
    fs.writeFileSync(f, index.serialize());
    const read = readScipIndex(f);
    assert.ok(read.occurrencePositions.get('src/a.ts').has(scipPositionKey(3, 9)));
    assert.ok(!read.occurrencePositions.get('src/a.ts').has(scipPositionKey(3, 10)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 4. golden: who-calls vs TypeScript findReferences, real SCIP build ───────

function scipTypescriptPresent() {
  try { execSync('which scip-typescript', { stdio: 'pipe' }); return true; }
  catch { return false; }
}

/** TypeScript findReferences call sites (file:line) for each symbol. Regeneration only. */
function tsCallSites(ts, root) {
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, root);
  const host = {
    getScriptFileNames: () => cfg.fileNames, getScriptVersion: () => '0',
    getScriptSnapshot: (f) => (fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined),
    getCurrentDirectory: () => root, getCompilationSettings: () => cfg.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists, readFile: ts.sys.readFile,
  };
  const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
  const prog = ls.getProgram();
  const out = {};
  for (const [defFile, sym] of SYMBOLS) {
    const abs = path.join(root, defFile);
    let pos = -1;
    (function find(n) {
      if (pos >= 0) return;
      const decl = ts.isFunctionDeclaration(n) ? n : (ts.isVariableDeclaration(n) ? n : null);
      if (decl && decl.name && decl.name.text === sym) { pos = decl.name.getStart(); return; }
      ts.forEachChild(n, find);
    })(prog.getSourceFile(abs));
    const sites = [];
    for (const r of ls.findReferences(abs, pos)) for (const e of r.references) {
      if (e.isDefinition) continue;
      const sf = prog.getSourceFile(e.fileName);
      let node = sf;
      (function f(n) { if (n.getStart(sf) <= e.textSpan.start && e.textSpan.start < n.getEnd()) { node = n; ts.forEachChild(n, f); } })(sf);
      if (!(node.parent && ts.isCallExpression(node.parent) && node.parent.expression === node)) continue;
      sites.push(`${path.relative(root, e.fileName)}:${sf.getLineAndCharacterOfPosition(e.textSpan.start).line + 1}`);
    }
    out[sym] = { identity: `${defFile}#${sym}`, callSites: sites.sort() };
  }
  return out;
}

if (process.env.GSDT_REGEN_GOLDEN) {
  const ts = require(process.env.GSDT_REGEN_GOLDEN);
  const dir = materializeFixture();
  try { fs.writeFileSync(GOLDEN, JSON.stringify(tsCallSites(ts, dir), null, 2) + '\n'); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function perFile(list, sep) {
  const m = {};
  for (const x of list) { const f = x.split(sep)[0]; m[f] = (m[f] ?? 0) + 1; }
  return m;
}

test('golden: who-calls matches TypeScript findReferences for 5 symbols (real scip-typescript build)',
  { skip: scipTypescriptPresent() ? false : 'FAIL-LOUD: scip-typescript not installed — a GSD-T install requirement' },
  () => {
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    const dir = materializeFixture();
    try {
      fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
      const dbPath = path.join(dir, '.gsd-t', 'graph.db');
      const built = build_index(dir, { dbPath });
      const loaded = cli.loadStore(dbPath);
      assert.equal(loaded.ok, true);
      const idx = loaded.index;

      for (const [, sym] of SYMBOLS) {
        const g = golden[sym];
        const wc = cli.queryWhoCalls(idx, g.identity);
        const matched = new Set(wc.nameMatched ? wc.nameMatched.callers : []);
        const compiler = wc.results.filter((c) => !matched.has(c));
        // Fixture has one call per caller per symbol, so callers-per-file == sites-per-file.
        assert.deepEqual(perFile(compiler, '#'), perFile(g.callSites, ':'), `${sym}: compiler callers vs TypeScript`);
        assert.equal(compiler.length, g.callSites.length, `${sym}: count`);
      }

      // Route-level callers, one per registration (not one per file).
      assert.deepEqual(cli.queryWhoCalls(idx, golden.requireTenant.identity).results, [
        'src/routes-a.ts#GET /a/:id@17', 'src/routes-a.ts#GET /a@10', 'src/routes-a.ts#POST /a@12',
        'src/routes-b.ts#GET /b@5', 'src/routes-b.ts#PUT /b@6',
      ]);
      // The file TypeScript/SCIP never saw (outside tsconfig include) contributes a
      // labelled name-matched caller, never a compiler one.
      const ro = cli.queryWhoCalls(idx, golden.resolveOrg.identity);
      assert.deepEqual(ro.nameMatched.callers, ['scripts/tool.ts#cli@4']);
      assert.equal(idx.fileTier.get('scripts/tool.ts'), 'tree-sitter-floor-SCIP-MISSING');
      // The local that shadows formatName is not a caller (SCIP resolved it to the local).
      assert.ok(!cli.queryWhoCalls(idx, golden.formatName.identity).results.some((c) => c.includes('shadow')));
      // Every file SCIP indexed had every repo-name call seen → compiler-accurate.
      for (const f of ['src/routes-a.ts', 'src/routes-b.ts', 'src/service.ts']) {
        assert.equal(idx.fileTier.get(f), 'compiler-accurate', f);
      }
      assert.equal(built.tier.partial, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
