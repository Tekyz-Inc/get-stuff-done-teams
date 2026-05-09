'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const check = require('../../bin/cli-preflight-checks/contracts-stable.cjs');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d1-cs-'));
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function writeContract(dir, name, status) {
  fs.mkdirSync(path.join(dir, '.gsd-t', 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.gsd-t', 'contracts', name),
    '# X\n\nStatus: ' + status + '\n'
  );
}
function writeProgress(dir, body) {
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), body);
}

test('contracts-stable: declared metadata', () => {
  assert.equal(check.id, 'contracts-stable');
  assert.equal(check.severity, 'warn');
});

test('_isPastPartitioned: detects ACTIVE state', () => {
  assert.equal(check._isPastPartitioned('## Status\n\nStatus: ACTIVE\n'), true);
});

test('_isPastPartitioned: detects EXECUTING / VERIFIED / COMPLETED', () => {
  for (const s of ['EXECUTING', 'VERIFIED', 'COMPLETED', 'INTEGRATING']) {
    assert.equal(check._isPastPartitioned('Status: ' + s + '\n'), true, 'failed on ' + s);
  }
});

test('_isPastPartitioned: PARTITIONED itself does NOT count', () => {
  assert.equal(check._isPastPartitioned('Status: PARTITIONED\n'), false);
});

test('_isPastPartitioned: empty / null returns false', () => {
  assert.equal(check._isPastPartitioned(''), false);
  assert.equal(check._isPastPartitioned(null), false);
});

test('_scanContracts: finds DRAFT and PROPOSED', () => {
  const dir = tmp();
  try {
    writeContract(dir, 'a-contract.md', 'DRAFT');
    writeContract(dir, 'b-contract.md', 'PROPOSED');
    writeContract(dir, 'c-contract.md', 'STABLE');
    const offenders = check._scanContracts(path.join(dir, '.gsd-t', 'contracts'));
    const names = offenders.map((o) => o.file).sort();
    assert.deepEqual(names, ['a-contract.md', 'b-contract.md']);
  } finally { rm(dir); }
});

// ── Happy paths ─────────────────────────────────────────────────────────────

test('contracts-stable happy: pre-PARTITIONED with DRAFT contracts → ok:true', () => {
  const dir = tmp();
  try {
    writeProgress(dir, 'Status: DEFINED\n');
    writeContract(dir, 'foo-contract.md', 'DRAFT');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /not past PARTITIONED/);
  } finally { rm(dir); }
});

test('contracts-stable happy: post-PARTITIONED with all STABLE → ok:true', () => {
  const dir = tmp();
  try {
    writeProgress(dir, 'Status: ACTIVE\n');
    writeContract(dir, 'foo-contract.md', 'STABLE');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, true);
    assert.match(r.msg, /all contracts STABLE/);
  } finally { rm(dir); }
});

// ── Fail path ───────────────────────────────────────────────────────────────

test('contracts-stable fail: post-PARTITIONED with DRAFT → ok:false', () => {
  const dir = tmp();
  try {
    writeProgress(dir, 'Status: ACTIVE\n');
    writeContract(dir, 'foo-contract.md', 'DRAFT');
    writeContract(dir, 'bar-contract.md', 'PROPOSED');
    const r = check.run({ projectDir: dir });
    assert.equal(r.ok, false);
    assert.match(r.msg, /DRAFT\/PROPOSED/);
    assert.equal(r.details.offenders.length, 2);
  } finally { rm(dir); }
});
