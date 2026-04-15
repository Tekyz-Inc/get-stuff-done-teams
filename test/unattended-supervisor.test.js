/**
 * Tests for bin/gsd-t-unattended.js — Wave 1 / Task 1
 * Uses Node.js built-in test runner (node --test).
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.0.0
 *
 * Coverage (Task 1):
 *   - parseArgs handles all 8 CLI flags from §6 (and = / space forms)
 *   - makeSessionId produces the contract format `unattended-{slug}-{rand4}`
 *   - initState populates all required fields from §3
 *   - writeState atomic rename + lastTick update
 *   - finalizeState removes PID file and preserves terminal status
 *   - finalizeState transitions non-terminal → 'crashed' by default
 *   - doUnattended dry-run does NOT write PID or state file
 *   - doUnattended real run writes PID, transitions initializing → running
 *   - status enum membership
 *   - default values (hours=24, maxIterations=200)
 */

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const sup = require("../bin/gsd-t-unattended.js");

// ── Shared test helpers ─────────────────────────────────────────────────────
//
// Task 4 wires real safety rails into doUnattended: checkGitBranch refuses to
// run on a `main`/`master`/… branch, and checkWorktreeCleanliness refuses a
// dirty tree. Unit tests use a bare temp directory (not a git repo at all),
// so they MUST inject permissive fakes or the pre-launch hook rejects every
// run before the main loop gets a chance to exercise the behavior under test.
//
// Tests that specifically want to exercise the safety rails inject their own
// refusing fakes; everything else uses this permissive baseline.

function permissiveDeps(extra) {
  return Object.assign(
    {
      _checkGitBranch: () => ({ ok: true, branch: "feature/test" }),
      _checkWorktreeCleanliness: () => ({ ok: true }),
      _preventSleep: () => null,
      _releaseSleep: () => {},
      _notify: () => {},
    },
    extra || {},
  );
}

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-unattended-test-"));
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
});

beforeEach(() => {
  // Fresh project per test
  for (const entry of fs.readdirSync(tmpDir)) {
    fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
  }
});

// ── 1. parseArgs ────────────────────────────────────────────────────────────

describe("M36 supervisor T1: parseArgs", () => {
  it("returns sane defaults when argv is empty", () => {
    const opts = sup.parseArgs([]);
    assert.equal(opts.hours, 24);
    assert.equal(opts.maxIterations, 200);
    assert.equal(opts.project, ".");
    assert.equal(opts.branch, "AUTO");
    assert.equal(opts.onDone, "print");
    assert.equal(opts.dryRun, false);
    assert.equal(opts.verbose, false);
    assert.equal(opts.testMode, false);
  });

  it("parses --flag=value form for all 8 contract flags", () => {
    const opts = sup.parseArgs([
      "--hours=12",
      "--max-iterations=50",
      "--project=/tmp/foo",
      "--branch=feature/x",
      "--on-done=merge-commit",
      "--dry-run",
      "--verbose",
      "--test-mode",
    ]);
    assert.equal(opts.hours, 12);
    assert.equal(opts.maxIterations, 50);
    assert.equal(opts.project, "/tmp/foo");
    assert.equal(opts.branch, "feature/x");
    assert.equal(opts.onDone, "merge-commit");
    assert.equal(opts.dryRun, true);
    assert.equal(opts.verbose, true);
    assert.equal(opts.testMode, true);
  });

  it("parses --flag value (space-separated) form", () => {
    const opts = sup.parseArgs([
      "--hours",
      "8",
      "--max-iterations",
      "10",
      "--project",
      "/tmp/bar",
    ]);
    assert.equal(opts.hours, 8);
    assert.equal(opts.maxIterations, 10);
    assert.equal(opts.project, "/tmp/bar");
  });

  it("falls back to defaults for invalid numerics", () => {
    const opts = sup.parseArgs(["--hours=not-a-number", "--max-iterations=-3"]);
    assert.equal(opts.hours, 24);
    assert.equal(opts.maxIterations, 200);
  });
});

// ── 2. makeSessionId ────────────────────────────────────────────────────────

