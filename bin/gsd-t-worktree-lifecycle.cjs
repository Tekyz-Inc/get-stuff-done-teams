#!/usr/bin/env node
'use strict';

/**
 * gsd-t-worktree-lifecycle — keeps worktrees and branches from being orphaned.
 *
 *   gsd-t worktrees audit [--json]                 report every worktree, branch, stash
 *   gsd-t worktrees finish [<branch>] [--remove]   offer / do removal of finished worktrees
 *   gsd-t worktrees set <branch> [--purpose <text>] [--target <branch>] [--reason <text>]
 *   gsd-t worktrees release-check                  push unpushed branches; halt on an
 *                                                  integration branch ahead of main with no reason
 *
 * The registry is `.gsd-t/worktrees.json` in the MAIN checkout:
 *   { base, worktrees: { <branch>: { path, purpose, target, owner, session, createdAt, removedAt } },
 *     integration: { <branch>: { reason, recordedAt } } }
 *
 * An integration branch is one the registry names as some worktree's target
 * (other than base) or lists under `integration`. Never inferred from a name.
 * One that exists only on origin is checked from origin's copy.
 *
 * Every git call names branches by full ref (refs/heads/<b>) and ends revision
 * lists with `--`, so a branch named like a file (`docs`) or a tag is never
 * read as something else.
 *
 * [RULE] worktree-removed-only-by-git — `git worktree remove`, never forced, never a folder delete.
 * [RULE] removed-only-when-nothing-is-lost — a worktree is removed only when its branch is merged
 *        into its target and every file in its folder (tracked, new or ignored — walked on disk,
 *        not asked of git status) is rebuildable output (REBUILDABLE: installed packages, GSD-T's
 *        generated data, test reports) or byte-identical to its last commit or the main checkout's copy.
 *        Unmerged, unstarted, locked or another session in it → kept, with the reason.
 * [RULE] removal-timing — removed when asked (the asking session may be inside it), or at the next
 *        session start in any folder of the project once no session is open in it. Never mid-session
 *        on its own.
 * [RULE] release-fetches-first — release-check fetches origin first; a failed fetch halts.
 * [RULE] orphan-commits-kept-on-prune — pruning a detached worktree whose folder is gone first saves
 *        its commits under refs/gsd-t/kept/<commit>.
 * [RULE] stale-registration-pruned — a registration whose folder is gone holds no work.
 * [RULE] integration-branch-needs-reason — release-check halts on one ahead of main without a reason.
 * [RULE] release-pushes-every-branch — a failed push halts the release.
 *
 * Plan: .gsd-t/pseudocode/PseudoCode-WorktreeLifecycle.md
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const detect = require('./gsd-t-worktree-detect.cjs');

const REGISTRY_REL = path.join('.gsd-t', 'worktrees.json');
const BASE_BRANCH = 'main';
const STALE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const GIT_TIMEOUT_MS = 60000;
const LOCK_WAIT_MS = 10000;
const LOCK_STALE_MS = 60000;

// What removal may discard without a matching copy: output that is rebuilt on
// demand, never someone's work. A closed list — anything else must match the
// last commit or the main checkout. (David chose this list, 2026-11-01.)
const REBUILDABLE = {
  // Installed packages, at any depth (rebuilt from the committed lockfile).
  dirsAnywhere: ['node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache'],
  // GSD-T's own generated data and test reports, at these exact paths.
  paths: [
    '.gsd-t/graphDB', '.gsd-t/events', '.gsd-t/transcripts', '.gsd-t/metrics', '.gsd-t/.watch-state',
    '.gsd-t/.context-meter-state.json', '.gsd-t/context-meter.log', '.gsd-t/.in-session-cursor.json',
    'playwright-report', 'test-results', 'coverage',
  ],
  // GSD-T session heartbeats: .gsd-t/heartbeat-<session>.jsonl
  heartbeat: { prefix: '.gsd-t/heartbeat-', suffix: '.jsonl' },
  files: ['.DS_Store'],
};

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  if (r.error) throw new Error(`git ${args.join(' ')} could not run: ${r.error.message}`);
  return { status: r.status, out: String(r.stdout).trim(), err: String(r.stderr).trim() };
}

function gitOk(cwd, args) {
  const r = git(cwd, args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.err}`);
  return r.out;
}

function lines(text) {
  return text.split('\n').filter((l) => l.length > 0);
}

function heads(name) {
  return `refs/heads/${name}`;
}

// The main checkout, from any folder of the repo (main or a linked worktree).
function mainCheckout(dir) {
  const common = gitOk(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (path.basename(common) !== '.git') {
    throw new Error(`${dir} belongs to a bare repository (${common}); worktree tracking needs a main checkout.`);
  }
  return path.dirname(common);
}

// ─── Registry ────────────────────────────────────────────────────────────────

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function registryPath(main) {
  return path.join(main, REGISTRY_REL);
}

function readRegistry(main) {
  const p = registryPath(main);
  const reg = { base: BASE_BRANCH, worktrees: {}, integration: {} };
  if (!fs.existsSync(p)) return reg;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`${p} is not valid JSON (${e.message}) — fix or delete it.`);
  }
  if (!isObject(data)) throw new Error(`${p} must hold a JSON object — fix or delete it.`);
  if (typeof data.base === 'string' && data.base) reg.base = data.base;
  if (isObject(data.worktrees)) reg.worktrees = data.worktrees;
  if (isObject(data.integration)) reg.integration = data.integration;
  return reg;
}

function writeRegistry(main, reg) {
  const p = registryPath(main);
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Read-modify-write under an exclusive lock file, so two sessions recording at
// once cannot drop each other's entries. A lock that will not clear halts.
function updateRegistry(main, change) {
  const p = registryPath(main);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const lock = `${p}.lock`;
  const until = Date.now() + LOCK_WAIT_MS;
  let fd = tryLock(lock);
  while (fd === null) {
    if (Date.now() > until) {
      const age = Date.now() - fs.statSync(lock).mtimeMs;
      throw new Error(
        `${lock} has been held for ${Math.round(age / 1000)}s` +
        (age > LOCK_STALE_MS ? ' — no writer should take that long; delete it if no gsd-t is running.' : '.')
      );
    }
    pause(25);
    fd = tryLock(lock);
  }
  try {
    const reg = readRegistry(main);
    const out = change(reg);
    writeRegistry(main, reg);
    return out;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

// An open lock file descriptor, or null when another writer holds the lock.
// Any other error (permissions, missing folder) is thrown.
function tryLock(lock) {
  let fd;
  try {
    fd = fs.openSync(lock, 'wx');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    clearIfOrphaned(lock);
    return null;
  }
  fs.writeSync(fd, String(process.pid));
  return fd;
}

// A lock whose writer has exited (crashed mid-write) holds nothing: remove it.
function clearIfOrphaned(lock) {
  if (!fs.existsSync(lock)) return;
  const pid = Number(fs.readFileSync(lock, 'utf8').trim());
  const known = Number.isInteger(pid) && pid > 0;
  // No pid yet: the writer is between creating the lock and writing its pid,
  // or died there. Only an old one is treated as dead.
  if (!known) {
    if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.unlinkSync(lock);
    return;
  }
  if (!pidAlive(pid)) fs.unlinkSync(lock);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
  } catch (e) {
    if (e.code === 'ESRCH') return false;
    if (e.code === 'EPERM') return true;
    throw e;
  }
  return true;
}

/** pick-worktree calls this when it creates (or re-enters with new details) a worktree. */
function recordWorktree(dir, { branch, worktreePath, purpose, target }) {
  const main = mainCheckout(dir);
  return updateRegistry(main, (reg) => {
    const had = reg.worktrees[branch];
    const entry = isObject(had) ? had : { createdAt: new Date().toISOString() };
    entry.path = worktreePath;
    if (purpose) entry.purpose = purpose;
    if (target) entry.target = target;
    if (!entry.target) entry.target = reg.base;
    if (!entry.owner) entry.owner = `${os.userInfo().username}@${os.hostname()}`;
    delete entry.removedAt;
    reg.worktrees[branch] = entry;
    return entry;
  });
}

