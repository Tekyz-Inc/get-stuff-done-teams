'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const lib = require('../../bin/gsd-t-context-brief.cjs');
const kind = require('../../bin/gsd-t-context-brief-kinds/scan.cjs');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d4-scan-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: dir, stdio: 'ignore' });
  } catch (_) {}
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
function w(root, rel, content) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}
function gitAdd(dir, files) {
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'add', '-q'], { cwd: dir, stdio: 'ignore' });
}

test('scan kind: declared metadata', () => {
  assert.equal(kind.name, 'scan');
  assert.deepEqual(kind.requiresSources, []);
});

test('_hashFileList: stable for same input regardless of order', () => {
  const a = kind._hashFileList(['z', 'a', 'm']);
  const b = kind._hashFileList(['m', 'z', 'a']);
  assert.equal(a, b);
});

test('_hashFileList: different for different inputs', () => {
  const a = kind._hashFileList(['z', 'a']);
  const b = kind._hashFileList(['z', 'a', 'extra']);
  assert.notEqual(a, b);
});

test('_mergedExclusions: merges .gitignore + .gsd-t/scan/exclusions.txt', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gitignore', '# comment\nnode_modules/\n*.log\n\n');
    w(dir, '.gsd-t/scan/exclusions.txt', 'dist/\nnode_modules/\n');
    const sink = [];
    const out = kind._mergedExclusions(dir, (p) => sink.push(p));
    // Deduplicated, sorted.
    assert.ok(out.includes('node_modules/'));
    assert.ok(out.includes('*.log'));
    assert.ok(out.includes('dist/'));
    const sorted = out.slice().sort();
    assert.deepEqual(out, sorted);
    assert.ok(sink.includes('.gitignore'));
    assert.ok(sink.includes('.gsd-t/scan/exclusions.txt'));
  } finally { rm(dir); }
});

test('scan happy: assembles inventoryHash + exclusions + null priorScanMtime', () => {
  const dir = tmpRepo();
  try {
    w(dir, 'README.md', 'hi');
    w(dir, 'src/foo.js', 'x');
    gitAdd(dir);
    const b = lib.generateBrief({ projectDir: dir, kind: 'scan', spawnId: 's-h' });
    assert.equal(typeof b.ancillary.inventoryHash, 'string');
    assert.match(b.ancillary.inventoryHash, /^[a-f0-9]{64}$/);
    assert.equal(b.ancillary.inventoryCount, 2);
    assert.equal(b.ancillary.priorScanMtime, null);
    assert.equal(b.ancillary.priorScanPath, null);
  } finally { rm(dir); }
});

test('scan: priorScanMtime surfaced when .gsd-t/scan/output.md exists', () => {
  const dir = tmpRepo();
  try {
    w(dir, 'README.md', 'hi');
    gitAdd(dir);
    w(dir, '.gsd-t/scan/output.md', '# scan\n');
    const b = lib.generateBrief({ projectDir: dir, kind: 'scan', spawnId: 's-p' });
    assert.match(b.ancillary.priorScanMtime, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(b.ancillary.priorScanPath, '.gsd-t/scan/output.md');
  } finally { rm(dir); }
});

test('scan fail-open: empty git repo → inventoryHash null, no throw', () => {
  const dir = tmpRepo();
  try {
    const b = lib.generateBrief({ projectDir: dir, kind: 'scan', spawnId: 's-fo' });
    assert.equal(b.ancillary.inventoryHash, null);
    assert.equal(b.ancillary.inventoryCount, 0);
  } finally { rm(dir); }
});
