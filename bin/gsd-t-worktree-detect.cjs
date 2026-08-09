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
const { execFileSync } = require('child_process');

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

module.exports = {
  isLinkedWorktree,
  // Test-only
  _git,
  GIT_TIMEOUT_MS,
};
