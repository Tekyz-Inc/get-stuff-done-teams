'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const { assertCompletion } = require('../bin/gsd-t-completion-check.cjs');

function sh(cmd, cwd) {
  execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-done-'));
  sh('git init -q -b main', dir);
  sh('git config user.email test@example.com', dir);
  sh('git config user.name Test', dir);
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), '# Progress\n\n## Decision Log\n\n');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't', version: '0.0.0', scripts: { test: 'exit 0' } }));
  fs.writeFileSync(path.join(dir, 'README.md'), 'seed\n');
  sh('git add -A', dir);
  sh('git commit -q -m "init"', dir);
  return dir;
}

function addCommit(dir, taskId, filePath) {
  const full = path.join(dir, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `// ${taskId}\n`);
  sh(`git add -A`, dir);
  sh(`git commit -q -m "${taskId}: work"`, dir);
}

function addProgressEntry(dir, taskId) {
  const p = path.join(dir, '.gsd-t', 'progress.md');
  fs.appendFileSync(p, `- 2026-04-19 18:30: [execute] ${taskId} complete — details.\n`);
}

test('happy path: all 5 conditions satisfied → ok:true, missing:[]', () => {
  const dir = mkRepo();
  const start = new Date(Date.now() - 1000).toISOString();
  addCommit(dir, 'd3-t1', 'bin/fake.cjs');
  addProgressEntry(dir, 'd3-t1');
  const res = assertCompletion({
    taskId: 'd3-t1',
    projectDir: dir,
    expectedBranch: 'main',
    taskStart: start,
    skipTest: false,
    ownedPatterns: ['bin/fake.cjs']
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.missing, []);
  assert.equal(res.details.commits.length, 1);
  assert.match(res.details.progressEntry, /d3-t1/);
});

test('missing commit → missing includes no_commit_on_branch', () => {
  const dir = mkRepo();
  const start = new Date(Date.now() - 1000).toISOString();
  addProgressEntry(dir, 'd3-t1');
  const res = assertCompletion({
    taskId: 'd3-t1',
    projectDir: dir,
    expectedBranch: 'main',
    taskStart: start,
    skipTest: true,
    ownedPatterns: []
  });
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('no_commit_on_branch'));
});

test('missing progress entry → missing includes no_progress_entry', () => {
  const dir = mkRepo();
  const start = new Date(Date.now() - 1000).toISOString();
  addCommit(dir, 'd3-t1', 'bin/fake.cjs');
  const res = assertCompletion({
    taskId: 'd3-t1',
    projectDir: dir,
    expectedBranch: 'main',
    taskStart: start,
    skipTest: true,
    ownedPatterns: ['bin/fake.cjs']
  });
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('no_progress_entry'));
});

test('test failure → missing includes tests_failed', () => {
  const dir = mkRepo();
  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.scripts.test = 'exit 1';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));
  sh('git add -A && git commit -q -m "d3-t1: break tests"', dir);
  const start = new Date(Date.now() - 1000).toISOString();
  addCommit(dir, 'd3-t1', 'bin/fake.cjs');
  addProgressEntry(dir, 'd3-t1');
  const res = assertCompletion({
    taskId: 'd3-t1',
    projectDir: dir,
    expectedBranch: 'main',
    taskStart: start,
    skipTest: false,
    ownedPatterns: ['bin/fake.cjs']
  });
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('tests_failed'));
});

test('uncommitted owned changes → missing includes uncommitted_owned_changes', () => {
  const dir = mkRepo();
  const start = new Date(Date.now() - 1000).toISOString();
  addCommit(dir, 'd3-t1', 'bin/fake.cjs');
  addProgressEntry(dir, 'd3-t1');
  fs.writeFileSync(path.join(dir, 'bin', 'fake.cjs'), '// dirty\n');
  const res = assertCompletion({
    taskId: 'd3-t1',
    projectDir: dir,
    expectedBranch: 'main',
    taskStart: start,
    skipTest: true,
    ownedPatterns: ['bin/fake.cjs']
  });
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('uncommitted_owned_changes'));
  assert.ok(res.details.uncommitted.includes('bin/fake.cjs'));
});

test('branch-mismatch: commit on feature branch → no_commit_on_branch when expected=main', () => {
  const dir = mkRepo();
  sh('git checkout -q -b feature/x', dir);
  const start = new Date(Date.now() - 1000).toISOString();
  addCommit(dir, 'd3-t1', 'bin/fake.cjs');
  addProgressEntry(dir, 'd3-t1');
  const res = assertCompletion({
    taskId: 'd3-t1',
    projectDir: dir,
    expectedBranch: 'main',
    taskStart: start,
    skipTest: true,
    ownedPatterns: ['bin/fake.cjs']
  });
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('no_commit_on_branch'));
});

test('skip-test: test step skipped, other 4 checks still run', () => {
  const dir = mkRepo();
  const start = new Date(Date.now() - 1000).toISOString();
  addCommit(dir, 'd3-t1', 'docs/x.md');
  addProgressEntry(dir, 'd3-t1');
  const res = assertCompletion({
    taskId: 'd3-t1',
    projectDir: dir,
    expectedBranch: 'main',
    taskStart: start,
    skipTest: true,
    ownedPatterns: ['docs/**']
  });
  assert.equal(res.ok, true);
  assert.equal(res.details.testSkipped, true);
  assert.equal(res.details.testExitCode, undefined);
});

test('returns all failing conditions, not just the first', () => {
  const dir = mkRepo();
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bin', 'fake.cjs'), '// seed\n');
  sh('git add -A', dir);
  sh('git commit -q -m "seed fake.cjs (no task id)"', dir);
  const start = new Date(Date.now() - 1000).toISOString();
  fs.writeFileSync(path.join(dir, 'bin', 'fake.cjs'), '// dirty no-task-commit\n');
  const res = assertCompletion({
    taskId: 'd3-t1',
    projectDir: dir,
    expectedBranch: 'main',
    taskStart: start,
    skipTest: true,
    ownedPatterns: ['bin/fake.cjs']
  });
  assert.equal(res.ok, false);
  assert.ok(res.missing.includes('no_commit_on_branch'));
  assert.ok(res.missing.includes('no_progress_entry'));
  assert.ok(res.missing.includes('uncommitted_owned_changes'));
});
