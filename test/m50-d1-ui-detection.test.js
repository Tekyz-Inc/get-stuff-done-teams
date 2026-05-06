'use strict';

/**
 * M50 D1 Task 1 — bin/ui-detection.cjs
 *
 * Contract: .gsd-t/contracts/playwright-bootstrap-contract.md §4
 *
 * Acceptance: hasUI() + detectUIFlavor() must:
 *   - never throw (returns false / null on errors)
 *   - synchronous, depth-bounded ≤3 levels
 *   - exclude node_modules / .git / dist / build / .next / .nuxt / coverage / .gsd-t
 *   - probe order: package.json deps → pubspec.yaml → tailwind.config.{js,ts} → ui-file walk
 *
 * 8 fixtures: react, vue, svelte, next, flutter, tailwind-only, css-only,
 *             no-UI; plus depth-bound enforcement.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { hasUI, detectUIFlavor } = require('../bin/ui-detection.cjs');

// ── Fixture helper ──────────────────────────────────────────────────────────
let TMP_ROOT;

before(() => {
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-d1-ui-detection-'));
});

after(() => {
  if (TMP_ROOT && fs.existsSync(TMP_ROOT)) {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  }
});

function makeFixture(name, files) {
  const dir = path.join(TMP_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('M50 D1 — ui-detection.cjs', () => {
  it('react fixture → hasUI true, detectUIFlavor "react"', () => {
    const dir = makeFixture('react', {
      'package.json': JSON.stringify({
        name: 'r',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      }),
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'react');
  });

  it('vue fixture → hasUI true, detectUIFlavor "vue"', () => {
    const dir = makeFixture('vue', {
      'package.json': JSON.stringify({
        name: 'v',
        dependencies: { vue: '^3.0.0' },
      }),
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'vue');
  });

  it('svelte fixture → hasUI true, detectUIFlavor "svelte"', () => {
    const dir = makeFixture('svelte', {
      'package.json': JSON.stringify({
        name: 's',
        devDependencies: { svelte: '^4.0.0' },
      }),
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'svelte');
  });

  it('next fixture → hasUI true, detectUIFlavor "next" (precedes react)', () => {
    const dir = makeFixture('next', {
      'package.json': JSON.stringify({
        name: 'n',
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }),
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'next');
  });

  it('flutter fixture (pubspec.yaml only) → hasUI true, detectUIFlavor "flutter"', () => {
    const dir = makeFixture('flutter', {
      'pubspec.yaml': 'name: my_app\nflutter:\n  uses-material-design: true\n',
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'flutter');
  });

  it('tailwind-only fixture → hasUI true, detectUIFlavor "css-only"', () => {
    const dir = makeFixture('tailwind-only', {
      'tailwind.config.js': 'module.exports = { content: [] };\n',
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'css-only');
  });

  it('css-only fixture (.scss within depth 3) → hasUI true, detectUIFlavor "css-only"', () => {
    const dir = makeFixture('css-only', {
      'src/styles/main.scss': '$primary: #000;\nbody { color: $primary; }\n',
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'css-only');
  });

  it('no-UI fixture → hasUI false, detectUIFlavor null', () => {
    const dir = makeFixture('no-ui', {
      'package.json': JSON.stringify({
        name: 'noui',
        dependencies: { express: '^4.0.0' },
      }),
      'src/server.js': 'module.exports = {};\n',
      'README.md': '# server-only project\n',
    });
    assert.equal(hasUI(dir), false);
    assert.equal(detectUIFlavor(dir), null);
  });

  it('depth-bound — UI file at depth 4 is NOT detected (depth ≤3)', () => {
    // package.json present without UI deps → falls through to file walk.
    const dir = makeFixture('depth-bound', {
      'package.json': JSON.stringify({ name: 'd', dependencies: { express: '^4.0.0' } }),
      // depth 4: a/b/c/d/component.tsx (root=0, a=1, b=2, c=3, d=4)
      'a/b/c/d/component.tsx': 'export default () => null;\n',
    });
    assert.equal(hasUI(dir), false);
    assert.equal(detectUIFlavor(dir), null);
  });

  it('ignores node_modules / .git / dist / build / .next / .nuxt / coverage / .gsd-t', () => {
    const dir = makeFixture('ignored-dirs', {
      'package.json': JSON.stringify({ name: 'ig', dependencies: { express: '^4.0.0' } }),
      // these UI-looking files all live under ignored dirs
      'node_modules/some-pkg/index.tsx': 'x',
      '.git/objects/x.css': 'x',
      'dist/bundle.css': 'x',
      'build/output.scss': 'x',
      '.next/static/page.tsx': 'x',
      '.nuxt/dist/app.vue': 'x',
      'coverage/lcov.css': 'x',
      '.gsd-t/transcripts/x.tsx': 'x',
    });
    assert.equal(hasUI(dir), false);
    assert.equal(detectUIFlavor(dir), null);
  });

  it('never throws on missing/invalid project dir', () => {
    const missing = path.join(TMP_ROOT, 'does-not-exist');
    assert.equal(hasUI(missing), false);
    assert.equal(detectUIFlavor(missing), null);
    // bogus inputs
    assert.equal(hasUI(''), false);
    assert.equal(hasUI(null), false);
    assert.equal(detectUIFlavor(undefined), null);
  });

  it('malformed package.json falls through to file walk without throwing', () => {
    const dir = makeFixture('bad-pkg', {
      'package.json': '{ this is not valid json',
      'src/Button.jsx': 'export default () => null;\n',
    });
    assert.equal(hasUI(dir), true);
    // No framework deps detected → file walk classifies as css-only.
    assert.equal(detectUIFlavor(dir), 'css-only');
  });

  // ── Red Team regression coverage ──────────────────────────────────────────

  it('Red Team BUG-1: pubspec.yaml as a DIRECTORY is not treated as Flutter', () => {
    const dir = path.join(TMP_ROOT, 'pubspec-as-dir');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'pubspec.yaml'), { recursive: true });
    assert.equal(hasUI(dir), false);
    assert.equal(detectUIFlavor(dir), null);
  });

  it('Red Team BUG-1: tailwind.config.js as a DIRECTORY is not treated as UI', () => {
    const dir = path.join(TMP_ROOT, 'tailwind-as-dir');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'tailwind.config.js'), { recursive: true });
    assert.equal(hasUI(dir), false);
    assert.equal(detectUIFlavor(dir), null);
  });

  it('Red Team BUG-2: .storybook/main.tsx (non-listed dot-dir) IS detected', () => {
    // Contract §4 enumerates exactly 8 ignored dirs; .storybook is not one of them.
    // The previous impl skipped all dot-dirs, dropping legitimate UI code.
    const dir = makeFixture('dot-storybook', {
      'package.json': JSON.stringify({ name: 'sb', dependencies: { express: '^4.0.0' } }),
      '.storybook/main.tsx': 'export default {};\n',
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'css-only');
  });

  it('Red Team BUG-3: tailwind.config.mjs is detected (modern ESM Tailwind)', () => {
    const dir = makeFixture('tailwind-mjs', {
      'tailwind.config.mjs': 'export default { content: [] };\n',
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'css-only');
  });

  it('Red Team coverage: angular fixture → detectUIFlavor "angular"', () => {
    const dir = makeFixture('angular', {
      'package.json': JSON.stringify({
        name: 'ng',
        dependencies: { '@angular/core': '^17.0.0' },
      }),
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'angular');
  });

  it('Red Team coverage: @vue/runtime-core alias → detectUIFlavor "vue"', () => {
    const dir = makeFixture('vue-runtime', {
      'package.json': JSON.stringify({
        name: 'vrt',
        dependencies: { '@vue/runtime-core': '^3.0.0' },
      }),
    });
    assert.equal(hasUI(dir), true);
    assert.equal(detectUIFlavor(dir), 'vue');
  });
});
