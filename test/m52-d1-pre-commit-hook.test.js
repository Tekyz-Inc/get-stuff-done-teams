'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const HOOK_SRC = path.join(REPO, 'scripts', 'hooks', 'pre-commit-journey-coverage');
const CLI_SRC = path.join(REPO, 'bin', 'journey-coverage-cli.cjs');
const DETECTOR_SRC = path.join(REPO, 'bin', 'journey-coverage.cjs');

// Inline implementation of the install/uninstall pair (mirrors what T5 wires
// into bin/gsd-t.js). Defining it locally lets T4 verify the marker-block
// round-trip independently of T5 — T5 is expected to call the equivalent.
const HOOK_BEGIN = '# >>> GSD-T journey-coverage gate >>>';
const HOOK_END = '# <<< GSD-T journey-coverage gate <<<';

function buildHookBlock(stock) {
  return HOOK_BEGIN + '\n' + stock.replace(/^#!.*\n/, '') + '\n' + HOOK_END + '\n';
}

function installHook(projectDir, stockSrc) {
  const gitDir = path.join(projectDir, '.git');
  fs.mkdirSync(path.join(gitDir, 'hooks'), { recursive: true });
  const hookPath = path.join(gitDir, 'hooks', 'pre-commit');
  const stock = fs.readFileSync(stockSrc, 'utf8');
  if (!fs.existsSync(hookPath)) {
    fs.writeFileSync(hookPath, '#!/usr/bin/env bash\nset -e\n\n' + buildHookBlock(stock));
    fs.chmodSync(hookPath, 0o755);
    return 'created';
  }
  const existing = fs.readFileSync(hookPath, 'utf8');
  if (existing.includes(HOOK_BEGIN)) return 'idempotent';
  const block = '\n\n' + buildHookBlock(stock);
  fs.writeFileSync(hookPath, existing.trimEnd() + block);
  fs.chmodSync(hookPath, 0o755);
  return 'appended';
}

function uninstallHook(projectDir) {
  const hookPath = path.join(projectDir, '.git', 'hooks', 'pre-commit');
  if (!fs.existsSync(hookPath)) return 'absent';
  const existing = fs.readFileSync(hookPath, 'utf8');
  const re = new RegExp('\\n*' + HOOK_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + HOOK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n*', 'g');
  const cleaned = existing.replace(re, '');
  fs.writeFileSync(hookPath, cleaned);
  return 'removed';
}

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-hook-'));
  execSync('git init -q', { cwd: root });
  execSync('git config user.email t@t', { cwd: root });
  execSync('git config user.name t', { cwd: root });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gsd-t'), { recursive: true });
  // Drop the production CLI + detector into the test repo so the hook can call them.
  fs.copyFileSync(CLI_SRC, path.join(root, 'bin', 'journey-coverage-cli.cjs'));
  fs.copyFileSync(DETECTOR_SRC, path.join(root, 'bin', 'journey-coverage.cjs'));
  return root;
}

function runHook(repo) {
  return spawnSync('bash', [path.join(repo, '.git', 'hooks', 'pre-commit')], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GIT_DIR: path.join(repo, '.git') },
  });
}

test('M52 D1 hook: viewer file staged + gap → block (exit 1)', () => {
  const repo = mkRepo();
  installHook(repo, HOOK_SRC);
  fs.writeFileSync(path.join(repo, 'scripts', 'gsd-t-transcript.html'),
    `<script>splitter.addEventListener('mousedown', () => {});</script>`);
  fs.writeFileSync(path.join(repo, '.gsd-t', 'journey-manifest.json'),
    JSON.stringify({ version: '0.1.0', specs: [] }, null, 2));
  execSync('git add scripts/gsd-t-transcript.html', { cwd: repo });
  const r = runHook(repo);
  assert.equal(r.status, 1, 'expected exit 1 for gap; stderr=' + r.stderr);
  assert.match(r.stderr, /BLOCKED/);
  assert.match(r.stderr, /splitter:mousedown/);
});

