/**
 * M44 D9 Step 2 — Wire Unattended Supervisor to Planner
 *
 * Verifies that `bin/gsd-t-unattended.cjs`'s main loop calls the M44 planner
 * (`runParallel`) before each iter and, when the plan says N≥2 workers with
 * all gates green, spawns N concurrent workers via Promise.all BEFORE
 * advancing the iter counter. When the plan says N=1 (or any gate vetoes),
 * the supervisor falls back to bit-identical v1.4.x single-worker behavior.
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.5.0 §15a
 *
 * Coverage:
 *   1. N=4 disjoint-fixture plan  → supervisor invokes runParallel, spawns 4
 *                                    concurrent stubs, joins on all, iter=1.
 *   2. Economics-vetoed plan (N=1) → byte-identical fallback path; no
 *                                     GSD_T_WORKER_TASK_IDS; workerPids absent
 *                                     from state.json.
 *   3. state.json correctly reflects N workers across iters — fan-out iter
 *      writes lastExits[]/workerPids[]/lastFanOutCount; subsequent sequential
 *      iter clears them.
 *   4. Planner thrown error → sequential fallback + `parallelism_reduced` event.
 *   5. _partitionTasks round-robin correctness (unit-level).
 */

const { describe, it, beforeEach, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const sup = require("../bin/gsd-t-unattended.cjs");

// Permissive safety-rails baseline (safety rails refuse a bare temp dir).
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m44-wire-"));
});

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

beforeEach(() => {
  for (const entry of fs.readdirSync(tmpDir)) {
    fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
  }
});

function _readEvents(projectDir) {
  const dir = path.join(projectDir, ".gsd-t", "events");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  const events = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch (_) {}
    }
  }
  return events;
}

// ── Case 1: N=4 disjoint plan → 4 concurrent stubs, joined, iter=1 ─────────

