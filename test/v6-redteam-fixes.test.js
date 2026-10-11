'use strict';

/**
 * v6 red-team fixes — regression tests for the install / update / update-all
 * cleanup paths. Each test runs against a fake HOME / project in os.tmpdir().
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

// realpath: macOS os.tmpdir() sits under the /var symlink, which ensureDir() refuses.
function tmp(prefix) { return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix)); }
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
function write(file, body) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); }
function cli(home, args, extraEnv = {}) {
  return spawnSync('node', [INSTALLER, ...args], {
    env: { ...process.env, HOME: home, ...extraEnv }, encoding: 'utf8',
  });
}
// Run installer functions with HOME-derived constants pointing at the fake HOME.
function inHome(home, code) {
  return spawnSync('node', ['-e', `const g = require(${JSON.stringify(INSTALLER)}); ${code}`], {
    env: { ...process.env, HOME: home }, encoding: 'utf8',
  });
}
function hookCommands(settings) {
  return Object.values(settings.hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
}

test('BUG-1: install keeps a user gsd-t-*.md command and removes a retired v5 one', () => {
  const home = tmp('gsdt-b1-');
  const C = path.join(home, '.claude', 'commands');
  try {
    write(path.join(C, 'gsd-t-mydeploy.md'), '# My personal deploy command\n');
    write(path.join(C, 'gsd-t-wave.md'), '# wave (shipped by v5)\n');
    const r = cli(home, ['install']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(C, 'gsd-t-mydeploy.md')), 'user command must survive');
    assert.equal(fs.existsSync(path.join(C, 'gsd-t-wave.md')), false, 'retired v5 command must go');
  } finally { rm(home); }
});

test('BUG-2: install replaces a v5 GSD-T section; update refreshes a stale one at the same version', () => {
  const home = tmp('gsdt-b2-');
  const md = path.join(home, '.claude', 'CLAUDE.md');
  const template = fs.readFileSync(path.join(REPO, 'templates', 'CLAUDE-global.md'), 'utf8');
  try {
    write(md, '# My own rules\n\n<!-- GSD-T:START x -->\nV5 BODY\n<!-- GSD-T:END x -->\n\n# My footer\n');
    write(path.join(home, '.claude', '.gsd-t-version'), '5.24.10\n');
    assert.equal(cli(home, ['install']).status, 0);
    let body = fs.readFileSync(md, 'utf8');
    assert.ok(!body.includes('V5 BODY'), 'the old section must be replaced on install');
    assert.ok(body.includes(template.trim().split('\n')[1]), 'template content present');
    assert.match(body, /^# My own rules/, 'content before the markers kept');
    assert.match(body, /# My footer\n$/, 'content after the markers kept');
    assert.ok(fs.readdirSync(path.dirname(md)).some((f) => f.startsWith('CLAUDE.md.backup-')), 'backup written');

    // Version now current; a stale section must still be refreshed by content.
    fs.writeFileSync(md, body.replace(template.trim().split('\n')[1], 'STALE LINE'));
    assert.equal(cli(home, ['update']).status, 0);
    body = fs.readFileSync(md, 'utf8');
    assert.ok(!body.includes('STALE LINE'), 'update refreshes the section even at the current version');

    fs.writeFileSync(md, body.replace(template.trim().split('\n')[1], 'STALE LINE'));
    assert.equal(cli(home, ['update-all'], { GSDT_POST_UPGRADE: '1' }).status, 0);
    assert.ok(!fs.readFileSync(md, 'utf8').includes('STALE LINE'), 'update-all refreshes it too');
  } finally { rm(home); }
});

test('BUG-3: a GSD-T hook registered twice is collapsed to one', () => {
  const dir = tmp('gsdt-b3-');
  const sp = path.join(dir, 'settings.json');
  try {
    write(sp, JSON.stringify({ hooks: {
      PreToolUse: [
        { matcher: 'Write', hooks: [{ type: 'command', command: 'node "$HOME/.claude/scripts/gsd-t-date-guard.js"' }] },
        { matcher: 'Edit', hooks: [{ type: 'command', command: 'node "$HOME/.claude/scripts/gsd-t-date-guard.js"' }] },
      ],
      SessionStart: [
        { matcher: '', hooks: [{ type: 'command', command: 'node "$HOME/.claude/scripts/gsd-t-changelog-check.js"' }] },
        { matcher: '', hooks: [{ type: 'command', command: 'echo user-hook' },
          { type: 'command', command: 'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-changelog-check.js"' }] },
      ],
    } }));
    assert.ok(gsdt.configureDateGuardHook(sp).installed);
    assert.ok(gsdt.configureChangelogCheckHook(sp).installed);
    const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const cmds = hookCommands(s);
    assert.equal(cmds.filter((c) => c.includes('gsd-t-date-guard')).length, 1);
    assert.equal(cmds.filter((c) => c.includes('gsd-t-changelog-check')).length, 1);
    assert.ok(cmds.includes('echo user-hook'), 'user hook untouched');
    assert.equal(s.hooks.PreToolUse.find((g) => g.hooks.length).matcher, 'Write|Edit');
    assert.equal(gsdt.configureDateGuardHook(sp).action, 'noop', 'idempotent');
  } finally { rm(dir); }
});

test('BUG-4: update-all halts a project with an undeletable stray and exits non-zero', () => {
  const home = tmp('gsdt-b4-');
  const proj = tmp('gsdt-b4-proj-');
  const stray = path.join(proj, 'bin', 'gsd-t-rule-consume.cjs');
  try {
    write(path.join(home, '.claude', '.gsd-t-version'), PKG_VERSION);
    write(path.join(home, '.claude', '.gsd-t-projects'), proj + '\n');
    write(path.join(proj, 'CLAUDE.md'), '# proj\n');
    write(require(path.join(REPO, 'bin', 'gsd-t-graph-store-resolver.cjs')).resolveStorePath(proj), '');
    write(stray, `/**\n * ${gsdt.RETIRED_V6.bin['gsd-t-rule-consume.cjs'][0]}\n */\n`);
    fs.chmodSync(stray, 0o000);
    const r = cli(home, ['update-all'], { GSDT_POST_UPGRADE: '1' });
    assert.notEqual(r.status, 0, 'update-all must not exit 0');
    const out = r.stdout + r.stderr;
    assert.match(out, /gsd-t-rule-consume\.cjs/, 'names the file');
    assert.ok(out.includes(proj), 'names the project');
  } finally { try { fs.chmodSync(stray, 0o644); } catch (_) {} rm(home); rm(proj); }
});

test('BUG-5: removal refuses to follow a symlinked directory out of ~/.claude', () => {
  const home = tmp('gsdt-b5-');
  const out = tmp('gsdt-b5-out-');
  const victim = path.join(out, 'branch-guard.cjs');
  try {
    write(victim, `// ${gsdt.RETIRED_V6.bin['cli-preflight-checks/branch-guard.cjs'][0]}\n`);
    fs.mkdirSync(path.join(home, '.claude', 'bin'), { recursive: true });
    fs.symlinkSync(out, path.join(home, '.claude', 'bin', 'cli-preflight-checks'));
    const r = inHome(home, 'g.removeRetiredV6Files();');
    assert.notEqual(r.status, 0, 'must halt');
    assert.match(r.stderr, /Refusing to remove .*outside/);
    assert.ok(fs.existsSync(victim), 'the file outside ~/.claude survives');
  } finally { rm(home); rm(out); }
});

