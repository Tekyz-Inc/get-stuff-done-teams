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

// ── The slicing axis was unspecified (M112) ─────────────────────────────────
//
// Two runs over the SAME codebase produced 47 slices and 34 slices with ZERO
// keys in common. One cut by technical layer (api-routes-billing, lib-billing,
// schema-billing, pages-billing), the other by business feature
// (billing-invoicing-payments). "Cohesive responsibility" is satisfied by both,
// so the choice was free to flip between runs.
//
// It matters twice over: registers cannot be compared when the slices do not
// correspond, and a cross-tenant access hole — a route that never checks the
// caller's school before reaching the data layer — is invisible when the route
// and the data access live in different slices.

test('M112: the probe is told to slice vertically, by capability', () => {
  assert.match(src, /SLICE VERTICALLY, BY BUSINESS CAPABILITY/,
    'the axis must be stated, not left to the reading');
  assert.match(src, /never by technical layer/i);
  assert.match(src, /the worst defects live in the seam BETWEEN layers/,
    'and the reason must be given, or the instruction reads as style');
});

test('M112: a genuinely cross-cutting concern may still be its own slice', () => {
  assert.match(src, /genuinely cross-cutting concerns owned by no feature/,
    'authentication and shared middleware belong to no single feature');
});

test('M112: layer-shaped slice keys are detected and named', () => {
  assert.match(src, /SLICING AXIS DRIFT/,
    'a prompt is advice — the drift must be caught mechanically too');
  assert.match(src, /LAYER_PREFIX/);
});

test('M112: the drift check matches the real keys from both runs', () => {
  const m = src.match(/const LAYER_PREFIX = (\/.*\/i);/);
  assert.ok(m, 'the pattern must be present');
  const re = new RegExp(m[1].slice(1, -2), 'i');

  for (const k of ['api-routes-billing-payments', 'lib-billing-payments-integrations',
                   'schema-billing-finance', 'pages-billing-finance-ui']) {
    assert.ok(re.test(k), `${k} is layer-shaped and must be flagged`);
  }
  for (const k of ['billing-invoicing-payments', 'scheduling-engine',
                   'auth-session-rbac', 'maintenance-hub']) {
    assert.ok(!re.test(k), `${k} is a capability and must NOT be flagged`);
  }
});

test('M112: axis drift warns but does not halt', () => {
  // A horizontally-sliced scan still finds real defects; it just misses the
  // cross-layer ones. Stopping the run would cost more than it saves.
  const block = src.slice(src.indexOf('SLICING AXIS DRIFT') - 400, src.indexOf('SLICING AXIS DRIFT') + 900);
  assert.ok(!/return \{ status: "failed"/.test(block), 'drift is reported, not fatal');
});

// ── Thoroughness: size bounds the slice, not the count (M112) ───────────────
//
// The cap used to TRUNCATE — `rawSlices.slice(0, cap)` deleted the excess and
// the run continued. Those areas were never scanned, never counted as failures,
// never mentioned: a coverage hole invisible by construction. It took a
// 34-slice probe down to 24 slices run.
//
// And the count was the wrong thing to bound. What decides whether a finding is
// found is how many files ONE agent must read. The finder is told to read every
// file; at ~245 it samples instead, and a sampled slice looks clean.

test('M112: the cap no longer deletes slices', () => {
  assert.ok(!/slices = rawSlices\.slice\(0, sliceCap\)/.test(src),
    'silently dropping slices removes code from the scan with no record of it');
});

test('M112: maxSlicesHint no longer deletes slices either', () => {
  // Nothing may be left out of a scan — not even on request.
  assert.match(src, /IGNORING it — dropping slices would leave code unscanned/);
  assert.ok(!/slices = rawSlices\.slice\(0, maxSlicesOverride\)/.test(src));
});

test('M112: over-slicing is reported, not corrected by deletion', () => {
  assert.match(src, /Running all \$\{rawSlices\.length\} anyway/,
    'dropping a slice to tidy the count is the bug, not the fix');
});

test('M112: slices too large to read are RE-SLICED, not merely warned about', () => {
  // A warning leaves the run under-reading every slice. Splitting fixes it.
  assert.match(src, /SLICES TOO LARGE TO ENUMERATE/);
  assert.match(src, /MAX_FILES_PER_SLICE = 120/,
    'a readable slice is the unit of thoroughness');
  assert.match(src, /label: "probe:reslice"/,
    'the decomposition must go back to be split');
  assert.match(src, /it samples instead/,
    'the cost must be stated: a sampled slice looks complete and is not');
});

test('M112: a rejected re-slice is retried with the fault named', () => {
  // Keeping the coarse decomposition would continue past a failure with every
  // slice under-read. It retries instead.
  assert.match(src, /newSlices\.length > slices\.length && lost\.length === 0/,
    'accept only a genuinely finer decomposition that kept every path');
  assert.match(src, /Retrying with the fault named/);
  assert.match(src, /probe:reslice \(retry\)/);
});

test('M112: when both attempts fail, slices are split MECHANICALLY', () => {
  // A crude split that reads every file beats a tidy one that reads half.
  assert.match(src, /splitting mechanically instead/);
  assert.match(src, /every path is still scanned and no slice is too large to read/);
  assert.match(src, /paths\.slice\(i, i \+ per\)/,
    'the chunks ARE the path list cut up, so no path can be lost');
});

test('M112: the re-slice splits vertically and never merges', () => {
  const block = src.slice(src.indexOf('Re-slice a codebase decomposition'), src.indexOf('label: "probe:reslice"'));
  assert.match(block, /still VERTICALLY/);
  assert.match(block, /Never merge two slices to tidy the count/);
  assert.match(block, /EVERY path in the input must appear in exactly one output slice/);
});

test('M112: re-slicing happens before any scanning', () => {
  assert.ok(src.indexOf('label: "probe:reslice"') < src.indexOf('phase("Deep Scan")'),
    'splitting after the scan would be too late to matter');
});

test('M112: the probe is told to size slices, not count them', () => {
  assert.match(src, /SIZE IS THE CONSTRAINT, NOT THE COUNT/);
  assert.match(src, /that is roughly the MINIMUM number of slices/,
    'a large codebase needs many slices — the probe must know that');
  assert.ok(!/A well-decomposed system has a finite, sensible number/.test(src),
    '"sensible number" is what pushed it toward fewer, larger, unread slices');
});

test('M112: a feature too large is split vertically, never merged', () => {
  assert.match(src, /SPLIT ALONG ITS OWN SEAMS, still vertically/);
  assert.match(src, /Never merge two features to reduce the count/);
});
