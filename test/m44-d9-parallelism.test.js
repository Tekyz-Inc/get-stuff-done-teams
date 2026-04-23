/**
 * test/m44-d9-parallelism.test.js
 *
 * Unit tests for bin/parallelism-report.cjs (M44 D9 T1) and the
 * /api/parallelism* endpoints wired into scripts/gsd-t-dashboard-server.js
 * (M44 D9 T2).
 *
 * Contract: .gsd-t/contracts/parallelism-report-contract.md v1.0.0
 * Scope:    .gsd-t/domains/m44-d9-parallelism-observability/scope.md §Tests
 *
 *   1. computeParallelismMetrics shape with synthetic fixtures
 *   2. parallelism_factor math (live + post-wave, 1/4/mixed-duration)
 *   3. color_state thresholds at boundaries
 *   4. silent-fail on malformed spawn-plan / event JSONL
 *   5. Full Report markdown contains all required sections
 *   6. /api/parallelism endpoint returns expected shape
 */

"use strict";

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const {
  computeParallelismMetrics,
  buildFullReport,
  SCHEMA_VERSION,
  _computeColorState,
  _computeParallelismFactor,
} = require("../bin/parallelism-report.cjs");

const { startServer } = require("../scripts/gsd-t-dashboard-server.js");

// ── helpers ─────────────────────────────────────────────────────────────────

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-d9-"));
  fs.mkdirSync(path.join(tmp, ".gsd-t", "spawns"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".gsd-t", "events"), { recursive: true });
  fs.mkdirSync(path.join(tmp, ".gsd-t", "domains"), { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

function writeSpawnPlan(name, plan) {
  fs.writeFileSync(path.join(tmp, ".gsd-t", "spawns", name + ".json"), JSON.stringify(plan));
}

function writeDomainTasks(domain, body) {
  const d = path.join(tmp, ".gsd-t", "domains", domain);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "tasks.md"), body);
}

function writeEventsLine(day, obj) {
  const f = path.join(tmp, ".gsd-t", "events", day + ".jsonl");
  fs.appendFileSync(f, JSON.stringify(obj) + "\n");
}

function iso(offsetSec, from) {
  const base = from ? from.getTime() : Date.now();
  return new Date(base + offsetSec * 1000).toISOString();
}

function httpGet(port, url) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: url }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", reject);
  });
}

// ── 1. Metrics shape ───────────────────────────────────────────────────────

test("computeParallelismMetrics returns stable shape with all required keys", () => {
  const m = computeParallelismMetrics({ projectDir: tmp });
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.equal(typeof m.generatedAt, "string");
  assert.ok(m.generatedAt.endsWith("Z"), "generatedAt is ISO-Z");
  assert.equal(m.activeWorkers, 0);
  assert.equal(m.readyTasks, 0);
  assert.equal(m.parallelism_factor, 0);
  assert.equal(m.parallelism_factor_mode, "idle");
  assert.equal(m.color_state, "dimmed", "no spawn-plan files => dimmed");
  assert.equal(m.lastSpawnAt, null);
  assert.deepEqual(m.activeSpawnAges_s, []);
  assert.ok(m.gate_decisions, "gate_decisions present");
  for (const k of ["dep_gate_veto", "disjointness_fallback", "economics_decision"]) {
    assert.ok(m.gate_decisions[k], "gate." + k);
  }
  assert.deepEqual(
    Object.keys(m.gate_decisions.economics_decision.confidence_distribution).sort(),
    ["FALLBACK", "HIGH", "LOW", "MEDIUM"],
  );
});

test("readyTasks counts Shape-C bullets in domain tasks.md", () => {
  writeDomainTasks("d-alpha", [
    "# Tasks",
    "- [ ] **M44-D1-T1** — ready",
    "- [x] **M44-D1-T2** — done",
    "- [ ] **M44-D1-T3** — ready",
  ].join("\n"));
  writeDomainTasks("d-beta", [
    "- [ ] **M45-D2-T1** — ready",
  ].join("\n"));
  const m = computeParallelismMetrics({ projectDir: tmp });
  assert.equal(m.readyTasks, 3, "2 from alpha + 1 from beta (T2 is done)");
});

// ── 2. parallelism_factor math ─────────────────────────────────────────────

test("parallelism_factor: live single worker = 1.0", () => {
  const now = new Date("2026-04-23T12:00:00Z");
  writeSpawnPlan("w1", { id: "w1", startedAt: iso(-300, now), endedAt: null });
  const m = computeParallelismMetrics({ projectDir: tmp, now });
  assert.equal(m.activeWorkers, 1);
  assert.equal(m.parallelism_factor_mode, "live");
  assert.equal(m.parallelism_factor, 1);
});

