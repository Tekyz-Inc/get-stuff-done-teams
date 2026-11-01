'use strict';

/**
 * Worktree lifecycle — audit (merged / unpushed / dirty / stale), the session
 * warnings, finish (refuses unfinished work, removes finished via git), the
 * release check (pushes, halts on an integration branch with no reason), the
 * hook, and pick-worktree recording the registry.
 *
 * Every case builds a throwaway repo with a bare "origin" in the temp dir.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const lc = require('../bin/gsd-t-worktree-lifecycle.cjs');

const HOOK = path.join(__dirname, '..', 'scripts', 'gsd-t-worktree-check.js');
const PICKER = path.join(__dirname, '..', 'bin', 'gsd-t-pick-worktree.cjs');
const DAY = 24 * 60 * 60 * 1000;
const NOBODY = new Set();

function git(cwd, args, env) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env) }).trim();
}

function commit(cwd, file, env) {
  fs.writeFileSync(path.join(cwd, file), `${file} ${Math.random()}\n`);
  git(cwd, ['add', file]);
  git(cwd, ['commit', '-q', '-m', `add ${file}`], env);
}

// root/origin.git (bare), root/repo (main, pushed), worktrees go in root/wt-<name>.
function mkRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-wtlc-')));
  const repo = path.join(root, 'repo');
  git(root, ['init', '-q', '--bare', 'origin.git']);
  git(root, ['init', '-q', '-b', 'main', 'repo']);
  git(repo, ['config', 'user.email', 't@t']);
  git(repo, ['config', 'user.name', 't']);
  fs.mkdirSync(path.join(repo, '.gsd-t'));
  commit(repo, 'README');
  git(repo, ['remote', 'add', 'origin', path.join(root, 'origin.git')]);
  git(repo, ['push', '-q', '-u', 'origin', 'main']);
  return { root, repo, rm: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function addWorktree(t, name) {
  const dir = path.join(t.root, `wt-${name}`);
  git(t.repo, ['worktree', 'add', '-q', dir, '-b', name]);
  return dir;
}

function branch(report, name) {
  return report.branches.find((b) => b.name === name);
}

test('audit: a branch merged into main and pushed reads merged + pushed, and warns its worktree is finished', () => {
  const t = mkRepo();
  try {
    const wt = addWorktree(t, 'done');
    commit(wt, 'a.txt');
    git(t.repo, ['merge', '-q', '--no-ff', '-m', 'merge done', 'done']);
    git(t.repo, ['push', '-q', 'origin', 'main']);
    const r = lc.audit(t.repo);
    const b = branch(r, 'done');
    assert.equal(b.merged, true);
    assert.equal(b.unpushed, 0, 'its commit reached origin through main');
    assert.equal(b.worktree, wt);
    assert.ok(lc.warnings(r).some((w) => w.startsWith('done: merged into main, worktree still at')), lc.warnings(r).join('\n'));
  } finally { t.rm(); }
});

test('audit: unpushed commits are counted and warned; release-check pushes them to origin', () => {
  const t = mkRepo();
  try {
    const wt = addWorktree(t, 'local-only');
    commit(wt, 'b.txt');
    commit(wt, 'c.txt');
    const b = branch(lc.audit(t.repo), 'local-only');
    assert.equal(b.unpushed, 2);
    assert.equal(b.merged, false);
    assert.ok(lc.warnings(lc.audit(t.repo)).includes('local-only: 2 commit(s) not pushed'));

    const rc = lc.releaseCheck(t.repo);
    assert.deepEqual(rc.pushed, [{ branch: 'local-only', commits: 2 }]);
    assert.deepEqual(rc.failed, []);
    assert.equal(git(t.repo, ['rev-parse', 'origin/local-only']), git(t.repo, ['rev-parse', 'local-only']), 'origin now has the branch tip');
    assert.equal(branch(lc.audit(t.repo), 'local-only').unpushed, 0);
  } finally { t.rm(); }
});

test('audit: uncommitted changes are counted, and finish refuses to remove that worktree', () => {
  const t = mkRepo();
  try {
    const wt = addWorktree(t, 'dirty');
    commit(wt, 'd.txt');
    git(t.repo, ['merge', '-q', 'dirty']);
    git(t.repo, ['push', '-q', 'origin', 'main']);
    fs.writeFileSync(path.join(wt, 'd.txt'), 'edited, not committed\n');
    fs.writeFileSync(path.join(wt, 'new.txt'), 'untracked\n');
    const r = lc.audit(t.repo);
    assert.equal(r.worktrees.find((w) => w.path === wt).dirty, 2);
    assert.ok(!lc.warnings(r).some((w) => w.includes('worktree is still at')), 'dirty work is not "finished"');

    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed, []);
    assert.equal(f.blocked[0].branch, 'dirty');
    assert.match(f.blocked[0].why.join(';'), /(d|new)\.txt exists only here/);
    assert.ok(fs.existsSync(path.join(wt, 'new.txt')), 'the uncommitted file is still there');
  } finally { t.rm(); }
});

test('audit: a registration whose folder was deleted is pruned automatically', () => {
  const t = mkRepo();
  try {
    const wt = addWorktree(t, 'gone');
    fs.rmSync(wt, { recursive: true, force: true });
    assert.match(git(t.repo, ['worktree', 'list']), /wt-gone/, 'git still lists it before the audit');
    const r = lc.audit(t.repo);
    assert.deepEqual(r.pruned, ['wt-gone']);
    assert.doesNotMatch(git(t.repo, ['worktree', 'list']), /wt-gone/, 'pruned from git');
    assert.ok(branch(r, 'gone'), 'the branch itself is kept and still reported');
  } finally { t.rm(); }
});

test('warnings: unmerged for more than 3 days warns; 1 day does not', () => {
  const t = mkRepo();
  try {
    const old = new Date(Date.now() - 5 * DAY).toISOString();
    const wt = addWorktree(t, 'old');
    commit(wt, 'o.txt', { GIT_AUTHOR_DATE: old, GIT_COMMITTER_DATE: old });
    git(wt, ['push', '-q', '-u', 'origin', 'old']);
    const wt2 = addWorktree(t, 'fresh');
    commit(wt2, 'f.txt');
    git(wt2, ['push', '-q', '-u', 'origin', 'fresh']);
    const w = lc.warnings(lc.audit(t.repo));
    assert.ok(w.some((x) => x.startsWith('old: not merged into main since')), w.join('\n'));
    assert.ok(!w.some((x) => x.startsWith('fresh:')), w.join('\n'));
  } finally { t.rm(); }
});

test('finish: removes a merged, pushed, clean worktree with git and keeps the branch', () => {
  const t = mkRepo();
  try {
    const wt = addWorktree(t, 'shipped');
    commit(wt, 's.txt');
    git(t.repo, ['merge', '-q', 'shipped']);
    git(t.repo, ['push', '-q', 'origin', 'main']);
    const offer = lc.finish(t.repo, { sessionDirs: NOBODY });
    assert.deepEqual(offer.removable, [{ branch: 'shipped', path: wt }]);
    assert.ok(fs.existsSync(wt), 'without --remove nothing is removed');

    const done = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(done.removed, [{ branch: 'shipped', path: wt }]);
    assert.ok(!fs.existsSync(wt));
    assert.doesNotMatch(git(t.repo, ['worktree', 'list']), /wt-shipped/);
    assert.equal(git(t.repo, ['branch', '--list', 'shipped']).replace('*', '').trim(), 'shipped');
  } finally { t.rm(); }
});

test('finish: refuses unpushed, unmerged, not-started and occupied worktrees', () => {
  const t = mkRepo();
  try {
    const a = addWorktree(t, 'unpushed');
    commit(a, 'u.txt');
    const b = addWorktree(t, 'unmerged');
    commit(b, 'm.txt');
    git(b, ['push', '-q', '-u', 'origin', 'unmerged']);
    addWorktree(t, 'unstarted');
    const c = addWorktree(t, 'occupied');
    commit(c, 'x.txt');
    git(t.repo, ['merge', '-q', 'occupied']);
    git(t.repo, ['push', '-q', 'origin', 'main']);
    const f = lc.finish(t.repo, { remove: true, sessionDirs: new Set([c]) });
    assert.deepEqual(f.removed, []);
    const why = Object.fromEntries(f.blocked.map((x) => [x.branch, x.why.join('; ')]));
    assert.match(why.unpushed, /not merged into main/);
    assert.match(why.unmerged, /not merged into main/);
    assert.match(why.unstarted, /not started/);
    assert.match(why.occupied, /session is open/);
    for (const d of ['wt-unpushed', 'wt-unmerged', 'wt-unstarted', 'wt-occupied']) assert.ok(fs.existsSync(path.join(t.root, d)));
  } finally { t.rm(); }
});

test('release-check: halts on an integration branch ahead of main until a reason is recorded', () => {
  const t = mkRepo();
  try {
    git(t.repo, ['branch', 'integ']);
    const wt = addWorktree(t, 'lane-a');
    lc.recordWorktree(t.repo, { branch: 'lane-a', worktreePath: wt, purpose: 'lane A', target: 'integ' });
    commit(wt, 'l.txt');
    git(wt, ['push', '-q', '-u', 'origin', 'lane-a']);
    git(t.repo, ['checkout', '-q', 'integ']);
    git(t.repo, ['merge', '-q', 'lane-a']);
    git(t.repo, ['checkout', '-q', 'main']);

    const r = lc.audit(t.repo);
    assert.equal(branch(r, 'lane-a').target, 'integ');
    assert.equal(branch(r, 'lane-a').merged, true, 'merged into its own target');
    assert.equal(branch(r, 'integ').integration, true);
    assert.equal(branch(r, 'integ').aheadOfBase, 1);
    assert.ok(lc.warnings(r).includes('integ: integration branch 1 commit(s) ahead of main'));

    const rc = lc.releaseCheck(t.repo);
    assert.deepEqual(rc.unreasoned, [{ branch: 'integ', ahead: 1 }]);
    assert.deepEqual(rc.pushed, [], 'integ holds no commit that origin lacks (lane-a was pushed)');

    lc.setBranch(t.repo, 'integ', { reason: 'held for the client demo' });
    assert.deepEqual(lc.releaseCheck(t.repo).unreasoned, []);
  } finally { t.rm(); }
});

test('release-check: a rejected push is reported as failed, never skipped', () => {
  const t = mkRepo();
  try {
    const wt = addWorktree(t, 'diverged');
    commit(wt, 'one.txt');
    git(wt, ['push', '-q', '-u', 'origin', 'diverged']);
    git(wt, ['reset', '-q', '--hard', 'main']);
    commit(wt, 'two.txt');
    const rc = lc.releaseCheck(t.repo);
    assert.equal(rc.failed.length, 1);
    assert.equal(rc.failed[0].branch, 'diverged');
    const cli = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'gsd-t-worktree-lifecycle.cjs'), 'release-check'], { cwd: t.repo, encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /HALT: push of diverged failed/);
  } finally { t.rm(); }
});

test('hook: warns, stamps the owner session, and never blocks', () => {
  const t = mkRepo();
  try {
    const wt = addWorktree(t, 'hooked');
    lc.recordWorktree(t.repo, { branch: 'hooked', worktreePath: wt });
    commit(wt, 'h.txt');
    const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ session_id: 'sess-1', cwd: wt }), encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /hooked: 1 commit\(s\) not pushed/);
    assert.equal(lc.readRegistry(t.repo).worktrees.hooked.session, 'sess-1');

    fs.writeFileSync(path.join(t.repo, lc.REGISTRY_REL), '{ broken');
    const bad = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: wt }), encoding: 'utf8' });
    assert.equal(bad.status, 0, 'a check that cannot run warns, it does not block');
    assert.match(bad.stdout, /worktree check could not run: .*not valid JSON/);

    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-wtlc-nogit-'));
    const quiet = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: outside }), encoding: 'utf8' });
    fs.rmSync(outside, { recursive: true, force: true });
    assert.equal(quiet.status, 0);
    assert.equal(quiet.stdout, '', 'silent outside a git repo');
  } finally { t.rm(); }
});

test('pick-worktree --name records purpose, target and owner in the registry', () => {
  const t = mkRepo();
  try {
    const home = path.join(t.root, 'home');
    fs.mkdirSync(home);
    const r = spawnSync(process.execPath, [PICKER, '--name', 'Lane B', '--purpose', 'build lane B', '--target', 'integ'], {
      cwd: t.repo, encoding: 'utf8', env: Object.assign({}, process.env, { HOME: home }),
    });
    assert.equal(r.status, 0, r.stderr);
    const dest = path.join(home, 'Worktrees', 'repo', 'lane-b');
    assert.equal(r.stdout.trim(), dest);
    const e = lc.readRegistry(t.repo).worktrees['lane-b'];
    assert.equal(e.path, dest);
    assert.equal(e.purpose, 'build lane B');
    assert.equal(e.target, 'integ');
    assert.match(e.owner, /@/);

    const again = spawnSync(process.execPath, [PICKER, '--name', 'lane-b'], {
      cwd: t.repo, encoding: 'utf8', env: Object.assign({}, process.env, { HOME: home }),
    });
    assert.equal(again.status, 0, again.stderr);
    assert.equal(lc.readRegistry(t.repo).worktrees['lane-b'].purpose, 'build lane B', 're-entering keeps what was recorded');
  } finally { t.rm(); }
});

// ─── Red-team round 1 regressions ────────────────────────────────────────────

function mergedAndPushed(t, name) {
  const wt = addWorktree(t, name);
  commit(wt, `${name}.txt`);
  git(t.repo, ['merge', '-q', name]);
  git(t.repo, ['push', '-q', 'origin', 'main']);
  return wt;
}

test('finish: rebuildable output is ignored; an ignored or new file that exists only here blocks removal', () => {
  const t = mkRepo();
  try {
    fs.writeFileSync(path.join(t.repo, '.gitignore'), 'notes/\n.env\nnode_modules/\n.gsd-t/\n');
    git(t.repo, ['add', '.gitignore']);
    git(t.repo, ['commit', '-q', '-m', 'ignore']);
    git(t.repo, ['push', '-q', 'origin', 'main']);
    fs.writeFileSync(path.join(t.repo, '.env'), 'A=1\n');
    const wt = mergedAndPushed(t, 'ign');
    fs.mkdirSync(path.join(wt, 'node_modules', 'x'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'node_modules', 'x', 'i.js'), 'only here, rebuildable');
    fs.mkdirSync(path.join(wt, '.gsd-t', 'graphDB'), { recursive: true });
    fs.writeFileSync(path.join(wt, '.gsd-t', 'graphDB', 'graph.db'), 'index');
    fs.writeFileSync(path.join(wt, '.gsd-t', 'heartbeat-abc.jsonl'), '{}');
    fs.writeFileSync(path.join(wt, '.env'), 'A=1\n');
    assert.deepEqual(lc.finish(t.repo, { sessionDirs: NOBODY }).removable.map((r) => r.branch), ['ign'], 'rebuildable + identical copy is safe');

    fs.writeFileSync(path.join(wt, '.env'), 'A=2 edited only here\n');
    assert.match(lc.finish(t.repo, { sessionDirs: NOBODY }).blocked[0].why.join(';'), /^\.env exists only here/);
    fs.writeFileSync(path.join(wt, '.env'), 'A=1\n');
    fs.mkdirSync(path.join(wt, '.gsd-t', 'pseudocode'));
    fs.writeFileSync(path.join(wt, '.gsd-t', 'pseudocode', 'PseudoCode-X.md'), 'plan only here\n');
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed, []);
    assert.match(f.blocked[0].why.join(';'), /PseudoCode-X\.md exists only here/, 'an ignored .gsd-t plan is work, not output');
    assert.ok(fs.existsSync(path.join(wt, '.gsd-t', 'pseudocode', 'PseudoCode-X.md')));
  } finally { t.rm(); }
});

test('audit + hook: a detached worktree holding commits on no branch is reported', () => {
  const t = mkRepo();
  try {
    const dir = path.join(t.root, 'wt-det');
    git(t.repo, ['worktree', 'add', '-q', '--detach', dir]);
    commit(dir, 'lost.txt');
    fs.writeFileSync(path.join(dir, 'wip.txt'), 'uncommitted\n');
    const w = lc.warnings(lc.audit(t.repo));
    assert.ok(w.some((x) => x.includes(`detached worktree ${dir}: 1 commit(s) on no branch, 1 uncommitted change(s)`)), w.join('\n'));
  } finally { t.rm(); }
});

test('a branch named like a top-level folder, or shadowed by a same-named tag, is read as the branch', () => {
  const t = mkRepo();
  try {
    fs.mkdirSync(path.join(t.repo, 'docs'));
    fs.writeFileSync(path.join(t.repo, 'docs', 'a.md'), 'x\n');
    git(t.repo, ['add', 'docs']);
    git(t.repo, ['commit', '-q', '-m', 'docs']);
    git(t.repo, ['push', '-q', 'origin', 'main']);
    const wt = addWorktree(t, 'docs');
    commit(wt, 'd2.txt');
    git(t.repo, ['tag', 'feat', 'main']);
    const wf = addWorktree(t, 'feat');
    commit(wf, 'f1.txt');
    commit(wf, 'f2.txt');
    const r = lc.audit(t.repo);
    assert.equal(branch(r, 'docs').unpushed, 1);
    assert.equal(branch(r, 'feat').unpushed, 2);
    assert.equal(branch(r, 'feat').worktree, wf);
    const rc = lc.releaseCheck(t.repo);
    assert.deepEqual(rc.failed, []);
    assert.deepEqual(rc.pushed.map((p) => p.branch).sort(), ['docs', 'feat']);
  } finally { t.rm(); }
});

test('release-check: an integration branch that exists only on origin still halts', () => {
  const t = mkRepo();
  try {
    git(t.repo, ['checkout', '-q', '-b', 'integ']);
    commit(t.repo, 'i1.txt');
    commit(t.repo, 'i2.txt');
    git(t.repo, ['push', '-q', 'origin', 'integ']);
    git(t.repo, ['checkout', '-q', 'main']);
    git(t.repo, ['branch', '-q', '-D', 'integ']);
    const wt = addWorktree(t, 'lane');
    lc.recordWorktree(t.repo, { branch: 'lane', worktreePath: wt, target: 'integ' });
    assert.deepEqual(lc.releaseCheck(t.repo).unreasoned, [{ branch: 'integ', ahead: 2 }]);
  } finally { t.rm(); }
});

test('finish: merged locally but never pushed is still removable — the commits live in main and the branch is kept', () => {
  const t = mkRepo();
  try {
    const wt = addWorktree(t, 'local-merge');
    commit(wt, 'lm.txt');
    git(t.repo, ['merge', '-q', 'local-merge']);
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed.map((r) => r.branch), ['local-merge']);
    assert.ok(!fs.existsSync(wt));
    assert.equal(git(t.repo, ['rev-parse', 'refs/heads/local-merge']).length, 40, 'branch kept');
  } finally { t.rm(); }
});

test('registry: parallel writers all land (lock), and a non-object registry halts', async () => {
  const t = mkRepo();
  try {
    const script = `require(${JSON.stringify(path.join(__dirname, '..', 'bin', 'gsd-t-worktree-lifecycle.cjs'))}).recordWorktree(process.argv[1], { branch: 'b' + process.argv[2], worktreePath: '/x/' + process.argv[2] })`;
    const { spawn } = require('node:child_process');
    await Promise.all(Array.from({ length: 12 }, (_, i) => new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['-e', script, t.repo, String(i)], { stdio: 'inherit' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`writer ${i} exited ${code}`))));
    })));
    assert.equal(Object.keys(lc.readRegistry(t.repo).worktrees).length, 12);
    fs.writeFileSync(path.join(t.repo, lc.REGISTRY_REL), '[1,2]');
    assert.throws(() => lc.readRegistry(t.repo), /must hold a JSON object/);
  } finally { t.rm(); }
});

test('finish: asked by name it removes the worktree it runs inside; the unnamed sweep does not', () => {
  const t = mkRepo();
  try {
    const CLI = path.join(__dirname, '..', 'bin', 'gsd-t-worktree-lifecycle.cjs');
    const a = mergedAndPushed(t, 'here');
    const sweep = spawnSync(process.execPath, [CLI, 'finish', '--remove'], { cwd: a, encoding: 'utf8' });
    assert.equal(sweep.status, 0);
    assert.match(sweep.stdout, /Kept: here .*running inside it/);
    assert.ok(fs.existsSync(a));
    const asked = spawnSync(process.execPath, [CLI, 'finish', 'here', '--remove'], { cwd: a, encoding: 'utf8' });
    assert.equal(asked.status, 0, asked.stderr);
    assert.match(asked.stdout, /Removed worktree .*here/);
    assert.match(asked.stdout, /This shell was inside it — continue in /);
    assert.ok(!fs.existsSync(a));
  } finally { t.rm(); }
});

// ─── Removal timing + red-team round 2 regressions ───────────────────────────

function hook(input) {
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
}

test('session start: a merged worktree with nothing unique is removed; one with a unique file is kept and named', () => {
  const t = mkRepo();
  try {
    const done = mergedAndPushed(t, 'done');
    const keep = mergedAndPushed(t, 'keep');
    fs.writeFileSync(path.join(keep, 'scratch.md'), 'notes only here\n');
    const r = hook({ cwd: t.repo });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /removed finished worktree done/);
    assert.match(r.stdout, /keep: merged but kept — scratch\.md exists only here/);
    assert.ok(!fs.existsSync(done));
    assert.ok(fs.existsSync(path.join(keep, 'scratch.md')));
    assert.ok(lc.readRegistry(t.repo), 'registry readable');
  } finally { t.rm(); }
});

test('a worktree nested inside another (.claude/worktrees) keeps the outer one', () => {
  const t = mkRepo();
  try {
    const outer = mergedAndPushed(t, 'outer');
    git(t.repo, ['worktree', 'add', '-q', path.join(outer, '.claude', 'worktrees', 'x'), '-b', 'inner']);
    fs.writeFileSync(path.join(outer, '.claude', 'worktrees', 'x', 'wip.txt'), 'uncommitted\n');
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    const why = Object.fromEntries(f.blocked.map((x) => [x.branch, x.why.join('; ')]));
    assert.match(why.outer, /\.claude\/worktrees\/x\/.* exists only here/);
    assert.ok(fs.existsSync(path.join(outer, '.claude', 'worktrees', 'x', 'wip.txt')));
  } finally { t.rm(); }
});

test('status.showUntrackedFiles=no cannot hide a new file', () => {
  const t = mkRepo();
  try {
    git(t.repo, ['config', 'status.showUntrackedFiles', 'no']);
    const wt = mergedAndPushed(t, 'hidden');
    fs.writeFileSync(path.join(wt, 'draft.txt'), 'new\n');
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed, []);
    assert.match(f.blocked[0].why.join(';'), /draft\.txt exists only here/);
    assert.equal(lc.audit(t.repo).worktrees.find((w) => w.path === wt).dirty, 1);
  } finally { t.rm(); }
});

test('a locked worktree whose folder is missing is reported, not a crash', () => {
  const t = mkRepo();
  try {
    const gone = mergedAndPushed(t, 'unmounted');
    git(t.repo, ['worktree', 'lock', gone]);
    fs.rmSync(gone, { recursive: true, force: true });
    mergedAndPushed(t, 'fine');
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed.map((r) => r.branch), ['fine']);
    assert.match(f.blocked.find((b) => b.branch === 'unmounted').why[0], /folder missing \(locked\)/);
  } finally { t.rm(); }
});

test('pruning a detached worktree whose folder is gone keeps its commits under refs/gsd-t/kept', () => {
  const t = mkRepo();
  try {
    const dir = path.join(t.root, 'wt-det');
    git(t.repo, ['worktree', 'add', '-q', '--detach', dir]);
    commit(dir, 'only.txt');
    const sha = git(dir, ['rev-parse', 'HEAD']);
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(lc.audit(t.repo).pruned, ['wt-det']);
    assert.equal(git(t.repo, ['rev-parse', `refs/gsd-t/kept/${sha}`]), sha);
  } finally { t.rm(); }
});

test('a lock left by a writer that died is cleared, not waited on', () => {
  const t = mkRepo();
  try {
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;
    fs.writeFileSync(path.join(t.repo, lc.REGISTRY_REL + '.lock'), dead);
    const start = Date.now();
    lc.recordWorktree(t.repo, { branch: 'b', worktreePath: '/x' });
    assert.ok(Date.now() - start < 2000, 'did not wait for the lock to time out');
    assert.ok(!fs.existsSync(path.join(t.repo, lc.REGISTRY_REL + '.lock')));
  } finally { t.rm(); }
});

test('names with spaces and accents are compared by bytes, not by git\'s quoted form', () => {
  const t = mkRepo();
  try {
    fs.writeFileSync(path.join(t.repo, '.gitignore'), '*.local\n');
    git(t.repo, ['add', '.gitignore']);
    git(t.repo, ['commit', '-q', '-m', 'ignore']);
    fs.writeFileSync(path.join(t.repo, 'my notes.local'), 'same\n');
    fs.writeFileSync(path.join(t.repo, 'café.local'), 'same\n');
    const wt = mergedAndPushed(t, 'quoted');
    fs.writeFileSync(path.join(wt, 'my notes.local'), 'same\n');
    fs.writeFileSync(path.join(wt, 'café.local'), 'same\n');
    assert.deepEqual(lc.finish(t.repo, { sessionDirs: NOBODY }).removable.map((r) => r.branch), ['quoted']);
  } finally { t.rm(); }
});

// ─── Redesign red-team round 1 regressions ───────────────────────────────────

test('pruning two detached worktrees with the same folder name keeps both commits', () => {
  const t = mkRepo();
  try {
    const shas = [];
    for (const parent of ['x', 'y']) {
      const dir = path.join(t.root, parent, 'fix');
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      git(t.repo, ['worktree', 'add', '-q', '--detach', dir]);
      commit(dir, `${parent}.txt`);
      shas.push(git(dir, ['rev-parse', 'HEAD']));
      fs.rmSync(dir, { recursive: true, force: true });
    }
    lc.audit(t.repo);
    const kept = git(t.repo, ['for-each-ref', '--format=%(objectname)', 'refs/gsd-t/kept/']).split('\n').sort();
    assert.deepEqual(kept, shas.slice().sort());
  } finally { t.rm(); }
});

test('a main-checkout symlink pointing into the worktree is not a copy', () => {
  const t = mkRepo();
  try {
    fs.writeFileSync(path.join(t.repo, '.gitignore'), 'data\n');
    git(t.repo, ['add', '.gitignore']);
    git(t.repo, ['commit', '-q', '-m', 'ignore']);
    const wt = mergedAndPushed(t, 'linked');
    fs.mkdirSync(path.join(wt, 'data'));
    fs.writeFileSync(path.join(wt, 'data', 'only.csv'), 'unique\n');
    fs.symlinkSync(path.join(wt, 'data'), path.join(t.repo, 'data'));
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed, []);
    assert.match(f.blocked[0].why.join(';'), /data\/only\.csv exists only here/);
  } finally { t.rm(); }
});

test('asked by name: another session in the same folder still blocks; only the asking one is excused', () => {
  const t = mkRepo();
  try {
    const wt = mergedAndPushed(t, 'shared');
    const two = [{ pid: 101, dir: wt }, { pid: 202, dir: wt }];
    const blocked = lc.finish(t.repo, { branch: 'shared', remove: true, sessions: two, ownSession: { pid: 101, dir: wt } });
    assert.deepEqual(blocked.removed, []);
    assert.match(blocked.blocked[0].why.join(';'), /session is open/);
    const alone = lc.finish(t.repo, { branch: 'shared', remove: true, sessions: [two[0]], ownSession: { pid: 101, dir: wt } });
    assert.deepEqual(alone.removed.map((r) => r.branch), ['shared']);
  } finally { t.rm(); }
});

test('git refusing one removal keeps that worktree, reports it, and the sweep still removes the rest', () => {
  const t = mkRepo();
  try {
    const a = mergedAndPushed(t, 'aaa');
    fs.mkdirSync(path.join(a, '.gsd-t'), { recursive: true });
    fs.writeFileSync(path.join(a, '.gsd-t', 'heartbeat-123.jsonl'), '{}\n');
    const z = mergedAndPushed(t, 'zzz');
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed.map((r) => r.branch), ['zzz']);
    assert.equal(f.failed[0].branch, 'aaa');
    assert.ok(fs.existsSync(path.join(a, '.gsd-t', 'heartbeat-123.jsonl')));
    assert.ok(!fs.existsSync(z));
    const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: t.repo }), encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /aaa: merged but kept — git refused to remove it/);
  } finally { t.rm(); }
});

// ─── Redesign red-team round 2 regressions ───────────────────────────────────

test('a main-checkout symlink into the worktree spelled with different letter case is not a copy', (ctx) => {
  const t = mkRepo();
  try {
    fs.writeFileSync(path.join(t.repo, '.gitignore'), 'data\n');
    git(t.repo, ['add', '.gitignore']);
    git(t.repo, ['commit', '-q', '-m', 'ignore']);
    const wt = mergedAndPushed(t, 'cased');
    const alias = path.join(path.dirname(wt), path.basename(wt).toUpperCase());
    if (!fs.existsSync(alias)) { ctx.skip('disk is case-sensitive'); return; }
    fs.mkdirSync(path.join(wt, 'data'));
    fs.writeFileSync(path.join(wt, 'data', 'results.csv'), 'unique\n');
    fs.symlinkSync(path.join(alias, 'data'), path.join(t.repo, 'data'));
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed, []);
    assert.match(f.blocked[0].why.join(';'), /data\/results\.csv exists only here/);
    assert.ok(fs.existsSync(path.join(wt, 'data', 'results.csv')));
  } finally { t.rm(); }
});

test('pruning a detached worktree whose folder name has a space keeps its commit and later runs still work', () => {
  const t = mkRepo();
  try {
    const dir = path.join(t.root, 'my fix');
    git(t.repo, ['worktree', 'add', '-q', '--detach', dir]);
    commit(dir, 'only.txt');
    const sha = git(dir, ['rev-parse', 'HEAD']);
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(lc.audit(t.repo).pruned, ['my-fix'], 'git names the registration without the space');
    assert.equal(git(t.repo, ['rev-parse', `refs/gsd-t/kept/${sha}`]), sha);
    assert.deepEqual(lc.audit(t.repo).pruned, []);
  } finally { t.rm(); }
});

test('git stopping part-way through a removal is reported as partly removed and recorded', () => {
  const t = mkRepo();
  const wt = path.join(t.root, 'wt-ro');
  try {
    git(t.repo, ['worktree', 'add', '-q', wt, '-b', 'ro']);
    fs.mkdirSync(path.join(wt, 'locked'));
    commit(wt, 'locked/f.txt');
    git(t.repo, ['merge', '-q', '--no-ff', '-m', 'merge ro', 'ro']);
    git(t.repo, ['push', '-q', 'origin', 'main']);
    lc.recordWorktree(t.repo, { branch: 'ro', worktreePath: wt });
    fs.chmodSync(path.join(wt, 'locked'), 0o555);
    const f = lc.finish(t.repo, { remove: true, sessionDirs: NOBODY });
    assert.deepEqual(f.removed, []);
    assert.equal(f.failed[0].partly, true);
    assert.match(lc.failedLine(f.failed[0], wt), /partly removed .* finish deleting .*wt-ro by hand/);
    assert.ok(lc.readRegistry(t.repo).worktrees.ro.removedAt);
  } finally {
    if (fs.existsSync(path.join(wt, 'locked'))) fs.chmodSync(path.join(wt, 'locked'), 0o755);
    t.rm();
  }
});
