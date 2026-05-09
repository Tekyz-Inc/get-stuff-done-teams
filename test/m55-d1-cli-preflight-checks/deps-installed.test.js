'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const check = require('../../bin/cli-preflight-checks/deps-installed.cjs');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d1-deps-'));
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function setMtime(file, ms) {
  const time = new Date(ms);
  fs.utimesSync(file, time, time);
}

test('deps-installed: declared metadata', () => {
  assert.equal(check.id, 'deps-installed');
  assert.equal(check.severity, 'warn');
});

// ── Happy paths ─────────────────────────────────────────────────────────────

test('deps-installed happy: no package.json → noop pass', () => {
  const dir = tmp();
  try {
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /non-Node project/);
  } finally { rm(dir); }
});

test('deps-installed happy: node_modules present + lockfile fresh', () => {
  const dir = tmp();
  try {
    const t0 = Date.now() - 60000;
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}');
    setMtime(path.join(dir, 'package.json'), t0);
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    setMtime(path.join(dir, 'package-lock.json'), t0 + 5000);
    fs.mkdirSync(path.join(dir, 'node_modules'));
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /lockfile fresh/);
  } finally { rm(dir); }
});

// ── Fail paths ──────────────────────────────────────────────────────────────

test('deps-installed fail: node_modules missing', () => {
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /node_modules\/ missing/);
  } finally { rm(dir); }
});

test('deps-installed fail: package-lock.json older than package.json', () => {
  const dir = tmp();
  try {
    const t0 = Date.now() - 60000;
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    setMtime(path.join(dir, 'package-lock.json'), t0);
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    setMtime(path.join(dir, 'package.json'), t0 + 10000);
    fs.mkdirSync(path.join(dir, 'node_modules'));
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /older than package.json/);
  } finally { rm(dir); }
});