/** `gsd-t worktrees set` — record purpose, target, or why an integration branch stays off main. */
function setBranch(dir, branch, { purpose, target, reason }) {
  const main = mainCheckout(dir);
  if (!branchRef(main, branch)) throw new Error(`No branch named "${branch}" here or on origin.`);
  return updateRegistry(main, (reg) => {
    if (purpose || target) {
      const had = reg.worktrees[branch];
      const entry = isObject(had) ? had : { createdAt: new Date().toISOString(), target: reg.base };
      if (purpose) entry.purpose = purpose;
      if (target) entry.target = target;
      reg.worktrees[branch] = entry;
    }
    if (reason) reg.integration[branch] = { reason, recordedAt: new Date().toISOString() };
    return reg;
  });
}

/** The first session to open inside a recorded worktree becomes its owner session. */
function stampSession(dir, sessionId) {
  if (!sessionId) return null;
  const main = mainCheckout(dir);
  const here = fs.realpathSync(gitOk(dir, ['rev-parse', '--show-toplevel']));
  const match = (reg) => Object.keys(reg.worktrees).find((branch) => {
    const entry = reg.worktrees[branch];
    if (!isObject(entry) || !entry.path || entry.session) return false;
    if (!fs.existsSync(entry.path)) return false;
    return fs.realpathSync(entry.path) === here;
  });
  if (!match(readRegistry(main))) return null;
  return updateRegistry(main, (reg) => {
    const branch = match(reg);
    if (branch) reg.worktrees[branch].session = sessionId;
    return branch;
  });
}

