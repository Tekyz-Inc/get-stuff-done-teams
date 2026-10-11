'use strict';

/**
 * v6 red-team round 3 regressions. Every test runs against a fake HOME / project.
 *
 * The hook strings below are copied VERBATIM from a real v5 ~/.claude/settings.json
 * (the `"$HOME"/.claude/...` shape — quote closed before the path — is the one
 * the old matcher missed, leaving hooks pointing at moved scripts).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const INSTALLER = path.join(REPO, 'bin', 'gsd-t.js');
const gsdt = require(INSTALLER);
const PKG_VERSION = require(path.join(REPO, 'package.json')).version;
const R = gsdt.RETIRED_V6;

function tmp(prefix) { return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix)); }
function rm(dir) {
  try { spawnSync('chmod', ['-R', 'u+w', dir]); fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}
function write(file, body) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); }
function cli(home, args, extraEnv = {}) {
  return spawnSync('node', [INSTALLER, ...args], { env: { ...process.env, HOME: home, ...extraEnv }, encoding: 'utf8' });
}
function shipped(sentinels) { return `/**\n * ${sentinels[0]}\n */\nmodule.exports = {};\n`; }
function readSettings(home) { return JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')); }
function hookCommands(settings) {
  return Object.values(settings.hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
}
// Dangling GSD-T references as the CHILD process (HOME = home) sees them.
function dangling(home) {
  const r = spawnSync('node', ['-e', `
    const g = require(${JSON.stringify(INSTALLER)});
    const s = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    console.log(JSON.stringify(g._danglingGsdtRefs(s)));`, path.join(home, '.claude', 'settings.json')],
  { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  return JSON.parse(r.stdout);
}
function snap(dir) {
  const out = {};
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) out[p] = '->' + fs.readlinkSync(p);
      else if (st.isDirectory()) walk(p);
      else { try { out[p] = fs.readFileSync(p, 'utf8'); } catch (_) { out[p] = '<unreadable>'; } }
    }
  };
  walk(dir);
  return out;
}

// Literal hook commands from the real settings.json.
const REAL = {
  capture: 'node "$HOME"/.claude/scripts/hooks/gsd-t-conversation-capture.js',
  usage: 'node "$HOME"/.claude/scripts/hooks/gsd-t-in-session-usage-hook.js',
  ctxCue: 'bash "$HOME"/.claude/scripts/hooks/gsd-t-ctx-cue.sh',
  heartbeat: 'node "$HOME/.claude/scripts/gsd-t-heartbeat.js"',
  probe: 'node "$HOME/.claude/scripts/gsd-t-in-session-probe.js"',
  compact: 'bash -c \'[ -f "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-compact-detector.js" ] && node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-compact-detector.js" || true\'',
  oversight: 'bash -c \'[ -f "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-architect-oversight-guard.js" ] && node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-architect-oversight-guard.js" || true\'',
  autoRoute: 'node "$HOME/.claude/scripts/gsd-t-auto-route.js"',
  updateCheck: 'node "$HOME/.claude/scripts/gsd-t-update-check.js"',
  dateGuard: 'node "$HOME/.claude/scripts/gsd-t-date-guard.js"',
  boardNotify: 'node "$HOME/.claude/scripts/gsd-t-board-notify.js" Stop',
  streamGuard: 'node "$HOME/.claude/scripts/hooks/gsd-t-claude-p-stream-json-guard.js"',
  ping: 'afplay /System/Library/Sounds/Ping.aiff',
};

function realShapedHome(extraSettings = {}) {
  const home = tmp('gsdt-rt3-');
  const C = path.join(home, '.claude');
  const S = path.join(C, 'scripts');
  write(path.join(S, 'hooks', 'gsd-t-conversation-capture.js'), shipped(R.scripts['hooks/gsd-t-conversation-capture.js']));
  write(path.join(S, 'hooks', 'gsd-t-in-session-usage-hook.js'), shipped(R.scripts['hooks/gsd-t-in-session-usage-hook.js']));
  write(path.join(S, 'hooks', 'gsd-t-ctx-cue.sh'), R.scripts['hooks/gsd-t-ctx-cue.sh'][0] + '\n');
  write(path.join(S, 'gsd-t-heartbeat.js'), shipped(R.scripts['gsd-t-heartbeat.js']));
  write(path.join(S, 'gsd-t-in-session-probe.js'), shipped(R.scripts['gsd-t-in-session-probe.js']));
  write(path.join(S, 'gsd-t-board-notify.js'), '// mine\n');
  write(path.join(S, 'hooks', 'gsd-t-claude-p-stream-json-guard.js'), '// mine\n');
  const g = (cmd, matcher = '') => ({ matcher, hooks: [{ type: 'command', command: cmd }] });
  const settings = {
    hooks: {
      Notification: [g(REAL.ping), g(REAL.heartbeat)],
      PostToolUse: [g(REAL.heartbeat), g(REAL.probe)],
      PreToolUse: [g(REAL.dateGuard, 'Write|Edit'), g(REAL.oversight, 'Write|Edit'), g(REAL.streamGuard, 'Bash')],
      SessionStart: [g(REAL.updateCheck), g(REAL.compact), g(REAL.capture)],
      Stop: [g(REAL.heartbeat), g(REAL.probe), g(REAL.capture), g(REAL.usage), g(REAL.boardNotify), g(REAL.ctxCue)],
      UserPromptSubmit: [g(REAL.autoRoute), g('node "$HOME"/.claude/scripts/gsd-t-auto-route.js'), g(REAL.capture)],
    },
    ...extraSettings,
  };
  write(path.join(C, 'settings.json'), JSON.stringify(settings, null, 2));
  return home;
}

test('RT3 BUG-1: "$HOME"/.claude hook spellings are matched — retired hooks removed, no dangling reference, no duplicate', () => {
  const home = realShapedHome();
  try {
    const r = cli(home, ['install']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const cmds = hookCommands(readSettings(home));
    for (const k of ['capture', 'usage', 'ctxCue', 'heartbeat', 'probe', 'compact', 'oversight']) {
      assert.ok(!cmds.includes(REAL[k]), `retired hook removed: ${REAL[k]}`);
    }
    assert.equal(cmds.filter((c) => c.includes('gsd-t-auto-route')).length, 1, 'auto-route registered exactly once');
    assert.equal(cmds.filter((c) => c.includes('gsd-t-update-check')).length, 1, 'update-check registered exactly once');
    for (const k of ['ping', 'boardNotify', 'streamGuard']) assert.ok(cmds.includes(REAL[k]), `user hook kept: ${REAL[k]}`);
    assert.deepEqual(dangling(home), [], 'INVARIANT: no hook names a GSD-T script that does not exist');
    const first = fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8');
    assert.equal(cli(home, ['install']).status, 0);
    assert.equal(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'), first, 'second run is byte-identical');
  } finally { rm(home); }
});

test('RT3 BUG-1: normalization covers ~, $HOME, ${HOME}, "$HOME", absolute home and the npm-root wrapper; a user path is not ours', () => {
  const home = tmp('gsdt-rt3n-');
  try {
    const r = spawnSync('node', ['-e', `
      const g = require(${JSON.stringify(INSTALLER)});
      const cmds = [
        'node "$HOME"/.claude/scripts/hooks/gsd-t-conversation-capture.js',
        'node ~/.claude/scripts/hooks/gsd-t-conversation-capture.js',
        'node \${HOME}/.claude/scripts/hooks/gsd-t-conversation-capture.js',
        'node "\${HOME}/.claude/scripts/hooks/gsd-t-conversation-capture.js"',
        "node '" + process.env.HOME + "/.claude/scripts/hooks/gsd-t-conversation-capture.js'",
        'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-conversation-capture.js"',
        'node /Users/someone/repo/scripts/hooks/gsd-t-conversation-capture.js',
      ];
      console.log(JSON.stringify(cmds.map((c) => g._gsdtScriptRefs(c).map((x) => x.name))));`],
    { env: { ...process.env, HOME: home }, encoding: 'utf8' });
    const names = JSON.parse(r.stdout);
    for (let i = 0; i < 6; i++) assert.deepEqual(names[i], ['gsd-t-conversation-capture'], `spelling ${i}`);
    assert.deepEqual(names[6], [], 'a script in the user\'s own folder is not a GSD-T reference');
  } finally { rm(home); }
});

test('RT3 INVARIANT: a hook that would point at a script being retired HALTS before any change', () => {
  const home = realShapedHome();
  try {
    write(path.join(home, '.claude', 'scripts', 'gsd-t-event-writer.js'), shipped(R.scripts['gsd-t-event-writer.js']));
    const s = readSettings(home);
    s.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: 'node "$HOME"/.claude/scripts/gsd-t-event-writer.js' }] });
    write(path.join(home, '.claude', 'settings.json'), JSON.stringify(s, null, 2));
    const before = snap(home);
    const r = cli(home, ['install']);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /HALT: this run would leave settings\.json pointing at GSD-T script/);
    assert.match(r.stdout + r.stderr, /gsd-t-event-writer\.js is about to be retired/);
    assert.deepEqual(snap(home), before, 'nothing changed');
  } finally { rm(home); }
});

test('RT3 BUG-2 (6.1.11): a status line naming the retired script or ours, in any spelling, ends on the current GSD-T status line; a user\'s own script is kept', () => {
  for (const cmd of ['bash ~/.claude/statusline-command.sh', 'bash "$HOME"/.claude/statusline-command.sh',
    'node "$HOME/.claude/scripts/gsd-t-statusline.js"']) {
    const home = realShapedHome({ statusLine: { type: 'command', command: cmd } });
    try {
      write(path.join(home, '.claude', 'statusline-command.sh'), '#!/bin/bash\n# Claude Code status line — GSD-T project status bar  (old copy)\n');
      write(path.join(home, '.claude', 'scripts', 'gsd-t-statusline.js'), shipped(R.scripts['gsd-t-statusline.js']));
      const r = cli(home, ['install']);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      const dest = path.join(fs.realpathSync(path.join(home, '.claude')), 'statusline-command.sh');
      assert.equal(readSettings(home).statusLine.command, `bash ${dest}`, `current status line: ${cmd}`);
      assert.equal(fs.readFileSync(dest, 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'scripts', 'statusline-command.sh'), 'utf8'));
      assert.deepEqual(dangling(home), []);
    } finally { rm(home); }
  }
  const home = realShapedHome({ statusLine: { type: 'command', command: 'bash ~/.claude/statusline-command.sh' } });
  try {
    write(path.join(home, '.claude', 'statusline-command.sh'), '#!/bin/bash\necho my own bar\n');
    assert.equal(cli(home, ['install']).status, 0);
    assert.equal(readSettings(home).statusLine.command, 'bash ~/.claude/statusline-command.sh', 'user setting kept');
    assert.equal(fs.readFileSync(path.join(home, '.claude', 'statusline-command.sh'), 'utf8'), '#!/bin/bash\necho my own bar\n', 'user script kept');
  } finally { rm(home); }
});

test('6.1.11: a custom status line pointing elsewhere is never replaced; install is idempotent', () => {
  const home = realShapedHome({ statusLine: { type: 'command', command: 'bash /opt/mine/bar.sh' } });
  try {
    assert.equal(cli(home, ['install']).status, 0);
    assert.equal(readSettings(home).statusLine.command, 'bash /opt/mine/bar.sh');
  } finally { rm(home); }
  const fresh = realShapedHome({});
  try {
    assert.equal(cli(fresh, ['install']).status, 0);
    const first = fs.readFileSync(path.join(fresh, '.claude', 'settings.json'), 'utf8');
    assert.match(first, /statusline-command\.sh/);
    assert.equal(cli(fresh, ['install']).status, 0);
    assert.equal(fs.readFileSync(path.join(fresh, '.claude', 'settings.json'), 'utf8'), first, 'second run byte-identical');
  } finally { rm(fresh); }
});

function updateAllHome(projects) {
  const home = tmp('gsdt-rt3u-');
  write(path.join(home, '.claude', '.gsd-t-version'), PKG_VERSION);
  write(path.join(home, '.claude', '.gsd-t-projects'), projects.join('\n') + '\n');
  return home;
}

test('RT3 BUG-3: a failed project write (read-only CLAUDE.md) fails update-all non-zero; the project gets no health phase', () => {
  const proj = tmp('gsdt-rt3p-');
  const home = updateAllHome([proj]);
  try {
    write(path.join(proj, 'CLAUDE.md'), '# proj\n');
    write(path.join(proj, '.gsd-t', 'graph.db'), 'legacy store');
    fs.chmodSync(path.join(proj, 'CLAUDE.md'), 0o444);
    const r = cli(home, ['update-all'], { GSDT_POST_UPGRADE: '1' });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /HALTED: failed to update .*CLAUDE\.md/);
    assert.match(r.stdout + r.stderr, /update-all FAILED for 1 project/);
    assert.ok(fs.existsSync(path.join(proj, '.gsd-t', 'graph.db')), 'halted project: legacy graph NOT moved');
  } finally { rm(home); rm(proj); }
});

test('RT3 BUG-3: a symlinked project CLAUDE.md halts that project before ANY change (bin/ untouched)', () => {
  const proj = tmp('gsdt-rt3s-');
  const out = tmp('gsdt-rt3o-');
  const home = updateAllHome([proj]);
  try {
    write(path.join(out, 'CLAUDE.md'), '# shared\n');
    fs.symlinkSync(path.join(out, 'CLAUDE.md'), path.join(proj, 'CLAUDE.md'));
    const before = snap(proj);
    const r = cli(home, ['update-all'], { GSDT_POST_UPGRADE: '1' });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /is a symlink/);
    assert.deepEqual(snap(proj), before, 'nothing in the project changed');
    assert.equal(fs.readFileSync(path.join(out, 'CLAUDE.md'), 'utf8'), '# shared\n');
  } finally { rm(home); rm(proj); rm(out); }
});

test('RT3 BUG-4: ~/.claude itself a symlink — fresh install succeeds into the real folder, no "Refusing"', () => {
  const home = tmp('gsdt-rt3l-');
  const real = tmp('gsdt-rt3real-');
  try {
    fs.symlinkSync(real, path.join(home, '.claude'));
    const r = cli(home, ['install']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, /Refusing/);
    assert.ok(fs.existsSync(path.join(real, 'commands', 'gsd-t-init.md')), 'commands/ created in the real folder');
    assert.ok(fs.lstatSync(path.join(home, '.claude')).isSymbolicLink(), 'the link itself is left as the user made it');
    assert.equal(cli(home, ['install']).status, 0, 'second run with dirs present');
  } finally { rm(home); rm(real); }
});

test('RT3 BUG-4: a link BELOW the real root still halts (Refusing never continues)', () => {
  const home = tmp('gsdt-rt3b-');
  const elsewhere = tmp('gsdt-rt3e-');
  try {
    fs.mkdirSync(path.join(home, '.claude'));
    fs.symlinkSync(elsewhere, path.join(home, '.claude', 'commands'));
    const r = cli(home, ['install']);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /HALT: .*commands is a symlink/);
    assert.deepEqual(fs.readdirSync(elsewhere), [], 'nothing written through the link');
  } finally { rm(home); rm(elsewhere); }
});

test('RT3 LOW: the command header counts only as the FIRST line', () => {
  const home = tmp('gsdt-rt3h-');
  const C = path.join(home, '.claude', 'commands');
  try {
    write(path.join(C, 'gsd-t-wave.md'), '# My wave notes\n\nCopied from GSD-T:\n# GSD-T: Wave\n');
    assert.equal(cli(home, ['install']).status, 0);
    assert.ok(fs.existsSync(path.join(C, 'gsd-t-wave.md')), 'header not on line 1 → not ours, left in place');
  } finally { rm(home); }
});

test('RT3 LOW: a failed move (EXDEV) removes the backup folder it created and prints a fix', () => {
  const root = tmp('gsdt-rt3x-');
  const orig = fs.renameSync;
  try {
    write(path.join(root, 'bin', 'gsd-t-verify-gate.cjs'), shipped(R.bin['gsd-t-verify-gate.cjs']));
    fs.renameSync = () => { const e = new Error('cross-device link not permitted'); e.code = 'EXDEV'; throw e; };
    assert.throws(() => gsdt._retireShippedFile(root, 'bin/gsd-t-verify-gate.cjs', R.bin['gsd-t-verify-gate.cjs'], '.gsd-t/retired/2026-01-01'),
      /different disk than the backup folder[\s\S]*Fix|Fix:[\s\S]*/);
    fs.renameSync = orig;
    assert.equal(fs.existsSync(path.join(root, '.gsd-t')), false, 'empty backup folders removed');
    assert.ok(fs.existsSync(path.join(root, 'bin', 'gsd-t-verify-gate.cjs')), 'file untouched');
  } finally { fs.renameSync = orig; rm(root); }
});

test('RT3 LOW: appending the GSD-T section to an unmarked CLAUDE.md writes a backup first', () => {
  const home = tmp('gsdt-rt3a-');
  const md = path.join(home, '.claude', 'CLAUDE.md');
  try {
    write(md, '# My rules\n\nBe nice.\n');
    assert.equal(cli(home, ['install']).status, 0);
    const backups = fs.readdirSync(path.dirname(md)).filter((f) => f.startsWith('CLAUDE.md.backup-'));
    assert.equal(backups.length, 1);
    assert.equal(fs.readFileSync(path.join(path.dirname(md), backups[0]), 'utf8'), '# My rules\n\nBe nice.\n');
    assert.match(fs.readFileSync(md, 'utf8'), /^# My rules\n\nBe nice\.\n\n/);
  } finally { rm(home); }
});
