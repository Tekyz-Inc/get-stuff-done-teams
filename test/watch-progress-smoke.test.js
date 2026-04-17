/**
 * test/watch-progress-smoke.test.js
 *
 * End-to-end smoke test using the REAL shipped binaries (writer CLI +
 * tree builder/renderer). Builds a 1-root + 2-children + 4-grandchildren
 * tree via `node scripts/gsd-t-watch-state.js`, then runs
 * `node bin/watch-progress.js <stateDir>` and asserts output shape.
 *
 * T12 — proves the whole writer → state files → builder → renderer chain
 * works with actual node processes, no mocks.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..");
const WRITER = path.join(REPO, "scripts", "gsd-t-watch-state.js");
const RENDERER = path.join(REPO, "bin", "watch-progress.js");

function runWriter(cwd, args) {
  const r = spawnSync(process.execPath, [WRITER, ...args], {
    cwd,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`writer exit ${r.status}: ${r.stderr}`);
  }
  return r;
}

test("smoke_end_to_end_3_level_tree_via_real_binaries", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-smoke-"));

  // Second root for collapse verification — a sibling ROOT (not sibling child).
  runWriter(proj, [
    "start",
    "--agent-id", "sibling-root",
    "--parent-id", "null",
    "--command", "gsd-t-scan",
    "--step", "1",
    "--step-label", "sibling-root-step",
  ]);
  runWriter(proj, [
    "start",
    "--agent-id", "sibling-child",
    "--parent-id", "sibling-root",
    "--command", "gsd-t-scan",
    "--step", "2",
    "--step-label", "sibling-child-hidden",
  ]);
  runWriter(proj, ["done", "--agent-id", "sibling-child"]);
  runWriter(proj, ["done", "--agent-id", "sibling-root"]);

  // 1 root + 2 children + 4 grandchildren = 7 state files.
  runWriter(proj, [
    "start",
    "--agent-id", "root",
    "--parent-id", "null",
    "--command", "gsd-t-execute",
    "--step", "1",
    "--step-label", "root-step",
  ]);
  runWriter(proj, [
    "start",
    "--agent-id", "child1",
    "--parent-id", "root",
    "--command", "gsd-t-plan",
    "--step", "2",
    "--step-label", "plan-phase",
  ]);
  runWriter(proj, [
    "start",
    "--agent-id", "child2",
    "--parent-id", "root",
    "--command", "gsd-t-verify",
    "--step", "3",
    "--step-label", "verify-phase",
  ]);
  // Child1's grandchildren (done → appear in collapsed count)
  runWriter(proj, [
    "start",
    "--agent-id", "g1a",
    "--parent-id", "child1",
    "--command", "gsd-t-plan",
    "--step", "1",
    "--step-label", "plan-task-a",
  ]);
  runWriter(proj, ["done", "--agent-id", "g1a"]);
  runWriter(proj, [
    "start",
    "--agent-id", "g1b",
    "--parent-id", "child1",
    "--command", "gsd-t-plan",
    "--step", "2",
    "--step-label", "plan-task-b",
  ]);
  runWriter(proj, ["done", "--agent-id", "g1b"]);
  // Child2's grandchildren — one done, one in_progress. Make child2 the current.
  runWriter(proj, [
    "start",
    "--agent-id", "g2a",
    "--parent-id", "child2",
    "--command", "gsd-t-verify",
    "--step", "1",
    "--step-label", "verify-task-a",
  ]);
  runWriter(proj, ["done", "--agent-id", "g2a"]);
  runWriter(proj, [
    "start",
    "--agent-id", "g2b",
    "--parent-id", "child2",
    "--command", "gsd-t-verify",
    "--step", "2",
    "--step-label", "verify-task-b",
  ]);

  // Assert 9 files on disk (7 primary + 2 sibling-root).
  const stateDir = path.join(proj, ".gsd-t", ".watch-state");
  const files = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 9, `expected 9 state files, got ${files.length}`);

  // Run the renderer. The bin has a CLI entry that accepts an arg for stateDir.
  const res = spawnSync(process.execPath, [RENDERER, stateDir], {
    encoding: "utf8",
    cwd: proj,
  });
  assert.equal(res.status, 0, res.stderr);
  const out = res.stdout;

  // Expanded-root label present (root is selected because g2b is
  // most-recently-started in_progress).
  assert.match(out, /root-step/);
  assert.match(out, /plan-phase/);
  assert.match(out, /plan-task-a/);
  assert.match(out, /plan-task-b/);
  assert.match(out, /verify-phase/);
  assert.match(out, /verify-task-a/);
  assert.match(out, /verify-task-b/);

  // Sibling ROOT (sibling-root) is collapsed — its grandchild label must NOT
  // appear individually; the root line has `(N tasks done)` suffix.
  assert.ok(
    !out.includes("sibling-child-hidden"),
    `sibling root should be collapsed: ${out}`,
  );
  assert.match(out, /sibling-root-step.*tasks done/);

  // At least one of each relevant marker appears.
  assert.match(out, /✅/); // done
  assert.match(out, /🔄/); // in_progress
});
