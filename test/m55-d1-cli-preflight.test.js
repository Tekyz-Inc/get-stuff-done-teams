'use strict';

/**
 * M55 D1 — cli-preflight library: envelope shape + library API + CLI integration tests.
 *
 * Per-check happy/fail tests live in test/m55-d1-cli-preflight-checks/.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const lib = require('../bin/cli-preflight.cjs');
const LIB_PATH = path.resolve(__dirname, '..', 'bin', 'cli-preflight.cjs');

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m55-d1-'));
  // git init so checks that use git won't blow up.
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir, stdio: 'ignore' });
  } catch (_) {
    // git might not be available; tests that need it will skip.
  }
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ── Envelope shape ──────────────────────────────────────────────────────────

test('runPreflight: returns v1.0.0 envelope shape', () => {
  const dir = makeTmpProject();
  try {
    const out = lib.runPreflight({ projectDir: dir });
    assert.equal(out.schemaVersion, '1.0.0');
    assert.equal(typeof out.ok, 'boolean');
    assert.ok(Array.isArray(out.checks));
    assert.ok(Array.isArray(out.notes));
    for (const c of out.checks) {
      assert.equal(typeof c.id, 'string');
      assert.equal(typeof c.ok, 'boolean');
      assert.ok(['error', 'warn', 'info'].includes(c.severity));
      assert.equal(typeof c.msg, 'string');
    }
  } finally {
    cleanup(dir);
  }
});

test('runPreflight: checks[] sorted by id (deterministic)', () => {
  const dir = makeTmpProject();
  try {
    const out = lib.runPreflight({ projectDir: dir });
    const ids = out.checks.map((c) => c.id);
    const sorted = [...ids].sort();
    assert.deepEqual(ids, sorted);
  } finally {
    cleanup(dir);
  }
});

test('runPreflight: registers all 6 built-in checks', () => {
  const dir = makeTmpProject();
  try {
    const out = lib.runPreflight({ projectDir: dir });
    const ids = new Set(out.checks.map((c) => c.id));
    assert.ok(ids.has('branch-guard'));
    assert.ok(ids.has('ports-free'));
    assert.ok(ids.has('deps-installed'));
    assert.ok(ids.has('contracts-stable'));
    assert.ok(ids.has('manifest-fresh'));
    assert.ok(ids.has('working-tree-state'));
    assert.equal(out.checks.length, 6);
  } finally {
    cleanup(dir);
  }
});

test('runPreflight: top-level ok=true when only warn/info checks fail', () => {
  // contracts-stable is warn; force it to fail (ACTIVE state + DRAFT contract)
  const dir = makeTmpProject();
  try {
    fs.mkdirSync(path.join(dir, '.gsd-t', 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), '## Status\n\nStatus: ACTIVE\n');
    fs.writeFileSync(
      path.join(dir, '.gsd-t', 'contracts', 'foo-contract.md'),
      '# Foo\n\nStatus: DRAFT\n'
    );
    const out = lib.runPreflight({ projectDir: dir, checks: ['contracts-stable'] });
    const cs = out.checks.find((c) => c.id === 'contracts-stable');
    assert.equal(cs.ok, false);
    assert.equal(cs.severity, 'warn');
    // Top-level ok stays TRUE because only warn-severity check failed.
    assert.equal(out.ok, true);
  } finally {
    cleanup(dir);
  }
});

test('runPreflight: top-level ok=false when an error-severity check fails', () => {
  const dir = makeTmpProject();
  try {
    // ports-free is error severity. Force it to fail by occupying a port.
    const net = require('node:net');
    const server = net.createServer();
    server.listen(0);
    const addr = server.address();
    const port = addr && typeof addr === 'object' ? addr.port : 0;
    fs.mkdirSync(path.join(dir, '.gsd-t', '.unattended'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.gsd-t', '.unattended', 'config.json'),
      JSON.stringify({ requiredFreePorts: [port] })
    );
    const out = lib.runPreflight({ projectDir: dir, checks: ['ports-free'] });
    server.close();
    const pf = out.checks.find((c) => c.id === 'ports-free');
    assert.equal(pf.ok, false);
    assert.equal(pf.severity, 'error');
    assert.equal(out.ok, false);
  } finally {
    cleanup(dir);
  }
});

test('runPreflight: restrict via opts.checks honoured', () => {
  const dir = makeTmpProject();
  try {
    const out = lib.runPreflight({ projectDir: dir, checks: ['ports-free'] });
    assert.equal(out.checks.length, 1);
    assert.equal(out.checks[0].id, 'ports-free');
  } finally {
    cleanup(dir);
  }
});

test('runPreflight: notes[] sorted ascending', () => {
  const dir = makeTmpProject();
  try {
    const out = lib.runPreflight({ projectDir: dir });
    const sorted = [...out.notes].sort();
    assert.deepEqual(out.notes, sorted);
  } finally {
    cleanup(dir);
  }
});

// ── Fail-soft on per-check throws ───────────────────────────────────────────

test('_runOneCheck: throws caught and recorded as ok:false synthetic entry', () => {
  const notes = [];
  const result = lib._runOneCheck(
    {
      id: 'thrower',
      severity: 'error',
      run() { throw new Error('boom'); },
    },
    { projectDir: '.' },
    notes
  );
  assert.equal(result.ok, false);
  assert.equal(result.id, 'thrower');
  assert.equal(result.severity, 'error');
  assert.match(result.msg, /check threw: boom/);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /thrower: check threw: boom/);
});

test('_runOneCheck: invalid return shape recorded as fail-soft', () => {
  const notes = [];
  const result = lib._runOneCheck(
    { id: 'bad', severity: 'warn', run() { return null; } },
    { projectDir: '.' },
    notes
  );
  assert.equal(result.ok, false);
  assert.equal(result.severity, 'warn');
  assert.match(result.msg, /invalid shape/);
});

// ── Registry validation ─────────────────────────────────────────────────────

test('_isValidCheckModule: accepts canonical shape', () => {
  const ok = lib._isValidCheckModule(
    { id: 'foo', severity: 'error', run: () => ({ ok: true, msg: '' }) },
    'foo.cjs'
  );
  assert.equal(ok, true);
});

test('_isValidCheckModule: rejects bad shapes', () => {
  assert.equal(lib._isValidCheckModule(null, 'x.cjs'), false);
  assert.equal(lib._isValidCheckModule({}, 'x.cjs'), false);
  assert.equal(
    lib._isValidCheckModule({ id: 'x', severity: 'fatal', run: () => {} }, 'x.cjs'),
    false
  );
  assert.equal(
    lib._isValidCheckModule({ id: '', severity: 'error', run: () => {} }, 'x.cjs'),
    false
  );
  assert.equal(
    lib._isValidCheckModule({ id: 'x', severity: 'error' }, 'x.cjs'),
    false
  );
  // id/filename mismatch
  assert.equal(
    lib._isValidCheckModule({ id: 'x', severity: 'error', run: () => {} }, 'y.cjs'),
    false
  );
});

// ── CLI argv parser ─────────────────────────────────────────────────────────

test('_parseArgv: defaults', () => {
  const a = lib._parseArgv([]);
  assert.equal(a.projectDir, '.');
  assert.equal(a.mode, 'json');
  assert.deepEqual(a.skip, []);
});

test('_parseArgv: handles --project, --text, --skip', () => {
  const a = lib._parseArgv(['--project', '/tmp/foo', '--text', '--skip', 'ports-free,manifest-fresh']);
  assert.equal(a.projectDir, '/tmp/foo');
  assert.equal(a.mode, 'text');
  assert.deepEqual(a.skip, ['ports-free', 'manifest-fresh']);
});

test('_parseArgv: --skip empty entries trimmed', () => {
  const a = lib._parseArgv(['--skip', 'a, b , ,c']);
  assert.deepEqual(a.skip, ['a', 'b', 'c']);
});

// ── renderText ──────────────────────────────────────────────────────────────

test('renderText: returns human-readable string with status icons', () => {
  const out = lib.renderText({
    schemaVersion: '1.0.0',
    ok: false,
    checks: [
      { id: 'a', ok: true,  severity: 'info',  msg: 'hi' },
      { id: 'b', ok: false, severity: 'error', msg: 'boom' },
      { id: 'c', ok: false, severity: 'warn',  msg: 'eh' },
    ],
    notes: ['n1', 'n2'],
  });
  assert.match(out, /cli-preflight: FAIL/);
  assert.match(out, /✓.*\[info \] a — hi/);
  assert.match(out, /✗.*\[error\] b — boom/);
  assert.match(out, /!.*\[warn \] c — eh/);
  assert.match(out, /Notes:/);
  assert.match(out, /- n1/);
});

// ── CLI integration (subprocess) ────────────────────────────────────────────

test('CLI: --json emits valid JSON envelope', () => {
  const dir = makeTmpProject();
  try {
    const out = execFileSync('node', [LIB_PATH, '--project', dir, '--json'], {
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.schemaVersion, '1.0.0');
    assert.ok(Array.isArray(parsed.checks));
    assert.equal(parsed.checks.length, 6);
  } finally {
    cleanup(dir);
  }
});

test('CLI: --text emits human summary including all 6 check ids', () => {
  const dir = makeTmpProject();
  try {
    const out = execFileSync('node', [LIB_PATH, '--project', dir, '--text'], {
      encoding: 'utf8',
    });
    assert.match(out, /cli-preflight:/);
    assert.match(out, /branch-guard/);
    assert.match(out, /ports-free/);
    assert.match(out, /deps-installed/);
    assert.match(out, /contracts-stable/);
    assert.match(out, /manifest-fresh/);
    assert.match(out, /working-tree-state/);
  } finally {
    cleanup(dir);
  }
});

test('CLI: --skip honours and emits skipped notes', () => {
  const dir = makeTmpProject();
  try {
    const out = execFileSync('node', [LIB_PATH, '--project', dir, '--json', '--skip', 'ports-free,manifest-fresh'], {
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    const ids = parsed.checks.map((c) => c.id);
    assert.ok(!ids.includes('ports-free'));
    assert.ok(!ids.includes('manifest-fresh'));
    assert.ok(parsed.notes.includes('skipped: ports-free'));
    assert.ok(parsed.notes.includes('skipped: manifest-fresh'));
  } finally {
    cleanup(dir);
  }
});

test('CLI: --help prints usage', () => {
  const out = execFileSync('node', [LIB_PATH, '--help'], { encoding: 'utf8' });
  assert.match(out, /Usage:/);
  assert.match(out, /--project/);
  assert.match(out, /--skip/);
});

test('CLI: exits 0 on ok, 4 on fail', () => {
  const dir = makeTmpProject();
  try {
    // Happy path: empty project has no error-severity failures.
    const result = execFileSync('node', [LIB_PATH, '--project', dir, '--json'], {
      encoding: 'utf8',
    });
    assert.match(result, /"ok": true/);

    // Fail path: occupy a port and require it.
    const net = require('node:net');
    const server = net.createServer();
    server.listen(0);
    const port = server.address().port;
    fs.mkdirSync(path.join(dir, '.gsd-t', '.unattended'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.gsd-t', '.unattended', 'config.json'),
      JSON.stringify({ requiredFreePorts: [port] })
    );
    let exitCode = 0;
    try {
      execFileSync('node', [LIB_PATH, '--project', dir, '--json'], { encoding: 'utf8' });
    } catch (err) {
      exitCode = err.status;
    }
    server.close();
    assert.equal(exitCode, 4);
  } finally {
    cleanup(dir);
  }
});

// ── Determinism ─────────────────────────────────────────────────────────────

test('runPreflight: byte-identical output across two runs on same state', () => {
  const dir = makeTmpProject();
  try {
    const a = JSON.stringify(lib.runPreflight({ projectDir: dir }));
    const b = JSON.stringify(lib.runPreflight({ projectDir: dir }));
    // Strip mtime fields (which encode wall-clock from fs.statSync).
    const stripMtime = (s) => s.replace(/"(?:lock|pkg|manifest)Mtime":\d+(?:\.\d+)?/g, '"MTIME_REMOVED"')
      .replace(/"ageDelta_ms":\d+(?:\.\d+)?/g, '"DELTA_REMOVED"');
    assert.equal(stripMtime(a), stripMtime(b));
  } finally {
    cleanup(dir);
  }
});
