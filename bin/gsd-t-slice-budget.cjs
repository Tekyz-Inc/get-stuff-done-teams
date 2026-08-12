#!/usr/bin/env node
'use strict';

/**
 * gsd-t-slice-budget.cjs — measure a slice plan in LINES and split what is too big.
 *
 * [RULE] slice-budget-measured-in-lines-not-files
 * [RULE] slice-budget-splits-never-drops
 * [RULE] slice-budget-reports-every-decision
 *
 * A reviewer is told to read every file in its slice. Whether it can depends on
 * how much code it was handed — and files are a terrible proxy for that. In the
 * HiloAviation codebase the median source file is 233 lines and the largest is
 * 23,664: a hundred to one. "120 files" means nothing.
 *
 * Lines track what actually happened. Across three real scans of the same
 * project:
 *
 *     47 slices · 54,000 lines each · 297 findings
 *     28 slices · 91,000 lines each · —
 *     24 slices · 106,000 lines each · 194 findings
 *      1 slice  · 2,545,000 lines   · 3 findings
 *
 * Half the lines per reviewer, half again as many findings. So slices are sized
 * by line count, and anything over the ceiling is SPLIT — never dropped, and
 * never merged to tidy a count.
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   node gsd-t-slice-budget.cjs --project <dir> --slices '<json>' [--min N] [--max N]
 *
 *   <json> is the probe's slice list: [{ key, paths: [...], ... }]
 *
 * ─── Exit codes ─────────────────────────────────────────────────────────────
 *   0  a plan was produced (possibly unchanged)
 *   64 bad input — unreadable project, malformed slice list
 *
 * There is no "give up and return the original" path: a slice list that cannot
 * be measured is an error, not a plan to proceed with.
 *
 * Zero dependencies.
 */

const fs = require('fs');
const path = require('path');

const EXIT_OK = 0;
const EXIT_BAD_INPUT = 64;

// Provisional, and recorded as such. 54,000 lines per reviewer produced the best
// real scan observed; these sit deliberately below it, because that run still
// cited only 266 of 4,785 files. Nothing yet proves smaller keeps helping — the
// numbers move when a comparison run says they should.
const DEFAULT_MIN = 30000;
const DEFAULT_MAX = 50000;

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);
const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.git', '.cache', '__pycache__',
  'coverage', 'out', '.turbo', '.venv', 'venv', 'Pods', 'vendor', '.gradle',
]);

// [RULE] slice-budget-skips-design-export-snapshots
//
// hilo-figma-atos, 2026-08-11: `.figma-make-exports/` held 1,879 tracked files
// and 57 MB of design-tool exports — six dated snapshots of a prototype, each a
// near-copy of the last. They were measured, sliced, and read by finders as if
// they were the application. Out of the whole scan, exactly TWO findings came
// from them, and both were about the directory itself (it has no type-check
// exclusion; the same key is committed six times) rather than about defects in
// the product.
//
// These are recognised by NAME rather than by a project's own ignore rules,
// because the project had no such rule — that absence was itself one of the two
// findings. Matched as a path SEGMENT so a real source folder that merely
// contains the word (say `src/exports/`) is untouched.
const SNAPSHOT_DIR_PATTERNS = [
  /^\.?figma-make-exports$/i,
  /^\.?figma-exports$/i,
  /^design-exports?$/i,
  /^ui-snapshots?$/i,
  /^__snapshots-export__$/i,
];

function isSnapshotExportDir(name) {
  return SNAPSHOT_DIR_PATTERNS.some((re) => re.test(name));
}

/** Lines in one file. A file that cannot be read is reported, never counted as 0. */
function countLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  if (text.endsWith('\n')) return n;
  return n + 1;
}

/** Every source file under a path, with its line count. */
function measurePath(projectDir, rel, problems, skippedSnapshots) {
  const abs = path.resolve(projectDir, rel);
  const out = [];

  let stat;
  try {
    stat = fs.statSync(abs);
  } catch (e) {
    problems.push(`${rel}: ${(e && e.message) || e}`);
    return out;
  }

  if (stat.isFile()) {
    if (!SOURCE_EXTS.has(path.extname(abs))) return out;
    try {
      out.push({ file: path.relative(projectDir, abs), lines: countLines(abs) });
    } catch (e) {
      problems.push(`${rel}: ${(e && e.message) || e}`);
    }
    return out;
  }

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      // A directory that cannot be read may hold most of a slice. Recorded, so
      // the caller sees an incomplete measurement rather than a small number.
      problems.push(`${path.relative(projectDir, dir)}: ${(e && e.message) || e}`);
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        if (isSnapshotExportDir(ent.name)) {
          // Reported, never silent: a directory this large vanishing from the
          // measurement without a word is how a coverage hole hides.
          skippedSnapshots.push(path.relative(projectDir, path.join(dir, ent.name)));
          continue;
        }
        walk(path.join(dir, ent.name));
        continue;
      }
      if (!SOURCE_EXTS.has(path.extname(ent.name))) continue;
      const full = path.join(dir, ent.name);
      try {
        out.push({ file: path.relative(projectDir, full), lines: countLines(full) });
      } catch (e) {
        problems.push(`${path.relative(projectDir, full)}: ${(e && e.message) || e}`);
      }
    }
  };
  walk(abs);
  return out;
}

/**
 * Split one oversized slice into parts that fit the ceiling.
 *
 * Files are taken largest-first so a big file settles early and the rest packs
 * around it; the alternative leaves a huge file for last and forces a part far
 * over budget.
 *
 * A single file larger than the ceiling becomes its OWN part. A file is the
 * smallest thing a reviewer can read, so the budget cannot be honoured below
 * that — and pretending otherwise would mean splitting a file mid-function.
 */
