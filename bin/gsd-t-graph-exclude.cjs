'use strict';
/**
 * gsd-t-graph-exclude.cjs — per-project exclude list for the code graph.
 *
 * Some repos carry large trees that are not the production application —
 * design exports, Figma-generated component dumps, prototypes, archived
 * scripts. They bloat the index, slow SCIP, and put look-alike symbols into
 * who-calls. A project lists them in `.gsd-t/graph-exclude.json`:
 *
 *   { "exclude": ["design/", "figma-exports/**", "scripts/archive/", "**\/*.figma.tsx"] }
 *
 * Pattern rules (paths are repo-relative, forward slashes, matched case-insensitively):
 *   - no `*`            → a path prefix: "design/" or "design" excludes that folder
 *   - `*`               → any run of characters except "/"
 *   - `**`              → any run of characters including "/"
 *
 * The indexer AND the freshness walker both read this module, so a file the
 * indexer skipped never shows up as a phantom "new file" on the next query.
 * [RULE] freshness-excludes-match-indexer-skipdirs
 *
 * A malformed file HALTS (throws): silently ignoring it would index exactly the
 * trees the user asked to keep out, with nothing saying so.
 */

const fs = require('fs');
const path = require('path');

const EXCLUDE_FILE = path.join('.gsd-t', 'graph-exclude.json');
const REGEX_SPECIALS = /[.+?^${}()|[\]\\]/g;

function toRegex(pattern) {
  const p = String(pattern).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (!p) return null;
  if (!p.includes('*')) {
    // Plain prefix: the path itself, or anything under it.
    const base = p.replace(/\/+$/, '').replace(REGEX_SPECIALS, '\\$&');
    return new RegExp(`^${base}(/|$)`, 'i');
  }
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      i++;
      if (p[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(REGEX_SPECIALS, '\\$&');
  }
  return new RegExp(`^${re}(/|$)`, 'i');
}

function validateList(parsed) {
  const list = parsed ? parsed.exclude : undefined;
  if (!Array.isArray(list)) return false;
  return list.every((x) => typeof x === 'string');
}

/**
 * Load the project's exclude list. Throws on a malformed file.
 * @returns {{ patterns: string[], source: string|null, isExcluded: (relPath: string) => boolean }}
 */
function loadGraphExcludes(projectRoot) {
  const file = path.join(projectRoot, EXCLUDE_FILE);
  if (!fs.existsSync(file)) return { patterns: [], source: null, isExcluded: () => false };
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${EXCLUDE_FILE} is not valid JSON (${e.message}) — fix it or delete it`); }
  if (!validateList(parsed)) {
    throw new Error(`${EXCLUDE_FILE} must be { "exclude": ["folder/", "glob/**", ...] }`);
  }
  const regexes = parsed.exclude.map(toRegex).filter(Boolean);
  return {
    patterns: parsed.exclude,
    source: EXCLUDE_FILE,
    isExcluded: (relPath) => {
      const rel = String(relPath).split(path.sep).join('/');
      return regexes.some((r) => r.test(rel));
    },
  };
}

module.exports = { loadGraphExcludes, EXCLUDE_FILE, _toRegex: toRegex };