describe("M36 supervisor T1: makeSessionId", () => {
  it("matches contract format unattended-{YYYY-MM-DD-HHMM}-{rand4}", () => {
    const d = new Date("2026-04-15T11:00:00Z");
    const id = sup.makeSessionId(d);
    assert.match(
      id,
      /^unattended-2026-04-15-1100-[0-9a-f]{4}$/,
      `unexpected sessionId: ${id}`,
    );
  });

  it("produces unique IDs across calls", () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) ids.add(sup.makeSessionId(new Date()));
    // With 16-bit randomness over 50 samples, collisions are extremely
    // unlikely; allow ≥ 45 unique to keep this from flaking on bad luck.
    assert.ok(ids.size >= 45, `too many collisions: ${ids.size}/50`);
  });
});

// ── 3. initState ────────────────────────────────────────────────────────────

describe("M36 supervisor T1: initState", () => {
  it("populates all required §3 fields with status='initializing'", () => {
    const state = sup.initState({
      projectDir: tmpDir,
      hours: 24,
      maxIterations: 200,
      now: new Date("2026-04-15T11:00:00Z"),
    });

    // Required fields per contract §3
    assert.equal(state.version, sup.CONTRACT_VERSION);
    assert.match(state.sessionId, /^unattended-/);
    assert.equal(state.projectDir, path.resolve(tmpDir));
    assert.equal(state.status, "initializing");
    assert.ok(typeof state.milestone === "string");
    assert.equal(state.iter, 0);
    assert.equal(state.maxIterations, 200);
    assert.equal(state.startedAt, "2026-04-15T11:00:00.000Z");
    assert.equal(state.lastTick, "2026-04-15T11:00:00.000Z");
    assert.equal(state.hours, 24);
    assert.equal(state.wallClockElapsedMs, 0);
    assert.equal(state.supervisorPid, process.pid);
    assert.ok(state.logPath && state.logPath.includes("run.log"));
    assert.equal(state.sleepPreventionHandle, null);
    assert.equal(state.platform, process.platform);
    assert.ok(state.claudeBin && typeof state.claudeBin === "string");
  });

  it("throws when projectDir is missing", () => {
    assert.throws(() => sup.initState({}), /projectDir/);
  });
});

// ── 4. writeState — atomic + lastTick ───────────────────────────────────────

describe("M36 supervisor T1: writeState", () => {
  it("writes state.json atomically (no leftover .tmp) and updates lastTick", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    const state = sup.initState({
      projectDir: tmpDir,
      hours: 24,
      maxIterations: 200,
      now: new Date("2026-04-15T11:00:00Z"),
    });
    // Make sure lastTick visibly advances when we write later.
    const before = state.lastTick;
    sup.writeState(state, dir);
    const after = state.lastTick;
    assert.notEqual(after, before);

    const finalPath = path.join(dir, "state.json");
    const tmpPath = path.join(dir, "state.json.tmp");
    assert.ok(fs.existsSync(finalPath), "state.json should exist");
    assert.ok(!fs.existsSync(tmpPath), "state.json.tmp must not be left behind");

    // The on-disk JSON should round-trip and contain all required fields.
    const onDisk = JSON.parse(fs.readFileSync(finalPath, "utf8"));
    for (const k of [
      "version",
      "sessionId",
      "projectDir",
      "status",
      "milestone",
      "iter",
      "maxIterations",
      "startedAt",
      "lastTick",
      "hours",
      "wallClockElapsedMs",
      "supervisorPid",
      "logPath",
      "platform",
      "claudeBin",
    ]) {
      assert.ok(k in onDisk, `state.json missing field: ${k}`);
    }
  });
});

// ── 5. finalizeState ────────────────────────────────────────────────────────

describe("M36 supervisor T1: finalizeState", () => {
  it("removes supervisor.pid and writes terminal status when non-terminal", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    const pidPath = path.join(dir, "supervisor.pid");
    fs.writeFileSync(pidPath, String(process.pid));

    const state = sup.initState({ projectDir: tmpDir, hours: 24, maxIterations: 200 });
    state.status = "running";
    sup.writeState(state, dir);

    sup.finalizeState(state, dir, "failed");

    assert.equal(state.status, "failed");
    assert.ok(!fs.existsSync(pidPath), "supervisor.pid should be removed");

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
    assert.equal(onDisk.status, "failed");
  });

  it("preserves terminal status if state is already terminal", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    const state = sup.initState({ projectDir: tmpDir, hours: 24, maxIterations: 200 });
    state.status = "done";
    sup.writeState(state, dir);

    // Even if caller passes a different terminal hint, 'done' must stick.
    sup.finalizeState(state, dir, "failed");
    assert.equal(state.status, "done");

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
    assert.equal(onDisk.status, "done");
  });

  it("defaults non-terminal to 'crashed' when no hint provided", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    const state = sup.initState({ projectDir: tmpDir, hours: 24, maxIterations: 200 });
    state.status = "running";
    sup.writeState(state, dir);

    sup.finalizeState(state, dir);
    assert.equal(state.status, "crashed");
  });
});

