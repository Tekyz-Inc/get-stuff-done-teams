'use strict';

/**
 * M55 D5 — Wire-in assertion test: commands/gsd-t-verify.md Step 2.
 *
 * TDD shape: this test lands BEFORE the additive Step 2 block edit (T9).
 * It begins RED, then turns GREEN once T9 lands.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const VERIFY_MD = path.resolve(__dirname, '..', 'commands', 'gsd-t-verify.md');

test('gsd-t-verify.md Step 2 includes M55 verify-gate invocation block', () => {
  const md = fs.readFileSync(VERIFY_MD, 'utf8');

  // Marker comment — D5 ships this exact line in Step 2.
  assert.ok(
    md.includes('<!-- M55-D5: verify-gate wire-in -->'),
    'expected Step 2 to contain M55-D5 verify-gate wire-in marker'
  );

  // The block must invoke gsd-t verify-gate.
  assert.ok(
    /gsd-t\s+verify-gate/i.test(md),
    'expected `gsd-t verify-gate` invocation in verify.md'
  );

  // The block must reference --json so the LLM judge consumes structured summary.
  assert.ok(
    /verify-gate[\s\S]{0,200}--json/i.test(md),
    'expected verify-gate to be invoked with --json'
  );

  // The block must mention the LLM judge (or judge companion bin).
  assert.ok(
    /verify-gate-judge|gsd-t-verify-gate-judge|LLM\s+judge/i.test(md),
    'expected reference to LLM judge / verify-gate-judge in verify.md'
  );
});

test('gsd-t-verify.md verify-gate wire-in lives within Step 2', () => {
  const md = fs.readFileSync(VERIFY_MD, 'utf8');
  const marker = '<!-- M55-D5: verify-gate wire-in -->';
  const markerIdx = md.indexOf(marker);
  if (markerIdx < 0) {
    assert.ok(false, 'marker absent');
    return;
  }
  const step2Idx = md.indexOf('## Step 2');
  // Allow Step 2.5 to follow.
  const step3Idx = md.indexOf('## Step 3');
  assert.ok(step2Idx > 0, 'verify.md must declare Step 2');
  assert.ok(markerIdx > step2Idx, 'wire-in marker must be inside Step 2 (after the heading)');
  if (step3Idx > 0) {
    assert.ok(markerIdx < step3Idx, 'wire-in marker must precede Step 3');
  }
});
