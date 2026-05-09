'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const lib = require('../../bin/gsd-t-context-brief.cjs');
const kind = require('../../bin/gsd-t-context-brief-kinds/red-team.cjs');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d4-rt-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'first', '-q'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'second', '-q'], { cwd: dir, stdio: 'ignore' });
  } catch (_) {}
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
function w(root, rel, content) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

test('red-team kind: declared metadata + requiresSources', () => {
  assert.equal(kind.name, 'red-team');
  assert.deepEqual(kind.requiresSources, ['templates/prompts/red-team-subagent.md']);
});

test('_recentCommits: returns up to 10 commit oneline strings', () => {
  const dir = tmpRepo();
  try {
    const commits = kind._recentCommits(dir);
    assert.ok(commits.length >= 2);
    assert.match(commits[0], /(first|second)/);
  } finally { rm(dir); }
});

test('_recentCommits: empty array on non-git dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d4-rt-nogit-'));
  try {
    const commits = kind._recentCommits(dir);
    assert.deepEqual(commits, []);
  } finally { rm(dir); }
});

test('_attackVectorSeeds: extracts indented bullets under broken-patches heading', () => {
  const proto = [
    '# Red Team',
    '',
    '## Attack Categories',
    '',
    '1. Contract Violations',
    '',
    '## Test Pass-Through',
    '',
    'Examples of broken patches:',
    '   - Remove the listener entirely',
    '   - Comment out the side-effect',
    '   - Swap a sessionStorage key name',
    '',
  ].join('\n');
  const seeds = kind._attackVectorSeeds(proto);
  assert.ok(seeds.length >= 3);
  assert.match(seeds[0], /listener/);
});

test('_attackVectorSeeds: empty list when no broken-patch section', () => {
  const seeds = kind._attackVectorSeeds('# Just a heading\n\nno bullets here.\n');
  assert.deepEqual(seeds, []);
});

test('red-team happy: with protocol present, brief assembles', () => {
  const dir = tmpRepo();
  try {
    w(dir, 'templates/prompts/red-team-subagent.md', [
      '# Red Team',
      '## Test Pass-Through',
      '   - Remove the listener',
      '   - Stub the handler',
      '',
    ].join('\n'));
    const b = lib.generateBrief({
      projectDir: dir, kind: 'red-team', domain: 'd-foo', spawnId: 'rt-h-1',
    });
    assert.equal(b.ancillary.protocolPath, 'templates/prompts/red-team-subagent.md');
    assert.ok(Array.isArray(b.ancillary.attackVectorSeeds));
    assert.ok(b.ancillary.attackVectorSeeds.length >= 1);
    assert.ok(b.ancillary.recentCommits.length >= 2);
  } finally { rm(dir); }
});

test('red-team fail-closed: missing protocol → throw EREQUIRED_MISSING', () => {
  const dir = tmpRepo();
  try {
    let err;
    try {
      lib.generateBrief({ projectDir: dir, kind: 'red-team', domain: 'd-foo', spawnId: 'rt-fc' });
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, 'EREQUIRED_MISSING');
    assert.ok(err.missing.includes('templates/prompts/red-team-subagent.md'));
  } finally { rm(dir); }
});
