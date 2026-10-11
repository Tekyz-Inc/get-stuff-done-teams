'use strict';

/**
 * v6 retirement — MOVE, NEVER DELETE (round-2 red-team regressions).
 *
 * Two red-team rounds on a delete-based cleanup did not converge, so every
 * retired file is now MOVED to a dated backup folder; symlinks, malformed
 * settings.json and malformed CLAUDE.md markers HALT before any change; a
 * failed copy or move halts without advancing the version; GSD-T touches only
 * hooks it installed. Every test runs against a fake HOME / project.
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
  return spawnSync('node', [INSTALLER, ...args], {
    env: { ...process.env, HOME: home, ...extraEnv }, encoding: 'utf8',
  });
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shipped(sentinels) { return `/**\n * ${sentinels[0]}\n */\nmodule.exports = {};\n`; }
function hookCommands(settings) {
  return Object.values(settings.hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
}
// A snapshot of every file under dir (path → content), to prove "nothing changed".
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
const RETIRED_HOME = (home) => path.join(home, '.claude', '.gsd-t-retired', today());

test('R2-1: a v5-named command is moved only with the GSD-T header; permissions kept', () => {
  const home = tmp('gsdt-r1-');
  const C = path.join(home, '.claude', 'commands');
  try {
    write(path.join(C, 'gsd-t-discuss.md'), '# My own discuss notes\n');           // user file, v5 name
    write(path.join(C, 'gsd-t-wave.md'), '# GSD-T: Wave — Full Cycle\n\nbody\n');  // shipped by v5
    fs.chmodSync(path.join(C, 'gsd-t-wave.md'), 0o640);
    write(path.join(C, 'gsd-t.md'), '# GSD-T: Smart Router\n\nYou are the GSD-T smart router.\n');
    const r = cli(home, ['install']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(fs.existsSync(path.join(C, 'gsd-t-discuss.md')), 'a file without the GSD-T header stays');
    assert.equal(fs.existsSync(path.join(C, 'gsd-t-wave.md')), false);
    const backup = path.join(RETIRED_HOME(home), 'commands', 'gsd-t-wave.md');
    assert.equal(fs.readFileSync(backup, 'utf8'), '# GSD-T: Wave — Full Cycle\n\nbody\n', 'moved, not deleted');
    assert.equal(fs.statSync(backup).mode & 0o777, 0o640, 'permissions preserved');
    assert.ok(fs.existsSync(path.join(RETIRED_HOME(home), 'commands', 'gsd-t.md')), 'LOW: the old gsd-t.md router is moved');
    assert.match(r.stdout, /Moved \d+ retired file\(s\) to ~\/\.claude\/\.gsd-t-retired\/\d{4}-\d{2}-\d{2}\//);
  } finally { rm(home); }
});

test('R2-2: malformed CLAUDE.md markers halt before any change', () => {
  const S = '<!-- GSD-T:START x -->', E = '<!-- GSD-T:END x -->';
  const cases = {
    'end-before-start': `# mine\n${E}\nmid\n${S}\n`,
    'start-without-end': `# mine\n${S}\nold\nmine after\n`,
    'end-without-start': `# mine\n${E}\n`,
    'two-pairs': `${S}\na\n${E}\nmine\n${S}\nb\n${E}\n`,
    'old-format-no-markers': '# mine\n\n# GSD-T: Contract-Driven Development\nold body\n',
  };
  for (const [name, body] of Object.entries(cases)) {
    const home = tmp('gsdt-r2-');
    const C = path.join(home, '.claude');
    try {
      write(path.join(C, 'CLAUDE.md'), body);
      write(path.join(C, 'commands', 'gsd-t-wave.md'), '# GSD-T: Wave\n');
      const before = snap(C);
      const r = cli(home, ['install']);
      assert.notEqual(r.status, 0, `${name}: must halt`);
      assert.match(r.stdout + r.stderr, /Fix: .*re-run.*Nothing was changed/s, `${name}: names the fix`);
      assert.deepEqual(snap(C), before, `${name}: nothing changed`);
    } finally { rm(home); }
  }
});

