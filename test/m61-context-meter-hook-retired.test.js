'use strict';

/**
 * Context meter retired (M61) — the script was deleted, the hook was not.
 *
 * M61 removed scripts/gsd-t-context-meter.js and unwired the subsystem from
 * init() and doctor(), because native /context replaced it. install() was
 * missed: it kept calling configureContextMeterHooks() on every run, so every
 * machine carried a PostToolUse hook matching "*" that pointed at a file the
 * package no longer ships.
 *
 * It never errored — the command is guarded with `[ -f … ] && … || true`, so it
 * exits clean. That is exactly why it survived: it spawned a bash + `npm root -g`
 * subprocess on EVERY tool call to look for a file that was never coming back,
 * and nothing ever complained.
 *
 * Dropping the registration is not enough on its own. A machine that installed
 * the hook once keeps running it forever out of its own settings.json, and the
 * installer is the only thing that reaches those machines — so installing must
 * actively REMOVE it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const INSTALLER = path.join(REPO, 'bin', 'gsd-t.js');
const { removeRetiredHooks } = require(INSTALLER);

// The exact command M61-era installs wrote into settings.json.
const LIVE_COMMAND =
  'bash -c \'[ -f "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-context-meter.js" ] && node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-context-meter.js" || true\'';

function tmpSettings(settings) {
  const dir = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-test-'));
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  return { dir, file };
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

test('the context meter script is gone from the package', () => {
  assert.equal(
    fs.existsSync(path.join(REPO, 'scripts', 'gsd-t-context-meter.js')), false,
    'the hook target was deleted in M61 and must not come back',
  );
});

test('install() no longer re-registers the retired hook', () => {
  const src = fs.readFileSync(INSTALLER, 'utf8');
  // The function still exists and is exported for the uninstall path; what must
  // not exist is a live call that puts the hook back on every install.
  const calls = src.split('\n').filter(
    (l) => /configureContextMeterHooks\(/.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/^function /.test(l),
  );
  assert.deepEqual(calls.map((l) => l.trim()), [],
    'a call to configureContextMeterHooks() would re-add a hook pointing at a deleted script',
  );
});

test('installing REMOVES the hook from a machine that still has it', () => {
  const { dir, file } = tmpSettings({
    hooks: {
      PostToolUse: [
        { matcher: '*', hooks: [{ type: 'command', command: LIVE_COMMAND }] },
        { matcher: 'Read', hooks: [{ type: 'command', command: 'node gsd-t-read-intercept.js' }] },
      ],
    },
  });
  try {
    assert.equal(removeRetiredHooks(file).removed, 1);
    const after = read(file);
    const commands = JSON.stringify(after);
    assert.ok(!commands.includes('gsd-t-context-meter'), 'the retired hook must be gone');
    // The group it lived in held nothing else, so the empty group goes too —
    // but the unrelated group must survive untouched.
    assert.equal(after.hooks.PostToolUse.length, 1);
    assert.ok(commands.includes('gsd-t-read-intercept'), 'unrelated hooks must survive');
  } finally { rm(dir); }
});

test('a hook sharing a group with live hooks is excised, not the group', () => {
  // Settings written by hand often group several commands together; removing
  // the group would take working hooks with it.
  const { dir, file } = tmpSettings({
    hooks: {
      PostToolUse: [{
        matcher: '*',
        hooks: [
          { type: 'command', command: 'node keep-me-before.js' },
          { type: 'command', command: LIVE_COMMAND },
          { type: 'command', command: 'node keep-me-after.js' },
        ],
      }],
    },
  });
  try {
    assert.equal(removeRetiredHooks(file).removed, 1);
    const group = read(file).hooks.PostToolUse[0];
    assert.deepEqual(group.hooks.map((h) => h.command), [
      'node keep-me-before.js',
      'node keep-me-after.js',
    ]);
    assert.equal(group.matcher, '*', 'the surviving group keeps its matcher');
  } finally { rm(dir); }
});

test('removal is idempotent — a second install finds nothing to do', () => {
  const { dir, file } = tmpSettings({
    hooks: { PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: LIVE_COMMAND }] }] },
  });
  try {
    assert.equal(removeRetiredHooks(file).removed, 1);
    assert.equal(removeRetiredHooks(file).removed, 0);
  } finally { rm(dir); }
});

test('the worktree guard stays retired alongside it', () => {
  // Adding a second marker must not displace the first.
  const { dir, file } = tmpSettings({
    hooks: {
      PreToolUse: [{
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: 'node scripts/gsd-t-worktree-guard.js' },
          { type: 'command', command: LIVE_COMMAND },
          { type: 'command', command: 'node scripts/gsd-t-date-guard.js' },
        ],
      }],
    },
  });
  try {
    assert.equal(removeRetiredHooks(file).removed, 2);
    const commands = JSON.stringify(read(file));
    assert.ok(commands.includes('gsd-t-date-guard'), 'a live guard must survive');
    assert.ok(!commands.includes('gsd-t-worktree-guard'));
    assert.ok(!commands.includes('gsd-t-context-meter'));
  } finally { rm(dir); }
});