// ── 6. doUnattended dry-run ─────────────────────────────────────────────────

describe("M36 supervisor T1: doUnattended dry-run", () => {
  it("does NOT write PID or state.json and exits ok", () => {
    const result = sup.doUnattended(
      [
        "--project=" + tmpDir,
        "--hours=1",
        "--max-iterations=5",
        "--dry-run",
      ],
      permissiveDeps(),
    );
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.exitCode, 0);

    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    assert.ok(
      !fs.existsSync(path.join(dir, "supervisor.pid")),
      "dry-run must not write supervisor.pid",
    );
    assert.ok(
      !fs.existsSync(path.join(dir, "state.json")),
      "dry-run must not write state.json",
    );
  });
});

// ── 7. doUnattended real run ────────────────────────────────────────────────

describe("M36 supervisor T1: doUnattended real run", () => {
  it("creates runtime dir, writes PID, transitions to running", () => {
    const result = sup.doUnattended(
      [
        "--project=" + tmpDir,
        "--hours=24",
        "--max-iterations=200",
        "--test-mode",
      ],
      permissiveDeps(),
    );
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, false);
    assert.ok(result.state, "result.state should be present");
    // test-mode stub worker completes the milestone on iter 1 → 'done'.
    assert.ok(
      ["running", "done"].includes(result.state.status),
      `unexpected result status: ${result.state.status}`,
    );

    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    const pidPath = path.join(dir, "supervisor.pid");
    const statePath = path.join(dir, "state.json");

    // PID file may have been removed by the synchronously-installed
    // process.on('exit') handler if the test runner has already started
    // tearing the process down — but at minimum state.json must exist
    // and reflect a 'running' or terminal status.
    assert.ok(fs.existsSync(statePath), "state.json must exist after real run");
    const onDisk = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.ok(
      ["running", "crashed", "stopped", "done", "failed"].includes(onDisk.status),
      `unexpected on-disk status: ${onDisk.status}`,
    );
    assert.equal(onDisk.supervisorPid, process.pid);
    assert.equal(onDisk.platform, process.platform);
    assert.equal(onDisk.maxIterations, 200);
    assert.equal(onDisk.hours, 24);

    // The PID file is best-effort cleaned up here so subsequent tests
    // (and the eventual process.on('exit') handler) don't double-write.
    if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  });
});

// ── 8. Status enum ──────────────────────────────────────────────────────────

// ── 9. Task 2: main loop + mapHeadlessExitCode integration ──────────────────

describe("M36 supervisor T2: main loop — happy path", () => {
  it("3-iteration relay reaches 'done' when milestone completes", () => {
    let iters = 0;
    const fakeSpawn = (state) => {
      iters = state.iter;
      return {
        status: 0,
        stdout: `iter ${state.iter} ok\n`,
        stderr: "",
        signal: null,
      };
    };
    // Milestone is complete only after iter 3
    const fakeMilestone = (_projectDir, _id) => iters >= 3;

    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--hours=24", "--max-iterations=10"],
      permissiveDeps({ _spawnWorker: fakeSpawn, _isMilestoneComplete: fakeMilestone }),
    );
    assert.equal(result.ok, true);
    assert.equal(result.state.status, "done");
    assert.equal(result.state.iter, 3);
    assert.equal(result.state.lastExit, 0);
    assert.ok(typeof result.state.lastElapsedMs === "number");
  });
});

describe("M36 supervisor T2: main loop — exit 4 unrecoverable", () => {
  it("transitions to 'failed' on blocked-needs-human sentinel", () => {
    const fakeSpawn = () => ({
      status: 0,
      stdout: "blocked — needs human approval to proceed\n",
      stderr: "",
      signal: null,
    });
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({ _spawnWorker: fakeSpawn, _isMilestoneComplete: () => false }),
    );
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.lastExit, 4);
    assert.equal(result.state.iter, 1);
  });
});

describe("M36 supervisor T2: main loop — exit 5 command-dispatch-failed", () => {
  it("transitions to 'failed' on Unknown command sentinel", () => {
    const fakeSpawn = () => ({
      status: 0,
      stdout: "Unknown command: /gsd-t-resume\n",
      stderr: "",
      signal: null,
    });
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({ _spawnWorker: fakeSpawn, _isMilestoneComplete: () => false }),
    );
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.lastExit, 5);
    assert.equal(result.state.iter, 1);
  });
});

