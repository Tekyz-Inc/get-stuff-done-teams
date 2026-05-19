'use strict';

/**
 * M57 D1 — build-coverage STRUCTURAL parser.
 *
 * The bug* fixtures are the FROZEN Red Team falsification corpus (committed
 * 56ddded). Every one is a synthetic project where `hooks/` is genuinely
 * uncovered (Dockerfile only `COPY src/`), but the string `hooks/` appears
 * somewhere as prose / comment / `name:` / interior token. The corrected
 * structural parser MUST flag `hooks` as missing for every one of them —
 * this is the regression guarantee against re-opening the non-converging
 * substring defect class (BUG-4/6/9/9b).
 *
 * Fixtures have no .git; we drive checkBuildCoverage via the `_newPaths`
 * test seam and exercise the REAL structural parsers against the REAL
 * fixture CI files.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const cp = require('child_process');

const MOD = path.join(__dirname, '..', 'bin', 'gsd-t-build-coverage.cjs');
const { checkBuildCoverage } = require(MOD);
const FIX = path.join(__dirname, 'fixtures', 'm57-build-coverage');

function check(fixture, newPaths) {
  return checkBuildCoverage({
    projectDir: path.join(FIX, fixture),
    baseRef: 'A', headRef: 'B',
    _newPaths: newPaths,
  });
}

// --- SC1: the canonical TimeTracking failure class ------------------------

test('SC1 docker-cloudbuild: uncovered hooks/ is flagged', () => {
  const r = check('docker-cloudbuild', ['hooks/post-deploy.sh', 'src/index.js']);
  assert.strictEqual(r.ok, false);
  assert.ok(r.missing.includes('hooks'), `missing=${JSON.stringify(r.missing)}`);
  assert.ok(!r.missing.includes('src'), 'src IS copied → must not be missing');
});

test('SC1 exits 4 on uncovered path (exit-code contract)', () => {
  const code = `
    const {checkBuildCoverage}=require(${JSON.stringify(MOD)});
    const r=checkBuildCoverage({projectDir:${JSON.stringify(path.join(FIX,'docker-cloudbuild'))},baseRef:'A',headRef:'B',_newPaths:['hooks/x']});
    process.exit(r.ok?0:4);`;
  const res = cp.spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.strictEqual(res.status, 4);
});

// --- Falsification corpus: one assertion per frozen bug* fixture ----------

const FROZEN = [
  ['bug4-incidental-token',     'interior token node_modules/husky/hooks/ must NOT cover hooks'],
  ['bug6-cloudbuild-comment',   'dir named only in a cloudbuild # comment is NOT coverage'],
  ['bug6-workflow-comment',     'dir named only in a workflow # comment is NOT coverage'],
  ['bug7-node-modules-token',   'node_modules/.bin CI line must NOT mask uncovered hooks'],
  ['bug9-stepname-prose',       'dir in a single-line GHA step name: is NOT coverage'],
  ['bug9b-name-block-scalar',   'dir in a name: | block-scalar continuation is NOT coverage'],
  ['bug9b-name-folded-scalar',  'dir in a name: > folded-scalar continuation is NOT coverage'],
];

for (const [fixture, why] of FROZEN) {
  test(`falsification corpus: ${fixture} → hooks flagged (${why})`, () => {
    const r = check(fixture, ['hooks/post-deploy.sh']);
    assert.strictEqual(r.ok, false, `expected ok:false — ${why}`);
    assert.ok(r.missing.includes('hooks'),
      `${fixture}: expected 'hooks' in missing, got ${JSON.stringify(r.missing)} — ${why}`);
  });
}

// --- True-negative guards (no over-correction) ---------------------------

test('copy-dot: COPY . . covers everything → ok:true', () => {
  const r = check('copy-dot', ['hooks/x', 'anything/y']);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.missing, []);
});

test('relative-from: relative COPY --from=builder dist/ covers dist (BUG-3 corrected)', () => {
  const r = check('relative-from', ['dist/index.js']);
  assert.strictEqual(r.ok, true, `dist should be covered, missing=${JSON.stringify(r.missing)}`);
});

test('relative-from: src/ is also covered (COPY src/ ./src/)', () => {
  assert.strictEqual(check('relative-from', ['src/index.js']).ok, true);
});

test('docker-cloudbuild: absolute COPY --from=builder /app/dist does NOT cover workspace dist/', () => {
  const r = check('docker-cloudbuild', ['dist/thing.js']);
  assert.strictEqual(r.ok, false);
  assert.ok(r.missing.includes('dist'));
});

test('no-ci: no CI artifacts → ok:true with note', () => {
  const r = check('no-ci', ['src/index.js']);
  assert.strictEqual(r.ok, true);
  assert.match(r.note || '', /no CI artifacts/);
});

test('gha-only: covered src/ passes, uncovered config/ flagged', () => {
  assert.strictEqual(check('gha-only', ['src/a.js']).ok, true);
  const r = check('gha-only', ['config/x.yml']);
  assert.strictEqual(r.ok, false);
  assert.ok(r.missing.includes('config'));
});

test('empty diff → ok:true, newPaths empty', () => {
  const r = check('docker-cloudbuild', []);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.newPaths, []);
});

test('node_modules is never gated and never coverage', () => {
  const r = check('docker-cloudbuild', ['node_modules/foo/index.js']);
  assert.strictEqual(r.ok, true, 'a node_modules new-path must not be gated');
});

// --- CLI usage error path ------------------------------------------------

test('CLI: identical refs → exit 2 (usage error)', () => {
  const res = cp.spawnSync(process.execPath,
    [MOD, '--base', 'HEAD', '--head', 'HEAD', '--project-dir', path.join(FIX, 'no-ci')],
    { encoding: 'utf8' });
  assert.strictEqual(res.status, 2);
});

// --- Structural-not-substring proof --------------------------------------

test('structural proof: bug6-workflow-comment — src in run: covered, hooks only-in-comment not', () => {
  assert.strictEqual(check('bug6-workflow-comment', ['src/x.js']).ok, true,
    'src/ is in `run: cp -r src/ out/` → covered');
  assert.strictEqual(check('bug6-workflow-comment', ['hooks/x.sh']).ok, false,
    'hooks/ only in a # comment → NOT covered');
});
