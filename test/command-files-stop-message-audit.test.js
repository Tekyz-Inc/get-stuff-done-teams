/**
 * Audit test: no command file may instruct the user to "Run /clear".
 * After M36 gap-fix T3, all context-runway handoffs use autoSpawnHeadless()
 * instead of the manual /clear + /user:gsd-t-resume STOP pattern.
 *
 * Uses Node.js built-in test runner (node --test).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

test('no command file instructs user to Run /clear (M36 gap fix — use autoSpawnHeadless instead)', () => {
  const dir = join(__dirname, '..', 'commands');
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const offenders = [];
  for (const f of files) {
    const content = readFileSync(join(dir, f), 'utf8');
    if (content.includes('Run /clear')) {
      offenders.push(f);
    }
  }
  assert.deepEqual(offenders, [], `Command files still contain "Run /clear" STOP messages: ${offenders.join(', ')} — replace with autoSpawnHeadless() per M36 m35-gap-fixes T3`);
});