test('R2-3: a symlink anywhere GSD-T would touch halts before any change', () => {
  const setups = {
    'CLAUDE.md': (C, out) => { write(path.join(out, 'CLAUDE.md'), '# outside\n'); fs.symlinkSync(path.join(out, 'CLAUDE.md'), path.join(C, 'CLAUDE.md')); },
    'settings.json': (C, out) => { write(path.join(out, 's.json'), '{}'); fs.symlinkSync(path.join(out, 's.json'), path.join(C, 'settings.json')); },
    'commands dir': (C, out) => { fs.mkdirSync(path.join(out, 'cmd')); fs.symlinkSync(path.join(out, 'cmd'), path.join(C, 'commands')); },
    'scripts/hooks dir': (C, out) => {
      write(path.join(out, 'hooks', 'gsd-t-ctx-cue.sh'), `${R.scripts['hooks/gsd-t-ctx-cue.sh'][0]}\n`);
      fs.mkdirSync(path.join(C, 'scripts'), { recursive: true });
      fs.symlinkSync(path.join(out, 'hooks'), path.join(C, 'scripts', 'hooks'));
    },
    'retired bin file': (C, out) => {
      write(path.join(out, 'pc.cjs'), shipped(R.bin['parallel-cli.cjs']));
      fs.mkdirSync(path.join(C, 'bin'), { recursive: true });
      fs.symlinkSync(path.join(out, 'pc.cjs'), path.join(C, 'bin', 'parallel-cli.cjs'));
    },
  };
  for (const [name, setup] of Object.entries(setups)) {
    const home = tmp('gsdt-r3-');
    const out = tmp('gsdt-r3-out-');
    const C = path.join(home, '.claude');
    try {
      fs.mkdirSync(C, { recursive: true });
      setup(C, out);
      if (name !== 'commands dir') write(path.join(C, 'commands', 'gsd-t-wave.md'), '# GSD-T: Wave\n');
      const before = { ...snap(C), ...snap(out) };
      const r = cli(home, ['install']);
      assert.notEqual(r.status, 0, `${name}: must halt`);
      assert.match(r.stdout + r.stderr, /is a symlink.*replace each link with a real file or directory/s, name);
      assert.deepEqual({ ...snap(C), ...snap(out) }, before, `${name}: nothing changed, inside or outside`);
    } finally { rm(home); rm(out); }
  }
});

test('R2-4 (BUG-3): update-all never copies through a symlinked project bin file', () => {
  const home = tmp('gsdt-r4-');
  const proj = tmp('gsdt-r4-proj-');
  const out = tmp('gsdt-r4-out-');
  try {
    write(path.join(home, '.claude', '.gsd-t-version'), PKG_VERSION);
    write(path.join(home, '.claude', '.gsd-t-projects'), proj + '\n');
    write(path.join(proj, 'CLAUDE.md'), '# proj\n');
    write(path.join(out, 'mine.cjs'), '// a shared file of my own\n');
    fs.mkdirSync(path.join(proj, 'bin'));
    fs.symlinkSync(path.join(out, 'mine.cjs'), path.join(proj, 'bin', gsdt.PROJECT_BIN_TOOLS[0]));
    write(path.join(proj, 'bin', 'gsd-t-verify-gate.cjs'), shipped(R.bin['gsd-t-verify-gate.cjs']));
    const before = snap(proj);
    const r = cli(home, ['update-all'], { GSDT_POST_UPGRADE: '1' });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /is a symlink/);
    assert.equal(fs.readFileSync(path.join(out, 'mine.cjs'), 'utf8'), '// a shared file of my own\n', 'link target untouched');
    assert.deepEqual(snap(proj), before, 'nothing in the project changed');
  } finally { rm(home); rm(proj); rm(out); }
});

test('R2-5: settings.json that is not an object of hook arrays halts unchanged', () => {
  const shapes = {
    array: '[]', null: 'null', scalar: '"x"', 'hooks null': '{"hooks":null}',
    'hooks array': '{"hooks":[]}', 'event object': '{"hooks":{"SessionStart":{}}}',
  };
  for (const [name, body] of Object.entries(shapes)) {
    const home = tmp('gsdt-r5-');
    const C = path.join(home, '.claude');
    try {
      write(path.join(C, 'settings.json'), body);
      write(path.join(C, 'commands', 'gsd-t-wave.md'), '# GSD-T: Wave\n');
      const before = snap(C);
      const r = cli(home, ['install']);
      assert.notEqual(r.status, 0, `${name}: must halt`);
      assert.match(r.stdout + r.stderr, /settings\.json.*(must be a JSON object|"hooks" must be)/s, name);
      assert.deepEqual(snap(C), before, `${name}: nothing changed`);
    } finally { rm(home); }
  }
});

