'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const lib = require('../../bin/gsd-t-context-brief.cjs');
const kind = require('../../bin/gsd-t-context-brief-kinds/qa.cjs');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d4-qa-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: dir, stdio: 'ignore' });
  } catch (_) {}
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
function w(root, rel, content) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

test('qa kind: declared metadata + requiresSources', () => {
  assert.equal(kind.name, 'qa');
  assert.deepEqual(kind.requiresSources, ['templates/prompts/qa-subagent.md']);
});

test('_detectTestRunner: picks up package.json scripts.test', () => {
  const dir = tmpRepo();
  try {
    w(dir, 'package.json', JSON.stringify({
      name: 'x',
      scripts: { test: 'node --test' },
    }));
    const r = kind._detectTestRunner(dir);
    assert.equal(r.npmTest, 'node --test');
  } finally { rm(dir); }
});

test('_detectTestRunner: picks up playwright/cypress configs', () => {
  const dir = tmpRepo();
  try {
    w(dir, 'playwright.config.ts', '');
    w(dir, 'cypress.config.js', '');
    const r = kind._detectTestRunner(dir);
    assert.equal(r.playwrightConfig, 'playwright.config.ts');
    assert.equal(r.cypressConfig, 'cypress.config.js');
  } finally { rm(dir); }
});

test('_tailQaIssues: returns last N data rows from a markdown table', () => {
  const text = [
    '| Date | Severity | Finding |',
    '|------|----------|---------|',
    '| d1 | LOW | one |',
    '| d2 | LOW | two |',
    '| d3 | LOW | three |',
  ].join('\n');
  const out = kind._tailQaIssues(text);
  assert.equal(out.length, 3);
  assert.match(out[0], /one/);
});

test('qa happy: with protocol present, brief assembles', () => {
  const dir = tmpRepo();
  try {
    w(dir, 'templates/prompts/qa-subagent.md', '# QA\n');
    w(dir, 'package.json', JSON.stringify({
      name: 'x', scripts: { test: 'node --test' },
    }));
    w(dir, '.gsd-t/qa-issues.md', [
      '| Date | Cmd |',
      '|------|-----|',
      '| 2026-01-01 | execute |',
    ].join('\n'));
    const b = lib.generateBrief({
      projectDir: dir, kind: 'qa', domain: 'd-foo', spawnId: 'qa-h-1',
    });
    assert.equal(b.ancillary.protocolPath, 'templates/prompts/qa-subagent.md');
    assert.equal(b.ancillary.testRunner.npmTest, 'node --test');
    assert.equal(b.ancillary.qaIssuesTail.length, 1);
  } finally { rm(dir); }
});

test('qa fail-closed: missing protocol → throw EREQUIRED_MISSING', () => {
  const dir = tmpRepo();
  try {
    let err;
    try {
      lib.generateBrief({ projectDir: dir, kind: 'qa', domain: 'd-foo', spawnId: 'qa-fc' });
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, 'EREQUIRED_MISSING');
    assert.ok(err.missing.includes('templates/prompts/qa-subagent.md'));
  } finally { rm(dir); }
});
