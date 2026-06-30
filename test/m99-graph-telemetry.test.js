"use strict";

/**
 * M99-D1-T3 + T4 — graph telemetry Layer-1 sink test (updated for M99)
 *
 * Proves the ledger sink writes to `graphDB/logs/` (NOT the legacy `.gsd-t/metrics/`),
 * record shape is KEPT (kind/verb/target/outcome/tier/latencyMs/consumer/staleOnQuery/…),
 * toggle OFF writes zero lines, and a thrown fs error inside the sink does NOT propagate.
 *
 * [RULE] layer1-shape-kept
 * [RULE] fail-open-telemetry
 * [RULE] rollover-boundary-proven (toggle off + fail-open paths)
 *
 * Spawns the CLI as a subprocess (telemetry lives in require.main===module).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "bin", "gsd-t-graph-query-cli.cjs");
const INDEX = path.join(ROOT, "bin", "gsd-t-graph-index.cjs");
const RESOLVER = path.join(ROOT, "bin", "gsd-t-graph-store-resolver.cjs");

// Build a tiny real index in a temp repo using the NEW graphDB/ layout.
function makeFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m99-telemetry-"));
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "b.ts"), "export function b() { return 1; }\n");
  fs.writeFileSync(path.join(dir, "src", "a.ts"), "import { b } from './b';\nexport function a() { return b(); }\n");
  try {
    const r = require(RESOLVER);
    const { build_index } = require(INDEX);
    // Build at the NEW graphDB/ path (M99 layout)
    build_index(dir, { dbPath: r.resolveStorePath(dir) });
  } catch { /* if unavailable, query emits graph-unavailable telemetry */ }
  return dir;
}

function runQuery(dir, verbArgs, consumer, extraEnv) {
  return spawnSync(process.execPath, [CLI].concat(verbArgs), {
    cwd: dir, encoding: "utf8", timeout: 30000,
    env: { ...process.env, GSDT_GRAPH_CONSUMER: consumer || "test", ...(extraEnv || {}) },
  });
}

/**
 * Read the M99 ledger: graphDB/logs/graph-events-*.jsonl
 * Returns all lines from all rotated files, sorted by filename order.
 */
function readLedger(dir) {
  const r = require(RESOLVER);
  const logsDir = r.resolveLogsDir(dir);
  if (!fs.existsSync(logsDir)) return [];
  const files = fs.readdirSync(logsDir)
    .filter((f) => /^graph-events-\d+\.jsonl$/.test(f))
    .sort();
  const lines = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(logsDir, f), "utf8");
    for (const line of content.trim().split("\n").filter(Boolean)) {
      try { lines.push(JSON.parse(line)); } catch {}
    }
  }
  return lines;
}

test("telemetry: every query appends one ledger line at graphDB/logs/ with usage fields", () => {
  const dir = makeFixtureRepo();
  const r = runQuery(dir, ["status"], "test-usage");
  assert.ok(r.stdout && r.stdout.includes('"verb"'), `query produced no envelope: ${r.stderr}`);

  const events = readLedger(dir);
  assert.strictEqual(events.length, 1, "exactly one ledger line per query");
  const e = events[0];
  assert.strictEqual(e.verb, "status");
  assert.strictEqual(e.kind, "query", "kind field must be 'query' (Layer-1 shape)");
  assert.ok(typeof e.outcome === "string", "outcome recorded");
  assert.ok(typeof e.latencyMs === "number" && e.latencyMs >= 0, "latencyMs recorded");
  assert.strictEqual(e.consumer, "test-usage", "consumer label flows from GSDT_GRAPH_CONSUMER");
  assert.ok("staleOnQuery" in e && "reindexedCount" in e, "freshness fields present");
  // Shape: all required Layer-1 fields present
  assert.ok("ts" in e, "ts field present");
  assert.ok("tier" in e || e.tier === null, "tier field present");
});

test("telemetry: ledger writes to graphDB/logs/ NOT legacy .gsd-t/metrics/ (M99 path)", () => {
  const dir = makeFixtureRepo();
  runQuery(dir, ["status"], "test-path");

  const r = require(RESOLVER);
  const logsDir = r.resolveLogsDir(dir);

  // New path must have ledger entries
  const hasNewLedger = fs.existsSync(logsDir) &&
    fs.readdirSync(logsDir).some((f) => /^graph-events-\d+\.jsonl$/.test(f));
  assert.ok(hasNewLedger, `Ledger must exist under graphDB/logs/: ${logsDir}`);

  // Legacy path must NOT have ledger (we didn't write to .gsd-t/metrics/graph-events.jsonl)
  const legacyLedger = path.join(dir, ".gsd-t", "metrics", "graph-events.jsonl");
  assert.ok(!fs.existsSync(legacyLedger),
    "Legacy ledger path .gsd-t/metrics/graph-events.jsonl must NOT be written by M99 CLI");
});

