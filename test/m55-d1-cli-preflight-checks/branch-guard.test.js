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

test('_extractExpectedBranch: returns null when absent', () => {
  assert.equal(check._extractExpectedBranch('# Some heading\n\nUnrelated text\n'), null);
  assert.equal(check._extractExpectedBranch(''), null);
  assert.equal(check._extractExpectedBranch(null), null);
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

test('branch-guard happy: no CLAUDE.md → ok:true skipping', () => {
  const dir = tmpRepo();
  try {
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /no CLAUDE.md/);
  } finally { rm(dir); }
});

test('branch-guard happy: CLAUDE.md without rule → ok:true', () => {
  const dir = tmpRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Project\n\nNo rule here.\n');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /no expected-branch rule set/);
  } finally { rm(dir); }
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
  } finally { rm(dir); }
});
