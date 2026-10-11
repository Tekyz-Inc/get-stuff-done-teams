'use strict';

/**
 * v6 slim-down — install removes what GSD-T used to ship, and only that.
 *
 * Cutting a command, tool, script or hook from the package does not stop it on
 * the machines that already installed it. The installer is the only thing that
 * reaches them, so install / update / update-all must remove every retired
 * file — and must never touch a user's own file that merely shares a name.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const INSTALLER = path.join(REPO, 'bin', 'gsd-t.js');
const gsdt = require(INSTALLER);

function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
function write(file, body) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); }
// A file as GSD-T shipped it: its header carries one of the recorded sentinels.
function shipped(sentinels) { return `/**\n * ${sentinels[0]}\n */\nmodule.exports = {};\n`; }

test('install removes retired GSD-T files and hooks, and leaves user files alone', () => {
  const home = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-v6-'));
  const C = path.join(home, '.claude');
  const R = gsdt.RETIRED_V6;
  try {
    write(path.join(C, 'commands', 'gsd.md'), `# GSD-T: Smart Router\n\n${R.commands['gsd.md'][0]} …\n`);
    write(path.join(C, 'commands', 'gsd-t-wave.md'), '# wave\n');            // prefix rule
    write(path.join(C, 'commands', 'deploy.md'), '# my own command\n');      // user file
    write(path.join(C, 'scripts', 'gsd-t-heartbeat.js'), shipped(R.scripts['gsd-t-heartbeat.js']));
    write(path.join(C, 'scripts', 'hooks', 'gsd-t-ctx-cue.sh'), `#!/bin/bash\n${R.scripts['hooks/gsd-t-ctx-cue.sh'][0]}\n`);
    write(path.join(C, 'scripts', 'gsd-t-tools.js'), '// my own tools script\n'); // same name, no header
    write(path.join(C, 'scripts', 'my-script.js'), '// unrelated\n');
    write(path.join(C, 'bin', 'cli-preflight-checks', 'branch-guard.cjs'),
      shipped(R.bin['cli-preflight-checks/branch-guard.cjs']));
    write(path.join(C, 'bin', 'gsd-t-verify-gate.cjs'), shipped(R.bin['gsd-t-verify-gate.cjs']));
    const status = path.join(C, 'statusline-command.sh');
    write(status, `#!/bin/bash\n# ${R.claudeDir['statusline-command.sh'][0]}\n`);
    write(path.join(C, 'settings.json'), JSON.stringify({
      statusLine: { type: 'command', command: `bash ${status}` },
      hooks: {
        Stop: [{ matcher: '', hooks: [
          { type: 'command', command: 'node "$HOME/.claude/scripts/gsd-t-heartbeat.js"' },
          { type: 'command', command: 'node "$HOME/.claude/scripts/gsd-t-board-notify.js" Stop' },
          { type: 'command', command: 'echo unrelated-hook' },
        ] }],
        PreToolUse: [{ matcher: 'Write|Edit', hooks: [
          { type: 'command', command: 'node "$HOME/.claude/scripts/gsd-t-date-guard.js"' },
        ] }],
      },
    }, null, 2));

    const out = execFileSync('node', [INSTALLER, 'install'], {
      env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: 'pipe',
    });

    // Retired GSD-T files are gone, and each removal is named.
    for (const gone of ['commands/gsd.md', 'commands/gsd-t-wave.md', 'scripts/gsd-t-heartbeat.js',
      'scripts/hooks/gsd-t-ctx-cue.sh', 'bin/cli-preflight-checks/branch-guard.cjs',
      'bin/gsd-t-verify-gate.cjs', 'statusline-command.sh']) {
      assert.equal(fs.existsSync(path.join(C, gone)), false, `${gone} must be removed`);
    }
    assert.match(out, /~\/\.claude\/scripts\/gsd-t-heartbeat\.js/);
    assert.equal(fs.existsSync(path.join(C, 'bin', 'cli-preflight-checks')), false, 'the emptied dir goes too');
    assert.equal(fs.existsSync(path.join(C, 'scripts', 'hooks')), false, 'the emptied hooks dir goes too');

    // User files survive — including one that shares a retired name.
    for (const kept of ['commands/deploy.md', 'scripts/gsd-t-tools.js', 'scripts/my-script.js']) {
      assert.ok(fs.existsSync(path.join(C, kept)), `${kept} is not ours and must survive`);
    }
    assert.match(out, /Left ~\/\.claude\/scripts\/gsd-t-tools\.js in place/);

    // Hooks: retired ones removed, unrelated kept, v6 hooks registered once.
    const settings = JSON.parse(fs.readFileSync(path.join(C, 'settings.json'), 'utf8'));
    const all = JSON.stringify(settings.hooks);
    assert.ok(!/gsd-t-heartbeat|gsd-t-board-notify/.test(all), 'retired hooks must be removed');
    assert.match(all, /unrelated-hook/, 'a user hook must survive');
    assert.equal(settings.statusLine, undefined, 'the GSD-T status line pointed at a removed script');
    const cmds = Object.values(settings.hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
    for (const marker of ['gsd-t-date-guard', 'gsd-t-changelog-check', 'gsd-t-changelog-post-edit',
      'gsd-t-fallback-guard', 'gsd-t-graph-search-guard']) {
      const hits = cmds.filter((c) => c.includes(marker));
      assert.equal(hits.length, 1, `${marker} registered exactly once (got ${hits.length})`);
      assert.match(hits[0], /npm root -g\)\/@tekyzinc\/gsd-t\/scripts\//, `${marker} runs from the package`);
    }
    const post = settings.hooks.PostToolUse.find((g) => g.hooks.some((h) => h.command.includes('gsd-t-changelog-post-edit')));
    assert.equal(post.matcher, 'Write|Edit');
  } finally { rm(home); }
});