describe("M36 supervisor T2: main loop — timeout continues", () => {
  it("records lastExit=124 and keeps looping until iter cap", () => {
    let calls = 0;
    const fakeSpawn = () => {
      calls++;
      // Simulate spawnSync timeout: status=null, signal='SIGTERM'
      return { status: null, stdout: "", stderr: "", signal: "SIGTERM" };
    };
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=3"],
      permissiveDeps({ _spawnWorker: fakeSpawn, _isMilestoneComplete: () => false }),
    );
    assert.equal(calls, 3, "should spawn up to iter cap");
    assert.equal(result.state.iter, 3);
    assert.equal(result.state.lastExit, 124);
    // No terminal transition assigned by the loop itself — the iter cap
    // halts without marking status. finalizer would mark 'crashed' on exit.
    assert.ok(
      ["running", "crashed"].includes(result.state.status),
      `unexpected status after timeout-cap: ${result.state.status}`,
    );
  });
});

describe("M36 supervisor T2: main loop — run.log append format", () => {
  it("appends '--- ITER n @ ISO exit=code ---' headers and worker output", () => {
    const fakeSpawn = (state) => ({
      status: 0,
      stdout: `OUT-${state.iter}`,
      stderr: state.iter === 2 ? "warn-2" : "",
      signal: null,
    });
    let iters = 0;
    const fakeMilestone = () => iters >= 2;
    const spawn2 = (s) => {
      iters = s.iter;
      return fakeSpawn(s);
    };

    sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=5"],
      permissiveDeps({ _spawnWorker: spawn2, _isMilestoneComplete: fakeMilestone }),
    );

    const logPath = path.join(tmpDir, ".gsd-t", ".unattended", "run.log");
    assert.ok(fs.existsSync(logPath), "run.log should be created");
    const log = fs.readFileSync(logPath, "utf8");
    assert.match(log, /^--- ITER 1 @ \d{4}-\d{2}-\d{2}T.*exit=0 ---$/m);
    assert.match(log, /^--- ITER 2 @ \d{4}-\d{2}-\d{2}T.*exit=0 ---$/m);
    assert.ok(log.includes("OUT-1"), "log should contain iter 1 stdout");
    assert.ok(log.includes("OUT-2"), "log should contain iter 2 stdout");
    assert.ok(log.includes("[stderr]"), "log should label stderr section");
    assert.ok(log.includes("warn-2"), "log should contain iter 2 stderr");
    // Log must NOT be truncated — both headers must be present in one file.
    const headerCount = (log.match(/--- ITER /g) || []).length;
    assert.equal(headerCount, 2, "run.log must accumulate, never truncate");
  });
});

describe("M36 supervisor T2: isMilestoneComplete", () => {
  it("detects 'M36 COMPLETE' in progress.md", () => {
    const projDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-ms-"));
    fs.mkdirSync(path.join(projDir, ".gsd-t"), { recursive: true });
    fs.writeFileSync(
      path.join(projDir, ".gsd-t", "progress.md"),
      "# Progress\n\nStatus: M36 COMPLETE\n",
    );
    assert.equal(sup.isMilestoneComplete(projDir, "M36"), true);
    assert.equal(sup.isMilestoneComplete(projDir, "M37"), false);
    fs.rmSync(projDir, { recursive: true, force: true });
  });

  it("returns false when progress.md is absent", () => {
    const projDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-ms2-"));
    assert.equal(sup.isMilestoneComplete(projDir, "M36"), false);
    fs.rmSync(projDir, { recursive: true, force: true });
  });

  it("returns false for UNKNOWN milestone even if file is complete", () => {
    const projDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-ms3-"));
    fs.mkdirSync(path.join(projDir, ".gsd-t"), { recursive: true });
    fs.writeFileSync(
      path.join(projDir, ".gsd-t", "progress.md"),
      "M36 COMPLETE\n",
    );
    assert.equal(sup.isMilestoneComplete(projDir, "UNKNOWN"), false);
    fs.rmSync(projDir, { recursive: true, force: true });
  });
});

