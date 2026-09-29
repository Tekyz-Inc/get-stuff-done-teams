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
 *
 * DEFAULT exclude (no file needed): GSD-T's own tools, which `gsd-t update-all`
 * copies into every project's bin/ (PROJECT_BIN_TOOLS in bin/gsd-t.js). They are
 * not the project's code; indexed, they put GSD-T's functions into its who-calls.
 * Not applied in GSD-T's own repo, where bin/ IS the application. The pattern is
 * checked against PROJECT_BIN_TOOLS by test/graph-drizzle-tables.test.js.
 * [RULE] graph-excludes-gsdt-copied-tools-by-default
 */

const fs = require('fs');
const path = require('path');

const EXCLUDE_FILE = path.join('.gsd-t', 'graph-exclude.json');
const REGEX_SPECIALS = /[.+?^${}()|[\]\\]/g;
const GSDT_TOOL_FILES = /^bin\/(gsd-t-[^/]+|archive-progress|cli-preflight|parallel-cli|parallel-cli-tee)\.cjs$/i;
const GSDT_TOOL_DEFAULT = "bin/<GSD-T's copied tools: gsd-t-*.cjs, archive-progress.cjs, cli-preflight.cjs, parallel-cli*.cjs>";

/** GSD-T's own source repo — its bin/ is the application, never excluded. */
function isGsdtSourceRepo(projectRoot) {
  const pkg = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkg)) return false;
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(pkg, 'utf8')); }
  catch (e) { throw new Error(`package.json is not valid JSON (${e.message}) — cannot tell whether bin/ holds GSD-T's copied tools`); }
  return parsed !== null && parsed.name === '@tekyzinc/gsd-t';
}

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
  const toolsExcluded = !isGsdtSourceRepo(projectRoot);
  const defaults = toolsExcluded ? [GSDT_TOOL_DEFAULT] : [];
  const isDefault = (rel) => toolsExcluded && GSDT_TOOL_FILES.test(rel);
  if (!fs.existsSync(file)) {
    return { patterns: [], defaults, source: null, isExcluded: (relPath) => isDefault(String(relPath).split(path.sep).join('/')) };
  }
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${EXCLUDE_FILE} is not valid JSON (${e.message}) — fix it or delete it`); }
  if (!validateList(parsed)) {
    throw new Error(`${EXCLUDE_FILE} must be { "exclude": ["folder/", "glob/**", ...] }`);
  }
  const regexes = parsed.exclude.map(toRegex).filter(Boolean);
  return {
    patterns: parsed.exclude,
    defaults,
    source: EXCLUDE_FILE,
    isExcluded: (relPath) => {
      const rel = String(relPath).split(path.sep).join('/');
      return isDefault(rel) || regexes.some((r) => r.test(rel));
    },
  };
}

module.exports = { loadGraphExcludes, EXCLUDE_FILE, GSDT_TOOL_FILES, _toRegex: toRegex };