test("parallelism_factor: live 4 equal-age workers ≈ 4.0", () => {
  const now = new Date("2026-04-23T12:00:00Z");
  for (let i = 0; i < 4; i++) {
    writeSpawnPlan("w" + i, { id: "w" + i, startedAt: iso(-300, now), endedAt: null });
  }
  const m = computeParallelismMetrics({ projectDir: tmp, now });
  assert.equal(m.activeWorkers, 4);
  assert.ok(Math.abs(m.parallelism_factor - 4) < 0.01, "4 workers same age ≈ 4.0, got " + m.parallelism_factor);
});

test("parallelism_factor: live mixed-duration — sum/max", () => {
  const now = new Date("2026-04-23T12:00:00Z");
  writeSpawnPlan("w1", { id: "w1", startedAt: iso(-600, now), endedAt: null });  // 600s
  writeSpawnPlan("w2", { id: "w2", startedAt: iso(-300, now), endedAt: null });  // 300s
  writeSpawnPlan("w3", { id: "w3", startedAt: iso(-300, now), endedAt: null });  // 300s
  const m = computeParallelismMetrics({ projectDir: tmp, now });
  // sum=1200, max=600 => 2.0
  assert.ok(Math.abs(m.parallelism_factor - 2) < 0.01, "mixed-duration => 2.0, got " + m.parallelism_factor);
});

test("parallelism_factor: post-wave mode across ended spawns in wave", () => {
  const now = new Date("2026-04-23T12:00:00Z");
  // Wave 3 ran from t-1200 to t-0, with two workers running in parallel.
  writeSpawnPlan("w1", {
    id: "w1", wave: "wave-3",
    startedAt: iso(-1200, now), endedAt: iso(-600, now), // 600s
  });
  writeSpawnPlan("w2", {
    id: "w2", wave: "wave-3",
    startedAt: iso(-1000, now), endedAt: iso(-400, now), // 600s
  });
  const m = computeParallelismMetrics({ projectDir: tmp, wave: "wave-3", now });
  assert.equal(m.activeWorkers, 0);
  assert.equal(m.parallelism_factor_mode, "post-wave");
  // sumDur=1200, span=1200-400=800 => 1.5
  assert.ok(Math.abs(m.parallelism_factor - 1.5) < 0.01, "post-wave factor ≈ 1.5, got " + m.parallelism_factor);
});

// ── 3. color_state thresholds ──────────────────────────────────────────────

test("color_state: dimmed when no spawns exist (not red)", () => {
  writeDomainTasks("d-x", "- [ ] **M1-D1-T1** — ready");
  const m = computeParallelismMetrics({ projectDir: tmp });
  assert.equal(m.color_state, "dimmed");
});

test("color_state: green at >=80% worker/ready ratio + recent spawn", () => {
  const now = new Date("2026-04-23T12:00:00Z");
  writeDomainTasks("d-x", [
    "- [ ] **M1-D1-T1**",
    "- [ ] **M1-D1-T2**",
    "- [ ] **M1-D1-T3**",
    "- [ ] **M1-D1-T4**",
    "- [ ] **M1-D1-T5**",
  ].join("\n"));
  for (let i = 0; i < 4; i++) {
    writeSpawnPlan("w" + i, { id: "w" + i, startedAt: iso(-60, now), endedAt: null });
  }
  const m = computeParallelismMetrics({ projectDir: tmp, now });
  // 4/5 = 80% => green on signal 1, fresh spawns => green on signal 5, no gate => skip, same-age factor=4/4=1 => green
  assert.equal(m.color_state, "green");
});

test("color_state: red when ready>0, last spawn >10min ago, 0 active workers", () => {
  const now = new Date("2026-04-23T12:00:00Z");
  writeDomainTasks("d-x", [
    "- [ ] **M1-D1-T1**",
    "- [ ] **M1-D1-T2**",
  ].join("\n"));
  // Spawn ended 15 min ago
  writeSpawnPlan("w1", {
    id: "w1",
    startedAt: iso(-1800, now),
    endedAt: iso(-900, now),
  });
  const m = computeParallelismMetrics({ projectDir: tmp, now });
  assert.equal(m.activeWorkers, 0);
  assert.equal(m.color_state, "red", "2 ready tasks, last spawn 15 min ago => red");
});

test("_computeColorState returns dimmed when noSpawns flag set", () => {
  const state = _computeColorState({
    activeWorkers: 0, readyTasks: 5,
    gate: { dep_gate_veto: { count: 0 }, disjointness_fallback: { count: 0 }, economics_decision: { count: 0 } },
    factor: { value: 0, mode: "idle" },
    activeSpawnAges_s: [], lastSpawnAt: null,
    now: new Date(), noSpawns: true,
  });
  assert.equal(state, "dimmed");
});

// ── 4. silent-fail rules ───────────────────────────────────────────────────

test("silent-fail: malformed spawn-plan JSON is skipped, not thrown", () => {
  fs.writeFileSync(path.join(tmp, ".gsd-t", "spawns", "broken.json"), "{ not json");
  const now = new Date("2026-04-23T12:00:00Z");
  writeSpawnPlan("ok", { id: "ok", startedAt: iso(-60, now), endedAt: null });
  // Must not throw.
  const m = computeParallelismMetrics({ projectDir: tmp, now });
  assert.equal(m.activeWorkers, 1, "good plan counted, bad one skipped");
});

