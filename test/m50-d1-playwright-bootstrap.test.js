'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  hasPlaywright,
  detectPackageManager,
  verifyPlaywrightHealth,
  installPlaywright,
  _PLAYWRIGHT_CONFIG_TEMPLATE,
  _INSTALL_COMMANDS,
} = require('../bin/playwright-bootstrap.cjs');

// ── hasPlaywright ─────────────────────────────────────────────────────────────

describe('hasPlaywright', () => {
  test('returns true when playwright.config.ts exists', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), '');
    assert.equal(hasPlaywright(dir), true);
  });

  test('returns true when playwright.config.js exists', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'playwright.config.js'), '');
    assert.equal(hasPlaywright(dir), true);
  });

  test('returns true when playwright.config.mjs exists', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'playwright.config.mjs'), '');
    assert.equal(hasPlaywright(dir), true);
  });

  test('returns false when no playwright config exists', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    assert.equal(hasPlaywright(dir), false);
  });
});

// ── detectPackageManager ──────────────────────────────────────────────────────

describe('detectPackageManager', () => {
  test('returns pnpm when pnpm-lock.yaml is present', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
    assert.equal(detectPackageManager(dir), 'pnpm');
  });

  test('returns yarn when yarn.lock is present (no pnpm lock)', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
    assert.equal(detectPackageManager(dir), 'yarn');
  });

  test('returns bun when bun.lockb is present (no pnpm or yarn lock)', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'bun.lockb'), '');
    assert.equal(detectPackageManager(dir), 'bun');
  });

  test('returns npm when no lockfile is present', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    assert.equal(detectPackageManager(dir), 'npm');
  });
});

// ── verifyPlaywrightHealth ────────────────────────────────────────────────────

describe('verifyPlaywrightHealth', () => {
  test('returns {ok: true, version} when npx playwright --version succeeds', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    // Stub by writing a fake `playwright` bin that npx will find via a local node_modules/.bin
    const binDir = path.join(dir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakePlaywright = path.join(binDir, 'playwright');
    fs.writeFileSync(fakePlaywright, '#!/bin/sh\necho "Version 1.42.0"\n');
    fs.chmodSync(fakePlaywright, 0o755);

    const result = await verifyPlaywrightHealth(dir);
    assert.equal(result.ok, true, 'ok should be true');
    assert.equal(result.version, '1.42.0', 'version should be parsed');
  });

  test('returns {ok: false, error} on subprocess error or timeout', async (t) => {
    // Use a directory with no playwright; npx will fail to find it
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    // Override PATH to empty so npx itself cannot find playwright
    const origPath = process.env.PATH;
    process.env.PATH = dir; // dir contains no executables → npx will error
    t.after(() => { process.env.PATH = origPath; });

    const result = await verifyPlaywrightHealth(dir);
    assert.equal(result.ok, false, 'ok should be false when command fails');
    assert.ok(typeof result.error === 'string' && result.error.length > 0, 'error string should be present');
  });
});

// ── installPlaywright ─────────────────────────────────────────────────────────

function _makeRunner(plan) {
  // plan: ordered array of {cmd, args, code, stderr?, sideEffect?(cwd)}
  // Each call shifts and matches the front of the queue.
  const calls = [];
  const runner = async (cmd, args, cwd) => {
    calls.push({ cmd, args, cwd });
    const step = plan.shift();
    if (!step) {
      throw new Error(
        `Unexpected runner call: ${cmd} ${args.join(' ')} — plan exhausted`,
      );
    }
    if (step.sideEffect) step.sideEffect(cwd);
    return { code: step.code, stdout: step.stdout || '', stderr: step.stderr || '' };
  };
  runner.calls = calls;
  return runner;
}

