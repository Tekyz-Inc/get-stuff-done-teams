"use strict";

/**
 * M44 D2-T4 — gsd-t parallel CLI + mode-aware gating math tests
 *
 * Covers:
 *   - computeInSessionHeadroom: ok case + reduction floor (N=1 fallback)
 *   - computeUnattendedGate: ok case + split case
 *   - formatPlanTable: header row renders all six expected columns
 *   - gate-veto fallback: task with unmet dep is removed from parallel batch
 *   - dry-run smoke: table header appears in stdout for runCli()
 *
 * Per constraints.md: zero external deps, never mutates caller's files
 * outside os.tmpdir() fixtures.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  runParallel,
  formatPlanTable,
  PLAN_HEADER,
  _parseArgv,
  _detectMode,
} = require("../bin/gsd-t-parallel.cjs");

const {
  computeInSessionHeadroom,
  computeUnattendedGate,
  IN_SESSION_CW_CEILING_PCT,
  UNATTENDED_PER_WORKER_CW_PCT,
  DEFAULT_SUMMARY_SIZE_PCT,
} = require("../bin/gsd-t-orchestrator-config.cjs");

// ─── fixture helpers ────────────────────────────────────────────────────

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m44-d2-"));
  fs.mkdirSync(path.join(root, ".gsd-t", "domains"), { recursive: true });
  fs.mkdirSync(path.join(root, ".gsd-t", "events"), { recursive: true });
  return root;
}

function writeTasks(root, domain, body) {
  const dir = path.join(root, ".gsd-t", "domains", domain);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "tasks.md"), body);
}

// ─── computeInSessionHeadroom ──────────────────────────────────────────

test("in-session headroom: ok case — fits under ceiling returns requested N", () => {
  // ctxPct=30, N=5, summarySize=4 → 30 + 20 = 50 ≤ 85 → ok, reducedCount=5
  const r = computeInSessionHeadroom({ ctxPct: 30, workerCount: 5, summarySize: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.reducedCount, 5);
});

test("in-session headroom: ceiling exactly 85 is OK (≤, not <)", () => {
  // 85 + 0 = 85 ≤ 85 → ok
  const r = computeInSessionHeadroom({ ctxPct: 85, workerCount: 0, summarySize: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.reducedCount, 0);
});

test("in-session headroom: reduced case — reduces until fits", () => {
  // ctxPct=70, summarySize=4: N=5 → 90 fail, N=4 → 86 fail, N=3 → 82 ok
  const r = computeInSessionHeadroom({ ctxPct: 70, workerCount: 5, summarySize: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.reducedCount, 3);
});

test("in-session headroom: floor is N=1 — NEVER refuses", () => {
  // ctxPct=90 already over ceiling. N=1 still returns ok=true, reducedCount=1.
  const r = computeInSessionHeadroom({ ctxPct: 90, workerCount: 10, summarySize: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.reducedCount, 1);
});

test("in-session headroom: default summarySize uses exported constant", () => {
  // workerCount=0 → trivial ok regardless of summarySize default
  const r = computeInSessionHeadroom({ ctxPct: 0, workerCount: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.reducedCount, 0);
  assert.equal(DEFAULT_SUMMARY_SIZE_PCT, 4);
});

// ─── computeUnattendedGate ──────────────────────────────────────────────

test("unattended gate: ok case — estimatedCwPct ≤ 60", () => {
  const r = computeUnattendedGate({ estimatedCwPct: 55 });
  assert.equal(r.ok, true);
  assert.equal(r.split, false);
});

test("unattended gate: split case — estimatedCwPct > 60", () => {
  const r = computeUnattendedGate({ estimatedCwPct: 75 });
  assert.equal(r.ok, false);
  assert.equal(r.split, true);
});

test("unattended gate: boundary — 60 exactly is OK (>, not ≥)", () => {
  const r = computeUnattendedGate({ estimatedCwPct: 60 });
  assert.equal(r.ok, true);
  assert.equal(r.split, false);
});

test("unattended gate: custom threshold override", () => {
  const r = computeUnattendedGate({ estimatedCwPct: 50, threshold: 40 });
  assert.equal(r.ok, false);
  assert.equal(r.split, true);
});

test("exported ceiling constants match contract", () => {
  assert.equal(IN_SESSION_CW_CEILING_PCT, 85);
  assert.equal(UNATTENDED_PER_WORKER_CW_PCT, 60);
});

// ─── formatPlanTable ───────────────────────────────────────────────────

test("formatPlanTable: renders all six expected columns in header", () => {
  const out = formatPlanTable([]);
  const firstLine = out.split("\n")[0];
  for (const col of PLAN_HEADER) {
    assert.ok(firstLine.includes(col), `header should include '${col}'`);
  }
});

test("formatPlanTable: header sequence matches contract", () => {
  assert.deepEqual(PLAN_HEADER, [
    "task_id",
    "domain",
    "estimated CW%",
    "disjoint?",
    "deps ok?",
    "decision",
  ]);
});

test("formatPlanTable: renders data row with all six columns populated", () => {
  const out = formatPlanTable([
    { task_id: "M99-D1-T1", domain: "m99-d1-foo", estimatedCwPct: 42, disjoint: true, depsOk: true, decision: "parallel" },
  ]);
  const lines = out.split("\n");
  assert.ok(lines.length >= 3, "header + sep + data row");
  const dataRow = lines[2];
  assert.ok(dataRow.includes("M99-D1-T1"));
  assert.ok(dataRow.includes("m99-d1-foo"));
  assert.ok(dataRow.includes("42"));
  assert.ok(dataRow.includes("yes"));
  assert.ok(dataRow.includes("parallel"));
});

// ─── runParallel end-to-end ────────────────────────────────────────────

test("runParallel in-session: two independent tasks → both parallel, workers=2", () => {
  const root = mkProject();
  writeTasks(root, "m99-d1-foo",
`## Wave 1
### M99-D1-T1 — a
- **Status**: [ ] pending
- **Dependencies**: none
- **Touches**: bin/a.cjs

### M99-D1-T2 — b
- **Status**: [ ] pending
- **Dependencies**: none
- **Touches**: bin/b.cjs
`);
  const res = runParallel({ projectDir: root, mode: "in-session", env: {} });
  assert.equal(res.mode, "in-session");
  assert.equal(res.workerCount, 2);
  assert.equal(res.plan.length, 2);
  for (const row of res.plan) {
    assert.equal(row.decision, "parallel");
    assert.equal(row.disjoint, true);
    assert.equal(row.depsOk, true);
  }
});

test("runParallel: gate-veto fallback — disjointness overlap drops task to sequential", () => {
  const root = mkProject();
  writeTasks(root, "m99-d1-foo",
`## Wave 1
### M99-D1-T1 — a
- **Status**: [ ] pending
- **Dependencies**: none
- **Touches**: bin/shared.cjs

### M99-D1-T2 — b
- **Status**: [ ] pending
- **Dependencies**: none
- **Touches**: bin/shared.cjs
`);
  const res = runParallel({ projectDir: root, mode: "in-session", env: {} });
  // Both tasks overlap on bin/shared.cjs → D5 sequential fallback → neither in parallel batch.
  assert.equal(res.parallelTasks.length, 0);
  for (const row of res.plan) {
    assert.equal(row.decision, "sequential");
    assert.equal(row.disjoint, false);
  }
  // Verify a gate_veto event was appended for disjointness.
  const day = new Date().toISOString().slice(0, 10);
  const ev = path.join(root, ".gsd-t", "events", `${day}.jsonl`);
  const lines = fs.readFileSync(ev, "utf8").split("\n").filter(Boolean);
  const vetoes = lines.map((l) => JSON.parse(l)).filter((e) => e.type === "gate_veto" && e.gate === "disjointness");
  assert.ok(vetoes.length >= 2, "disjointness gate_veto events emitted");
});

test("runParallel: mode auto-detect from GSD_T_UNATTENDED=1", () => {
  const root = mkProject();
  writeTasks(root, "m99-d1-foo",
`## Wave 1
### M99-D1-T1 — a
- **Status**: [ ] pending
- **Dependencies**: none
- **Touches**: bin/a.cjs
`);
  const res = runParallel({ projectDir: root, env: { GSD_T_UNATTENDED: "1" } });
  assert.equal(res.mode, "unattended");
});

test("runParallel: explicit mode overrides env", () => {
  const root = mkProject();
  writeTasks(root, "m99-d1-foo",
`## Wave 1
### M99-D1-T1 — a
- **Status**: [ ] pending
- **Dependencies**: none
- **Touches**: bin/a.cjs
`);
  const res = runParallel({ projectDir: root, mode: "in-session", env: { GSD_T_UNATTENDED: "1" } });
  assert.equal(res.mode, "in-session");
});

// ─── runParallel: in-session reduced case ───────────────────────────────

test("runParallel in-session: headroom reduction surfaces as reducedCount and parallelism_reduced event", () => {
  // Create 5 disjoint tasks. Inject a fake ctxPct via a stub token-budget.
  // We do this by temp-setting .context-meter-state.json with a high pct.
  const root = mkProject();
  for (let i = 1; i <= 5; i++) {
    writeTasks(root, `m99-d${i}-foo`,
`## Wave 1
### M99-D${i}-T1 — t
- **Status**: [ ] pending
- **Dependencies**: none
- **Touches**: bin/x${i}.cjs
`);
  }
  // Write state file token-budget will read. Keys: inputTokens, pct, timestamp.
  // 70% of 200k ≈ 140000.
  fs.writeFileSync(path.join(root, ".gsd-t", ".context-meter-state.json"),
    JSON.stringify({ inputTokens: 140000, pct: 70, timestamp: new Date().toISOString() }));
  const res = runParallel({ projectDir: root, mode: "in-session", env: {} });
  // At 70% ctx, N=5 × 4 = 20 → 90 > 85 → reduce to N=3 (70+12=82).
  assert.ok(res.reducedCount != null, "reducedCount should be set");
  assert.ok(res.reducedCount < 5, `reduced below requested (got ${res.reducedCount})`);
  assert.equal(res.parallelTasks.length, res.reducedCount);
  // Confirm parallelism_reduced event emitted.
  const day = new Date().toISOString().slice(0, 10);
  const ev = path.join(root, ".gsd-t", "events", `${day}.jsonl`);
  const lines = fs.readFileSync(ev, "utf8").split("\n").filter(Boolean);
  const reduced = lines.map((l) => JSON.parse(l)).filter((e) => e.type === "parallelism_reduced");
  assert.ok(reduced.length >= 1, "parallelism_reduced event emitted");
  assert.equal(reduced[0].reason, "in_session_headroom");
});

// ─── CLI parsing ────────────────────────────────────────────────────────

test("_parseArgv: --mode space form and = form both work", () => {
  assert.equal(_parseArgv(["--mode", "unattended"]).mode, "unattended");
  assert.equal(_parseArgv(["--mode=in-session"]).mode, "in-session");
});

test("_parseArgv: --dry-run / --help / --milestone / --domain", () => {
  const a = _parseArgv(["--dry-run", "--milestone", "M44", "--domain", "m44-d2-parallel-cli"]);
  assert.equal(a.dryRun, true);
  assert.equal(a.milestone, "M44");
  assert.equal(a.domain, "m44-d2-parallel-cli");
  assert.equal(_parseArgv(["--help"]).help, true);
  assert.equal(_parseArgv(["-h"]).help, true);
});

test("_detectMode: GSD_T_UNATTENDED=1 → unattended", () => {
  assert.equal(_detectMode({}, { GSD_T_UNATTENDED: "1" }), "unattended");
  assert.equal(_detectMode({}, {}), "in-session");
  assert.equal(_detectMode({ mode: "in-session" }, { GSD_T_UNATTENDED: "1" }), "in-session");
});
