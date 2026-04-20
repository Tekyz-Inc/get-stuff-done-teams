'use strict';

// M41 D5: capture-lint unit tests.
// Covers:
//   1. Clean file with captureSpawn(spawnFn: () => Task(...)) → no violation
//   2. Bare Task({ in a command file fence → violation with correct file:line
//   3. Task( inside a comment line → not a violation
//   4. Task( inside test/ → not a violation (whitelist)
//   5. Task( with GSD-T-CAPTURE-LINT: skip nearby → not a violation
//   6. Bare claude -p in a command file fence → violation
//   7. claude -p inside a JS string literal (help text) → not a violation
//   8. Task(s) in markdown table → not a violation (shape match excludes)
//   9. --all mode globs expected directories
//  10. bin/gsd-t-token-capture.cjs is whitelisted
//  11. Perf: linting all command files completes in <2s
//  12. Whole-repo lint (--all mode) on current main returns clean
//  13. lintFiles handles missing file gracefully

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const linter = require('../bin/gsd-t-capture-lint.cjs');

function mkTmpProject(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `m41-lint-${name}-`));
  fs.mkdirSync(path.join(dir, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  return dir;
}

function writeFile(dir, rel, body) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
}

// ── Test 1: wrapped Task is clean ───────────────────────────────────
test('lintFile: wrapped Task({ spawn is clean', () => {
  const dir = mkTmpProject('wrapped');
  const src = `# Step 4
\`\`\`
await captureSpawn({
  command: 'test',
  step: 'Step 4',
  model: 'sonnet',
  description: 'x',
  spawnFn: async () => {
    return await Task({
      description: 'foo',
      prompt: 'bar',
    });
  },
});
\`\`\`
`;
  const file = writeFile(dir, 'commands/x.md', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.deepEqual(violations, []);
});

// ── Test 2: bare Task({ violation ────────────────────────────────────
test('lintFile: bare Task({ in command fence → violation with path:line', () => {
  const dir = mkTmpProject('bare-task');
  const src = `# Step 1
\`\`\`
return Task({
  description: 'x',
});
\`\`\`
`;
  const file = writeFile(dir, 'commands/bare.md', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 3);
  assert.equal(violations[0].pattern, 'Task(');
  assert.equal(violations[0].file, 'commands/bare.md');
});

// ── Test 3: comment line is not a violation ─────────────────────────
test('lintFile: Task({ inside a comment line → not a violation', () => {
  const dir = mkTmpProject('comment');
  const src = `
// Task({foo: 1}) — this is a comment
`;
  const file = writeFile(dir, 'bin/tool.js', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.deepEqual(violations, []);
});

// ── Test 4: test/ whitelist ──────────────────────────────────────────
test('lintFile: Task({ inside test/ → not a violation (whitelist)', () => {
  const dir = mkTmpProject('test-whitelist');
  const src = `
Task({description: 'test'});
`;
  const file = writeFile(dir, 'test/foo.test.js', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.deepEqual(violations, []);
});

// ── Test 5: skip marker ──────────────────────────────────────────────
test('lintFile: Task({ with GSD-T-CAPTURE-LINT: skip nearby → not a violation', () => {
  const dir = mkTmpProject('skip-marker');
  const src = `# Step 1
\`\`\`
// GSD-T-CAPTURE-LINT: skip — legacy call site
return Task({description: 'x'});
\`\`\`
`;
  const file = writeFile(dir, 'commands/skip.md', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.deepEqual(violations, []);
});

// ── Test 6: bare claude -p ──────────────────────────────────────────
test('lintFile: bare `claude -p` in command file fence → violation', () => {
  const dir = mkTmpProject('bare-claude-p');
  const src = `# Step 1
\`\`\`bash
claude -p "do the thing"
\`\`\`
`;
  const file = writeFile(dir, 'commands/shell.md', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].pattern, 'claude -p');
});

// ── Test 7: claude -p inside a JS string literal ────────────────────
test('lintFile: `claude -p` inside a JS string literal (help text) → not a violation', () => {
  const dir = mkTmpProject('help-string');
  const src = `
log("Non-interactive execution via claude -p");
`;
  const file = writeFile(dir, 'bin/help.js', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.deepEqual(violations, []);
});

// ── Test 8: Task(s) markdown table column header ────────────────────
test('lintFile: Task(s) in markdown table → not a violation', () => {
  const dir = mkTmpProject('task-s');
  const src = `# Plan
| REQ-ID | Task(s) | Status |
|--------|---------|--------|
| R1 | T1 | pending |
`;
  const file = writeFile(dir, 'commands/plan.md', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.deepEqual(violations, []);
});

// ── Test 9: --all mode globs expected directories ───────────────────
test('main: --all mode globs commands/, bin/, scripts/', () => {
  const dir = mkTmpProject('all-mode');
  writeFile(dir, 'commands/a.md', '# ok\n');
  writeFile(dir, 'bin/b.js', '// ok\n');
  writeFile(dir, 'scripts/c.js', '// ok\n');
  writeFile(dir, 'other/ignored.md', 'Task({});\n');
  const res = linter.main({ projectDir: dir, mode: 'all' });
  assert.equal(res.exitCode, 0);
  assert.ok(res.files.some((f) => f.endsWith('commands/a.md')));
  assert.ok(res.files.some((f) => f.endsWith('bin/b.js')));
  assert.ok(res.files.some((f) => f.endsWith('scripts/c.js')));
  assert.ok(!res.files.some((f) => f.includes('other/')));
});

// ── Test 10: token-capture wrapper file whitelisted ─────────────────
test('lintFile: bin/gsd-t-token-capture.cjs is always whitelisted', () => {
  const dir = mkTmpProject('wrapper-whitelist');
  const src = `spawn('claude', ['-p']);\nTask({x:1});\n`;
  const file = writeFile(dir, 'bin/gsd-t-token-capture.cjs', src);
  const { violations } = linter.lintFiles([file], { projectDir: dir });
  assert.deepEqual(violations, []);
});

// ── Test 11: perf gate ──────────────────────────────────────────────
test('main: --all on current repo completes in <2s', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const t0 = Date.now();
  const res = linter.main({ projectDir: repoRoot, mode: 'all' });
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `--all mode took ${elapsed}ms (budget: 2000ms)`);
  assert.ok(res.files.length > 0, 'expected at least some files linted');
});

// ── Test 12: current main is clean ──────────────────────────────────
test('main: --all on current repo exits 0 (post-D2/D5)', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const res = linter.main({ projectDir: repoRoot, mode: 'all' });
  assert.equal(res.exitCode, 0,
    `expected clean; got ${res.violations.length} violation(s):\n` +
    res.violations.map((v) => `  ${v.file}:${v.line}: ${v.pattern}`).join('\n'));
});

// ── Test 13: missing file handled gracefully ────────────────────────
test('lintFiles: missing file returns no violations (no throw)', () => {
  const dir = mkTmpProject('missing');
  const { violations } = linter.lintFiles(['commands/does-not-exist.md'], { projectDir: dir });
  assert.deepEqual(violations, []);
});

// ── Test 14: matchInsideStringLiteral helper ────────────────────────
test('_matchInsideStringLiteral: identifies matches inside quotes', () => {
  assert.equal(linter._matchInsideStringLiteral('log("claude -p here")', 'claude -p'), true);
  assert.equal(linter._matchInsideStringLiteral('  claude -p real', 'claude -p'), false);
  assert.equal(linter._matchInsideStringLiteral("'Task({foo: 1})'", 'Task('), true);
});