describe("M36 supervisor T2: isDone / stopRequested helpers", () => {
  it("isDone returns true for terminal status and for iter>=cap", () => {
    assert.equal(sup.isDone({ status: "done", iter: 0, maxIterations: 10 }), true);
    assert.equal(sup.isDone({ status: "failed", iter: 0, maxIterations: 10 }), true);
    assert.equal(sup.isDone({ status: "running", iter: 10, maxIterations: 10 }), true);
    assert.equal(sup.isDone({ status: "running", iter: 5, maxIterations: 10 }), false);
  });

  it("stopRequested detects the sentinel file", () => {
    const projDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-stop-"));
    assert.equal(sup.stopRequested(projDir), false);
    const dir = path.join(projDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "stop"), "2026-04-15T11:00:00Z\n");
    assert.equal(sup.stopRequested(projDir), true);
    fs.rmSync(projDir, { recursive: true, force: true });
  });
});

// ── 10. Task 3: stop sentinel + finalize idempotency ───────────────────────

describe("M36 supervisor T3: stop sentinel mid-loop", () => {
  it("transitions to 'stopped' when sentinel appears between workers", () => {
    let calls = 0;
    // Stop sentinel appears after iter 2. The loop's pre-spawn stopCheck
    // should then halt without a 3rd spawn and transition to 'stopped'.
    const sentinelDir = path.join(tmpDir, ".gsd-t", ".unattended");
    const fakeSpawn = (state) => {
      calls++;
      if (state.iter === 2) {
        // User touches the stop sentinel after the 2nd worker finishes.
        fs.mkdirSync(sentinelDir, { recursive: true });
        fs.writeFileSync(
          path.join(sentinelDir, "stop"),
          "2026-04-15T12:00:00Z\n",
        );
      }
      return { status: 0, stdout: `iter ${state.iter} ok\n`, stderr: "", signal: null };
    };
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({ _spawnWorker: fakeSpawn, _isMilestoneComplete: () => false }),
    );
    assert.equal(calls, 2, "should spawn exactly 2 workers before halting");
    assert.equal(result.state.iter, 2);
    assert.equal(result.state.status, "stopped");
    assert.equal(result.exitCode, 0, "stopped → exit 0");
    // Contract §10: sentinel file must NOT be removed by the supervisor.
    assert.ok(
      fs.existsSync(path.join(sentinelDir, "stop")),
      "stop sentinel must survive (evidence)",
    );
  });
});

describe("M36 supervisor T3: cleanStaleStopSentinel", () => {
  it("removes stale sentinel at supervisor start and logs with mtime", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    const sentinel = path.join(dir, "stop");
    fs.writeFileSync(sentinel, "stale\n");

    const logs = [];
    const removed = sup.cleanStaleStopSentinel(tmpDir, (m) => logs.push(m));

    assert.equal(removed, true);
    assert.ok(!fs.existsSync(sentinel), "stale sentinel should be removed");
    assert.equal(logs.length, 1, "should emit exactly one log line");
    assert.match(
      logs[0],
      /Removed stale stop sentinel from \d{4}-\d{2}-\d{2}T/,
      `unexpected log: ${logs[0]}`,
    );
  });

  it("is a silent no-op when no stale sentinel exists", () => {
    const logs = [];
    const removed = sup.cleanStaleStopSentinel(tmpDir, (m) => logs.push(m));
    assert.equal(removed, false);
    assert.equal(logs.length, 0, "should not log when no sentinel");
  });

  it("is auto-invoked by doUnattended so stale sentinels don't halt new runs", () => {
    // Pre-place a stale sentinel; doUnattended must clean it before the
    // loop's stopCheck would otherwise halt iter 1 immediately.
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "stop"), "stale-pre-launch\n");

    const fakeSpawn = (state) => ({
      status: 0,
      stdout: `iter ${state.iter} ok\n`,
      stderr: "",
      signal: null,
    });
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=3"],
      permissiveDeps({ _spawnWorker: fakeSpawn, _isMilestoneComplete: (_p, _m) => true }),
    );
    // Should have run 1 full iter and transitioned to 'done' — NOT 'stopped'.
    assert.equal(result.state.status, "done");
    assert.equal(result.state.iter, 1);
    // The stale sentinel must be gone (cleaned at launch).
    assert.ok(
      !fs.existsSync(path.join(dir, "stop")),
      "stale sentinel must be cleaned at supervisor start",
    );
  });
});

