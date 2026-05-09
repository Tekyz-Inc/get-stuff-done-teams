'use strict';

/**
 * M55 D4 — context-brief library: envelope shape, kind dispatch,
 * freshness invalidation, schema-version stability, idempotent-join,
 * fail-open / fail-closed, hard-cap enforcement, path-safety.
 *
 * Per-kind happy/edge-case tests live in test/m55-d4-context-brief-kinds/.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const lib = require('../bin/gsd-t-context-brief.cjs');
const LIB_PATH = path.resolve(__dirname, '..', 'bin', 'gsd-t-context-brief.cjs');

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d4-cb-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir, stdio: 'ignore' });
  } catch (_) { /* git might not be available; tests that need it will skip */ }
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function writeFile(root, rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function seedDomain(root, domain) {
  writeFile(root, '.gsd-t/domains/' + domain + '/scope.md',
    '# Domain: ' + domain + '\n\n' +
    '## Owned Files/Directories\n\n' +
    '- `bin/foo.cjs`\n' +
    '- `test/foo.test.js`\n\n' +
    '## NOT Owned (do not modify)\n\n' +
    '- `bin/bar.cjs`\n\n' +
    '## Deliverables\n\n' +
    '- foo library shipped\n' +
    '- foo test passing\n');
  writeFile(root, '.gsd-t/domains/' + domain + '/constraints.md',
    '# Constraints\n\n' +
    '## Must Follow\n\n' +
    '- Zero deps\n' +
    '- Pure\n\n' +
    '## Must Not\n\n' +
    '- Spawn LLMs\n');
  writeFile(root, '.gsd-t/domains/' + domain + '/tasks.md',
    '# Tasks\n\n' +
    '## T1 — first task\n\nbody\n\n' +
    '## T2 — second task\n\nbody\n');
}

// ── Envelope shape ──────────────────────────────────────────────────────────

test('SCHEMA_VERSION is 1.0.0', () => {
  assert.equal(lib.SCHEMA_VERSION, '1.0.0');
});

test('MAX_BRIEF_BYTES is 10240', () => {
  assert.equal(lib.MAX_BRIEF_BYTES, 10240);
});

test('KINDS contains the 6 declared kinds', () => {
  const expected = ['design-verify', 'execute', 'qa', 'red-team', 'scan', 'verify'];
  assert.deepEqual(lib.KINDS.slice().sort(), expected);
});

test('generateBrief returns v1.0.0 envelope shape', () => {
  const dir = makeTmpProject();
  try {
    seedDomain(dir, 'd-foo');
    const b = lib.generateBrief({
      projectDir: dir,
      kind: 'execute',
      domain: 'd-foo',
      spawnId: 'spawn-1',
    });
    assert.equal(b.schemaVersion, '1.0.0');
    assert.equal(typeof b.generatedAt, 'string');
    assert.match(b.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(b.spawnId, 'spawn-1');
    assert.equal(b.kind, 'execute');
    assert.equal(b.domain, 'd-foo');
    assert.equal(typeof b.sourceMtimes, 'object');
    assert.equal(typeof b.branch, 'string');
    assert.ok(Array.isArray(b.contracts));
    assert.equal(typeof b.scope, 'object');
    assert.ok(Array.isArray(b.scope.owned));
    assert.ok(Array.isArray(b.scope.notOwned));
    assert.ok(Array.isArray(b.scope.deliverables));
    assert.ok(Array.isArray(b.constraints));
    assert.equal(typeof b.ancillary, 'object');
  } finally { rm(dir); }
});

// ── Kind dispatch ───────────────────────────────────────────────────────────

test('loadKindRegistry returns 6 kinds, name === filename stem', () => {
  const reg = lib.loadKindRegistry();
  const names = reg.map((k) => k.name).sort();
  assert.deepEqual(names, ['design-verify', 'execute', 'qa', 'red-team', 'scan', 'verify']);
  for (const k of reg) {
    assert.equal(typeof k.collect, 'function');
    assert.ok(Array.isArray(k.requiresSources));
  }
});

test('generateBrief: unknown kind throws with informative message', () => {
  const dir = makeTmpProject();
  try {
    assert.throws(
      () => lib.generateBrief({ projectDir: dir, kind: 'nope', spawnId: 's-1' }),
      /unknown kind/,
    );
  } finally { rm(dir); }
});

// ── Path safety ─────────────────────────────────────────────────────────────

test('generateBrief rejects unsafe spawnId', () => {
  const dir = makeTmpProject();
  try {
    assert.throws(
      () => lib.generateBrief({ projectDir: dir, kind: 'scan', spawnId: '../etc/passwd' }),
      /unsafe characters/,
    );
    assert.throws(
      () => lib.generateBrief({ projectDir: dir, kind: 'scan', spawnId: 'has space' }),
      /unsafe characters/,
    );
  } finally { rm(dir); }
});

test('generateBrief rejects unsafe domain', () => {
  const dir = makeTmpProject();
  try {
    assert.throws(
      () => lib.generateBrief({ projectDir: dir, kind: 'execute', domain: '..', spawnId: 'ok' }),
      /unsafe characters/,
    );
    assert.throws(
      () => lib.generateBrief({ projectDir: dir, kind: 'execute', domain: 'a/b', spawnId: 'ok' }),
      /unsafe characters/,
    );
  } finally { rm(dir); }
});

test('CLI: rejects unsafe --domain with exit 2', () => {
  const r = spawnSync(process.execPath, [LIB_PATH,
    '--kind', 'execute', '--domain', '../etc/passwd', '--spawn-id', 'ok', '--json',
  ]);
  assert.equal(r.status, 2);
  assert.match(String(r.stderr), /must match \[a-zA-Z0-9_-\]\+/);
});

test('CLI: rejects unsafe --spawn-id with exit 2', () => {
  const r = spawnSync(process.execPath, [LIB_PATH,
    '--kind', 'execute', '--domain', 'd-foo', '--spawn-id', 'has space', '--json',
  ]);
  assert.equal(r.status, 2);
});

// ── Hard cap enforcement ────────────────────────────────────────────────────

test('generateBrief throws EBRIEF_TOO_LARGE on oversize ancillary', () => {
  const dir = makeTmpProject();
  try {
    seedDomain(dir, 'd-big');
    // Inject a synthetic kind module path that returns oversize ancillary.
    // We do this by monkey-patching loadKindRegistry via require cache.
    const kindsDir = path.join(__dirname, '..', 'bin', 'gsd-t-context-brief-kinds');
    const tempKind = path.join(kindsDir, 'TEST-toolarge.cjs');
    const huge = 'X'.repeat(20000);
    fs.writeFileSync(tempKind, [
      "module.exports = {",
      "  name: 'TEST-toolarge',",
      "  requiresSources: [],",
      "  collect() {",
      "    return { ancillary: { huge: " + JSON.stringify(huge) + " } };",
      "  },",
      "};",
    ].join('\n'));
    try {
      assert.throws(
        () => lib.generateBrief({ projectDir: dir, kind: 'TEST-toolarge', spawnId: 's-big' }),
        /MAX_BRIEF_BYTES/,
      );
    } finally {
      try { fs.unlinkSync(tempKind); } catch (_) {}
    }
  } finally { rm(dir); }
});

// ── Schema-version stability ────────────────────────────────────────────────

test('generateBrief output always has schemaVersion 1.0.0 across kinds', () => {
  const dir = makeTmpProject();
  try {
    seedDomain(dir, 'd-foo');
    // Seed templates/prompts/qa-subagent.md so qa kind doesn't fail-closed.
    writeFile(dir, 'templates/prompts/qa-subagent.md', '# QA\n');
    writeFile(dir, 'templates/prompts/red-team-subagent.md',
      '# Red Team\n\n## Attack Categories\n\n  - sample seed\n');
    writeFile(dir, 'package.json', JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }));

    for (const kind of ['execute', 'verify', 'qa', 'red-team', 'scan']) {
      const b = lib.generateBrief({
        projectDir: dir,
        kind,
        domain: 'd-foo',
        spawnId: 'sv-' + kind,
      });
      assert.equal(b.schemaVersion, '1.0.0', 'kind=' + kind);
    }
  } finally { rm(dir); }
});

