'use strict';
/**
 * GSD-T Capture Lint (M41 D5)
 *
 * Scans files for bare subagent spawn patterns that bypass the
 * `bin/gsd-t-token-capture.cjs` wrapper. Flags:
 *   - `Task(` without captureSpawn/recordSpawnRow within ±20 lines
 *   - `claude -p` executable lines without wrapper
 *   - `spawn('claude', ...)` / `spawn("claude", ...)` without wrapper
 *
 * Whitelisted:
 *   - The wrapper module itself (bin/gsd-t-token-capture.cjs)
 *   - The linter (bin/gsd-t-capture-lint.cjs) — meta-self
 *   - Anything under test/
 *   - Comment-only lines (//, #, <!--)
 *   - Markdown prose lines (only matches inside ``` fences are executable)
 *   - Any line carrying the literal `GSD-T-CAPTURE-LINT: skip` on the same
 *     or adjacent line
 *
 * Zero external deps. `.cjs` for ESM/CJS compat.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Patterns match tool-invocation syntax, not prose. `Task(s)` in a markdown
// table and `claude -p` inside a help-text string are false positives and
// are excluded by the shape matchers below.
const SPAWN_PATTERNS = [
  // Task({...}) or Task(\n — the Task subagent tool invocation shape.
  // Excludes Task(s), Task(X), Task(foo) plain-identifier calls which
  // are almost always docs/markdown.
  { name: 'Task(', re: /\bTask\(\s*(?:\{|$)/ },
  // spawn('claude', ...) / spawn("claude", ...)
  { name: "spawn('claude'", re: /\bspawn\(\s*['"]claude['"]\s*,/ },
  // `claude -p` as an actual shell command — not inside string literals
  // that describe it. Require it to appear outside quotes/backticks. This
  // is heuristic; the skip marker and comment-line guard catch the rest.
  { name: 'claude -p', re: /(?:^|\s|[;&|`$(])claude\s+-p\b/ },
];

const WRAPPER_PATTERNS = /\bcaptureSpawn\s*\(|\brecordSpawnRow\s*\(/;
const SKIP_MARKER = 'GSD-T-CAPTURE-LINT: skip';
const CONTEXT_RADIUS = 20;

function _isWhitelistedPath(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.endsWith('bin/gsd-t-token-capture.cjs')) return true;
  if (norm.endsWith('bin/gsd-t-capture-lint.cjs')) return true;
  // commands/gsd-t-help.md is a pure-prose help reference — every mention
  // of `claude -p` or `Task(...)` in it is documentation, not a live spawn.
  if (norm.endsWith('commands/gsd-t-help.md')) return true;
  if (norm.startsWith('test/') || norm.includes('/test/')) return true;
  return false;
}

function _isCommentOnlyLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('//')) return true;
  if (t.startsWith('#')) return true;
  if (t.startsWith('<!--')) return true;
  if (t.startsWith('*')) return true;
  return false;
}

/**
 * Check whether `match` starts inside a string literal (single, double, or
 * backtick-quoted) on `line`. Conservative: only flags balanced-quote cases.
 * This catches help-text strings like `log("... claude -p ...")` without
 * needing a full JS parser.
 */
function _matchInsideStringLiteral(line, match) {
  const idx = line.indexOf(match);
  if (idx < 0) return false;
  const prefix = line.slice(0, idx);
  const countUnescaped = (ch) => {
    let n = 0;
    for (let i = 0; i < prefix.length; i++) {
      if (prefix[i] === ch && prefix[i - 1] !== '\\') n++;
    }
    return n;
  };
  // Odd count before the match → inside an open string
  if (countUnescaped('"') % 2 === 1) return true;
  if (countUnescaped("'") % 2 === 1) return true;
  if (countUnescaped('`') % 2 === 1) return true;
  return false;
}

/**
 * For markdown files, match patterns only inside ``` fenced code blocks.
 * For non-markdown files, all lines are "executable" (fence tracking is
 * a no-op).
 */
function _buildFenceMap(lines, isMarkdown) {
  const inFence = new Array(lines.length).fill(!isMarkdown);
  if (!isMarkdown) return inFence;
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('```')) {
      open = !open;
      inFence[i] = false;
      continue;
    }
    inFence[i] = open;
  }
  return inFence;
}

function _hasWrapperNearby(lines, idx) {
  const lo = Math.max(0, idx - CONTEXT_RADIUS);
  const hi = Math.min(lines.length - 1, idx + CONTEXT_RADIUS);
  for (let j = lo; j <= hi; j++) {
    if (WRAPPER_PATTERNS.test(lines[j])) return true;
  }
  return false;
}

