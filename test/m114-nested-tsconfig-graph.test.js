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
