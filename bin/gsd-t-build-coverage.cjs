#!/usr/bin/env node
'use strict';

/**
 * GSD-T build-coverage (M57 D1) — STRUCTURAL CI parsing.
 *
 * Detects new top-level paths added in a milestone commit range that no CI
 * build artifact references — the TimeTracking v1.10.12 failure class (new
 * `hooks/` dir committed, absent from Dockerfile COPY, shipped broken while
 * local verify reported VERIFIED).
 *
 * DESIGN MANDATE (re-plan 2026-05-19, after the substring design failed Red
 * Team across 5 non-converging cycles — BUG-4/6/9/9b):
 *   Coverage is decided by STRUCTURALLY PARSING the CI files — a path
 *   contributes coverage ONLY when it appears in a build-input position:
 *     - Dockerfile: a COPY/ADD source argument (incl. `--from=` SOURCE,
 *       relative AND absolute); NOT in RUN/CMD/comment/ENV.
 *     - cloudbuild.yaml: a value inside a `steps[].args` list; NOT in a
 *       `#` comment, a step `id:`/`name:`, or an `env:` block.
 *     - .github/workflows/*.yml: a token inside a `jobs.<job>.steps[].run`
 *       command or a `working-directory:` value; NOT in a step/job/workflow
 *       `name:` (plain, quoted, OR multi-line `|`/`>` block/folded scalar),
 *       NOT in a `#` comment.
 *   A path whose first segment is `node_modules` NEVER contributes coverage.
 *   There is NO code path that does `configText.includes(seg)` or regex-greps
 *   raw config text for the segment name. (See memory:
 *   feedback_coverage_check_structural_not_substring.md)
 *
 * Exports: checkBuildCoverage({ projectDir, baseRef, headRef })
 * CLI:     node bin/gsd-t-build-coverage.cjs [--json] [--base REF] [--head REF]
 *
 * Contract: .gsd-t/contracts/cli-build-coverage-contract.md v1.1.0 STABLE.
 *
 * Exit codes (CLI):
 *   0 — ok:true (all new paths covered, OR no CI artifacts found)
 *   4 — ok:false (≥1 new top-level path uncovered)
 *   2 — usage error (bad refs, not a git repo, detached HEAD)
 *
 * Hard rules: zero external runtime deps (Node built-ins only); functions
 * small; never throw out of checkBuildCoverage (usage errors surface as a
 * thrown UsageError caught by the CLI entry).
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; }
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitDiffNames(projectDir, baseRef, headRef) {
  const raw = execSync(`git diff --name-only ${baseRef}..${headRef}`, {
    cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

function resolveRefs(projectDir, baseRef, headRef) {
  execSync('git rev-parse --git-dir', {
    cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = baseRef || 'HEAD~1';
  const head = headRef || 'HEAD';
  if (base === head) throw new UsageError(`baseRef and headRef are identical: ${base}`);
  return { base, head };
}

/** First path segment of a posix-ish path, or '' if none/`.`. */
function topSegment(p) {
  const cleaned = String(p).replace(/^\.\//, '').replace(/^\/+/, '');
  const seg = cleaned.split('/')[0];
  return (!seg || seg === '.' || seg === '..') ? '' : seg;
}

function collapseToTopLevel(filePaths) {
  const seen = new Set();
  for (const p of filePaths) {
    const seg = topSegment(p);
    if (seg) seen.add(seg);
  }
  return Array.from(seen).sort();
}

/**
 * Map a build-input path reference to the workspace top-level segment it
 * covers, or '' if it covers nothing in the workspace.
 *  - absolute paths (`/app/dist`) reference the *image* fs, not the
 *    workspace → no workspace coverage.
 *  - `node_modules/...` never contributes coverage (BUG-7).
 */
function coverageSegment(ref) {
  const r = String(ref).trim();
  if (!r || r.startsWith('/')) return '';            // absolute = image fs
  const seg = topSegment(r);
  if (!seg || seg === 'node_modules') return '';      // BUG-7 hard rule
  return seg;
}

// ---------------------------------------------------------------------------
// Dockerfile — structural, line-oriented
// ---------------------------------------------------------------------------

/** Split a COPY/ADD argument string into tokens, dropping flags. */
function copyArgTokens(argStr) {
  return argStr.trim().split(/\s+/).filter(t => t && !t.startsWith('--'));
}

/**
 * Parse Dockerfile structurally. Only COPY/ADD instructions contribute.
 * Returns { coversAll, segments: Set }.
 *   - `COPY . .` / `ADD . .` → coversAll.
 *   - `COPY src/ ./src/` → source `src/` covers `src`.
 *   - `COPY --from=stage <src> <dest>` → `<src>` IS a build input; a
 *     relative src (`dist/`) covers `dist`; an absolute src (`/app/dist`)
 *     references the build-stage image fs → covers nothing in workspace.
 *   - flags (`--from=`, `--chown=`, `--chmod=`) are not path tokens.
 *   - a path in RUN/CMD/ENV/comment is NOT a build input.
 */
function parseDockerfile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const segments = new Set();
  let coversAll = false;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, ' ').trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(COPY|ADD)\s+(.+)$/i);
    if (!m) continue;                                  // RUN/CMD/ENV/FROM → ignore
    const tokens = copyArgTokens(m[2]);
    if (tokens.length < 2) continue;                   // need ≥1 src + 1 dest
    const sources = tokens.slice(0, tokens.length - 1); // last = dest
    for (const src of sources) {
      if (src === '.') { coversAll = true; continue; }
      const seg = coverageSegment(src);
      if (seg) segments.add(seg);
    }
  }
  return { coversAll, segments };
}

