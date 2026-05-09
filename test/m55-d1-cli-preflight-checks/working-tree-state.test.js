'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const check = require('../../bin/cli-preflight-checks/working-tree-state.cjs');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d1-wt-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  // Empty initial commit so the tree exists.
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir });
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function writeWhitelist(dir, list) {
  fs.mkdirSync(path.join(dir, '.gsd-t', '.unattended'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.gsd-t', '.unattended', 'config.json'),
    JSON.stringify({ dirtyTreeWhitelist: list })
  );
}

test('working-tree-state: declared metadata', () => {
  assert.equal(check.id, 'working-tree-state');
  assert.equal(check.severity, 'warn');
});

test('_globToRegex: ** matches any segment-spanning sequence', () => {
  const re = check._globToRegex('foo/**');
  assert.ok(re.test('foo/bar/baz.txt'));
  assert.ok(re.test('foo/'));
  assert.ok(!re.test('other/bar.txt'));
});

test('_globToRegex: * does not cross /', () => {
  const re = check._globToRegex('foo/*');
  assert.ok(re.test('foo/bar.txt'));
  assert.ok(!re.test('foo/bar/baz.txt'));
});

test('_globToRegex: literal special chars escaped', () => {
  const re = check._globToRegex('a.b.txt');
  assert.ok(re.test('a.b.txt'));
  assert.ok(!re.test('aXbXtxt'));
});

test('_parseDirtyPaths: standard porcelain output', () => {
  const out = check._parseDirtyPaths(' M foo.txt\n?? bar/baz.txt\nR  old.txt -> new.txt\n');
  assert.deepEqual(out, ['foo.txt', 'bar/baz.txt', 'new.txt']);
});

test('_parseDirtyPaths: handles quoted paths', () => {
  const out = check._parseDirtyPaths(' M "spaced file.txt"\n');
  assert.deepEqual(out, ['spaced file.txt']);
});

// ── Happy paths ─────────────────────────────────────────────────────────────

test('working-tree-state happy: clean repo', () => {
  const dir = tmpRepo();
  try {
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /working tree clean/);
  } finally { rm(dir); }
});

test('working-tree-state happy: dirty path matches whitelist', () => {
  const dir = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'allowed.log'), 'noise');
    writeWhitelist(dir, ['*.log']);
    // .gsd-t/.unattended/config.json is itself dirty — also whitelist it.
    writeWhitelist(dir, ['*.log', '.gsd-t/**']);
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /all whitelisted/);
  } finally { rm(dir); }
});

// ── Fail path ───────────────────────────────────────────────────────────────

test('working-tree-state fail: dirty path outside whitelist', () => {
  const dir = tmpRepo();
  try {
    // Write whitelist first so the only dirty path is the unwhitelisted one.
    writeWhitelist(dir, ['.gsd-t/**']);
    fs.writeFileSync(path.join(dir, 'unexpected.txt'), 'oops');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /outside whitelist/);
    assert.ok(r.details.unmatched.includes('unexpected.txt'));
  } finally { rm(dir); }
});
