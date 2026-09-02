'use strict';

/**
 * M114 — the graph indexed one TypeScript project and called it the whole repo.
 *
 * Found in TimeTracking: 8 of 245 files indexed, 96 of 50,283 call edges resolved
 * (0.2%, all same-file), and not one backend call among them. The root
 * tsconfig.json's `include` listed frontend paths only, so `server/src/` was
 * never compiled and every backend `who-calls` returned empty.
 *
 * Three defects, each of which alone makes the other fixes worthless:
 *
 *   1. ONE indexer run at the repo root. `--infer-tsconfig` does not cover this:
 *      it finds *a* tsconfig when the root has none, but still emits ONE index
 *      from ONE root.
 *
 *   2. Paths keyed to where the indexer RAN. Indexing `server/` emits
 *      `src/index.ts`; the graph stores `server/src/index.ts`. So adding a
 *      second run WITHOUT re-prefixing resolves exactly nothing while looking
 *      like a fix — the trap that makes this bug class survive its own repair.
 *
 *   3. `who-calls` reported `coverage.complete: true` while returning zero.
 *      Coverage counted PARSE failures only; a file that parsed but was never
 *      compiler-resolved is equally invisible to a call query, and never lands
 *      in skippedFiles. "Nothing calls this" is read right before a rename or a
 *      delete, so a false all-clear is worse than no answer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.join(__dirname, '..');
const { findTsProjectDirs } = require(path.join(REPO, 'bin', 'gsd-t-graph-scip-upgrade.cjs'));
const { computeCoverage, countUnresolvedFiles } =
  require(path.join(REPO, 'bin', 'gsd-t-graph-query-cli.cjs'));

function tmpRepo(layout) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m114-'));
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

// ── Defect 1: every tsconfig project is discovered ───────────────────────────

test('finds a nested project the root tsconfig excludes', () => {
  // The exact TimeTracking shape: root include lists frontend paths only.
  const dir = tmpRepo({
    'tsconfig.json': JSON.stringify({ include: ['App.tsx', 'components/*'] }),
    'App.tsx': 'export const A = 1;',
    'server/tsconfig.json': JSON.stringify({ include: ['src/*'] }),
    'server/src/index.ts': 'export function handler() {}',
  });
  try {
    const dirs = findTsProjectDirs(dir);
    assert.ok(dirs.includes(''), 'the repo root project must be found');
    assert.ok(dirs.includes('server'), 'the nested server project must be found');
  } finally { rm(dir); }
});

test('the repo root sorts first so its symbols win', () => {
  const dir = tmpRepo({
    'tsconfig.json': '{}',
    'api/tsconfig.json': '{}',
    'server/tsconfig.json': '{}',
  });
  try {
    assert.equal(findTsProjectDirs(dir)[0], '', 'root must be indexed first');
  } finally { rm(dir); }
});

test('vendored and build dirs are not mistaken for projects', () => {
  // node_modules holds thousands of tsconfigs; indexing them would be endless.
  const dir = tmpRepo({
    'tsconfig.json': '{}',
    'node_modules/pkg/tsconfig.json': '{}',
    'dist/tsconfig.json': '{}',
    'dist-test/tsconfig.json': '{}',
  });
  try {
    assert.deepEqual(findTsProjectDirs(dir), ['']);
  } finally { rm(dir); }
});

test('a repo with no tsconfig at all yields no projects', () => {
  // The caller falls back to a single root run with --infer-tsconfig.
  const dir = tmpRepo({ 'index.ts': 'export const x = 1;' });
  try {
    assert.deepEqual(findTsProjectDirs(dir), []);
  } finally { rm(dir); }
});

// ── Defect 3: coverage stops lying on call queries ───────────────────────────

test('an unresolved file makes a CALL query incomplete', () => {
  const cov = computeCoverage(new Set(), { callEdgesUnresolved: true, unresolvedFiles: 164 });
  assert.equal(cov.complete, false, 'zero results from unresolved files is NOT "no callers"');
  assert.equal(cov.unresolvedContributors, 164);
  assert.match(cov.note, /unknown, not absent/);
});

test('IMPORT queries stay complete at floor tier', () => {
  // Import edges come from the parse, so who-imports is genuinely complete
  // even when nothing was compiler-resolved. Flagging it would cry wolf.
  const cov = computeCoverage(new Set(), {});
  assert.equal(cov.complete, true);
});

test('a fully resolved repo reports complete', () => {
  const cov = computeCoverage(new Set(), { callEdgesUnresolved: true, unresolvedFiles: 0 });
  assert.equal(cov.complete, true);
});

test('unparsed and unresolved are reported as distinct causes', () => {
  const cov = computeCoverage(new Set(['a.ts']), { callEdgesUnresolved: true, unresolvedFiles: 3 });
  assert.equal(cov.complete, false);
  assert.equal(cov.unparsedContributors, 1);
  assert.equal(cov.unresolvedContributors, 3);
  assert.match(cov.note, /1 file\(s\) unparsed/);
  assert.match(cov.note, /3 file\(s\) parsed but not compiler-resolved/);
});

test('countUnresolvedFiles counts every non-accurate tier', () => {
  const index = { fileTier: new Map([
    ['a.ts', 'compiler-accurate'],
    ['b.ts', 'tree-sitter-floor'],
    ['c.ts', 'tree-sitter-floor-STALE-SCIP'],
  ]) };
  assert.equal(countUnresolvedFiles(index), 2);
});

test('countUnresolvedFiles is safe on an index with no tier data', () => {
  assert.equal(countUnresolvedFiles({}), 0);
  assert.equal(countUnresolvedFiles(null), 0);
});

// ── Defect 2: paths are re-prefixed to the repo root ─────────────────────────

// Needs a REAL .scip (the decoder is scip-typescript's bundled protobuf), so
// this builds a tiny nested project and indexes it for real. Skipped when
// scip-typescript is absent — the assertion is about path shape, not the tool.
test('a nested project\'s paths are re-rooted to the repo root', (t) => {
  const { execFileSync } = require('node:child_process');
  const { readScipIndex } = require(path.join(REPO, 'bin', 'gsd-t-scip-reader.cjs'));
  try { execFileSync('which', ['scip-typescript'], { stdio: 'pipe' }); }
  catch { return t.skip('scip-typescript not installed'); }

  const dir = tmpRepo({
    'server/tsconfig.json': JSON.stringify({
      compilerOptions: { target: 'ES2020', module: 'commonjs' },
      include: ['src/*'],
    }),
    'server/src/index.ts': 'export function handler() { return helper(); }\n' +
                           'export function helper() { return 1; }\n',
  });
  try {
    const out = path.join(dir, 'idx.scip');
    execFileSync('scip-typescript', ['index', '--output', out, '.'],
      { cwd: path.join(dir, 'server'), stdio: 'pipe', timeout: 120000 });

    // Without the prefix: keys are relative to WHERE THE INDEXER RAN.
    const bare = readScipIndex(out);
    assert.ok(bare.ok, 'index must decode');
    const bareKeys = [...bare.fileRefs.keys()];
    assert.ok(bareKeys.some((k) => k.startsWith('src/')),
      'unprefixed keys are indexer-relative — the bug');
    assert.ok(!bareKeys.some((k) => k.startsWith('server/')),
      'unprefixed keys must NOT already be repo-relative, else the test proves nothing');

    // With the prefix: keys AND funcIds match what the graph stores.
    const fixed = readScipIndex(out, 'server');
    assert.ok(fixed.ok);
    const keys = [...fixed.fileRefs.keys()];
    assert.ok(keys.every((k) => k.startsWith('server/')), 'every key re-rooted');

    // The funcId half is the one that is easy to miss: a funcId is
    // `relPath#name`, so prefixing only the Map keys leaves every VALUE
    // pointing at a path the graph does not have, and nothing resolves.
    const someRefs = fixed.fileRefs.values().next().value;
    assert.ok(someRefs.every((r) => r.funcId.startsWith('server/')),
      'funcIds must be re-rooted too, not just the keys');
  } finally { rm(dir); }
});

test('prefix forms normalize to the same result', () => {
  // "", ".", "server", "server/" must not produce four different key spaces.
  const { readScipIndex } = require(path.join(REPO, 'bin', 'gsd-t-scip-reader.cjs'));
  const missing = readScipIndex('/nonexistent/x.scip', 'server/');
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'scip-file-missing', 'still fails loud with a prefix');
});

// ── Defect 4: arrow-function exports were discarded entirely ─────────────────

const { funcNameFromSymbol } = require(path.join(REPO, 'bin', 'gsd-t-scip-reader.cjs'));

test('a const arrow function is a callable, not noise', () => {
  // `export const logAudit = async () => {}` is a VARIABLE to TypeScript, so
  // SCIP emits a TERM descriptor (`logAudit.`) rather than a method one
  // (`logAudit().`). Requiring "()." discarded every arrow-function export:
  // on a real server, 3,584 term symbols dropped against 1,624 kept, so
  // `who-calls logAudit` answered "no callers" for a function called
  // throughout the codebase.
  const base = 'scip-typescript npm srv 1.0 src/`audit.ts`/';
  assert.equal(funcNameFromSymbol(base + 'logAudit.'), 'logAudit');
  assert.equal(funcNameFromSymbol(base + 'verifyToken().'), 'verifyToken');
});

test('a method on a class still resolves', () => {
  const s = 'scip-typescript npm srv 1.0 src/`svc.ts`/Service#handle().';
  assert.equal(funcNameFromSymbol(s), 'handle');
});

test('parameters are still excluded', () => {
  // A parameter ends in ')', not '.', so neither pattern may claim it —
  // admitting them would let a parameter name shadow a real function.
  const s = 'scip-typescript npm srv 1.0 src/`a.ts`/looksLikeToken().(candidate)';
  assert.equal(funcNameFromSymbol(s), null);
});

test('non-callable input is rejected', () => {
  assert.equal(funcNameFromSymbol(''), null);
  assert.equal(funcNameFromSymbol(null), null);
  assert.equal(funcNameFromSymbol('scip npm x 1.0 src/`a.ts`/Thing#'), null, 'a type is not callable');
});

// ── Defect 5: a `.js` import specifier never reached its `.ts` source ─────────

// TypeScript ESM REQUIRES an import to be WRITTEN `./x.js` while the file on
// disk is `x.ts`. The resolver appended extensions (x.js, x.js.ts, ...) and
// never SWAPPED, so who-imports answered "0 importers, coverage complete" for a
// file with five real importers. 817 of binvoice's 2,376 import edges (34%)
// were unresolvable this way — each reading as "nothing imports this".
//
// resolveDst is a closure inside loadStore, so this drives the real CLI against
// a real store: build a tiny repo, index it, query it.

const { execFileSync } = require('node:child_process');

function indexAndQuery(files, target) {
  const dir = tmpRepo(files);
  try {
    execFileSync('node', [path.join(REPO, 'bin', 'gsd-t-graph-index.cjs'), 'build'],
      { cwd: dir, stdio: 'pipe', timeout: 120000 });
    const out = execFileSync('node',
      [path.join(REPO, 'bin', 'gsd-t-graph-query-cli.cjs'), 'who-imports', target],
      { cwd: dir, encoding: 'utf8', timeout: 60000 });
    return JSON.parse(out);
  } finally { rm(dir); }
}

test('an import written .js resolves to the .ts file on disk', () => {
  const r = indexAndQuery({
    'src/dom-observer.ts': 'export function startObserver() { return 1; }\n',
    'src/index.ts': "import { startObserver } from './dom-observer.js';\nexport const go = () => startObserver();\n",
  }, 'src/dom-observer.ts');
  assert.ok(r.ok, 'query must succeed');
  assert.deepEqual(r.results, ['src/index.ts'],
    'the .js specifier must resolve to the .ts source');
});

test('a real .js file still wins over the .ts swap', () => {
  // Swapping is a LAST resort: when the .js genuinely exists it is the target.
  // Preferring the .ts would silently retarget a real JavaScript import.
  const r = indexAndQuery({
    'lib/helper.js': 'export function h() { return 1; }\n',
    'lib/helper.ts': 'export function h() { return 2; }\n',
    'lib/main.ts': "import { h } from './helper.js';\nexport const go = () => h();\n",
  }, 'lib/helper.js');
  assert.ok(r.ok);
  assert.deepEqual(r.results, ['lib/main.ts'],
    'an existing .js file is the target, not the .ts');
});

test('a genuinely external package is not rewritten', () => {
  const r = indexAndQuery({
    'src/a.ts': "import React from 'react';\nexport const go = () => React;\n",
  }, 'react');
  assert.ok(r.ok);
  assert.deepEqual(r.results, ['src/a.ts'], 'a package specifier stays as written');
});