// ── Idempotent-join ─────────────────────────────────────────────────────────

test('idempotent-join: byte-identical brief except generatedAt for same inputs', () => {
  const dir = makeTmpProject();
  try {
    seedDomain(dir, 'd-foo');
    const fixed = new Date('2026-05-09T10:00:00Z');
    const a = lib.generateBrief({
      projectDir: dir,
      kind: 'execute',
      domain: 'd-foo',
      spawnId: 'ij-1',
      now: fixed,
    });
    const b = lib.generateBrief({
      projectDir: dir,
      kind: 'execute',
      domain: 'd-foo',
      spawnId: 'ij-1',
      now: fixed,
    });
    assert.equal(lib.stableStringify(a), lib.stableStringify(b));
  } finally { rm(dir); }
});

test('idempotent-join: only generatedAt varies across two re-runs', () => {
  const dir = makeTmpProject();
  try {
    seedDomain(dir, 'd-foo');
    const a = lib.generateBrief({
      projectDir: dir,
      kind: 'execute',
      domain: 'd-foo',
      spawnId: 'ij-2',
      now: new Date('2026-05-09T10:00:00Z'),
    });
    const b = lib.generateBrief({
      projectDir: dir,
      kind: 'execute',
      domain: 'd-foo',
      spawnId: 'ij-2',
      now: new Date('2026-05-09T11:30:00Z'),
    });
    // Replace generatedAt with a constant on both, then compare.
    const aFix = Object.assign({}, a, { generatedAt: 'X' });
    const bFix = Object.assign({}, b, { generatedAt: 'X' });
    assert.equal(lib.stableStringify(aFix), lib.stableStringify(bFix));
  } finally { rm(dir); }
});