test('BUG-6: a refreshed GSD-T hook never narrows a shared group; a substring is not a match', () => {
  const dir = tmp('gsdt-b6-');
  const sp = path.join(dir, 'settings.json');
  try {
    write(sp, JSON.stringify({ hooks: {
      PreToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [
        { type: 'command', command: 'node "$HOME/.claude/scripts/gsd-t-date-guard.js"' },
        { type: 'command', command: '~/bin/my-lint-on-edit.sh' }] }],
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: '~/tools/notify.sh --after gsd-t-heartbeat-replacement' }] }],
    } }));
    gsdt.configureDateGuardHook(sp);
    gsdt.removeRetiredHooks(sp);
    const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
    const userGroup = s.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes('my-lint')));
    assert.equal(userGroup.matcher, 'Write|Edit|MultiEdit', 'user group keeps its matcher');
    const guard = s.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes('gsd-t-date-guard')));
    assert.equal(guard.matcher, 'Write|Edit');
    assert.notEqual(guard, userGroup, 'GSD-T hook moved to its own group');
    assert.ok(hookCommands(s).includes('~/tools/notify.sh --after gsd-t-heartbeat-replacement'), 'user hook survives');
  } finally { rm(dir); }
});

test('BUG-7a: malformed settings.json halts install before any deletion', () => {
  const home = tmp('gsdt-b7a-');
  const C = path.join(home, '.claude');
  try {
    write(path.join(C, 'commands', 'gsd-t-wave.md'), '# wave\n');
    write(path.join(C, 'settings.json'), '{\n // comment\n "hooks": {},\n}\n');
    const r = cli(home, ['install']);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /not valid JSON/);
    assert.ok(fs.existsSync(path.join(C, 'commands', 'gsd-t-wave.md')), 'nothing deleted');
  } finally { rm(home); }
});

