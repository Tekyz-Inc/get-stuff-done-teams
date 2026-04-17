/**
 * Triple-fix tests for v3.13.11 (bee-poc hang fallout)
 *
 * Bug 1 (P0): supervisor watchdog — spawnSync timeout kills a hung worker,
 *             run.log gets a deterministic "[worker_timeout] iter=N" line,
 *             state.json.lastTick + lastExit=124 are written so /gsd-t-unattended-watch
 *             sees a fresh heartbeat immediately after timeout.
 *
 * Bug 2 (P0): worker cwd invariant — the _spawnWorker prompt contains an
 *             explicit assertion that cwd matches $GSD_T_PROJECT_DIR before
 *             any work begins, plus guidance to use subshells for `cd`.
 *
 * Bug 3 (P2): IS_STALE determinism — Step 2 node block emits IS_STALE as a
 *             pure boolean computed from tickAgeMs > 540000, so the haiku
 *             renderer never interprets the threshold in prose.
 *
 * Contract touchpoints:
 *   - unattended-supervisor-contract.md §3 (lastTick + 540s threshold)
 *   - unattended-supervisor-contract.md §16 (270s cache-warm pacing)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const SUP = require("../bin/gsd-t-unattended.cjs");
const SRC_PATH = path.join(__dirname, "..", "bin", "gsd-t-unattended.cjs");
const SRC = fs.readFileSync(SRC_PATH, "utf8");

const WATCH_PATH = path.join(__dirname, "..", "commands", "gsd-t-unattended-watch.md");
const WATCH_SRC = fs.readFileSync(WATCH_PATH, "utf8");

// Permissive deps so the loop runs without a real git repo under /tmp.
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

function freshTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-v31311-"));
  // Minimal progress.md so isMilestoneComplete / validateState can run.
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".gsd-t", "progress.md"),
    "# Progress\n\n## Project: test\n## Status: IN PROGRESS\n" +
      "## Milestone: M99\n## Version: 0.1.00\n",
  );
  return dir;
}

// ─── Bug 1: supervisor watchdog on hung worker ─────────────────────────────

describe("v3.13.11 Bug 1 — supervisor watchdog fires on hung worker", () => {
  it("simulated timeout: lastExit=124, lastTick updated, worker_timeout in run.log", () => {
    const tmp = freshTmpProject();
    try {
      // Stub "hung worker": shaped exactly like what platformSpawnWorker
      // returns when spawnSync's timeout fires — status=null, signal='SIGTERM',
      // timedOut=true. We don't need to actually sleep for the test override
      // — the mapping logic is what matters.
      let calls = 0;
      const fakeSpawn = () => {
        calls++;
        return {
          status: null,
          stdout: "",
          stderr: "",
          signal: "SIGTERM",
          timedOut: true,
          error: null,
        };
      };

      const result = SUP.doUnattended(
        ["--project=" + tmp, "--max-iterations=2", "--worker-timeout=2000"],
        permissiveDeps({
          _spawnWorker: fakeSpawn,
          _isMilestoneComplete: () => false,
        }),
      );

      // At least one iter spawned; lastExit=124 per §5.
      assert.ok(calls >= 1, "watchdog test expected ≥1 spawn, got " + calls);
      assert.equal(
        result.state.lastExit,
        124,
        "timeout must map to exit 124 (contract §5)",
      );

      // lastTick must be a fresh ISO string post-timeout (supervisor wrote
      // state.json after the timeout detection).
      assert.ok(
        result.state.lastTick && typeof result.state.lastTick === "string",
        "lastTick must be populated after timeout path",
      );
      const tickAge = Date.now() - Date.parse(result.state.lastTick);
      assert.ok(
        tickAge >= 0 && tickAge < 10000,
        `lastTick must be fresh (<10s) after timeout, got age=${tickAge}ms`,
      );

      // run.log must carry an explicit worker_timeout marker for operator
      // diagnostics (Bug 1 fix — visibility into watchdog firings).
      const runLog = fs.readFileSync(
        path.join(tmp, ".gsd-t", ".unattended", "run.log"),
        "utf8",
      );
      assert.match(
        runLog,
        /\[worker_timeout\] iter=\d+/,
        "run.log must carry '[worker_timeout] iter=N' marker after timeout",
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("source: worker_timeout branch prepends marker to run.log body", () => {
    // Safety check — make sure the diagnostic prepend isn't dead code. The
    // branch must guard on exitCode === 124 and prepend a "[worker_timeout]"
    // marker to the stdout that _appendRunLog writes, so the single run.log
    // block for this iter carries the watchdog event at the top.
    const branchRe =
      /if\s*\(\s*exitCode\s*===\s*124\s*\)\s*\{[\s\S]*?\[worker_timeout\][\s\S]*?\}/;
    assert.ok(
      branchRe.test(SRC),
      "runMainLoop must have an exitCode===124 branch that produces a " +
        "'[worker_timeout]' diagnostic marker",
    );
    // And that the appended block uses the marker-modified stdout, not the
    // raw stdout — the append must reference `loggedStdout` (or equivalent)
    // rather than only `stdout`.
    assert.ok(
      /_appendRunLog\([^)]*loggedStdout/.test(SRC),
      "run.log append must use the marker-prepended stdout variable so the " +
        "watchdog diagnostic reaches disk",
    );
  });
});

// ─── Bug 2: worker cwd invariant ──────────────────────────────────────────

describe("v3.13.11 Bug 2 — worker cwd invariant", () => {
  it("_spawnWorker passes explicit cwd to platformSpawnWorker", () => {
    // Existing invariant — the supervisor passes opts.cwd = projectDir to
    // the platform spawn helper. Re-assert so a future refactor can't drop it.
    const m = SRC.match(
      /platformSpawnWorker\s*\(\s*opts\.cwd\s*,\s*opts\.timeout\s*,/,
    );
    assert.ok(
      m,
      "_spawnWorker must call platformSpawnWorker(opts.cwd, opts.timeout, …) " +
        "— explicit cwd is the first defense against shell cwd drift",
    );
  });

  it("_spawnWorker sets GSD_T_PROJECT_DIR in worker env", () => {
    const m = SRC.match(/GSD_T_PROJECT_DIR:\s*process\.env\.GSD_T_PROJECT_DIR/);
    assert.ok(
      m,
      "worker env must populate GSD_T_PROJECT_DIR so the in-worker safety " +
        "check has a source-of-truth to compare cwd against",
    );
  });

  it("worker prompt carries the cwd assertion and subshell guidance", () => {
    // Extract the _spawnWorker body (walk the braces).
    const start = SRC.indexOf("function _spawnWorker(");
    assert.ok(start >= 0, "_spawnWorker not found");
    let i = SRC.indexOf("{", start);
    let depth = 1;
    while (++i < SRC.length && depth > 0) {
      if (SRC[i] === "{") depth++;
      else if (SRC[i] === "}") depth--;
    }
    const body = SRC.slice(start, i);

    // Must mention the GSD_T_PROJECT_DIR assertion pattern.
    assert.ok(
      /\$GSD_T_PROJECT_DIR/.test(body) &&
        /pwd/.test(body) &&
        /CWD Invariant/i.test(body),
      "_spawnWorker prompt must tell the worker to compare pwd against " +
        "$GSD_T_PROJECT_DIR under a 'CWD Invariant' header (v3.13.11 Bug 2)",
    );

    // Must instruct subshell usage for cd (so a nested `cd` can't escape).
    assert.ok(
      /subshell/i.test(body),
      "_spawnWorker prompt must instruct the worker to scope `cd` inside " +
        "a subshell so a directory change in one Bash call can't contaminate " +
        "the next one",
    );
  });
});

// ─── Bug 3: IS_STALE determinism ──────────────────────────────────────────

describe("v3.13.11 Bug 3 — IS_STALE computed deterministically", () => {
  it("Step 2 node block emits IS_STALE boolean from tickAgeMs > 540000", () => {
    // The computation must live inside the node -e block, not in prose that
    // haiku reads and interprets. Regex is purposely forgiving on whitespace.
    assert.ok(
      /IS_STALE\s*=\s*tickAgeMs\s*!==\s*null\s*&&\s*tickAgeMs\s*>\s*540000/.test(
        WATCH_SRC,
      ),
      "Step 2 node block must contain " +
        "`const IS_STALE = tickAgeMs !== null && tickAgeMs > 540000;` " +
        "so the threshold is computed deterministically (not interpreted " +
        "by haiku at render time).",
    );
    // Must also emit IS_STALE via `out('IS_STALE', ...)` so the caller can
    // consume it mechanically.
    assert.ok(
      /out\(\s*['"]IS_STALE['"]/.test(WATCH_SRC),
      "Step 2 node block must emit IS_STALE via the `out(key, value)` pipe " +
        "so renderers read it verbatim.",
    );
  });

  it("Step 6a renderer references IS_STALE, not the 540 literal", () => {
    // Find Step 6a section body (between '### 6a' and '### 6b').
    const startIdx = WATCH_SRC.indexOf("### 6a");
    const endIdx = WATCH_SRC.indexOf("### 6b", startIdx);
    assert.ok(startIdx >= 0 && endIdx > startIdx, "Step 6a section not found");
    const body = WATCH_SRC.slice(startIdx, endIdx);
    assert.ok(
      /IS_STALE/.test(body),
      "Step 6a must reference IS_STALE (not the raw '540s' literal threshold) " +
        "so haiku's rendering is a pure lookup, not a comparison it might fail",
    );
  });

  it("boundary math: 539s=false, 540s=false, 541s=true", () => {
    // Replicate the exact expression the node block uses.
    const stale = (ms) => ms !== null && ms > 540000;
    assert.equal(stale(539000), false, "539s must be NOT stale");
    assert.equal(stale(540000), false, "exactly 540s must be NOT stale (strict >)");
    assert.equal(stale(540001), true, "540001ms must be stale");
    assert.equal(stale(541000), true, "541s must be stale");
    // Null-guard — tickAgeMs missing → not stale.
    assert.equal(stale(null), false, "null tickAgeMs must be NOT stale");
  });
});
