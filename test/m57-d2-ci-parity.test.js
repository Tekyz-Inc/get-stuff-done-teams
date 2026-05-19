'use strict';

/**
 * M57 D2 — ci-parity: detection precedence + containment-safe clearBuildCaches.
 *
 * The containment tests are the BUG-1 / BUG-8 / prefix-collision regression
 * guarantee and run UNCONDITIONALLY (no Docker daemon needed). The first
 * design's clearBuildCaches did `fs.rmSync(path.resolve(projectDir,
 * tsconfig.outDir), {recursive,force})` with NO containment check:
 *   BUG-1: outDir "../victim"  → force-deleted a sibling dir
 *   BUG-8: outDir "."/"./"/... → force-deleted the entire repo
 * The corrected design routes every config-derived delete through
 * _isSafeToDelete (predicate: resolved.startsWith(root+sep) && !==root).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MOD = path.join(__dirname, '..', 'bin', 'gsd-t-ci-parity.cjs');
const { runCiParity, detectCi, clearBuildCaches, _isSafeToDelete } = require(MOD);
const FIX = path.join(__dirname, 'fixtures', 'm57-ci-parity');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm57-d2-'));
}

// --- _isSafeToDelete: the LOCKED predicate, in isolation -----------------

test('_isSafeToDelete: strict descendant → true', () => {
  assert.strictEqual(_isSafeToDelete('/proj/dist', '/proj'), true);
  assert.strictEqual(_isSafeToDelete('/proj/a/b/c', '/proj'), true);
});

test('_isSafeToDelete: equal to root → false (BUG-8 edge)', () => {
  assert.strictEqual(_isSafeToDelete('/proj', '/proj'), false);
  assert.strictEqual(_isSafeToDelete('/proj/', '/proj'), false);
  assert.strictEqual(_isSafeToDelete('/proj/src/..', '/proj'), false);
  assert.strictEqual(_isSafeToDelete('/proj/./foo/../', '/proj'), false);
});

test('_isSafeToDelete: outside root → false (BUG-1 edge)', () => {
  assert.strictEqual(_isSafeToDelete('/proj/../victim', '/proj'), false);
  assert.strictEqual(_isSafeToDelete('/etc/passwd', '/proj'), false);
  assert.strictEqual(_isSafeToDelete('/var/tmp', '/proj'), false);
});

test('_isSafeToDelete: prefix-collision sibling → false', () => {
  // "/proj-evil" startsWith("/proj") is true WITHOUT the +sep guard — must be false.
  assert.strictEqual(_isSafeToDelete('/proj-evil/cache', '/proj'), false);
  assert.strictEqual(_isSafeToDelete('/proj-evil', '/proj'), false);
});

// --- BUG-1: outDir traversal must REFUSE, sibling must SURVIVE -----------

test('BUG-1: clearBuildCaches refuses outDir "../victim"; sibling survives', () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, 'proj');
  const victim = path.join(tmp, 'victim');
  fs.mkdirSync(proj, { recursive: true });
  fs.mkdirSync(victim, { recursive: true });
  const precious = path.join(victim, 'precious.txt');
  fs.writeFileSync(precious, 'must survive');
  fs.writeFileSync(path.join(proj, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { outDir: '../victim' } }));

  const { refusedPaths } = clearBuildCaches(proj);

  assert.ok(fs.existsSync(precious), 'sibling victim/precious.txt MUST survive (BUG-1)');
  assert.ok(refusedPaths.some(p => p.includes('victim')),
    `refusedPaths should record the escape, got ${JSON.stringify(refusedPaths)}`);
});

// --- BUG-8: outDir resolving to root must REFUSE, repo must SURVIVE -----

for (const variant of ['.', './', 'src/..', './foo/../']) {
  test(`BUG-8: clearBuildCaches refuses outDir ${JSON.stringify(variant)}; project survives`, () => {
    const tmp = mkTmp();
    const proj = path.join(tmp, 'proj');
    fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
    const sentinel = path.join(proj, 'src', 'index.ts');
    fs.writeFileSync(sentinel, 'export const x = 1;');
    fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p', version: '1.0.0' }));
    fs.writeFileSync(path.join(proj, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { outDir: variant } }));

    const { refusedPaths } = clearBuildCaches(proj);

    assert.ok(fs.existsSync(sentinel), `project src/ MUST survive outDir ${variant} (BUG-8)`);
    assert.ok(fs.existsSync(path.join(proj, 'package.json')), 'package.json MUST survive');
    assert.ok(refusedPaths.some(p => path.resolve(p) === path.resolve(proj)),
      `refusedPaths should record the root-resolving target, got ${JSON.stringify(refusedPaths)}`);
  });
}

// --- No over-correction: a legitimate outDir under root IS removed ------

test('legit outDir "dist" under projectRoot is still removed (no over-correction)', () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(path.join(proj, 'dist'), { recursive: true });
  const stale = path.join(proj, 'dist', 'old.js');
  fs.writeFileSync(stale, 'stale');
  fs.writeFileSync(path.join(proj, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { outDir: 'dist' } }));

  const { refusedPaths } = clearBuildCaches(proj);

  assert.ok(!fs.existsSync(stale), 'legitimate dist/ MUST be removed');
  assert.deepStrictEqual(refusedPaths, [], 'no refusal for a legit in-root path');
});

// --- BUG-2: cache-clear is on the MANDATORY path (Docker-less) ----------

test('BUG-2: stale .tsbuildinfo is removed before commands run (no Docker)', () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'),
    JSON.stringify({ name: 'p', version: '1.0.0', scripts: { build: 'true' } }));
  const stale = path.join(proj, 'tsconfig.tsbuildinfo');
  fs.writeFileSync(stale, '{"stale":true}');

  const r = runCiParity({ projectDir: proj, timeoutMs: 10000 });

  assert.ok(!fs.existsSync(stale), 'stale .tsbuildinfo MUST be cleared on the mandatory path');
  assert.strictEqual(r.cacheCleared, true, 'envelope must report cacheCleared:true');
});

test('BUG-2: cache-clear runs even on a Dockerfile-only / no-CI project', () => {
  const tmp = mkTmp();
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'Dockerfile'), 'FROM scratch\n');
  const stale = path.join(proj, 'app.tsbuildinfo');
  fs.writeFileSync(stale, 'x');

  const r = runCiParity({ projectDir: proj, timeoutMs: 10000 });

  assert.ok(!fs.existsSync(stale),
    'cache-clear must run even when detectedSource is none (the BUG-2 early-return gap)');
  assert.strictEqual(r.cacheCleared, true);
});

// --- Detection precedence (static fixtures) ------------------------------

test('detection precedence: cloudbuild fixture → cloudbuild', () => {
  assert.strictEqual(detectCi(path.join(FIX, 'cloudbuild')).source, 'cloudbuild');
});

test('detection precedence: workflows fixture → workflows', () => {
  assert.strictEqual(detectCi(path.join(FIX, 'workflows')).source, 'workflows');
});

test('detection precedence: dockerfile-run fixture → dockerfile-run', () => {
  assert.strictEqual(detectCi(path.join(FIX, 'dockerfile-run')).source, 'dockerfile-run');
});

test('detection precedence: pkg-fallback fixture → package-scripts', () => {
  assert.strictEqual(detectCi(path.join(FIX, 'pkg-fallback')).source, 'package-scripts');
});

test('detection precedence: empty project → none', () => {
  const tmp = mkTmp();
  assert.strictEqual(detectCi(tmp).source, 'none');
});

// --- SC2: real docker build catches a regression (self-skips no Docker) --

test('SC2: planted-regression — docker build catches tsc strict regression', (t) => {
  const cp = require('child_process');
  const hasDocker = (() => {
    try { return cp.spawnSync('docker', ['--version'], { timeout: 5000 }).status === 0; }
    catch { return false; }
  })();
  if (!hasDocker) {
    t.skip('docker daemon unavailable — SC2 docker-build assertion skipped (cache-clear+detection asserted elsewhere unconditionally)');
    return;
  }
  const r = runCiParity({ projectDir: path.join(FIX, 'planted-regression'), timeoutMs: 120000 });
  assert.strictEqual(r.ok, false, 'planted tsc strict regression must fail the real docker build');
});

test('no-dockerfile path is not a failure', () => {
  const tmp = mkTmp();
  fs.writeFileSync(path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'p', version: '1.0.0', scripts: { build: 'true' } }));
  const r = runCiParity({ projectDir: tmp, timeoutMs: 10000 });
  assert.strictEqual(r.dockerBuilt, false);
  assert.strictEqual(r.dockerSkippedReason, 'no-dockerfile');
});