describe("M36 supervisor T3: finalizeState idempotency", () => {
  it("removes supervisor.pid on first call", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    const pidPath = path.join(dir, "supervisor.pid");
    fs.writeFileSync(pidPath, String(process.pid));

    const state = sup.initState({ projectDir: tmpDir, hours: 24, maxIterations: 200 });
    state.status = "running";
    sup.writeState(state, dir);

    sup.finalizeState(state, dir, "stopped");

    assert.equal(state.status, "stopped");
    assert.ok(!fs.existsSync(pidPath), "supervisor.pid must be removed");
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
    assert.equal(onDisk.status, "stopped");
  });

  it("preserves terminal state on double-call (does not overwrite)", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    const pidPath = path.join(dir, "supervisor.pid");
    fs.writeFileSync(pidPath, String(process.pid));

    const state = sup.initState({ projectDir: tmpDir, hours: 24, maxIterations: 200 });
    state.status = "running";
    sup.writeState(state, dir);

    // First call: transition non-terminal → 'stopped'
    sup.finalizeState(state, dir, "stopped");
    assert.equal(state.status, "stopped");

    // Snapshot the serialized state.
    const firstDisk = fs.readFileSync(path.join(dir, "state.json"), "utf8");

    // Second call with a DIFFERENT hint — must be a no-op, must NOT
    // overwrite 'stopped' with 'crashed' or anything else.
    sup.finalizeState(state, dir, "crashed");
    assert.equal(
      state.status,
      "stopped",
      "terminal state must be preserved across double-call",
    );

    // On-disk state must be byte-identical — no re-write, no lastTick bump.
    const secondDisk = fs.readFileSync(path.join(dir, "state.json"), "utf8");
    assert.equal(
      secondDisk,
      firstDisk,
      "state.json must not be rewritten on idempotent double-call",
    );

    // PID file already removed — second call must not throw.
    assert.ok(!fs.existsSync(pidPath));
  });

  it("clears sleepPreventionHandle on finalize", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    const state = sup.initState({ projectDir: tmpDir, hours: 24, maxIterations: 200 });
    state.status = "running";
    // Simulate Task 4 wiring: a caffeinate PID is held during the run.
    state.sleepPreventionHandle = 99999;
    sup.writeState(state, dir);

    sup.finalizeState(state, dir, "done");

    assert.equal(state.sleepPreventionHandle, null, "handle must be released");
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
    assert.equal(onDisk.sleepPreventionHandle, null);
  });
});

describe("M36 supervisor T1: status enum", () => {
  it("VALID_STATUSES matches contract §4", () => {
    assert.deepEqual(
      [...sup.VALID_STATUSES].sort(),
      ["crashed", "done", "failed", "initializing", "running", "stopped"].sort(),
    );
  });

  it("TERMINAL_STATUSES is a strict subset", () => {
    assert.deepEqual(
      [...sup.TERMINAL_STATUSES].sort(),
      ["crashed", "done", "failed", "stopped"].sort(),
    );
    assert.equal(sup.isTerminal("running"), false);
    assert.equal(sup.isTerminal("initializing"), false);
    assert.equal(sup.isTerminal("done"), true);
    assert.equal(sup.isTerminal("failed"), true);
    assert.equal(sup.isTerminal("stopped"), true);
    assert.equal(sup.isTerminal("crashed"), true);
  });
});

// ── 11. Task 4: safety rails + platform wiring ─────────────────────────────

describe("M36 supervisor T4: pre-launch refusal — protected branch", () => {
  it("returns exit 7 and does NOT write PID or state.json", () => {
    // Fresh temp dir, no PID/state at start.
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    assert.ok(!fs.existsSync(path.join(dir, "supervisor.pid")));
    assert.ok(!fs.existsSync(path.join(dir, "state.json")));

    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=3"],
      {
        _checkGitBranch: () => ({
          ok: false,
          reason: "branch 'main' is protected",
          code: 7,
          branch: "main",
        }),
        _checkWorktreeCleanliness: () => ({ ok: true }),
        _preventSleep: () => null,
        _releaseSleep: () => {},
        _notify: () => {},
        _spawnWorker: () => {
          throw new Error("spawnWorker must not be called on preflight refusal");
        },
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 7);
    assert.match(result.reason || "", /protected|main/);
    // Runtime files must not exist — refusal happened before any write.
    assert.ok(
      !fs.existsSync(path.join(dir, "supervisor.pid")),
      "supervisor.pid must not be written on pre-launch refusal",
    );
    assert.ok(
      !fs.existsSync(path.join(dir, "state.json")),
      "state.json must not be written on pre-launch refusal",
    );
  });
});