// ---------------------------------------------------------------------------
// Minimal YAML structure walker (no YAML lib — zero-dep invariant)
//
// Not a general YAML parser. A line-state machine that yields, for each
// physical line, enough context to know whether a path token on that line
// sits in a build-input position. It tracks:
//   - comment stripping (only outside quotes; YAML `#` must be preceded by
//     whitespace or start-of-content to be a comment)
//   - the current mapping key on a line (`key:` ...)
//   - block/folded scalar regions (`key: |` / `key: >`) and their indent,
//     so continuation lines are attributed to the OWNING key (this is the
//     BUG-9/9b fix: a `name: |` continuation is name-prose, never a build
//     input)
// ---------------------------------------------------------------------------

function stripYamlComment(line) {
  // Remove a trailing `#...` comment when the # is at col 0 or preceded by
  // whitespace and not inside a quote. Cheap quote tracking is sufficient
  // for CI YAML (no `#` inside our path tokens).
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/**
 * Walk a workflow/cloudbuild YAML and invoke cb(kind, value) for every
 * build-input-bearing token region, where kind is 'run' | 'arg' | 'workdir'.
 * Lines inside a block/folded scalar owned by a non-build key (`name:`,
 * `id:`, `env:`, …) are NEVER emitted.
 */
function walkYamlBuildInputs(content, cb) {
  const lines = content.split('\n');
  // Active block-scalar state: { ownerKey, indent } — continuation lines with
  // indent > indent belong to ownerKey and are skipped unless ownerKey is a
  // build key (run). We only treat `run:` block scalars as build input.
  let block = null;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (block) {
      const ind = indentOf(rawLine);
      const isBlank = rawLine.trim() === '';
      if (isBlank || ind > block.indent) {
        if (block.ownerKey === 'run' && !isBlank) cb('run', rawLine);
        continue;                                      // consumed by the block
      }
      block = null;                                    // dedent → block ended
    }
    const line = stripYamlComment(rawLine);
    if (line.trim() === '') continue;

    // `- key: value` or `key: value` (list-item dash optional)
    const km = line.match(/^(\s*)(?:-\s+)?([A-Za-z_][\w-]*)\s*:(.*)$/);
    if (km) {
      const key = km[2];
      const rest = km[3].trim();
      const keyIndent = km[1].length;
      // Block/folded scalar opener: `key: |` `key: >` (+ chomping/indent)
      if (/^[|>][+-]?\d*\s*$/.test(rest)) {
        block = { ownerKey: key, indent: keyIndent };
        continue;
      }
      if (key === 'run' && rest) cb('run', rest);
      else if (key === 'working-directory' && rest) cb('workdir', rest);
      // `name:`, `id:`, `uses:`, `env:`, `if:`, job/workflow keys → NOT
      // build inputs; their inline value is intentionally ignored.
      continue;
    }

    // Inside an `args:` sequence: `- 'token'` items. We only honor this when
    // the nearest enclosing key was `args`. Track that with a light scan:
    // a line `args:` opens arg-mode until dedent past its indent.
    // Implemented below via argMode.
  }
}

