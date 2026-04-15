#!/usr/bin/env node

/**
 * GSD-T Token Telemetry — per-subagent-spawn granular telemetry recorder
 *
 * Records one JSON object per line to .gsd-t/token-metrics.jsonl for every
 * subagent spawn across every command file. Feeds:
 *   - bin/runway-estimator.js (M35 Wave 3) — pre-flight runway projection
 *   - bin/token-optimizer.js  (M35 Wave 4) — optimization backlog detector
 *   - gsd-t metrics --tokens / --halts / --tokens --context-window CLI
 *
 * Zero external dependencies (Node.js built-ins only).
 * Zero API calls (reads .gsd-t/.context-meter-state.json written by M34 hook).
 * Single-writer assumption — no lockfile; fs.appendFileSync is atomic for
 * writes under PIPE_BUF (4096 bytes on POSIX), and a single record is well
 * under that limit.
 *
 * Contract: .gsd-t/contracts/token-telemetry-contract.md v1.0.0
 * Schema is frozen for v1.x — fields can be added in minor bumps but never
 * removed or renamed.
 */

const fs = require("fs");
const path = require("path");

// ── Frozen schema (matches token-telemetry-contract.md v1.0.0) ──────────────

/**
 * The 18 required fields. Order is not significant on disk (parsers use keys),
 * but this array is the canonical list for validation error messages and
 * downstream tooling that needs a stable field enumeration.
 */
const REQUIRED_FIELDS = Object.freeze([
  "timestamp",
  "milestone",
  "command",
  "phase",
  "step",
  "domain",
  "domain_type",
  "task",
  "model",
  "duration_s",
  "input_tokens_before",
  "input_tokens_after",
  "tokens_consumed",
  "context_window_pct_before",
  "context_window_pct_after",
  "outcome",
  "halt_type",
  "escalated_via_advisor",
]);

/**
 * Type enforcement map. Keys are field names; values are either "string",
 * "number", "boolean", "nullable-string", or a Set of valid string enum values.
 * halt_type is the only nullable field in v1.0.0 per the contract.
 */
const FIELD_TYPES = Object.freeze({
  timestamp: "string",
  milestone: "string",
  command: "string",
  phase: "string",
  step: "string",
  domain: "string",
  domain_type: "string",
  task: "string",
  model: new Set(["haiku", "sonnet", "opus"]),
  duration_s: "number",
  input_tokens_before: "number",
  input_tokens_after: "number",
  tokens_consumed: "number",
  context_window_pct_before: "number",
  context_window_pct_after: "number",
  outcome: new Set(["success", "failure", "blocked", "escalated"]),
  halt_type: "nullable-string", // null OR one of the halt_type enum values
  escalated_via_advisor: "boolean",
});

const HALT_TYPE_ENUM = Object.freeze(
  new Set(["clean", "runway-refusal", "headless-handoff", "native-compact"]),
);

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  recordSpawn,
  readAll,
  aggregate,
  REQUIRED_FIELDS,
};

// ── recordSpawn ─────────────────────────────────────────────────────────────

/**
 * Append one telemetry record to .gsd-t/token-metrics.jsonl.
 *
 * @param {object} record - A record matching the v1.0.0 schema. All 18
 *   required fields must be present and of the correct type.
 * @param {string} [projectDir] - Optional project root. Defaults to cwd.
 * @throws {Error} on missing required field, wrong type, or I/O failure.
 * @returns {void}
 */
function recordSpawn(record, projectDir) {
  validateRecord(record);
  const dir = projectDir || process.cwd();
  const gsdDir = path.join(dir, ".gsd-t");
  ensureDir(gsdDir);
  const fp = path.join(gsdDir, "token-metrics.jsonl");
  const line = JSON.stringify(record) + "\n";
  fs.appendFileSync(fp, line);
}

// ── readAll ─────────────────────────────────────────────────────────────────

