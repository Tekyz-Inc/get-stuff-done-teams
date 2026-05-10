'use strict';
/**
 * M56 D3 — Upper-stage command wire-in marker tests
 *
 * Asserts that 5 upper-stage commands (partition, plan, discuss, impact,
 * milestone) carry a `<!-- M56-D3: brief wire-in -->` marker block invoking
 * `gsd-t brief --kind <kind>`.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const projectDir = path.resolve(__dirname, '..');

// Note: `gsd-t-discuss.md` does not exist in this repo (the discuss
// behavior lives inside `commands/gsd.md` Step 2.5 conversational mode).
// The `discuss` brief kind ships in M56 D2 for use by /gsd's conversational
// turns rather than via a separate command file.
const COMMANDS = [
  { file: 'commands/gsd-t-partition.md', kind: 'partition' },
  { file: 'commands/gsd-t-plan.md', kind: 'plan' },
  { file: 'commands/gsd-t-impact.md', kind: 'impact' },
  { file: 'commands/gsd-t-milestone.md', kind: 'milestone' },
];

const OPEN = '<!-- M56-D3: brief wire-in -->';
const CLOSE = '<!-- /M56-D3: brief wire-in -->';

for (const { file, kind } of COMMANDS) {
  test(`${file} carries M56-D3 marker block (open + close)`, () => {
    const text = fs.readFileSync(path.join(projectDir, file), 'utf8');
    assert.ok(text.includes(OPEN), `${file} should contain M56-D3 open marker`);
    assert.ok(text.includes(CLOSE), `${file} should contain M56-D3 close marker`);
  });

  test(`${file} M56-D3 block invokes gsd-t brief --kind ${kind}`, () => {
    const text = fs.readFileSync(path.join(projectDir, file), 'utf8');
    const block = text.slice(text.indexOf(OPEN), text.indexOf(CLOSE));
    const expectedInvocation = new RegExp(`gsd-t brief --kind ${kind}\\b`);
    assert.ok(expectedInvocation.test(block), `${file} block should call gsd-t brief --kind ${kind}`);
    assert.ok(/BRIEF_PATH=/.test(block), `${file} block should export BRIEF_PATH`);
  });
}
