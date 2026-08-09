'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const check = require('../../bin/cli-preflight-checks/branch-guard.cjs');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d1-bg-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir });
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

test('branch-guard: declared metadata', () => {
  assert.equal(check.id, 'branch-guard');
  assert.equal(check.severity, 'error');
  assert.equal(typeof check.run, 'function');
});

test('_extractExpectedBranch: matches plain "Expected branch: main"', () => {
  const out = check._extractExpectedBranch('Expected branch: main\n');
  assert.equal(out, 'main');
});

test('_extractExpectedBranch: matches markdown-emphasis "**Expected branch**: `develop`"', () => {
  const out = check._extractExpectedBranch('**Expected branch**: `develop`\n');
  assert.equal(out, 'develop');
});

test('_extractExpectedBranch: returns empty string when absent', () => {
  assert.equal(check._extractExpectedBranch('# Some heading\n\nUnrelated text\n'), '');
  assert.equal(check._extractExpectedBranch(''), '');
  assert.equal(check._extractExpectedBranch(null), '');
});

// The template writes the rule as a table row, not a sentence. Reading only the
// sentence form is what left this check dead in every scaffolded project.
test('_extractExpectedBranch: matches the table row the project template writes', () => {
  assert.equal(check._extractExpectedBranch('| Expected branch | `main` |\n'), 'main');
  assert.equal(check._extractExpectedBranch('| Expected branch | develop |\n'), 'develop');
  assert.equal(check._extractExpectedBranch('|  **Expected branch**  |  `release-5.10`  |\n'), 'release-5.10');
});

test('_extractExpectedBranch: a table row among other rows still lands', () => {
  const md = [
    '| | |', '|---|---|',
    '| Build | `npm run build` |',
    '| Test | `npm test` |',
    '| Expected branch | `main` |',
    '', '## Next section',
  ].join('\n');
  assert.equal(check._extractExpectedBranch(md), 'main');
});

test('_extractExpectedBranch: the old "Branch" label is NOT mistaken for the rule', () => {
  // The pre-fix template wrote this. It declares no expected branch, and must
  // read as "no rule", never as a rule naming `main`.
  assert.equal(check._extractExpectedBranch('| Branch | `main` |\n'), '');
});

// ── Happy path ──────────────────────────────────────────────────────────────

test('branch-guard happy: on expected branch', () => {
  const dir = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n\nExpected branch: main\n');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /on expected branch main/);
  } finally { rm(dir); }
});

test('branch-guard happy: table-row rule on the expected branch', () => {
  const dir = tmpRepo();
  try {
    fs.writeFileSync(
      path.join(dir, 'CLAUDE.md'),
      '# Project\n\n| | |\n|---|---|\n| Expected branch | `main` |\n'
    );
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /on expected branch main/);
  } finally { rm(dir); }
});

// A pass that compared nothing must say so — the old wording read as approval,
// which is how the dead check stayed invisible.
test('branch-guard: no CLAUDE.md → passes, named as unchecked', () => {
  const dir = tmpRepo();
  try {
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /NOT CHECKED/);
    assert.match(r.msg, /no CLAUDE\.md/);
  } finally { rm(dir); }
});

test('branch-guard: CLAUDE.md without rule → passes, named as unchecked', () => {
  const dir = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n\nNo rule here.\n');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /NOT CHECKED/);
    assert.match(r.msg, /declares no expected branch/);
  } finally { rm(dir); }
});

// A project scaffolded from the pre-fix template. It declares no rule, so the
// check must report that plainly rather than inventing one.
test('branch-guard: the old "Branch" row reads as no rule, not as a rule', () => {
  const dir = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n\n| Branch | `main` |\n');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /NOT CHECKED/);
  } finally { rm(dir); }
});

// An unreadable rules file is a real failure. Passing it off as "no rule" is a
// second route to a false pass in the same check.
test('branch-guard fail: CLAUDE.md exists but cannot be read → halts', () => {
  const dir = tmpRepo();
  const file = path.join(dir, 'CLAUDE.md');
  try {
    fs.writeFileSync(file, 'Expected branch: main\n');
    fs.chmodSync(file, 0o000);
    // Running as root defeats permission bits; skip rather than assert falsely.
    let readable = true;
    try { fs.readFileSync(file, 'utf8'); } catch (_) { readable = false; }
    if (readable) return;

    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /could not be read/);
  } finally {
    try { fs.chmodSync(file, 0o644); } catch (_) {}
    rm(dir);
  }
});

// ── Fail path ───────────────────────────────────────────────────────────────

test('branch-guard fail: on wrong branch', () => {
  const dir = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Expected branch: develop\n');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /expected develop/);
    assert.equal(r.details.expected, 'develop');
    assert.equal(r.details.actual, 'main');
    assert.equal(r.details.worktree, false);
  } finally { rm(dir); }
});

test('branch-guard fail: detached HEAD in the main checkout', () => {
  const dir = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Expected branch: main\n');
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd: dir, stdio: 'ignore' });
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /detached HEAD/);
  } finally { rm(dir); }
});

// ── Worktrees ───────────────────────────────────────────────────────────────
// The house rules require new work to happen in a side copy on its own branch.
// Holding a worktree to the main checkout's branch blocks the correct workflow.

test('branch-guard: worktree on a feature branch passes, and says why', () => {
  const dir = tmpRepo();
  const wt = path.join(dir, 'wt');
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Expected branch: main\n');
    execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'feature-x'], { cwd: dir, stdio: 'ignore' });
    fs.writeFileSync(path.join(wt, 'CLAUDE.md'), 'Expected branch: main\n');

    const r = check.run({ projectDir: wt });
    assert.equal(r.ok, true, 'a worktree on its own branch must not be blocked');
    assert.match(r.msg, /worktree on feature-x/);
    assert.match(r.msg, /main checkout only/);
    assert.equal(r.details.worktree, true);
    assert.equal(r.details.actual, 'feature-x');
  } finally { rm(dir); }
});

test('branch-guard fail: worktree on no branch at all — commits would be lost', () => {
  const dir = tmpRepo();
  const wt = path.join(dir, 'wt');
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Expected branch: main\n');
    execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'feature-y'], { cwd: dir, stdio: 'ignore' });
    fs.writeFileSync(path.join(wt, 'CLAUDE.md'), 'Expected branch: main\n');
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd: wt, stdio: 'ignore' });

    const r = check.run({ projectDir: wt });
    assert.equal(r.ok, false, 'detached HEAD in a worktree must still fail');
    assert.match(r.msg, /not on a branch/);
    assert.match(r.msg, /would be lost/);
    assert.equal(r.details.worktree, true);
  } finally { rm(dir); }
});

test('branch-guard: the main checkout is still held to the rule', () => {
  // Proves the worktree pass did not weaken the main-tree case it exists to keep.
  const dir = tmpRepo();
  const wt = path.join(dir, 'wt');
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Expected branch: main\n');
    execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'feature-z'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-q', '-b', 'wandered'], { cwd: dir, stdio: 'ignore' });

    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /on wandered, expected main/);
    assert.equal(r.details.worktree, false);
  } finally { rm(dir); }
});
