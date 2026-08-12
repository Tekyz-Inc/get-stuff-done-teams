'use strict';

/**
 * M112 — the register told a live business to fix things "before launch".
 *
 * hilo-figma-atos, 2026-08-11. The plain-English companion labelled all 61
 * critical findings "fix before launch" for a system already serving flight
 * schools. Advice dated to before go-live, on a product that went live long ago,
 * reads as boilerplate — and boilerplate is skipped.
 *
 * The labels had also drifted from their source. One map defined four phrases;
 * the finished document carried TWELVE for four tiers — "Worth scheduling",
 * "Worth scheduling soon", "Should be scheduled soon", "Can be scheduled at
 * normal priority", plus casing variants — and only 36 of the 61 criticals were
 * labelled at all. A reader scanning for what to do next reads the phrase, not
 * the sentence around it, so two identical priorities wearing different words
 * look like different priorities.
 *
 * The fix is one phrase per tier, defined once, copied verbatim.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const SCAN = fs.readFileSync(
  path.join(REPO, 'templates', 'workflows', 'gsd-t-scan.workflow.js'), 'utf8');

// The map as the workflow defines it, lifted out so it can be exercised.
function sevLabelMap() {
  const block = SCAN.slice(SCAN.indexOf('const sevLabel = {'));
  const body = block.slice(0, block.indexOf('};') + 2);
  const out = {};
  for (const m of body.matchAll(/(\w+):\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

test('M112: no severity label assumes the system has not launched', () => {
  const map = sevLabelMap();
  for (const [tier, phrase] of Object.entries(map)) {
    assert.ok(!/launch/i.test(phrase),
      `${tier} is labelled "${phrase}" — most scanned systems are already live`);
  }
});

test('M112: the prohibition reaches the agent that writes the entries', () => {
  // The map alone is not enough: the agent composes the sentence, so the ban has
  // to be in the instruction it reads.
  assert.match(SCAN, /NEVER write "fix before launch"/,
    'the plain-English prompt must forbid the phrasing outright');
  assert.match(SCAN, /severity-label-never-assumes-unlaunched/,
    'the rule must be in the guard map');
});

test('M112: every tier the scan produces has a label', () => {
  // A tier with no phrase used to become the word "review", which says nothing
  // and reads as deliberate.
  const map = sevLabelMap();
  for (const tier of ['EXTREME', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
    assert.ok(map[tier], `${tier} has no label — an unmapped tier is a bug in the map`);
  }
});

test('M112: one phrase per level of urgency, not twelve', () => {
  // MEDIUM and LOW deliberately share a phrase: the action is the same, and two
  // near-identical wordings for one action is exactly the drift being fixed.
  const map = sevLabelMap();
  const phrases = Object.values(map);
  assert.equal(new Set(phrases).size, 4,
    `expected 4 distinct phrases, got ${new Set(phrases).size}: ${JSON.stringify(phrases)}`);
  assert.equal(map.MEDIUM, map.LOW, 'medium and low call for the same action');
});

test('M112: an unmapped severity is announced, never silently labelled', () => {
  assert.ok(!/sevLabel\[it\.severity\] \|\| "review"/.test(SCAN),
    'the old default turned an unrecognised tier into a word that says nothing');
  assert.match(SCAN, /has no label in sevLabel/,
    'an unmapped tier must be logged so the map gets fixed');
  assert.match(SCAN, /String\(it\.severity \|\| ""\)\.toUpperCase\(\)/,
    'severity must be normalised for case — a finder typing "Critical" must not fall through');
});

test('M112: the agent is told to copy the phrase, not reword it', () => {
  assert.match(SCAN, /copied EXACTLY/, 'the phrase is data, not a writing prompt');
  assert.match(SCAN, /do not invent a variant/,
    'twelve phrasings for four tiers is what happens without this line');
});