function _hasSkipMarkerNearby(lines, idx) {
  const lo = Math.max(0, idx - 1);
  const hi = Math.min(lines.length - 1, idx + 1);
  for (let j = lo; j <= hi; j++) {
    if (lines[j].includes(SKIP_MARKER)) return true;
  }
  return false;
}

/**
 * Lint a single file. Returns an array of violation objects.
 * @param {string} absPath
 * @param {string} projectDir
 * @returns {Array<{file, line, pattern, message}>}
 */
function lintFile(absPath, projectDir) {
  const relPath = path.relative(projectDir, absPath);
  if (_isWhitelistedPath(relPath)) return [];

  let src;
  try {
    src = fs.readFileSync(absPath, 'utf8');
  } catch (_) {
    return [];
  }

  const lines = src.split('\n');
  const isMarkdown = absPath.endsWith('.md');
  const executable = _buildFenceMap(lines, isMarkdown);

  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    if (!executable[i]) continue;
    const line = lines[i];
    if (_isCommentOnlyLine(line)) continue;
    if (_hasSkipMarkerNearby(lines, i)) continue;

    for (const { name, re } of SPAWN_PATTERNS) {
      const m = line.match(re);
      if (m) {
        // Skip prose mentions inside string literals (help text, log strings).
        // Markdown files already gate via fence map; only apply the quote
        // heuristic to JS/CJS source where help-text strings live.
        if (!isMarkdown && _matchInsideStringLiteral(line, m[0])) break;
        if (!_hasWrapperNearby(lines, i)) {
          violations.push({
            file: relPath,
            line: i + 1,
            pattern: name,
            message: `bare ${name} spawn without captureSpawn/recordSpawnRow wrapper`,
          });
        }
        break;
      }
    }
  }

  return violations;
}

/**
 * Lint a list of paths.
 * @param {string[]} paths       Absolute or relative to projectDir
 * @param {object}   opts
 * @param {string}   opts.projectDir
 * @returns {{violations: Array}}
 */
function lintFiles(paths, opts) {
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const all = [];
  for (const p of paths) {
    const abs = path.isAbsolute(p) ? p : path.join(projectDir, p);
    if (!fs.existsSync(abs)) continue;
    const st = fs.statSync(abs);
    if (!st.isFile()) continue;
    all.push(...lintFile(abs, projectDir));
  }
  return { violations: all };
}

function _listStaged(projectDir) {
  let out;
  try {
    out = execSync('git diff --name-only --cached', { cwd: projectDir, encoding: 'utf8' });
  } catch (_) {
    return [];
  }
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((p) => /^(commands|bin|scripts)\//.test(p));
}

function _listAll(projectDir) {
  const results = [];
  const dirs = [
    { dir: 'commands', exts: ['.md'] },
    { dir: 'bin',      exts: ['.js', '.cjs'] },
    { dir: 'scripts',  exts: ['.js', '.cjs', '.html'] },
  ];
  for (const { dir, exts } of dirs) {
    const abs = path.join(projectDir, dir);
    if (!fs.existsSync(abs)) continue;
    const entries = fs.readdirSync(abs);
    for (const entry of entries) {
      const p = path.join(abs, entry);
      try {
        const st = fs.statSync(p);
        if (!st.isFile()) continue;
      } catch (_) { continue; }
      if (exts.some((e) => entry.endsWith(e))) {
        results.push(path.join(dir, entry));
      }
    }
  }
  return results;
}

/**
 * CLI entry point.
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {'staged'|'all'} opts.mode
 * @returns {{exitCode: number, violations: Array, files: string[]}}
 */
function main(opts) {
  const projectDir = opts.projectDir || process.cwd();
  const mode = opts.mode || 'staged';
  let files;
  try {
    files = mode === 'all' ? _listAll(projectDir) : _listStaged(projectDir);
  } catch (e) {
    return { exitCode: 2, violations: [], files: [], error: e.message || String(e) };
  }
  const { violations } = lintFiles(files, { projectDir });
  return {
    exitCode: violations.length === 0 ? 0 : 1,
    violations,
    files,
  };
}

module.exports = {
  lintFile,
  lintFiles,
  main,
  SPAWN_PATTERNS,
  _isWhitelistedPath,
  _isCommentOnlyLine,
  _buildFenceMap,
  _hasWrapperNearby,
  _hasSkipMarkerNearby,
  _matchInsideStringLiteral,
};
