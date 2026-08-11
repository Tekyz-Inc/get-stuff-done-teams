'use strict';

/**
 * M112 — the code graph never reached a single scanning agent for six weeks.
 *
 * `graphWiringMode` was set to "WIRED" and tested with `=== "wired"`. Case
 * sensitive, so never true: the structural slice (dead-code candidates, dangling
 * edges, clusters) was computed on every run and then discarded, unused, from
 * 2026-06-30 to 2026-08-11.
 *
 * Nothing looked wrong. The register header prints the same variable, so every
 * scan honestly reported WIRED — the graph really had built and answered. Its
 * results simply never arrived where they were needed.
 *
 * This is the SECOND time the same variable broke this way: the producer was
 * uppercased to satisfy a rollup comparing `=== "WIRED"`, which broke the scan's
 * consumer. Matching casing to casing moves the bug; comparing without case ends
 * it, and is the house rule for this kind of value anyway.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const SCAN = fs.readFileSync(path.join(REPO, 'templates', 'workflows', 'gsd-t-scan.workflow.js'), 'utf8');
const ROLLUP = fs.readFileSync(path.join(REPO, 'bin', 'gsd-t-graph-metrics-rollup.cjs'), 'utf8');

// The real decision, lifted out so it can be exercised rather than described.
const injects = (mode, structuralSlice) =>
  (String(mode).toLowerCase() === 'wired' && structuralSlice) ? structuralSlice : null;

test('M112: the graph reaches the finders whatever the casing', () => {
  const slice = { deadCode: [], dangling: [], clusters: [] };
  for (const mode of ['WIRED', 'wired', 'Wired']) {
    assert.equal(injects(mode, slice), slice, `${mode} must inject the structural slice`);
  }
});

test('M112: "WIRED" is what the scan actually produces, and it now passes', () => {
  // The exact value and the exact test that missed each other for six weeks.
  assert.match(SCAN, /graphWiringMode = "WIRED"/, 'the producer still writes WIRED');
  assert.equal(injects('WIRED', { deadCode: [] }) !== null, true,
    'and the consumer must now accept it');
});

test('M112: a fallback or disabled run still gets no graph data', () => {
  // The fix must not make everything look wired.
  for (const mode of ['fallback-announced', 'FALLBACK-ANNOUNCED', 'disabled', 'pending', '']) {
    assert.equal(injects(mode, { deadCode: [] }), null, `${mode} must NOT inject`);
  }
});

test('M112: no reader of the wiring mode compares case-sensitively', () => {
  // Every exact-match comparison of this value is a future outage.
  const offenders = [];
  for (const [name, src] of [['scan', SCAN], ['rollup', ROLLUP]]) {
    const re = /mode\s*===\s*"(WIRED|wired|fallback-announced|disabled)"/g;
    let m;
    while ((m = re.exec(src)) !== null) offenders.push(`${name}: === "${m[1]}"`);
  }
  assert.deepEqual(offenders, [],
    'matching one casing to another is what broke this twice — compare without case');
});

test('M112: the fix is present at both ends', () => {
  assert.match(SCAN, /String\(graphWiringMode\)\.toLowerCase\(\) === "wired"/,
    'the scan consumer');
  assert.match(ROLLUP, /String\(mode\)\.toLowerCase\(\) === "wired"/,
    'and the rollup that started it');
});

test('M112: the comment no longer tells the next person to match casing', () => {
  // The old comment instructed exactly the change that caused the outage.
  assert.ok(!/wiring-mode-casing-matches-rollup/.test(SCAN),
    'that rule name is what the next maintainer would have followed');
  assert.match(SCAN, /wiring-mode-compared-without-case/);
});
