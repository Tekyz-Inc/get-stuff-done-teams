'use strict';

/**
 * Every tool the verify gate reaches through __dirname must ship to projects.
 *
 * bin/gsd-t-verify-gate.cjs is copied into each project's bin/ (PROJECT_BIN_TOOLS)
 * and dispatches its Track-2 checks via `path.join(__dirname, '<tool>.cjs')`. A
 * tool that exists in this repo but is NOT in PROJECT_BIN_TOOLS is therefore
 * present on the author's machine and absent in every project — the gate fails
 * with a missing module, and it reads as the project's fault. This has now
 * happened five times (latest: gsd-t-logging-envelope-check.cjs, TimeTracking
 * TD-395, 2026-09-03). This test closes the class, not the instance.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');

function projectBinTools() {
  const src = fs.readFileSync(path.join(REPO, 'bin', 'gsd-t.js'), 'utf8');
  const start = src.indexOf('const PROJECT_BIN_TOOLS');
  assert.ok(start > 0, 'PROJECT_BIN_TOOLS must exist in bin/gsd-t.js');
  const end = src.indexOf('];', start);
  const block = src.slice(start, end);
  return new Set([...block.matchAll(/"([^"]+\.c?js)"/g)].map((m) => m[1]));
}

function dirnameRefs(file) {
  const src = fs.readFileSync(path.join(REPO, 'bin', file), 'utf8');
  return [...new Set([...src.matchAll(/__dirname,\s*['"]([^'"]+\.c?js)['"]/g)].map((m) => m[1]))];
}

test('every __dirname tool the verify gate dispatches to is in PROJECT_BIN_TOOLS', () => {
  const tools = projectBinTools();
  assert.ok(tools.has('gsd-t-verify-gate.cjs'), 'the gate itself ships to projects');
  const refs = dirnameRefs('gsd-t-verify-gate.cjs');
  assert.ok(refs.length >= 5, `expected the gate to dispatch to several tools, saw ${refs.length}`);
  const missing = refs.filter((r) => !tools.has(r));
  assert.deepStrictEqual(missing, [], `verify-gate reaches these via __dirname but they never reach a project: ${missing.join(', ')}`);
  for (const r of refs) {
    assert.ok(fs.existsSync(path.join(REPO, 'bin', r)), `${r} is referenced but does not exist in bin/`);
  }
});

test('the check FAILS on a tool that is referenced but not propagated (negative)', () => {
  // Same predicate the positive test uses, against a synthetic gate source.
  const fake = "plan.push({ cmd: 'node', args: [path.join(__dirname, 'gsd-t-not-shipped.cjs')] });";
  const refs = [...fake.matchAll(/__dirname,\s*['"]([^'"]+\.c?js)['"]/g)].map((m) => m[1]);
  const tools = projectBinTools();
  assert.deepStrictEqual(refs.filter((r) => !tools.has(r)), ['gsd-t-not-shipped.cjs']);
});

test('every local require() of a PROJECT_BIN_TOOLS member is itself in PROJECT_BIN_TOOLS', () => {
  // A tool that ships to projects but requires a sibling that does not is dead
  // on arrival there (the shared plan reader gsd-t-testplan-rows.cjs, M115).
  const tools = projectBinTools();
  const missing = [];
  for (const t of tools) {
    const p = path.join(REPO, 'bin', t);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/require\(\s*['"]\.\/([^'"]+\.c?js)['"]\s*\)/g)) {
      if (!tools.has(m[1])) missing.push(`${t} -> ${m[1]}`);
    }
  }
  assert.deepStrictEqual(missing, [], `shipped tools require siblings that never ship: ${missing.join(', ')}`);
});
