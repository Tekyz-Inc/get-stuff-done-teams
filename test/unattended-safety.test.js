/**
 * Tests for bin/gsd-t-unattended-safety.js (Task 1 — branch + worktree + config).
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.0.0
 *   §5  — exit codes (2/7/8)
 *   §13 — DEFAULTS shape
 *
 * Coverage:
 *   - DEFAULTS shape matches contract §13
 *   - loadConfig: missing file → DEFAULTS, custom override merge, malformed JSON throws
 *   - checkGitBranch: protected (main), protected via glob (release/x), allowed
 *     (feature branch), detached HEAD refused
 *   - checkWorktreeCleanliness: clean tree allowed, whitelisted-only dirty
 *     allowed, non-whitelisted dirty refused, git failure fails closed
 *   - glob helper: matches multiple files, escapes regex metachars
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const safety = require("../bin/gsd-t-unattended-safety.js");

let rootTmp;

before(() => {
  rootTmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-safety-test-"));
});

after(() => {
  fs.rmSync(rootTmp, { recursive: true, force: true });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

let projectCounter = 0;
function freshProject() {
  projectCounter += 1;
  const dir = path.join(rootTmp, `proj-${projectCounter}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function git(dir, args) {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed in ${dir}: ${r.stderr || r.stdout}`,
    );
  }
  return r.stdout;
}

function initRepo(dir, branch) {
  // Use -c to force a deterministic initial branch name regardless of the
  // host's `init.defaultBranch` setting.
  spawnSync(
    "git",
    ["-c", `init.defaultBranch=${branch || "main"}`, "init", "-q"],
    { cwd: dir },
  );
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  // Seed with one commit so HEAD is valid and `git status` is happy.
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
  git(dir, ["add", "README.md"]);
  git(dir, ["commit", "-q", "-m", "seed"]);
  // Force the branch name in case `init.defaultBranch` was ignored on older git.
  const cur = git(dir, ["branch", "--show-current"]).trim();
  if (cur !== (branch || "main")) {
    git(dir, ["branch", "-m", branch || "main"]);
  }
}

function writeConfig(dir, obj) {
  const cfgDir = path.join(dir, ".gsd-t", ".unattended");
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, "config.json"), JSON.stringify(obj));
}

// ── 1. DEFAULTS shape matches contract §13 ─────────────────────────────────

describe("safety-T1: DEFAULTS shape", () => {
  it("exposes every field documented in contract §13 with correct types", () => {
    const d = safety.DEFAULTS;
    assert.ok(Array.isArray(d.protectedBranches));
    assert.ok(Array.isArray(d.dirtyTreeWhitelist));
    assert.equal(typeof d.maxIterations, "number");
    assert.equal(typeof d.hours, "number");
    assert.equal(typeof d.gutterNoProgressIters, "number");
    assert.equal(typeof d.workerTimeoutMs, "number");

    // Concrete contract values.
    assert.equal(d.maxIterations, 200);
    assert.equal(d.hours, 24);
    assert.equal(d.workerTimeoutMs, 3600000);
    assert.equal(d.gutterNoProgressIters, 5);

    // Branch list MUST include the canonical six.
    for (const b of ["main", "master", "develop", "trunk", "release/*", "hotfix/*"]) {
      assert.ok(
        d.protectedBranches.includes(b),
        `protectedBranches missing '${b}'`,
      );
    }

    // Whitelist MUST include the supervisor-runtime patterns.
    for (const w of [
      ".gsd-t/events/*.jsonl",
      ".gsd-t/.unattended/*",
      ".gsd-t/.handoff/*",
      ".gsd-t/token-log.md",
      ".gsd-t/.context-meter-state.json",
    ]) {
      assert.ok(
        d.dirtyTreeWhitelist.includes(w),
        `dirtyTreeWhitelist missing '${w}'`,
      );
    }
  });

  it("DEFAULTS is frozen (mutations are silently ignored)", () => {
    // In non-strict mode Object.freeze swallows the assignment without
    // throwing — the contract is that the value never actually changes.
    try {
      safety.DEFAULTS.maxIterations = 999;
    } catch (_) {
      /* strict-mode environments throw, which is also fine */
    }
    assert.equal(safety.DEFAULTS.maxIterations, 200);
    assert.ok(Object.isFrozen(safety.DEFAULTS));
  });
});

// ── 2. loadConfig ──────────────────────────────────────────────────────────

