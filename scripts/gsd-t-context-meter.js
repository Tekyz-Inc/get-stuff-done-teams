#!/usr/bin/env node
/**
 * gsd-t-context-meter.js
 *
 * PostToolUse hook entry point for GSD-T's Context Meter (M34).
 *
 * Wires together:
 *   - bin/context-meter-config.cjs            (loadConfig)
 *   - scripts/context-meter/transcript-parser.js  (parseTranscript)
 *   - scripts/context-meter/estimate-tokens.js    (estimateTokens — local, zero API cost)
 *   - scripts/context-meter/threshold.js      (computePct/bandFor/buildAdditionalContext)
 *
 * Contract: .gsd-t/contracts/context-meter-contract.md
 *
 * CRITICAL INVARIANT — FAIL OPEN:
 *   Every failure path resolves to `{}` on stdout and exits 0. This hook must
 *   NEVER throw, NEVER exit non-zero, and NEVER log message content. The
 *   entire `runMeter` body is wrapped in a try/catch that swallows anything
 *   unexpected and returns `{}` — the same shape the CLI shim emits on parse
 *   failure of its own stdin. See contract rule #1.
 *
 * Testability:
 *   `runMeter({ payload, projectRoot, env, clock?, _parseTranscript?,
 *               _estimateTokens?, _loadConfig? })` is the pure async core. Tests
 *   fabricate payloads and inject stubs; production code uses only the CLI
 *   shim at the bottom of the file (runs when `require.main === module`).
 *
 * @module scripts/gsd-t-context-meter
 */

"use strict";

const fs = require("fs");
const path = require("path");

const { loadConfig: realLoadConfig } = require("../bin/context-meter-config.cjs");
const { parseTranscript: realParseTranscript } = require("./context-meter/transcript-parser");
const { estimateTokens: realEstimateTokens } = require("./context-meter/estimate-tokens");
const { computePct, bandFor, buildAdditionalContext } = require("./context-meter/threshold");

const STATE_VERSION = 1;

/* ─────────────────────────── state file helpers ─────────────────────────── */

/**
 * Read the current state file. Returns a fresh default on missing file or
 * corruption (never throws).
 */
function readState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.version !== STATE_VERSION) {
      return defaultState();
    }
    return parsed;
  } catch (_) {
    return defaultState();
  }
}

function defaultState() {
  return {
    version: STATE_VERSION,
    timestamp: null,
    inputTokens: 0,
    modelWindowSize: 0,
    pct: 0,
    threshold: "normal",
    checkCount: 0,
    lastError: null,
  };
}

/**
 * Atomically write state to disk: write to `{statePath}.tmp` → rename to
 * `{statePath}`. Creates parent directories as needed. Never throws.
 */
function writeStateAtomic(statePath, state) {
  try {
    const dir = path.dirname(statePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${statePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, statePath);
  } catch (_) {
    /* fail open — logging will also be best-effort */
  }
}

/* ──────────────────────────── logging helper ─────────────────────────── */

/**
 * Append a short line-based diagnostic to logPath. Line format:
 *   "{ISO-timestamp} {LEVEL} {category} {short-detail}"
 *
 * NEVER logs transcript content, message text, or API request bodies.
 */
function appendLog(logPath, level, category, detail, clock) {
  try {
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });
    const ts = (clock ? clock() : new Date()).toISOString();
    const line = `${ts} ${level} ${category} ${detail || ""}\n`;
    fs.appendFileSync(logPath, line, "utf8");
  } catch (_) {
    /* logging failure must not affect fail-open behavior */
  }
}

/* ──────────────────────── core: runMeter() ──────────────────────── */

/**
 * Run the context meter once.
 *
 * @param {object}   opts
 * @param {object}   opts.payload        parsed PostToolUse JSON (with transcript_path)
 * @param {string}   opts.projectRoot    normally process.cwd()
 * @param {object}   opts.env            normally process.env
 * @param {Function} [opts.clock]        optional () => Date (test seam)
 * @param {Function} [opts._loadConfig]  optional loadConfig stub (test seam)
 * @param {Function} [opts._parseTranscript] optional parseTranscript stub (test seam)
 * @param {Function} [opts._estimateTokens] optional estimateTokens stub (test seam)
 * @returns {Promise<object>} `{}` or `{ additionalContext: "..." }`
 */