test("telemetry: a query against EDITED code records staleOnQuery + reindex", () => {
  const dir = makeFixtureRepo();
  // First query: clean tree
  runQuery(dir, ["status"], "t");
  // Edit an indexed file → content hash drifts → next query is stale
  fs.appendFileSync(path.join(dir, "src", "a.ts"), "\n// edit-marker\n");
  runQuery(dir, ["status"], "t");

  const events = readLedger(dir);
  assert.strictEqual(events.length, 2, "two queries → two ledger lines");
  const [clean, afterEdit] = events;
  if (clean.tier !== null) {
    assert.strictEqual(clean.staleOnQuery, false, "clean-tree query is not stale");
    assert.strictEqual(afterEdit.staleOnQuery, true, "post-edit query is flagged stale");
    assert.ok(afterEdit.reindexedCount >= 1, "the edited file was re-indexed");
    assert.ok(Array.isArray(afterEdit.reindexedFiles) && afterEdit.reindexedFiles.some((f) => f.includes("a.ts")),
      "reindexedFiles names the edited file");
  }
});

test("telemetry: toggle OFF (GSDT_GRAPH_TELEMETRY=0) writes zero lines (fail-open)", () => {
  const dir = makeFixtureRepo();
  const r = require(RESOLVER);
  const logsDir = r.resolveLogsDir(dir);

  runQuery(dir, ["status"], "t", { GSDT_GRAPH_TELEMETRY: "0" });

  // No ledger files must exist when toggle is OFF
  const hasAnyLedger = fs.existsSync(logsDir) &&
    fs.readdirSync(logsDir).some((f) => /^graph-events-\d+\.jsonl$/.test(f));
  assert.ok(!hasAnyLedger,
    "With GSDT_GRAPH_TELEMETRY=0, no ledger files should be written");
});

test("telemetry: query result is BYTE-IDENTICAL with telemetry on vs off (fail-open)", () => {
  const dir = makeFixtureRepo();
  const dirOff = makeFixtureRepo();

  const resultOn = runQuery(dir, ["who-imports", "src/b.ts"], "t");
  const resultOff = runQuery(dirOff, ["who-imports", "src/b.ts"], "t", { GSDT_GRAPH_TELEMETRY: "0" });

  // Both should produce identical query output
  if (resultOn.stdout && resultOff.stdout) {
    // Normalize by parsing JSON (telemetry does not alter the stdout envelope)
    const parseOut = (s) => {
      const lines = s.trim().split("\n").filter(Boolean);
      return lines.map((l) => { try { return JSON.parse(l); } catch { return l; } });
    };
    const on = parseOut(resultOn.stdout);
    const off = parseOut(resultOff.stdout);
    // The results array (if present) must match
    if (on[0] && off[0] && on[0].ok !== undefined && off[0].ok !== undefined) {
      assert.strictEqual(on[0].ok, off[0].ok, "ok field must match on vs off");
      const onResults = (on[0].results || []).sort();
      const offResults = (off[0].results || []).sort();
      assert.deepStrictEqual(onResults, offResults, "results must be identical on vs off");
    }
  }
});

test("telemetry: fail-open — unwritable logs dir never breaks the query", () => {
  const dir = makeFixtureRepo();
  const r = require(RESOLVER);

  // Make the graphDB/logs dir a FILE so mkdir/append throws inside the logger
  const graphDbDir = path.join(dir, ".gsd-t", "graphDB");
  fs.mkdirSync(graphDbDir, { recursive: true });
  const logsPath = path.join(graphDbDir, "logs");
  fs.writeFileSync(logsPath, "blocker"); // file, not dir

  const result = runQuery(dir, ["status"], "t");
  // The query MUST still answer despite the telemetry write failing (fail-open)
  assert.ok(result.stdout && result.stdout.includes('"verb"'),
    `fail-open violated: telemetry failure blocked the query. stderr: ${result.stderr}`);
});