// ─── Git facts ───────────────────────────────────────────────────────────────

function refExists(repo, ref) {
  return git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0;
}

function localBranches(repo) {
  return lines(gitOk(repo, ['for-each-ref', '--format=%(refname)', 'refs/heads']))
    .map((r) => r.slice('refs/heads/'.length));
}

function remotes(repo) {
  return lines(gitOk(repo, ['remote']));
}

// The full ref for a branch: local, else origin's copy, else null.
function branchRef(repo, name) {
  if (refExists(repo, heads(name))) return heads(name);
  if (refExists(repo, `refs/remotes/origin/${name}`)) return `refs/remotes/origin/${name}`;
  return null;
}

// Merged = an ancestor of the target, or every commit already applied there
// (a rebase merge). A squash merge reads as unmerged — reported, never removed.
function isMerged(repo, ref, target) {
  const r = git(repo, ['merge-base', '--is-ancestor', ref, target]);
  if (r.status === 0) return true;
  if (r.status !== 1) throw new Error(`git merge-base ${ref} ${target} failed: ${r.err}`);
  return lines(gitOk(repo, ['cherry', target, ref])).every((l) => l.startsWith('-'));
}

function revCount(repo, revs) {
  return Number(gitOk(repo, ['rev-list', '--count'].concat(revs, ['--'])));
}

// Commits on this ref that no remote has. null when the repo has no remote.
function unpushedCount(repo, ref, hasRemote) {
  if (!hasRemote) return null;
  return revCount(repo, [ref, '--not', '--remotes']);
}

// When the oldest commit not yet on the target was made (ms), or null.
function oldestUnmergedAt(repo, ref, target) {
  const first = lines(gitOk(repo, ['log', '--reverse', '--format=%ct', `${target}..${ref}`, '--']))[0];
  return first ? Number(first) * 1000 : null;
}

// Has the branch moved since it was created? A fresh worktree's branch sits on
// its target, so it reads as "merged" — it is unstarted, not finished. The
// branch's reflog (git's log of where it pointed) answers: one entry = never moved.
// No reflog at all (logging switched off) → git cannot tell; count it as started.
function hasStarted(repo, ref) {
  if (!ref.startsWith('refs/heads/')) return true;
  const r = git(repo, ['reflog', 'show', '--format=%gs', ref, '--']);
  if (r.status !== 0) return true;
  return lines(r.out).length !== 1;
}

function dirtyCount(dir) {
  return lines(gitOk(dir, ['status', '--porcelain', '--untracked-files=all'])).length;
}

function hasUpstream(repo, name) {
  return git(repo, ['rev-parse', '--abbrev-ref', `${heads(name)}@{upstream}`]).status === 0;
}

