"use strict";

/**
 * Unit tests for scripts/gsd-t-context-meter.js (M34 Task 4 — CP2 satisfaction).
 *
 * Covers 10 scenarios from the task spec:
 *   1. check-frequency skip
 *   2. check-frequency hit — under threshold
 *   3. check-frequency hit — over threshold
 *   4. missing API key
 *   5. transcript parse failure
 *   6. API timeout / failure
 *   7. state file corruption
 *   8. missing transcript_path in payload
 *   9. atomic write — no stale .tmp file after success
 *  10. fail-open on unexpected throw (loadConfig throws)
 *
 * All dependencies are injected via runMeter's test seams so no real network
 * calls, no real Anthropic API, and no real config-file reads are needed.
 */

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { runMeter, defaultState } = require("./gsd-t-context-meter");

/* ─────────────────────────── test harness ─────────────────────────── */

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-cm-hook-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
});

function makeConfig(overrides = {}) {
  return {
    version: 1,
    thresholdPct: 75,
    modelWindowSize: 200000,
    checkFrequency: 5,
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    statePath: ".gsd-t/.context-meter-state.json",
    logPath: ".gsd-t/context-meter.log",
    timeoutMs: 2000,
    ...overrides,
  };
}

function stateFile(root) {
  return path.join(root, ".gsd-t", ".context-meter-state.json");
}

function logFile(root) {
  return path.join(root, ".gsd-t", "context-meter.log");
}

function seedState(root, partial) {
  const statePath = stateFile(root);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify({ ...defaultState(), ...partial }, null, 2)
  );
}

function makePayload() {
  // A phony transcript path — tests inject a fake parseTranscript, so the path
  // doesn't actually need to exist.
  return {
    session_id: "test-session",
    transcript_path: path.join(tmpRoot, "fake-transcript.jsonl"),
    tool_name: "Bash",
    tool_input: {},
    tool_response: {},
  };
}

const FAKE_PARSED = {
  system: "",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
};

/* ───────────────────────────── tests ───────────────────────────── */

test("1. check-frequency skip — API NOT called, counter incremented, stdout {}", async () => {
  seedState(tmpRoot, { checkCount: 3 });

  const apiCalls = [];
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig({ checkFrequency: 5 }),
    _parseTranscript: async () => {
      throw new Error("parseTranscript should not be called on skip");
    },
    _countTokens: async () => {
      apiCalls.push("called");
      throw new Error("countTokens should not be called on skip");
    },
  });

  assert.deepEqual(out, {});
  assert.equal(apiCalls.length, 0);
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 4);
  assert.equal(state.lastError, null);
});

test("2. check-frequency hit — under threshold → {} + state updated", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => ({ inputTokens: 10000 }),
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 5);
  assert.equal(state.inputTokens, 10000);
  assert.equal(state.pct, 5);
  assert.equal(state.threshold, "normal");
  assert.equal(state.lastError, null);
  assert.equal(state.modelWindowSize, 200000);
});

test("3. check-frequency hit — over threshold → additionalContext emitted", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => ({ inputTokens: 160000 }),
  });

  assert.equal(typeof out.additionalContext, "string");
  assert.match(out.additionalContext, /80\.0%/);
  assert.match(out.additionalContext, /200000/);
  assert.match(out.additionalContext, /\/user:gsd-t-pause/);

  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 5);
  assert.equal(state.pct, 80);
  // v3.0.0 three-band (M35): 80% ∈ [70, 85) → warn
  assert.equal(state.threshold, "warn");
  assert.equal(state.inputTokens, 160000);
});

test("4. missing API key — stdout {}, lastError.code='missing_key', no API call", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  const apiCalls = [];
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: {}, // no ANTHROPIC_API_KEY
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => {
      apiCalls.push("x");
      return { inputTokens: 1 };
    },
  });

  assert.deepEqual(out, {});
  assert.equal(apiCalls.length, 0);

  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 5);
  assert.ok(state.lastError, "lastError populated");
  assert.equal(state.lastError.code, "missing_key");

  // Log file exists and contains the missing_key diagnostic
  assert.ok(fs.existsSync(logFile(tmpRoot)));
  const log = fs.readFileSync(logFile(tmpRoot), "utf8");
  assert.match(log, /missing_key/);
  // And NEVER the API key itself
  assert.ok(!log.includes("sk-test"));
});

test("5. transcript parse failure — returns null → lastError 'parse_failure'", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => null,
    _countTokens: async () => {
      throw new Error("should not call API when parse fails");
    },
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 5);
  assert.equal(state.lastError.code, "parse_failure");
});

