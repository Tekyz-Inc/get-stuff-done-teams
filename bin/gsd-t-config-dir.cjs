'use strict';

/**
 * gsd-t-config-dir — share one GSD-T setup across several Claude Code config dirs.
 *
 * Claude Code reads CLAUDE_CONFIG_DIR, and each config dir keeps its own login,
 * so a second account (e.g. a team plan for one client's projects) lives in a
 * second dir such as ~/.claude-hilo. That dir starts empty: no CLAUDE.md, no
 * hooks, no GSD-T commands, no memories.
 *
 * `link` points the shared pieces of the second dir back at ~/.claude, so
 * GSD-T keeps installing into ONE real place and every account sees it. The
 * account's own files (.claude.json, credentials) are never in SHARED, so they
 * are never touched.
 *
 * Direction is fixed: real files in ~/.claude, links in the other dir. The
 * installer halts on symlinks inside ~/.claude, so the reverse would break it.
 *
 * Every conflict is found BEFORE anything changes; a conflict halts the whole
 * run with the fix, never a partial link set.
 */

const fs = require('fs');
const path = require('path');

/** What the second dir shares with ~/.claude. Login files are deliberately absent. */
const SHARED = [
  'CLAUDE.md',
  'settings.json',
  'commands',
  'scripts',
  'bin',
  'templates',
  'skills',
  'agents',
  'projects',
];

/** Registry of linked dirs, read by `gsd-t doctor`. */
const REGISTRY = '.gsd-t-config-dirs';

/**
 * Real path of p, resolving through its nearest existing ancestor when p does
 * not exist yet — so a not-yet-created dir under a symlinked parent (macOS
 * /var → /private/var) still compares correctly against ~/.claude.
 */
function realOrSelf(p) {
  const abs = path.resolve(p);
  if (fs.existsSync(abs)) return fs.realpathSync(abs);
  const parent = path.dirname(abs);
  if (parent === abs) return abs;
  return path.join(realOrSelf(parent), path.basename(abs));
}

function isInside(child, parent) {
  return child.startsWith(parent + path.sep);
}

/** Refuse a target that is ~/.claude, inside it, contains it, or is itself a link. */
function validateTarget(claudeDir, target) {
  const root = realOrSelf(claudeDir);
  const abs = path.resolve(target);
  if (fs.existsSync(abs) && fs.lstatSync(abs).isSymbolicLink()) {
    return `${abs} is a symlink — use a real directory`;
  }
  const real = realOrSelf(abs);
  if (real === root) return `${abs} is ~/.claude itself`;
  if (isInside(real, root)) return `${abs} is inside ~/.claude`;
  if (isInside(root, real)) return `${abs} contains ~/.claude`;
  return null;
}

/** One row per shared item: what exists today and what linking would do. */
function planLinks(claudeDir, target) {
  return SHARED.map((name) => {
    const src = path.join(claudeDir, name);
    const dst = path.join(path.resolve(target), name);
    if (!fs.existsSync(src)) return { name, src, dst, state: 'absent' };
    let st = null;
    try { st = fs.lstatSync(dst); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!st) return { name, src, dst, state: 'create' };
    if (st.isSymbolicLink()) {
      const points = path.resolve(path.dirname(dst), fs.readlinkSync(dst));
      if (realOrSelf(points) === realOrSelf(src)) return { name, src, dst, state: 'ok' };
      return { name, src, dst, state: 'conflict', reason: `links to ${points}, not ${src}` };
    }
    return { name, src, dst, state: 'conflict', reason: 'a real file or folder is already there' };
  });
}

function readRegistry(claudeDir) {
  const f = path.join(claudeDir, REGISTRY);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}

function addToRegistry(claudeDir, target) {
  const abs = path.resolve(target);
  const dirs = readRegistry(claudeDir);
  if (dirs.includes(abs)) return;
  fs.writeFileSync(path.join(claudeDir, REGISTRY), dirs.concat(abs).join('\n') + '\n');
}

/**
 * Link `target` to `claudeDir`. Returns { ok, error?, rows }.
 * Nothing is written unless every row is `create`, `ok` or `absent`.
 */
function linkConfigDir(claudeDir, target) {
  const bad = validateTarget(claudeDir, target);
  if (bad) return { ok: false, error: bad, rows: [] };
  const rows = planLinks(claudeDir, target);
  if (rows.some((r) => r.state === 'conflict')) return { ok: false, error: 'conflicts', rows };
  fs.mkdirSync(path.resolve(target), { recursive: true });
  for (const r of rows) {
    if (r.state === 'create') fs.symlinkSync(r.src, r.dst);
  }
  addToRegistry(claudeDir, target);
  return { ok: true, rows };
}

/** Problems across every registered dir, for doctor. Empty list = healthy. */
function checkConfigDirs(claudeDir) {
  const problems = [];
  for (const dir of readRegistry(claudeDir)) {
    if (!fs.existsSync(dir)) {
      problems.push({ dir, problem: 'directory is missing' });
      continue;
    }
    for (const r of planLinks(claudeDir, dir)) {
      if (r.state === 'create') problems.push({ dir, problem: `${r.name} is not linked yet` });
      if (r.state === 'conflict') problems.push({ dir, problem: `${r.name}: ${r.reason}` });
    }
  }
  return problems;
}

module.exports = {
  SHARED,
  REGISTRY,
  validateTarget,
  planLinks,
  linkConfigDir,
  checkConfigDirs,
  readRegistry,
};