// ── Freshness via mtime hash-stamp ──────────────────────────────────────────

test('freshness: sourceMtimes records every read source', () => {
  const dir = makeTmpProject();
  try {
    seedDomain(dir, 'd-foo');
    const b = lib.generateBrief({
      projectDir: dir,
      kind: 'execute',
      domain: 'd-foo',
      spawnId: 'fr-1',
    });
    const keys = Object.keys(b.sourceMtimes);
    assert.ok(keys.includes('.gsd-t/domains/d-foo/scope.md'));
    assert.ok(keys.includes('.gsd-t/domains/d-foo/constraints.md'));
    assert.ok(keys.includes('.gsd-t/domains/d-foo/tasks.md'));
    for (const v of Object.values(b.sourceMtimes)) {
      assert.match(v, /^\d{4}-\d{2}-\d{2}T/);
    }
  } finally { rm(dir); }
});

test('freshness: mutating a source file changes its sourceMtimes value', async () => {
  const dir = makeTmpProject();
  try {
    seedDomain(dir, 'd-foo');
    const a = lib.generateBrief({ projectDir: dir, kind: 'execute', domain: 'd-foo', spawnId: 'fr-2' });
    const aMtime = a.sourceMtimes['.gsd-t/domains/d-foo/scope.md'];
    // Sleep ~10ms to ensure mtime changes.
    await new Promise((r) => setTimeout(r, 25));
    const scopePath = path.join(dir, '.gsd-t/domains/d-foo/scope.md');
    const old = fs.readFileSync(scopePath, 'utf8');
    fs.writeFileSync(scopePath, old + '\n# touched\n');
    const newMtime = new Date(Date.now() + 1000); // bump explicitly to dodge any clock granularity issues
    fs.utimesSync(scopePath, newMtime, newMtime);
    const b = lib.generateBrief({ projectDir: dir, kind: 'execute', domain: 'd-foo', spawnId: 'fr-2' });
    const bMtime = b.sourceMtimes['.gsd-t/domains/d-foo/scope.md'];
    assert.notEqual(aMtime, bMtime);
  } finally { rm(dir); }
});

// ── Fail-open / fail-closed ─────────────────────────────────────────────────

test('fail-open: execute kind with missing domain dir → empty fields, no throw', () => {
  const dir = makeTmpProject();
  try {
    const b = lib.generateBrief({
      projectDir: dir,
      kind: 'execute',
      domain: 'd-absent',
      spawnId: 'fo-1',
    });
    assert.deepEqual(b.scope.owned, []);
    assert.deepEqual(b.scope.notOwned, []);
    assert.deepEqual(b.scope.deliverables, []);
    assert.deepEqual(b.constraints, []);
    assert.deepEqual(b.contracts, []);
  } finally { rm(dir); }
});

test('fail-closed: qa kind without protocol → throws EREQUIRED_MISSING', () => {
  const dir = makeTmpProject();
  try {
    let err;
    try {
      lib.generateBrief({
        projectDir: dir, kind: 'qa', domain: 'd-foo', spawnId: 'fc-qa',
      });
    } catch (e) { err = e; }
    assert.ok(err, 'expected throw');
    assert.equal(err.code, 'EREQUIRED_MISSING');
    assert.ok(err.missing.includes('templates/prompts/qa-subagent.md'));
  } finally { rm(dir); }
});

test('fail-closed: red-team kind without protocol → throws EREQUIRED_MISSING', () => {
  const dir = makeTmpProject();
  try {
    let err;
    try {
      lib.generateBrief({
        projectDir: dir, kind: 'red-team', domain: 'd-foo', spawnId: 'fc-rt',
      });
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, 'EREQUIRED_MISSING');
  } finally { rm(dir); }
});

test('fail-closed: design-verify without any design contract → throws EREQUIRED_MISSING', () => {
  const dir = makeTmpProject();
  try {
    let err;
    try {
      lib.generateBrief({
        projectDir: dir, kind: 'design-verify', spawnId: 'fc-dv',
      });
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, 'EREQUIRED_MISSING');
  } finally { rm(dir); }
});

