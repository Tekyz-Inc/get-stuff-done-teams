/**
 * Tests for M36 cross-platform helpers (Task 1).
 *
 * Covers:
 *   - resolveClaudePath (darwin/linux vs win32 branch)
 *   - isAlive (self pid, fake pid, invalid input)
 *   - spawnWorker (success, env passthrough, timeout, ENOENT)
 *
 * For spawnWorker tests we use `node -e "..."` as a harmless shim worker —
 * we never invoke the real claude binary in tests.
 */

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  resolveClaudePath,
  isAlive,
  spawnWorker,
  spawnSupervisor,
  preventSleep,
  releaseSleep,
  notify,
} = require("../bin/gsd-t-unattended-platform.cjs");

// ─── resolveClaudePath ───────────────────────────────────────────────────────

describe("resolveClaudePath", () => {
  it("returns 'claude' on darwin", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    try {
      assert.equal(resolveClaudePath(), "claude");
    } finally {
      Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns 'claude' on linux", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      assert.equal(resolveClaudePath(), "claude");
    } finally {
      Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns 'claude.cmd' on win32", () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      assert.equal(resolveClaudePath(), "claude.cmd");
    } finally {
      Object.defineProperty(process, "platform", orig);
    }
  });
});

// ─── isAlive ─────────────────────────────────────────────────────────────────

describe("isAlive", () => {
  it("returns true for the current process pid", () => {
    assert.equal(isAlive(process.pid), true);
  });

  it("returns false for a pid that almost certainly does not exist", () => {
    // 2^22-1 = 4194303 is well above any default linux/macOS pid_max for
    // typical desktop sessions; if the test host happens to have allocated
    // it the test will be flaky, but that's vanishingly rare.
    assert.equal(isAlive(4194303), false);
  });

  it("returns false for invalid input (zero, negative, non-integer)", () => {
    assert.equal(isAlive(0), false);
    assert.equal(isAlive(-1), false);
    assert.equal(isAlive(1.5), false);
    assert.equal(isAlive("abc"), false);
    assert.equal(isAlive(null), false);
    assert.equal(isAlive(undefined), false);
  });
});

// ─── spawnWorker ─────────────────────────────────────────────────────────────

describe("spawnWorker", () => {
  it("returns stdout from a successful shim worker", () => {
    const result = spawnWorker(process.cwd(), 30000, {
      bin: process.execPath,
      args: ["-e", "console.log('ok')"],
    });
    assert.equal(result.error, null);
    assert.equal(result.status, 0);
    assert.equal(result.timedOut, false);
    assert.match(result.stdout, /ok/);
  });

  it("passes env vars through to the worker", () => {
    const result = spawnWorker(process.cwd(), 30000, {
      bin: process.execPath,
      args: ["-e", "process.stdout.write(process.env.GSD_T_TEST_VAR || 'missing')"],
      env: { ...process.env, GSD_T_TEST_VAR: "hello-from-test" },
    });
    assert.equal(result.error, null);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "hello-from-test");
  });

  it("reports timedOut: true when worker exceeds timeoutMs", () => {
    const result = spawnWorker(process.cwd(), 100, {
      bin: process.execPath,
      // Sleep ~5s; the 100ms timeout should fire first.
      args: ["-e", "setTimeout(() => {}, 5000)"],
    });
    assert.equal(result.timedOut, true);
    assert.equal(result.status, null);
    assert.notEqual(result.signal, null);
  });

  it("returns a non-null error when the binary cannot be launched (ENOENT)", () => {
    const result = spawnWorker(process.cwd(), 5000, {
      bin: "/nonexistent/path/to/definitely-not-a-binary-xyz",
      args: [],
    });
    assert.notEqual(result.error, null);
    assert.equal(result.status, null);
    assert.equal(result.timedOut, false);
  });

  it("captures stderr from the worker", () => {
    const result = spawnWorker(process.cwd(), 30000, {
      bin: process.execPath,
      args: ["-e", "console.error('boom')"],
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /boom/);
  });

  it("invokes onStdoutLine per line as stdout streams (heartbeat path)", async () => {
    const lines = [];
    // Use String.fromCharCode(10) to embed a literal newline in the worker
    // script — escape sequences in the outer JS source would survive into
    // the spawned node -e arg as the two-character string "\\n".
    const NL = "String.fromCharCode(10)";
    const workerScript =
      `process.stdout.write('alpha'+${NL}+'beta'+${NL});` +
      `setTimeout(()=>process.stdout.write('gamma'+${NL}+'trailing'),20)`;
    const result = await spawnWorker(process.cwd(), 30000, {
      bin: process.execPath,
      args: ["-e", workerScript],
      onHeartbeatCheck: () => ({ stale: false }),
      heartbeatPollMs: 60_000,
      onStdoutLine: (line) => lines.push(line),
    });
    assert.equal(result.status, 0);
    assert.deepEqual(lines, ["alpha", "beta", "gamma", "trailing"]);
    assert.equal(result.stdout, "alpha\nbeta\ngamma\ntrailing");
  });
});

// ─── spawnSupervisor ─────────────────────────────────────────────────────────

