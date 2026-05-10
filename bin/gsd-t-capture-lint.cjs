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

// ─── M56 D5: stream-json universality lint ─────────────────────────────────
//
// The token-capture lint above enforces "every Task(...) / claude -p / spawn('claude', ...)
// goes through captureSpawn". This second lint enforces a different invariant:
// every claude -p / spawn('claude', ...) invocation MUST pass the
// `--output-format stream-json --verbose` flag pair so the orchestrator can
// observe progress in real time. Allowlist sites that genuinely don't emit
// user-watchable progress (probes measuring rate-limit envelope, single-word
// cache-warm pings, internal debug-loop summarizers) declare themselves via
// the `GSD-T-LINT: skip stream-json` marker comment with a reason.
//
// Contract: per memory feedback_claude_p_stream_json.md and the M56 partition
// charter. Surface mirrors the M41 capture-lint surface (same patterns,
// whitelist, skip-marker, fence-map, _matchInsideStringLiteral helpers).

// Patterns: spawn shapes that need --output-format stream-json. Only flag
// invocations that are actually `claude -p` runs — `claude --version`,
// `claude mcp add`, `claude doctor` etc. don't produce streamable progress.
// We require `-p` to appear in the spawn args (within ±15 lines for arg-array
// spreads) before flagging, mirroring how the M41 capture-lint applies.
const STREAM_JSON_SPAWN_PATTERNS = [
  // spawn('claude', ...) / spawn("claude", ...) — but only when -p is in the call
  { name: "spawn('claude') (no stream-json)", re: /\bspawn\(\s*['"]claude['"]\s*,/, requirePArg: true },
  // execFileSync('claude', ...) / execFile('claude', ...) — same -p requirement
  { name: "execFile('claude') (no stream-json)", re: /\bexec(?:File|FileSync)\(\s*['"]claude['"]\s*,/, requirePArg: true },
  // `claude -p` as an actual shell command — already requires -p in the regex
  { name: 'claude -p (no stream-json)', re: /(?:^|\s|[;&|`$(])claude\s+-p\b/, requirePArg: false },
];

const P_ARG_RADIUS = 15;
const P_ARG_RE = /['"`]-p['"`]/;

function _hasPArgNearby(lines, idx) {
  const lo = Math.max(0, idx - P_ARG_RADIUS);
  const hi = Math.min(lines.length - 1, idx + P_ARG_RADIUS);
  for (let j = lo; j <= hi; j++) {
    if (P_ARG_RE.test(lines[j])) return true;
  }
  return false;
}

// We require BOTH `--output-format` and `stream-json` near the spawn site.
// Looking ±20 lines (same window as wrapper detection) catches multi-line
// arg-array spreads. Fence map already restricts markdown matching.
const STREAM_JSON_FLAGS = /--output-format[\s\S]{0,80}stream-json|stream-json[\s\S]{0,80}--output-format/;
const STREAM_JSON_SKIP_MARKER = 'GSD-T-LINT: skip stream-json';
const STREAM_JSON_RADIUS = 20;

function _hasStreamJsonFlagNearby(lines, idx) {
  const lo = Math.max(0, idx - STREAM_JSON_RADIUS);
  const hi = Math.min(lines.length - 1, idx + STREAM_JSON_RADIUS);
  // Strip comment-only lines so a comment that mentions `--output-format
  // stream-json` (e.g. "// Deliberately omits the flag pair") doesn't trick
  // the lint into thinking the flag is actually wired.
  const codeLines = [];
  for (let j = lo; j <= hi; j++) {
    if (!_isCommentOnlyLine(lines[j])) codeLines.push(lines[j]);
  }
  const window = codeLines.join('\n');
  return STREAM_JSON_FLAGS.test(window);
}

function _hasStreamJsonSkipMarkerNearby(lines, idx) {
  const lo = Math.max(0, idx - STREAM_JSON_RADIUS);
  const hi = Math.min(lines.length - 1, idx + STREAM_JSON_RADIUS);
  for (let j = lo; j <= hi; j++) {
    if (lines[j].includes(STREAM_JSON_SKIP_MARKER)) return true;
  }
  return false;
}

/**
 * Lint a single file for stream-json universality.
 * @param {string} absPath
 * @param {string} projectDir
 * @returns {Array<{file, line, pattern, message}>}
 */
function streamJsonLintFile(absPath, projectDir) {
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
    if (_hasStreamJsonSkipMarkerNearby(lines, i)) continue;

    for (const { name, re, requirePArg } of STREAM_JSON_SPAWN_PATTERNS) {
      const m = line.match(re);
      if (m) {
        if (!isMarkdown && _matchInsideStringLiteral(line, m[0])) break;
        // Only flag if this is actually a `claude -p` invocation (not --version, mcp add, etc.)
        if (requirePArg && !_hasPArgNearby(lines, i)) break;
        if (!_hasStreamJsonFlagNearby(lines, i)) {
          violations.push({
            file: relPath,
            line: i + 1,
            pattern: name,
            message: `${name}: missing --output-format stream-json --verbose flag pair (or skip marker)`,
          });
        }
        break;
      }
    }
  }

  return violations;
}

/**
 * Lint a list of paths for stream-json universality.
 */
function streamJsonLintFiles(paths, opts) {
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const all = [];
  for (const p of paths) {
    const abs = path.isAbsolute(p) ? p : path.join(projectDir, p);
    if (!fs.existsSync(abs)) continue;
    const st = fs.statSync(abs);
    if (!st.isFile()) continue;
    all.push(...streamJsonLintFile(abs, projectDir));
  }
  return { violations: all };
}

/**
 * CLI entry point for stream-json mode. Exit 0 on clean, 4 on violation,
 * 2 on internal error.
 */
function mainStreamJson(opts) {
  const projectDir = opts.projectDir || process.cwd();
  const mode = opts.mode || 'staged';
  let files;
  try {
    files = mode === 'all' ? _listAll(projectDir) : _listStaged(projectDir);
  } catch (e) {
    return { exitCode: 2, violations: [], files: [], error: e.message || String(e) };
  }
  const { violations } = streamJsonLintFiles(files, { projectDir });
  return {
    exitCode: violations.length === 0 ? 0 : 4,
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
  // M56 D5
  streamJsonLintFile,
  streamJsonLintFiles,
  mainStreamJson,
  STREAM_JSON_SPAWN_PATTERNS,
  STREAM_JSON_SKIP_MARKER,
};
