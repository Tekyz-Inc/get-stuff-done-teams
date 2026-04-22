"use strict";

/**
 * Regression: the supervisor must spawn `claude -p` workers with
 * `--output-format stream-json --verbose` so the worker streams events
 * (and the M42 transcript tee receives lines) instead of buffering all
 * output until exit.
 *
 * Origin: 2026-04-22 unattended launch had 0-byte transcript NDJSONs
 * because the supervisor's explicit args array omitted these flags.
 *
 * This is a static check on the source — exercising the spawn path
 * end-to-end would require booting a real claude binary. The flags are
 * declared at exactly two sites and both must include the canonical pair.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..");

test("supervisor explicit args include --output-format stream-json --verbose", () => {
  const src = fs.readFileSync(
    path.join(REPO, "bin", "gsd-t-unattended.cjs"),
    "utf8"
  );
  // The supervisor's _spawnWorker passes a literal args: [...] array. Both
  // flag tokens must be present somewhere in that array.
  assert.match(src, /"--output-format"\s*,\s*"stream-json"/);
  assert.match(src, /"--verbose"/);
  assert.match(src, /"--dangerously-skip-permissions"/);
});

test("platform spawnWorker default args fallback includes streaming flags", () => {
  const src = fs.readFileSync(
    path.join(REPO, "bin", "gsd-t-unattended-platform.cjs"),
    "utf8"
  );
  // The default-args branch (`opts.args || [...]`) must also stream so any
  // future caller that omits args: still gets correct behavior.
  assert.match(src, /"--output-format"\s*,\s*"stream-json"/);
  assert.match(src, /"--verbose"/);
  assert.match(src, /"--dangerously-skip-permissions"/);
});
