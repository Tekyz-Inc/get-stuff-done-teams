'use strict';

/**
 * M55 D5 — Wire-in assertion test: 3 subagent protocols include the
 * "check the brief first" hard rule.
 *
 * TDD shape: lands BEFORE the additive subagent edits (T10). RED first,
 * GREEN once T10 lands.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROMPTS = ['qa-subagent.md', 'red-team-subagent.md', 'design-verify-subagent.md'];

const PROMPT_DIR = path.resolve(__dirname, '..', 'templates', 'prompts');

const MARKER = '<!-- M55-D5: brief-first rule -->';

for (const file of PROMPTS) {
  test(`${file} includes M55 brief-first rule`, () => {
    const md = fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8');

    assert.ok(
      md.includes(MARKER),
      `expected ${file} to contain M55-D5 brief-first marker`
    );

    // Match the canonical line. Allow some flexibility but require BRIEF_PATH ref.
    assert.ok(
      /\$BRIEF_PATH/.test(md),
      `expected ${file} to reference $BRIEF_PATH`
    );

    // The line must mention "brief first" (or close).
    assert.ok(
      /brief\s+first/i.test(md),
      `expected ${file} to contain "brief first" rule`
    );
  });
}
