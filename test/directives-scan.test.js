'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ds = require('../bin/gsd-t-directives-scan.cjs');
const gsdt = require('../bin/gsd-t.js');
const { directivesNotice } = require('../scripts/gsd-t-update-check.js');

const RETIRED = ds.retiredCommandNames(gsdt.RETIRED_V6.commandNames, gsdt.getCommandFiles());

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-dir-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

test('retired names = ever shipped minus shipping now', () => {
  assert.ok(RETIRED.includes('gsd-t-verify'));
  assert.ok(RETIRED.includes('gsd-t-backlog-add'));
  assert.ok(!RETIRED.includes('gsd-t-architect'), 'still shipped');
  assert.ok(!RETIRED.includes('gsd-t-tidy-directives'), 'new in v6');
});

test('scan finds retired commands in every directive file kind, ignores kept commands and non-directives', () => {
  const dir = project({
    'CLAUDE.md': 'Run /gsd-t-verify before done.\nUse /gsd-t-architect first.\n',
    'packages/api/CLAUDE.md': 'See .gsd-t/domains/api/scope.md\n',
    'AGENTS.md': 'Plan with gsd-t-plan.\n',
    '.claude/commands/ship.md': 'Call /gsd-t-complete-milestone\n',
    '.claude/skills/x/SKILL.md': 'uses gsd-t-wave\n',
    'node_modules/pkg/CLAUDE.md': '/gsd-t-verify\n',
    'docs/notes.md': '/gsd-t-verify\n',
    'CLAUDE.md updates.md': '- removed /gsd-t-verify\n',
  });
  try {
    const files = ds.summarize(ds.scan(dir, RETIRED));
    assert.deepStrictEqual(Object.keys(files).sort(), [
      '.claude/commands/ship.md', '.claude/skills/x/SKILL.md', 'AGENTS.md', 'CLAUDE.md', 'packages/api/CLAUDE.md',
    ]);
    assert.deepStrictEqual(files['CLAUDE.md'], ['gsd-t-verify']);
    assert.deepStrictEqual(files['packages/api/CLAUDE.md'], ['.gsd-t/domains']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a name that only starts like a retired one is not a hit', () => {
  const dir = project({ 'CLAUDE.md': 'gsd-t-verify-gate.cjs and my-gsd-t-plan-x\n' });
  try { assert.deepStrictEqual(ds.scan(dir, RETIRED), []); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('session notice appears only when update-all left the flag', () => {
  const dir = project({ '.gsd-t/progress.md': '# p\n' });
  try {
    assert.strictEqual(directivesNotice(dir), null);
    fs.writeFileSync(path.join(dir, '.gsd-t', 'directives-pending.json'), JSON.stringify({ files: { 'CLAUDE.md': ['gsd-t-verify'] } }));
    assert.match(directivesNotice(dir), /\[GSD-T TIDY DIRECTIVES\] 1 directive file\(s\) here \(CLAUDE\.md\).*\/gsd-t-tidy-directives NOW/);
    fs.writeFileSync(path.join(dir, '.gsd-t', 'directives-pending.json'), '{broken');
    assert.match(directivesNotice(dir), /flag file is unreadable.*\/gsd-t-tidy-directives/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('update-all flags a project with retired references and clears the flag once clean', () => {
  const dir = project({ '.gsd-t/progress.md': '# p\n', 'CLAUDE.md': 'Run /gsd-t-verify.\n' });
  const flag = path.join(dir, '.gsd-t', 'directives-pending.json');
  try {
    assert.strictEqual(gsdt.flagDirectives(dir, 'p'), true);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(flag, 'utf8')).files, { 'CLAUDE.md': ['gsd-t-verify'] });
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Run the tests.\n');
    assert.strictEqual(gsdt.flagDirectives(dir, 'p'), false);
    assert.strictEqual(fs.existsSync(flag), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
