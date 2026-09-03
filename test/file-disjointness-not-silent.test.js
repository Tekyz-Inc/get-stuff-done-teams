'use strict';
// bin/gsd-t-file-disjointness.cjs is a library. Run directly it produced NO output and
// exit 0, and a partition finalizer read that as a clean disjointness check. Silence is
// never a pass: direct invocation must say so and exit 64 (bad input), like every gate.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TOOL = path.join(__dirname, '..', 'bin', 'gsd-t-file-disjointness.cjs');

test('running the disjointness library directly exits 64 and names the real command', () => {
  for (const args of [[], ['--help'], ['--dry-run']]) {
    const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
    assert.strictEqual(r.status, 64, `args ${JSON.stringify(args)}: expected exit 64, got ${r.status}`);
    assert.match(r.stderr, /gsd-t parallel --dry-run/, 'must point at the CLI that actually checks');
  }
});

test('requiring it as a library still works and exports the checker', () => {
  const mod = require(TOOL);
  assert.strictEqual(typeof mod, 'object');
  assert.ok(Object.keys(mod).length > 0, 'exports are intact');
});
