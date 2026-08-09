'use strict';

/**
 * gsd-t-worktree-provision — make a freshly created worktree actually runnable.
 *
 * `git worktree add` copies only what git tracks. Everything ignored stays
 * behind: the secrets in `.env`, the local settings, the installed
 * dependencies. The new folder looks complete and is not — tests fail on a
 * missing module, the app cannot reach its database, and the cause is invisible
 * because nothing reported a problem.
 *
 * Three kinds of ignored file, three different answers:
 *
 *   CARRY   — local configuration and secrets (.env, .npmrc, local settings).
 *             Small, and nothing works without them.
 *   SKIP    — per-session state (.gsd-t working files, heartbeats, briefs),
 *             build output, and OS junk. Copying another session's state is how
 *             two sessions come to believe they own the same work.
 *   INSTALL — dependencies. Not copied: rebuilt from the worktree's own
 *             lockfile, so the tree is self-contained and matches what it
 *             declares.
 *
 * Anything that cannot be read or copied is RECORDED and reported, never
 * skipped quietly. This module exists to stop a worktree being silently
 * incomplete, so hiding its own failures would defeat the point of it.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Local configuration and secrets. Matched on the basename, so a file at any
// depth is caught. `.env.example` is tracked by git and arrives on its own.
const CARRY_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
  '.env.production',
  '.env.production.local',
  '.envrc',
  '.npmrc',
  '.nvmrc',
  '.tool-versions',
  '.python-version',
  '.ruby-version',
  'secrets.json',
  'credentials.json',
  'service-account.json',
  'local.settings.json',
];

// Directories whose contents are per-session state, build output, or junk.
// Leading-segment match against the repo-relative path.
const SKIP_DIRS = [
  '.gsd-t',            // session state: briefs, heartbeats, watch state, cursors
  '.claude/worktrees', // the harness's own worktrees
  'node_modules',      // reinstalled, never copied
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'playwright-report',
  'test-results',
  '.pytest_cache',
];

const SKIP_FILES = ['.DS_Store', 'Thumbs.db'];

// A copy that silently truncates is worse than one that stops: a half-written
// .env fails in a way that looks like a config mistake.
const MAX_CARRY_BYTES = 5 * 1024 * 1024;

function _repoRelative(p) {
  return p.split(path.sep).join('/');
}

function _isUnder(rel, dir) {
  const clean = _repoRelative(rel).replace(/\/+$/, '');
  return clean === dir || clean.startsWith(dir + '/');
}

/**
 * Should this ignored path be carried into a new worktree?
 *
 * @param {string} rel — repo-relative path, forward slashes
 * @returns {'carry'|'skip'}
 */
