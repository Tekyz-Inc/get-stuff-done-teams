'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const check = require('../../bin/cli-preflight-checks/ports-free.cjs');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d1-pf-'));
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function writeConfig(dir, cfg) {
  fs.mkdirSync(path.join(dir, '.gsd-t', '.unattended'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.gsd-t', '.unattended', 'config.json'),
    JSON.stringify(cfg)
  );
}

test('ports-free: declared metadata', () => {
  assert.equal(check.id, 'ports-free');
  assert.equal(check.severity, 'error');
});

test('_readRequiredPorts: missing config → []', () => {
  const dir = tmp();
  try {
    assert.deepEqual(check._readRequiredPorts(dir), []);
  } finally { rm(dir); }
});

test('_readRequiredPorts: filters non-integers / out-of-range', () => {
  const dir = tmp();
  try {
    writeConfig(dir, { requiredFreePorts: [3000, 0, -1, 70000, 'abc', 4000.5, 5500] });
    assert.deepEqual(check._readRequiredPorts(dir), [3000, 5500]);
  } finally { rm(dir); }
});

// ── Happy paths ─────────────────────────────────────────────────────────────

test('ports-free happy: no requiredFreePorts → noop pass', () => {
  const dir = tmp();
  try {
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /no requiredFreePorts/);
  } finally { rm(dir); }
});

test('ports-free happy: empty array → noop pass', () => {
  const dir = tmp();
  try {
    writeConfig(dir, { requiredFreePorts: [] });
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
  } finally { rm(dir); }
});

test('ports-free happy: configured port is free', () => {
  const dir = tmp();
  try {
    // Pick an unlikely-to-be-bound high port.
    writeConfig(dir, { requiredFreePorts: [54121] });
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /all 1 required ports are free/);
  } finally { rm(dir); }
});

// ── Fail path ───────────────────────────────────────────────────────────────

test('ports-free fail: an occupied port is detected', async () => {
  const dir = tmp();
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    writeConfig(dir, { requiredFreePorts: [port] });
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /occupied ports:/);
    assert.ok(r.details.occupied.includes(port));
  } finally {
    server.close();
    rm(dir);
  }
});
