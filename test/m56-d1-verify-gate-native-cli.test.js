'use strict';
/**
 * M56 D1 — verify-gate native CLI workers tests
 *
 * Asserts that `_detectDefaultTrack2` produces the new entries for
 * `playwright test` and `gsd-t check-coverage` when their detection
 * signals are present.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const vg = require('../bin/gsd-t-verify-gate.cjs');

function makeProject(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm56-d1-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'm56-d1-fixture',
    version: '1.0.0',
    scripts: { test: 'echo ok' },
  }, null, 2));
  if (opts.playwright) {
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), '// fixture');
  }
  if (opts.journeyManifest) {
    fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.gsd-t', 'journey-manifest.json'), '{}');
  }
  return dir;
}

test('Track 2 detector includes playwright entry when playwright.config.ts present', () => {
  const dir = makeProject({ playwright: true });
  const notes = [];
  const plan = vg._detectDefaultTrack2(dir, notes);
  const pw = plan.find((p) => p.id === 'playwright');
  assert.ok(pw, 'playwright entry should appear in plan');
  assert.deepStrictEqual(pw.args.slice(0, 3), ['--no-install', 'playwright', 'test'],
    'playwright args should be --no-install playwright test');
  assert.ok(pw.timeoutMs >= 60000, 'playwright timeout should accommodate full E2E suite');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Track 2 detector OMITS playwright entry when no config file', () => {
  const dir = makeProject({ playwright: false });
  const notes = [];
  const plan = vg._detectDefaultTrack2(dir, notes);
  const pw = plan.find((p) => p.id === 'playwright');
  assert.strictEqual(pw, undefined, 'playwright entry should be absent without config');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Track 2 detector includes journey-coverage entry when manifest present', () => {
  const dir = makeProject({ journeyManifest: true });
  const notes = [];
  const plan = vg._detectDefaultTrack2(dir, notes);
  const jc = plan.find((p) => p.id === 'journey-coverage');
  assert.ok(jc, 'journey-coverage entry should appear in plan');
  assert.strictEqual(jc.cmd, 'node', 'journey-coverage uses node, not npx');
  assert.deepStrictEqual(jc.args, ['./bin/gsd-t.js', 'check-coverage'],
    'journey-coverage runs gsd-t check-coverage via local bin/gsd-t.js');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Track 2 detector OMITS journey-coverage entry when manifest absent', () => {
  const dir = makeProject({ journeyManifest: false });
  const notes = [];
  const plan = vg._detectDefaultTrack2(dir, notes);
  const jc = plan.find((p) => p.id === 'journey-coverage');
  assert.strictEqual(jc, undefined, 'journey-coverage entry should be absent without manifest');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Track 2 detector preserves existing entries (no envelope-shape regression)', () => {
  const dir = makeProject({ playwright: true, journeyManifest: true });
  const notes = [];
  const plan = vg._detectDefaultTrack2(dir, notes);
  // Tests entry from package.json scripts.test should still appear.
  const tests = plan.find((p) => p.id === 'tests');
  assert.ok(tests, 'tests entry should still appear');
  assert.strictEqual(tests.cmd, 'npm');
  assert.deepStrictEqual(tests.args, ['test', '--silent']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('M56 token-baseline metrics file: schemaVersion + m55Baseline structure', () => {
  const projectDir = path.resolve(__dirname, '..');
  const baselinePath = path.join(projectDir, '.gsd-t', 'metrics', 'm56-token-baseline.json');
  assert.ok(fs.existsSync(baselinePath), 'm56-token-baseline.json should exist');
  const data = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  assert.strictEqual(data.schemaVersion, '1.0.0');
  assert.ok(data.m55Baseline, 'should have m55Baseline section');
  assert.strictEqual(typeof data.m55Baseline.totalCostUsd, 'number',
    'm55Baseline.totalCostUsd should be a number');
  assert.ok('m56Actual' in data, 'should have m56Actual key (may be null until verify phase)');
});

test('M56 verify-gate wall-clock metrics file: schemaVersion + m55BaselineMs', () => {
  const projectDir = path.resolve(__dirname, '..');
  const wallclockPath = path.join(projectDir, '.gsd-t', 'metrics', 'm56-verify-gate-wallclock.json');
  assert.ok(fs.existsSync(wallclockPath), 'm56-verify-gate-wallclock.json should exist');
  const data = JSON.parse(fs.readFileSync(wallclockPath, 'utf8'));
  assert.strictEqual(data.schemaVersion, '1.0.0');
  assert.strictEqual(data.m55BaselineMs, 34000, 'M55 baseline should be 34s');
  assert.ok('m56ActualMs' in data, 'should have m56ActualMs key (may be null until verify phase)');
});