test("silent-fail: corrupt event JSONL line parses valid lines only", () => {
  const now = new Date("2026-04-23T12:00:00Z");
  const today = now.toISOString().slice(0, 10);
  writeEventsLine(today, { ts: iso(-100, now), type: "dep_gate_veto", reason: "missing dep" });
  // Corrupt middle line
  fs.appendFileSync(
    path.join(tmp, ".gsd-t", "events", today + ".jsonl"),
    "{ broken line\n",
  );
  writeEventsLine(today, { ts: iso(-50, now), type: "economics_decision", confidence: "HIGH" });
  const m = computeParallelismMetrics({ projectDir: tmp, now });
  assert.equal(m.gate_decisions.dep_gate_veto.count, 1);
  assert.equal(m.gate_decisions.economics_decision.count, 1);
  assert.equal(m.gate_decisions.economics_decision.confidence_distribution.HIGH, 1);
});

test("silent-fail: missing .gsd-t/domains => readyTasks 0, no throw", () => {
  fs.rmSync(path.join(tmp, ".gsd-t", "domains"), { recursive: true, force: true });
  const m = computeParallelismMetrics({ projectDir: tmp });
  assert.equal(m.readyTasks, 0);
});

// ── 5. Full Report markdown ────────────────────────────────────────────────

test("buildFullReport markdown contains all required sections", () => {
  const now = new Date("2026-04-23T12:00:00Z");
  writeSpawnPlan("w1", {
    id: "w1", wave: "wave-3",
    startedAt: iso(-600, now), endedAt: iso(-0, now),
    kind: "worker", tasks: ["M44-D9-T1"],
  });
  writeSpawnPlan("w2", {
    id: "w2", wave: "wave-3",
    startedAt: iso(-500, now), endedAt: iso(-100, now),
    kind: "worker", tasks: ["M44-D9-T2"],
  });
  writeDomainTasks("d-x", "- [ ] **M44-D9-T3**");
  const md = buildFullReport({ projectDir: tmp, wave: "wave-3", now });
  assert.ok(md.startsWith("# Parallelism Report"), "title line");
  assert.match(md, /wave-3/, "wave in heading");
  assert.match(md, /## Summary/);
  assert.match(md, /## Per-spawn timeline/);
  assert.match(md, /## Per-gate decisions/);
  assert.match(md, /## Per-worker Gantt/);
  assert.match(md, /## Token cost/i);
  assert.match(md, /## Notes/);
});

// ── 6. Dashboard endpoint shape ────────────────────────────────────────────

test("GET /api/parallelism returns JSON with expected shape + cache headers", async () => {
  const now = new Date();
  writeSpawnPlan("w1", { id: "w1", startedAt: iso(-120, now), endedAt: null });

  const eventsDir = path.join(tmp, ".gsd-t", "events");
  const htmlPath = path.join(__dirname, "..", "scripts", "gsd-t-dashboard.html");
  const tHtmlPath = path.join(__dirname, "..", "scripts", "gsd-t-transcript.html");

  const { server } = startServer(0, eventsDir, htmlPath, tmp, tHtmlPath);
  const port = server.address().port;

  try {
    const r1 = await httpGet(port, "/api/parallelism");
    assert.equal(r1.status, 200);
    assert.equal(r1.headers["content-type"], "application/json");
    assert.equal(r1.headers["x-cache"], "miss");
    const body = JSON.parse(r1.body);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.activeWorkers, 1);
    assert.equal(typeof body.generatedAt, "string");
    assert.ok(Array.isArray(body.activeSpawnAges_s));
    assert.ok(body.gate_decisions);
    assert.ok(["green", "yellow", "red", "dimmed"].includes(body.color_state));

    const r2 = await httpGet(port, "/api/parallelism");
    assert.equal(r2.status, 200);
    assert.equal(r2.headers["x-cache"], "hit", "within 5s window => cache hit");
  } finally {
    server.close();
  }
});

test("GET /api/parallelism/report returns text/markdown with Summary section", async () => {
  const eventsDir = path.join(tmp, ".gsd-t", "events");
  const htmlPath = path.join(__dirname, "..", "scripts", "gsd-t-dashboard.html");
  const tHtmlPath = path.join(__dirname, "..", "scripts", "gsd-t-transcript.html");

  const { server } = startServer(0, eventsDir, htmlPath, tmp, tHtmlPath);
  const port = server.address().port;

  try {
    const r = await httpGet(port, "/api/parallelism/report");
    assert.equal(r.status, 200);
    assert.match(r.headers["content-type"], /text\/markdown/);
    assert.match(r.body, /# Parallelism Report/);
    assert.match(r.body, /## Summary/);
  } finally {
    server.close();
  }
});