describe("M44 D9 Step 2 — fan-out path (N≥2)", () => {
  it("calls runParallel before each iter and spawns N concurrent workers via Promise.all", async () => {
    const planCalls = [];
    const fakeRunParallel = (o) => {
      planCalls.push(o);
      return {
        mode: "unattended",
        workerCount: 4,
        parallelTasks: ["M44-D9-T1", "M44-D9-T2", "M44-D9-T3", "M44-D9-T4"],
        plan: [],
      };
    };

    // Track concurrency: every fakeSpawn call holds a gate until all N are in.
    const entered = [];
    const taskIdsSeen = [];
    let resolveGate;
    const gate = new Promise((r) => { resolveGate = r; });
    const fakeSpawn = async (state, opts) => {
      entered.push(state._workerIndex);
      taskIdsSeen.push(opts.taskIds);
      if (entered.length === 4) resolveGate();
      await gate;
      return { status: 0, stdout: `W${state._workerIndex} ok\n`, stderr: "", signal: null };
    };

    const result = await sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({
        _spawnWorker: fakeSpawn,
        _runParallel: fakeRunParallel,
        _isMilestoneComplete: () => true,
        _disableHeartbeat: true,
      }),
    );

    assert.equal(result.state.status, "done");
    // Iter counts ONCE per fan-out (contract §15a join semantics).
    assert.equal(result.state.iter, 1, "iter must count once per fan-out, not N times");
    // runParallel was called for this iter.
    assert.ok(planCalls.length >= 1);
    assert.equal(planCalls[0].mode, "unattended");
    assert.equal(planCalls[0].dryRun, true);
    // All 4 stubs ran concurrently (resolveGate only fires after the 4th enter).
    assert.equal(entered.length, 4, "exactly 4 workers spawned");
    // Task IDs partitioned disjointly (union = original set).
    const flat = [].concat(...taskIdsSeen).sort();
    assert.deepEqual(flat, ["M44-D9-T1", "M44-D9-T2", "M44-D9-T3", "M44-D9-T4"]);
    // Per-worker state carries index/total so the real _spawnWorker can set env.
    for (const i of entered) assert.ok(i >= 0 && i < 4);
  });

  it("writes lastExits[], workerPids[], lastFanOutCount on fan-out iters", async () => {
    const fakeRunParallel = () => ({
      mode: "unattended",
      workerCount: 2,
      parallelTasks: ["A", "B"],
      plan: [],
    });
    const fakeSpawn = async (state, opts) => ({
      status: 0,
      stdout: "",
      stderr: "",
      signal: null,
      spawnId: `spawn-w${state._workerIndex}`,
    });
    const result = await sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({
        _spawnWorker: fakeSpawn,
        _runParallel: fakeRunParallel,
        _isMilestoneComplete: () => true,
        _disableHeartbeat: true,
      }),
    );
    assert.ok(Array.isArray(result.state.lastExits), "lastExits must be an array");
    assert.equal(result.state.lastExits.length, 2);
    assert.equal(result.state.lastExits[0].code, 0);
    assert.deepEqual(result.state.lastExits[0].taskIds, ["A"]);
    assert.deepEqual(result.state.lastExits[1].taskIds, ["B"]);
    assert.equal(result.state.lastFanOutCount, 2);
    assert.ok(Array.isArray(result.state.workerPids));
    assert.equal(result.state.workerPids.length, 2);
    // lastExit (singular, v1.0.0 field) reflects the merged worst-exit.
    assert.equal(result.state.lastExit, 0);
  });

  it("worst-exit-wins merge: one failing worker → lastExit non-zero", async () => {
    const fakeRunParallel = () => ({
      mode: "unattended",
      workerCount: 3,
      parallelTasks: ["A", "B", "C"],
      plan: [],
    });
    const fakeSpawn = async (state, _opts) => {
      if (state._workerIndex === 1) return { status: 1, stdout: "fail\n", stderr: "", signal: null };
      return { status: 0, stdout: "ok\n", stderr: "", signal: null };
    };
    const result = await sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=1"],
      permissiveDeps({
        _spawnWorker: fakeSpawn,
        _runParallel: fakeRunParallel,
        _isMilestoneComplete: () => false,
        _disableHeartbeat: true,
      }),
    );
    assert.ok(result.state.lastExit !== 0, "worst-exit wins on fan-out merge");
    // The failing worker is recorded.
    const failed = result.state.lastExits.filter((w) => w.code === 1);
    assert.equal(failed.length, 1);
  });

  it("emits fan_out event with worker_count and task_ids", async () => {
    const fakeRunParallel = () => ({
      mode: "unattended",
      workerCount: 2,
      parallelTasks: ["X", "Y"],
      plan: [],
    });
    const fakeSpawn = async () => ({ status: 0, stdout: "", stderr: "", signal: null });
    await sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=1"],
      permissiveDeps({
        _spawnWorker: fakeSpawn,
        _runParallel: fakeRunParallel,
        _isMilestoneComplete: () => true,
        _disableHeartbeat: true,
      }),
    );
    const events = _readEvents(tmpDir);
    const fanOut = events.filter((e) => e.type === "fan_out");
    assert.ok(fanOut.length >= 1, "at least one fan_out event emitted");
    assert.equal(fanOut[0].worker_count, 2);
    assert.deepEqual(fanOut[0].task_ids, ["X", "Y"]);
    assert.equal(fanOut[0].source, "supervisor");
  });
});

// ── Case 2: Economics-vetoed plan (N=1) → bit-identical fallback ─────────

