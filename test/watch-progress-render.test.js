/**
 * test/watch-progress-render.test.js
 *
 * Tests for `renderTree` in bin/watch-progress.js.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { buildTree, renderTree, MARKERS } = require("../bin/watch-progress.js");

function makeStateDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-render-"));
  const dir = path.join(root, ".watch-state");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeRecord(dir, rec) {
  fs.writeFileSync(path.join(dir, `${rec.agent_id}.json`), JSON.stringify(rec));
}

function mkRecord(id, parent, status, label, startedAt) {
  return {
    agent_id: id,
    parent_agent_id: parent,
    command: "gsd-t-execute",
    step: 1,
    step_label: label || `label-${id}`,
    status,
    started_at: startedAt || new Date().toISOString(),
    completed_at: status === "done" || status === "skipped" || status === "failed"
      ? new Date().toISOString() : null,
    metadata: {},
  };
}

function _twoRootFixture() {
  const dir = makeStateDir();
  // Root A (collapsed) — 2 done descendants
  writeRecord(dir, mkRecord("rA", null, "in_progress", "root-A"));
  writeRecord(dir, mkRecord("a1", "rA", "done", "a1-done"));
  writeRecord(dir, mkRecord("a2", "rA", "done", "a2-done"));
  // Root B (expanded because we'll target it) — 1 in_progress + 1 pending child
  writeRecord(dir, mkRecord("rB", null, "in_progress", "root-B"));
  writeRecord(dir, mkRecord("b1", "rB", "in_progress", "b1-running"));
  writeRecord(dir, mkRecord("b2", "rB", "pending", "b2-pending"));
  return dir;
}

test("render_expands_current_agent_subtree", () => {
  const dir = _twoRootFixture();
  const tree = buildTree(dir);
  const out = renderTree(tree, { currentAgent: "b1" });
  // Expanded subtree shows its children
  assert.match(out, /root-B/);
  assert.match(out, /b1-running/);
  assert.match(out, /b2-pending/);
  // Collapsed sibling shows `N tasks done`
  assert.match(out, /root-A.*\(2 tasks done\)/);
});

test("render_collapses_non_current_subtrees", () => {
  const dir = _twoRootFixture();
  const tree = buildTree(dir);
  const out = renderTree(tree, { currentAgent: "b1" });
  // Root A is collapsed → its children should NOT appear by label
  assert.ok(!out.includes("a1-done"), `expected a1-done collapsed: ${out}`);
  assert.ok(!out.includes("a2-done"), `expected a2-done collapsed: ${out}`);
});

test("render_markers_map_to_statuses", () => {
  const dir = makeStateDir();
  writeRecord(dir, mkRecord("r", null, "in_progress", "root"));
  writeRecord(dir, mkRecord("d1", "r", "done", "done-child"));
  writeRecord(dir, mkRecord("p1", "r", "pending", "pending-child"));
  writeRecord(dir, mkRecord("s1", "r", "skipped", "skipped-child"));
  writeRecord(dir, mkRecord("f1", "r", "failed", "failed-child"));
  writeRecord(dir, mkRecord("i1", "r", "in_progress", "inprog-child"));
  const tree = buildTree(dir);
  const out = renderTree(tree, { currentAgent: "r" });
  assert.ok(out.includes(`${MARKERS.done} done-child`), out);
  assert.ok(out.includes(`${MARKERS.pending} pending-child`), out);
  assert.ok(out.includes(`${MARKERS.skipped} skipped-child`), out);
  assert.ok(out.includes(`${MARKERS.failed} failed-child`), out);
  assert.ok(out.includes(`${MARKERS.in_progress} inprog-child`), out);
});

test("render_empty_tree_returns_empty_string", () => {
  assert.equal(renderTree({ roots: [], orphans: [] }), "");
  assert.equal(renderTree(null), "");
});

test("render_indentation_two_spaces_per_level", () => {
  const dir = makeStateDir();
  writeRecord(dir, mkRecord("r", null, "in_progress", "root"));
  writeRecord(dir, mkRecord("c", "r", "in_progress", "child"));
  writeRecord(dir, mkRecord("g", "c", "in_progress", "grand"));
  const tree = buildTree(dir);
  const out = renderTree(tree, { currentAgent: "g" });
  const lines = out.split("\n");
  // root at depth 0 has no leading spaces before marker
  assert.match(lines[0], /^\S/);
  // child at depth 1 has 2 leading spaces
  assert.match(lines[1], /^  \S/);
  // grandchild at depth 2 has 4 leading spaces
  assert.match(lines[2], /^    \S/);
});

test("render_picks_most_recent_in_progress_when_no_currentAgent", () => {
  const dir = makeStateDir();
  const old = new Date(Date.now() - 60000).toISOString();
  const newer = new Date().toISOString();
  writeRecord(dir, mkRecord("rA", null, "in_progress", "root-A", old));
  writeRecord(dir, mkRecord("a1", "rA", "in_progress", "a1-old", old));
  writeRecord(dir, mkRecord("rB", null, "in_progress", "root-B", newer));
  writeRecord(dir, mkRecord("b1", "rB", "in_progress", "b1-newer", newer));
  const tree = buildTree(dir);
  const out = renderTree(tree); // no currentAgent given
  // root-B's subtree should be expanded (newer)
  assert.match(out, /b1-newer/);
  // root-A collapsed (old)
  assert.ok(!out.includes("a1-old"), out);
});