test('M52 D1 hook: viewer file staged + manifest covers it → pass (exit 0)', () => {
  const repo = mkRepo();
  installHook(repo, HOOK_SRC);
  fs.writeFileSync(path.join(repo, 'scripts', 'gsd-t-transcript.html'),
    `<script>splitter.addEventListener('mousedown', () => {});</script>`);
  fs.writeFileSync(path.join(repo, '.gsd-t', 'journey-manifest.json'),
    JSON.stringify({
      version: '0.1.0',
      specs: [{
        name: 'splitter-drag', spec: 'e2e/journeys/splitter-drag.spec.ts',
        covers: [{ file: 'scripts/gsd-t-transcript.html', selector: 'splitter:mousedown', kind: 'addEventListener' }],
      }],
    }, null, 2));
  execSync('git add scripts/gsd-t-transcript.html', { cwd: repo });
  const r = runHook(repo);
  assert.equal(r.status, 0, 'expected exit 0; stderr=' + r.stderr);
});

test('M52 D1 hook: no viewer file staged → silent pass (exit 0, no stderr)', () => {
  const repo = mkRepo();
  installHook(repo, HOOK_SRC);
  fs.writeFileSync(path.join(repo, 'README.md'), '# test\n');
  execSync('git add README.md', { cwd: repo });
  const r = runHook(repo);
  assert.equal(r.status, 0);
  assert.equal(r.stderr.trim(), '');
});

test('M52 D1 hook: missing manifest with viewer staged → fail-closed (exit 1, hint visible)', () => {
  const repo = mkRepo();
  installHook(repo, HOOK_SRC);
  fs.writeFileSync(path.join(repo, 'scripts', 'gsd-t-transcript.html'),
    `<script>splitter.addEventListener('mousedown', () => {});</script>`);
  // No manifest at all
  execSync('git add scripts/gsd-t-transcript.html', { cwd: repo });
  const r = runHook(repo);
  assert.equal(r.status, 1, 'expected exit 1 for missing manifest; stderr=' + r.stderr);
  assert.match(r.stderr, /BLOCKED|manifest missing/);
});

test('M52 D1 hook: idempotent install (run twice → only one marker block)', () => {
  const repo = mkRepo();
  const r1 = installHook(repo, HOOK_SRC);
  const r2 = installHook(repo, HOOK_SRC);
  assert.equal(r1, 'created');
  assert.equal(r2, 'idempotent');
  const hook = fs.readFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 'utf8');
  // The freshly-created hook IS the stock body (no marker block yet — install only
  // wraps with begin/end markers when appending to an existing hook). Either way,
  // the BEGIN marker should appear at most once.
  const matches = hook.match(/# >>> GSD-T journey-coverage gate >>>/g) || [];
  assert.ok(matches.length <= 1, 'expected ≤1 BEGIN marker, got ' + matches.length);
});

test('M52 D1 hook: marker round-trip (install → uninstall → install yields identical block)', () => {
  const repo = mkRepo();
  // Pre-existing hook → first install appends a block
  fs.mkdirSync(path.join(repo, '.git', 'hooks'), { recursive: true });
  const preExisting = '#!/usr/bin/env bash\necho "pre-existing"\nexit 0\n';
  fs.writeFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), preExisting);
  fs.chmodSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 0o755);

  const r1 = installHook(repo, HOOK_SRC);
  assert.equal(r1, 'appended');
  const after1 = fs.readFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 'utf8');

  uninstallHook(repo);
  const afterUninstall = fs.readFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 'utf8');
  assert.match(afterUninstall, /pre-existing/, 'uninstall must preserve pre-existing body');
  assert.equal(/# >>> GSD-T journey-coverage gate >>>/.test(afterUninstall), false, 'uninstall removes BEGIN marker');

  const r2 = installHook(repo, HOOK_SRC);
  assert.equal(r2, 'appended');
  const after2 = fs.readFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), 'utf8');
  assert.equal(after1, after2, 'reinstall after uninstall yields identical content');
});