function splitSlice(slice, files, min, max, oversizedFiles) {
  const sorted = files.slice().sort((a, b) => b.lines - a.lines);
  const parts = [];
  let cur = [];
  let curLines = 0;

  for (const f of sorted) {
    if (f.lines > max) {
      oversizedFiles.push(f);
      parts.push({ files: [f.file], lines: f.lines, soloOversizedFile: true });
      continue;
    }
    if (curLines + f.lines > max && curLines >= min) {
      parts.push({ files: cur, lines: curLines });
      cur = [];
      curLines = 0;
    }
    cur.push(f.file);
    curLines += f.lines;
  }
  if (cur.length) parts.push({ files: cur, lines: curLines });

  // One part means nothing was split — hand the slice back untouched so its
  // original paths and metadata survive.
  if (parts.length <= 1) {
    const total = files.reduce((s, f) => s + f.lines, 0);
    return [{ ...slice, _lines: total }];
  }

  return parts.map((p, i) => {
    const part = {
      ...slice,
      key: `${slice.key}-part${i + 1}`,
      paths: p.files,
      _lines: p.lines,
      _splitFrom: slice.key,
    };
    if (p.soloOversizedFile) part._soloOversizedFile = true;
    return part;
  });
}

function plan(projectDir, slices, min, max) {
  const problems = [];
  const skippedSnapshots = [];
  const oversizedFiles = [];
  const out = [];
  let measuredLines = 0;
  let measuredFiles = 0;

  for (const slice of slices) {
    const paths = Array.isArray(slice.paths) ? slice.paths : [];
    const files = [];
    const seen = new Set();
    for (const p of paths) {
      for (const f of measurePath(projectDir, p, problems, skippedSnapshots)) {
        // A file listed under two paths of one slice is one file, counted once.
        if (seen.has(f.file)) continue;
        seen.add(f.file);
        files.push(f);
      }
    }
    measuredFiles += files.length;
    const lines = files.reduce((s, f) => s + f.lines, 0);
    measuredLines += lines;

    if (lines <= max) {
      out.push({ ...slice, _lines: lines });
    } else {
      out.push(...splitSlice(slice, files, min, max, oversizedFiles));
    }
  }

  const sizes = out.map((s) => s._lines).sort((a, b) => a - b);
  const mean = out.length ? Math.round(measuredLines / out.length) : 0;
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const largest = sizes.length ? sizes[sizes.length - 1] : 0;

  return {
    ok: true,
    exitCode: EXIT_OK,
    budget: { min, max, provisional: true },
    before: { slices: slices.length },
    after: {
      slices: out.length,
      files: measuredFiles,
      lines: measuredLines,
      meanLinesPerSlice: mean,
      medianLinesPerSlice: median,
      largestSlice: largest,
      overBudget: out.filter((s) => s._lines > max && !s._soloOversizedFile).length,
    },
    // A file bigger than the ceiling cannot be split, so the budget is broken by
    // the code itself. Named, so it reads as a fact about the codebase rather
    // than a rule quietly ignored.
    soloOversizedFiles: oversizedFiles
      .sort((a, b) => b.lines - a.lines)
      .map((f) => ({ file: f.file, lines: f.lines })),
    problems,
    // Design-tool export snapshots left out of the measurement, named so the
    // omission is visible rather than inferred from a smaller total.
    skippedSnapshots: Array.from(new Set(skippedSnapshots)).sort(),
    slices: out,
  };
}

function parseArgs(argv) {
  const args = { project: process.cwd(), min: DEFAULT_MIN, max: DEFAULT_MAX };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a === '--slices') args.slices = argv[++i];
    else if (a === '--slices-file') args.slicesFile = argv[++i];
    else if (a === '--min') args.min = parseInt(argv[++i], 10);
    else if (a === '--max') args.max = parseInt(argv[++i], 10);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const fail = (reason) => {
    process.stdout.write(JSON.stringify({ ok: false, exitCode: EXIT_BAD_INPUT, reason }, null, 2) + '\n');
    process.exit(EXIT_BAD_INPUT);
  };

  const projectDir = path.resolve(args.project);
  if (!fs.existsSync(projectDir)) fail(`project directory not found: ${projectDir}`);

  // Each budget rule checked on its own, so the message names the one that broke.
  if (!Number.isFinite(args.min)) fail(`--min must be a number, got ${args.min}`);
  if (!Number.isFinite(args.max)) fail(`--max must be a number, got ${args.max}`);
  if (args.min <= 0) fail(`--min must be above zero, got ${args.min}`);
  if (args.max <= args.min) fail(`--max (${args.max}) must be above --min (${args.min})`);

  let raw = args.slices;
  if (args.slicesFile) {
    try {
      raw = fs.readFileSync(args.slicesFile, 'utf8');
    } catch (e) {
      fail(`could not read ${args.slicesFile}: ${(e && e.message) || e}`);
    }
  }
  if (!raw) fail('no slices given — pass --slices <json> or --slices-file <path>');

  let slices;
  try {
    slices = JSON.parse(raw);
  } catch (e) {
    fail(`slices is not valid JSON: ${(e && e.message) || e}`);
  }
  if (!Array.isArray(slices)) fail('slices must be an array');
  if (slices.length === 0) fail('slices must not be empty');

  const result = plan(projectDir, slices, args.min, args.max);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = { plan, splitSlice, measurePath, countLines, DEFAULT_MIN, DEFAULT_MAX };
