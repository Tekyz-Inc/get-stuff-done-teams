/**
 * Tests for bin/token-budget.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  estimateCost,
  getSessionStatus,
  recordUsage,
  getDegradationActions,
  estimateMilestoneCost,
  getModelCostRatios,
} = require("../bin/token-budget.js");

let tmpDir;
const ORIG_MAX = process.env.CLAUDE_CONTEXT_TOKENS_MAX;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (ORIG_MAX === undefined) delete process.env.CLAUDE_CONTEXT_TOKENS_MAX;
  else process.env.CLAUDE_CONTEXT_TOKENS_MAX = ORIG_MAX;
});

function writeTokenLog(rows) {
  const fp = path.join(tmpDir, ".gsd-t", "token-log.md");
  const header = "| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |\n|----------------|--------------|---------|------|-------|-------------|-------|--------|-----------|--------|------|------|\n";
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  fs.writeFileSync(fp, header + body + "\n");
}

function setMaxTokens(n) {
  process.env.CLAUDE_CONTEXT_TOKENS_MAX = String(n);
}

// ── getModelCostRatios ────────────────────────────────────────────────────────

describe("getModelCostRatios", () => {
  it("returns correct ratios for all models", () => {
    const ratios = getModelCostRatios();
    assert.equal(ratios.haiku, 1);
    assert.equal(ratios.sonnet, 5);
    assert.equal(ratios.opus, 25);
  });

  it("returns an object with exactly 3 keys", () => {
    const ratios = getModelCostRatios();
    assert.equal(Object.keys(ratios).length, 3);
  });

  it("returns a copy — mutating does not affect subsequent calls", () => {
    const r1 = getModelCostRatios();
    r1.haiku = 999;
    const r2 = getModelCostRatios();
    assert.equal(r2.haiku, 1);
  });
});

// ── estimateCost ──────────────────────────────────────────────────────────────

describe("estimateCost", () => {
  it("returns higher cost for opus than sonnet than haiku", () => {
    const h = estimateCost("haiku", "execute");
    const s = estimateCost("sonnet", "execute");
    const o = estimateCost("opus", "execute");
    assert.ok(h < s, "haiku should be cheaper than sonnet");
    assert.ok(s < o, "sonnet should be cheaper than opus");
  });

  it("applies model ratio correctly (sonnet=5x haiku)", () => {
    const h = estimateCost("haiku", "execute");
    const s = estimateCost("sonnet", "execute");
    assert.equal(s, h * 5);
  });

  it("applies model ratio correctly (opus=25x haiku)", () => {
    const h = estimateCost("haiku", "execute");
    const o = estimateCost("opus", "execute");
    assert.equal(o, h * 25);
  });

  it("uses historicalAvg when provided", () => {
    const cost = estimateCost("sonnet", "qa", { historicalAvg: 1000 });
    assert.equal(cost, 1000 * 5); // sonnet ratio = 5
  });

  it("applies complexity multiplier", () => {
    const base = estimateCost("haiku", "execute", { complexity: 1.0 });
    const complex = estimateCost("haiku", "execute", { complexity: 2.0 });
    assert.equal(complex, base * 2);
  });

  it("returns a positive integer", () => {
    const cost = estimateCost("sonnet", "execute");
    assert.ok(cost > 0);
    assert.equal(Math.round(cost), cost);
  });

  it("handles unknown task type with default estimate", () => {
    const cost = estimateCost("haiku", "unknown-task-type");
    assert.ok(cost > 0);
  });

  it("uses historical average from token-log.md when available", () => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const d = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    writeTokenLog([
      [`${d} 10:00`, `${d} 10:01`, "gsd-t-execute", "Step 1", "haiku", "60s", "test", "12000", "null", "", "execute", "N/A"],
    ]);
    const cost = estimateCost("haiku", "execute", { projectDir: tmpDir });
    assert.equal(cost, 12000);
  });
});

// ── getSessionStatus ─────────────────────────────────────────────────────────

describe("getSessionStatus", () => {
  it("returns 'normal' when pct < 60", () => {
    setMaxTokens(200000);
    writeTokenLog([]); // no today entries → consumed = 0
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "normal");
    assert.equal(status.consumed, 0);
    assert.equal(status.pct, 0);
  });

  it("returns 'warn' when pct is 60-70", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "65000", "null", "", "execute", "N/A"],
    ]);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "warn");
  });

  it("returns 'downgrade' when pct is 70-85", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "75000", "null", "", "execute", "N/A"],
    ]);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "downgrade");
  });

  it("returns 'conserve' when pct is 85-95", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "90000", "null", "", "execute", "N/A"],
    ]);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "conserve");
  });

  it("returns 'stop' when pct > 95", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "96000", "null", "", "execute", "N/A"],
    ]);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "stop");
  });

  it("sums multiple today entries", () => {
    setMaxTokens(200000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "10000", "null", "", "execute", "N/A"],
      [`${today} 11:00`, `${today} 11:01`, "gsd-t-execute", "Step 2", "haiku", "30s", "note", "5000", "null", "", "qa", "N/A"],
    ]);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.consumed, 15000);
  });

  it("ignores entries from other dates", () => {
    setMaxTokens(200000);
    const today = getTodayStr();
    writeTokenLog([
      ["2020-01-01 10:00", "2020-01-01 10:01", "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "50000", "null", "", "execute", "N/A"],
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "3000", "null", "", "execute", "N/A"],
    ]);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.consumed, 3000);
  });

  it("returns estimated_remaining = max - consumed", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "20000", "null", "", "execute", "N/A"],
    ]);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.estimated_remaining, 80000);
  });
});

// ── getDegradationActions ─────────────────────────────────────────────────────

describe("getDegradationActions", () => {
  it("returns empty actions at normal threshold", () => {
    setMaxTokens(200000);
    writeTokenLog([]);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "normal");
    assert.equal(result.actions.length, 0);
    assert.deepEqual(result.modelOverrides, {});
  });

  it("returns budget alert action at warn threshold", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "62000", "null", "", "execute", "N/A"],
    ]);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "warn");
    assert.ok(result.actions.length > 0);
    assert.ok(result.actions.some((a) => /budget/i.test(a) || /alert/i.test(a)));
  });

  it("returns sonnet:execute → haiku override at downgrade threshold", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "75000", "null", "", "execute", "N/A"],
    ]);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "downgrade");
    assert.equal(result.modelOverrides["sonnet:execute"], "haiku");
  });

  it("keeps sonnet for QA at downgrade threshold", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "75000", "null", "", "execute", "N/A"],
    ]);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.modelOverrides["sonnet:qa"], "sonnet");
  });

  it("downgrades opus red-team to sonnet at downgrade", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "75000", "null", "", "execute", "N/A"],
    ]);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.modelOverrides["opus:red-team"], "sonnet");
  });

  it("pauses doc-ripple at conserve threshold", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "90000", "null", "", "execute", "N/A"],
    ]);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "conserve");
    assert.ok(result.actions.some((a) => /doc-ripple/i.test(a)));
  });

  it("returns hard stop action at stop threshold", () => {
    setMaxTokens(100000);
    const today = getTodayStr();
    writeTokenLog([
      [`${today} 10:00`, `${today} 10:01`, "gsd-t-execute", "Step 1", "sonnet", "60s", "note", "96000", "null", "", "execute", "N/A"],
    ]);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "stop");
    assert.ok(result.actions.some((a) => /stop/i.test(a) || /save/i.test(a)));
  });
});

// ── recordUsage ──────────────────────────────────────────────────────────────

describe("recordUsage", () => {
  it("creates token-log.md if it does not exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-rec-"));
    fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
    recordUsage({ model: "sonnet", taskType: "execute", tokens: 5000, duration_s: 60, projectDir: dir });
    assert.ok(fs.existsSync(path.join(dir, ".gsd-t", "token-log.md")));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("appends a row with the correct token count", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-rec2-"));
    fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
    recordUsage({ model: "haiku", taskType: "qa", tokens: 3000, duration_s: 30, projectDir: dir });
    const contents = fs.readFileSync(path.join(dir, ".gsd-t", "token-log.md"), "utf8");
    assert.ok(contents.includes("3000"));
    assert.ok(contents.includes("haiku"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not throw on repeated calls", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-rec3-"));
    fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
    assert.doesNotThrow(() => {
      recordUsage({ model: "sonnet", taskType: "execute", tokens: 1000, duration_s: 10, projectDir: dir });
      recordUsage({ model: "haiku", taskType: "qa", tokens: 500, duration_s: 5, projectDir: dir });
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── estimateMilestoneCost ─────────────────────────────────────────────────────

describe("estimateMilestoneCost", () => {
  it("returns estimatedTokens as sum of task estimates", () => {
    setMaxTokens(1000000);
    writeTokenLog([]);
    const tasks = [
      { model: "haiku", taskType: "execute", complexity: 1.0 },
      { model: "haiku", taskType: "qa", complexity: 1.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    const expected = estimateCost("haiku", "execute") + estimateCost("haiku", "qa");
    assert.equal(result.estimatedTokens, expected);
  });

  it("returns feasible=true when estimated cost is within 80% of remaining", () => {
    setMaxTokens(1000000);
    writeTokenLog([]);
    const tasks = [{ model: "haiku", taskType: "execute", complexity: 1.0 }];
    const result = estimateMilestoneCost(tasks, tmpDir);
    assert.equal(result.feasible, true);
  });

  it("returns feasible=false when estimated cost exceeds 80% of remaining", () => {
    setMaxTokens(10000);
    writeTokenLog([]); // consumed = 0, remaining = 10000
    // estimateCost("opus", "execute") = 8000 * 25 = 200000, which exceeds 10000
    const tasks = [{ model: "opus", taskType: "execute", complexity: 1.0 }];
    const result = estimateMilestoneCost(tasks, tmpDir);
    assert.equal(result.feasible, false);
  });

  it("returns estimatedPct as percentage of max tokens", () => {
    setMaxTokens(100000);
    writeTokenLog([]);
    const tasks = [{ model: "haiku", taskType: "execute", complexity: 1.0 }];
    const result = estimateMilestoneCost(tasks, tmpDir);
    const expectedPct = Math.round((result.estimatedTokens / 100000) * 100 * 10) / 10;
    assert.equal(result.estimatedPct, expectedPct);
  });

  it("returns zero tokens for empty task list", () => {
    setMaxTokens(200000);
    writeTokenLog([]);
    const result = estimateMilestoneCost([], tmpDir);
    assert.equal(result.estimatedTokens, 0);
    assert.equal(result.estimatedPct, 0);
    assert.equal(result.feasible, true);
  });

  it("sums multiple tasks with different models", () => {
    setMaxTokens(1000000);
    writeTokenLog([]);
    const tasks = [
      { model: "haiku", taskType: "execute", complexity: 1.0 },
      { model: "sonnet", taskType: "qa", complexity: 1.0 },
      { model: "opus", taskType: "red-team", complexity: 1.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    const expected = estimateCost("haiku", "execute") + estimateCost("sonnet", "qa") + estimateCost("opus", "red-team");
    assert.equal(result.estimatedTokens, expected);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTodayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
