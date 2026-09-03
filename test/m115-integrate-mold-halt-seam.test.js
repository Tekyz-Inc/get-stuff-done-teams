'use strict';
/**
 * M115 integrate — the mold ↔ halt-tool seam (plan-visibility ↔ halt-convergence).
 *
 * The two Wave-2 domains share no file, but they share the contract §2.2 marker literals:
 * `templates/TestPlan-spec.md` (plan-visibility) shows the markers in place, and
 * `bin/gsd-t-testplan-halt.cjs` (halt-convergence) reads them to find open rows.
 *
 * Found at integrate: the mold's example `GAP` row wrapped the marker in backticks
 * (`` `GAP` — … ``), so a plan copied from the mold carried a cell that does not START
 * with the literal — the halt tool saw zero open rows in the mold's own example and the
 * round cap could never fire. That is the exact silent-convergence shape the milestone
 * exists to prevent, so the seam is asserted here mechanically rather than by reading.
 *
 * This test is integration-owned: it fails if EITHER side drifts (the mold re-wraps the
 * marker, or the parser stops recognising the mold's row shape).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOLD = path.join(__dirname, '..', 'templates', 'TestPlan-spec.md');
const { parseOpenRows } = require('../bin/gsd-t-testplan-halt.cjs');

test('M115 integrate — the mold\'s example GAP row is visible to the halt tool as open', () => {
  const open = parseOpenRows(fs.readFileSync(MOLD, 'utf8'));
  assert.equal(open.length, 1, `expected exactly the one example GAP row, got ${JSON.stringify(open)}`);
  assert.equal(open[0].seq, '3');
  assert.match(open[0].table, /Feature or Capability Name/);
});

test('M115 integrate — a marker wrapped in backticks is NOT the literal (the drift this guards)', () => {
  const doc = fs.readFileSync(MOLD, 'utf8').replace('| GAP — {why', '| `GAP` — {why');
  assert.equal(parseOpenRows(doc).length, 0, 'a backticked marker must not read as the literal');
});

test('M115 integrate — the mold\'s example DECIDED-WITHOUT-YOU row is a closed row, not a gap', () => {
  const open = parseOpenRows(fs.readFileSync(MOLD, 'utf8'));
  assert.ok(!open.some((r) => r.seq === '2'), 'the self-answered example row must not be counted as open');
});
