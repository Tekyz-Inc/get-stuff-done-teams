'use strict';

/**
 * working-tree-state — git working tree clean or matches dirtyTreeWhitelist.
 *
 * Severity: warn.
 *
 * Reads `dirtyTreeWhitelist: string[]` from `.gsd-t/.unattended/config.json`.
 * Each dirty path from `git status --porcelain` must match the whitelist for
 * the check to pass. Whitelist patterns use simple glob:
 *   - `**`  matches any sequence of characters (including `/`)
 *   - `*`   matches any non-`/` segment
 *   - everything else is literal
 *
 * If the working tree is clean, the check passes with no whitelist consulted.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ID = 'working-tree-state';

function _readWhitelist(projectDir) {
  const cfgPath = path.join(projectDir, '.gsd-t', '.unattended', 'config.json');
  if (!fs.existsSync(cfgPath)) return [];
  let raw;
  try { raw = fs.readFileSync(cfgPath, 'utf8'); } catch (_) { return []; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return []; }
  const list = parsed && parsed.dirtyTreeWhitelist;
  if (!Array.isArray(list)) return [];
  return list.filter((s) => typeof s === 'string' && s.length > 0);
}

function _porcelain(projectDir) {
  const stdout = execSync('git status --porcelain', {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return String(stdout || '');
}

function _parseDirtyPaths(porcelain) {
  // `git status --porcelain` output: "XY path" or "XY path1 -> path2" (rename).
  // We take the (final) path; X/Y are status codes.
  const out = [];
  const lines = porcelain.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.length < 4) continue;
    let rest = line.slice(3);
    // Handle quoted paths from git (when path contains special chars).
    if (rest.startsWith('"') && rest.endsWith('"')) {
      rest = rest.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    // Handle rename: "old -> new"
    const renameIdx = rest.indexOf(' -> ');
    if (renameIdx >= 0) rest = rest.slice(renameIdx + 4);
    out.push(rest);
  }
  return out;
}

function _globToRegex(glob) {
  // Escape regex specials except `*`, then expand `*` semantics.
  // Use a placeholder dance so `**` becomes `.*` and `*` becomes `[^/]*`.
  let s = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      s += '.*';
      i += 2;
      // Swallow optional trailing slash so `foo/**` matches `foo/anything`
      // and also exactly `foo` is NOT matched (whitelisting expects the dir
      // contents). Simpler semantic: just .* — caller can decide.
      continue;
    }
    if (ch === '*') {
      s += '[^/]*';
      i++;
      continue;
    }
    if (/[.+^${}()|[\]\\?]/.test(ch)) {
      s += '\\' + ch;
      i++;
      continue;
    }
    s += ch;
    i++;
  }
  return new RegExp('^' + s + '$');
}

function _matchesAny(p, patterns) {
  for (const pat of patterns) {
    if (_globToRegex(pat).test(p)) return true;
  }
  return false;
}

function run({ projectDir }) {
  let porcelain;
  try {
    porcelain = _porcelain(projectDir);
  } catch (err) {
    return {
      ok: false,
      msg: 'git status failed: ' + (err && err.message || err),
    };
  }
  const dirty = _parseDirtyPaths(porcelain);
  if (dirty.length === 0) {
    return { ok: true, msg: 'working tree clean' };
  }

  const whitelist = _readWhitelist(projectDir);
  const unmatched = dirty.filter((p) => !_matchesAny(p, whitelist));

  if (unmatched.length === 0) {
    return {
      ok: true,
      msg: 'working tree dirty (' + dirty.length + ' path(s)) but all whitelisted',
      details: { dirty: dirty.length, whitelisted: dirty.length },
    };
  }

  return {
    ok: false,
    msg: unmatched.length + ' dirty path(s) outside whitelist',
    details: {
      dirty: dirty.length,
      unmatched,
      whitelist,
    },
  };
}

module.exports = {
  id: ID,
  severity: 'warn',
  run,
  // Test-only exports
  _readWhitelist,
  _parseDirtyPaths,
  _globToRegex,
  _matchesAny,
};