test('R2-6: a failed copy or move halts — no "Installation Complete!", version not advanced', () => {
  // (a) copy onto a read-only command file
  let home = tmp('gsdt-r6a-');
  try {
    write(path.join(home, '.claude', '.gsd-t-version'), '5.24.10');
    const dest = path.join(home, '.claude', 'commands', 'gsd-t-debug.md');
    write(dest, 'old');
    fs.chmodSync(dest, 0o444);
    const r = cli(home, ['install']);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stdout, /Installation Complete!/);
    assert.equal(fs.readFileSync(path.join(home, '.claude', '.gsd-t-version'), 'utf8'), '5.24.10');
  } finally { rm(home); }
  // (b) move out of a read-only directory
  home = tmp('gsdt-r6b-');
  try {
    write(path.join(home, '.claude', '.gsd-t-version'), '5.24.10');
    const dir = path.join(home, '.claude', 'bin', 'cli-preflight-checks');
    write(path.join(dir, 'branch-guard.cjs'), shipped(R.bin['cli-preflight-checks/branch-guard.cjs']));
    fs.chmodSync(dir, 0o555);
    const r = cli(home, ['install']);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /could not move retired .*branch-guard\.cjs/);
    assert.doesNotMatch(r.stdout, /Installation Complete!/);
    assert.equal(fs.readFileSync(path.join(home, '.claude', '.gsd-t-version'), 'utf8'), '5.24.10');
    fs.chmodSync(dir, 0o755);
    assert.equal(cli(home, ['install']).status, 0, 'the next run retries and finishes');
    assert.equal(fs.readFileSync(path.join(home, '.claude', '.gsd-t-version'), 'utf8'), PKG_VERSION);
  } finally { rm(home); }
});

test('R2-7: user hooks naming a gsd-t script in their own path are never rewritten; board-notify is not ours', () => {
  const home = tmp('gsdt-r7-');
  const sp = path.join(home, '.claude', 'settings.json');
  const userHooks = [
    'node ~/code/myrepo/scripts/gsd-t-date-guard.js',
    'node /work/tools/scripts/gsd-t-heartbeat.js',
    'node "$HOME/.claude/scripts/gsd-t-board-notify.js" Stop',
  ];
  try {
    write(sp, JSON.stringify({ hooks: {
      PreToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [{ type: 'command', command: userHooks[0] }] }],
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: userHooks[1] }, { type: 'command', command: userHooks[2] }] }],
    } }));
    assert.equal(cli(home, ['install']).status, 0);
    const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const cmds = hookCommands(s);
    for (const u of userHooks) assert.equal(cmds.filter((c) => c === u).length, 1, `user hook kept verbatim: ${u}`);
    const userGroup = s.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command === userHooks[0]));
    assert.equal(userGroup.matcher, 'Write|Edit|MultiEdit', 'user matcher unchanged');
    assert.equal(cmds.filter((c) => /@tekyzinc\/gsd-t\/scripts\/gsd-t-date-guard\.js/.test(c)).length, 1, 'GSD-T date guard added once');
    assert.ok(!R.hookMarkers.includes('gsd-t-board-notify'), 'a script GSD-T never shipped is not a retired marker');
  } finally { rm(home); }
});

test('R2-8: one registrar — one entry per GSD-T script, wrong-event copies removed, startup matcher normalized', () => {
  const home = tmp('gsdt-r8-');
  const sp = path.join(home, '.claude', 'settings.json');
  const updateCheck = `node "${path.join(home, '.claude', 'scripts', 'gsd-t-update-check.js')}"`;
  try {
    write(sp, JSON.stringify({ hooks: {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'node "$HOME/.claude/scripts/gsd-t-date-guard.js"' }] }],
      SessionStart: [
        { matcher: 'startup', hooks: [{ type: 'command', command: 'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-changelog-check.js"' }] },
        { matcher: 'startup', hooks: [{ type: 'command', command: updateCheck }] },
        { matcher: '', hooks: [{ type: 'command', command: updateCheck }] },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'node ~/.claude/scripts/gsd-t-auto-route.js' }] },
        { hooks: [{ type: 'command', command: 'node ~/.claude/scripts/gsd-t-auto-route.js' }] },
      ],
    } }));
    const r = cli(home, ['install']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const where = (marker) => Object.entries(s.hooks).flatMap(([ev, gs]) =>
      gs.filter((g) => g.hooks.some((h) => h.command.includes(marker))).map((g) => [ev, g.matcher]));
    assert.deepEqual(where('gsd-t-date-guard'), [['PreToolUse', 'Write|Edit']], 'moved off Stop, once');
    assert.deepEqual(where('gsd-t-changelog-check'), [['SessionStart', '']]);
    assert.deepEqual(where('gsd-t-update-check'), [['SessionStart', '']]);
    assert.equal(where('gsd-t-auto-route').length, 1);
    for (const m of gsdt.GSDT_HOOK_MARKERS) {
      assert.equal(hookCommands(s).filter((c) => c.includes(m)).length, 1, `${m} registered exactly once`);
    }
  } finally { rm(home); }
});

