'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const lib = require('../../bin/gsd-t-context-brief.cjs');
const kind = require('../../bin/gsd-t-context-brief-kinds/verify.cjs');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d4-verify-'));
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

test('verify kind: declared metadata', () => {
  assert.equal(kind.name, 'verify');
  assert.deepEqual(kind.requiresSources, []);
  assert.equal(typeof kind.collect, 'function');
});

test('_scanContracts: returns sorted [{path,status}]', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gsd-t/contracts/b-contract.md', 'Status: STABLE\n');
    w(dir, '.gsd-t/contracts/a-contract.md', 'Status: DRAFT\n');
    w(dir, '.gsd-t/contracts/c-contract.md', 'no status here');
    const out = kind._scanContracts(dir);
    const paths = out.map((x) => x.path);
    assert.deepEqual(paths, [
      '.gsd-t/contracts/a-contract.md',
      '.gsd-t/contracts/b-contract.md',
      '.gsd-t/contracts/c-contract.md',
    ]);
    assert.equal(out[0].status, 'DRAFT');
    assert.equal(out[1].status, 'STABLE');
    assert.equal(out[2].status, 'UNKNOWN');
  } finally { rm(dir); }
});

test('_successCriteriaFromCharter: extracts numbered list under Falsifiable Success Criteria', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gsd-t/charters/m99-charter.md', [
      '# M99 Charter',
      '',
      '## Falsifiable Success Criteria',
      '',
      '1. First criterion — measurable',
      '2. **Second** criterion',
      '3. Third with `code`',
      '',
      '## Other section',
    ].join('\n'));
    const sink = [];
    const r = kind._successCriteriaFromCharter(dir, (p) => sink.push(p));
    assert.equal(r.source, '.gsd-t/charters/m99-charter.md');
    assert.equal(r.items.length, 3);
    assert.match(r.items[0], /First criterion/);
  } finally { rm(dir); }
});

test('verify happy: assembles enumeratedContracts (DRAFT/PROPOSED only) + counts', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gsd-t/contracts/a-contract.md', 'Status: DRAFT\n');
    w(dir, '.gsd-t/contracts/b-contract.md', 'Status: STABLE\n');
    w(dir, '.gsd-t/contracts/c-contract.md', 'Status: PROPOSED\n');
    const b = lib.generateBrief({ projectDir: dir, kind: 'verify', spawnId: 'v-1' });
    const counts = b.ancillary.contractStatusCounts;
    assert.equal(counts.STABLE, 1);
    assert.equal(counts.DRAFT, 1);
    assert.equal(counts.PROPOSED, 1);
    // Only DRAFT + PROPOSED appear in contracts[].
    const enumeratedPaths = b.contracts.map((c) => c.path).sort();
    assert.deepEqual(enumeratedPaths, [
      '.gsd-t/contracts/a-contract.md',
      '.gsd-t/contracts/c-contract.md',
    ]);
  } finally { rm(dir); }
});

test('verify fail-open: no charter → successCriteria=[]', () => {
  const dir = tmpRepo();
  try {
    const b = lib.generateBrief({ projectDir: dir, kind: 'verify', spawnId: 'v-fo' });
    assert.deepEqual(b.ancillary.successCriteria, []);
    assert.equal(b.ancillary.charterSource, null);
  } finally { rm(dir); }
});
