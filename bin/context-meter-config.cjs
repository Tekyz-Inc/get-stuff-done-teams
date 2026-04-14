/**
 * Context Meter config loader (M34).
 *
 * Reads .gsd-t/context-meter-config.json, merges over defaults, validates,
 * and returns the resolved config. Missing file → defaults. Unknown schema
 * version or API-key leak → throws with a clear message.
 *
 * See .gsd-t/contracts/context-meter-contract.md for the schema, validation
 * rules, and the API-key-never-stored invariant.
 */

const fs = require("fs");
const path = require("path");

const DEFAULTS = Object.freeze({
  version: 1,
  thresholdPct: 75,
  modelWindowSize: 200000,
  checkFrequency: 5,
  apiKeyEnvVar: "ANTHROPIC_API_KEY",
  statePath: ".gsd-t/.context-meter-state.json",
  logPath: ".gsd-t/context-meter.log",
  timeoutMs: 2000,
});

const SUPPORTED_VERSION = 1;
const API_KEY_FIELD_RE = /api.?key/i;
const HEX_LOOKALIKE_RE = /^[a-zA-Z0-9_-]{64,}$/;

function loadConfig(projectRoot) {
  const root = projectRoot || process.cwd();
  const configPath = path.join(root, ".gsd-t", "context-meter-config.json");

  let userConfig = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    try {
      userConfig = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `context-meter-config: invalid JSON in ${configPath}: ${e.message}`
      );
    }
    if (!userConfig || typeof userConfig !== "object" || Array.isArray(userConfig)) {
      throw new Error(`context-meter-config: ${configPath} must contain a JSON object`);
    }
  }

  validateNoKeyLeak(userConfig);

  if (userConfig.version !== undefined && userConfig.version !== SUPPORTED_VERSION) {
    throw new Error(
      `context-meter-config: unsupported schema version ${userConfig.version} ` +
        `(expected ${SUPPORTED_VERSION}). See .gsd-t/contracts/context-meter-contract.md#breaking-changes for migration.`
    );
  }

  const merged = { ...DEFAULTS, ...userConfig, version: SUPPORTED_VERSION };
  validateRanges(merged);
  return merged;
}

function validateNoKeyLeak(obj) {
  for (const key of Object.keys(obj)) {
    if (key === "apiKeyEnvVar") continue;
    if (API_KEY_FIELD_RE.test(key)) {
      throw new Error(
        `context-meter-config: field "${key}" looks like an API key storage field. ` +
          `API keys must only be read from the env var named in apiKeyEnvVar.`
      );
    }
    const val = obj[key];
    if (typeof val === "string" && val.length > 100 && HEX_LOOKALIKE_RE.test(val)) {
      throw new Error(
        `context-meter-config: field "${key}" contains a long token-like string. ` +
          `Do not store API keys in config — use apiKeyEnvVar to name the env var.`
      );
    }
  }
}

function validateRanges(c) {
  const assert = (cond, msg) => { if (!cond) throw new Error(`context-meter-config: ${msg}`); };

  assert(Number.isFinite(c.thresholdPct) && c.thresholdPct > 0 && c.thresholdPct < 100,
    `thresholdPct must be a number in (0, 100), got ${c.thresholdPct}`);
  assert(Number.isInteger(c.modelWindowSize) && c.modelWindowSize > 0,
    `modelWindowSize must be a positive integer, got ${c.modelWindowSize}`);
  assert(Number.isInteger(c.checkFrequency) && c.checkFrequency >= 1,
    `checkFrequency must be an integer >= 1, got ${c.checkFrequency}`);
  assert(typeof c.apiKeyEnvVar === "string" && c.apiKeyEnvVar.length > 0,
    `apiKeyEnvVar must be a non-empty string, got ${JSON.stringify(c.apiKeyEnvVar)}`);
  assert(typeof c.statePath === "string" && c.statePath.length > 0,
    `statePath must be a non-empty string`);
  assert(typeof c.logPath === "string" && c.logPath.length > 0,
    `logPath must be a non-empty string`);
  assert(Number.isInteger(c.timeoutMs) && c.timeoutMs > 0,
    `timeoutMs must be a positive integer, got ${c.timeoutMs}`);
}

module.exports = { loadConfig, DEFAULTS };
