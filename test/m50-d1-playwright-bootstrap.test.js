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
