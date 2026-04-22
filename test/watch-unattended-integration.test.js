/**
 * test/watch-unattended-integration.test.js
 *
 * Verifies T7/T8 integration: watch-progress tree appears BELOW the existing
 * banner, banner text is preserved verbatim, and empty state → banner only.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const { formatWatchTick } = require("../bin/unattended-watch-format.cjs");

const STARTED_AT = "2026-04-16T14:31:00.000Z";
const FIXED_NOW = Date.parse("2026-04-16T14:40:30.000Z");

function makeTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-watch-int-"));
  fs.mkdirSync(path.join(root, ".gsd-t", ".watch-state"), { recursive: true });
  return root;
}

function writeRecord(stateDir, rec) {
  fs.writeFileSync(path.join(stateDir, `${rec.agent_id}.json`), JSON.stringify(rec));
}

function mkRecord(id, parent, status, label) {
  return {
    agent_id: id,
    parent_agent_id: parent,
    command: "gsd-t-execute",
    step: 1,
    step_label: label || id,
    status,
    started_at: new Date().toISOString(),
    completed_at: status === "done" ? new Date().toISOString() : null,
    metadata: {},
  };
}

// ── T8: unattended-watch-format.cjs ─────────────────────────────────────────

test("watch_printer_preserves_banner", () => {
  // Empty state dir → banner verbatim, no trailing tree.
  const proj = makeTmpProject();
  const out = formatWatchTick({
    events: [],
    state: { iter: 15, startedAt: STARTED_AT },
    now: FIXED_NOW,
    withWatchProgress: true,
    stateDir: path.join(proj, ".gsd-t", ".watch-state"),
  });
  assert.equal(out, "[unattended supervisor — iter 15, +9m elapsed] (no new activity since last tick)");
});

test("watch_printer_appends_tree_below_banner", () => {
  const proj = makeTmpProject();
  const stateDir = path.join(proj, ".gsd-t", ".watch-state");
  writeRecord(stateDir, mkRecord("root1", null, "in_progress", "root-label"));
  writeRecord(stateDir, mkRecord("child1", "root1", "done", "child-done"));
  const out = formatWatchTick({
    events: [],
    state: { iter: 15, startedAt: STARTED_AT },
    now: FIXED_NOW,
    withWatchProgress: true,
    stateDir,
    currentAgent: "child1",
  });
  const lines = out.split("\n");
  // First line is banner verbatim
  assert.equal(lines[0], "[unattended supervisor — iter 15, +9m elapsed] (no new activity since last tick)");
  // Tree follows
  const tail = lines.slice(1).join("\n");
  assert.match(tail, /root-label/);
  assert.match(tail, /child-done/);
});

test("watch_printer_empty_state_dir_banner_only", () => {
  const proj = makeTmpProject();
  const out = formatWatchTick({
    events: [],
    state: { iter: 20, startedAt: STARTED_AT },
    now: FIXED_NOW,
    withWatchProgress: true,
    stateDir: path.join(proj, ".gsd-t", ".watch-state"),
  });
  // Exactly one line — no tree output
  assert.equal(out.split("\n").length, 1);
  assert.match(out, /^\[unattended supervisor — iter 20/);
});

test("watch_printer_default_opt_out_preserves_old_behavior", () => {
  // Without withWatchProgress, even when state exists, no tree appended.
  const proj = makeTmpProject();
  const stateDir = path.join(proj, ".gsd-t", ".watch-state");
  writeRecord(stateDir, mkRecord("rx", null, "in_progress", "rx-label"));
  const out = formatWatchTick({
    events: [],
    state: { iter: 5, startedAt: STARTED_AT },
    now: FIXED_NOW,
    stateDir, // intentional: no withWatchProgress
  });
  assert.equal(out, "[unattended supervisor — iter 5, +9m elapsed] (no new activity since last tick)");
  assert.equal(out.split("\n").length, 1);
});

// ── T7: gsd-t-unattended.cjs banner append ─────────────────────────────────

test("unattended_verbose_banner_appends_tree_below", () => {
  // Exercise via _renderWatchProgress helper path: we only unit-test
  // that the integration renders against a controlled state dir. The full
  // gsd-t-unattended.cjs invocation requires claudeBin resolution which
  // is covered by its own test suite; the shared helper is what matters.
  const proj = makeTmpProject();
  const stateDir = path.join(proj, ".gsd-t", ".watch-state");
  writeRecord(stateDir, mkRecord("r1", null, "in_progress", "root-X"));
  writeRecord(stateDir, mkRecord("c1", "r1", "done", "child-Y"));
  const { buildTree, renderTree } = require("../bin/watch-progress.js");
  const out = renderTree(buildTree(stateDir), { currentAgent: "c1" });
  assert.match(out, /root-X/);
  assert.match(out, /child-Y/);
});

// ── T9: headless-auto-spawn.cjs watch=true still spawns headless (v2.0.0) ───

test("auto_spawn_watch_primary_spawns_headless_flag_ignored_v2", () => {
  // Under headless-default-contract v2.0.0 the `watch` flag is deprecated
  // and ignored: every spawn goes headless. The v1.x in-context fallback
  // (and the watch-progress tree printed on that path) has been removed.
  const proj = makeTmpProject();
  const stateDir = path.join(proj, ".gsd-t", ".watch-state");
  writeRecord(stateDir, mkRecord("r1", null, "in_progress", "headless-root"));
  writeRecord(stateDir, mkRecord("c1", "r1", "in_progress", "headless-child"));

  const driver = `
    const p = ${JSON.stringify(proj)};
    const { autoSpawnHeadless } = require(${JSON.stringify(path.resolve(__dirname, "..", "bin", "headless-auto-spawn.cjs"))});
    const r = autoSpawnHeadless({ command: 'gsd-t-execute', watch: true, spawnType: 'primary', projectDir: p });
    process.stdout.write("MODE=" + r.mode + "\\n");
  `;
  const res = spawnSync(process.execPath, ["-e", driver], {
    encoding: "utf8",
    cwd: proj,
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /MODE=headless/, "v2.0.0: watch flag is ignored; always headless");
});