describe("M44 D9 Step 2 — sequential fallback (N≤1 / gates veto)", () => {
  it("falls back to single-worker path when plan.workerCount = 1", async () => {
    const fakeRunParallel = () => ({
      mode: "unattended",
      workerCount: 1,
      parallelTasks: ["solo-task"],
      plan: [],
    });
    let spawnCount = 0;
    let capturedOpts = null;
    const fakeSpawn = (_state, opts) => {
      spawnCount++;
      capturedOpts = opts;
      return { status: 0, stdout: "single\n", stderr: "", signal: null };
    };
    const result = await sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=1"],
      permissiveDeps({
        _spawnWorker: fakeSpawn,
        _runParallel: fakeRunParallel,
        _isMilestoneComplete: () => true,
        _disableHeartbeat: true,
      }),
    );
    assert.equal(spawnCount, 1, "exactly one worker on the N=1 path");
    // No taskIds forwarded on the sequential path (env var stays unset).
    assert.ok(!capturedOpts.taskIds, "single-worker fallback does not set opts.taskIds");
    // Multi-worker fields absent on state.json.
    assert.equal(result.state.lastExits, undefined, "lastExits must be absent on sequential iter");
    assert.equal(result.state.workerPids, undefined, "workerPids must be absent on sequential iter");
    assert.equal(result.state.lastFanOutCount, undefined, "lastFanOutCount must be absent on sequential iter");
  });

  it("falls back when plan.workerCount = 0 (empty graph)", async () => {
    const fakeRunParallel = () => ({ mode: "unattended", workerCount: 0, parallelTasks: [], plan: [] });
    let spawnCount = 0;
    const fakeSpawn = () => { spawnCount++; return { status: 0, stdout: "", stderr: "", signal: null }; };
    const result = await sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=1"],
      permissiveDeps({
        _spawnWorker: fakeSpawn,
        _runParallel: fakeRunParallel,
        _isMilestoneComplete: () => true,
        _disableHeartbeat: true,
      }),
    );
    assert.equal(spawnCount, 1);
    assert.equal(result.state.iter, 1);
  });
});

// ── Case 3: Fan-out iter → sequential iter correctly clears state fields ─

describe("M44 D9 Step 2 — regime transition (fan-out → sequential clears state)", () => {
  it("removes lastExits/workerPids/lastFanOutCount when a sequential iter follows a fan-out iter", async () => {
    let iter = 0;
    const fakeRunParallel = () => {
      iter++;
      if (iter === 1) return { mode: "unattended", workerCount: 2, parallelTasks: ["A", "B"], plan: [] };
      return { mode: "unattended", workerCount: 1, parallelTasks: ["C"], plan: [] };
    };
    const fakeSpawn = async (state) => ({
      status: 0, stdout: "", stderr: "", signal: null,
      spawnId: `w${(state._workerIndex != null) ? state._workerIndex : "solo"}`,
    });
    // Milestone completes only after iter 2.
    let iterObserved = 0;
    const fakeMilestone = () => iterObserved >= 2;
    const milestoneBumper = async (state) => {
      iterObserved = state.iter;
      return fakeSpawn(state);
    };
    const result = await sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=10"],
      permissiveDeps({
        _spawnWorker: milestoneBumper,
        _runParallel: fakeRunParallel,
        _isMilestoneComplete: fakeMilestone,
        _disableHeartbeat: true,
      }),
    );
    assert.equal(result.state.status, "done");
    assert.equal(result.state.iter, 2);
    // After the FINAL (sequential) iter, the multi-worker fields must be cleared.
    assert.equal(result.state.lastExits, undefined, "lastExits cleared after sequential iter");
    assert.equal(result.state.workerPids, undefined, "workerPids cleared after sequential iter");
    assert.equal(result.state.lastFanOutCount, undefined, "lastFanOutCount cleared after sequential iter");
  });
});

// ── Case 4: Planner error → sequential fallback + parallelism_reduced ─

describe("M44 D9 Step 2 — planner error → sequential fallback", () => {
  it("emits parallelism_reduced with planner_error reason and falls back", async () => {
    const fakeRunParallel = () => { throw new Error("planner broken"); };
    let spawnCount = 0;
    const fakeSpawn = () => { spawnCount++; return { status: 0, stdout: "", stderr: "", signal: null }; };
    await sup.doUnattended(
      ["--project=" + tmpDir, "--max-iterations=1"],
      permissiveDeps({
        _spawnWorker: fakeSpawn,
        _runParallel: fakeRunParallel,
        _isMilestoneComplete: () => true,
        _disableHeartbeat: true,
      }),
    );
    assert.equal(spawnCount, 1, "planner error must not prevent a worker from running");
    const events = _readEvents(tmpDir);
    const reduced = events.filter((e) => e.type === "parallelism_reduced");
    assert.ok(reduced.length >= 1, "parallelism_reduced event emitted on planner error");
    assert.match(reduced[0].reason || "", /planner_error/);
  });
});

