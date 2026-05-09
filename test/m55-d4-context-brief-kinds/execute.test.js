'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const lib = require('../../bin/gsd-t-context-brief.cjs');
const kind = require('../../bin/gsd-t-context-brief-kinds/execute.cjs');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d4-exec-'));
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

test('execute kind: declared metadata', () => {
  assert.equal(kind.name, 'execute');
  assert.deepEqual(kind.requiresSources, []);
  assert.equal(typeof kind.collect, 'function');
});

test('_bulletsUnderSection: extracts top-level bullets only', () => {
  const text = '## Must Follow\n\n- alpha\n- beta\n  - sub-bullet (skip)\n- gamma\n\n## Next\n';
  const items = kind._bulletsUnderSection(text, 'Must Follow');
  assert.deepEqual(items, ['alpha', 'beta', 'gamma']);
});

test('_bulletsUnderSection: strips backticks and bold markers', () => {
  const text = '## X\n\n- **Bold** item with `code`\n';
  const items = kind._bulletsUnderSection(text, 'X');
  assert.deepEqual(items, ['Bold item with code']);
});

test('_ownedPathsFromScope: captures paths in backticks at top-level only', () => {
  const text = '## Owned Files/Directories\n\n' +
    '- `bin/foo.cjs`\n' +
    '  - `sub.cjs` (sub-bullet)\n' +
    '- `test/foo.test.js`\n';
  assert.deepEqual(kind._ownedPathsFromScope(text), ['bin/foo.cjs', 'test/foo.test.js']);
});

test('_notOwnedPaths: captures paths from "NOT Owned" section', () => {
  const text = '## NOT Owned (do not modify)\n\n- `bin/bar.cjs`\n- `bin/baz.cjs`\n';
  assert.deepEqual(kind._notOwnedPaths(text), ['bin/bar.cjs', 'bin/baz.cjs']);
});

test('_contractsReferenced: extracts and reads status', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gsd-t/contracts/foo-contract.md', '# Foo\n\nStatus: STABLE\n');
    const text = 'see `.gsd-t/contracts/foo-contract.md` for the schema';
    const out = kind._contractsReferenced(text, dir);
    assert.equal(out.length, 1);
    assert.equal(out[0].path, '.gsd-t/contracts/foo-contract.md');
    assert.equal(out[0].status, 'STABLE');
  } finally { rm(dir); }
});

test('_tasksFromTasksMd: extracts T1, T2, ... headings', () => {
  const text = '# Tasks\n\n## T1 — first\n\n## T2 — second\n\n## T-3 — alt notation\n';
  const out = kind._tasksFromTasksMd(text);
  assert.ok(out.includes('T1'));
  assert.ok(out.includes('T2'));
  assert.ok(out.includes('T-3'));
});

test('_tasksFromTasksMd: extracts Mxx-Dx-Tx Shape C', () => {
  const text = '## M55-D4-T1 — first\n\n- [ ] **M55-D4-T2** sub\n';
  const out = kind._tasksFromTasksMd(text);
  assert.ok(out.includes('M55-D4-T1'));
  assert.ok(out.includes('M55-D4-T2'));
});

test('execute happy: collects scope/constraints/contracts/tasks for a real domain', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gsd-t/contracts/foo-contract.md', 'Status: STABLE\n');
    w(dir, '.gsd-t/domains/d-foo/scope.md',
      '## Owned Files/Directories\n\n- `bin/foo.cjs`\n\n' +
      '## NOT Owned\n\n- `bin/bar.cjs`\n\n' +
      '## Deliverables\n\n- foo lib\n\n' +
      'see `.gsd-t/contracts/foo-contract.md`\n');
    w(dir, '.gsd-t/domains/d-foo/constraints.md',
      '## Must Follow\n\n- be deterministic\n\n## Must Not\n\n- spawn LLMs\n');
    w(dir, '.gsd-t/domains/d-foo/tasks.md', '## T1 — go\n\n## T2 — done\n');
    const b = lib.generateBrief({ projectDir: dir, kind: 'execute', domain: 'd-foo', spawnId: 'h-1' });
    assert.deepEqual(b.scope.owned, ['bin/foo.cjs']);
    assert.deepEqual(b.scope.notOwned, ['bin/bar.cjs']);
    assert.deepEqual(b.scope.deliverables, ['foo lib']);
    assert.ok(b.constraints.includes('MUST: be deterministic'));
    assert.ok(b.constraints.includes('MUST NOT: spawn LLMs'));
    assert.equal(b.contracts.length, 1);
    assert.equal(b.contracts[0].status, 'STABLE');
    assert.deepEqual(b.ancillary.tasks, ['T1', 'T2']);
  } finally { rm(dir); }
});

test('execute fail-open: missing domain dir → empty fields, no throw', () => {
  const dir = tmpRepo();
  try {
    const b = lib.generateBrief({ projectDir: dir, kind: 'execute', domain: 'absent', spawnId: 'fo-1' });
    assert.deepEqual(b.scope.owned, []);
    assert.deepEqual(b.constraints, []);
    assert.deepEqual(b.ancillary.tasks, []);
  } finally { rm(dir); }
});

test('execute: brief inside MAX_BRIEF_BYTES on the actual GSD-T repo', () => {
  // Smoke: regenerate the smoke-001 brief against the live repo.
  const b = lib.generateBrief({
    projectDir: '.',
    kind: 'execute',
    domain: 'm55-d4-context-brief-generator',
    spawnId: 'smoke-cap',
  });
  const bytes = Buffer.byteLength(lib.stableStringify(b), 'utf8');
  assert.ok(bytes <= lib.MAX_BRIEF_BYTES, 'brief too large: ' + bytes);
});
