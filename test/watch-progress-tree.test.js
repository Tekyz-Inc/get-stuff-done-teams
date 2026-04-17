/**
 * test/watch-progress-tree.test.js
 *
 * Tests for `buildTree` in bin/watch-progress.js.
 * Covers T3 (reconstruction, orphans, empty) + T5 (stale expiry).
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { buildTree, STALE_MS } = require("../bin/watch-progress.js");

function makeStateDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tree-"));
  const dir = path.join(root, ".watch-state");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeRecord(dir, rec) {
  fs.writeFileSync(path.join(dir, `${rec.agent_id}.json`), JSON.stringify(rec));
}

function mkRecord(id, parent, status, overrides) {
  return Object.assign({
    agent_id: id,
    parent_agent_id: parent,
    command: "gsd-t-execute",
    step: 1,
    step_label: `label-${id}`,
    status: status || "in_progress",
    started_at: new Date().toISOString(),
    completed_at: null,
    metadata: {},
  }, overrides || {});
}

test("tree_three_level_reconstructs_correctly", () => {
  const dir = makeStateDir();
  writeRecord(dir, mkRecord("root", null, "in_progress"));
  writeRecord(dir, mkRecord("c1", "root", "done"));
  writeRecord(dir, mkRecord("c2", "root", "in_progress"));
  writeRecord(dir, mkRecord("g1", "c1", "done"));
  writeRecord(dir, mkRecord("g2", "c1", "done"));
  writeRecord(dir, mkRecord("g3", "c2", "in_progress"));
  writeRecord(dir, mkRecord("g4", "c2", "pending"));

  const tree = buildTree(dir);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.orphans.length, 0);
  const root = tree.roots[0];
  assert.equal(root.record.agent_id, "root");
  assert.equal(root.children.length, 2);
  const [c1, c2] = root.children.sort((a, b) => a.record.agent_id.localeCompare(b.record.agent_id));
  assert.equal(c1.record.agent_id, "c1");
  assert.equal(c1.children.length, 2);
  assert.equal(c2.record.agent_id, "c2");
  assert.equal(c2.children.length, 2);
});

test("tree_orphans_grouped_under_unknown", () => {
  const dir = makeStateDir();
  // parent missing
  writeRecord(dir, mkRecord("child-orphan", "ghost-parent", "in_progress"));
  writeRecord(dir, mkRecord("real-root", null, "in_progress"));
  const tree = buildTree(dir);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0].record.agent_id, "real-root");
  assert.equal(tree.orphans.length, 1);
  assert.equal(tree.orphans[0].record.agent_id, "child-orphan");
});

test("tree_empty_dir_returns_empty_tree", () => {
  const dir = makeStateDir();
  const tree = buildTree(dir);
  assert.deepEqual(tree, { roots: [], orphans: [] });
});

test("tree_missing_dir_returns_empty_tree", () => {
  const fakeDir = path.join(os.tmpdir(), "does-not-exist-" + Date.now());
  const tree = buildTree(fakeDir);
  assert.deepEqual(tree, { roots: [], orphans: [] });
});

test("tree_skips_expired_state_files", () => {
  const dir = makeStateDir();
  const now = Date.now();
  const oldTs = new Date(now - (25 * 60 * 60 * 1000)).toISOString();
  writeRecord(dir, mkRecord("root", null, "in_progress"));
  writeRecord(dir, mkRecord("stale", "root", "done", {
    started_at: oldTs,
    completed_at: oldTs,
  }));
  const tree = buildTree(dir, { now });
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0].children.length, 0);
});

test("tree_keeps_in_progress_regardless_of_age", () => {
  const dir = makeStateDir();
  const now = Date.now();
  const oldTs = new Date(now - (48 * 60 * 60 * 1000)).toISOString();
  writeRecord(dir, mkRecord("root", null, "in_progress"));
  writeRecord(dir, mkRecord("old-in-progress", "root", "in_progress", {
    started_at: oldTs,
    completed_at: null,
  }));
  const tree = buildTree(dir, { now });
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0].children.length, 1);
  assert.equal(tree.roots[0].children[0].record.agent_id, "old-in-progress");
});

test("tree_malformed_json_is_skipped", () => {
  const dir = makeStateDir();
  fs.writeFileSync(path.join(dir, "bogus.json"), "{not json");
  writeRecord(dir, mkRecord("good", null, "in_progress"));
  const tree = buildTree(dir);
  assert.equal(tree.roots.length, 1);
  assert.equal(tree.roots[0].record.agent_id, "good");
});

test("tree_stale_constant_is_24h", () => {
  assert.equal(STALE_MS, 24 * 60 * 60 * 1000);
});
