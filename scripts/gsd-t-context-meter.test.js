"use strict";

/**
 * Unit tests for scripts/gsd-t-context-meter.js
 *
 * v3.12 (M38 meter reduction): single-band (normal/threshold) — rewritten
 * from the M34 three-band / dead-meter era. The hook uses local token
 * estimation (no API key, no network) since v3.12, so the old countTokens
 * seam and missing-key tests are retired. The 7 previously stranded TD-102
 * tests are now rewritten against the v1.3.0 invariants.
 *
 * All dependencies are injected via runMeter's test seams — no real file
 * or transcript reads are needed.
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

test("1. check-frequency skip — estimator NOT called, counter incremented, stdout {}", async () => {
  seedState(tmpRoot, { checkCount: 3 });

  const estimateCalls = [];
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig({ checkFrequency: 5 }),
    _parseTranscript: async () => {
      throw new Error("parseTranscript should not be called on skip");
    },
    _estimateTokens: () => {
      estimateCalls.push("called");
      throw new Error("estimateTokens should not be called on skip");
    },
  });

  assert.deepEqual(out, {});
  assert.equal(estimateCalls.length, 0);
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 4);
  assert.equal(state.lastError, null);
});

test("2. check-frequency hit — under threshold → {} + state updated (single-band normal)", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => ({ inputTokens: 10000 }),
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

test("3. check-frequency hit — at/over threshold → silent marker emitted, band='threshold'", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => ({ inputTokens: 160000 }), // 80% > 75%
  });

  // v3.12: additionalContext is a SHORT machine-readable marker, not a STOP banner.
  assert.equal(typeof out.additionalContext, "string");
  assert.equal(out.additionalContext, "next-spawn-headless:true");
  // No user-facing banner strings.
  assert.ok(!/MANDATORY STOP/.test(out.additionalContext));
  assert.ok(!/\/user:gsd-t-pause/.test(out.additionalContext));

  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 5);
  assert.equal(state.pct, 80);
  assert.equal(state.threshold, "threshold");
  assert.equal(state.inputTokens, 160000);
});

test("4. no API key required — local estimator runs without any env setup", async () => {
  // v3.12: estimation is local (no API), so absence of any API key must not
  // affect behavior. This is the inverse of the old "missing_key" test.
  seedState(tmpRoot, { checkCount: 4 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    env: {}, // empty env — no keys of any kind
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => ({ inputTokens: 1000 }),
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 5);
  assert.equal(state.lastError, null);
  assert.equal(state.inputTokens, 1000);
  // Log must never reference missing_key or API keys.
  if (fs.existsSync(logFile(tmpRoot))) {
    const log = fs.readFileSync(logFile(tmpRoot), "utf8");
    assert.ok(!/missing_key/.test(log));
    assert.ok(!/ANTHROPIC_API_KEY/.test(log));
  }
});

test("5. transcript parse failure — returns null → lastError 'parse_failure'", async () => {
  seedState(tmpRoot, { checkCount: 4 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => null,
    _estimateTokens: () => {
      throw new Error("should not estimate when parse fails");
    },
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.checkCount, 5);
  assert.equal(state.lastError.code, "parse_failure");
});

test("6. estimator failure — returns null → lastError 'estimate_error', inputTokens reset", async () => {
  seedState(tmpRoot, { checkCount: 4, inputTokens: 99999 });

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => null,
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.lastError.code, "estimate_error");
  // Reset inputTokens to 0 on failure to avoid stale readings tripping threshold false-positives.
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
    _loadConfig: () => makeConfig({ checkFrequency: 5 }),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => ({ inputTokens: 100 }),
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(sp, "utf8"));
  assert.equal(state.version, 1);
  assert.equal(state.checkCount, 1);
});

test("7b. state file corruption + frequency hit — estimator called once, state valid", async () => {
  const sp = stateFile(tmpRoot);
  fs.mkdirSync(path.dirname(sp), { recursive: true });
  fs.writeFileSync(sp, "not json{");

  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig({ checkFrequency: 1 }),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => ({ inputTokens: 500 }),
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
    payload: { session_id: "x" },
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => {
      throw new Error("should not parse when transcript_path missing");
    },
    _estimateTokens: () => {
      throw new Error("should not estimate when transcript_path missing");
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
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => ({ inputTokens: 1000 }),
  });

  const tmp = stateFile(tmpRoot) + ".tmp";
  assert.equal(fs.existsSync(tmp), false, ".tmp file should not exist after rename");
  assert.equal(fs.existsSync(stateFile(tmpRoot)), true, "state file should exist");
});

test("10. fail-open on unexpected throw — loadConfig throws → runMeter returns {}", async () => {
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => {
      throw new Error("boom");
    },
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => ({ inputTokens: 1 }),
  });

  assert.deepEqual(out, {});
});

test("10b. fail-open — parseTranscript throws synchronously → {}", async () => {
  seedState(tmpRoot, { checkCount: 4 });
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig(),
    _parseTranscript: () => {
      throw new Error("sync boom");
    },
    _estimateTokens: () => ({ inputTokens: 1 }),
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.lastError.code, "parse_failure");
});

test("10c. fail-open — estimateTokens throws → {} + lastError='estimate_error'", async () => {
  seedState(tmpRoot, { checkCount: 4 });
  const out = await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => {
      throw new Error("sync boom");
    },
  });

  assert.deepEqual(out, {});
  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.lastError.code, "estimate_error");
});

test("11. log never contains message content — only categories/counts", async () => {
  seedState(tmpRoot, { checkCount: 4 });
  const secretText = "SECRET_MESSAGE_CONTENT_XYZ";

  await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => ({
      system: "",
      messages: [
        { role: "user", content: [{ type: "text", text: secretText }] },
      ],
    }),
    _estimateTokens: () => ({ inputTokens: 42 }),
  });

  const log = fs.readFileSync(logFile(tmpRoot), "utf8");
  assert.ok(!log.includes(secretText), "log must not contain message content");
  assert.match(log, /measure/);
  assert.match(log, /tokens=42/);
});

test("12. clock injection — timestamp uses injected clock", async () => {
  seedState(tmpRoot, { checkCount: 4 });
  const fixed = new Date("2026-04-16T18:00:00.000Z");

  await runMeter({
    payload: makePayload(),
    projectRoot: tmpRoot,
    clock: () => fixed,
    _loadConfig: () => makeConfig(),
    _parseTranscript: async () => FAKE_PARSED,
    _estimateTokens: () => ({ inputTokens: 1000 }),
  });

  const state = JSON.parse(fs.readFileSync(stateFile(tmpRoot), "utf8"));
  assert.equal(state.timestamp, fixed.toISOString());
});
