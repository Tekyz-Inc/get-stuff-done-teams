'use strict';
/**
 * M56 D4 — Quick + Debug wire-in marker tests
 *
 * Asserts that commands/gsd-t-quick.md and commands/gsd-t-debug.md Step 1
 * carry a `<!-- M56-D4: preflight + brief + verify-gate wire-in -->` block
 * containing canonical preflight + brief + verify-gate invocations.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const projectDir = path.resolve(__dirname, '..');

function readCommandFile(relPath) {
  return fs.readFileSync(path.join(projectDir, relPath), 'utf8');
}

const QUICK = readCommandFile('commands/gsd-t-quick.md');
const DEBUG = readCommandFile('commands/gsd-t-debug.md');

const OPEN = '<!-- M56-D4: preflight + brief + verify-gate wire-in -->';
const CLOSE = '<!-- /M56-D4: preflight + brief + verify-gate wire-in -->';

test('quick.md carries M56-D4 marker block (open + close)', () => {
  assert.ok(QUICK.includes(OPEN), 'quick.md should contain M56-D4 open marker');
  assert.ok(QUICK.includes(CLOSE), 'quick.md should contain M56-D4 close marker');
});

test('debug.md carries M56-D4 marker block (open + close)', () => {
  assert.ok(DEBUG.includes(OPEN), 'debug.md should contain M56-D4 open marker');
  assert.ok(DEBUG.includes(CLOSE), 'debug.md should contain M56-D4 close marker');
});

test('quick.md M56-D4 block invokes preflight with hard-fail on exit 4', () => {
  const block = QUICK.slice(QUICK.indexOf(OPEN), QUICK.indexOf(CLOSE));
  assert.ok(/gsd-t preflight --json/.test(block), 'quick.md block should call gsd-t preflight --json');
  assert.ok(/exit 4/.test(block), 'quick.md block should hard-fail on exit 4');
});

test('debug.md M56-D4 block invokes preflight with hard-fail on exit 4', () => {
  const block = DEBUG.slice(DEBUG.indexOf(OPEN), DEBUG.indexOf(CLOSE));
  assert.ok(/gsd-t preflight --json/.test(block), 'debug.md block should call gsd-t preflight --json');
  assert.ok(/exit 4/.test(block), 'debug.md block should hard-fail on exit 4');
});

test('quick.md M56-D4 block invokes brief with kind=quick', () => {
  const block = QUICK.slice(QUICK.indexOf(OPEN), QUICK.indexOf(CLOSE));
  assert.ok(/gsd-t brief --kind quick/.test(block), 'quick.md block should call gsd-t brief --kind quick');
  assert.ok(/BRIEF_PATH=/.test(block), 'quick.md block should export BRIEF_PATH');
});

test('debug.md M56-D4 block invokes brief with kind=debug', () => {
  const block = DEBUG.slice(DEBUG.indexOf(OPEN), DEBUG.indexOf(CLOSE));
  assert.ok(/gsd-t brief --kind debug/.test(block), 'debug.md block should call gsd-t brief --kind debug');
  assert.ok(/BRIEF_PATH=/.test(block), 'debug.md block should export BRIEF_PATH');
});
