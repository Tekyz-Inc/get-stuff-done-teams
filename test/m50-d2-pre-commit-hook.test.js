'use strict';

// M50 D2 — pre-commit-playwright-gate hook tests. The hook is a bash script
// that reads .gsd-t/.last-playwright-pass and gates commits touching viewer
// source. We exercise the hook end-to-end against synthetic git fixtures.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'scripts', 'hooks', 'pre-commit-playwright-gate');

function makeRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-hook-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Init a real git repo so `git rev-parse --show-toplevel` works inside the hook.
  spawnSync('git', ['init', '-q', '--initial-branch=main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'M50 Test'], { cwd: dir });
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'e2e', 'viewer'), { recursive: true });
  // Seed an initial commit so `git diff --cached` works.
  fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n');
  spawnSync('git', ['add', 'README.md'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function runHook(repoDir) {
  const res = spawnSync('bash', [HOOK], { cwd: repoDir, encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

function setLastPass(repoDir, ms) {
  fs.writeFileSync(path.join(repoDir, '.gsd-t', '.last-playwright-pass'), String(ms));
}

function stage(repoDir, relPath, content) {
  const fp = path.join(repoDir, relPath);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, content);
  spawnSync('git', ['add', relPath], { cwd: repoDir });
}

describe('M50 D2 pre-commit-playwright-gate', () => {
  test('clean commit on non-viewer files → exit 0', (t) => {
    const dir = makeRepo(t);
    setLastPass(dir, Date.now() - 60_000);
    stage(dir, 'src/index.js', '// nothing viewer-related\n');
    const r = runHook(dir);
    assert.equal(r.code, 0, `expected exit 0; stderr=${r.stderr}`);
  });

  test('blocked commit on stale viewer-source → exit 1 + stderr message', (t) => {
    const dir = makeRepo(t);
    // Stage a viewer-source file with mtime AFTER the recorded last-pass.
    const lastPass = Date.now() - 5 * 60_000; // 5 min ago
    setLastPass(dir, lastPass);
    stage(dir, 'scripts/gsd-t-transcript.html', '<!doctype html>\n');
    // Force the file's mtime to "now" so it's stale relative to lastPass.
    const now = new Date(Date.now());
    fs.utimesSync(path.join(dir, 'scripts/gsd-t-transcript.html'), now, now);
    const r = runHook(dir);
    assert.equal(r.code, 1, `expected exit 1; stderr=${r.stderr}`);
    assert.match(r.stderr, /BLOCKED/);
    assert.match(r.stderr, /scripts\/gsd-t-transcript\.html/);
  });

  test('allowed commit on fresh viewer-source (mtime ≤ last-pass) → exit 0', (t) => {
    const dir = makeRepo(t);
    stage(dir, 'scripts/gsd-t-transcript.html', '<!doctype html>\n');
    // Force the mtime to a known past value first, then record a more recent pass.
    const past = new Date(Date.now() - 60 * 60_000); // 1h ago
    fs.utimesSync(path.join(dir, 'scripts/gsd-t-transcript.html'), past, past);
    setLastPass(dir, Date.now()); // pass timestamp is newer than file mtime
    const r = runHook(dir);
    assert.equal(r.code, 0, `expected exit 0 when pass is newer than mtime; stderr=${r.stderr}`);
  });

  test('missing .last-playwright-pass with viewer file staged → fail-open exit 0 + warning', (t) => {
    const dir = makeRepo(t);
    stage(dir, 'scripts/gsd-t-transcript.html', '<!doctype html>\n');
    // Do NOT write .last-playwright-pass
    const r = runHook(dir);
    assert.equal(r.code, 0, `fail-open expected; stderr=${r.stderr}`);
    assert.match(r.stderr, /WARNING/);
  });

  test('corrupt .last-playwright-pass with viewer file staged → fail-open exit 0 + warning', (t) => {
    const dir = makeRepo(t);
    stage(dir, 'scripts/gsd-t-transcript.html', '<!doctype html>\n');
    fs.writeFileSync(path.join(dir, '.gsd-t', '.last-playwright-pass'), 'not-a-number');
    const r = runHook(dir);
    assert.equal(r.code, 0);
    assert.match(r.stderr, /WARNING/);
  });

  test('viewer-source patterns: e2e/viewer/* triggers gating', (t) => {
    const dir = makeRepo(t);
    setLastPass(dir, Date.now() - 5 * 60_000);
    stage(dir, 'e2e/viewer/title.spec.ts', '// new spec\n');
    const now = new Date();
    fs.utimesSync(path.join(dir, 'e2e/viewer/title.spec.ts'), now, now);
    const r = runHook(dir);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /e2e\/viewer\/title\.spec\.ts/);
  });
});
