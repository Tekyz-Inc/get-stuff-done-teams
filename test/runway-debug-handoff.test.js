/**
 * Tests for the runway → debug → headless-auto-spawn handoff path.
 * Uses Node.js built-in test runner (node --test).
 *
 * Contracts:
 *   .gsd-t/contracts/runway-estimator-contract.md   v1.0.0
 *   .gsd-t/contracts/headless-auto-spawn-contract.md v1.0.0
 *
 * AC (HAS-T3): ~5 tests covering:
 *   1. State persistence — runway-handoff-snapshot entry written with
 *      hypothesis + fix + test-output
 *   2. Handoff call — autoSpawnHeadless invoked with correct args shape
 *   3. Session file created — .gsd-t/headless-sessions/{id}.json with status='running'
 *   4. Clean exit — debug loop does not throw after handoff
 *   5. Headless pickup — continue_from path points to existing ledger file
 *
 * The bash block that lives in commands/gsd-t-debug.md cannot be directly
 * executed inside a node test, so these tests mirror its behavior in JS and
 * assert on the observable side-effects.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const runway = require("../bin/runway-estimator.js");
const has = require("../bin/headless-auto-spawn.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-rdh-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const gsd = path.join(tmpDir, ".gsd-t");
  if (fs.existsSync(gsd)) {
    fs.rmSync(gsd, { recursive: true, force: true });
  }
  fs.mkdirSync(gsd, { recursive: true });
  // Seed a high context pct so estimateRunway refuses.
  fs.writeFileSync(
    path.join(gsd, ".context-meter-state.json"),
    JSON.stringify({
      version: 1,
      timestamp: new Date().toISOString(),
      inputTokens: 160000,
      modelWindowSize: 200000,
      pct: 80,
      threshold: "warn",
      checkCount: 1,
    }),
  );
});

/**
 * Re-implements the commands/gsd-t-debug.md between-iteration block in JS
 * so we can assert on its side-effects. Uses a mock for autoSpawnHeadless
 * when requested, otherwise calls the real one.
 */
function runHandoffBlock({
  projectDir,
  hypothesis,
  last_fix_diff,
  last_test_output,
  next_iteration,
  autoSpawnMock = null,
}) {
  const r = runway.estimateRunway({
    command: "gsd-t-debug",
    domain_type: "",
    remaining_tasks: 1,
    projectDir,
  });
  if (r.can_start) return { refused: false, result: r };

  const ledgerPath = path.join(projectDir, ".gsd-t", "debug-ledger.jsonl");
  const snapshot = {
    type: "runway-handoff-snapshot",
    timestamp: new Date().toISOString(),
    hypothesis: hypothesis || "",
    last_fix_diff: last_fix_diff || "",
    last_test_output: last_test_output || "",
    iteration_n_plus_1: Number(next_iteration || 0),
    current_pct: r.current_pct,
    projected_end_pct: r.projected_end_pct,
    confidence: r.confidence,
  };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(snapshot) + "\n");

  const spawnFn = autoSpawnMock || has.autoSpawnHeadless;
  const session = spawnFn({
    command: "gsd-t-debug",
    args: ["--resume", "iteration-" + snapshot.iteration_n_plus_1],
    continue_from: ledgerPath,
    projectDir,
  });

  return { refused: true, snapshot, session, ledgerPath, result: r };
}

// ── 1. State persistence ─────────────────────────────────────────────────────

describe("HAS-T3: state persistence on refusal", () => {
  it("writes runway-handoff-snapshot entry with hypothesis + fix + test output", () => {
    const calls = [];
    const mockSpawn = (opts) => {
      calls.push(opts);
      return { id: "mock-id", pid: 1, logPath: "mock.log", timestamp: "t" };
    };
    const out = runHandoffBlock({
      projectDir: tmpDir,
      hypothesis: "null deref in parser",
      last_fix_diff: "- x = null\n+ x = maybeNull ?? default",
      last_test_output: "FAIL: 3/1011",
      next_iteration: 4,
      autoSpawnMock: mockSpawn,
    });
    assert.equal(out.refused, true);
    const ledger = fs
      .readFileSync(out.ledgerPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.equal(ledger.length, 1);
    const snap = ledger[0];
    assert.equal(snap.type, "runway-handoff-snapshot");
    assert.equal(snap.hypothesis, "null deref in parser");
    assert.ok(snap.last_fix_diff.includes("maybeNull"));
    assert.equal(snap.last_test_output, "FAIL: 3/1011");
    assert.equal(snap.iteration_n_plus_1, 4);
    assert.equal(snap.current_pct, 80);
  });
});

// ── 2. Handoff call shape ────────────────────────────────────────────────────

describe("HAS-T3: handoff call", () => {
  it("calls autoSpawnHeadless with correct args shape", () => {
    const calls = [];
    const mockSpawn = (opts) => {
      calls.push(opts);
      return { id: "mock", pid: 2, logPath: "mock.log", timestamp: "t" };
    };
    runHandoffBlock({
      projectDir: tmpDir,
      hypothesis: "h",
      next_iteration: 2,
      autoSpawnMock: mockSpawn,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "gsd-t-debug");
    assert.deepEqual(calls[0].args, ["--resume", "iteration-2"]);
    assert.ok(calls[0].continue_from.endsWith("debug-ledger.jsonl"));
  });
});

// ── 3. Session file created ─────────────────────────────────────────────────

describe("HAS-T3: session file", () => {
  it("creates .gsd-t/headless-sessions/{id}.json with status='running'", () => {
    const out = runHandoffBlock({
      projectDir: tmpDir,
      hypothesis: "h",
      next_iteration: 1,
      // use real autoSpawnHeadless — it writes the session file
      autoSpawnMock: null,
    });
    assert.equal(out.refused, true);
    const sessionFp = path.join(
      tmpDir,
      ".gsd-t",
      "headless-sessions",
      out.session.id + ".json",
    );
    assert.ok(fs.existsSync(sessionFp), "session file must exist");
    const sess = JSON.parse(fs.readFileSync(sessionFp, "utf8"));
    assert.equal(sess.status, "running");
    assert.equal(sess.command, "gsd-t-debug");
    assert.deepEqual(sess.args, ["--resume", "iteration-1"]);
  });
});

// ── 4. Clean exit ───────────────────────────────────────────────────────────

describe("HAS-T3: clean exit", () => {
  it("handoff block completes without throwing", () => {
    assert.doesNotThrow(() => {
      runHandoffBlock({
        projectDir: tmpDir,
        hypothesis: "h",
        next_iteration: 0,
        autoSpawnMock: () => ({
          id: "x",
          pid: 1,
          logPath: "x.log",
          timestamp: "t",
        }),
      });
    });
  });
});

// ── 5. Headless pickup path ─────────────────────────────────────────────────

describe("HAS-T3: headless pickup", () => {
  it("continue_from path points to an existing ledger file", () => {
    let captured;
    const mockSpawn = (opts) => {
      captured = opts;
      return { id: "y", pid: 1, logPath: "y.log", timestamp: "t" };
    };
    runHandoffBlock({
      projectDir: tmpDir,
      hypothesis: "h",
      next_iteration: 7,
      autoSpawnMock: mockSpawn,
    });
    assert.ok(fs.existsSync(captured.continue_from));
    const raw = fs.readFileSync(captured.continue_from, "utf8").trim();
    const entry = JSON.parse(raw);
    assert.equal(entry.iteration_n_plus_1, 7);
  });
});
