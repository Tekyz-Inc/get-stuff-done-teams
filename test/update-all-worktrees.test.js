'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const gsdt = require('../bin/gsd-t.js');
const detect = require('../bin/gsd-t-worktree-detect.cjs');

const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe', encoding: 'utf8' });

function repoWithWorktrees() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-wt-')));
  const repo = path.join(base, 'proj');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const free = path.join(base, 'wt', 'free');
  const busy = path.join(base, 'wt', 'busy');
  git(repo, 'worktree', 'add', '-q', '-b', 'free', free);
  git(repo, 'worktree', 'add', '-q', '-b', 'busy', busy);
  const harness = path.join(repo, '.claude', 'worktrees', 'agent-x');
  git(repo, 'worktree', 'add', '-q', '-b', 'agent-x', harness);
  const retired = gsdt.RETIRED_V6.bin['gsd-t-verify-gate.cjs'][0];
  for (const w of [free, busy]) {
    fs.mkdirSync(path.join(w, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(w, 'bin', 'gsd-t-verify-gate.cjs'), `/**\n * ${retired}\n */\n`);
  }
  return { base, repo, free, busy, harness };
}

test('linkedWorktrees lists side copies, not the main checkout or harness worktrees', () => {
  const { base, repo, free, busy } = repoWithWorktrees();
  try {
    const paths = detect.linkedWorktrees(repo).map((w) => w.path).sort();
    assert.deepStrictEqual(paths, [busy, free].sort());
    assert.strictEqual(detect.linkedWorktrees(repo).find((w) => w.path === free).branch, 'free');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('isOccupied: a session in the folder or below it counts; a sibling does not', () => {
  assert.ok(detect.isOccupied('/a/wt', new Set(['/a/wt'])));
  assert.ok(detect.isOccupied('/a/wt', new Set(['/a/wt/src'])));
  assert.ok(!detect.isOccupied('/a/wt', new Set(['/a/wt2'])));
});

test('update-all worktree pass: refreshes a free worktree, skips one with a session open', () => {
  const { base, repo, free, busy } = repoWithWorktrees();
  try {
    const counts = { updated: 0, skipped: 0, missing: 0, errors: 0 };
    const failed = [];
    gsdt.updateProjectWorktrees([repo], counts, failed, new Set([busy]));
    assert.deepStrictEqual(failed, []);
    assert.deepStrictEqual(counts.worktrees, { updated: 1, busy: 1 });
    assert.strictEqual(fs.existsSync(path.join(free, 'bin', 'gsd-t-verify-gate.cjs')), false, 'retired tool moved');
    assert.ok(fs.existsSync(path.join(free, 'bin', 'gsd-t-graph-query-cli.cjs')), 'current tools copied');
    assert.ok(fs.existsSync(path.join(busy, 'bin', 'gsd-t-verify-gate.cjs')), 'busy worktree untouched');
    assert.strictEqual(fs.existsSync(path.join(busy, 'bin', 'gsd-t-graph-query-cli.cjs')), false);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
