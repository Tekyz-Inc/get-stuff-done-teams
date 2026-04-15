/**
 * gsd-t-context-meter.e2e.test.js — black-box E2E integration test for M34.
 *
 * TEST-ONLY FILE. Not shipped to users. Does not participate in production
 * require graphs. Spawned as part of `node --test` only.
 *
 * Tasks 1–4 of the context-meter-hook domain unit-tested `runMeter()` via
 * dependency injection. This test exercises the real child-process hook as
 * Claude Code would invoke it:
 *
 *   1. A temporary project root is constructed under os.tmpdir() containing:
 *        - .gsd-t/context-meter-config.json (real config loader target)
 *        - transcript.jsonl (minimal Claude-Code-shaped transcript)
 *   2. A local stub HTTP server mimics POST /v1/messages/count_tokens and
 *      returns a configurable `input_tokens` value.
 *   3. `node scripts/gsd-t-context-meter.js` is spawned as a child process
 *      with cwd = tempdir, NODE_OPTIONS = --require <test-injector>, and
 *      GSD_T_CONTEXT_METER_TEST_BASE_URL pointing at the stub.
 *   4. We write the PostToolUse JSON payload to the child's stdin, close
 *      stdin, collect stdout, and assert both the stdout shape and the
 *      on-disk state file.
 *
 * The test-injector.js file is the single unavoidable bit of test-only
 * infrastructure: the production hook's CLI shim takes no base-URL override
 * (by design — production must not be routable to a non-Anthropic host),
 * so redirecting HTTP in a black-box test requires a --require-level
 * monkey-patch inside the child process. See that file's comment block.
 *
 * Timing budget: each test < 2s, whole suite < 10s. Hard timeouts on every
 * async wait prevent suite hangs on unclosed sockets or child processes.
 *
 * @module scripts/gsd-t-context-meter.e2e.test
 */

"use strict";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const HOOK_SCRIPT = path.resolve(__dirname, "gsd-t-context-meter.js");
const INJECTOR = path.resolve(__dirname, "context-meter", "test-injector.js");
const HARD_TIMEOUT_MS = 12000;

/* ──────────────────────────── test fixtures ──────────────────────────── */

/**
 * Sandbox state for a single test. Holds the tempdir, stub server, and a
 * dispose() that guarantees everything is torn down — even on failure.
 */
class Sandbox {
  constructor() {
    this.tempdir = null;
    this.server = null;
    this.serverUrl = null;
    this.hitCount = 0;
    this.childProcs = [];
  }

  async setup() {
    this.tempdir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-cm-e2e-"));
    fs.mkdirSync(path.join(this.tempdir, ".gsd-t"), { recursive: true });
  }

  writeConfig(config) {
    const full = Object.assign(
      {
        version: 1,
        thresholdPct: 75,
        modelWindowSize: 200000,
        checkFrequency: 1,
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
        statePath: ".gsd-t/.context-meter-state.json",
        logPath: ".gsd-t/context-meter.log",
        timeoutMs: 2000,
      },
      config || {}
    );
    fs.writeFileSync(
      path.join(this.tempdir, ".gsd-t", "context-meter-config.json"),
      JSON.stringify(full, null, 2),
      "utf8"
    );
    return full;
  }

