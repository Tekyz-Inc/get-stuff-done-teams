const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { loadConfig, DEFAULTS } = require("./context-meter-config.cjs");

function makeProject(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmcfg-"));
  fs.mkdirSync(path.join(root, ".gsd-t"), { recursive: true });
  if (config !== undefined) {
    fs.writeFileSync(
      path.join(root, ".gsd-t", "context-meter-config.json"),
      typeof config === "string" ? config : JSON.stringify(config)
    );
  }
  return root;
}

test("missing config file → returns defaults", () => {
  const root = makeProject();
  assert.deepEqual(loadConfig(root), DEFAULTS);
});

test("valid full config → returns exact values", () => {
  const custom = {
    version: 1,
    thresholdPct: 80,
    modelWindowSize: 400000,
    checkFrequency: 10,
    apiKeyEnvVar: "CLAUDE_KEY",
    statePath: ".gsd-t/my-state.json",
    logPath: ".gsd-t/my.log",
    timeoutMs: 5000,
  };
  const root = makeProject(custom);
  assert.deepEqual(loadConfig(root), custom);
});

test("partial config → missing fields filled with defaults", () => {
  const root = makeProject({ thresholdPct: 60, timeoutMs: 1000 });
  const cfg = loadConfig(root);
  assert.equal(cfg.thresholdPct, 60);
  assert.equal(cfg.timeoutMs, 1000);
  assert.equal(cfg.modelWindowSize, DEFAULTS.modelWindowSize);
  assert.equal(cfg.checkFrequency, DEFAULTS.checkFrequency);
  assert.equal(cfg.apiKeyEnvVar, DEFAULTS.apiKeyEnvVar);
});

test("thresholdPct out of range throws", () => {
  for (const bad of [0, 100, -5, 150, "80"]) {
    const root = makeProject({ thresholdPct: bad });
    assert.throws(() => loadConfig(root), /thresholdPct/);
  }
});

test("modelWindowSize <= 0 throws", () => {
  for (const bad of [0, -1, 1.5, "100"]) {
    const root = makeProject({ modelWindowSize: bad });
    assert.throws(() => loadConfig(root), /modelWindowSize/);
  }
});

test("checkFrequency < 1 throws", () => {
  for (const bad of [0, -1, 0.5]) {
    const root = makeProject({ checkFrequency: bad });
    assert.throws(() => loadConfig(root), /checkFrequency/);
  }
});

test("empty apiKeyEnvVar throws", () => {
  const root = makeProject({ apiKeyEnvVar: "" });
  assert.throws(() => loadConfig(root), /apiKeyEnvVar/);
});

test("unknown version throws with migration pointer", () => {
  const root = makeProject({ version: 2, thresholdPct: 75 });
  assert.throws(() => loadConfig(root), /version 2|migration/i);
});

test("config containing an apiKey field is rejected as leak", () => {
  const root = makeProject({ apiKey: "sk-ant-abc123" });
  assert.throws(() => loadConfig(root), /api.?key/i);
});

test("config containing a long hex-like string value is rejected as leak", () => {
  const longHex = "a".repeat(120);
  const root = makeProject({ customField: longHex });
  assert.throws(() => loadConfig(root), /api.?key|token-like/i);
});

test("invalid JSON throws with clear message", () => {
  const root = makeProject("{ not valid json");
  assert.throws(() => loadConfig(root), /invalid JSON/);
});

test("non-object JSON throws", () => {
  const root = makeProject("[1, 2, 3]");
  assert.throws(() => loadConfig(root), /JSON object/);
});
