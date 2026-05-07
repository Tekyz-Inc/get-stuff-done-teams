'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'journey-coverage-cli.cjs');

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-cli-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gsd-t'), { recursive: true });
  return root;
}

function runCli(projectDir, ...args) {
  return spawnSync('node', [CLI, '--project-dir', projectDir, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
  });
}

test('M52 D1 CLI: vacuous-pass empty manifest with no viewer files exits 0', () => {
  const root = mkProject();
  fs.writeFileSync(path.join(root, '.gsd-t', 'journey-manifest.json'),
    JSON.stringify({ version: '0.1.0', specs: [] }, null, 2));
  const r = runCli(root);
  assert.equal(r.status, 0, 'expected exit 0; got status=' + r.status + ' stderr=' + r.stderr);
  assert.match(r.stdout, /^OK:/);
});

test('M52 D1 CLI: gap exits 4 with formatted GAP report on stderr', () => {
  const root = mkProject();
  fs.writeFileSync(path.join(root, 'scripts', 'gsd-t-transcript.html'),
    `<script>splitter.addEventListener('mousedown', () => {});</script>`);
  fs.writeFileSync(path.join(root, '.gsd-t', 'journey-manifest.json'),
    JSON.stringify({ version: '0.1.0', specs: [] }, null, 2));
  const r = runCli(root);
  assert.equal(r.status, 4, 'expected exit 4 for gap; got status=' + r.status + ' stdout=' + r.stdout + ' stderr=' + r.stderr);
  assert.match(r.stderr, /^GAP: scripts\/gsd-t-transcript\.html:1\s+splitter:mousedown\s+\(addEventListener\)/m);
});

test('M52 D1 CLI: --staged-only with no staged viewer files is silent pass exit 0', () => {
  const root = mkProject();
  execSync('git init -q', { cwd: root });
  // Stage a non-viewer file so git diff --cached is non-empty but contains no viewer paths
  fs.writeFileSync(path.join(root, 'README.md'), '# test\n');
  execSync('git add README.md', { cwd: root });
  const r = runCli(root, '--staged-only', '--quiet');
  assert.equal(r.status, 0, 'expected exit 0; got status=' + r.status + ' stderr=' + r.stderr);
  // --quiet should suppress stdout
  assert.equal(r.stdout, '');
});

test('M52 D1 CLI: --manifest PATH reads from custom location', () => {
  const root = mkProject();
  fs.writeFileSync(path.join(root, 'scripts', 'gsd-t-transcript.html'),
    `<script>splitter.addEventListener('mousedown', () => {});</script>`);
  const customManifest = path.join(root, 'custom-manifest.json');
  fs.writeFileSync(customManifest, JSON.stringify({
    version: '0.1.0',
    specs: [{
      name: 'splitter-drag', spec: 'e2e/journeys/splitter-drag.spec.ts',
      covers: [{ file: 'scripts/gsd-t-transcript.html', selector: 'splitter:mousedown', kind: 'addEventListener' }],
    }],
  }, null, 2));
  const r = runCli(root, '--manifest', 'custom-manifest.json');
  assert.equal(r.status, 0, 'expected exit 0; got status=' + r.status + ' stdout=' + r.stdout + ' stderr=' + r.stderr);
  assert.match(r.stdout, /1 listeners, 1 specs/);
});

test('M52 D1 CLI: missing manifest with detected listeners exits 2 with hint', () => {
  const root = mkProject();
  fs.writeFileSync(path.join(root, 'scripts', 'gsd-t-transcript.html'),
    `<script>splitter.addEventListener('mousedown', () => {});</script>`);
  // No manifest at all
  const r = runCli(root);
  assert.equal(r.status, 2, 'expected exit 2 for missing manifest with listeners; got status=' + r.status + ' stderr=' + r.stderr);
  assert.match(r.stderr, /manifest missing/);
  assert.match(r.stderr, /hint:/);
});
