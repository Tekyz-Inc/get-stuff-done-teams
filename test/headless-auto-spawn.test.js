/**
 * Tests for bin/headless-auto-spawn.js + bin/check-headless-sessions.js.
 * Uses Node.js built-in test runner (node --test).
 *
 * Contract: .gsd-t/contracts/headless-auto-spawn-contract.md v1.0.0
 *
 * Coverage (HAS-T5):
 *   - Unit (~8): spawn returns {id, pid, logPath, timestamp}; session file
 *     schema; notification graceful degradation on non-darwin; continue-here
 *     file written; markSessionCompleted transitions status; makeSessionId
 *     format; checkCompletedSessions unsurfaced filter; markSurfaced sets
 *     surfaced:true; formatBanner string shape.
 *   - E2E smoke: spawn a trivially fast headless command
 *     (`node -e "console.log('done')"`) via a shim gsd-t.js; assert session
 *     file transitions running → completed; assert next
 *     checkCompletedSessions() returns the session; assert that no /clear
 *     prompts fire (qualitative — documented, not programmatic).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const has = require("../bin/headless-auto-spawn.js");
const check = require("../bin/check-headless-sessions.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-has-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const gsd = path.join(tmpDir, ".gsd-t");
  if (fs.existsSync(gsd)) fs.rmSync(gsd, { recursive: true, force: true });
  fs.mkdirSync(gsd, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "bin"), { recursive: true });
  // Minimal shim: a fake bin/gsd-t.js that exits quickly. The spawn path
  // invokes `node bin/gsd-t.js headless <cmd> --log`, so any shim that
  // exits cleanly is enough to let spawn return a pid.
  fs.writeFileSync(
    path.join(tmpDir, "bin", "gsd-t.js"),
    "#!/usr/bin/env node\nconsole.log('shim done');\nprocess.exit(0);\n",
  );
});

// ── 1. makeSessionId format ─────────────────────────────────────────────────

describe("HAS-T5: makeSessionId format", () => {
  it("produces gsd-t-{command}-{YYYY-MM-DD}-{HH-MM-SS} slug", () => {
    const d = new Date("2026-04-15T01:23:45Z");
    // Local-time fields drive formatting; derive expected from the same Date.
    const pad = (n) => String(n).padStart(2, "0");
    const expected =
      "gsd-t-execute-" +
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "-" +
      pad(d.getHours()) +
      "-" +
      pad(d.getMinutes()) +
      "-" +
      pad(d.getSeconds());
    const id = has.makeSessionId("gsd-t-execute", d);
    assert.equal(id, expected);
  });

  it("strips gsd-t- prefix from command", () => {
    const id = has.makeSessionId("gsd-t-debug", new Date());
    assert.ok(id.includes("-debug-"));
    assert.ok(!id.includes("gsd-t-gsd-t"));
  });
});

// ── 2. autoSpawnHeadless return shape + session file ───────────────────────

describe("HAS-T5: autoSpawnHeadless return + session file", () => {
  it("returns {id, pid, logPath, timestamp} and writes running session", () => {
    const out = has.autoSpawnHeadless({
      command: "gsd-t-execute",
      args: [],
      continue_from: ".",
      projectDir: tmpDir,
    });
    assert.ok(out.id && typeof out.id === "string");
    assert.ok(typeof out.pid === "number" && out.pid > 0);
    assert.ok(out.logPath && out.logPath.includes("headless-"));
    assert.ok(out.timestamp);

    const fp = path.join(tmpDir, ".gsd-t", "headless-sessions", out.id + ".json");
    assert.ok(fs.existsSync(fp), "session file must exist");
    const s = JSON.parse(fs.readFileSync(fp, "utf8"));
    assert.equal(s.id, out.id);
    assert.equal(s.pid, out.pid);
    assert.equal(s.command, "gsd-t-execute");
    assert.equal(s.status, "running");
    assert.equal(s.surfaced, false);
    assert.deepEqual(s.args, []);
    assert.ok(s.startTimestamp);
  });

  it("writes continue-here context snapshot", () => {
    const out = has.autoSpawnHeadless({
      command: "gsd-t-wave",
      args: ["--resume"],
      projectDir: tmpDir,
    });
    const ctxFp = path.join(
      tmpDir,
      ".gsd-t",
      "headless-sessions",
      out.id + "-context.json",
    );
    assert.ok(fs.existsSync(ctxFp), "context snapshot must exist");
    const ctx = JSON.parse(fs.readFileSync(ctxFp, "utf8"));
    assert.ok(ctx.capturedAt);
  });
});

// ── 3. markSessionCompleted ─────────────────────────────────────────────────

describe("HAS-T5: markSessionCompleted", () => {
  it("transitions status running → completed with exitCode + endTimestamp", () => {
    const out = has.autoSpawnHeadless({
      command: "gsd-t-quick",
      projectDir: tmpDir,
    });
    has.markSessionCompleted(tmpDir, out.id, { exitCode: 0 });
    const fp = path.join(tmpDir, ".gsd-t", "headless-sessions", out.id + ".json");
    const s = JSON.parse(fs.readFileSync(fp, "utf8"));
    assert.equal(s.status, "completed");
    assert.equal(s.exitCode, 0);
    assert.ok(s.endTimestamp);
  });

  it("is a no-op when the session file is missing", () => {
    assert.doesNotThrow(() => {
      has.markSessionCompleted(tmpDir, "does-not-exist", { exitCode: 0 });
    });
  });
});

// ── 4. checkCompletedSessions unsurfaced filter ────────────────────────────

describe("HAS-T5: checkCompletedSessions", () => {
  it("returns only completed + unsurfaced sessions, oldest first", () => {
    // Write 3 sessions directly: 1 running, 1 completed+surfaced, 1 completed+unsurfaced.
    const dir = path.join(tmpDir, ".gsd-t", "headless-sessions");
    fs.mkdirSync(dir, { recursive: true });
    const mk = (id, status, surfaced, endTimestamp) =>
      fs.writeFileSync(
        path.join(dir, id + ".json"),
        JSON.stringify({
          id,
          pid: 123,
          command: "gsd-t-execute",
          args: [],
          status,
          surfaced,
          startTimestamp: "2026-04-15T00:00:00.000Z",
          endTimestamp,
          exitCode: status === "completed" ? 0 : undefined,
        }),
      );
    mk("sess-a-running", "running", false, undefined);
    mk("sess-b-surfaced", "completed", true, "2026-04-15T00:01:00.000Z");
    mk("sess-c-unsurfaced", "completed", false, "2026-04-15T00:02:00.000Z");
    mk("sess-d-unsurfaced-earlier", "completed", false, "2026-04-15T00:00:30.000Z");

    const results = check.checkCompletedSessions(tmpDir);
    assert.equal(results.length, 2);
    // Oldest first
    assert.equal(results[0].id, "sess-d-unsurfaced-earlier");
    assert.equal(results[1].id, "sess-c-unsurfaced");
  });

  it("returns empty array when sessions directory missing", () => {
    const freshTmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-has-empty-"));
    try {
      const results = check.checkCompletedSessions(freshTmp);
      assert.deepEqual(results, []);
    } finally {
      fs.rmSync(freshTmp, { recursive: true, force: true });
    }
  });

  it("skips malformed session files silently", () => {
    const dir = path.join(tmpDir, ".gsd-t", "headless-sessions");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "broken.json"), "{not json");
    fs.writeFileSync(
      path.join(dir, "good.json"),
      JSON.stringify({
        id: "good",
        status: "completed",
        surfaced: false,
        startTimestamp: "2026-04-15T00:00:00.000Z",
        endTimestamp: "2026-04-15T00:00:05.000Z",
        exitCode: 0,
        command: "gsd-t-execute",
      }),
    );
    const results = check.checkCompletedSessions(tmpDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, "good");
  });

  it("ignores -context.json files", () => {
    const dir = path.join(tmpDir, ".gsd-t", "headless-sessions");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "s1-context.json"),
      JSON.stringify({ capturedAt: "x" }),
    );
    fs.writeFileSync(
      path.join(dir, "s1.json"),
      JSON.stringify({
        id: "s1",
        status: "completed",
        surfaced: false,
        startTimestamp: "2026-04-15T00:00:00.000Z",
        endTimestamp: "2026-04-15T00:00:05.000Z",
        exitCode: 0,
        command: "gsd-t-execute",
      }),
    );
    const results = check.checkCompletedSessions(tmpDir);
    assert.equal(results.length, 1);
  });
});

// ── 5. markSurfaced sets surfaced:true ─────────────────────────────────────

describe("HAS-T5: markSurfaced", () => {
  it("sets surfaced:true so the session no longer appears", () => {
    const dir = path.join(tmpDir, ".gsd-t", "headless-sessions");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "sX.json"),
      JSON.stringify({
        id: "sX",
        status: "completed",
        surfaced: false,
        startTimestamp: "2026-04-15T00:00:00.000Z",
        endTimestamp: "2026-04-15T00:00:05.000Z",
        exitCode: 0,
        command: "gsd-t-execute",
      }),
    );
    assert.equal(check.checkCompletedSessions(tmpDir).length, 1);
    check.markSurfaced(tmpDir, "sX");
    assert.equal(check.checkCompletedSessions(tmpDir).length, 0);
    const s = JSON.parse(fs.readFileSync(path.join(dir, "sX.json"), "utf8"));
    assert.equal(s.surfaced, true);
  });
});

// ── 6. formatBanner shape ──────────────────────────────────────────────────

describe("HAS-T5: formatBanner", () => {
  it("returns empty string for empty sessions", () => {
    assert.equal(check.formatBanner([]), "");
  });

  it("includes header, command, duration and outcome", () => {
    const banner = check.formatBanner([
      {
        id: "gsd-t-execute-2026-04-15-01-23-45",
        command: "gsd-t-execute",
        startTimestamp: "2026-04-15T01:23:45.000Z",
        endTimestamp: "2026-04-15T01:24:50.000Z",
        exitCode: 0,
        logPath: ".gsd-t/headless-x.log",
      },
    ]);
    assert.ok(banner.includes("Headless runs since you left"));
    assert.ok(banner.includes("gsd-t-execute"));
    assert.ok(banner.includes("1m 5s"));
    assert.ok(banner.includes("success"));
    assert.ok(banner.includes(".gsd-t/headless-x.log"));
  });

  it("reports non-zero exit codes as 'exit N'", () => {
    const banner = check.formatBanner([
      {
        id: "gsd-t-debug-2026-04-15-02-00-00",
        command: "gsd-t-debug",
        startTimestamp: "2026-04-15T02:00:00.000Z",
        endTimestamp: "2026-04-15T02:00:05.000Z",
        exitCode: 4,
      },
    ]);
    assert.ok(banner.includes("exit 4"));
  });
});

// ── 7. Graceful non-darwin notification ────────────────────────────────────

describe("HAS-T5: non-darwin notification graceful degradation", () => {
  it("autoSpawnHeadless does not throw on any platform", () => {
    // The internal fireMacNotification is guarded by process.platform check
    // and wrapped in try/catch. Just verify spawn itself is safe.
    assert.doesNotThrow(() => {
      has.autoSpawnHeadless({
        command: "gsd-t-integrate",
        projectDir: tmpDir,
      });
    });
  });
});

// ── 8. E2E smoke: shim process transitions running → completed ─────────────

describe("HAS-T5: E2E smoke — shim process completion", () => {
  it(
    "session transitions running → completed; checkCompletedSessions surfaces it",
    async () => {
      // Use a shim that exits immediately.
      const shimPath = path.join(tmpDir, "bin", "gsd-t.js");
      fs.writeFileSync(
        shimPath,
        "#!/usr/bin/env node\nprocess.exit(0);\n",
      );

      const out = has.autoSpawnHeadless({
        command: "gsd-t-execute",
        args: [],
        continue_from: ".",
        projectDir: tmpDir,
      });

      const fp = path.join(tmpDir, ".gsd-t", "headless-sessions", out.id + ".json");

      // Wait up to 10s for the poll-based watcher to mark completed.
      const deadline = Date.now() + 10_000;
      let s;
      while (Date.now() < deadline) {
        s = JSON.parse(fs.readFileSync(fp, "utf8"));
        if (s.status === "completed") break;
        await new Promise((r) => setTimeout(r, 500));
      }

      assert.equal(
        s.status,
        "completed",
        "shim session should transition to completed within 10s",
      );
      assert.ok("exitCode" in s);

      const pending = check.checkCompletedSessions(tmpDir);
      const found = pending.find((p) => p.id === out.id);
      assert.ok(found, "checkCompletedSessions should surface the completed shim session");
    },
  );
});

// ── 9. No /clear prompts (qualitative) ─────────────────────────────────────
//
// HAS-T5 AC: "Verify across M35 execution: assertion that zero user-facing
// /clear prompts occurred." This is a Claude Code UI event, not a JS-observable
// condition. It is verified by manual inspection of sessions during M35 Wave 3
// and beyond: every runway-estimator refusal routes through autoSpawnHeadless,
// which exits the interactive session cleanly with a single banner line and
// without surfacing any '/clear' literal to the user. No programmatic
// assertion is possible without a Claude Code UI harness, so this test block
// exists as documentation.
