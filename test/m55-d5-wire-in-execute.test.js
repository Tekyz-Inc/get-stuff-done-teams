'use strict';

/**
 * M55 D5 — Wire-in assertion test: commands/gsd-t-execute.md Step 1.
 *
 * TDD shape: this test lands BEFORE the additive Step 1 block edit (T8).
 * It begins RED, then turns GREEN once T8 lands.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXECUTE_MD = path.resolve(__dirname, '..', 'commands', 'gsd-t-execute.md');

test('gsd-t-execute.md Step 1 includes M55 preflight + brief invocation block', () => {
  const md = fs.readFileSync(EXECUTE_MD, 'utf8');

  // Marker comment — D5 ships this exact line in Step 1.
  assert.ok(
    md.includes('<!-- M55-D5: preflight + brief wire-in -->'),
    'expected Step 1 to contain M55-D5 preflight+brief wire-in marker'
  );

  // The block must instruct the orchestrator to run preflight before fan-out.
  assert.ok(
    /gsd-t\s+preflight/i.test(md),
    'expected `gsd-t preflight` invocation in execute.md'
  );

  // The block must instruct the orchestrator to generate a brief.
  assert.ok(
    /gsd-t\s+brief\s+--kind\s+execute/i.test(md),
    'expected `gsd-t brief --kind execute` invocation in execute.md'
  );

  // The block must thread the brief path into worker prompts via $BRIEF_PATH.
  assert.ok(
    md.includes('$BRIEF_PATH') || md.includes('${BRIEF_PATH}'),
    'expected $BRIEF_PATH to be referenced in execute.md'
  );
});

test('gsd-t-execute.md preflight wire-in lives within Step 1 (additive, not Step 2+)', () => {
  const md = fs.readFileSync(EXECUTE_MD, 'utf8');
  const marker = '<!-- M55-D5: preflight + brief wire-in -->';
  const markerIdx = md.indexOf(marker);
  if (markerIdx < 0) {
    // First test will have already failed; skip detailed positional check.
    assert.ok(false, 'marker absent');
    return;
  }
  const step1Idx = md.indexOf('## Step 1');
  const step2Idx = md.indexOf('## Step 2');
  assert.ok(step1Idx > 0 && step2Idx > step1Idx, 'execute.md must declare Step 1 before Step 2');
  assert.ok(
    markerIdx > step1Idx && markerIdx < step2Idx,
    `M55-D5 wire-in marker (idx ${markerIdx}) must be inside Step 1 (idx ${step1Idx}) before Step 2 (idx ${step2Idx})`
  );
});
