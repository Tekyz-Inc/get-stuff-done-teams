'use strict';

/**
 * gsd-t-worktree-detect — is this folder a side copy of the repo (a linked
 * worktree), or the main checkout?
 *
 * Two callers need the same answer and must not drift apart:
 *   - bin/gsd-t-pick-worktree.cjs  — decides whether to route a session elsewhere
 *   - bin/cli-preflight-checks/branch-guard.cjs — the expected-branch rule
 *     governs the main tree only
 *
 * The answer comes from git itself: `--git-dir` is this checkout's own git
 * directory, `--git-common-dir` is the one shared by the whole repository. In a
 * linked worktree they differ (…/.git/worktrees/<name> vs …/.git); in the main
 * tree they are the same path. Asking git beats inferring from whether `.git`
 * happens to be a file or a directory — that inference is a guess about git's
 * storage, and git's own answer keeps holding when the storage is unusual.
 *
 * Pure inspection. Read-only, no writes, no network.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');

// A git call on a slow or network-mounted repository can hang forever. Every
// call here carries a limit so a stuck git cannot wedge a pre-flight check.
// (TD-182 covers the older untimed calls elsewhere; this file does not add to
// that debt.)
const GIT_TIMEOUT_MS = 5000;

function _git(args, cwd) {
  const stdout = execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: GIT_TIMEOUT_MS,
  });
  return String(stdout || '').trim();
}

/**
 * Is `dir` inside a linked worktree (a side copy) rather than the main checkout?
 *
 * Throws when git cannot answer — an unanswerable question is surfaced, never
 * softened into a default. Callers decide what to do with the failure; guessing
 * "not a worktree" here would let a real git problem read as an ordinary repo.
 *
 * @param {string} dir — directory to inspect
 * @returns {boolean}
 */
function isLinkedWorktree(dir) {
  const own = _git(['rev-parse', '--absolute-git-dir'], dir);
  const shared = _git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir);
  return path.resolve(own) !== path.resolve(shared);
}

/**
 * Folders an interactive Claude Code session is sitting in right now.
 *
 * `ps` prints a terminal name for a process attached to one and `??` for one
 * that is not. Subagents and `claude -p` runs have no terminal, so filtering on
 * that column leaves only real sessions. Throws when the process list cannot be
 * read — "nobody is there" must never be a guess.
 */
function interactiveClaudeDirs() {
  const ps = spawnSync('ps', ['-eo', 'pid=,tty=,comm='], { encoding: 'utf8' });
  if (ps.status !== 0) {
    throw new Error(
      `Cannot read the process list (${String(ps.stderr).trim() || 'ps failed'}), ` +
      `so a worktree already in use can't be ruled out.`
    );
  }
  const dirs = new Set();
  for (const line of String(ps.stdout).split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, tty, comm] = m;
    if (tty === '??' || tty === '?') continue;   // no terminal — not a session
    if (!/claude/i.test(comm)) continue;
    const d = cwdOfPid(pid);
    if (d) dirs.add(d);
  }
  return dirs;
}

// A process that exited between listing and inspection occupies nothing, so a
// pid lsof cannot report on is genuinely absent rather than unknown.
function cwdOfPid(pid) {
  const r = spawnSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  for (const line of String(r.stdout).split('\n')) {
    if (line.startsWith('n/')) return line.slice(1);
  }
  return null;
}

/**
 * The repo's linked worktrees (side copies), excluding the main checkout, the
 * harness's own `.claude/worktrees/` copies, and folders that no longer exist.
 * @returns {{path: string, branch: string}[]}
 */
function linkedWorktrees(repoDir) {
  const main = path.resolve(repoDir);
  const out = [];
  let cur = null;
  for (const line of _git(['worktree', 'list', '--porcelain'], repoDir).split('\n')) {
    if (line.startsWith('worktree ')) cur = { path: line.slice(9), branch: '(detached)' };
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === '' && cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((w) =>
    path.resolve(w.path) !== main &&
    !w.path.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`) &&
    fs.existsSync(w.path));
}

/** Is a session sitting in `dir` or anywhere below it? */
function isOccupied(dir, sessionDirs) {
  const d = path.resolve(dir);
  for (const s of sessionDirs) if (s === d || s.startsWith(d + path.sep)) return true;
  return false;
}

module.exports = {
  isLinkedWorktree,
  interactiveClaudeDirs,
  linkedWorktrees,
  isOccupied,
  // Test-only
  _git,
  GIT_TIMEOUT_MS,
};