/**
 * Read and parse every record from .gsd-t/token-metrics.jsonl.
 *
 * @param {string} [projectDir] - Optional project root. Defaults to cwd.
 * @returns {Array<object>} - Array of parsed records. Returns [] if the file
 *   does not exist. Malformed lines are skipped with a console.warn (does
 *   not abort the read).
 */
function readAll(projectDir) {
  const dir = projectDir || process.cwd();
  const fp = path.join(dir, ".gsd-t", "token-metrics.jsonl");
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`token-telemetry.readAll: skipping malformed line: ${e.message}`);
    }
  }
  return records;
}

// ── aggregate ───────────────────────────────────────────────────────────────

/**
 * Group records by one or more fields and compute per-group statistics.
 *
 * @param {Array<object>} records
 * @param {{ by: Array<string> }} options - Array of field names to group by.
 *   Unknown fields yield empty-string values in the group key.
 * @returns {Array<{ key: object, count: number, total_tokens: number,
 *                   mean: number, median: number, p95: number }>}
 */
function aggregate(records, options) {
  const by = (options && Array.isArray(options.by)) ? options.by : [];
  if (!Array.isArray(records) || records.length === 0) return [];

  // Build groups keyed on a stable string (JSON of the key object).
  const groups = new Map();
  for (const r of records) {
    const key = {};
    for (const field of by) key[field] = r[field] != null ? r[field] : "";
    const keyStr = JSON.stringify(key);
    if (!groups.has(keyStr)) groups.set(keyStr, { key, tokens: [] });
    const tokens = typeof r.tokens_consumed === "number" ? r.tokens_consumed : 0;
    groups.get(keyStr).tokens.push(tokens);
  }

  const result = [];
  for (const { key, tokens } of groups.values()) {
    const count = tokens.length;
    const total_tokens = tokens.reduce((s, v) => s + v, 0);
    const mean = count > 0 ? total_tokens / count : 0;
    const sorted = tokens.slice().sort((a, b) => a - b);
    const median = count > 0 ? sorted[Math.floor(count / 2)] : 0;
    const p95idx = count > 0 ? Math.min(count - 1, Math.floor(count * 0.95)) : 0;
    const p95 = count > 0 ? sorted[p95idx] : 0;
    result.push({ key, count, total_tokens, mean, median, p95 });
  }
  return result;
}

// ── Internal: schema validation ─────────────────────────────────────────────

function validateRecord(record) {
  if (record == null || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(
      `recordSpawn: record must be a plain object, got ${Array.isArray(record) ? "array" : typeof record}`,
    );
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      throw new Error(`recordSpawn: missing required field: ${field}`);
    }
  }
  for (const field of REQUIRED_FIELDS) {
    const expected = FIELD_TYPES[field];
    const value = record[field];
    if (expected === "string") {
      if (typeof value !== "string") {
        throw new Error(
          `recordSpawn: field ${field} has wrong type: expected string, got ${typeName(value)}`,
        );
      }
    } else if (expected === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(
          `recordSpawn: field ${field} has wrong type: expected finite number, got ${typeName(value)}`,
        );
      }
    } else if (expected === "boolean") {
      if (typeof value !== "boolean") {
        throw new Error(
          `recordSpawn: field ${field} has wrong type: expected boolean, got ${typeName(value)}`,
        );
      }
    } else if (expected === "nullable-string") {
      // halt_type: null OR one of the halt_type enum values
      if (value !== null) {
        if (typeof value !== "string" || !HALT_TYPE_ENUM.has(value)) {
          throw new Error(
            `recordSpawn: field ${field} has wrong value: expected null or one of ${Array.from(HALT_TYPE_ENUM).join("|")}, got ${JSON.stringify(value)}`,
          );
        }
      }
    } else if (expected instanceof Set) {
      // string enum
      if (typeof value !== "string" || !expected.has(value)) {
        throw new Error(
          `recordSpawn: field ${field} has wrong value: expected one of ${Array.from(expected).join("|")}, got ${JSON.stringify(value)}`,
        );
      }
    }
  }
}

function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

// ── Internal: fs helpers ────────────────────────────────────────────────────

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