function listWorktrees(repo) {
  const out = [];
  let cur = null;
  for (const line of gitOk(repo, ['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) cur = { path: line.slice(9), branch: null, locked: false, head: null };
    else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (cur && line.startsWith('locked')) cur.locked = true;
    else if (line === '' && cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

function listStashes(repo, now) {
  return lines(gitOk(repo, ['stash', 'list', '--format=%gd%x09%ct%x09%gs'])).map((l) => {
    const [ref, ct, subject] = l.split('\t');
    const on = subject.match(/^(?:WIP on|On) ([^:]+):/);
    return {
      ref,
      branch: on ? on[1] : null,
      subject,
      ageDays: Math.floor((now - Number(ct) * 1000) / DAY_MS),
    };
  });
}

// Registrations whose folder is gone hold no work: prune them and say which.
function pruneStale(repo) {
  // A detached worktree's commits live only in its registration; save them first.
  for (const w of listWorktrees(repo)) {
    if (w.branch || !w.head || w.locked || fs.existsSync(w.path)) continue;
    if (revCount(repo, [w.head, '--not', '--branches', '--remotes', '--glob=refs/gsd-t/kept/*']) === 0) continue;
    // Named by the commit alone: git accepts any commit id as a ref name, but not
    // every folder name (a space, a leading dot, "..").
    gitOk(repo, ['update-ref', `refs/gsd-t/kept/${w.head}`, w.head, '']);
  }
  const r = git(repo, ['worktree', 'prune', '--dry-run', '--verbose']);
  if (r.status !== 0) throw new Error(`git worktree prune --dry-run failed: ${r.err}`);
  const stale = lines(`${r.out}\n${r.err}`)
    .map((l) => l.match(/^Removing (?:worktrees\/)?([^:]+):/))
    .filter(Boolean)
    .map((m) => m[1]);
  if (stale.length) gitOk(repo, ['worktree', 'prune']);
  return stale;
}

// Bring origin's copies up to date so "pushed" means pushed now, not as of the
// last fetch. A fetch that fails halts: removal or a release on a stale view
// is the guess this exists to prevent.
function fetchOrigin(repo) {
  gitOk(repo, ['fetch', '--prune', '--quiet', 'origin']);
}

function integrationBranches(reg) {
  const set = new Set(Object.keys(reg.integration));
  for (const entry of Object.values(reg.worktrees)) {
    if (isObject(entry) && entry.target && entry.target !== reg.base) set.add(entry.target);
  }
  set.delete(reg.base);
  return set;
}

// ─── Same as main ────────────────────────────────────────────────────────────

function rebuildable(rel) {
  const parts = rel.split('/');
  if (parts.some((p) => REBUILDABLE.dirsAnywhere.includes(p))) return true;
  if (REBUILDABLE.files.includes(parts[parts.length - 1])) return true;
  if (REBUILDABLE.paths.some((p) => rel === p || rel.startsWith(`${p}/`))) return true;
  return rel.startsWith(REBUILDABLE.heartbeat.prefix) && rel.endsWith(REBUILDABLE.heartbeat.suffix) && !rel.includes('/', REBUILDABLE.heartbeat.prefix.length);
}

// True when p is the folder wt, or inside it. Compared by disk identity (device
// + file number), not path text: a case-different spelling or macOS's
// /System/Volumes/Data alias names the same folder with different text.
function insideFolder(p, wt) {
  let cur = p;
  for (;;) {
    const st = fs.statSync(cur);
    if (st.dev === wt.dev && st.ino === wt.ino) return true;
    const parent = path.dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}

// b is a real copy only if it does not resolve back into the worktree itself
// (a symlink in main pointing at the worktree would compare a file with itself).
function sameEntry(a, b, wtStat) {
  if (!fs.existsSync(b)) return false;
  if (insideFolder(fs.realpathSync(b), wtStat)) return false;
  const sa = fs.lstatSync(a);
  const sb = fs.lstatSync(b);
  if (sa.isSymbolicLink()) return sb.isSymbolicLink() && fs.readlinkSync(a) === fs.readlinkSync(b);
  if (!sa.isFile()) return false;
  if (!sb.isFile()) return false;
  if (sa.size !== sb.size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

// path → blob id for every file in the worktree's last commit (HEAD).
function headBlobs(wtPath) {
  const map = new Map();
  const r = spawnSync('git', ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], { cwd: wtPath, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`git ls-tree could not run in ${wtPath}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ls-tree failed in ${wtPath}: ${String(r.stderr).trim()}`);
  for (const rec of String(r.stdout).split('\0')) {
    const m = rec.match(/^\d+ blob (\S+)\t(.*)$/s);
    if (m) map.set(m[2], m[1]);
  }
  return map;
}

// The id git would give this file's bytes (a symlink's bytes are its target).
function blobId(abs, algo) {
  const st = fs.lstatSync(abs);
  const body = st.isSymbolicLink() ? Buffer.from(fs.readlinkSync(abs)) : fs.readFileSync(abs);
  return crypto.createHash(algo).update(`blob ${body.length}\0`).update(body).digest('hex');
}

/**
 * The first file in the worktree folder that would be lost by removing it, or
 * null when none would. Walked on disk — tracked, untracked and ignored alike,
 * nested worktrees included — so no git setting can hide a file. A file is safe
 * when it is rebuildable output (REBUILDABLE), when its bytes are exactly the
 * branch's last commit (that commit is merged, so the content lives in git), or
 * exactly the main checkout's copy at the same path. Only the worktree's own top-level `.git` link is skipped. Stops at the
 * first file that is neither.
 */
function firstDifference(wtPath, main) {
  const committed = headBlobs(wtPath);
  const algo = gitOk(wtPath, ['rev-parse', '--show-object-format']) === 'sha256' ? 'sha256' : 'sha1';
  const wtStat = fs.statSync(wtPath);
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const name of fs.readdirSync(path.join(wtPath, rel))) {
      const r = rel ? `${rel}/${name}` : name;
      if (r === '.git') continue;
      if (rebuildable(r)) continue;
      const abs = path.join(wtPath, r);
      const st = fs.lstatSync(abs);
      if (st.isDirectory()) { stack.push(r); continue; }
      if (!st.isFile() && !st.isSymbolicLink()) return r;
      if (committed.has(r) && blobId(abs, algo) === committed.get(r)) continue;
      if (!sameEntry(abs, path.join(main, r), wtStat)) return r;
    }
  }
  return null;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

/**
 * Everything about the repo's worktrees, branches and stashes.
 * opts.prune (default true) prunes stale registrations first.
 * opts.scope 'worktrees' limits branches to worktree + integration branches (the hook).
 */
function audit(dir, opts = {}) {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const main = mainCheckout(dir);
  const reg = readRegistry(main);
  const pruned = opts.prune === false ? [] : pruneStale(main);
  const hasRemote = remotes(main).length > 0;
  const integration = integrationBranches(reg);
  const worktrees = listWorktrees(main).map((w) => {
    const isMain = path.resolve(w.path) === path.resolve(main);
    const present = fs.existsSync(w.path);
    const out = { path: w.path, branch: w.branch, isMain, locked: w.locked, present, dirty: present ? dirtyCount(w.path) : null };
    // A detached worktree is on no branch: its own commits are reachable from nothing else.
    if (!isMain && !w.branch && present) out.orphanCommits = revCount(w.path, ['HEAD', '--not', '--branches', '--remotes']);
    return out;
  });
  const wtByBranch = new Map(worktrees.filter((w) => w.branch && !w.isMain).map((w) => [w.branch, w]));

  const local = localBranches(main);
  const names = local.slice();
  for (const b of integration) if (!local.includes(b) && branchRef(main, b)) names.push(b);
  const inScope = (b) => {
    if (opts.scope !== 'worktrees') return true;
    if (wtByBranch.has(b)) return true;
    return integration.has(b);
  };

  const branches = names.filter((b) => b !== reg.base).filter(inScope).map((name) => {
    const ref = branchRef(main, name);
    const entry = isObject(reg.worktrees[name]) ? reg.worktrees[name] : null;
    const target = entry && entry.target ? entry.target : reg.base;
    const tRef = branchRef(main, target);
    const merged = tRef ? isMerged(main, ref, tRef) : null;
    const wt = wtByBranch.has(name) ? wtByBranch.get(name) : null;
    const b = {
      name,
      local: ref.startsWith('refs/heads/'),
      worktree: wt ? wt.path : null,
      dirty: wt ? wt.dirty : null,
      started: hasStarted(main, ref),
      registered: Boolean(entry),
      purpose: entry && entry.purpose ? entry.purpose : null,
      session: entry && entry.session ? entry.session : null,
      target,
      targetFound: Boolean(tRef),
      merged,
      unpushed: unpushedCount(main, ref, hasRemote),
      unmergedSince: merged === false ? oldestUnmergedAt(main, ref, tRef) : null,
      integration: integration.has(name),
    };
    if (b.integration) {
      const baseRef = branchRef(main, reg.base);
      b.aheadOfBase = baseRef ? revCount(main, [`${baseRef}..${ref}`]) : null;
      b.reason = isObject(reg.integration[name]) && reg.integration[name].reason ? reg.integration[name].reason : null;
    }
    return b;
  });

  return {
    repo: main,
    base: reg.base,
    remote: hasRemote,
    pruned,
    worktrees,
    branches,
    stashes: listStashes(main, now),
    now,
  };
}

/** The session-start warnings, derived from an audit. */
function warnings(report) {
  const out = [];
  const staleBefore = report.now - STALE_DAYS * DAY_MS;
  for (const w of report.worktrees) {
    if (w.isMain || w.branch || !w.present) continue;
    if (w.orphanCommits > 0 || w.dirty > 0) {
      out.push(`detached worktree ${w.path}: ${w.orphanCommits} commit(s) on no branch, ${w.dirty} uncommitted change(s)`);
    }
  }
  for (const b of report.branches) {
    if (b.worktree) {
      if (b.unpushed > 0) out.push(`${b.name}: ${b.unpushed} commit(s) not pushed`);
      if (b.merged === false && b.unmergedSince !== null && b.unmergedSince < staleBefore) {
        out.push(`${b.name}: not merged into ${b.target} since ${new Date(b.unmergedSince).toISOString().slice(0, 10)}`);
      }
      if (b.merged === true && b.unpushed === 0 && b.dirty === 0 && b.started) {
        out.push(`${b.name}: merged into ${b.target}, worktree still at ${b.worktree} — removed at the next session start once no session is in it and every file matches main; now: gsd-t worktrees finish ${b.name} --remove`);
      }
      if (b.targetFound === false) out.push(`${b.name}: target branch ${b.target} not found`);
    }
    if (b.integration && b.aheadOfBase > 0) {
      out.push(`${b.name}: integration branch ${b.aheadOfBase} commit(s) ahead of ${report.base}${b.reason ? ` (reason: ${b.reason})` : ''}`);
    }
  }
  return out;
}

// ─── Finish ──────────────────────────────────────────────────────────────────

function isInside(dir, child) {
  const d = fs.realpathSync(dir);
  const c = fs.realpathSync(child);
  return c === d || c.startsWith(d + path.sep);
}

// Why this worktree must not be removed; empty when it is safe.
// opts.asked: the user named it, so the asking session may be inside it.
function blockers(b, wt, main, sessionDirs, opts) {
  const why = [];
  if (!wt.present) return [wt.locked ? 'folder missing (locked)' : 'folder missing'];
  if (!b.targetFound) why.push(`target branch ${b.target} not found`);
  if (b.merged === false) why.push(`not merged into ${b.target}`);
  if (!b.started) why.push('no commits of its own yet (not started)');
  if (wt.locked) why.push('locked (git worktree unlock to allow removal)');
  if (detect.isOccupied(wt.path, sessionDirs)) why.push('a Claude session is open in it');
  if (!opts.asked && isInside(wt.path, process.cwd())) why.push('this command is running inside it');
  if (why.length) return why;
  const diff = firstDifference(wt.path, main);
  if (diff) why.push(`${diff} exists only here (not in its last commit, not identical in the main checkout)`);
  return why;
}

/**
 * Worktrees whose branch is merged into its target and whose every file has an
 * identical copy in the main checkout. With opts.remove, removes them with
 * `git worktree remove` (never forced).
 *   opts.branch — only that worktree; the user asked, so their own session may sit in it.
 *   no branch   — every worktree with no Claude session open in it (the session-start sweep).
 */
function ownSessionOf(opts) {
  if (opts.ownSession !== undefined) return opts.ownSession;
  return detect.ownSession();
}

function finish(dir, opts = {}) {
  const main = mainCheckout(dir);
  const report = audit(main, { prune: true, scope: 'worktrees' });
  // Named: only the asking session (by pid) is excused; any other session in that folder still blocks.
  const sessions = opts.sessions ? opts.sessions : detect.interactiveClaudeSessions();
  const own = opts.branch ? ownSessionOf(opts) : null;
  const sessionDirs = opts.sessionDirs
    ? opts.sessionDirs
    : new Set(sessions.filter((x) => !own || x.pid !== own.pid).map((x) => x.dir));
  const wtByPath = new Map(report.worktrees.map((w) => [w.path, w]));
  let candidates = report.branches.filter((b) => b.worktree);
  if (opts.branch) {
    candidates = candidates.filter((b) => b.name === opts.branch);
    if (!candidates.length) throw new Error(`No worktree is on branch "${opts.branch}".`);
  }
  const result = { removable: [], blocked: [], removed: [], failed: [] };
  for (const b of candidates) {
    const why = blockers(b, wtByPath.get(b.worktree), main, sessionDirs, { asked: Boolean(opts.branch) });
    if (why.length) { result.blocked.push({ branch: b.name, path: b.worktree, merged: b.merged === true, started: b.started, why }); continue; }
    result.removable.push({ branch: b.name, path: b.worktree });
  }
  if (!opts.remove) return result;
  for (const r of result.removable) {
    // git refusing (an untracked file it will not delete without force) keeps
    // this worktree and is reported; the others are still removed.
    // git can also stop part-way (a read-only folder): the registration is gone
    // and some files deleted. Every file already passed the check, so nothing is
    // lost — it is recorded as removed and the leftover folder is named.
    const res = git(main, ['worktree', 'remove', r.path]);
    const partly = res.status !== 0 && !listWorktrees(main).some((w) => w.path === r.path);
    if (res.status !== 0 && !partly) { result.failed.push({ branch: r.branch, path: r.path, error: res.err }); continue; }
    if (!partly && fs.existsSync(r.path)) throw new Error(`git reported removing ${r.path} but the folder is still there.`);
    updateRegistry(main, (reg) => {
      if (isObject(reg.worktrees[r.branch])) reg.worktrees[r.branch].removedAt = new Date().toISOString();
    });
    if (partly) result.failed.push({ branch: r.branch, path: r.path, partly: true, error: res.err });
    else result.removed.push(r);
  }
  return result;
}

// One line for a removal git did not finish. Partly removed: no work is in it.
function failedLine(x, shown) {
  if (x.partly) return `${x.branch}: partly removed — git stopped part-way (${x.error}); nothing in it is unique, finish deleting ${shown} by hand`;
  return `${x.branch}: merged but kept — git refused to remove it: ${x.error}`;
}

// ─── Release check ───────────────────────────────────────────────────────────

/**
 * Fetch origin, push every local branch with commits on no remote, then list
 * integration branches ahead of base with no recorded reason. The caller
 * halts when `failed` or `unreasoned` is non-empty.
 */
function releaseCheck(dir) {
  const main = mainCheckout(dir);
  if (!remotes(main).includes('origin')) {
    return { pushed: [], failed: [{ branch: '(all)', error: 'no remote named origin' }], unreasoned: [] };
  }
  fetchOrigin(main);
  const report = audit(main, { prune: false });
  const pushed = [];
  const failed = [];
  const toPush = report.branches.filter((b) => b.local);
  if (refExists(main, heads(report.base))) {
    toPush.push({ name: report.base, unpushed: unpushedCount(main, heads(report.base), true) });
  }
  for (const b of toPush) {
    if (!(b.unpushed > 0)) continue;
    const spec = `${heads(b.name)}:${heads(b.name)}`;
    const args = hasUpstream(main, b.name) ? ['push', 'origin', spec] : ['push', '-u', 'origin', spec];
    const r = git(main, args);
    if (r.status === 0) pushed.push({ branch: b.name, commits: b.unpushed });
    else failed.push({ branch: b.name, error: r.err });
  }
  const unreasoned = report.branches
    .filter((b) => b.integration && b.aheadOfBase > 0 && !b.reason)
    .map((b) => ({ branch: b.name, ahead: b.aheadOfBase }));
  return { pushed, failed, unreasoned };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function tilde(p) {
  const home = os.homedir();
  return p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

function yesNo(v) {
  if (v === null) return '?';
  return v ? 'yes' : 'no';
}

function pushedText(b) {
  if (b.unpushed === null) return 'no remote';
  return b.unpushed === 0 ? 'yes' : `no (${b.unpushed})`;
}

function printAudit(r) {
  const say = (s) => process.stdout.write(s + '\n');
  say(`Worktrees audit — ${tilde(r.repo)} (base ${r.base})`);
  if (r.pruned.length) say(`Pruned ${r.pruned.length} stale registration(s) (folder gone): ${r.pruned.join(', ')}`);
  const dirtyOf = new Map(r.worktrees.map((w) => [w.path, w.dirty]));
  const mainWt = r.worktrees.find((w) => w.isMain);
  if (mainWt && mainWt.dirty > 0) say(`Main checkout: ${mainWt.dirty} uncommitted change(s)`);
  const withWt = r.branches.filter((b) => b.worktree);
  const without = r.branches.filter((b) => !b.worktree && b.local);
  const detached = r.worktrees.filter((w) => !w.isMain && !w.branch);
  const row = (b) => `  ${b.name}  → ${b.target}  merged: ${yesNo(b.merged)}  pushed: ${pushedText(b)}` +
    (b.worktree ? `  uncommitted: ${dirtyOf.get(b.worktree)}  ${tilde(b.worktree)}` : '') +
    (b.purpose ? `  "${b.purpose}"` : '');
  say(`\nWorktrees (${withWt.length + detached.length}):`);
  for (const b of withWt) say(row(b));
  for (const w of detached) {
    say(`  (detached)  ${w.present ? `commits on no branch: ${w.orphanCommits}  uncommitted: ${w.dirty}` : 'folder missing'}  ${tilde(w.path)}`);
  }
  say(`\nBranches without a worktree (${without.length}):`);
  for (const b of without) say(row(b));
  const integ = r.branches.filter((b) => b.integration);
  if (integ.length) {
    say(`\nIntegration branches:`);
    for (const b of integ) {
      say(`  ${b.name}${b.local ? '' : ' (origin only)'}  ahead of ${r.base}: ${b.aheadOfBase}  merged into ${r.base}: ${b.aheadOfBase === 0 ? 'yes' : 'no'}  reason: ${b.reason ? b.reason : '(none)'}`);
    }
  }
  if (r.stashes.length) {
    say(`\nStashes (${r.stashes.length}):`);
    for (const s of r.stashes) say(`  ${s.ref}  ${s.ageDays} day(s) old  ${s.subject}`);
  }
  const all = warnings(r);
  for (const b of without) if (b.unpushed > 0) all.push(`${b.name}: ${b.unpushed} commit(s) exist only on this machine`);
  for (const b of r.branches) if (b.integration && b.aheadOfBase > 0 && !b.reason) all.push(`${b.name}: integration branch not merged into ${r.base}, no reason recorded`);
  say(`\n${all.length ? `Needs attention (${all.length}):` : 'Nothing needs attention.'}`);
  for (const line of all) say(`  ⚠ ${line}`);
}

function argAfter(argv, flag) {
  const at = argv.indexOf(flag);
  if (at < 0) return null;
  const v = argv[at + 1];
  if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value.`);
  return v;
}

function positional(argv) {
  const flagsWithValue = new Set(['--purpose', '--target', '--reason']);
  for (let i = 0; i < argv.length; i++) {
    if (flagsWithValue.has(argv[i])) { i++; continue; }
    if (!argv[i].startsWith('--')) return argv[i];
  }
  return null;
}

function cli(argv) {
  const verb = argv[0];
  const rest = argv.slice(1);
  const cwd = fs.realpathSync(process.cwd());
  if (verb === 'audit') {
    const r = audit(cwd);
    if (rest.includes('--json')) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else printAudit(r);
    return 0;
  }
  if (verb === 'finish') {
    const branch = positional(rest);
    const remove = rest.includes('--remove');
    const main = mainCheckout(cwd);
    const r = finish(cwd, { branch, remove });
    for (const x of r.removed) {
      process.stdout.write(`Removed worktree ${tilde(x.path)} (${x.branch}); the branch is kept.\n`);
      if (cwd === x.path || cwd.startsWith(x.path + path.sep)) process.stdout.write(`This shell was inside it — continue in ${tilde(main)}.\n`);
    }
    if (!remove) {
      for (const x of r.removable) process.stdout.write(`Finished: ${x.branch} at ${tilde(x.path)} — remove with: gsd-t worktrees finish ${x.branch} --remove\n`);
    }
    for (const x of r.blocked) process.stdout.write(`Kept: ${x.branch} at ${tilde(x.path)} — ${x.why.join('; ')}\n`);
    for (const x of r.failed) process.stderr.write(`${failedLine(x, tilde(x.path))}\n`);
    if (!r.removable.length && !r.blocked.length) process.stdout.write('No worktrees to finish.\n');
    if (r.failed.length) return 1;
    return branch && r.blocked.length ? 1 : 0;
  }
  if (verb === 'set') {
    const branch = positional(rest);
    if (!branch) throw new Error('Usage: gsd-t worktrees set <branch> [--purpose <text>] [--target <branch>] [--reason <text>]');
    const purpose = argAfter(rest, '--purpose');
    const target = argAfter(rest, '--target');
    const reason = argAfter(rest, '--reason');
    if (!purpose && !target && !reason) throw new Error('Nothing to set — give --purpose, --target or --reason.');
    setBranch(cwd, branch, { purpose, target, reason });
    process.stdout.write(`Recorded for ${branch}.\n`);
    return 0;
  }
  if (verb === 'release-check') {
    const r = releaseCheck(cwd);
    for (const p of r.pushed) process.stdout.write(`Pushed ${p.branch} (${p.commits} commit(s))\n`);
    for (const f of r.failed) process.stderr.write(`HALT: push of ${f.branch} failed — ${f.error}\n`);
    for (const u of r.unreasoned) {
      process.stderr.write(`HALT: integration branch ${u.branch} is ${u.ahead} commit(s) ahead of main with no recorded reason — merge it, or record why: gsd-t worktrees set ${u.branch} --reason "<why>"\n`);
    }
    if (!r.pushed.length && !r.failed.length && !r.unreasoned.length) process.stdout.write('Every branch is pushed; no integration branch is waiting on main.\n');
    return r.failed.length || r.unreasoned.length ? 1 : 0;
  }
  process.stderr.write(
    'Usage: gsd-t worktrees audit [--json] | finish [<branch>] [--remove] | ' +
    'set <branch> [--purpose <text>] [--target <branch>] [--reason <text>] | release-check\n'
  );
  return 2;
}

module.exports = {
  failedLine,
  REGISTRY_REL,
  STALE_DAYS,
  REBUILDABLE,
  mainCheckout,
  readRegistry,
  recordWorktree,
  setBranch,
  stampSession,
  audit,
  warnings,
  finish,
  releaseCheck,
  cli,
};

function halt(e) {
  process.stderr.write(`[GSD-T WORKTREES] ${e.message}\n`);
  process.exit(1);
}

if (require.main === module) {
  let code;
  try {
    code = cli(process.argv.slice(2));
  } catch (e) {
    halt(e);
  }
  process.exit(code);
}