test('BUG-7b: the retired auto-worktree hook is removed', () => {
  const dir = tmp('gsdt-b7b-');
  const sp = path.join(dir, 'settings.json');
  try {
    write(sp, JSON.stringify({ hooks: { SessionStart: [{ matcher: '', hooks: [
      { type: 'command', command: 'node "$(npm root -g)/@tekyzinc/gsd-t/scripts/gsd-t-auto-worktree.js"' }] }] } }));
    assert.equal(gsdt.removeRetiredHooks(sp).removed, 1);
  } finally { rm(dir); }
});

test('BUG-7c: v5 design templates in ~/.claude/templates are removed; edited copies kept', () => {
  const home = tmp('gsdt-b7c-');
  const T = path.join(home, '.claude', 'templates');
  try {
    for (const [name, sigs] of Object.entries(gsdt.RETIRED_V6.templates)) write(path.join(T, name), `${sigs[0]}\nbody\n`);
    write(path.join(T, 'page-contract.md'), '# my own page contract\n');
    const r = inHome(home, 'g.removeRetiredV6Files();');
    assert.equal(r.status, 0, r.stderr);
    for (const name of Object.keys(gsdt.RETIRED_V6.templates)) {
      if (name === 'page-contract.md') continue;
      assert.equal(fs.existsSync(path.join(T, name)), false, `${name} must be removed`);
    }
    assert.ok(fs.existsSync(path.join(T, 'page-contract.md')), 'a user-edited template survives');
  } finally { rm(home); }
});

test('BUG-7d: an emptied project bin/cli-preflight-checks is removed, a non-empty one kept', () => {
  const a = tmp('gsdt-b7d-');
  const b = tmp('gsdt-b7d2-');
  const sig = gsdt.RETIRED_V6.bin['cli-preflight-checks/branch-guard.cjs'][0];
  try {
    write(path.join(a, 'bin', 'cli-preflight-checks', 'branch-guard.cjs'), `// ${sig}\n`);
    gsdt.copyBinToolsToProject(a, 'a');
    assert.equal(fs.existsSync(path.join(a, 'bin', 'cli-preflight-checks')), false);

    write(path.join(b, 'bin', 'cli-preflight-checks', 'branch-guard.cjs'), `// ${sig}\n`);
    write(path.join(b, 'bin', 'cli-preflight-checks', 'mine.cjs'), '// user file\n');
    gsdt.copyBinToolsToProject(b, 'b');
    assert.ok(fs.existsSync(path.join(b, 'bin', 'cli-preflight-checks', 'mine.cjs')));
  } finally { rm(a); rm(b); }
});
