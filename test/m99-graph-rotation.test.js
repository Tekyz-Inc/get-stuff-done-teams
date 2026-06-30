"use strict";

/**
 * M99-D1-T3 — Sized rotation test (rollover-boundary proof)
 *
 * Proves append_ledger_line():
 *   - Rotates at size (GSDT_GRAPH_TELEMETRY_MAXBYTES override)
 *   - Rotates at entry count (GSDT_GRAPH_TELEMETRY_MAXENTRIES override)
 *   - Seals -001 at/under the cap and opens -002
 *   - A real rollover at a boundary (not a mocked counter)
 *
 * [RULE] rollover-boundary-proven (pre-mortem #5)
 * [RULE] fail-open-telemetry
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const RESOLVER = path.join(ROOT, "bin", "gsd-t-graph-store-resolver.cjs");

function makeFixtureRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m99-rotation-"));
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  return dir;
}

function readLedgerFiles(logsDir) {
  try {
    return fs.readdirSync(logsDir)
      .filter((f) => /^graph-events-\d+\.jsonl$/.test(f))
      .sort();
  } catch (_e) {
    return [];
  }
}

function readEntries(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs.readFileSync(ledgerPath, "utf8")
    .trim().split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// ─── Size-based rotation ───────────────────────────────────────────────────────

test("rotation: seals -001 at size cap and opens -002 (rollover-boundary proof)", () => {
  const dir = makeFixtureRoot();
  const r = require(RESOLVER);

  // Set a tiny cap (1 KB) so we hit it quickly
  const origMaxBytes = process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES;
  const origMaxEntries = process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES;
  process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES = "1024"; // 1 KB
  process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES = "999999"; // effectively disabled

  const logsDir = path.join(dir, ".gsd-t", "graphDB", "logs");

  try {
    // Write records until we cross the 1 KB threshold
    const bigRecord = { kind: "query", ts: new Date().toISOString(), verb: "who-imports",
      target: "src/foo.ts", outcome: "hit", tier: "compiler-accurate",
      resultCount: 5, latencyMs: 12, consumer: "test", padding: "x".repeat(200) };

    // Write 6 records (~1.2KB each when JSON) — should cross 1 KB cap
    for (let i = 0; i < 6; i++) {
      r.append_ledger_line({ ...bigRecord, seq: i }, dir);
    }

    const files = readLedgerFiles(logsDir);
    assert.ok(files.length >= 2,
      `Expected rotation to -002 (at least 2 files), got ${files.length}: ${files.join(", ")}`);

    // -001 must exist and be sealed (not empty)
    const file001 = path.join(logsDir, "graph-events-001.jsonl");
    assert.ok(fs.existsSync(file001), "graph-events-001.jsonl must exist");
    const entries001 = readEntries(file001);
    assert.ok(entries001.length > 0, "graph-events-001.jsonl must have entries");

    // -002 must exist (overflow landed here)
    const file002 = path.join(logsDir, "graph-events-002.jsonl");
    assert.ok(fs.existsSync(file002), "graph-events-002.jsonl must exist after rollover");
    const entries002 = readEntries(file002);
    assert.ok(entries002.length > 0, "graph-events-002.jsonl must have at least one entry");

    // Total entries across both files must equal what we wrote
    const totalEntries = entries001.length + entries002.length;
    assert.strictEqual(totalEntries, 6, `All 6 records must be in ledger (found ${totalEntries})`);

  } finally {
    // Restore env
    if (origMaxBytes !== undefined) process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES = origMaxBytes;
    else delete process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES;
    if (origMaxEntries !== undefined) process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES = origMaxEntries;
    else delete process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES;
  }
});

// ─── Entry-count-based rotation ───────────────────────────────────────────────

test("rotation: seals -001 at entry-count cap and opens -002", () => {
  const dir = makeFixtureRoot();
  const r = require(RESOLVER);

  const origMaxBytes = process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES;
  const origMaxEntries = process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES;
  process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES = "999999999"; // effectively disabled
  process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES = "3"; // cap at 3 entries

  const logsDir = path.join(dir, ".gsd-t", "graphDB", "logs");

  try {
    const rec = { kind: "query", ts: new Date().toISOString(), verb: "status", outcome: "hit", latencyMs: 1 };

    for (let i = 0; i < 5; i++) {
      r.append_ledger_line({ ...rec, seq: i }, dir);
    }

    const files = readLedgerFiles(logsDir);
    assert.ok(files.length >= 2,
      `Expected at least 2 ledger files after 5 entries with cap=3, got ${files.length}: ${files.join(", ")}`);

    const file001 = path.join(logsDir, "graph-events-001.jsonl");
    const file002 = path.join(logsDir, "graph-events-002.jsonl");
    assert.ok(fs.existsSync(file001), "graph-events-001.jsonl must exist");
    assert.ok(fs.existsSync(file002), "graph-events-002.jsonl must exist");

    const entries001 = readEntries(file001);
    // -001 should have been sealed at the cap (3 entries)
    assert.strictEqual(entries001.length, 3, `graph-events-001.jsonl should have 3 entries, got ${entries001.length}`);

  } finally {
    if (origMaxBytes !== undefined) process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES = origMaxBytes;
    else delete process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES;
    if (origMaxEntries !== undefined) process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES = origMaxEntries;
    else delete process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES;
  }
});

// ─── Rotation across three files ──────────────────────────────────────────────

test("rotation: can roll over from -001 to -002 to -003", () => {
  const dir = makeFixtureRoot();
  const r = require(RESOLVER);

  const origMaxBytes = process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES;
  const origMaxEntries = process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES;
  process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES = "999999999";
  process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES = "2"; // cap at 2

  const logsDir = path.join(dir, ".gsd-t", "graphDB", "logs");

  try {
    const rec = { kind: "query", ts: new Date().toISOString(), verb: "who-calls", outcome: "hit", latencyMs: 5 };

    // 7 entries with cap=2 → 001(2), 002(2), 003(2), 004(1)
    for (let i = 0; i < 7; i++) {
      r.append_ledger_line({ ...rec, i }, dir);
    }

    const files = readLedgerFiles(logsDir);
    assert.ok(files.length >= 3, `Expected ≥3 files for 7 entries with cap=2, got ${files.length}: ${files.join(", ")}`);

    // Verify total entry count
    let total = 0;
    for (const f of files) {
      total += readEntries(path.join(logsDir, f)).length;
    }
    assert.strictEqual(total, 7, `Total entries across all files must be 7, got ${total}`);

  } finally {
    if (origMaxBytes !== undefined) process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES = origMaxBytes;
    else delete process.env.GSDT_GRAPH_TELEMETRY_MAXBYTES;
    if (origMaxEntries !== undefined) process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES = origMaxEntries;
    else delete process.env.GSDT_GRAPH_TELEMETRY_MAXENTRIES;
  }
});
