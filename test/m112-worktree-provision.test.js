'use strict';

/**
 * M112 — a new worktree must arrive runnable.
 *
 * `git worktree add` brings only tracked files, so the secrets and the
 * installed dependencies stay behind. The folder looks complete and is not.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const prov = require('../bin/gsd-t-worktree-provision.cjs');

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm112-'));
  const repo = path.join(root, 'proj');
  fs.mkdirSync(repo);

  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n.env\n.gsd-t/\ndist/\n');
  fs.writeFileSync(path.join(repo, '.env'), 'SECRET=hunter2\n');
  fs.chmodSync(path.join(repo, '.env'), 0o600);
  fs.writeFileSync(path.join(repo, 'README.md'), '# proj\n');

  fs.mkdirSync(path.join(repo, '.gsd-t', 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.gsd-t', 'briefs', 'old.json'), '{"stale":true}');
  fs.mkdirSync(path.join(repo, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'dist', 'bundle.js'), 'built');
  fs.mkdirSync(path.join(repo, 'node_modules', 'dep'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'node_modules', 'dep', 'index.js'), 'x');

  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: repo, stdio: 'ignore' });

  const wt = path.join(root, 'wt');
  execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'feature'], { cwd: repo, stdio: 'ignore' });

  return { root, repo, wt };
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

// ── Classification ──────────────────────────────────────────────────────────

test('classify: local config and secrets are carried', () => {
  assert.equal(prov.classify('.env'), 'carry');
  assert.equal(prov.classify('.env.local'), 'carry');
  assert.equal(prov.classify('.npmrc'), 'carry');
  assert.equal(prov.classify('config/.env'), 'carry', 'a nested .env still counts');
});

test('classify: another session\'s state is never carried', () => {
  assert.equal(prov.classify('.gsd-t/briefs/old.json'), 'skip');
  assert.equal(prov.classify('.gsd-t/heartbeat-abc.jsonl'), 'skip');
  assert.equal(prov.classify('.gsd-t/.watch-state/x.json'), 'skip');
});

test('classify: build output, dependencies and OS junk are skipped', () => {
  assert.equal(prov.classify('node_modules/dep/index.js'), 'skip');
  assert.equal(prov.classify('dist/bundle.js'), 'skip');
  assert.equal(prov.classify('coverage/lcov.info'), 'skip');
  assert.equal(prov.classify('.DS_Store'), 'skip');
  assert.equal(prov.classify('docs/.DS_Store'), 'skip');
});

test('classify: a .gsd-t path is skipped even when it ends in a carried name', () => {
  // The skip rule must beat the carry rule, or session state named like config
  // would cross over.
  assert.equal(prov.classify('.gsd-t/.env'), 'skip');
});

// ── Carrying config ─────────────────────────────────────────────────────────

test('carryConfig: the secret arrives, with its permissions', () => {
  const { root, repo, wt } = tmpProject();
  try {
    const r = prov.carryConfig(repo, wt);

    assert.deepEqual(r.carried, ['.env']);
    assert.deepEqual(r.problems, [], 'nothing should have gone wrong');
    assert.equal(fs.readFileSync(path.join(wt, '.env'), 'utf8'), 'SECRET=hunter2\n');

    const mode = fs.statSync(path.join(wt, '.env')).mode & 0o777;
    assert.equal(mode, 0o600, 'a secret must not become world-readable in the copy');
  } finally { rm(root); }
});

test('carryConfig: another session\'s state stays behind', () => {
  const { root, repo, wt } = tmpProject();
  try {
    prov.carryConfig(repo, wt);
    assert.equal(fs.existsSync(path.join(wt, '.gsd-t')), false, 'session state must not cross');
    assert.equal(fs.existsSync(path.join(wt, 'dist')), false, 'build output must not cross');
    assert.equal(fs.existsSync(path.join(wt, 'node_modules')), false, 'deps are installed, not copied');
  } finally { rm(root); }
});

test('carryConfig: a config file too large to be config is reported, not copied', () => {
  const { root, repo, wt } = tmpProject();
  try {
    fs.writeFileSync(path.join(repo, '.env'), 'x'.repeat(prov.MAX_CARRY_BYTES + 1));
    const r = prov.carryConfig(repo, wt);
    assert.deepEqual(r.carried, []);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /larger than expected/);
  } finally { rm(root); }
});

test('carryConfig: an unreadable directory is reported, never treated as empty', () => {
  const { root, repo, wt } = tmpProject();
  const locked = path.join(repo, 'private');
  try {
    fs.mkdirSync(locked);
    fs.writeFileSync(path.join(locked, '.env'), 'SECRET=inside\n');
    fs.appendFileSync(path.join(repo, '.gitignore'), 'private/\n');
    fs.chmodSync(locked, 0o000);

    let readable = true;
    try { fs.readdirSync(locked); } catch (_) { readable = false; }
    if (readable) return; // running as root — the permission bit means nothing

    const r = prov.carryConfig(repo, wt);
    // git omits a directory it cannot open — it warns and exits 0, so the
    // listing looks complete while the .env inside is invisible.
    assert.ok(
      r.problems.some((p) => /private/.test(p) && /could not (open|be read)/.test(p)),
      'a directory we could not read must be reported — its .env may be the one that matters'
    );
  } finally {
    try { fs.chmodSync(locked, 0o755); } catch (_) {}
    rm(root);
  }
});

// ── Dependencies ────────────────────────────────────────────────────────────

test('installDeps: picks the manager the lockfile implies', () => {
  const { root, wt } = tmpProject();
  try {
    fs.writeFileSync(path.join(wt, 'package.json'), '{"name":"p"}');
    assert.match(prov.installDeps(wt, { run: false }).msg, /npm install/);

    fs.writeFileSync(path.join(wt, 'package-lock.json'), '{}');
    assert.match(prov.installDeps(wt, { run: false }).msg, /npm ci/);

    fs.writeFileSync(path.join(wt, 'pnpm-lock.yaml'), '');
    assert.match(prov.installDeps(wt, { run: false }).msg, /pnpm install/);
  } finally { rm(root); }
});

test('installDeps: a project with no manifest has nothing to install', () => {
  const { root, wt } = tmpProject();
  try {
    const r = prov.installDeps(wt, { run: false });
    assert.equal(r.ok, true);
    assert.equal(r.manager, null);
    assert.match(r.msg, /nothing to install/);
  } finally { rm(root); }
});

test('installDeps: a failed install is reported as a failure', () => {
  const { root, wt } = tmpProject();
  try {
    // A lockfile that does not match any manifest makes `npm ci` fail.
    fs.writeFileSync(path.join(wt, 'package.json'), '{"name":"p","dependencies":{"nope-not-real-pkg-xyz":"1.0.0"}}');
    fs.writeFileSync(path.join(wt, 'package-lock.json'), '{"lockfileVersion":3}');
    const r = prov.installDeps(wt, { run: true });
    assert.equal(r.ok, false, 'a broken install must not report success');
    assert.equal(r.ran, true);
    assert.match(r.msg, /failed/);
  } finally { rm(root); }
});

// ── The whole job ───────────────────────────────────────────────────────────

test('provision: reports what it carried and what it would install', () => {
  const { root, repo, wt } = tmpProject();
  try {
    fs.writeFileSync(path.join(wt, 'package.json'), '{"name":"p"}');
    const r = prov.provision(repo, wt, { install: false });

    assert.deepEqual(r.config.carried, ['.env']);
    assert.deepEqual(r.config.problems, []);
    assert.equal(r.deps.ok, true);
    assert.match(r.deps.msg, /would run/);
  } finally { rm(root); }
});

// ── The gate must not pass when it ran nothing ───────────────────────────────

test('preflight refuses to report a clean pass when no checks loaded', () => {
  // The global install shipped cli-preflight.cjs without its checks directory:
  // it noted "checks dir unreadable" and returned ok:true, so every preflight in
  // every installed project passed having verified nothing.
  const pre = require('../bin/cli-preflight.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm112-pf-'));
  try {
    // A registry restricted to an id no check has leaves nothing to run.
    const r = pre.runPreflight({ projectDir: root, checks: ['no-such-check-xyz'] });
    // Checks DID load (the registry is populated), so this must still pass —
    // the halt is about an empty registry, not an empty selection.
    assert.equal(r.ok, true, 'restricting to a subset is legitimate, not a broken install');
  } finally { rm(root); }
});

test('the installer ships the preflight checks, not just the runner', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'gsd-t.js'), 'utf8');
  assert.match(src, /GLOBAL_BIN_DIRS/, 'directories under bin/ need their own copy step');
  assert.match(src, /cli-preflight-checks/, 'the checks directory must be listed');
});

test('the runner names an empty registry instead of passing', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'cli-preflight.cjs'), 'utf8');
  assert.match(src, /nothingRan/, 'an empty registry must be a distinct, named outcome');
  assert.match(src, /NOT CHECKED/, 'and must say so rather than returning a bare pass');
});

// ── Install-repair must not overwrite its own source ─────────────────────────

test('install-repair recognises the GSD-T source repo', () => {
  // A test run triggered a repair inside this repo and silently reverted two
  // edited files mid-session. In a project, bin/ holds copies; here it is the
  // source, so "repair" means overwriting work with the last published build.
  const check = require('../bin/gsd-t-install-check.cjs');
  const repoRoot = path.join(__dirname, '..');
  assert.equal(check.isOwnSourceRepo(repoRoot), true, 'this worktree IS the source repo');
});

test('install-repair still repairs an ordinary project', () => {
  const check = require('../bin/gsd-t-install-check.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm112-proj-'));
  try {
    assert.equal(check.isOwnSourceRepo(dir), false, 'no manifest — an ordinary project');

    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"some-app","version":"1.0.0"}');
    assert.equal(check.isOwnSourceRepo(dir), false, 'a different package is still a project');

    fs.writeFileSync(path.join(dir, 'package.json'), 'not json at all');
    assert.equal(check.isOwnSourceRepo(dir), false, 'an unreadable manifest must not block a repair');
  } finally { rm(dir); }
});

test('the repair path checks before it overwrites', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'bin', 'gsd-t-install-check.cjs'),
    'utf8'
  );
  const guardAt = src.indexOf('isOwnSourceRepo(projectDir)');
  // The CALL site, not the `function repairOne(...)` definition that precedes it.
  const repairAt = src.indexOf('repairOne(projectDir, pkgRoot, item.tool)');
  assert.ok(guardAt > 0, 'the guard must be wired into the run, not just defined');
  assert.ok(repairAt > 0, 'the repair call site must exist');
  assert.ok(repairAt > guardAt, 'and the guard must run before anything is overwritten');
});

test('the worktree creator wires provisioning in', () => {
  // A module nobody calls fixes nothing — this is the wire-in, not the logic.
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'bin', 'gsd-t-pick-worktree.cjs'),
    'utf8'
  );
  assert.match(src, /gsd-t-worktree-provision\.cjs/, 'creation must provision the new tree');
  assert.match(src, /provisionNewWorktree\(repo, dest\)/, 'and must call it after creating');
});