// ── Case 5: _partitionTasks round-robin correctness ──────────────────────

describe("M44 D9 Step 2 — _partitionTasks round-robin", () => {
  it("returns [] for empty input or workerCount=0", () => {
    assert.deepEqual(sup._partitionTasks([], 4), []);
    assert.deepEqual(sup._partitionTasks(["a"], 0), []);
    assert.deepEqual(sup._partitionTasks(null, 2), []);
  });

  it("distributes N tasks round-robin across N workers (1-to-1)", () => {
    const r = sup._partitionTasks(["a", "b", "c", "d"], 4);
    assert.equal(r.length, 4);
    assert.deepEqual(r, [["a"], ["b"], ["c"], ["d"]]);
  });

  it("distributes 7 tasks across 3 workers (3/2/2 split)", () => {
    const r = sup._partitionTasks(["t1", "t2", "t3", "t4", "t5", "t6", "t7"], 3);
    assert.equal(r.length, 3);
    const flat = [].concat(...r).sort();
    assert.deepEqual(flat, ["t1", "t2", "t3", "t4", "t5", "t6", "t7"]);
    // Round-robin: worker 0 gets [t1, t4, t7], worker 1 gets [t2, t5], worker 2 gets [t3, t6].
    assert.deepEqual(r[0], ["t1", "t4", "t7"]);
    assert.deepEqual(r[1], ["t2", "t5"]);
    assert.deepEqual(r[2], ["t3", "t6"]);
  });

  it("caps workerCount at tasks.length when workerCount > tasks.length", () => {
    const r = sup._partitionTasks(["a", "b"], 5);
    assert.equal(r.length, 2, "must not produce empty subsets");
    assert.deepEqual(r, [["a"], ["b"]]);
  });
});

// ── Case 6: _spawnWorkerFanOut merge semantics (unit-level) ──────────────

describe("M44 D9 Step 2 — _spawnWorkerFanOut merge semantics", () => {
  it("merges N worker results: status=worst, stdout tagged, timedOut=any, staleHeartbeat=any", async () => {
    const fakeSpawn = async (state, opts) => {
      if (state._workerIndex === 0) return { status: 0, stdout: "A-ok\n", stderr: "", signal: null };
      if (state._workerIndex === 1) return { status: 0, stdout: "B-ok\n", stderr: "", signal: null, staleHeartbeat: true, heartbeatReason: "silent" };
      return { status: 2, stdout: "C-fail\n", stderr: "oops\n", signal: null, timedOut: true };
    };
    const res = await sup._spawnWorkerFanOut({}, {}, fakeSpawn, [["A"], ["B"], ["C"]]);
    assert.equal(res.status, 2, "worst status wins");
    assert.equal(res.staleHeartbeat, true);
    assert.equal(res.timedOut, true);
    assert.equal(res.heartbeatReason, "silent");
    assert.ok(res.stdout.includes("[WORKER 1/3 tasks=A]"));
    assert.ok(res.stdout.includes("[WORKER 2/3 tasks=B]"));
    assert.ok(res.stdout.includes("[WORKER 3/3 tasks=C]"));
    assert.ok(res.stderr.includes("oops"));
    assert.equal(res.fanOutCount, 3);
    assert.equal(res.workerResults.length, 3);
    assert.deepEqual(res.workerResults.map((w) => w.taskIds), [["A"], ["B"], ["C"]]);
  });

  it("isolates per-worker throws: a rejected spawn becomes status=3 without killing siblings", async () => {
    const fakeSpawn = async (state) => {
      if (state._workerIndex === 0) throw new Error("boom");
      return { status: 0, stdout: "", stderr: "", signal: null };
    };
    const res = await sup._spawnWorkerFanOut({}, {}, fakeSpawn, [["A"], ["B"]]);
    assert.equal(res.workerResults.length, 2);
    assert.equal(res.workerResults[0].status, 3);
    assert.equal(res.workerResults[1].status, 0);
  });
});
