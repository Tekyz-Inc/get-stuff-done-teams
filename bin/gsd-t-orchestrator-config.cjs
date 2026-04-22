'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  maxParallel: 10,
  workerTimeoutMs: 270000,
  retryOnFail: true,
  haltOnSecondFail: true
});

const MAX_PARALLEL_CEILING = 15;

function loadConfigFile(projectDir) {
  const p = path.join(projectDir, '.gsd-t', 'orchestrator.config.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`orchestrator.config.json parse error: ${err.message}`);
  }
}

function parseIntStrict(v, name) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
  throw new Error(`${name} must be a non-negative integer, got ${JSON.stringify(v)}`);
}

function loadConfig(opts) {
  const { projectDir, cliFlags = {}, env = process.env } = opts || {};
  if (!projectDir) throw new Error('loadConfig requires projectDir');

  const fileCfg = loadConfigFile(projectDir);
  const merged = { ...DEFAULTS, ...fileCfg };

  if (cliFlags.maxParallel != null) merged.maxParallel = parseIntStrict(cliFlags.maxParallel, '--max-parallel');
  if (cliFlags.workerTimeoutMs != null) merged.workerTimeoutMs = parseIntStrict(cliFlags.workerTimeoutMs, '--worker-timeout');
  if (cliFlags.retryOnFail != null) merged.retryOnFail = !!cliFlags.retryOnFail;
  if (cliFlags.haltOnSecondFail != null) merged.haltOnSecondFail = !!cliFlags.haltOnSecondFail;

  if (env.GSD_T_MAX_PARALLEL != null && env.GSD_T_MAX_PARALLEL !== '') {
    merged.maxParallel = parseIntStrict(env.GSD_T_MAX_PARALLEL, 'GSD_T_MAX_PARALLEL');
  }
  if (env.GSD_T_WORKER_TIMEOUT_MS != null && env.GSD_T_WORKER_TIMEOUT_MS !== '') {
    merged.workerTimeoutMs = parseIntStrict(env.GSD_T_WORKER_TIMEOUT_MS, 'GSD_T_WORKER_TIMEOUT_MS');
  }

  if (merged.maxParallel < 1) {
    throw new Error(`maxParallel must be >= 1, got ${merged.maxParallel}`);
  }
  if (merged.maxParallel > MAX_PARALLEL_CEILING) {
    throw new Error(`maxParallel ${merged.maxParallel} exceeds Team Mode §15 ceiling (${MAX_PARALLEL_CEILING})`);
  }
  if (merged.workerTimeoutMs < 1000) {
    throw new Error(`workerTimeoutMs must be >= 1000, got ${merged.workerTimeoutMs}`);
  }

  merged.projectDir = projectDir;
  return merged;
}

module.exports = { loadConfig, DEFAULTS, MAX_PARALLEL_CEILING };
