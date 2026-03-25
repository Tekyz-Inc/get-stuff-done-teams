#!/usr/bin/env node

/**
 * GSD-T Debug Ledger — Persistent debug iteration store
 *
 * Reads and writes debug iteration records to .gsd-t/debug-state.jsonl.
 * Supports compaction detection and ledger lifecycle management.
 *
 * Zero external dependencies (Node.js built-ins only).
 */

const fs = require("fs");
const path = require("path");

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPACTION_THRESHOLD = 51200; // 50KB

const REQUIRED_FIELDS = [
  "iteration", "timestamp", "test", "error",
  "hypothesis", "fix", "fixFiles", "result",
  "learning", "model", "duration",
];

const VALID_RESULTS = new Set(["PASS", "STILL_FAILS"]);

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  readLedger, appendEntry, getLedgerStats, clearLedger,
  compactLedger, generateAntiRepetitionPreamble,
};

// ── readLedger ────────────────────────────────────────────────────────────────

/**
 * Read all entries from the debug ledger.
 * @param {string} projectDir - Root directory of the project
 * @returns {object[]} Array of parsed ledger entry objects
 */
function readLedger(projectDir) {
  const fp = ledgerPath(projectDir);
  if (!fs.existsSync(fp)) return [];
  const content = fs.readFileSync(fp, "utf8").trim();
  if (!content) return [];
  return content.split("\n").map(safeParse).filter(Boolean);
}

// ── appendEntry ───────────────────────────────────────────────────────────────

/**
 * Validate and append one debug iteration entry to the ledger.
 * Creates the file and parent directories if they do not exist.
 * @param {string} projectDir - Root directory of the project
 * @param {object} entry - Debug iteration record (see Required Fields)
 * @throws {Error} If required fields are missing or invalid
 */
function appendEntry(projectDir, entry) {
  const err = validateEntry(entry);
  if (err) throw new Error(err);
  const fp = ledgerPath(projectDir);
  ensureDir(path.dirname(fp));
  fs.appendFileSync(fp, JSON.stringify(entry) + "\n");
}

// ── getLedgerStats ────────────────────────────────────────────────────────────

/**
 * Return summary statistics for the current ledger.
 * @param {string} projectDir - Root directory of the project
 * @returns {{ entryCount: number, sizeBytes: number, needsCompaction: boolean, failedHypotheses: string[], passCount: number, failCount: number }}
 */
function getLedgerStats(projectDir) {
  const fp = ledgerPath(projectDir);
  const entries = readLedger(projectDir);
  const sizeBytes = fs.existsSync(fp) ? fs.statSync(fp).size : 0;
  const failedHypotheses = entries
    .filter((e) => e.result === "STILL_FAILS" && e.hypothesis)
    .map((e) => e.hypothesis);
  const passCount = entries.filter((e) => e.result === "PASS").length;
  const failCount = entries.filter((e) => e.result === "STILL_FAILS").length;
  return {
    entryCount: entries.length,
    sizeBytes,
    needsCompaction: sizeBytes > COMPACTION_THRESHOLD,
    failedHypotheses,
    passCount,
    failCount,
  };
}

// ── clearLedger ───────────────────────────────────────────────────────────────

/**
 * Delete the debug ledger file. Called when all tests pass.
 * No-op if the file does not exist.
 * @param {string} projectDir - Root directory of the project
 */
function clearLedger(projectDir) {
  const fp = ledgerPath(projectDir);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
}

// ── compactLedger ─────────────────────────────────────────────────────────────

/**
 * Compact the ledger by replacing all but the last 5 entries with a summary.
 * @param {string} projectDir - Root directory of the project
 * @param {string} summary - Summarization of compacted entries
 */
function compactLedger(projectDir, summary) {
  const entries = readLedger(projectDir);
  const tail = entries.slice(-5);
  const compactedEntry = {
    compacted: true,
    learning: summary,
    iteration: 0,
    timestamp: new Date().toISOString(),
    test: "compacted",
    error: "see summary",
    hypothesis: "compacted",
    fix: "compacted",
    fixFiles: [],
    result: "compacted",
    model: "haiku",
    duration: 0,
  };
  const fp = ledgerPath(projectDir);
  ensureDir(path.dirname(fp));
  const lines = [compactedEntry, ...tail].map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(fp, lines);
}

// ── generateAntiRepetitionPreamble ────────────────────────────────────────────

/**
 * Build a preamble string listing failed hypotheses and the current narrowing
 * direction. Injected into each claude -p session to prevent repeated attempts.
 * @param {string} projectDir - Root directory of the project
 * @returns {string} Formatted preamble, or empty string if ledger is empty
 */
function generateAntiRepetitionPreamble(projectDir) {
  const entries = readLedger(projectDir);
  if (!entries.length) return "";
  const failed = entries.filter((e) => e.result === "STILL_FAILS");
  const learnings = entries.filter((e) => e.learning && !e.compacted);
  const lastLearning = learnings.length ? learnings[learnings.length - 1].learning : null;
  const failLines = failed
    .map((e, i) => `${i + 1}. [iteration ${e.iteration}] "${e.hypothesis}" — FAILED: ${e.error}`)
    .join("\n");
  const stillFailing = failed.map((e) => `- ${e.test}: ${e.error}`).join("\n");
  const direction = lastLearning
    ? `Based on ${entries.length} iterations, the evidence points to: ${lastLearning}`
    : "No narrowing direction established yet.";
  return [
    "## Debug Ledger Context (DO NOT retry failed approaches)",
    "",
    "### Failed Hypotheses (DO NOT retry these):",
    failLines || "(none yet)",
    "",
    "### Current Narrowing Direction:",
    direction,
    "",
    "### Tests Still Failing:",
    stillFailing || "(none recorded)",
  ].join("\n");
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function ledgerPath(projectDir) {
  return path.join(projectDir || process.cwd(), ".gsd-t", "debug-state.jsonl");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeParse(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function validateEntry(entry) {
  if (!entry || typeof entry !== "object") return "Entry must be an object";
  for (const f of REQUIRED_FIELDS) {
    if (entry[f] === undefined || entry[f] === null) return `Missing required field: ${f}`;
  }
  if (typeof entry.iteration !== "number") return "iteration must be a number";
  if (typeof entry.duration !== "number") return "duration must be a number";
  if (!Array.isArray(entry.fixFiles)) return "fixFiles must be an array";
  if (!VALID_RESULTS.has(entry.result)) return `result must be "PASS" or "STILL_FAILS"`;
  return null;
}