describe("safety-T1: loadConfig", () => {
  it("returns DEFAULTS clone when config file is missing", () => {
    const dir = freshProject();
    const cfg = safety.loadConfig(dir);
    assert.equal(cfg.maxIterations, 200);
    assert.equal(cfg.hours, 24);
    assert.equal(cfg.gutterNoProgressIters, 5);
    assert.deepEqual(
      cfg.protectedBranches.slice().sort(),
      safety.DEFAULTS.protectedBranches.slice().sort(),
    );
    // Must be a clone — mutation should not affect DEFAULTS.
    cfg.maxIterations = 1;
    assert.equal(safety.DEFAULTS.maxIterations, 200);
  });

  it("merges custom values over DEFAULTS field-by-field", () => {
    const dir = freshProject();
    writeConfig(dir, {
      maxIterations: 50,
      hours: 6,
      protectedBranches: ["main", "staging"],
    });
    const cfg = safety.loadConfig(dir);
    assert.equal(cfg.maxIterations, 50);
    assert.equal(cfg.hours, 6);
    assert.deepEqual(cfg.protectedBranches, ["main", "staging"]);
    // Untouched fields fall back to defaults.
    assert.equal(cfg.workerTimeoutMs, 3600000);
    assert.equal(cfg.gutterNoProgressIters, 5);
    assert.deepEqual(cfg.dirtyTreeWhitelist, safety.DEFAULTS.dirtyTreeWhitelist);
  });

  it("throws a clear error on malformed JSON", () => {
    const dir = freshProject();
    const cfgDir = path.join(dir, ".gsd-t", ".unattended");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, "config.json"), "{not valid json");
    assert.throws(
      () => safety.loadConfig(dir),
      /malformed JSON/,
    );
  });
});

// ── 3. checkGitBranch ──────────────────────────────────────────────────────

describe("safety-T1: checkGitBranch", () => {
  it("refuses 'main' with code 7", () => {
    const dir = freshProject();
    initRepo(dir, "main");
    const r = safety.checkGitBranch(dir);
    assert.equal(r.ok, false);
    assert.equal(r.code, 7);
    assert.equal(r.branch, "main");
    assert.match(r.reason, /protected/);
  });

  it("refuses 'release/2026-04' via glob match with code 7", () => {
    const dir = freshProject();
    initRepo(dir, "main");
    git(dir, ["checkout", "-q", "-b", "release/2026-04"]);
    const r = safety.checkGitBranch(dir);
    assert.equal(r.ok, false);
    assert.equal(r.code, 7);
    assert.equal(r.branch, "release/2026-04");
  });

  it("allows a non-protected feature branch", () => {
    const dir = freshProject();
    initRepo(dir, "main");
    git(dir, ["checkout", "-q", "-b", "feature/safety-rails"]);
    const r = safety.checkGitBranch(dir);
    assert.equal(r.ok, true);
    assert.equal(r.branch, "feature/safety-rails");
  });

  it("refuses detached HEAD with code 7", () => {
    const dir = freshProject();
    initRepo(dir, "main");
    git(dir, ["checkout", "-q", "--detach", "HEAD"]);
    const r = safety.checkGitBranch(dir);
    assert.equal(r.ok, false);
    assert.equal(r.code, 7);
    assert.match(r.reason, /detached/i);
  });

  it("respects custom protectedBranches from config", () => {
    const dir = freshProject();
    initRepo(dir, "trunk-replacement");
    writeConfig(dir, { protectedBranches: ["trunk-replacement"] });
    const r = safety.checkGitBranch(dir);
    assert.equal(r.ok, false);
    assert.equal(r.code, 7);
    assert.equal(r.branch, "trunk-replacement");
  });
});

// ── 4. checkWorktreeCleanliness ────────────────────────────────────────────

