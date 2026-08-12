'use strict';

/**
 * M112 — slices are sized in LINES, and anything too big is split.
 *
 * Files are a terrible proxy for how much code a reviewer was handed. In the
 * HiloAviation codebase the median source file is 233 lines and the largest is
 * 23,664 — a hundred to one. "120 files per slice" means nothing.
 *
 * Lines track what actually happened across three real scans of that project:
 *
 *     47 slices ·    54,000 lines each · 297 findings
 *     24 slices ·   106,000 lines each · 194 findings
 *      1 slice  · 2,545,000 lines      ·   3 findings
 *
 * Half the lines per reviewer, half again as many findings. The budget is
 * provisional and says so — 30k-50k sits deliberately below the best observed
 * run, and moves when a comparison run says it should.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const TOOL = path.join(REPO, 'bin', 'gsd-t-slice-budget.cjs');
const lib = require(TOOL);

function probe(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm112-budget-'));
  for (const [rel, lines] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'x\n'.repeat(lines));
  }
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

test('M112: a slice within budget is left alone', () => {
  const dir = probe({ 'src/a.ts': 100, 'src/b.ts': 200 });
  try {
    const r = lib.plan(dir, [{ key: 'small', paths: ['src'] }], 30000, 50000);
    assert.equal(r.after.slices, 1, 'nothing to split');
    assert.equal(r.slices[0].key, 'small', 'and the key is untouched');
    assert.equal(r.after.lines, 300);
  } finally { rm(dir); }
});

test('M112: an oversized slice is split, and every file survives', () => {
  // Losing a file to a split would be worse than the oversized slice.
  const files = {};
  for (let i = 0; i < 40; i++) files[`src/f${i}.ts`] = 5000; // 200,000 lines
  const dir = probe(files);
  try {
    const r = lib.plan(dir, [{ key: 'big', paths: ['src'] }], 30000, 50000);
    assert.ok(r.after.slices >= 4, `200k lines at a 50k ceiling needs >=4 slices, got ${r.after.slices}`);

    const seen = new Set(r.slices.flatMap((s) => s.paths));
    assert.equal(seen.size, 40, 'every file must appear exactly once across the parts');
    assert.equal(r.after.lines, 200000, 'and the line total must be preserved');
  } finally { rm(dir); }
});

test('M112: no part exceeds the ceiling', () => {
  const files = {};
  for (let i = 0; i < 30; i++) files[`src/f${i}.ts`] = 7000;
  const dir = probe(files);
  try {
    const r = lib.plan(dir, [{ key: 'big', paths: ['src'] }], 30000, 50000);
    assert.equal(r.after.overBudget, 0, 'the ceiling is the point of the exercise');
    for (const s of r.slices) {
      assert.ok(s._lines <= 50000, `${s.key} is ${s._lines} lines`);
    }
  } finally { rm(dir); }
});

test('M112: a single file bigger than the ceiling gets its own slice, and is named', () => {
  // A file is the smallest thing a reviewer can read, so the budget cannot be
  // honoured below it. Reported as a fact about the codebase, not ignored.
  const dir = probe({ 'src/huge.ts': 80000, 'src/small.ts': 100 });
  try {
    const r = lib.plan(dir, [{ key: 'mixed', paths: ['src'] }], 30000, 50000);
    assert.equal(r.soloOversizedFiles.length, 1);
    assert.match(r.soloOversizedFiles[0].file, /huge\.ts$/);
    assert.equal(r.soloOversizedFiles[0].lines, 80000);
    assert.equal(r.after.overBudget, 0, 'a solo oversized file is not counted as over budget');
  } finally { rm(dir); }
});

test('M112: a file listed under two paths of one slice is counted once', () => {
  const dir = probe({ 'src/a.ts': 500 });
  try {
    const r = lib.plan(dir, [{ key: 'dup', paths: ['src', 'src/a.ts'] }], 30000, 50000);
    assert.equal(r.after.files, 1, 'counting it twice would inflate the slice');
    assert.equal(r.after.lines, 500);
  } finally { rm(dir); }
});

test('M112: an unreadable path is reported, never silently zero', () => {
  // A path that measures as 0 lines looks like a small slice, and the reviewer
  // is handed nothing while the plan looks fine.
  const dir = probe({ 'src/a.ts': 100 });
  try {
    const r = lib.plan(dir, [{ key: 'x', paths: ['src', 'does/not/exist'] }], 30000, 50000);
    assert.equal(r.problems.length, 1, 'the missing path must be recorded');
    assert.match(r.problems[0], /does\/not\/exist/);
  } finally { rm(dir); }
});

test('M112: the budget is reported as provisional', () => {
  const dir = probe({ 'src/a.ts': 10 });
  try {
    const r = lib.plan(dir, [{ key: 'x', paths: ['src'] }], 30000, 50000);
    assert.equal(r.budget.provisional, true,
      'the numbers rest on one project — the plan must not present them as derived');
    assert.equal(r.budget.min, 30000);
    assert.equal(r.budget.max, 50000);
  } finally { rm(dir); }
});

test('M112: design-export snapshots are left out, and named', () => {
  // hilo-figma-atos: `.figma-make-exports/` held 1,532 source files and 968,597
  // lines — six dated copies of a design prototype, measured and read by finders
  // as if they were the product. Roughly 19 slices of finder-and-verifier work
  // spent on exported mockups, for two findings, both about the folder itself.
  const files = { 'src/app.ts': 500 };
  for (let i = 0; i < 20; i++) files[`.figma-make-exports/2026-03-12/c${i}.tsx`] = 400;
  const dir = probe(files);
  try {
    const r = lib.plan(dir, [{ key: 'all', paths: ['.'] }], 30000, 50000);
    assert.equal(r.after.files, 1, 'only the real source file may be measured');
    assert.equal(r.after.lines, 500);
    assert.deepEqual(r.skippedSnapshots, ['.figma-make-exports'],
      'the omission must be NAMED — a directory this size vanishing silently is how a coverage hole hides');
  } finally { rm(dir); }
});

test('M112: a real source folder whose name merely contains "export" is kept', () => {
  // The opposite failure, and the worse one: a rule that matches too eagerly
  // deletes real code from the scan while the plan still looks healthy.
  const dir = probe({
    'src/exports/csv.ts': 300,
    'src/export-service/index.ts': 200,
    'src/design/tokens.ts': 100,
  });
  try {
    const r = lib.plan(dir, [{ key: 'all', paths: ['.'] }], 30000, 50000);
    assert.equal(r.after.files, 3, 'none of these is a design-tool snapshot');
    assert.equal(r.after.lines, 600);
    assert.deepEqual(r.skippedSnapshots, []);
  } finally { rm(dir); }
});

test('M112: the snapshot rule matches a whole directory name, not a substring', () => {
  const dir = probe({
    'figma-exports/a.tsx': 100,        // matches — excluded
    'my-figma-exports-notes/b.ts': 50, // does NOT match — kept
  });
  try {
    const r = lib.plan(dir, [{ key: 'all', paths: ['.'] }], 30000, 50000);
    assert.equal(r.after.lines, 50, 'only the snapshot directory is dropped');
    assert.deepEqual(r.skippedSnapshots, ['figma-exports']);
  } finally { rm(dir); }
});

test('M112: a nonsense budget is refused, naming which rule broke', () => {
  const dir = probe({ 'src/a.ts': 10 });
  try {
    const out = execFileSync('node', [TOOL, '--project', dir, '--slices', '[{"key":"x","paths":["src"]}]',
      '--min', '50000', '--max', '30000'], { encoding: 'utf8' });
    assert.fail('should have exited non-zero');
  } catch (e) {
    assert.equal(e.status, 64);
    assert.match(String(e.stdout), /must be above --min/);
  } finally { rm(dir); }
});

test('M112: an empty slice list is refused, not treated as nothing to do', () => {
  const dir = probe({ 'src/a.ts': 10 });
  try {
    execFileSync('node', [TOOL, '--project', dir, '--slices', '[]'], { encoding: 'utf8' });
    assert.fail('should have exited non-zero');
  } catch (e) {
    assert.equal(e.status, 64);
    assert.match(String(e.stdout), /must not be empty/);
  } finally { rm(dir); }
});