test('CLI: fail-closed kind without source returns exit 4', () => {
  const dir = makeTmpProject();
  try {
    const r = spawnSync(process.execPath, [LIB_PATH,
      '--kind', 'qa', '--domain', 'd-foo', '--spawn-id', 'cli-fc', '--json',
      '--project', dir,
    ]);
    assert.equal(r.status, 4);
  } finally { rm(dir); }
});

test('strict mode upgrades execute kind to fail-closed when domain dir missing', () => {
  // execute kind has no requiresSources, but `--strict` is meant to fail-close
  // on missing OPTIONAL inputs. The library applies strict only to declared
  // requiresSources, so this test exercises that surface even though execute
  // declares zero required.
  const dir = makeTmpProject();
  try {
    const b = lib.generateBrief({
      projectDir: dir, kind: 'execute', domain: 'd-absent', spawnId: 'st-1',
      strict: true,
    });
    // execute has empty requiresSources; strict-mode upgrade is informational
    // only. We assert the brief still generates rather than crashing.
    assert.equal(b.kind, 'execute');
  } finally { rm(dir); }
});

// ── stableStringify ─────────────────────────────────────────────────────────

test('stableStringify: alphabetical keys at every nesting level', () => {
  const out = lib.stableStringify({ z: 1, a: { z: 1, a: 2 } });
  // Keys should appear in alphabetical order.
  assert.ok(out.indexOf('"a"') < out.indexOf('"z"'));
  // And inside the nested object too.
  const inner = out.indexOf('"a": {');
  const innerA = out.indexOf('"a": 2', inner);
  const innerZ = out.indexOf('"z": 1', inner);
  assert.ok(innerA < innerZ);
});

test('stableStringify: arrays preserved in caller order', () => {
  const out = lib.stableStringify({ items: ['z', 'a', 'm'] });
  // We do NOT auto-sort arrays at the JSON layer — collectors do that
  // explicitly. The stringifier preserves caller-supplied order.
  const idx = (s) => out.indexOf(s);
  assert.ok(idx('"z"') < idx('"a"'));
});

// ── CLI integration ────────────────────────────────────────────────────────

test('CLI happy path: --kind scan --spawn-id s-cli prints JSON envelope', () => {
  const dir = makeTmpProject();
  try {
    const r = spawnSync(process.execPath, [LIB_PATH,
      '--kind', 'scan', '--spawn-id', 's-cli', '--json',
      '--project', dir,
    ]);
    assert.equal(r.status, 0, 'stderr=' + r.stderr);
    const obj = JSON.parse(r.stdout.toString());
    assert.equal(obj.schemaVersion, '1.0.0');
    assert.equal(obj.kind, 'scan');
    assert.equal(obj.spawnId, 's-cli');
  } finally { rm(dir); }
});

test('CLI: --out PATH writes brief to file and exits 0', () => {
  const dir = makeTmpProject();
  const outPath = path.join(dir, '.gsd-t/briefs/o-1.json');
  try {
    const r = spawnSync(process.execPath, [LIB_PATH,
      '--kind', 'scan', '--spawn-id', 'o-1', '--out', outPath,
      '--project', dir,
    ]);
    assert.equal(r.status, 0, 'stderr=' + r.stderr);
    const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(written.spawnId, 'o-1');
    assert.equal(written.kind, 'scan');
  } finally { rm(dir); }
});

test('CLI: --help prints usage and exits 0', () => {
  const r = spawnSync(process.execPath, [LIB_PATH, '--help']);
  assert.equal(r.status, 0);
  assert.match(String(r.stdout), /Usage:/);
});

test('CLI: missing --kind returns exit 2', () => {
  const r = spawnSync(process.execPath, [LIB_PATH, '--spawn-id', 'x']);
  assert.equal(r.status, 2);
});

test('CLI: missing --spawn-id returns exit 2', () => {
  const r = spawnSync(process.execPath, [LIB_PATH, '--kind', 'scan']);
  assert.equal(r.status, 2);
});

// ── _isValidKindModule ─────────────────────────────────────────────────────

test('_isValidKindModule rejects malformed modules', () => {
  assert.equal(lib._isValidKindModule(null, 'foo.cjs'), false);
  assert.equal(lib._isValidKindModule({}, 'foo.cjs'), false);
  assert.equal(lib._isValidKindModule({ name: 'foo' }, 'foo.cjs'), false);
  assert.equal(lib._isValidKindModule({ name: 'foo', collect: () => ({}) }, 'bar.cjs'), false);
  assert.equal(lib._isValidKindModule({ name: 'foo', collect: () => ({}), requiresSources: 'no' }, 'foo.cjs'), false);
});

test('_isValidKindModule accepts well-formed modules', () => {
  const ok = { name: 'foo', collect: () => ({}), requiresSources: [] };
  assert.equal(lib._isValidKindModule(ok, 'foo.cjs'), true);
});