describe("safety-T1: checkWorktreeCleanliness", () => {
  it("allows a clean tree", () => {
    const dir = freshProject();
    initRepo(dir, "feature/clean");
    const r = safety.checkWorktreeCleanliness(dir);
    assert.equal(r.ok, true);
  });

  it("allows whitelisted-only dirty files (events + handoff)", () => {
    const dir = freshProject();
    initRepo(dir, "feature/wl");
    fs.mkdirSync(path.join(dir, ".gsd-t", "events"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".gsd-t", "events", "2026-04-15.jsonl"),
      "{}\n",
    );
    fs.mkdirSync(path.join(dir, ".gsd-t", ".handoff"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".gsd-t", ".handoff", "lock.json"),
      "{}\n",
    );
    fs.writeFileSync(
      path.join(dir, ".gsd-t", "token-log.md"),
      "# log\n",
    );
    const r = safety.checkWorktreeCleanliness(dir);
    assert.equal(
      r.ok,
      true,
      `expected ok=true; got reason: ${r.reason || ""}`,
    );
  });

  it("refuses non-whitelisted dirty files with code 8", () => {
    const dir = freshProject();
    initRepo(dir, "feature/dirty");
    fs.writeFileSync(path.join(dir, "src.js"), "// hand work\n");
    fs.writeFileSync(path.join(dir, "other.txt"), "x\n");
    const r = safety.checkWorktreeCleanliness(dir);
    assert.equal(r.ok, false);
    assert.equal(r.code, 8);
    assert.ok(Array.isArray(r.dirtyFiles));
    assert.ok(r.dirtyFiles.includes("src.js"));
    assert.ok(r.dirtyFiles.includes("other.txt"));
  });

  it("fails closed (code 2) when git is not a repo", () => {
    const dir = freshProject();
    // No git init at all.
    const r = safety.checkWorktreeCleanliness(dir);
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
  });
});

// ── 5. glob helper ─────────────────────────────────────────────────────────

describe("safety-T1: glob helper", () => {
  it("matches multiple files for `.gsd-t/events/*.jsonl`", () => {
    const re = safety._globToRegex(".gsd-t/events/*.jsonl");
    assert.ok(re.test(".gsd-t/events/2026-04-15.jsonl"));
    assert.ok(re.test(".gsd-t/events/test.jsonl"));
    assert.ok(!re.test(".gsd-t/events/sub/x.jsonl")); // single * doesn't cross /
    assert.ok(!re.test(".gsd-t/events/test.txt"));
  });

  it("escapes regex metacharacters in literals", () => {
    const re = safety._globToRegex(".claude/settings.local.json");
    assert.ok(re.test(".claude/settings.local.json"));
    // The dots are literal — must not match arbitrary chars.
    assert.ok(!re.test("Xclaude/settingsXlocalXjson"));
  });

  it("matchesAnyGlob returns true on the first matching pattern", () => {
    assert.ok(
      safety._matchesAnyGlob(".gsd-t/.handoff/lock.json", [
        ".gsd-t/events/*.jsonl",
        ".gsd-t/.handoff/*",
      ]),
    );
    assert.ok(
      !safety._matchesAnyGlob("src/index.ts", [
        ".gsd-t/events/*.jsonl",
        ".gsd-t/.handoff/*",
      ]),
    );
  });
});

// ── Task 2: Loop caps + state validation ───────────────────────────────────
//
// Tests for checkIterationCap, checkWallClockCap, validateState.

function validState(overrides) {
  const base = {
    version: "1.0.0",
    sessionId: "unattended-2026-04-15-1100-a3c7",
    projectDir: "/tmp/example",
    status: "running",
    milestone: "M36",
    iter: 5,
    maxIterations: 200,
    startedAt: "2026-04-15T11:00:00Z",
    lastTick: "2026-04-15T14:30:00Z",
    hours: 24,
    wallClockElapsedMs: 12600000,
    supervisorPid: 54321,
    logPath: ".gsd-t/.unattended/run.log",
    platform: "darwin",
    claudeBin: "/usr/local/bin/claude",
  };
  return Object.assign(base, overrides || {});
}

