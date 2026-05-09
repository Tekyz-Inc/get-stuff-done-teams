'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const lib = require('../../bin/gsd-t-context-brief.cjs');
const kind = require('../../bin/gsd-t-context-brief-kinds/design-verify.cjs');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d4-dv-'));
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

test('design-verify kind: declared metadata', () => {
  assert.equal(kind.name, 'design-verify');
  // OR-of-required is enforced inside collect(); requiresSources stays empty
  // because the library treats it as AND.
  assert.deepEqual(kind.requiresSources, []);
});

test('_figmaUrls: extracts and dedupes', () => {
  const text = [
    'see https://www.figma.com/file/ABC/design',
    'and https://figma.com/file/ABC/design (duplicate normalized)',
    'plus https://www.figma.com/file/XYZ/other',
  ].join('\n');
  const urls = kind._figmaUrls(text);
  assert.ok(urls.length >= 2);
  for (const u of urls) assert.match(u, /figma\.com/);
});

test('design-verify fail-closed: no design contract → throw EREQUIRED_MISSING', () => {
  const dir = tmpRepo();
  try {
    let err;
    try {
      lib.generateBrief({ projectDir: dir, kind: 'design-verify', spawnId: 'dv-fc' });
    } catch (e) { err = e; }
    assert.ok(err);
    assert.equal(err.code, 'EREQUIRED_MISSING');
    assert.ok(err.missing.includes('.gsd-t/contracts/design-contract.md'));
    assert.ok(err.missing.includes('.gsd-t/contracts/design/INDEX.md'));
  } finally { rm(dir); }
});

test('design-verify happy: flat design-contract.md present → brief assembles', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gsd-t/contracts/design-contract.md', [
      '# Design',
      '',
      'Source: https://www.figma.com/file/ABC/foo',
      '',
    ].join('\n'));
    const b = lib.generateBrief({ projectDir: dir, kind: 'design-verify', spawnId: 'dv-h' });
    assert.ok(b.ancillary.figmaUrls.length >= 1);
    assert.match(b.ancillary.figmaUrls[0], /figma\.com\/file\/ABC/);
    assert.ok(b.ancillary.designContractPaths.includes('.gsd-t/contracts/design-contract.md'));
  } finally { rm(dir); }
});

test('design-verify happy: hierarchical design/INDEX.md present → brief assembles', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gsd-t/contracts/design/INDEX.md', '# Design Index\n');
    w(dir, '.gsd-t/contracts/design/page1.md', 'see https://www.figma.com/file/HI/page1\n');
    const b = lib.generateBrief({ projectDir: dir, kind: 'design-verify', spawnId: 'dv-hier' });
    assert.ok(b.ancillary.designContractPaths.length >= 2);
    assert.ok(b.ancillary.figmaUrls.length >= 1);
  } finally { rm(dir); }
});

test('design-verify: screenshotManifest surfaced when present', () => {
  const dir = tmpRepo();
  try {
    w(dir, '.gsd-t/contracts/design-contract.md', '# d');
    w(dir, '.gsd-t/screenshots/manifest.json', '{}');
    const b = lib.generateBrief({ projectDir: dir, kind: 'design-verify', spawnId: 'dv-mf' });
    assert.equal(b.ancillary.screenshotManifest, '.gsd-t/screenshots/manifest.json');
  } finally { rm(dir); }
});
