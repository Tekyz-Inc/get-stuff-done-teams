'use strict';

/**
 * M107 retired (v5.11.15) — the reply shortener is gone.
 *
 * It shortened a reply AFTER it was written, and a Stop hook cannot unsay what
 * is already on screen: David read the long version, then the short one. It
 * cost a whole extra turn, and its instruction was misread often enough to
 * print a third copy. The Reader Contract, injected before every turn, does the
 * same job for free and in the only place it can work — before the words exist.
 *
 * Retiring it in the package is not enough. It keeps firing on every machine
 * that already installed it, and the installer is the only thing that reaches
 * them, so installing must REMOVE it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const INSTALLER = path.join(REPO, 'bin', 'gsd-t.js');

function probeHome(settings) {
  const home = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-test-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  if (settings) {
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify(settings, null, 2));
  }
  return home;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

test('the rewriter files are gone from the package', () => {
  assert.equal(fs.existsSync(path.join(REPO, 'scripts', 'gsd-t-concise-hook.js')), false);
  assert.equal(fs.existsSync(path.join(REPO, 'bin', 'gsd-t-concise-rewrite.cjs')), false);
});

test('the rewriter no longer propagates to projects or globally', () => {
  const src = fs.readFileSync(INSTALLER, 'utf8');
  assert.ok(!/"gsd-t-concise-rewrite\.cjs"/.test(src),
    'a tool that no longer exists must not be listed for copying');
});

test('installing REMOVES the hook from a machine that still has it', () => {
  // The whole point of the retirement: 32 machines were running it.
  const home = probeHome({
    hooks: {
      Stop: [{
        matcher: '*',
        hooks: [
          { type: 'command', command: 'bash -c \'node ~/.claude/scripts/gsd-t-concise-hook.js\'' },
          { type: 'command', command: 'echo unrelated-hook' },
        ],
      }],
    },
  });
  try {
    execFileSync('node', [INSTALLER, 'install'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: 'pipe',
    });
    const after = fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8');
    assert.ok(!/concise-hook/.test(after), 'the retired hook must be deleted');
    assert.match(after, /unrelated-hook/, 'and every other hook must survive untouched');
  } finally { rm(home); }
});

test('the removal is named, never silent', () => {
  const home = probeHome({
    hooks: { Stop: [{ matcher: '*', hooks: [
      { type: 'command', command: 'node ~/.claude/scripts/gsd-t-concise-hook.js' },
    ] }] },
  });
  try {
    const out = execFileSync('node', [INSTALLER, 'install'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: 'pipe',
    });
    assert.match(out, /Concise-rewrite hook removed/i);
  } finally { rm(home); }
});

test('installing never re-adds it', () => {
  const home = probeHome();
  try {
    execFileSync('node', [INSTALLER, 'install'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: 'pipe',
    });
    const s = path.join(home, '.claude', 'settings.json');
    if (fs.existsSync(s)) {
      assert.ok(!/concise-hook/.test(fs.readFileSync(s, 'utf8')),
        'a fresh install must not carry the retired hook');
    }
  } finally { rm(home); }
});

test('the marker survives, because removal needs it', () => {
  // Deleting the name would leave the hook running wherever it is installed.
  const src = fs.readFileSync(INSTALLER, 'utf8');
  assert.match(src, /CONCISE_HOOK_MARKER/, 'the marker is how a stale hook is found');
  assert.match(src, /removeConciseHook/, 'and removal must be wired into install');
});
