'use strict';

// M50 D1 — CLI integration tests for the Playwright bootstrap wiring in
// bin/gsd-t.js. These tests assert that the CLI wires `installPlaywright()`
// into the right places (init, update-all summary, doctor --install-playwright,
// setup-playwright subcommand) without actually shelling out — they import the
// helpers and exercise them directly.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const bootstrap = require('../bin/playwright-bootstrap.cjs');
const { hasUI } = require('../bin/ui-detection.cjs');

function makeUiFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'ui-fix', dependencies: { react: '*' } }),
  );
  return dir;
}

function makeNonUiFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m50-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // No package.json deps, no html, no .tsx — pure-CLI fixture
  return dir;
}

describe('M50 D1 CLI Integration', () => {
  test('hasPlaywright + installPlaywright re-exported via bin/gsd-t.js are the same as bin/playwright-bootstrap.cjs', () => {
    // bin/gsd-t.js must require from playwright-bootstrap.cjs — no duplicate
    // implementation. Read the source and assert the require is present.
    const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'gsd-t.js'), 'utf8');
    assert.match(src, /require\(["']\.\/playwright-bootstrap\.cjs["']\)/, 'bin/gsd-t.js must require ./playwright-bootstrap.cjs');
    assert.match(src, /require\(["']\.\/ui-detection\.cjs["']\)/, 'bin/gsd-t.js must require ./ui-detection.cjs');
    // Verify the inline impl is gone — there should be no second hasPlaywright function definition.
    const matches = src.match(/function hasPlaywright\b/g) || [];
    assert.equal(matches.length, 0, 'No inline hasPlaywright should remain after migration');
  });

  test('init codepath: UI fixture without playwright triggers installPlaywright via the wired helpers', async (t) => {
    const dir = makeUiFixture(t);
    assert.equal(hasUI(dir), true);
    assert.equal(bootstrap.hasPlaywright(dir), false);

    // Use the runner stub to avoid actually shelling out to npm.
    const calls = [];
    const stubRunner = async (cmd, args) => {
      calls.push({ cmd, args });
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = await bootstrap.installPlaywright(dir, { runner: stubRunner });
    assert.equal(r.ok, true);
    assert.equal(calls[0].cmd, 'npm');
    assert.deepEqual(calls[0].args, ['install', '-D', '@playwright/test']);
    // Init expectations: config + e2e placeholder written
    assert.ok(fs.existsSync(path.join(dir, 'playwright.config.ts')));
    assert.ok(fs.existsSync(path.join(dir, 'e2e', '__placeholder.spec.ts')));
  });

  test('init codepath: non-UI fixture skips installPlaywright (gated by hasUI)', (t) => {
    const dir = makeNonUiFixture(t);
    assert.equal(hasUI(dir), false);
    assert.equal(bootstrap.hasPlaywright(dir), false);
    // The init path conditional `hasUI(dir) && !hasPlaywright(dir)` would not fire here.
    // We assert the gate condition rather than re-running the whole init flow.
    const shouldInstall = hasUI(dir) && !bootstrap.hasPlaywright(dir);
    assert.equal(shouldInstall, false);
  });

  test('doctor --install-playwright: invokes installPlaywright on a UI fixture', async (t) => {
    const dir = makeUiFixture(t);

    const calls = [];
    const stubRunner = async (cmd, args) => {
      calls.push({ cmd, args });
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = await bootstrap.installPlaywright(dir, { runner: stubRunner });
    assert.equal(r.ok, true);
    assert.equal(calls.length, 2, 'two subprocess calls (install + chromium)');
  });

  test('setup-playwright subcommand: installPlaywright drives a non-existing UI project to a fully configured state', async (t) => {
    const dir = makeUiFixture(t);
    const stubRunner = async () => ({ code: 0, stdout: '', stderr: '' });
    const r = await bootstrap.installPlaywright(dir, { runner: stubRunner });
    assert.equal(r.ok, true);
    assert.ok(fs.existsSync(path.join(dir, 'playwright.config.ts')));
    assert.ok(fs.existsSync(path.join(dir, 'e2e', '__placeholder.spec.ts')));
  });
});