describe("spawnSupervisor", () => {
  // Build a small shim script that acts as a "fake supervisor": it writes its
  // PID to a file and then exits immediately. We assert the returned PID is
  // a positive integer and that the child was reaped (dead by the time we
  // check, thanks to .unref() + fast exit).
  //
  // spawnSupervisor (.cjs) prepends the "unattended" subcommand before user
  // args, so the shim's argv is [node, shimScript, "unattended", pidFile].
  // The shim reads argv[3] for the pid-file path.
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsdt-spawnsup-"));
  const shimScript = path.join(shimDir, "fake-supervisor.js");
  fs.writeFileSync(
    shimScript,
    // argv: [node, shimScript, "unattended", pidFile]
    "const fs=require('fs');fs.writeFileSync(process.argv[3], String(process.pid));process.exit(0);\n",
  );

  it("returns a positive numeric PID", () => {
    const pidFile = path.join(shimDir, "pid-basic.txt");
    const { pid } = spawnSupervisor({
      binPath: shimScript,
      args: [pidFile],
      cwd: shimDir,
    });
    assert.equal(typeof pid, "number");
    assert.ok(pid > 0, `expected positive pid, got ${pid}`);
  });

  it("actually executes the supervisor script (writes expected artifact)", async () => {
    const pidFile = path.join(shimDir, "pid-artifact.txt");
    spawnSupervisor({
      binPath: shimScript,
      args: [pidFile],
      cwd: shimDir,
    });
    // Poll briefly for the file to appear — the detached child runs async.
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !fs.existsSync(pidFile)) {
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(
      fs.existsSync(pidFile),
      "fake supervisor should have written pid file",
    );
    const childPid = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
    assert.ok(Number.isInteger(childPid) && childPid > 0);
  });
});

// ─── preventSleep / releaseSleep ─────────────────────────────────────────────

describe("preventSleep", () => {
  it("on darwin, returns a positive PID for the caffeinate child", (t) => {
    if (process.platform !== "darwin") {
      t.skip("darwin-only");
      return;
    }
    const handle = preventSleep("test reason");
    assert.equal(typeof handle, "number");
    assert.ok(handle > 0);
    // Clean up immediately so we don't leak caffeinate processes.
    releaseSleep(handle);
  });

  it("on non-darwin, returns null", () => {
    // Temporarily spoof platform to linux, call, then to win32, call.
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    try {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      assert.equal(preventSleep("x"), null);
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      assert.equal(preventSleep("x"), null);
    } finally {
      Object.defineProperty(process, "platform", orig);
    }
  });
});

describe("releaseSleep", () => {
  it("tolerates null handle (no-op)", () => {
    // Must not throw.
    releaseSleep(null);
    releaseSleep(undefined);
  });

  it("tolerates invalid handle (zero, negative, non-integer)", () => {
    releaseSleep(0);
    releaseSleep(-1);
    releaseSleep(1.5);
    releaseSleep("abc");
  });

  it("tolerates an already-dead PID", () => {
    // 4194303 is almost certainly not a live PID — see isAlive test.
    releaseSleep(4194303);
  });

  it("kills a live child process and it becomes dead", async () => {
    const { spawn } = require("node:child_process");
    // Long-running sleep child. 30s is plenty for the test.
    const child = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 30000)"], {
      stdio: "ignore",
    });
    child.unref();
    // Sanity: child should be alive.
    assert.equal(isAlive(child.pid), true);
    releaseSleep(child.pid);
    // Give SIGTERM a moment to take effect.
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && isAlive(child.pid)) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(isAlive(child.pid), false);
  });
});

// ─── notify ──────────────────────────────────────────────────────────────────

describe("notify", () => {
  it("does not throw on the current platform", () => {
    // Fire-and-forget: just assert no synchronous throw.
    assert.doesNotThrow(() => notify("gsd-t test", "hello world", "info"));
  });

  it("does not throw when the underlying helper binary is missing", () => {
    // On darwin, osascript always exists — so we spoof the platform to linux
    // (notify-send almost certainly missing on a dev macOS) and verify no
    // synchronous throw. The asynchronous 'error' event is handled internally.
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    try {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      assert.doesNotThrow(() => notify("gsd-t test", "linux-path", "warn"));
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      assert.doesNotThrow(() => notify("gsd-t test", "win32-path", "done"));
    } finally {
      Object.defineProperty(process, "platform", orig);
    }
  });

  it("accepts all documented level values without throwing", () => {
    for (const level of ["info", "warn", "done", "failed", undefined]) {
      assert.doesNotThrow(() => notify("t", "m", level));
    }
  });

  it("tolerates non-string title/message (coerces internally)", () => {
    assert.doesNotThrow(() => notify(null, undefined, "info"));
    assert.doesNotThrow(() => notify(123, { a: 1 }, "warn"));
  });

  it("escapes double-quotes in messages on darwin without throwing", (t) => {
    if (process.platform !== "darwin") {
      t.skip("darwin-only");
      return;
    }
    // Characters that would break naive AppleScript string interpolation.
    assert.doesNotThrow(() =>
      notify('title "with" quotes', 'msg "with" quotes and \\ backslash', "info"),
    );
  });
});