async function runMeter(opts) {
  // Outer try/catch guarantees we NEVER throw. Any unexpected error → `{}`.
  try {
    const {
      payload,
      projectRoot,
      env,
      clock,
      _loadConfig = realLoadConfig,
      _parseTranscript = realParseTranscript,
      _estimateTokens = realEstimateTokens,
    } = opts || {};

    const root = projectRoot || process.cwd();
    const envObj = env || {};
    const now = () => (clock ? clock() : new Date());

    // 1. Load config (missing file → defaults). Any throw → bail out fail-open.
    let cfg;
    try {
      cfg = _loadConfig(root);
    } catch (_) {
      return {};
    }

    const statePath = path.isAbsolute(cfg.statePath)
      ? cfg.statePath
      : path.join(root, cfg.statePath);
    const logPath = path.isAbsolute(cfg.logPath)
      ? cfg.logPath
      : path.join(root, cfg.logPath);

    // 2. Read (possibly corrupt) state, increment checkCount immediately.
    const state = readState(statePath);
    state.version = STATE_VERSION;
    state.modelWindowSize = cfg.modelWindowSize;
    state.checkCount = (Number.isInteger(state.checkCount) ? state.checkCount : 0) + 1;

    // 3. Check-frequency gate: not our turn → persist counter and bail out `{}`.
    if (state.checkCount % cfg.checkFrequency !== 0) {
      writeStateAtomic(statePath, state);
      return {};
    }

    // 4. Extract transcript_path from payload (fail open if missing).
    const transcriptPath =
      payload && typeof payload === "object" && typeof payload.transcript_path === "string"
        ? payload.transcript_path
        : null;

    if (!transcriptPath) {
      state.lastError = {
        code: "no_transcript",
        message: "payload missing transcript_path",
        timestamp: now().toISOString(),
      };
      writeStateAtomic(statePath, state);
      appendLog(logPath, "ERROR", "no_transcript", "payload missing transcript_path", clock);
      return {};
    }

    // 5. Parse transcript (streaming, async). null → bail out.
    let parsed;
    try {
      parsed = await _parseTranscript(transcriptPath);
    } catch (_) {
      parsed = null;
    }
    if (!parsed || !Array.isArray(parsed.messages)) {
      state.lastError = {
        code: "parse_failure",
        message: `parseTranscript returned null for ${path.basename(transcriptPath)}`,
        timestamp: now().toISOString(),
      };
      writeStateAtomic(statePath, state);
      appendLog(
        logPath,
        "ERROR",
        "parse_failure",
        `${path.basename(transcriptPath)}`,
        clock
      );
      return {};
    }

    // 6. Estimate tokens locally (no API call, zero cost).
    let tokenResp;
    try {
      tokenResp = _estimateTokens({
        system: parsed.system || "",
        messages: parsed.messages,
      });
    } catch (_) {
      tokenResp = null;
    }

    if (!tokenResp || !Number.isFinite(tokenResp.inputTokens)) {
      state.inputTokens = 0;
      state.pct = 0;
      state.threshold = "normal";
      state.timestamp = now().toISOString();
      state.lastError = {
        code: "estimate_error",
        message: "estimateTokens returned null",
        timestamp: state.timestamp,
      };
      writeStateAtomic(statePath, state);
      appendLog(logPath, "ERROR", "estimate_error", "estimateTokens null", clock);
      return {};
    }

    // 8. Success path — compute pct, band, possibly emit additionalContext.
    const pct = computePct({
      inputTokens: tokenResp.inputTokens,
      modelWindowSize: cfg.modelWindowSize,
    });
    const band = bandFor(pct, cfg.thresholdPct);

    state.inputTokens = tokenResp.inputTokens;
    state.pct = pct;
    state.threshold = band;
    state.timestamp = now().toISOString();
    state.lastError = null;
    writeStateAtomic(statePath, state);
    appendLog(
      logPath,
      "INFO",
      "measure",
      `tokens=${tokenResp.inputTokens} pct=${pct.toFixed(1)} band=${band}`,
      clock
    );

    const additionalContext = buildAdditionalContext({
      pct,
      modelWindowSize: cfg.modelWindowSize,
      thresholdPct: cfg.thresholdPct,
    });
    if (additionalContext) {
      return { additionalContext };
    }
    return {};
  } catch (_) {
    // Absolute safety net — fail open no matter what.
    return {};
  }
}

/* ──────────────────────────── CLI shim ──────────────────────────── */

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    try {
      if (process.stdin.isTTY) {
        resolve("");
        return;
      }
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        data += chunk;
      });
      process.stdin.on("end", () => resolve(data));
      process.stdin.on("error", () => resolve(""));
    } catch (_) {
      resolve("");
    }
  });
}

async function main() {
  let payload = null;
  try {
    const raw = await readStdin();
    payload = raw ? JSON.parse(raw) : null;
  } catch (_) {
    payload = null;
  }

  let out = {};
  try {
    out = await runMeter({
      payload: payload || {},
      projectRoot: process.cwd(),
      env: process.env,
    });
  } catch (_) {
    out = {};
  }

  try {
    process.stdout.write(JSON.stringify(out || {}));
  } catch (_) {
    process.stdout.write("{}");
  }
  process.exit(0);
}

module.exports = { runMeter, readState, writeStateAtomic, defaultState };

if (require.main === module) {
  main();
}