describe("safety-T2: checkIterationCap", () => {
  it("returns ok=true when iter is well below cap", () => {
    const r = safety.checkIterationCap(validState({ iter: 10, maxIterations: 200 }));
    assert.equal(r.ok, true);
  });

  it("returns ok=false with code 6 when iter >= DEFAULTS cap", () => {
    // DEFAULTS.maxIterations = 200 takes precedence over state's 999.
    const r = safety.checkIterationCap(
      validState({ iter: 200, maxIterations: 999 }),
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.equal(r.iter, 200);
    assert.equal(r.maxIterations, 200);
    assert.match(r.reason, /iteration cap exceeded/);
  });

  it("config.maxIterations overrides DEFAULTS", () => {
    const r = safety.checkIterationCap(
      validState({ iter: 50, maxIterations: 999 }),
      { maxIterations: 50 },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.equal(r.maxIterations, 50);
  });

  it("config.maxIterations set higher allows iteration past DEFAULTS", () => {
    const r = safety.checkIterationCap(
      validState({ iter: 250, maxIterations: 300 }),
      { maxIterations: 500 },
    );
    assert.equal(r.ok, true);
  });

  it("missing state.iter is treated as 0", () => {
    // We explicitly omit iter — it should be treated as 0 (< 200 default).
    const s = validState();
    delete s.iter;
    const r = safety.checkIterationCap(s);
    assert.equal(r.ok, true);
  });
});

describe("safety-T2: checkWallClockCap", () => {
  it("returns ok=true when elapsed is well below 24h default", () => {
    const r = safety.checkWallClockCap(
      validState({ wallClockElapsedMs: 60 * 60 * 1000 }), // 1 hour
    );
    assert.equal(r.ok, true);
  });

  it("returns ok=false with code 6 at exact 24h boundary", () => {
    const r = safety.checkWallClockCap(
      validState({ wallClockElapsedMs: 24 * 60 * 60 * 1000 }),
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.equal(r.elapsedMs, 86400000);
    assert.equal(r.capMs, 86400000);
    assert.match(r.reason, /wall-clock cap exceeded/);
  });

  it("honors config.hours override (shorter cap)", () => {
    const r = safety.checkWallClockCap(
      validState({ wallClockElapsedMs: 2 * 60 * 60 * 1000 }), // 2 hours
      { hours: 1 },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.equal(r.capMs, 3600000);
  });

  it("honors config.hours override (longer cap)", () => {
    const r = safety.checkWallClockCap(
      validState({ wallClockElapsedMs: 30 * 60 * 60 * 1000 }), // 30 hours
      { hours: 48 },
    );
    assert.equal(r.ok, true);
  });
});

describe("safety-T2: validateState", () => {
  it("accepts a complete valid state", () => {
    const r = safety.validateState(validState());
    assert.equal(r.ok, true);
  });

  it("rejects a missing required field", () => {
    const s = validState();
    delete s.sessionId;
    const r = safety.validateState(s);
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.equal(r.reason, "state-validation-failed");
    assert.ok(Array.isArray(r.errors));
    assert.ok(
      r.errors.some((e) => /sessionId.*missing/.test(e)),
      `expected sessionId missing error; got: ${r.errors.join(" | ")}`,
    );
  });

  it("rejects iter when it's a string instead of integer", () => {
    const r = safety.validateState(validState({ iter: "5" }));
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.ok(
      r.errors.some((e) => /^iter:/.test(e)),
      `expected iter type error; got: ${r.errors.join(" | ")}`,
    );
  });

  it("rejects invalid status enum value", () => {
    const r = safety.validateState(validState({ status: "chilling" }));
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.ok(
      r.errors.some((e) => /status:.*invalid enum/.test(e)),
      `expected status enum error; got: ${r.errors.join(" | ")}`,
    );
  });

  it("accepts every valid status enum value", () => {
    for (const status of [
      "initializing",
      "running",
      "done",
      "failed",
      "stopped",
      "crashed",
    ]) {
      const r = safety.validateState(validState({ status }));
      assert.equal(
        r.ok,
        true,
        `status='${status}' should be valid; got errors: ${JSON.stringify(r.errors)}`,
      );
    }
  });

  it("rejects invalid platform enum value", () => {
    const r = safety.validateState(validState({ platform: "solaris" }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /platform:.*invalid enum/.test(e)));
  });

  it("rejects non-object state (null)", () => {
    const r = safety.validateState(null);
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
  });

  it("rejects negative iter", () => {
    const r = safety.validateState(validState({ iter: -1 }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /iter:.*>= 0/.test(e)));
  });

  it("aggregates multiple errors across fields", () => {
    const s = validState();
    delete s.milestone;
    s.status = "flailing";
    s.iter = "not a number";
    const r = safety.validateState(s);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length >= 3);
  });
});

// ── Task 3: detectGutter ────────────────────────────────────────────────────

describe("detectGutter — repeated-error pattern", () => {
  it("returns ok on a clean multi-iter tail with no errors", () => {
    const tail = [
      "--- ITER 1 ---",
      "Edit(file_path='a.js')",
      "tests passing",
      "--- ITER 2 ---",
      "Write(file_path='b.js')",
      "integration ok",
      "--- ITER 3 ---",
      "Edit(file_path='c.js')",
      "all green",
    ].join("\n");
    const r = safety.detectGutter({ iter: 3 }, tail);
    assert.equal(r.ok, true);
  });

  it("flags 3 consecutive iters with the same error signature", () => {
    const tail = [
      "--- ITER 5 ---",
      "Edit(file_path='foo.js')",
      "Error: cannot find module 'bar' at line 42",
      "--- ITER 6 ---",
      "Edit(file_path='foo.js')",
      "Error: cannot find module 'bar' at line 42",
      "--- ITER 7 ---",
      "Edit(file_path='foo.js')",
      "Error: cannot find module 'bar' at line 42",
    ].join("\n");
    const r = safety.detectGutter({ iter: 7 }, tail);
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.equal(r.reason, "gutter-detected");
    assert.equal(r.pattern, "repeated-error");
    assert.ok(r.details.signature);
    assert.deepEqual(r.details.iters, [5, 6, 7]);
  });

  it("normalizes error signatures — different line numbers still match", () => {
    const tail = [
      "--- ITER 1 ---",
      "Error: TypeError at module/thing.js:10",
      "--- ITER 2 ---",
      "Error: TypeError at module/thing.js:42",
      "--- ITER 3 ---",
      "Error: TypeError at module/thing.js:99",
    ].join("\n");
    const r = safety.detectGutter({ iter: 3 }, tail);
    assert.equal(r.ok, false);
    assert.equal(r.pattern, "repeated-error");
  });

  it("does not flag when errors differ across iters", () => {
    const tail = [
      "--- ITER 1 ---",
      "Error: syntax error",
      "--- ITER 2 ---",
      "Error: missing import",
      "--- ITER 3 ---",
      "Error: test failure",
    ].join("\n");
    const r = safety.detectGutter({ iter: 3 }, tail);
    // Different signatures — repeated-error should not fire. It may also be
    // clean of other patterns (no thrash, no progress-hash history).
    assert.equal(r.ok, true);
  });

  it("does not flag below the threshold (only 2 iter blocks)", () => {
    const tail = [
      "--- ITER 1 ---",
      "Error: same thing",
      "--- ITER 2 ---",
      "Error: same thing",
    ].join("\n");
    const r = safety.detectGutter({ iter: 2 }, tail);
    assert.equal(r.ok, true);
  });

  it("respects custom gutterThreshold", () => {
    const tail = [
      "--- ITER 1 ---",
      "Error: boom",
      "--- ITER 2 ---",
      "Error: boom",
    ].join("\n");
    // With threshold=2, 2 consecutive same errors should fire.
    const r = safety.detectGutter({ iter: 2 }, tail, { gutterThreshold: 2 });
    assert.equal(r.ok, false);
    assert.equal(r.pattern, "repeated-error");
  });
});

describe("detectGutter — file-thrash pattern", () => {
  it("flags the same file being edited across 3 iters dominantly", () => {
    const tail = [
      "--- ITER 1 ---",
      "Edit(file_path='src/foo.js')",
      "--- ITER 2 ---",
      "Edit(file_path='src/foo.js')",
      "--- ITER 3 ---",
      "Write(file_path='src/foo.js')",
    ].join("\n");
    const r = safety.detectGutter({ iter: 3 }, tail);
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.equal(r.pattern, "file-thrash");
    assert.ok(r.details.files.includes("src/foo.js"));
  });

  it("does not flag healthy multi-file churn", () => {
    const tail = [
      "--- ITER 1 ---",
      "Edit(file_path='src/a.js')",
      "Edit(file_path='src/b.js')",
      "--- ITER 2 ---",
      "Edit(file_path='src/c.js')",
      "Edit(file_path='src/d.js')",
      "--- ITER 3 ---",
      "Edit(file_path='src/e.js')",
      "Edit(file_path='src/f.js')",
    ].join("\n");
    const r = safety.detectGutter({ iter: 3 }, tail);
    assert.equal(r.ok, true);
  });
});

describe("detectGutter — no-progress pattern", () => {
  it("flags when progressHashHistory shows 5 unchanged iters", () => {
    const state = {
      iter: 10,
      progressHash: "abc123",
      progressHashHistory: ["abc123", "abc123", "abc123", "abc123", "abc123"],
    };
    const r = safety.detectGutter(state, "");
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.equal(r.pattern, "no-progress");
    assert.equal(r.details.unchangedHash, "abc123");
    assert.equal(r.details.window, 5);
  });

  it("does not flag when progressHash is changing", () => {
    const state = {
      iter: 10,
      progressHashHistory: ["a", "b", "c", "d", "e"],
    };
    const r = safety.detectGutter(state, "");
    assert.equal(r.ok, true);
  });

  it("skips no-progress when progressHashHistory is absent", () => {
    // Low false-positive design: no history = skip the check, return ok.
    const r = safety.detectGutter({ iter: 100 }, "");
    assert.equal(r.ok, true);
  });

  it("respects custom gutterWindow", () => {
    const state = {
      iter: 3,
      progressHashHistory: ["x", "x", "x"],
    };
    const r = safety.detectGutter(state, "", { gutterWindow: 3 });
    assert.equal(r.ok, false);
    assert.equal(r.pattern, "no-progress");
    assert.equal(r.details.window, 3);
  });

  it("handles gutterNoProgressIters alias from contract §13", () => {
    const state = {
      iter: 4,
      progressHashHistory: ["h", "h", "h", "h"],
    };
    const r = safety.detectGutter(state, "", { gutterNoProgressIters: 4 });
    assert.equal(r.ok, false);
    assert.equal(r.pattern, "no-progress");
  });
});

describe("detectGutter — edge cases", () => {
  it("returns ok on empty tail with no state history", () => {
    const r = safety.detectGutter({ iter: 0 }, "");
    assert.equal(r.ok, true);
  });

  it("returns ok on null tail", () => {
    const r = safety.detectGutter({ iter: 0 }, null);
    assert.equal(r.ok, true);
  });

  it("returns ok on tail with no iter headers", () => {
    const r = safety.detectGutter(
      { iter: 5 },
      "some random worker output with no markers\nmore lines",
    );
    assert.equal(r.ok, true);
  });
});

// ── Task 3: detectBlockerSentinel ──────────────────────────────────────────

describe("detectBlockerSentinel", () => {
  it("returns ok on normal worker output", () => {
    const tail =
      "Worker finished iteration.\nEdit(file_path='foo.js')\nTests: 42/42 pass\n";
    const r = safety.detectBlockerSentinel(tail);
    assert.equal(r.ok, true);
  });

  it("returns ok on empty tail", () => {
    assert.equal(safety.detectBlockerSentinel("").ok, true);
    assert.equal(safety.detectBlockerSentinel(null).ok, true);
  });

  it("matches 'blocked needs human'", () => {
    const tail = "iter 5:\nBLOCKED NEEDS HUMAN — can't proceed without input\n";
    const r = safety.detectBlockerSentinel(tail);
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.equal(r.reason, "blocker-sentinel-detected");
    assert.ok(/blocked/i.test(r.matchedText));
  });

  it("matches 'blocker: <reason>'", () => {
    const tail =
      "Working on task...\nBlocker: database password required for migration\nHalting.\n";
    const r = safety.detectBlockerSentinel(tail);
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.ok(r.matchedText.toLowerCase().includes("blocker:"));
  });

  it("matches 'destructive action guard'", () => {
    const tail =
      "About to DROP TABLE users.\nDestructive Action Guard: requires user approval.\n";
    const r = safety.detectBlockerSentinel(tail);
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.ok(/destructive/i.test(r.matchedText));
  });

  it("matches 'waiting for user'", () => {
    const tail = "Prompt issued.\nWaiting for user confirmation...\n";
    const r = safety.detectBlockerSentinel(tail);
    assert.equal(r.ok, false);
    assert.equal(r.code, 6);
    assert.ok(/waiting for user/i.test(r.matchedText));
  });

  it("is case-insensitive", () => {
    const tail = "BLOCKED NEEDS HUMAN\n";
    const tail2 = "blocked needs human\n";
    const tail3 = "BlOcKeD NeEdS HuMaN\n";
    assert.equal(safety.detectBlockerSentinel(tail).ok, false);
    assert.equal(safety.detectBlockerSentinel(tail2).ok, false);
    assert.equal(safety.detectBlockerSentinel(tail3).ok, false);
  });

  it("truncates matchedText to 200 chars", () => {
    const long = "blocker: " + "x".repeat(500);
    const r = safety.detectBlockerSentinel(long);
    assert.equal(r.ok, false);
    assert.ok(r.matchedText.length <= 200);
  });
});
