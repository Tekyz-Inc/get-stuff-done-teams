/**
 * gsd-t-context-meter.e2e.test.js — black-box E2E integration test for M34.
 *
 * TEST-ONLY FILE. Not shipped to users. Does not participate in production
 * require graphs. Spawned as part of `node --test` only.
 *
 * Exercises the real child-process hook as Claude Code would invoke it:
 *
 *   1. A temporary project root is constructed under os.tmpdir() containing:
 *        - .gsd-t/context-meter-config.json (real config loader target)
 *        - transcript.jsonl (minimal Claude-Code-shaped transcript)
 *   2. `node scripts/gsd-t-context-meter.js` is spawned as a child process
 *      with cwd = tempdir.
 *   3. We write the PostToolUse JSON payload to the child's stdin, close
 *      stdin, collect stdout, and assert both the stdout shape and the
 *      on-disk state file.
 *
 * Since v3.12 the context meter uses local token estimation (no API call),
 * so no stub HTTP server is needed. The transcript content determines the
 * estimated token count via chars/3.5 heuristic.
 *
 * @module scripts/gsd-t-context-meter.e2e.test
 */

"use strict";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const HOOK_SCRIPT = path.resolve(__dirname, "gsd-t-context-meter.js");
const HARD_TIMEOUT_MS = 12000;

/* ──────────────────────────── test fixtures ──────────────────────────── */

class Sandbox {
  constructor() {
    this.tempdir = null;
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
   * Write a Claude-Code transcript JSONL with configurable content size.
   * The charCount parameter controls how many characters of text content
   * are in the transcript, which determines the estimated token count.
   */
  writeTranscript(filename = "transcript.jsonl", charCount = 100) {
    const userText = "x".repeat(Math.floor(charCount / 2));
    const assistantText = "y".repeat(Math.ceil(charCount / 2));
    const lines = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: userText },
        uuid: "u1",
        sessionId: "sess-1",
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: assistantText }],
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

  async runHook({ payload, env }) {
    const fullEnv = Object.assign({}, process.env, {});
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
    for (const c of this.childProcs) {
      try {
        if (!c.killed) c.kill("SIGKILL");
      } catch (_) {
        /* ignore */
      }
    }
    this.childProcs = [];

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

test("E2E 1. below threshold — stdout {} and state reflects estimate", async () => {
  // 100 chars of text content → ~29 tokens (100/3.5) → 0.014% of 200K window
  sandbox.writeConfig({ thresholdPct: 75, modelWindowSize: 200000, checkFrequency: 1 });
  const transcriptPath = sandbox.writeTranscript("transcript.jsonl", 100);

  const { stdout, code } = await sandbox.runHook({
    payload: { session_id: "test-below", transcript_path: transcriptPath },
  });

  assert.equal(code, 0, "hook should always exit 0");
  const parsed = JSON.parse(stdout || "{}");
  assert.deepEqual(parsed, {}, "below-threshold stdout must be exactly {}");

  const state = sandbox.readState();
  assert.ok(state, "state file should exist");
  assert.equal(state.version, 1);
  assert.ok(state.inputTokens > 0, "should have estimated some tokens");
  assert.ok(state.inputTokens < 1000, "small transcript should estimate < 1K tokens");
  assert.equal(state.modelWindowSize, 200000);
  assert.ok(state.pct < 1, "pct should be well below threshold");
  assert.equal(state.threshold, "normal");
  assert.equal(state.checkCount, 1);
  assert.equal(state.lastError, null);
  assert.ok(typeof state.timestamp === "string" && state.timestamp.length > 0);
  assert.equal(sandbox.tmpFileExists(), false, "no leftover .tmp file");
});

test("E2E 2. above threshold — stdout additionalContext with large transcript", async () => {
  // 600K chars → ~171K tokens → 85.7% of 200K window → warn band + additionalContext
  sandbox.writeConfig({ thresholdPct: 75, modelWindowSize: 200000, checkFrequency: 1 });
  const transcriptPath = sandbox.writeTranscript("transcript.jsonl", 600000);

  const { stdout, code } = await sandbox.runHook({
    payload: { session_id: "test-above", transcript_path: transcriptPath },
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(stdout || "{}");
  assert.ok(parsed.additionalContext, "must emit additionalContext");
  // v3.12 (M38): additionalContext is a short silent marker, not a MANDATORY STOP banner.
  assert.equal(parsed.additionalContext, "next-spawn-headless:true");
  assert.ok(!/MANDATORY STOP/.test(parsed.additionalContext));
  assert.ok(!/\/user:gsd-t-pause/.test(parsed.additionalContext));

  const state = sandbox.readState();
  assert.ok(state);
  assert.ok(state.inputTokens > 100000, "large transcript should estimate >100K tokens");
  assert.ok(state.pct > 50, "pct should be above threshold");
  assert.equal(state.checkCount, 1);
  assert.equal(state.lastError, null);
  assert.equal(sandbox.tmpFileExists(), false);
});

test("E2E 3. missing transcript — stdout {}, state has parse error", async () => {
  sandbox.writeConfig({ thresholdPct: 75, checkFrequency: 1 });

  const { stdout, code } = await sandbox.runHook({
    payload: {
      session_id: "test-nofile",
      transcript_path: path.join(sandbox.tempdir, "nonexistent.jsonl"),
    },
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(stdout || "{}");
  assert.deepEqual(parsed, {});

  const state = sandbox.readState();
  assert.ok(state);
  assert.equal(state.checkCount, 1);
  assert.ok(state.lastError && typeof state.lastError === "object");
  assert.equal(state.lastError.code, "parse_failure");
});

test("E2E 4. checkFrequency skip — estimation not run, checkCount increments", async () => {
  sandbox.writeConfig({ thresholdPct: 75, checkFrequency: 5 });
  const transcriptPath = sandbox.writeTranscript("transcript.jsonl", 100);
  sandbox.writeState({ checkCount: 3 });

  const { stdout, code } = await sandbox.runHook({
    payload: { session_id: "test-skip", transcript_path: transcriptPath },
  });

  assert.equal(code, 0);
  const parsed = JSON.parse(stdout || "{}");
  assert.deepEqual(parsed, {});

  const state = sandbox.readState();
  assert.ok(state);
  assert.equal(state.checkCount, 4, "counter increments even on skipped turn");
  assert.equal(state.inputTokens, 0);
  assert.equal(sandbox.tmpFileExists(), false);
});