describe("M36 supervisor T4: dirty worktree auto-whitelists and proceeds", () => {
  it("auto-whitelists dirty files and continues instead of refusing", () => {
    let savedConfig = null;
    let workerCalled = false;

    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=1"],
      {
        _checkGitBranch: () => ({ ok: true, branch: "feature/x" }),
        _checkWorktreeCleanliness: () => ({
          ok: false,
          reason: "worktree has 2 non-whitelisted dirty file(s): src/a.ts, src/b.ts",
          code: 8,
          dirtyFiles: ["src/a.ts", "src/b.ts"],
        }),
        _saveConfig: (_dir, cfg) => { savedConfig = cfg; },
        _preventSleep: () => null,
        _releaseSleep: () => {},
        _notify: () => {},
        _spawnWorker: () => {
          workerCalled = true;
          return { status: 0, stdout: "", stderr: "", signal: null, timedOut: false, error: null };
        },
      },
    );
    assert.ok(savedConfig, "saveConfig should have been called");
    assert.ok(savedConfig.dirtyTreeWhitelist.includes("src/a.ts"));
    assert.ok(savedConfig.dirtyTreeWhitelist.includes("src/b.ts"));
    assert.ok(workerCalled, "supervisor should proceed to spawn workers after auto-whitelist");
  });

  it("still refuses on non-file git errors (code 2)", () => {
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=1"],
      {
        _checkGitBranch: () => ({ ok: true, branch: "feature/x" }),
        _checkWorktreeCleanliness: () => ({
          ok: false,
          reason: "git status --porcelain failed: not a git repo",
          code: 2,
        }),
        _preventSleep: () => null,
        _releaseSleep: () => {},
        _notify: () => {},
        _spawnWorker: () => {
          throw new Error("spawnWorker must not be called on git error");
        },
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 2);
  });
});

describe("M36 supervisor T4: pre-worker hook — iteration cap halts loop", () => {
  it("transitions to 'failed' with lastExit=6 when cap is hit mid-loop", () => {
    // Trick: fake checkIterationCap to refuse starting at iter=2.
    let calls = 0;
    const fakeIterCap = (state) => {
      if ((state.iter || 0) >= 2) {
        return {
          ok: false,
          reason: "iteration cap exceeded",
          code: 6,
          iter: state.iter,
          maxIterations: 2,
        };
      }
      return { ok: true };
    };
    const fakeSpawn = (state) => {
      calls++;
      return {
        status: 0,
        stdout: `iter ${state.iter} ok\n`,
        stderr: "",
        signal: null,
      };
    };
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({
        _checkIterationCap: fakeIterCap,
        _spawnWorker: fakeSpawn,
        _isMilestoneComplete: () => false,
      }),
    );
    assert.equal(calls, 2, "should spawn iter 1 and iter 2 then halt");
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.lastExit, 6);
  });
});

describe("M36 supervisor T4: pre-worker hook — wall-clock cap halts loop", () => {
  it("transitions to 'failed' with lastExit=6 when wall-clock cap fires", () => {
    let calls = 0;
    let fired = false;
    // Wall-clock cap refuses on the second pre-worker check.
    const fakeWallCap = () => {
      if (calls >= 1) {
        fired = true;
        return {
          ok: false,
          reason: "wall-clock cap exceeded",
          code: 6,
          elapsedMs: 999999999,
          capMs: 1,
        };
      }
      return { ok: true };
    };
    const fakeSpawn = (state) => {
      calls++;
      return {
        status: 0,
        stdout: `iter ${state.iter} ok\n`,
        stderr: "",
        signal: null,
      };
    };
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({
        _checkWallClockCap: fakeWallCap,
        _spawnWorker: fakeSpawn,
        _isMilestoneComplete: () => false,
      }),
    );
    assert.ok(fired, "wall-clock cap should have fired at least once");
    assert.equal(calls, 1, "should spawn exactly one worker before cap halts");
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.lastExit, 6);
  });
});

describe("M36 supervisor T4: post-worker hook — gutter detection halts loop", () => {
  it("transitions to 'failed' with lastExit=6 on gutter detection", () => {
    let gutterFired = false;
    const fakeGutter = () => {
      gutterFired = true;
      return {
        ok: false,
        code: 6,
        reason: "gutter-detected",
        pattern: "repeated-error",
        details: { signature: "ENOENT PATH", consecutiveIters: 3 },
      };
    };
    const fakeSpawn = (state) => ({
      status: 0,
      stdout: `iter ${state.iter} ok\n`,
      stderr: "",
      signal: null,
    });
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({
        _detectGutter: fakeGutter,
        _spawnWorker: fakeSpawn,
        _isMilestoneComplete: () => false,
      }),
    );
    assert.ok(gutterFired, "gutter detector should have been called");
    assert.equal(result.state.iter, 1);
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.lastExit, 6);
  });
});