function classify(rel) {
  const clean = _repoRelative(rel).replace(/^\.\//, '').replace(/\/+$/, '');
  const base = clean.split('/').pop();

  if (SKIP_FILES.includes(base)) return 'skip';
  for (const dir of SKIP_DIRS) {
    if (_isUnder(clean, dir)) return 'skip';
  }
  if (CARRY_FILES.includes(base)) return 'carry';
  return 'skip';
}

/**
 * Every ignored path git knows about, as repo-relative strings.
 *
 * Throws when git cannot answer at all — an unanswerable question surfaces.
 *
 * A directory git could not open is a different problem: git warns on stderr,
 * exits 0, and simply omits it. The listing then looks complete while a `.env`
 * inside that directory is invisible. Those warnings are returned alongside the
 * paths so the caller reports the gap instead of inheriting it.
 *
 * @returns {{paths: string[], unreadable: string[]}}
 */
function ignoredPaths(repoDir) {
  const r = spawnSync('git', ['status', '--ignored', '--porcelain'], {
    cwd: repoDir,
    encoding: 'utf8',
    timeout: 30000,
  });
  if (r.status !== 0) {
    throw new Error(
      'git status --ignored failed: ' + (String(r.stderr).trim() || 'unknown error')
    );
  }

  const paths = String(r.stdout)
    .split('\n')
    .filter((l) => l.startsWith('!! '))
    .map((l) => l.slice(3).trim())
    .filter(Boolean);

  const unreadable = String(r.stderr || '')
    .split('\n')
    .map((l) => l.match(/could not open directory '([^']+)'/))
    .filter(Boolean)
    .map((m) => m[1].replace(/\/+$/, ''));

  return { paths, unreadable };
}

/**
 * List the files under an ignored entry. git collapses an ignored directory to
 * one entry, so a `config/.env` inside it is only found by walking.
 *
 * A directory that cannot be read is recorded in `problems`: it may hold the
 * very config the worktree needs, and treating it as empty is exactly the
 * silent gap this module exists to prevent.
 *
 * @returns {{files: string[], problems: string[]}}
 */
function _expand(repoDir, rel) {
  const start = _repoRelative(rel).replace(/\/+$/, '');
  const files = [];
  const problems = [];

  let st;
  try {
    st = fs.statSync(path.join(repoDir, start));
  } catch (err) {
    problems.push(start + ': could not be inspected (' + ((err && err.message) || err) + ')');
    return { files, problems };
  }

  if (!st.isDirectory()) return { files: [start], problems };

  const walk = (dirRel) => {
    // A directory we would never carry from is not worth reading.
    if (SKIP_DIRS.some((d) => _isUnder(dirRel, d))) return;

    let found;
    try {
      found = fs.readdirSync(path.join(repoDir, dirRel), { withFileTypes: true });
    } catch (err) {
      problems.push(
        dirRel + ': could not be read (' + ((err && err.message) || err) +
        '), so any config inside it was not carried'
      );
      return;
    }
    for (const item of found) {
      const childRel = _repoRelative(path.join(dirRel, item.name));
      if (item.isDirectory()) walk(childRel);
      else files.push(childRel);
    }
  };

  walk(start);
  return { files, problems };
}

/**
 * Copy the local configuration a worktree needs, and report every decision.
 *
 * @returns {{carried: string[], skipped: number, problems: string[]}}
 */
function carryConfig(repoDir, destDir) {
  const carried = [];
  const problems = [];
  let skipped = 0;

  const listing = ignoredPaths(repoDir);

  // git omitted these entirely, so nothing below can see inside them.
  for (const dir of listing.unreadable) {
    if (SKIP_DIRS.some((d) => _isUnder(dir, d))) continue;
    problems.push(
      dir + ': git could not open it, so any config inside it was not carried'
    );
  }

  for (const entry of listing.paths) {
    const expanded = _expand(repoDir, entry);
    problems.push(...expanded.problems);

    for (const rel of expanded.files) {
      if (classify(rel) !== 'carry') {
        skipped += 1;
        continue;
      }

      const from = path.join(repoDir, rel);
      const to = path.join(destDir, rel);

      let stat;
      try {
        stat = fs.statSync(from);
      } catch (err) {
        problems.push(rel + ': ' + ((err && err.message) || err));
        continue;
      }
      if (stat.size > MAX_CARRY_BYTES) {
        problems.push(rel + ': larger than expected for a config file, left behind');
        continue;
      }

      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        // Secrets keep their permissions; a world-readable .env in a new folder
        // is a leak the copy would have introduced.
        fs.chmodSync(to, stat.mode & 0o777);
        carried.push(rel);
      } catch (err) {
        problems.push(rel + ': ' + ((err && err.message) || err));
      }
    }
  }

  return { carried, skipped, problems };
}

/**
 * Rebuild dependencies from the worktree's own lockfile.
 *
 * Reinstalled rather than copied so the tree is self-contained: a symlink to
 * the main checkout makes a lockfile change in one tree silently alter the
 * other, and a copy can carry a build compiled against different versions.
 *
 * A project with no package manifest has nothing to install — that is a fact
 * about the project, not a failure to work around.
 *
 * @returns {{ran: boolean, ok: boolean, manager: string|null, msg: string}}
 */
function installDeps(destDir, opts) {
  const shouldRun = opts && opts.run === false ? false : true;
  const has = (f) => fs.existsSync(path.join(destDir, f));

  let manager = null;
  let args = null;
  if (has('pnpm-lock.yaml')) { manager = 'pnpm'; args = ['install', '--frozen-lockfile']; }
  else if (has('yarn.lock')) { manager = 'yarn'; args = ['install', '--immutable']; }
  else if (has('package-lock.json')) { manager = 'npm'; args = ['ci']; }
  else if (has('package.json')) { manager = 'npm'; args = ['install']; }

  const nothingToInstall = manager === null;
  if (nothingToInstall) {
    return { ran: false, ok: true, manager: null, msg: 'no package manifest — nothing to install' };
  }

  if (shouldRun === false) {
    return { ran: false, ok: true, manager, msg: `would run: ${manager} ${args.join(' ')}` };
  }

  const r = spawnSync(manager, args, {
    cwd: destDir,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
  });

  if (r.status !== 0) {
    return {
      ran: true,
      ok: false,
      manager,
      msg:
        `${manager} ${args.join(' ')} failed: ` +
        (String(r.stderr || '').trim().split('\n').slice(-3).join(' ') || 'unknown error'),
    };
  }
  return { ran: true, ok: true, manager, msg: `${manager} ${args.join(' ')} completed` };
}

/**
 * Provision a newly created worktree: carry local config, install dependencies.
 *
 * Returns what happened rather than throwing on a partial result — the caller
 * must SHOW `config.problems` and a failed install. A worktree missing its
 * config looks usable and is not, which is the whole failure this prevents.
 */
function provision(repoDir, destDir, opts) {
  const install = opts && opts.install === false ? false : true;
  const config = carryConfig(repoDir, destDir);
  const deps = installDeps(destDir, { run: install });
  return { config, deps };
}

module.exports = {
  provision,
  carryConfig,
  installDeps,
  ignoredPaths,
  classify,
  CARRY_FILES,
  SKIP_DIRS,
  MAX_CARRY_BYTES,
};
