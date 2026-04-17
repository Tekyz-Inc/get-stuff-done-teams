/**
 * test/watch-shims-present.test.js
 *
 * Grep-assert test: every numbered Step in the 17 workflow command files
 * has a `gsd-t-watch-state.js advance` shim at the top.
 *
 * Covers T10 (batch 1) + T11 (batch 2).
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CMD_DIR = path.resolve(__dirname, "..", "commands");

const BATCH_1 = [
  "gsd-t-milestone.md",
  "gsd-t-partition.md",
  "gsd-t-plan.md",
  "gsd-t-execute.md",
  "gsd-t-test-sync.md",
  "gsd-t-verify.md",
  "gsd-t-complete-milestone.md",
];

const BATCH_2 = [
  "gsd-t-project.md",
  "gsd-t-feature.md",
  "gsd-t-integrate.md",
  "gsd-t-scan.md",
  "gsd-t-gap-analysis.md",
  "gsd-t-wave.md",
  "gsd-t-quick.md",
  "gsd-t-debug.md",
  "gsd-t-unattended.md",
  "gsd-t-resume.md",
];

function countSteps(content) {
  const re = /^##+\s+Step\s+\d+/gm;
  const m = content.match(re);
  return m ? m.length : 0;
}

function countShims(content) {
  const re = /gsd-t-watch-state\.js\s+advance/g;
  const m = content.match(re);
  return m ? m.length : 0;
}

function assertShims(fname) {
  const fp = path.join(CMD_DIR, fname);
  const content = fs.readFileSync(fp, "utf8");
  const steps = countSteps(content);
  const shims = countShims(content);
  assert.ok(steps > 0, `${fname} should have at least 1 numbered Step (found ${steps})`);
  assert.ok(
    shims >= steps,
    `${fname} has ${steps} numbered Steps but only ${shims} watch-state shims`,
  );
}

test("shims_present_batch_1_workflow_commands", () => {
  for (const f of BATCH_1) assertShims(f);
});

test("shims_present_batch_2_workflow_commands", () => {
  for (const f of BATCH_2) assertShims(f);
});

test("shim_one_liner_matches_contract_shape", () => {
  // Every shim line must include: --agent-id, --parent-id, --command, --step,
  // --step-label, 2>/dev/null || true (per contract §Shim Invocation Pattern).
  const sampleFile = path.join(CMD_DIR, "gsd-t-milestone.md");
  const content = fs.readFileSync(sampleFile, "utf8");
  const shimLines = content.split("\n").filter((l) => /gsd-t-watch-state\.js\s+advance/.test(l));
  assert.ok(shimLines.length >= 1, "expected at least one shim line in gsd-t-milestone.md");
  for (const l of shimLines) {
    assert.match(l, /--agent-id/);
    assert.match(l, /--parent-id/);
    assert.match(l, /--command/);
    assert.match(l, /--step\s/);
    assert.match(l, /--step-label/);
    assert.match(l, /2>\/dev\/null \|\| true/);
  }
});
