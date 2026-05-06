'use strict';

// M50 D2 — spawn-gate unit tests for bin/headless-auto-spawn.cjs.
// The gate fires on testing/UI commands when hasUI && !hasPlaywright. On
// install success, the spawn proceeds; on install failure, exit 4 is
// triggered with mode: 'blocked-needs-human'. Non-testing/non-UI/has-playwright
// paths must short-circuit cheaply.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  autoSpawnHeadless,
  TESTING_OR_UI_COMMANDS,
  _isTestingOrUICommand,
} = require('../bin/headless-auto-spawn.cjs');

function makeProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-d2-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Provide a minimal bin/gsd-t.js so the spawn can launch (used only when
  // the test exercises the spawn through the gate's success path).
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bin', 'gsd-t.js'), '#!/usr/bin/env node\nprocess.exit(0);\n');
  return dir;
}

describe('M50 D2 spawn-gate — _isTestingOrUICommand', () => {
  test('whitelist contains all 9 contracted commands', () => {
    for (const c of [
      'gsd-t-execute',
      'gsd-t-test-sync',
      'gsd-t-verify',
      'gsd-t-quick',
      'gsd-t-wave',
      'gsd-t-milestone',
      'gsd-t-complete-milestone',
      'gsd-t-debug',
      'gsd-t-integrate',
    ]) {
      assert.ok(TESTING_OR_UI_COMMANDS.has(c), `${c} should be whitelisted`);
      assert.equal(_isTestingOrUICommand(c), true);
    }
  });

  test('accepts unprefixed command names too', () => {
    assert.equal(_isTestingOrUICommand('execute'), true);
    assert.equal(_isTestingOrUICommand('test-sync'), true);
  });

  test('returns false for non-testing commands', () => {
    assert.equal(_isTestingOrUICommand('gsd-t-status'), false);
    assert.equal(_isTestingOrUICommand('gsd-t-init'), false);
    assert.equal(_isTestingOrUICommand('gsd-t-help'), false);
    assert.equal(_isTestingOrUICommand(null), false);
    assert.equal(_isTestingOrUICommand(undefined), false);
    assert.equal(_isTestingOrUICommand(''), false);
  });
});

describe('M50 D2 spawn-gate — gate firing matrix', () => {
  test('non-testing command → gate does NOT fire (no install probe)', (t) => {
    const dir = makeProject(t);
    let installerCalled = false;
    const exits = [];
    const r = autoSpawnHeadless({
      command: 'gsd-t-status',
      projectDir: dir,
      _gateInstaller: () => { installerCalled = true; return { ok: true }; },
      _gateProbes: { hasUI: () => true, hasPlaywright: () => false },
      _gateExit: (code) => exits.push(code),
    });
    assert.equal(installerCalled, false, 'installer must not be invoked for non-testing command');
    assert.equal(exits.length, 0, 'no exit on non-testing command');
    assert.ok(r.id, 'spawn proceeded');
  });

  test('testing command + !hasUI → gate does NOT fire', (t) => {
    const dir = makeProject(t);
    let installerCalled = false;
    const r = autoSpawnHeadless({
      command: 'gsd-t-execute',
      projectDir: dir,
      _gateInstaller: () => { installerCalled = true; return { ok: true }; },
      _gateProbes: { hasUI: () => false, hasPlaywright: () => false },
    });
    assert.equal(installerCalled, false);
    assert.ok(r.id);
  });

  test('testing command + hasUI + hasPlaywright → gate does NOT fire', (t) => {
    const dir = makeProject(t);
    let installerCalled = false;
    const r = autoSpawnHeadless({
      command: 'gsd-t-execute',
      projectDir: dir,
      _gateInstaller: () => { installerCalled = true; return { ok: true }; },
      _gateProbes: { hasUI: () => true, hasPlaywright: () => true },
    });
    assert.equal(installerCalled, false);
    assert.ok(r.id);
  });

  test('testing command + hasUI + !hasPlaywright + install OK → gate installs and spawn proceeds', (t) => {
    const dir = makeProject(t);
    let installerCalled = false;
    const r = autoSpawnHeadless({
      command: 'gsd-t-execute',
      projectDir: dir,
      _gateInstaller: () => { installerCalled = true; return { ok: true }; },
      _gateProbes: { hasUI: () => true, hasPlaywright: () => false },
    });
    assert.equal(installerCalled, true, 'installer must fire');
    assert.ok(r.id, 'spawn must still proceed after a successful install');
  });

  test('testing command + hasUI + !hasPlaywright + install FAIL → mode: blocked-needs-human + exit 4', (t) => {
    const dir = makeProject(t);
    const exits = [];
    const r = autoSpawnHeadless({
      command: 'gsd-t-execute',
      projectDir: dir,
      _gateInstaller: () => ({ ok: false, err: 'package-manager-not-found', hint: 'install npm' }),
      _gateProbes: { hasUI: () => true, hasPlaywright: () => false },
      _gateExit: (code) => exits.push(code),
    });
    assert.deepEqual(exits, [4], 'gate must exit 4 on install failure');
    assert.equal(r.mode, 'blocked-needs-human');
    // Session file must be written with the blocked-needs-human payload.
    const sessFiles = fs.readdirSync(path.join(dir, '.gsd-t', 'headless-sessions'));
    const sessFile = sessFiles.find((f) => f.endsWith('.json') && !f.endsWith('-context.json'));
    assert.ok(sessFile, 'session file must exist');
    const payload = JSON.parse(
      fs.readFileSync(path.join(dir, '.gsd-t', 'headless-sessions', sessFile), 'utf8'),
    );
    assert.equal(payload.mode, 'blocked-needs-human');
    assert.equal(payload.reason, 'playwright-install-failed');
    assert.equal(payload.err, 'package-manager-not-found');
    assert.equal(payload.hint, 'install npm');
  });

  test('hot-path overhead: gate-skip path does not invoke installer or probe filesystem more than required', (t) => {
    const dir = makeProject(t);
    let probeCount = 0;
    const r = autoSpawnHeadless({
      command: 'gsd-t-execute',
      projectDir: dir,
      _gateInstaller: () => { throw new Error('installer must not be called'); },
      _gateProbes: {
        hasUI: () => { probeCount++; return false; },
        hasPlaywright: () => { probeCount++; return false; },
      },
    });
    assert.ok(probeCount <= 2, `expected ≤2 probe calls; got ${probeCount}`);
    assert.ok(r.id, 'spawn proceeds');
  });
});
