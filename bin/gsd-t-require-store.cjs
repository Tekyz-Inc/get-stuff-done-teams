/**
 * gsd-t-require-store.cjs
 *
 * M96 — Robust resolver for the graph runtime's NATIVE dependencies
 * (better-sqlite3, tree-sitter, tree-sitter-typescript, tree-sitter-python).
 *
 * The graph runtime tools (gsd-t-graph-index / -freshness / -query-cli /
 * -edge-extract) are COPIED into each project's `bin/` by update-all. A copied
 * tool's bare `require('better-sqlite3')` / `require('tree-sitter')` resolves
 * from the PROJECT's node_modules — which usually lacks these native modules.
 * This helper resolves a module from, in order:
 *   1. the normal resolution from this file's location
 *   2. the project's own node_modules (cwd-based)
 *   3. the GSD-T global package's node_modules (where `dependencies` install)
 *   4. the GSD-T dev tree (this repo), a last-resort dev fallback
 *
 * All four are GSD-T `dependencies` (M96), so candidate 3 is the normal hit for a
 * propagated copy. FAIL LOUD with a remediation message if all miss — never a
 * cryptic MODULE_NOT_FOUND, and never a SILENT degrade to an empty graph.
 *
 * [RULE] graph-native-dep-resolved-or-fail-loud
 */

'use strict';

const path = require('node:path');
const { execSync } = require('node:child_process');

const _cache = new Map();
let _gsdtGlobalRoot; // memoized `npm root -g`/@tekyzinc/gsd-t

function gsdtGlobalNodeModules() {
  if (_gsdtGlobalRoot !== undefined) return _gsdtGlobalRoot;
  try {
    const groot = execSync('npm root -g', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    _gsdtGlobalRoot = path.join(groot, '@tekyzinc', 'gsd-t', 'node_modules');
  } catch {
    _gsdtGlobalRoot = null;
  }
  return _gsdtGlobalRoot;
}

/**
 * Resolve and require a native graph dependency from any known location.
 * @param {string} moduleName  e.g. 'better-sqlite3', 'tree-sitter'
 * @returns {*} the required module
 * @throws {Error} a clear, actionable error if it cannot be found anywhere
 */
function requireGraphDep(moduleName) {
  if (_cache.has(moduleName)) return _cache.get(moduleName);

  const tried = [];

  // 1. Normal resolution (this file's own module graph).
  try {
    const m = require(moduleName);
    _cache.set(moduleName, m);
    return m;
  } catch { tried.push('local module graph'); }

  // 2–4. Explicit candidate directories.
  const candidates = [
    path.join(process.cwd(), 'node_modules', moduleName),                 // 2. project
    gsdtGlobalNodeModules() ? path.join(gsdtGlobalNodeModules(), moduleName) : null, // 3. global pkg
    path.join(__dirname, '..', 'node_modules', moduleName),               // 4. GSD-T dev tree
  ].filter(Boolean);

  for (const c of candidates) {
    tried.push(c);
    try {
      const m = require(c);
      _cache.set(moduleName, m);
      return m;
    } catch { /* try next */ }
  }

  throw new Error(
    `graph dependency '${moduleName}' unavailable — the code graph cannot run. ` +
    'Reinstall GSD-T (npx @tekyzinc/gsd-t install) so the native graph deps are present. ' +
    `Searched: ${tried.join(' | ')}`
  );
}

/** Back-compat convenience for the store engine. */
function requireBetterSqlite() {
  return requireGraphDep('better-sqlite3');
}

module.exports = { requireGraphDep, requireBetterSqlite };