test('R2-9: update-all halts before touching anything when npm install -g fails', () => {
  const home = tmp('gsdt-r9-');
  const proj = tmp('gsdt-r9-proj-');
  const stub = tmp('gsdt-r9-bin-');
  try {
    write(path.join(stub, 'npm'), '#!/bin/sh\necho "npm ERR! EACCES" >&2\nexit 1\n');
    fs.chmodSync(path.join(stub, 'npm'), 0o755);
    write(path.join(home, '.claude', '.gsd-t-projects'), proj + '\n');
    write(path.join(home, '.claude', 'commands', 'gsd-t-wave.md'), '# GSD-T: Wave\n');
    write(path.join(proj, 'CLAUDE.md'), '# proj\n');
    write(path.join(proj, 'bin', 'gsd-t-verify-gate.cjs'), shipped(R.bin['gsd-t-verify-gate.cjs']));
    const before = { ...snap(home), ...snap(proj) };
    const env = { ...process.env, HOME: home, PATH: `${stub}:${process.env.PATH}` };
    delete env.GSDT_POST_UPGRADE;
    const r = spawnSync('node', [INSTALLER, 'update-all'], { env, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /Global npm install failed/);
    assert.deepEqual({ ...snap(home), ...snap(proj) }, before, 'nothing touched');
  } finally { rm(home); rm(proj); rm(stub); }
});

test('R2-10: same-version update still runs the retired cleanup', () => {
  const home = tmp('gsdt-r10-');
  const C = path.join(home, '.claude');
  try {
    write(path.join(C, '.gsd-t-version'), PKG_VERSION);
    write(path.join(C, 'commands', 'gsd-t-wave.md'), '# GSD-T: Wave\n');
    write(path.join(C, 'scripts', 'gsd-t-heartbeat.js'), shipped(R.scripts['gsd-t-heartbeat.js']));
    const r = cli(home, ['update']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Already up to date/);
    assert.ok(fs.existsSync(path.join(RETIRED_HOME(home), 'commands', 'gsd-t-wave.md')));
    assert.ok(fs.existsSync(path.join(RETIRED_HOME(home), 'scripts', 'gsd-t-heartbeat.js')));
  } finally { rm(home); }
});

test('R2-11: project strays are moved to .gsd-t/retired/<date>/ — never overwriting a backup', () => {
  const proj = tmp('gsdt-r11-');
  const rel = path.join('bin', 'gsd-t-verify-gate.cjs');
  const backup = path.join(proj, '.gsd-t', 'retired', today(), rel);
  try {
    write(path.join(proj, rel), shipped(R.bin['gsd-t-verify-gate.cjs']) + '// first\n');
    fs.chmodSync(path.join(proj, rel), 0o700);
    gsdt.copyBinToolsToProject(proj, 'p');
    assert.equal(fs.existsSync(path.join(proj, rel)), false);
    assert.match(fs.readFileSync(backup, 'utf8'), /first/);
    assert.equal(fs.statSync(backup).mode & 0o777, 0o700, 'permissions preserved');

    write(path.join(proj, rel), shipped(R.bin['gsd-t-verify-gate.cjs']) + '// second\n');
    gsdt.copyBinToolsToProject(proj, 'p');
    assert.match(fs.readFileSync(backup, 'utf8'), /first/, 'the first backup is never overwritten');
    assert.match(fs.readFileSync(backup.replace(/\.cjs$/, '.1.cjs'), 'utf8'), /second/, 'numeric suffix');
  } finally { rm(proj); }
});

test('R2-12: .gsd-t/retired/ is gitignored only where .gsd-t working files already are', () => {
  const a = tmp('gsdt-r12a-');
  const b = tmp('gsdt-r12b-');
  const stray = (p) => write(path.join(p, 'bin', 'gsd-t-verify-gate.cjs'), shipped(R.bin['gsd-t-verify-gate.cjs']));
  try {
    write(path.join(a, '.gitignore'), 'node_modules\n.gsd-t/briefs/\n');
    stray(a);
    gsdt.copyBinToolsToProject(a, 'a');
    assert.match(fs.readFileSync(path.join(a, '.gitignore'), 'utf8'), /^\.gsd-t\/retired\/$/m);

    write(path.join(b, '.gitignore'), 'node_modules\n');
    stray(b);
    const r = spawnSync('node', ['-e', `require(${JSON.stringify(INSTALLER)}).copyBinToolsToProject(${JSON.stringify(b)}, 'b')`], { encoding: 'utf8' });
    assert.equal(fs.readFileSync(path.join(b, '.gitignore'), 'utf8'), 'node_modules\n', 'a user .gitignore is left alone');
    assert.match(r.stdout, /moved 1 retired bin file\(s\) to \.gsd-t\/retired\/.*not gitignored/);
  } finally { rm(a); rm(b); }
});