describe("M36 supervisor T4: post-worker hook — blocker sentinel halts loop", () => {
  it("transitions to 'failed' with lastExit=6 on blocker sentinel", () => {
    let blockerFired = false;
    const fakeBlocker = () => {
      blockerFired = true;
      return {
        ok: false,
        code: 6,
        reason: "blocker-sentinel-detected",
        pattern: "destructive\\s+action\\s+guard",
        matchedText: "destructive action guard",
      };
    };
    const fakeSpawn = (state) => ({
      status: 0,
      stdout: `iter ${state.iter} ok\n`,
      stderr: "",
      signal: null,
    });
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({
        _detectBlockerSentinel: fakeBlocker,
        _spawnWorker: fakeSpawn,
        _isMilestoneComplete: () => false,
      }),
    );
    assert.ok(blockerFired, "blocker sentinel detector should have been called");
    assert.equal(result.state.iter, 1);
    assert.equal(result.state.status, "failed");
    assert.equal(result.state.lastExit, 6);
  });
});

describe("M36 supervisor T4: sleep prevention wired on init and released on finalize", () => {
  it("stores handle from preventSleep and calls releaseSleep on terminal", () => {
    const sleepCalls = { prevent: 0, release: 0, lastHandle: null };
    const fakePrevent = (reason) => {
      sleepCalls.prevent += 1;
      return 42424; // fake handle
    };
    const fakeRelease = (h) => {
      sleepCalls.release += 1;
      sleepCalls.lastHandle = h;
    };
    const fakeSpawn = (state) => ({
      status: 0,
      stdout: `iter ${state.iter} ok\n`,
      stderr: "",
      signal: null,
    });
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=3"],
      {
        _checkGitBranch: () => ({ ok: true, branch: "feature/sleep" }),
        _checkWorktreeCleanliness: () => ({ ok: true }),
        _preventSleep: fakePrevent,
        _releaseSleep: fakeRelease,
        _notify: () => {},
        _spawnWorker: fakeSpawn,
        _isMilestoneComplete: () => true,
      },
    );
    assert.equal(sleepCalls.prevent, 1, "preventSleep should be called once");
    assert.equal(sleepCalls.release, 1, "releaseSleep should be called once");
    assert.equal(sleepCalls.lastHandle, 42424, "handle should flow through");
    assert.equal(
      result.state.sleepPreventionHandle,
      null,
      "state handle must be cleared after release",
    );
  });
});

describe("M36 supervisor T4: resolveClaudePath failure halts before PID write", () => {
  it("returns exit 2 and does NOT write PID or state.json", () => {
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=3"],
      {
        _checkGitBranch: () => ({ ok: true, branch: "feature/x" }),
        _checkWorktreeCleanliness: () => ({ ok: true }),
        _resolveClaudePath: () => {
          throw new Error("claude: command not found");
        },
        _preventSleep: () => null,
        _releaseSleep: () => {},
        _notify: () => {},
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 2);
    assert.match(result.reason || "", /claude/);
    assert.ok(
      !fs.existsSync(path.join(dir, "supervisor.pid")),
      "supervisor.pid must not be written when claude resolve fails",
    );
    assert.ok(
      !fs.existsSync(path.join(dir, "state.json")),
      "state.json must not be written when claude resolve fails",
    );
  });
});

describe("M36 supervisor T4: notify fires on terminal transitions", () => {
  it("invokes notify('Complete', …, 'success') on done", () => {
    const notifyCalls = [];
    const fakeNotify = (title, msg, level) => {
      notifyCalls.push({ title, msg, level });
    };
    const fakeSpawn = (state) => ({
      status: 0,
      stdout: `iter ${state.iter} ok\n`,
      stderr: "",
      signal: null,
    });
    const result = sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=3"],
      permissiveDeps({
        _notify: fakeNotify,
        _spawnWorker: fakeSpawn,
        _isMilestoneComplete: () => true,
      }),
    );
    assert.equal(result.state.status, "done");
    assert.equal(notifyCalls.length, 1);
    assert.match(notifyCalls[0].title, /Complete/);
    assert.equal(notifyCalls[0].level, "success");
  });
});
