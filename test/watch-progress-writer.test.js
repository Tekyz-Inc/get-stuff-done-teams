/**
 * test/watch-progress-writer.test.js
 *
 * Tests for `scripts/gsd-t-watch-state.js` — state-writer CLI.
 * Contract: `.gsd-t/contracts/watch-progress-contract.md` §4.
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const WRITER = path.resolve(__dirname, "..", "scripts", "gsd-t-watch-state.js");

function makeTmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-watch-"));
  return root;
}

function runWriter(cwd, args, env) {
  return spawnSync(process.execPath, [WRITER, ...args], {
    cwd,
    encoding: "utf8",
    env: Object.assign({}, process.env, env || {}),
  });
}

function readState(cwd, agentId) {
  const fp = path.join(cwd, ".gsd-t", ".watch-state", `${agentId}.json`);
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

test("writer_round_trip_all_subcommands", () => {
  const cwd = makeTmpProject();
  // start
  let r = runWriter(cwd, [
    "start",
    "--agent-id", "a1",
    "--parent-id", "null",
    "--command", "gsd-t-execute",
    "--step", "1",
    "--step-label", "spawn worker",
  ]);
  assert.equal(r.status, 0, r.stderr);
  let rec = readState(cwd, "a1");
  assert.equal(rec.status, "in_progress");
  assert.equal(rec.step, 1);
  assert.equal(rec.step_label, "spawn worker");
  assert.ok(rec.started_at);
  assert.equal(rec.completed_at, null);

  // advance
  r = runWriter(cwd, [
    "advance",
    "--agent-id", "a1",
    "--command", "gsd-t-execute",
    "--step", "2",
    "--step-label", "run tests",
  ]);
  assert.equal(r.status, 0, r.stderr);
  rec = readState(cwd, "a1");
  assert.equal(rec.step, 2);
  assert.equal(rec.step_label, "run tests");
  assert.equal(rec.status, "in_progress");

  // done
  r = runWriter(cwd, ["done", "--agent-id", "a1"]);
  assert.equal(r.status, 0, r.stderr);
  rec = readState(cwd, "a1");
  assert.equal(rec.status, "done");
  assert.ok(rec.completed_at);

  // skip
  r = runWriter(cwd, [
    "start",
    "--agent-id", "a2",
    "--command", "gsd-t-execute",
    "--step", "1",
    "--step-label", "maybe",
  ]);
  assert.equal(r.status, 0, r.stderr);
  r = runWriter(cwd, ["skip", "--agent-id", "a2"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readState(cwd, "a2").status, "skipped");

  // fail
  r = runWriter(cwd, [
    "start",
    "--agent-id", "a3",
    "--command", "gsd-t-execute",
    "--step", "1",
    "--step-label", "do a thing",
  ]);
  assert.equal(r.status, 0, r.stderr);
  r = runWriter(cwd, ["fail", "--agent-id", "a3"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readState(cwd, "a3").status, "failed");
});

test("writer_missing_required_args_exit_1", () => {
  const cwd = makeTmpProject();
  // missing agent-id is auto-resolved (shim-safe); start with no other args
  // still fails on --command
  let r = runWriter(cwd, ["start"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--command/);

  // unknown subcommand
  r = runWriter(cwd, ["doit", "--agent-id", "a1"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown subcommand/);

  // start missing command
  r = runWriter(cwd, [
    "start",
    "--agent-id", "a1",
    "--step", "1",
    "--step-label", "x",
  ]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--command/);

  // start missing step
  r = runWriter(cwd, [
    "start",
    "--agent-id", "a1",
    "--command", "gsd-t-execute",
    "--step-label", "x",
  ]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--step/);

  // start missing step-label
  r = runWriter(cwd, [
    "start",
    "--agent-id", "a1",
    "--command", "gsd-t-execute",
    "--step", "1",
  ]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /step-label/);
});

test("writer_concurrent_writes_different_agents_no_corrupt", async () => {
  const cwd = makeTmpProject();
  const ids = ["c1", "c2", "c3", "c4", "c5"];
  const procs = ids.map((id) => {
    return new Promise((resolve) => {
      const cp = require("child_process").spawn(process.execPath, [
        WRITER,
        "start",
        "--agent-id", id,
        "--command", "gsd-t-plan",
        "--step", "1",
        "--step-label", `concurrent-${id}`,
      ], { cwd, stdio: "ignore" });
      cp.on("exit", (code) => resolve(code));
    });
  });
  const codes = await Promise.all(procs);
  for (const c of codes) assert.equal(c, 0);
  for (const id of ids) {
    const rec = readState(cwd, id);
    assert.equal(rec.agent_id, id);
    assert.equal(rec.status, "in_progress");
    assert.equal(rec.step_label, `concurrent-${id}`);
  }
});

test("writer_creates_state_dir_if_missing", () => {
  const cwd = makeTmpProject();
  const stateDir = path.join(cwd, ".gsd-t", ".watch-state");
  assert.equal(fs.existsSync(stateDir), false);
  const r = runWriter(cwd, [
    "start",
    "--agent-id", "d1",
    "--command", "gsd-t-execute",
    "--step", "1",
    "--step-label", "bootstrap",
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(stateDir), true);
  assert.equal(fs.existsSync(path.join(stateDir, "d1.json")), true);
});

test("writer_transition_preserves_started_at", () => {
  const cwd = makeTmpProject();
  let r = runWriter(cwd, [
    "start",
    "--agent-id", "e1",
    "--command", "gsd-t-partition",
    "--step", "1",
    "--step-label", "start step",
  ]);
  assert.equal(r.status, 0, r.stderr);
  const startedAt1 = readState(cwd, "e1").started_at;
  // small sleep to ensure different timestamp if regenerated
  const sleep = Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  void sleep;
  r = runWriter(cwd, [
    "advance",
    "--agent-id", "e1",
    "--command", "gsd-t-partition",
    "--step", "2",
    "--step-label", "advanced",
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readState(cwd, "e1").started_at, startedAt1);
  assert.equal(readState(cwd, "e1").completed_at, null);

  r = runWriter(cwd, ["done", "--agent-id", "e1"]);
  assert.equal(r.status, 0, r.stderr);
  const rec = readState(cwd, "e1");
  assert.equal(rec.started_at, startedAt1);
  assert.ok(rec.completed_at);
});

test("writer_shim_safe_empty_agent_id_auto_mints_id", () => {
  // Simulates shim expansion `--agent-id "$GSD_T_AGENT_ID"` when the var is
  // unset — argv receives empty string. Writer must auto-mint an id so the
  // shim still produces a state file instead of silently exiting 1.
  const cwd = makeTmpProject();
  const r = runWriter(cwd, [
    "advance",
    "--agent-id", "",
    "--parent-id", "null",
    "--command", "gsd-t-execute",
    "--step", "1",
    "--step-label", "shim fires with no env",
  ]);
  assert.equal(r.status, 0, r.stderr);
  const files = fs.readdirSync(path.join(cwd, ".gsd-t", ".watch-state"));
  assert.equal(files.length, 1);
  // Auto-minted id starts with `shell-` when no GSD_T_AGENT_ID in env
  assert.match(files[0], /^shell-\d+-\d+\.json$/);
});

test("writer_env_agent_id_used_when_arg_empty", () => {
  // When the shim passes an empty --agent-id but GSD_T_AGENT_ID is set
  // (e.g., unattended worker or headless spawn), writer should use the env
  // value so shims inside a known agent attach correctly.
  const cwd = makeTmpProject();
  const r = runWriter(
    cwd,
    [
      "advance",
      "--agent-id", "",
      "--command", "gsd-t-execute",
      "--step", "2",
      "--step-label", "env provides id",
    ],
    { GSD_T_AGENT_ID: "from-env-42" }
  );
  assert.equal(r.status, 0, r.stderr);
  const rec = readState(cwd, "from-env-42");
  assert.equal(rec.agent_id, "from-env-42");
});
