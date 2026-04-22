'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = Object.freeze({
  maxParallel: 3,
  workerTimeoutMs: 270000,
  retryOnFail: true,
  haltOnSecondFail: true
});

const MAX_PARALLEL_CEILING = 15;
const WORKER_RAM_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;
const ADAPTIVE_FLOOR = 3;

function computeAdaptiveMaxParallel(freeBytes) {
  const free = typeof freeBytes === 'number' ? freeBytes : os.freemem();
  if (!Number.isFinite(free) || free <= 0) return ADAPTIVE_FLOOR;
  const byMemory = Math.floor(free / WORKER_RAM_BUDGET_BYTES);
  const clamped = Math.max(ADAPTIVE_FLOOR, Math.min(MAX_PARALLEL_CEILING, byMemory));
  return clamped;
}

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
  const { projectDir, cliFlags = {}, env = process.env, freeMemBytes } = opts || {};
  if (!projectDir) throw new Error('loadConfig requires projectDir');

  const fileCfg = loadConfigFile(projectDir);
  const fileSetMaxParallel = Object.prototype.hasOwnProperty.call(fileCfg, 'maxParallel');
  const merged = { ...DEFAULTS, ...fileCfg };
  let maxParallelSource = fileSetMaxParallel ? 'config-file' : 'adaptive';
  if (!fileSetMaxParallel) {
    merged.maxParallel = computeAdaptiveMaxParallel(freeMemBytes);
  }

  if (cliFlags.maxParallel != null) {
    merged.maxParallel = parseIntStrict(cliFlags.maxParallel, '--max-parallel');
    maxParallelSource = 'cli';
  }
  if (cliFlags.workerTimeoutMs != null) merged.workerTimeoutMs = parseIntStrict(cliFlags.workerTimeoutMs, '--worker-timeout');
  if (cliFlags.retryOnFail != null) merged.retryOnFail = !!cliFlags.retryOnFail;
  if (cliFlags.haltOnSecondFail != null) merged.haltOnSecondFail = !!cliFlags.haltOnSecondFail;

  if (env.GSD_T_MAX_PARALLEL != null && env.GSD_T_MAX_PARALLEL !== '') {
    merged.maxParallel = parseIntStrict(env.GSD_T_MAX_PARALLEL, 'GSD_T_MAX_PARALLEL');
    maxParallelSource = 'env';
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
  merged.maxParallelSource = maxParallelSource;
  return merged;
}

module.exports = {
  loadConfig,
  DEFAULTS,
  MAX_PARALLEL_CEILING,
  computeAdaptiveMaxParallel,
  WORKER_RAM_BUDGET_BYTES,
  ADAPTIVE_FLOOR
};