/**
 * cloudbuild.yaml: collect path tokens that are VALUES inside a `steps[].args`
 * list. Recognizes:
 *   args: ['build', '-t', 'x', '.']        (flow sequence)
 *   args:
 *     - 'build'
 *     - '.'                                (block sequence)
 * A `.` arg is the docker *build context*, not a workspace COPY — it does NOT
 * imply coversAll for build-coverage (the Dockerfile is the authority for
 * what gets copied). We still record explicit path-looking args so an
 * artifacts/copy-style step can contribute, but never from comments/`name:`.
 */
function parseCloudBuild(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const segments = new Set();
  let argMode = null;                                  // { indent }
  for (const rawLine of lines) {
    const line = stripYamlComment(rawLine);
    if (line.trim() === '') continue;
    const ind = indentOf(line);
    if (argMode && ind <= argMode.indent) argMode = null;

    const flow = line.match(/^\s*(?:-\s+)?args\s*:\s*\[(.*)\]\s*$/);
    if (flow) {
      for (const tok of flow[1].split(',')) {
        const v = tok.trim().replace(/^['"]|['"]$/g, '');
        const seg = coverageSegment(v);
        if (seg) segments.add(seg);
      }
      continue;
    }
    if (/^\s*(?:-\s+)?args\s*:\s*$/.test(line)) { argMode = { indent: ind }; continue; }
    if (argMode) {
      const item = line.match(/^\s*-\s+(.*)$/);
      if (item) {
        const v = item[1].trim().replace(/^['"]|['"]$/g, '');
        const seg = coverageSegment(v);
        if (seg) segments.add(seg);
      }
      continue;
    }
  }
  return { segments };
}

/**
 * Extract workspace path segments from a shell command string (a `run:`
 * value or `working-directory:`). Token-splits and maps each token through
 * coverageSegment (which already drops absolute + node_modules). Flags and
 * option-args (`-r`, `--foo`) are ignored.
 */
function segmentsFromCommand(cmd) {
  const out = [];
  for (const tok of String(cmd).split(/\s+/)) {
    const t = tok.replace(/^['"]|['"]$/g, '');
    if (!t || t.startsWith('-')) continue;
    if (!t.includes('/')) continue;                    // bare words aren't paths
    const seg = coverageSegment(t);
    if (seg) out.push(seg);
  }
  return out;
}

/** .github/workflows/*.yml: collect segments from `run:` + `working-directory:` only. */
function parseWorkflows(workflowDir) {
  const segments = new Set();
  let files;
  try { files = fs.readdirSync(workflowDir); } catch { return { segments }; }
  for (const f of files) {
    if (!/\.ya?ml$/.test(f)) continue;
    const content = fs.readFileSync(path.join(workflowDir, f), 'utf8');
    walkYamlBuildInputs(content, (kind, value) => {
      if (kind === 'run') for (const s of segmentsFromCommand(value)) segments.add(s);
      else if (kind === 'workdir') {
        const seg = coverageSegment(value.replace(/^['"]|['"]$/g, ''));
        if (seg) segments.add(seg);
      }
    });
  }
  return { segments };
}

// ---------------------------------------------------------------------------
// CI artifact detection
// ---------------------------------------------------------------------------

function detectCIArtifacts(projectDir) {
  const artifacts = [];
  let coversAll = false;
  const covered = new Set();

  const dockerfilePath = path.join(projectDir, 'Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    artifacts.push('Dockerfile');
    const r = parseDockerfile(dockerfilePath);
    if (r.coversAll) coversAll = true;
    for (const s of r.segments) covered.add(s);
  }

  const cloudbuildPath = path.join(projectDir, 'cloudbuild.yaml');
  if (fs.existsSync(cloudbuildPath)) {
    artifacts.push('cloudbuild.yaml');
    for (const s of parseCloudBuild(cloudbuildPath).segments) covered.add(s);
  }

  const workflowDir = path.join(projectDir, '.github', 'workflows');
  if (fs.existsSync(workflowDir)) {
    const wf = parseWorkflows(workflowDir);
    if (wf.segments.size > 0 ||
        (fs.existsSync(workflowDir) && fs.readdirSync(workflowDir).some(f => /\.ya?ml$/.test(f)))) {
      artifacts.push('.github/workflows');
    }
    for (const s of wf.segments) covered.add(s);
  }

  return { artifacts, coversAll, covered };
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string}  opts.projectDir
 * @param {string}  [opts.baseRef]
 * @param {string}  [opts.headRef]
 * @param {string[]} [opts._newPaths] - test seam: supply diff list directly
 * @returns {{ ok, missing, checkedAgainst, newPaths, note? }}
 */
function checkBuildCoverage({ projectDir, baseRef, headRef, _newPaths }) {
  const { base, head } = resolveRefs(projectDir, baseRef, headRef);

  const newPaths = _newPaths !== undefined
    ? collapseToTopLevel(_newPaths)
    : collapseToTopLevel(gitDiffNames(projectDir, base, head));

  if (newPaths.length === 0) {
    return { ok: true, missing: [], checkedAgainst: [], newPaths: [], note: 'empty diff' };
  }

  const { artifacts, coversAll, covered } = detectCIArtifacts(projectDir);

  if (artifacts.length === 0) {
    return { ok: true, missing: [], checkedAgainst: [], newPaths, note: 'no CI artifacts detected' };
  }
  if (coversAll) {
    return { ok: true, missing: [], checkedAgainst: artifacts, newPaths };
  }

  // node_modules is never a "new path" worth gating, and never coverage.
  const gated = newPaths.filter(p => p !== 'node_modules');
  const missing = gated.filter(p => !covered.has(p));

  return { ok: missing.length === 0, missing, checkedAgainst: artifacts, newPaths };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function parseArgv(argv) {
  const opts = { json: false, base: undefined, head: undefined, projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--base') opts.base = argv[++i];
    else if (a === '--head') opts.head = argv[++i];
    else if (a === '--project-dir') opts.projectDir = argv[++i];
    else if (a === '-h' || a === '--help') {
      process.stdout.write([
        'Usage: gsd-t build-coverage [--json] [--base REF] [--head REF] [--project-dir PATH]',
        '',
        'Exit codes:',
        '  0  ok:true — all new top-level paths covered, or no CI artifacts found.',
        '  4  ok:false — ≥1 new top-level path not covered by any CI build input.',
        '  2  usage error (bad refs, not a git repo).',
        '',
      ].join('\n'));
      process.exit(0);
    }
  }
  return opts;
}

if (require.main === module) {
  const opts = parseArgv(process.argv.slice(2));
  let result;
  try {
    result = checkBuildCoverage({
      projectDir: opts.projectDir, baseRef: opts.base, headRef: opts.head,
    });
  } catch (e) {
    process.stderr.write(`build-coverage: ${e && e.message ? e.message : String(e)}\n`);
    process.exit(2);
  }
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.ok) {
    process.stdout.write(`OK: all new top-level paths covered${result.note ? ` (${result.note})` : ''}\n`);
  } else {
    process.stdout.write(`FAIL: uncovered paths: ${result.missing.join(', ')}\n`);
  }
  process.exit(result.ok ? 0 : 4);
}

module.exports = { checkBuildCoverage, _internal: { parseDockerfile, parseCloudBuild, parseWorkflows, coverageSegment, stripYamlComment } };
