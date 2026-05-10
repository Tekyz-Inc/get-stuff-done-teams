'use strict';
/**
 * M56 D5 — Stream-json universality lint tests
 *
 * Tests the new `streamJsonLintFile`/`streamJsonLintFiles`/`mainStreamJson`
 * surface added to `bin/gsd-t-capture-lint.cjs`. The lint detects
 * `claude -p` / `spawn('claude', ...)` invocations that lack the
 * `--output-format stream-json` flag pair, with an opt-out via
 * the `GSD-T-LINT: skip stream-json` skip marker.
 *
 * Contract: per memory `feedback_claude_p_stream_json.md` and the M56
 * partition charter — every claude -p spawn must use stream-json so the
 * orchestrator can observe progress in real-time, with explicit allowlist
 * for probe-style sites that don't emit user-watchable progress.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lint = require('../bin/gsd-t-capture-lint.cjs');

// Helper: write a file inside a temp project dir, return abs + rel paths.
function writeFixture(projectDir, relPath, content) {
  const abs = path.join(projectDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return { abs, rel: relPath };
}

// Helper: scoped tmpdir per test
function makeTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm56-d5-'));
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  return dir;
}

test('streamJsonLintFile: catches claude -p invocation without --output-format stream-json', () => {
  const dir = makeTmp();
  const f = writeFixture(dir, 'bin/example.cjs', `
'use strict';
const { execFileSync } = require('child_process');
function spawnClaudeBad(prompt) {
  return execFileSync('claude', ['-p', prompt, '--model', 'sonnet']);
}
module.exports = { spawnClaudeBad };
`);
  const violations = lint.streamJsonLintFile(f.abs, dir);
  assert.ok(violations.length >= 1, 'expected at least one violation');
  assert.ok(violations.some(v => v.pattern === 'claude -p (no stream-json)' || v.pattern.includes('stream-json')), 'expected stream-json violation pattern');
  fs.rmSync(dir, { recursive: true, force: true });
});

test("streamJsonLintFile: catches spawn('claude', ...) arg array without flag pair", () => {
  const dir = makeTmp();
  const f = writeFixture(dir, 'bin/example.cjs', `
'use strict';
const { spawn } = require('child_process');
function bad() {
  return spawn('claude', ['-p', 'hello']);
}
module.exports = { bad };
`);
  const violations = lint.streamJsonLintFile(f.abs, dir);
  assert.ok(violations.length >= 1, 'expected at least one violation');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('streamJsonLintFile: clean when --output-format stream-json --verbose present', () => {
  const dir = makeTmp();
  const f = writeFixture(dir, 'bin/example.cjs', `
'use strict';
const { spawn } = require('child_process');
function good() {
  return spawn('claude', ['-p', '--output-format', 'stream-json', '--verbose', 'hello']);
}
module.exports = { good };
`);
  const violations = lint.streamJsonLintFile(f.abs, dir);
  assert.strictEqual(violations.length, 0, 'expected zero violations when flags present');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('streamJsonLintFile: respects GSD-T-LINT: skip stream-json marker (same line)', () => {
  const dir = makeTmp();
  const f = writeFixture(dir, 'bin/example.cjs', `
'use strict';
const { execFileSync } = require('child_process');
function probe() {
  // GSD-T-LINT: skip stream-json (reason: probe measures envelope, not progress)
  return execFileSync('claude', ['-p', 'warm']);
}
module.exports = { probe };
`);
  const violations = lint.streamJsonLintFile(f.abs, dir);
  assert.strictEqual(violations.length, 0, 'expected zero violations when skip marker present');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('streamJsonLintFile: respects skip marker on adjacent line', () => {
  const dir = makeTmp();
  const f = writeFixture(dir, 'bin/example.cjs', `
'use strict';
const { execFileSync } = require('child_process');
function probe() {
  // GSD-T-LINT: skip stream-json (reason: single-word reply, no progress to stream)
  return execFileSync('claude',
    ['-p', 'warm']);
}
module.exports = { probe };
`);
  const violations = lint.streamJsonLintFile(f.abs, dir);
  assert.strictEqual(violations.length, 0, 'expected zero violations when skip marker on adjacent line');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('streamJsonLintFile: ignores comment-only lines mentioning claude -p', () => {
  const dir = makeTmp();
  const f = writeFixture(dir, 'bin/example.cjs', `
'use strict';
// This comment mentions claude -p without --output-format but is just docs.
function nothing() { return 42; }
module.exports = { nothing };
`);
  const violations = lint.streamJsonLintFile(f.abs, dir);
  assert.strictEqual(violations.length, 0, 'expected zero violations on comment-only mention');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('streamJsonLintFile: ignores prose mentions inside markdown (outside fenced code)', () => {
  const dir = makeTmp();
  const f = writeFixture(dir, 'commands/example.md', `
# Example

This document describes how claude -p invocations work and how to call spawn('claude', ...) properly.

\`\`\`
node -e "spawn('claude', ['-p', 'hello'])"
\`\`\`
`);
  const violations = lint.streamJsonLintFile(f.abs, dir);
  // Only the fenced block should be eligible. The prose mention should not trigger.
  // The fenced block lacks --output-format stream-json so it is a real violation.
  assert.ok(violations.length >= 1, 'expected exactly one violation from fenced code');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('streamJsonLintFile: whitelist exempts the lint module itself', () => {
  const dir = makeTmp();
  const f = writeFixture(dir, 'bin/gsd-t-capture-lint.cjs', `
'use strict';
function bad() { return spawn('claude', ['-p', 'hello']); }
module.exports = { bad };
`);
  const violations = lint.streamJsonLintFile(f.abs, dir);
  assert.strictEqual(violations.length, 0, 'expected zero violations on whitelisted self-file');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mainStreamJson: returns exitCode 0 on clean tree', () => {
  const dir = makeTmp();
  writeFixture(dir, 'bin/clean.cjs', `
'use strict';
function nothing() { return 42; }
module.exports = { nothing };
`);
  const r = lint.mainStreamJson({ projectDir: dir, mode: 'all' });
  assert.strictEqual(r.exitCode, 0);
  assert.deepStrictEqual(r.violations, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mainStreamJson: returns exitCode 4 on violation', () => {
  const dir = makeTmp();
  writeFixture(dir, 'bin/dirty.cjs', `
'use strict';
const { execFileSync } = require('child_process');
function bad() { return execFileSync('claude', ['-p', 'no flag pair']); }
module.exports = { bad };
`);
  const r = lint.mainStreamJson({ projectDir: dir, mode: 'all' });
  assert.strictEqual(r.exitCode, 4);
  assert.ok(r.violations.length >= 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('SC4 evidence: lint blocks deliberately broken commit dropping stream-json', () => {
  // This is the M56 SC4 falsifiable test — it MUST fail when stream-json
  // is dropped from any spawn site.
  const dir = makeTmp();
  writeFixture(dir, 'bin/regression.cjs', `
'use strict';
const { execFileSync } = require('child_process');
function regressedSpawn(prompt) {
  // Deliberately omits --output-format stream-json --verbose
  return execFileSync('claude', ['-p', prompt]);
}
module.exports = { regressedSpawn };
`);
  const r = lint.mainStreamJson({ projectDir: dir, mode: 'all' });
  assert.strictEqual(r.exitCode, 4, 'lint MUST exit 4 on regression');
  assert.ok(r.violations.length >= 1, 'lint MUST report ≥1 violation');
  assert.ok(r.violations[0].file.includes('regression.cjs'), 'violation includes file path');
  assert.ok(typeof r.violations[0].line === 'number' && r.violations[0].line > 0, 'violation includes line number');
  fs.rmSync(dir, { recursive: true, force: true });
});
