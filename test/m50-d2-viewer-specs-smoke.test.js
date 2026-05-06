'use strict';

// M50 D2 — smoke test for the GSD-T-repo Playwright config + spec discovery.
// This is a meta-test: we don't run Playwright here (that requires a real
// install + chromium binary). We just verify:
//   1. playwright.config.ts exists at project root and parses
//   2. The config's testDir points to './e2e'
//   3. The placeholder spec exists and discovery would find it

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('M50 D2 viewer-specs smoke', () => {
  test('playwright.config.ts exists at project root', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'playwright.config.ts')));
  });

  test('playwright.config.ts has testDir: ./e2e and chromium project', () => {
    const src = fs.readFileSync(path.join(ROOT, 'playwright.config.ts'), 'utf8');
    assert.match(src, /testDir:\s*'\.\/e2e'/);
    assert.match(src, /name:\s*'chromium'/);
    // Per the contract: webServer must be omitted (specs manage server lifecycle)
    assert.doesNotMatch(src, /^\s*webServer:/m);
  });

  test('e2e directory exists with the placeholder spec', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'e2e', '__placeholder.spec.ts')));
  });

  test('package.json scripts include e2e + e2e:install; @playwright/test in devDependencies only', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.e2e, 'playwright test');
    assert.equal(pkg.scripts['e2e:install'], 'playwright install chromium');
    // Zero-runtime-dep invariant: runtime deps stay empty
    assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
    assert.ok(pkg.devDependencies && pkg.devDependencies['@playwright/test']);
  });
});
