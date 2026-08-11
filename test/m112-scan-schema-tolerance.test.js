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

// ── A scan that lost areas must STOP (M112) ─────────────────────────────────
//
// It already warned and banner-flagged the register — but it kept going, so the
// register got written, read, and acted on. On HiloAviation the two lost areas
// were repositories and data-access: the areas with the most to find. A report
// that under-counts the debt while looking finished is worse than no report.

test('M112: partial coverage halts before anything is written', () => {
  const haltAt = src.indexOf('SCAN HALTED');
  const synthesisAt = src.indexOf('phase("Synthesis")');
  const documentAt = src.indexOf('phase("Document")');
  assert.ok(haltAt > 0, 'the halt must exist');
  assert.ok(haltAt < synthesisAt, 'it must stop before findings are synthesised');
  assert.ok(haltAt < documentAt, 'and long before any document is written');
});

test('M112: the halt names every area that was missed', () => {
  assert.match(src, /\.\.\.failedSlices\.map/,
    'listing the areas by name is what makes the halt actionable');
  assert.match(src, /found nothing because they FAILED, not because they/,
    'the reader must not read a failed area as a clean one');
});

test('M112: the halt returns a failure, never a quiet success', () => {
  const halt = src.slice(src.indexOf('SCAN HALTED'), src.indexOf('allowPartial: true — continuing'));
  assert.match(halt, /ok: false/, 'a halted scan is not a successful scan');
  assert.match(halt, /halted: "partial-coverage"/, 'and it says why');
});

test('M112: continuing anyway is possible, but must be asked for', () => {
  assert.match(src, /const allowPartial\s*=\s*_args\.allowPartial === true/,
    'strictly true — an absent or truthy-ish value must not silently continue');
  assert.match(src, /continuing with an INCOMPLETE scan, as asked/,
    'and taking that route is said out loud');
});

// ── Escalate to the model that does not make the mistake (M112) ─────────────
//
// Measured on HiloAviation's own transcripts: 66 of 110 finders passed
// {"input": "<the whole result as a string>"} instead of real fields. The
// validator repeats the same message and never says "you stringified it", so an
// agent either guesses the unwrapped form or exhausts its attempts — 57 guessed,
// 9 did not, each losing ~180k tokens of real findings.
//
// The model is the variable, not the slice: 2026-08-02 ran finders on Opus and
// wrapped 0 times in 64 agents; Sonnet wrapped 40% (08-05) and 52% (08-10)
// across 680.

test('M112: a failed attempt is TOLD what went wrong', () => {
  assert.match(src, /YOUR PREVIOUS ATTEMPT WAS REJECTED/,
    'repeating the same prompt is another lottery ticket');
  assert.match(src, /instead of as real fields/,
    'the hint must name the actual mistake, not just say "try again"');
  assert.match(src, /69 characters was rejected for this reason/,
    'and rule out size, which is the wrong guess an agent makes next');
});

test('M112: the third attempt escalates to opus', () => {
  const fn = src.slice(src.indexOf('async function runFinder'), src.indexOf('async function scanSlice'));
  assert.match(fn, /retry on opus/, 'the last attempt changes the model');
  assert.match(fn, /model: "opus"/, 'to the tier measured at 0% wrapping');
  assert.equal((fn.match(/model: "sonnet"/g) || []).length, 2,
    'the first two attempts stay on sonnet — opus is paid for only by failures');
});

test('M112: every model stays a literal, so the tier lint can still read it', () => {
  // A variable would hide a drifted tier from the guard that exists to catch it.
  const fn = src.slice(src.indexOf('async function runFinder'), src.indexOf('async function scanSlice'));
  assert.ok(!/model: [a-z]\w*\./.test(fn), 'no computed model values');
});

test('M112: verify retries too, having had none at all', () => {
  const block = src.slice(src.indexOf('const verifyPrompt'), src.indexOf('const verdict'));
  assert.match(block, /verify:\$\{sliceKey\} \(retry on opus\)/,
    'one wrapped call used to let a finding through unverified');
  assert.match(block, /UNWRAP_HINT/, 'and the retry must say what went wrong');
});

// ── Recover what the rush broke (M112) ──────────────────────────────────────
//
// Two slices failed a clean run on rate limits alone: 10 agents in flight, the
// account throttled, and all three attempts landing inside the same squeeze.
// That failure says nothing about the slice — only about when it ran.

test('M112: failed slices are retried after the run drains', () => {
  assert.match(src, /final sweep — retrying/,
    'a slice broken by the rush deserves a try when the rush is over');
  assert.match(src, /await sleep\(30000\)/,
    'and the retry must wait for the rate-limit window to pass');
});

test('M112: the sweep runs serially, outside the crowded gate', () => {
  const sweep = src.slice(src.indexOf('final sweep — retrying'), src.indexOf('const succeededCount'));
  assert.match(sweep, /for \(const key of failedSlices\)/,
    'one at a time — re-running through the gate that caused it reproduces the cause');
  assert.ok(!/parallel\(/.test(sweep), 'nothing about the sweep may fan out');
});

test('M112: the sweep happens BEFORE the halt', () => {
  // Halting on a slice the sweep would have recovered wastes the whole run.
  assert.ok(src.indexOf('final sweep — retrying') < src.indexOf('SCAN HALTED'),
    'recovery first, then the stop for whatever is genuinely lost');
});

test('M112: a recovered slice reaches the register', () => {
  assert.match(src, /const allFindings = resultsByIndex/,
    'findings must be read from the array the sweep repairs, not the pre-sweep one');
  assert.match(src, /resultsByIndex\[idx\] = recovered/,
    'and the recovered result must be written back');
});
