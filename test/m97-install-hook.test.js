'use strict';

/**
 * M97 — graph-intercept hook installer test.
 *
 * Verifies the installer registers a PostToolUse hook with matcher "Grep" that
 * runs gsd-t-graph-intercept.js, and is idempotent.
 *
 * Uses the exported configureGraphInterceptHook against a temp settings file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadFn() {
  return require(path.join(__dirname, '..', 'bin', 'gsd-t.js')).configureGraphInterceptHook;
}

test('installer adds a Grep-matched PostToolUse hook, then is idempotent', () => {
  const fn = loadFn();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm97-install-'));
  const sp = path.join(dir, 'settings.json');
  try {
    fs.writeFileSync(sp, '{}');

    const r1 = fn(sp);
    assert.equal(r1.action, 'added');
    const s1 = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const entry = s1.hooks.PostToolUse.find((e) =>
      e.hooks.some((h) => h.command.includes('gsd-t-graph-intercept')));
    assert.ok(entry, 'a graph-intercept PostToolUse entry exists');
    assert.equal(entry.matcher, 'Grep', 'matcher targets Grep');

    const r2 = fn(sp);
    assert.equal(r2.action, 'noop', 'second run is idempotent');
    const s2 = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const count = s2.hooks.PostToolUse.filter((e) =>
      e.hooks.some((h) => h.command.includes('gsd-t-graph-intercept'))).length;
    assert.equal(count, 1, 'no duplicate hook entries');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('installer preserves existing unrelated PostToolUse hooks', () => {
  const fn = loadFn();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm97-install2-'));
  const sp = path.join(dir, 'settings.json');
  try {
    fs.writeFileSync(sp, JSON.stringify({
      hooks: { PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'other-hook' }] }] },
    }));
    fn(sp);
    const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
    assert.ok(s.hooks.PostToolUse.some((e) => e.hooks.some((h) => h.command === 'other-hook')),
      'pre-existing hook preserved');
    assert.ok(s.hooks.PostToolUse.some((e) => e.matcher === 'Grep'), 'graph-intercept added');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