describe('installPlaywright', () => {
  test('idempotent: short-circuits when playwright.config.ts already exists', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), '// existing\n');

    const runner = _makeRunner([]); // no calls expected
    const result = await installPlaywright(dir, { runner });
    assert.deepEqual(result, { ok: true });
    assert.equal(runner.calls.length, 0, 'no subprocess invoked when already configured');
    // Config preserved
    assert.equal(fs.readFileSync(path.join(dir, 'playwright.config.ts'), 'utf8'), '// existing\n');
  });

  test('npm path: invokes npm install -D + npx playwright install chromium', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    const runner = _makeRunner([
      { code: 0 },
      { code: 0 },
    ]);
    const result = await installPlaywright(dir, { runner });
    assert.deepEqual(result, { ok: true });
    assert.equal(runner.calls[0].cmd, 'npm');
    assert.deepEqual(runner.calls[0].args, ['install', '-D', '@playwright/test']);
    assert.equal(runner.calls[1].cmd, 'npx');
    assert.deepEqual(runner.calls[1].args, ['playwright', 'install', 'chromium']);
    // Config + placeholder written
    assert.ok(fs.existsSync(path.join(dir, 'playwright.config.ts')));
    assert.ok(fs.existsSync(path.join(dir, 'e2e', '__placeholder.spec.ts')));
  });

  test('pnpm path: invokes pnpm add -D when pnpm-lock.yaml present', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');

    const runner = _makeRunner([{ code: 0 }, { code: 0 }]);
    const result = await installPlaywright(dir, { runner });
    assert.deepEqual(result, { ok: true });
    assert.equal(runner.calls[0].cmd, 'pnpm');
    assert.deepEqual(runner.calls[0].args, ['add', '-D', '@playwright/test']);
  });

  test('yarn path: invokes yarn add -D when yarn.lock present', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');

    const runner = _makeRunner([{ code: 0 }, { code: 0 }]);
    const result = await installPlaywright(dir, { runner });
    assert.deepEqual(result, { ok: true });
    assert.equal(runner.calls[0].cmd, 'yarn');
    assert.deepEqual(runner.calls[0].args, ['add', '-D', '@playwright/test']);
  });

  test('bun path: invokes bun add -d when bun.lockb present', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'bun.lockb'), '');

    const runner = _makeRunner([{ code: 0 }, { code: 0 }]);
    const result = await installPlaywright(dir, { runner });
    assert.deepEqual(result, { ok: true });
    assert.equal(runner.calls[0].cmd, 'bun');
    assert.deepEqual(runner.calls[0].args, ['add', '-d', '@playwright/test']);
  });

  test('writes playwright.config.ts verbatim from contract template', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    const runner = _makeRunner([{ code: 0 }, { code: 0 }]);
    await installPlaywright(dir, { runner });

    const written = fs.readFileSync(path.join(dir, 'playwright.config.ts'), 'utf8');
    assert.equal(written, _PLAYWRIGHT_CONFIG_TEMPLATE);
    // Sanity: contract §6 markers present
    assert.match(written, /testDir:\s*'\.\/e2e'/);
    assert.match(written, /name:\s*'chromium'/);
  });

  test('preserves existing playwright.config.ts (does not overwrite)', async (t) => {
    // This case is covered by the idempotent-short-circuit test (we short-circuit
    // before any subprocess work when playwright.config.* exists). Re-assert
    // here that operator content is preserved across a re-invocation.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), '// operator-customized\n');

    const runner = _makeRunner([]);
    const result = await installPlaywright(dir, { runner });
    assert.deepEqual(result, { ok: true });
    assert.equal(
      fs.readFileSync(path.join(dir, 'playwright.config.ts'), 'utf8'),
      '// operator-customized\n',
    );
  });

  test('preserves existing e2e/ contents (does not overwrite)', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'e2e'));
    fs.writeFileSync(path.join(dir, 'e2e', 'real.spec.ts'), '// existing real spec\n');

    const runner = _makeRunner([{ code: 0 }, { code: 0 }]);
    const result = await installPlaywright(dir, { runner });
    assert.deepEqual(result, { ok: true });

    // Existing spec preserved, no placeholder added
    assert.ok(fs.existsSync(path.join(dir, 'e2e', 'real.spec.ts')));
    assert.equal(
      fs.readFileSync(path.join(dir, 'e2e', 'real.spec.ts'), 'utf8'),
      '// existing real spec\n',
    );
    assert.equal(
      fs.existsSync(path.join(dir, 'e2e', '__placeholder.spec.ts')),
      false,
      'placeholder should NOT be written when e2e/ already has content',
    );
  });

  test('install failure (package manager not found) → {ok:false, hint}', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    const runner = _makeRunner([
      { code: 127, stderr: 'npm: command not found' },
    ]);
    const result = await installPlaywright(dir, { runner });
    assert.equal(result.ok, false);
    assert.equal(result.err, 'package-manager-not-found');
    assert.match(result.hint, /gsd-t doctor/);
  });

  test('chromium download failure → {ok:false, partial:true, hint}', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    const runner = _makeRunner([
      { code: 0 }, // npm install -D succeeded
      { code: 1, stderr: 'Failed to download chromium browser' },
    ]);
    const result = await installPlaywright(dir, { runner });
    assert.equal(result.ok, false);
    assert.equal(result.partial, true);
    assert.match(result.hint, /chromium/i);
  });
});