test('the project bin sweep removes a shipped retired tool and keeps a same-named user file', () => {
  const dir = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-v6-proj-'));
  try {
    write(path.join(dir, 'bin', 'gsd-t-verify-gate.cjs'), shipped(gsdt.RETIRED_V6.bin['gsd-t-verify-gate.cjs']));
    write(path.join(dir, 'bin', 'gsd-t-loop-ledger.cjs'), '// a user script that happens to share the name\n');
    gsdt.copyBinToolsToProject(dir, 'v6-probe');
    assert.equal(fs.existsSync(path.join(dir, 'bin', 'gsd-t-verify-gate.cjs')), false);
    assert.ok(fs.existsSync(path.join(dir, 'bin', 'gsd-t-loop-ledger.cjs')));
    for (const tool of gsdt.PROJECT_BIN_TOOLS) {
      assert.ok(fs.existsSync(path.join(dir, 'bin', tool)), `${tool} must be delivered`);
    }
  } finally { rm(dir); }
});

test('every retired bin entry is absent from the package and from both copy lists', () => {
  for (const name of Object.keys(gsdt.RETIRED_V6.bin)) {
    assert.equal(fs.existsSync(path.join(REPO, 'bin', name)), false, `${name} is retired but still shipped`);
    assert.ok(!gsdt.PROJECT_BIN_TOOLS.includes(name), `${name} is retired but still copied to projects`);
  }
});

test('uninstall removes every GSD-T hook and leaves user hooks', () => {
  const home = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-v6-un-'));
  const C = path.join(home, '.claude');
  try {
    write(path.join(C, 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [
      { type: 'command', command: 'echo unrelated-hook' }] }] } }));
    const env = { ...process.env, HOME: home };
    execFileSync('node', [INSTALLER, 'install'], { env, encoding: 'utf8', stdio: 'pipe' });
    execFileSync('node', [INSTALLER, 'uninstall'], { env, encoding: 'utf8', stdio: 'pipe' });
    const all = fs.readFileSync(path.join(C, 'settings.json'), 'utf8');
    for (const m of gsdt.GSDT_HOOK_MARKERS) assert.ok(!all.includes(m), `${m} must be removed on uninstall`);
    assert.match(all, /unrelated-hook/);
  } finally { rm(home); }
});
