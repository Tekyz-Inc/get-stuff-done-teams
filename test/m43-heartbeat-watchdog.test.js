/**
 * Tests for the M43 liveness heartbeat watchdog.
 *
 * Covers:
 *   1. Pure `checkHeartbeat()` logic with injected clock + fake filesystem
 *   2. `platformSpawnWorker` async heartbeat path — kills stale children
 *   3. Supervisor main loop maps staleHeartbeat → exit 125 + lastExitReason
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.1.0
 *   §"Heartbeat Watchdog"
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const {
  checkHeartbeat,
  eventsPathFor,
  DEFAULT_HEARTBEAT_POLL_MS,
  DEFAULT_STALE_HEARTBEAT_MS,
} = require("../bin/gsd-t-unattended-heartbeat.cjs");

const platform = require("../bin/gsd-t-unattended-platform.cjs");

// ─── helpers ─────────────────────────────────────────────────────────────────

function fakeFs({ exists = true, mtimeMs = 0, throwOnStat = null } = {}) {
  return {
    existsSync: (_p) => exists,
    statSync: (_p) => {
      if (throwOnStat) {
        const e = new Error(throwOnStat);
        e.code = "ENOENT";
        throw e;
      }
      return { mtimeMs };
    },
  };
}

// ─── checkHeartbeat — pure logic ─────────────────────────────────────────────

describe("checkHeartbeat (M43)", () => {
  const projectDir = "/tmp/fake-project";
  const workerStartedAt = 1_000_000;
  const staleHeartbeatMs = 5 * 60 * 1000; // 5 min

  it("returns healthy when events file is fresh", () => {
    const now = workerStartedAt + 60 * 1000; // 1 min in
    const r = checkHeartbeat({
      projectDir,
      workerStartedAt,
      staleHeartbeatMs,
      now,
      fsShim: fakeFs({ exists: true, mtimeMs: now - 10 * 1000 }),
    });
    assert.strictEqual(r.stale, false);
    assert.strictEqual(r.ageMs, 10 * 1000);
  });

  it("returns stale when events file mtime is older than threshold", () => {
    const now = workerStartedAt + 6 * 60 * 1000; // 6 min in
    const r = checkHeartbeat({
      projectDir,
      workerStartedAt,
      staleHeartbeatMs,
      now,
      fsShim: fakeFs({ exists: true, mtimeMs: workerStartedAt + 30 * 1000 }),
    });
    assert.strictEqual(r.stale, true);
    assert.ok(r.ageMs >= staleHeartbeatMs);
  });

  it("gives fresh worker grace when events file does not exist yet", () => {
    const now = workerStartedAt + 2 * 60 * 1000; // 2 min, under grace
    const r = checkHeartbeat({
      projectDir,
      workerStartedAt,
      staleHeartbeatMs,
      now,
      fsShim: fakeFs({ exists: false }),
    });
    assert.strictEqual(r.stale, false);
    assert.match(r.reason, /grace/);
  });

  it("goes stale when events file still missing past grace", () => {
    const now = workerStartedAt + staleHeartbeatMs + 1000;
    const r = checkHeartbeat({
      projectDir,
      workerStartedAt,
      staleHeartbeatMs,
      now,
      fsShim: fakeFs({ exists: false }),
    });
    assert.strictEqual(r.stale, true);
    assert.match(r.reason, /absent/);
  });

  it("does not kill on first poll when existing events file is older than worker start", () => {
    // Scenario: events file carried over from a prior iteration. Worker
    // just started; ref should be workerStartedAt, not mtime.
    const now = workerStartedAt + 30 * 1000;
    const r = checkHeartbeat({
      projectDir,
      workerStartedAt,
      staleHeartbeatMs,
      now,
      fsShim: fakeFs({
        exists: true,
        mtimeMs: workerStartedAt - 60 * 60 * 1000,
      }),
    });
    assert.strictEqual(r.stale, false);
    // ageMs should be measured from workerStartedAt, not the stale mtime.
    assert.strictEqual(r.ageMs, 30 * 1000);
  });

  it("throws on invalid inputs", () => {
    assert.throws(() =>
      checkHeartbeat({ projectDir: "", workerStartedAt: 0, staleHeartbeatMs: 1 })
    );
    assert.throws(() =>
      checkHeartbeat({
        projectDir,
        workerStartedAt: "nope",
        staleHeartbeatMs: 1,
      })
    );
    assert.throws(() =>
      checkHeartbeat({
        projectDir,
        workerStartedAt: 0,
        staleHeartbeatMs: -1,
      })
    );
  });

  it("eventsPathFor returns YYYY-MM-DD file path under .gsd-t/events", () => {
    const ts = Date.UTC(2026, 3, 21, 19, 48); // 2026-04-21 19:48 UTC
    const p = eventsPathFor("/project", ts);
    assert.ok(p.endsWith(path.join(".gsd-t", "events", "2026-04-21.jsonl")));
    assert.ok(p.startsWith("/project"));
  });

  it("exports sensible defaults", () => {
    assert.strictEqual(DEFAULT_HEARTBEAT_POLL_MS, 60 * 1000);
    assert.strictEqual(DEFAULT_STALE_HEARTBEAT_MS, 5 * 60 * 1000);
  });
});

// ─── platform.spawnWorker — heartbeat path ──────────────────────────────────

describe("platform.spawnWorker heartbeat path (M43)", () => {
  it("returns Promise when onHeartbeatCheck is provided", () => {
    // Build a fake spawn impl returning an event-emitter-ish child so we
    // don't actually fork a process.
    const { EventEmitter } = require("node:events");
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    const fakeSpawn = () => {
      // Close immediately with exit 0 so the promise resolves.
      setImmediate(() => child.emit("close", 0, null));
      return child;
    };

    const result = platform.spawnWorker("/tmp", 10_000, {
      args: ["-p", "stub"],
      onHeartbeatCheck: () => ({ stale: false, reason: "fresh" }),
      heartbeatPollMs: 1000,
      _spawnImpl: fakeSpawn,
    });
    assert.ok(result && typeof result.then === "function");
    return result.then((r) => {
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.staleHeartbeat, false);
      assert.strictEqual(r.timedOut, false);
    });
  });

  it("kills child when heartbeat check returns stale=true", async () => {
    const { EventEmitter } = require("node:events");
    let killed = false;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = (sig) => {
      killed = sig;
      // Simulate child exit on SIGTERM.
      setImmediate(() => child.emit("close", null, sig));
      return true;
    };
    const fakeSpawn = () => child;

    let pollCount = 0;
    const onHeartbeatCheck = () => {
      pollCount++;
      return { stale: true, reason: "test stale" };
    };

    const r = await platform.spawnWorker("/tmp", 60_000, {
      args: ["-p", "stub"],
      onHeartbeatCheck,
      heartbeatPollMs: 10, // fast poll for test
      _spawnImpl: fakeSpawn,
    });
    assert.strictEqual(r.staleHeartbeat, true);
    assert.strictEqual(r.heartbeatReason, "test stale");
    assert.strictEqual(killed, "SIGTERM");
    assert.ok(pollCount >= 1);
  });

  it("does NOT set staleHeartbeat on clean exit", async () => {
    const { EventEmitter } = require("node:events");
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    const fakeSpawn = () => {
      setImmediate(() => child.emit("close", 0, null));
      return child;
    };

    const r = await platform.spawnWorker("/tmp", 60_000, {
      args: ["-p", "stub"],
      onHeartbeatCheck: () => ({ stale: false }),
      heartbeatPollMs: 50,
      _spawnImpl: fakeSpawn,
    });
    assert.strictEqual(r.staleHeartbeat, false);
    assert.strictEqual(r.status, 0);
  });

  it("legacy spawnSync path returns synchronously when no heartbeat callback", () => {
    // No onHeartbeatCheck → must return a plain object, not a Promise.
    const r = platform.spawnWorker("/tmp", 10, {
      bin: "node",
      args: ["-e", "process.exit(0)"],
      env: { ...process.env, PATH: process.env.PATH || "/usr/bin" },
    });
    assert.ok(r && typeof r.then !== "function", "legacy path must not return a Promise");
    assert.strictEqual(r.staleHeartbeat, false);
  });

  it("surfaces spawn error when spawn impl throws", async () => {
    const fakeSpawn = () => {
      throw new Error("ENOENT stub");
    };
    const r = await platform.spawnWorker("/tmp", 1000, {
      args: ["-p", "stub"],
      onHeartbeatCheck: () => ({ stale: false }),
      heartbeatPollMs: 100,
      _spawnImpl: fakeSpawn,
    });
    assert.ok(r.error, "error must be surfaced");
    assert.match(r.error.message, /ENOENT/);
  });
});

// ─── supervisor main loop — exit 125 mapping ────────────────────────────────

describe("supervisor main loop heartbeat exit mapping (M43)", () => {
  it("maps staleHeartbeat res → exitCode 125 + lastExitReason=stale_heartbeat", async () => {
    const mod = require("../bin/gsd-t-unattended.cjs");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m43-heartbeat-"));
    const dir = path.join(tmpDir, ".gsd-t", ".unattended");
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".gsd-t", "events"), { recursive: true });

    // Stub spawnWorker to return a stale-heartbeat result, then capture
    // state.lastExit/Reason for assertion before the next cap check
    // overwrites them.
    let captured = null;
    const stubSpawnWorker = (state, _opts) => {
      return {
        status: null,
        stdout: "",
        stderr: "",
        signal: "SIGTERM",
        timedOut: false,
        staleHeartbeat: true,
        heartbeatReason: "test: events mtime stale 600000ms",
        error: null,
      };
    };

    const stubMilestoneComplete = () => false;

    // Initialize minimal state.
    const state = {
      projectDir: tmpDir,
      milestone: "M43",
      iter: 0,
      startedAt: new Date().toISOString(),
      status: "running",
    };

    await mod.runMainLoop(
      state,
      dir,
      { maxIterations: 2, hours: 24, workerTimeoutMs: 3600000 },
      {
        _spawnWorker: stubSpawnWorker,
        _isMilestoneComplete: stubMilestoneComplete,
        _stopRequested: () => false,
        _checkHeartbeat: () => ({ stale: false }),
        _disableHeartbeat: true, // we're already synthesizing a stale result
      },
      {
        config: {
          maxIterations: 2,
          hours: 24,
          gutterNoProgressIters: 100, // disable
          workerTimeoutMs: 3600000,
          staleHeartbeatMs: 300000,
          protectedBranches: [],
          dirtyTreeWhitelist: [],
        },
        fn: {
          checkIterationCap: (s) => {
            if (s.iter >= 1) {
              // Snapshot the state written by the heartbeat exit path BEFORE
              // the cap refusal overwrites it.
              captured = { lastExit: s.lastExit, lastExitReason: s.lastExitReason };
              return { ok: false, code: 6, reason: "test cap" };
            }
            return { ok: true };
          },
          checkWallClockCap: () => ({ ok: true }),
          validateState: () => ({ ok: true }),
          detectGutter: () => ({ ok: true }),
          detectBlockerSentinel: () => ({ ok: true }),
        },
      }
    );

    assert.ok(captured, "cap check should have run after iter 1");
    assert.strictEqual(captured.lastExit, 125, "stale heartbeat must map to exit 125");
    assert.strictEqual(captured.lastExitReason, "stale_heartbeat");
  });
});
