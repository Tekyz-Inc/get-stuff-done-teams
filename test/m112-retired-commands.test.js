'use strict';

/**
 * M112 — a retired command must stop being typeable.
 *
 * Installing only ever copied, so a command retired in a past milestone stayed
 * in ~/.claude/commands/ forever. Eleven were still typeable long after the
 * code behind them was deleted (brainstorm, discuss and prompt in M38; the
 * unattended trio and visualize in M61). That is how `/gsd-t-brainstorm` came
 * to be treated as a live command months after it was removed.
 *
 * v6: a retired command is MOVED to ~/.claude/.gsd-t-retired/<date>/commands/
 * (never deleted), and only when it carries the "# GSD-T: " header every
 * shipped version opened with.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const INSTALLER = path.join(REPO, 'bin', 'gsd-t.js');

// The installer refuses a path with a symlinked component, and /tmp is a
// symlink on macOS — so the probe home lives beside the repo instead.
function probeHome() {
  const home = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-test-'));
  fs.mkdirSync(path.join(home, '.claude', 'commands'), { recursive: true });
  return home;
}
function backup(home, name) {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return path.join(home, '.claude', '.gsd-t-retired', day, 'commands', name);
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

test('M112: a retired GSD-T command is moved to the backup on install', () => {
  const home = probeHome();
  const cmds = path.join(home, '.claude', 'commands');
  try {
    fs.writeFileSync(path.join(cmds, 'gsd-t-brainstorm.md'), '# GSD-T: Brainstorm (retired in M38)\n');
    execFileSync('node', [INSTALLER, 'install'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: 'pipe',
    });
    assert.equal(
      fs.existsSync(path.join(cmds, 'gsd-t-brainstorm.md')), false,
      'a command the package no longer ships must not stay typeable'
    );
    assert.ok(fs.existsSync(backup(home, 'gsd-t-brainstorm.md')), 'moved, not deleted');
  } finally { rm(home); }
});

test('M112: the removal is NAMED, never silent', () => {
  const home = probeHome();
  try {
    fs.writeFileSync(path.join(home, '.claude', 'commands', 'gsd-t-visualize.md'), '# GSD-T: Visualize (retired in M61)\n');
    const out = execFileSync('node', [INSTALLER, 'install'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: 'pipe',
    });
    assert.match(out, /Moved 1 retired file\(s\) to ~\/\.claude\/\.gsd-t-retired\//, 'the install must say what it moved, and where');
    assert.ok(fs.existsSync(backup(home, 'gsd-t-visualize.md')), 'the command is in the named backup folder');
  } finally { rm(home); }
});

test("M112: a command the user wrote is never touched", () => {
  // Only `gsd-t-*.md` is ever considered. Deleting someone's own command
  // because the package does not ship it would be far worse than staleness.
  const home = probeHome();
  const cmds = path.join(home, '.claude', 'commands');
  try {
    fs.writeFileSync(path.join(cmds, 'my-own-command.md'), '# mine\n');
    fs.writeFileSync(path.join(cmds, 'deploy.md'), '# also mine\n');
    fs.writeFileSync(path.join(cmds, 'gsd-t-brainstorm.md'), '# GSD-T: Brainstorm\n');
    fs.writeFileSync(path.join(cmds, 'gsd-t-discuss.md'), '# my own discuss notes — no GSD-T header\n');

    execFileSync('node', [INSTALLER, 'install'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: 'pipe',
    });

    assert.ok(fs.existsSync(path.join(cmds, 'my-own-command.md')), "the user's own command must survive");
    assert.ok(fs.existsSync(path.join(cmds, 'deploy.md')), "a command without the prefix must survive");
    assert.equal(fs.existsSync(path.join(cmds, 'gsd-t-brainstorm.md')), false, 'the retired one still goes');
    assert.ok(fs.existsSync(path.join(cmds, 'gsd-t-discuss.md')), 'a v5 name without the GSD-T header is not ours');
  } finally { rm(home); }
});

test('M112: a shipped command is never mistaken for retired', () => {
  const home = probeHome();
  try {
    execFileSync('node', [INSTALLER, 'install'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: 'pipe',
    });
    const cmds = path.join(home, '.claude', 'commands');
    for (const live of ['gsd-t-scan.md', 'gsd-t-debug.md', 'gsd-t-architect.md']) {
      assert.ok(fs.existsSync(path.join(cmds, live)), `${live} ships and must be installed`);
    }
  } finally { rm(home); }
});

// ── The docs must not advertise a command that does not exist ────────────────

test('M112: README advertises no command the package does not ship', () => {
  // README listed /gsd-t-brainstorm as live for months after M38 deleted it,
  // while help.md correctly called it retired — the two disagreed, and the
  // README is what a reader believes.
  const readme = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8');
  const advertised = new Set(
    [...readme.matchAll(/`\/(gsd-t-[a-z-]+)`/g)].map((m) => m[1])
  );

  const stale = [...advertised].filter((c) => {
    if (!fs.existsSync(path.join(REPO, 'commands', `${c}.md`))) {
      // A mention that explicitly says the command was retired is correct and
      // useful — it answers the reader who remembers it.
      const line = readme.split('\n').find((l) => l.includes('`/' + c + '`')) || '';
      return !/retired|removed|replaced by/i.test(line);
    }
    return false;
  });

  assert.deepEqual(stale, [], `README advertises commands that do not exist: ${stale.join(', ')}`);
});
