'use strict';

/**
 * M112 — the probe returned a stand-in, and the scan ran it.
 *
 * HiloAviation, 2026-08-11. The volume probe answered:
 *
 *     totals : {"trackedFiles": 5036}
 *     slices : [{"key": "test", "paths": ["src/"]}]
 *
 * One slice for a 4,900-file application, keyed "test", and a totals object
 * holding none of the six numbers the prompt named. The schema accepted it —
 * one slice is legal, `totals` takes any object — so the scan read that single
 * slice, produced 3 findings, and headed the register "Coverage: FULL".
 *
 * The probe had no retry: one call, and whatever came back became the plan.
 * A finder that answers `{"findings":[]}` is caught and re-run; the probe, which
 * decides what every finder will ever look at, was not.
 *
 * The tell is not the slice count — a tiny repo really is one slice. It is that
 * the fields explicitly requested are absent: the shape of an answer without the
 * work behind it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const SCAN = fs.readFileSync(path.join(REPO, 'templates', 'workflows', 'gsd-t-scan.workflow.js'), 'utf8');

// The detector, lifted out so it can be exercised rather than described. Kept
// byte-identical in behaviour to the workflow copy; the last test below proves
// the workflow still carries it.
const projectDir = '/Users/david/projects/hilo';
function probePlaceholderFaults(result) {
  const faults = [];
  const totals = (result && result.totals) || {};
  const slices = (result && Array.isArray(result.slices) && result.slices) || [];

  const asked = ['files', 'loc', 'routes', 'tables', 'components', 'featureDomains'];
  const present = asked.filter((k) => totals[k] !== undefined && totals[k] !== null);
  if (present.length === 0) {
    faults.push(`totals contains none of the six requested measurements (${asked.join(', ')})`);
  }

  const WHOLE_TREE = new Set(['.', './', '*', 'src', 'src/', './src', './src/', projectDir]);
  if (slices.length === 1 && present.length === 0) {
    const paths = Array.isArray(slices[0].paths) ? slices[0].paths : [];
    if (paths.length && paths.every((p) => WHOLE_TREE.has(String(p).trim().replace(/\/+$/, '/')) || WHOLE_TREE.has(String(p).trim()))) {
      faults.push(`the one slice "${slices[0].key}" owns the entire source tree`);
    }
  }
  return faults;
}

test('M112: the exact answer that produced the 3-finding scan is rejected', () => {
  const faults = probePlaceholderFaults({
    totals: { trackedFiles: 5036 },
    slices: [{ key: 'test', paths: ['src/'] }],
  });
  assert.equal(faults.length, 2, 'both tells must fire on the real payload');
  assert.match(faults[0], /none of the six requested measurements/);
  assert.match(faults[1], /entire source tree/);
});

test('M112: a real measurement passes untouched', () => {
  const faults = probePlaceholderFaults({
    totals: { files: 4785, loc: 812000, routes: 214, tables: 96, components: 640, featureDomains: 17 },
    slices: [
      { key: 'billing-invoicing', paths: ['src/app/billing', 'src/lib/invoice'] },
      { key: 'work-orders', paths: ['src/app/work-orders'] },
    ],
  });
  assert.deepEqual(faults, [], 'a probe that did its job must not be second-guessed');
});

test('M112: a genuinely single-slice project is not called a placeholder', () => {
  // A small repo really is one slice covering src/. Halting that scan would be a
  // false alarm on every small project — worse than the bug being fixed, because
  // it breaks runs that were working. The measurements are what separate a real
  // one-slice answer from a stand-in, so the whole-tree tell only counts when the
  // totals are missing too.
  const faults = probePlaceholderFaults({
    totals: { files: 22, loc: 3100, routes: 4, tables: 2, components: 6, featureDomains: 1 },
    slices: [{ key: 'the-cli', paths: ['src/'] }],
  });
  assert.deepEqual(faults, [], 'measured totals mean the whole-tree slice is a real answer');
});

test('M112: one real measurement is enough to clear the totals check', () => {
  // The bar is "did you measure anything you were asked for", not "all six".
  const faults = probePlaceholderFaults({
    totals: { files: 4785 },
    slices: [{ key: 'billing', paths: ['src/app/billing'] }],
  });
  assert.deepEqual(faults, [], 'a partial but real measurement is not a stand-in');
});

test('M112: whole-tree spellings are all caught', () => {
  for (const p of ['src', 'src/', './src', './src/', '.', './', '*', projectDir]) {
    const faults = probePlaceholderFaults({ totals: {}, slices: [{ key: 'x', paths: [p] }] });
    assert.ok(faults.some((f) => /entire source tree/.test(f)), `"${p}" must read as the whole tree`);
  }
});

test('M112: a slice owning a real subdirectory is never called whole-tree', () => {
  const faults = probePlaceholderFaults({ totals: {}, slices: [{ key: 'billing', paths: ['src/app/billing'] }] });
  assert.equal(faults.length, 1, 'only the totals fault — the path is a genuine subtree');
  assert.match(faults[0], /requested measurements/);
});

test('M112: the whole-tree tell requires the totals tell — one judgment, not two', () => {
  // Pinned deliberately: an earlier version of this detector fired on the path
  // alone and would have halted every small project's scan.
  const measured = { files: 40, loc: 5000, routes: 3, tables: 1, components: 9, featureDomains: 1 };
  for (const p of ['src', 'src/', '.', '*']) {
    assert.deepEqual(probePlaceholderFaults({ totals: measured, slices: [{ key: 'app', paths: [p] }] }), [],
      `a measured probe covering "${p}" is a real answer, not a stand-in`);
  }
});

test('M112: a missing or malformed probe result does not throw', () => {
  // The detector runs before anything has validated the result, so it has to
  // survive whatever arrives.
  for (const bad of [null, undefined, {}, { totals: null, slices: null }, { slices: 'nope' }]) {
    assert.doesNotThrow(() => probePlaceholderFaults(bad), `${JSON.stringify(bad)} must not throw`);
  }
});

test('M112: the workflow retries the probe on opus, and halts if that fails too', () => {
  assert.match(SCAN, /probePlaceholderFaults/, 'the detector must be wired into the workflow');
  assert.match(SCAN, /volume-probe \(retry on opus\)/, 'the retry must exist');
  assert.match(SCAN, /label: "volume-probe \(retry on opus\)", phase: "Probe", schema: PROBE_SCHEMA, model: "opus"/,
    'and it must escalate — a second sonnet attempt reproduces the same answer');
  assert.match(SCAN, /reason: "probe-placeholder"/,
    'two stand-ins must halt the scan, never scan the stand-in');
});

test('M112: the probe reports its plan before anything runs on it', () => {
  // A thin plan was only ever visible afterwards, in a thin register.
  assert.match(SCAN, /log\(`probe: \$\{rawSlices\.length\} slice\(s\) — totals=/,
    'the slice count and totals must be logged at probe time');
});

test('M112: the probe is no longer a single unchecked call', () => {
  // The regression: one `await agent(...)` whose result became the plan.
  assert.ok(!/const probe = await agent\(/.test(SCAN),
    'a bare `const probe = await agent(` is the shape that had no retry');
  assert.match(SCAN, /let probe = await agent\(PROBE_PROMPT/,
    'the prompt must be reusable so the retry sends the same task');
});