test("6. API timeout / failure — countTokens null → lastError 'api_error', inputTokens reset", async () => {
  seedState(tmpRoot, { checkCount: 4, inputTokens: 99999 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig({ timeoutMs: 50 }),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => null,
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.lastError.code, "api_error");
  // Choice documented in hook: reset inputTokens to 0 on failure to avoid stale
  // readings tripping threshold false-positives.
  assert.equal(state.inputTokens, 0);
  assert.equal(state.pct, 0);
  assert.equal(state.threshold, "normal");
});

test("7. state file corruption — overwritten with valid defaults + fresh count", async () => {
  const sp = stateFile(tmpRoot);
  fs.mkdirSync(path.dirname(sp), { recursive: true });
  fs.writeFileSync(sp, "not json{");

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig({ checkFrequency: 5 }),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => ({ inputTokens: 100 }),
  });

  assert.deepEqual(out, {});
  // Post-write must be valid JSON with defaults + checkCount == 1
  const state = JSON.parse(fs.readFileSync(sp, "utf8"));
  assert.equal(state.version, 1);
  assert.equal(state.checkCount, 1);
  // checkCount=1 % checkFrequency=5 !== 0, so this was a skip path; API not called.
  // Verify API was NOT called on this path by re-running with a throwing stub.
});

test("7b. state file corruption + frequency hit — API called once, state valid", async () => {
  const sp = stateFile(tmpRoot);
  fs.mkdirSync(path.dirname(sp), { recursive: true });
  fs.writeFileSync(sp, "not json{");

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig({ checkFrequency: 1 }),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => ({ inputTokens: 500 }),
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(sp, "utf8"));
  assert.equal(state.version, 1);
  assert.equal(state.checkCount, 1);
  assert.equal(state.inputTokens, 500);
  assert.equal(state.lastError, null);
});

test("8. missing transcript_path in payload — lastError 'no_transcript', counter increments", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  const out = await runMeter({
    payload: { session_id: "x" }, // no transcript_path
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => {
      throw new Error("should not parse when transcript_path missing");
    },
    _countTokens: async () => {
      throw new Error("should not call API when transcript_path missing");
    },
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 5);
  assert.equal(state.lastError.code, "no_transcript");
});

test("9. atomic write — no .tmp file on disk after successful run", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => ({ inputTokens: 1000 }),
  });

  const tmp = stateFile(tmpRoot) + ".tmp";
  assert.equal(fs.existsSync(tmp), false, ".tmp file should not exist after rename");
  assert.equal(fs.existsSync(stateFile(tmpRoot)), true, "state file should exist");
});

test("10. fail-open on unexpected throw — loadConfig throws → runMeter returns {}", async () => {
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => {
      throw new Error("boom");
    },
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => ({ inputTokens: 1 }),
  });

  assert.deepEqual(out, {});
});

test("10b. fail-open — parseTranscript throws synchronously → {}", async () => {
  seedState(tmpRoot, { checkCount: 4 });
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig(),
    _parseTranscript: () => {
      throw new Error("sync boom");
    },
    _countTokens: async () => ({ inputTokens: 1 }),
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.lastError.code, "parse_failure");
});

test("10c. fail-open — countTokens throws → {}", async () => {
  seedState(tmpRoot, { checkCount: 4 });
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: () => {
      throw new Error("sync boom");
    },
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.lastError.code, "api_error");
});

test("11. log never contains message content — only categories/counts", async () => {
  seedState(tmpRoot, { checkCount: 4 });
  const secretText = "SECRET_MESSAGE_CONTENT_XYZ";

  await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => ({
      system: "",
      messages: [
        { role: "user", content: [{ type: "text", text: secretText }] },
      ],
    }),
    _countTokens: async () => ({ inputTokens: 42 }),
  });

  const log = fs.readFileSync(logFile(tmpRoot), "utf8");
  assert.ok(!log.includes(secretText), "log must not contain message content");
  assert.match(log, /measure/);
  assert.match(log, /tokens=42/);
});

test("12. clock injection — timestamp uses injected clock", async () => {
  seedState(tmpRoot, { checkCount: 4 });
  const fixed = new Date("2026-04-14T18:00:00.000Z");

  await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: { ANTHROPIC_API_KEY: "sk-test" },
    clock: () => fixed,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _countTokens: async () => ({ inputTokens: 1000 }),
  });

  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.timestamp, fixed.toISOString());
});
