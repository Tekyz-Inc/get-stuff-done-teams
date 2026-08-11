'use strict';

/**
 * M112 — a scan finding must not be thrown away over its FORM.
 *
 * HiloAviation, 2026-08-10: 2 of 228 slices failed a deep scan. The agent had
 * found real problems — its own log shows one call carrying findings and the
 * next carrying an empty array, the shape of an agent giving up and submitting
 * nothing to satisfy the schema. Both were refused, five times, and 179.6k
 * tokens of work was discarded. The report then read 226 of 228 with no sign
 * that two of the densest areas had vanished.
 *
 * Two rules did it, neither of which checks whether a finding is TRUE:
 *   - `additionalProperties: false` — a finder adding `evidence` or a line
 *     number lost the entire call, not the extra field.
 *   - case-exact word lists — "High" was refused where "HIGH" was demanded.
 *
 * Nothing about what a finding must CONTAIN is loosened: the required keys are
 * still required.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW = path.join(__dirname, '..', 'templates', 'workflows', 'gsd-t-scan.workflow.js');
const src = fs.readFileSync(WORKFLOW, 'utf8');

// The workflow runs in a sandbox with no module system, so its schemas are read
// out of the source rather than imported.
function schemaBlock(name) {
  const start = src.indexOf(`const ${name} = {`);
  assert.ok(start > 0, `${name} not found`);
  const end = src.indexOf('\n};', start);
  return src.slice(start, end);
}

test('M112: a finding may carry extra detail without losing the whole call', () => {
  const finder = schemaBlock('FINDER_SCHEMA');
  assert.ok(!/additionalProperties: false/.test(finder),
    'a finder adding evidence or a line number must not be refused wholesale');
});

test('M112: what a finding must contain is unchanged', () => {
  const finder = schemaBlock('FINDER_SCHEMA');
  for (const key of ['title', 'severity', 'area', 'files', 'detail', 'recommendation']) {
    assert.match(finder, new RegExp(`"${key}"`), `${key} must still be required`);
  }
  assert.match(finder, /required: \["title", "severity", "area", "files", "detail", "recommendation"\]/,
    'the required list itself must not have been quietly shortened');
});

test('M112: severity is accepted in any casing', () => {
  const finder = schemaBlock('FINDER_SCHEMA');
  for (const form of ['"HIGH"', '"high"', '"High"']) {
    assert.ok(finder.includes(form), `severity ${form} must be accepted`);
  }
});

test('M112: confidence is accepted in any casing', () => {
  const finder = schemaBlock('FINDER_SCHEMA');
  for (const form of ['"high"', '"HIGH"', '"High"']) {
    assert.ok(finder.includes(form), `confidence ${form} must be accepted`);
  }
});

test('M112: the verify result may carry extra detail too', () => {
  const verify = schemaBlock('VERIFY_SCHEMA');
  assert.ok(!/additionalProperties: false/.test(verify),
    'extra context must not cost the whole verdict');
});

// ── Widening a word list breaks exact-match comparisons ──────────────────────
//
// Accepting "FALSE-POSITIVE" while comparing against "false-positive" would
// KEEP a finding the verifier had just rejected — a worse bug than the one
// being fixed.

test('M112: the false-positive check is case-insensitive', () => {
  assert.match(src, /const verdict = String\(v && v\.verdict \|\| ""\)\.toLowerCase\(\)/,
    'the verdict must be lowercased before comparison');
  assert.ok(!/v\.verdict === "false-positive"/.test(src),
    'an exact match would miss a shouted rejection and keep the finding');
});

test('M112: severity is normalised once, at the merge point', () => {
  assert.match(src, /String\(v\.correctedSeverity \|\| f\.severity \|\| ""\)\.toUpperCase\(\)/,
    'the report must read consistently however a finder typed it');
});

test('M112: document status comparisons are case-insensitive', () => {
  assert.match(src, /_status\(r\) === "written"/,
    'an exact match would count a written document as neither written nor failed');
});