  /**
   * Write a minimal Claude-Code transcript JSONL containing one user turn and
   * one assistant turn — enough for parseTranscript() to return a non-empty
   * messages array.
   */
  writeTranscript(filename = "transcript.jsonl") {
    const lines = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "hello world" },
        uuid: "u1",
        sessionId: "sess-1",
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hi there" }],
          model: "claude-opus-4-6",
        },
        uuid: "a1",
        sessionId: "sess-1",
      }),
    ];
    const p = path.join(this.tempdir, filename);
    fs.writeFileSync(p, lines.join("\n") + "\n", "utf8");
    return p;
  }

  /**
   * Optional: pre-seed the state file so we can test the checkFrequency skip
   * path (where runMeter increments but does not call the API).
   */
  writeState(state) {
    const full = Object.assign(
      {
        version: 1,
        timestamp: null,
        inputTokens: 0,
        modelWindowSize: 0,
        pct: 0,
        threshold: "normal",
        checkCount: 0,
        lastError: null,
      },
      state || {}
    );
    fs.writeFileSync(
      path.join(this.tempdir, ".gsd-t", ".context-meter-state.json"),
      JSON.stringify(full, null, 2),
      "utf8"
    );
  }

  /**
   * Start a local stub HTTP server that responds to every request with the
   * given inputTokens value. Tracks hit count so tests can assert the API
   * was (or was not) called.
   */
  async startStub({ inputTokens }) {
    this.server = http.createServer((req, res) => {
      this.hitCount++;
      // Drain the request body (even though we don't inspect it) so the
      // client sees a clean close.
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ input_tokens: inputTokens }));
      });
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("stub server listen timeout")),
        HARD_TIMEOUT_MS
      );
      this.server.on("error", (err) => {
        clearTimeout(t);
        reject(err);
      });
      this.server.listen(0, "127.0.0.1", () => {
        clearTimeout(t);
        const { port } = this.server.address();
        this.serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  }

  /**
   * Spawn the real hook as a child process, write a payload to stdin, and
   * resolve with { stdout, stderr, code }. Enforces a hard timeout so the
   * test can never hang the suite.
   */
  async runHook({ payload, env }) {
    const fullEnv = Object.assign({}, process.env, {
      ANTHROPIC_API_KEY: "test-key-ignored",
      GSD_T_CONTEXT_METER_TEST_BASE_URL: this.serverUrl || "",
      NODE_OPTIONS: `--require ${INJECTOR}`,
    });
    // Allow caller to override any env (including unsetting ANTHROPIC_API_KEY).
    if (env) {
      for (const [k, v] of Object.entries(env)) {
        if (v === null || v === undefined) {
          delete fullEnv[k];
        } else {
          fullEnv[k] = v;
        }
      }
    }

    const child = spawn(process.execPath, [HOOK_SCRIPT], {
      cwd: this.tempdir,
      env: fullEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.childProcs.push(child);

    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (c) => stdoutChunks.push(c));
    child.stderr.on("data", (c) => stderrChunks.push(c));

    child.stdin.write(JSON.stringify(payload || {}));
    child.stdin.end();

    const result = await new Promise((resolve, reject) => {
      const killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (_) {
          /* ignore */
        }
        reject(new Error(`hook child process timeout after ${HARD_TIMEOUT_MS}ms`));
      }, HARD_TIMEOUT_MS);

      child.on("close", (code) => {
        clearTimeout(killTimer);
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          code,
        });
      });
      child.on("error", (err) => {
        clearTimeout(killTimer);
        reject(err);
      });
    });

    return result;
  }

  readState() {
    const p = path.join(this.tempdir, ".gsd-t", ".context-meter-state.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  }

  stateFileExists() {
    const p = path.join(this.tempdir, ".gsd-t", ".context-meter-state.json");
    return fs.existsSync(p);
  }

  tmpFileExists() {
    const p = path.join(this.tempdir, ".gsd-t", ".context-meter-state.json.tmp");
    return fs.existsSync(p);
  }

  async dispose() {
    // Kill any lingering children first.
    for (const c of this.childProcs) {
      try {
        if (!c.killed) c.kill("SIGKILL");
      } catch (_) {
        /* ignore */
      }
    }
    this.childProcs = [];

    if (this.server) {
      await new Promise((resolve) => {
        try {
          this.server.close(() => resolve());
        } catch (_) {
          resolve();
        }
      });
      this.server = null;
    }

    if (this.tempdir) {
      try {
        fs.rmSync(this.tempdir, { recursive: true, force: true });
      } catch (_) {
        /* ignore */
      }
      this.tempdir = null;
    }
  }
}

/* ──────────────────────────── shared state ──────────────────────────── */

let sandbox;

beforeEach(async () => {
  sandbox = new Sandbox();
  await sandbox.setup();
});

afterEach(async () => {
  if (sandbox) {
    await sandbox.dispose();
    sandbox = null;
  }
});

/* ──────────────────────────── tests ──────────────────────────── */

test("E2E 1. below threshold — stdout {} and state reflects 25%", async () => {
  sandbox.writeConfig({ thresholdPct: 75, modelWindowSize: 200000, checkFrequency: 1 });
  const transcriptPath = sandbox.writeTranscript();
  await sandbox.startStub({ inputTokens: 50000 });

  const { stdout, code } = await sandbox.runHook({
    payload: { session_id: "test-below", transcript_path: transcriptPath },
  });

  assert.equal(code, 0, "hook should always exit 0");
  const parsed = JSON.parse(stdout || "{}");
  assert.deepEqual(parsed, {}, "below-threshold stdout must be exactly {}");

  const state = sandbox.readState();
  assert.ok(state, "state file should exist");
  assert.equal(state.version, 1);
  assert.equal(state.inputTokens, 50000);
  assert.equal(state.modelWindowSize, 200000);
  assert.ok(Math.abs(state.pct - 25) < 0.0001, `pct ${state.pct} should ≈ 25`);
  assert.equal(state.threshold, "normal");
  assert.equal(state.checkCount, 1);
  assert.equal(state.lastError, null);
  assert.ok(typeof state.timestamp === "string" && state.timestamp.length > 0);

  assert.equal(sandbox.tmpFileExists(), false, "no leftover .tmp file");
  assert.equal(sandbox.hitCount, 1, "stub server should have been called exactly once");
});

test("E2E 2. above threshold — stdout additionalContext and state reflects 80%", async () => {
  sandbox.writeConfig({ thresholdPct: 75, modelWindowSize: 200000, checkFrequency: 1 });
  const transcriptPath = sandbox.writeTranscript();
  await sandbox.startStub({ inputTokens: 160000 });

  const { stdout, code } = await sandbox.runHook({
    payload: { session_id: "test-above", transcript_path: transcriptPath },
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(stdout || "{}");
  assert.deepEqual(parsed, {
    additionalContext:
      "⚠️ Context window at 80.0% of 200000. Run /user:gsd-t-pause to checkpoint and clear before continuing.",
  });

  const state = sandbox.readState();
  assert.ok(state);
  assert.equal(state.inputTokens, 160000);
  assert.equal(state.modelWindowSize, 200000);
  assert.ok(Math.abs(state.pct - 80) < 0.0001, `pct ${state.pct} should ≈ 80`);
  // v3.0.0 three-band (M35): 80% ∈ [70, 85) → warn
  assert.equal(state.threshold, "warn");
  assert.equal(state.checkCount, 1);
  assert.equal(state.lastError, null);

  assert.equal(sandbox.tmpFileExists(), false);
  assert.equal(sandbox.hitCount, 1);
});

test("E2E 3. API key missing — stdout {}, state has lastError.code='missing_key'", async () => {
  sandbox.writeConfig({ thresholdPct: 75, checkFrequency: 1 });
  const transcriptPath = sandbox.writeTranscript();
  await sandbox.startStub({ inputTokens: 50000 });

  const { stdout, code } = await sandbox.runHook({
    payload: { session_id: "test-nokey", transcript_path: transcriptPath },
    env: { ANTHROPIC_API_KEY: null }, // explicitly unset
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(stdout || "{}");
  assert.deepEqual(parsed, {});

  const state = sandbox.readState();
  assert.ok(state);
  assert.equal(state.checkCount, 1);
  assert.ok(state.lastError && typeof state.lastError === "object");
  assert.equal(state.lastError.code, "missing_key");

  // API must NOT have been called.
  assert.equal(sandbox.hitCount, 0, "stub server must not be hit when key is missing");
});

test("E2E 4. checkFrequency skip — API not called, checkCount increments", async () => {
  sandbox.writeConfig({ thresholdPct: 75, checkFrequency: 5 });
  const transcriptPath = sandbox.writeTranscript();
  // Pre-seed state so that checkCount goes 3 → 4, which is NOT a multiple of 5.
  sandbox.writeState({ checkCount: 3 });
  await sandbox.startStub({ inputTokens: 50000 });

  const { stdout, code } = await sandbox.runHook({
    payload: { session_id: "test-skip", transcript_path: transcriptPath },
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(stdout || "{}");
  assert.deepEqual(parsed, {});

  const state = sandbox.readState();
  assert.ok(state);
  assert.equal(state.checkCount, 4, "counter increments even on skipped turn");
  // lastError/inputTokens unchanged from seed on skipped turn.
  assert.equal(state.inputTokens, 0);

  assert.equal(sandbox.hitCount, 0, "stub server must not be hit on skipped turn");
  assert.equal(sandbox.tmpFileExists(), false);
});
