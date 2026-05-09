'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const check = require('../../bin/cli-preflight-checks/manifest-fresh.cjs');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d1-mf-'));
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function setMtime(file, ms) {
  const t = new Date(ms);
  fs.utimesSync(file, t, t);
}

test('manifest-fresh: declared metadata', () => {
  assert.equal(check.id, 'manifest-fresh');
  assert.equal(check.severity, 'info');
});

// ── Happy paths ─────────────────────────────────────────────────────────────

test('manifest-fresh happy: no manifest, no e2e/journeys → noop pass', () => {
  const dir = tmp();
  try {
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /no manifest, skipping/);
  } finally { rm(dir); }
});

test('manifest-fresh happy: manifest newer than every journey file', () => {
  const dir = tmp();
  try {
    const t0 = Date.now() - 60000;
    fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'e2e', 'journeys'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'e2e', 'journeys', 'a.spec.ts'), '');
    setMtime(path.join(dir, 'e2e', 'journeys', 'a.spec.ts'), t0);
    fs.writeFileSync(path.join(dir, '.gsd-t', 'journey-manifest.json'), '{}');
    setMtime(path.join(dir, '.gsd-t', 'journey-manifest.json'), t0 + 5000);
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /fresher than 1 journey file/);
  } finally { rm(dir); }
});

test('manifest-fresh happy: manifest present but no journey files', () => {
  const dir = tmp();
  try {
    fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'e2e', 'journeys'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.gsd-t', 'journey-manifest.json'), '{}');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /no journey files to compare/);
  } finally { rm(dir); }
});

// ── Fail path ───────────────────────────────────────────────────────────────

test('manifest-fresh fail: a journey file is newer than the manifest', () => {
  const dir = tmp();
  try {
    const t0 = Date.now() - 60000;
    fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'e2e', 'journeys'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.gsd-t', 'journey-manifest.json'), '{}');
    setMtime(path.join(dir, '.gsd-t', 'journey-manifest.json'), t0);
    fs.writeFileSync(path.join(dir, 'e2e', 'journeys', 'newer.spec.ts'), '');
    setMtime(path.join(dir, 'e2e', 'journeys', 'newer.spec.ts'), t0 + 10000);
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /manifest stale/);
    assert.equal(r.details.stale.length, 1);
  } finally { rm(dir); }
});
