/**
 * Tests for bin/token-budget.js
 * Uses Node.js built-in test runner (node --test)
 *
 * v2.74.12: getSessionStatus now reads the task counter at
 * .gsd-t/.task-counter instead of CLAUDE_CONTEXT_TOKENS_* env vars
 * (which Claude Code never exported). Tests rewritten accordingly.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
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
const ORIG_LIMIT = process.env.GSD_T_TASK_LIMIT;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (ORIG_LIMIT === undefined) delete process.env.GSD_T_TASK_LIMIT;
  else process.env.GSD_T_TASK_LIMIT = ORIG_LIMIT;
});

beforeEach(() => {
  delete process.env.GSD_T_TASK_LIMIT;
});

function writeCounter(count, limit) {
  const fp = path.join(tmpDir, ".gsd-t", ".task-counter");
  fs.writeFileSync(fp, JSON.stringify({ count, started_at: new Date().toISOString() }));
  if (limit !== undefined) {
    const cfg = path.join(tmpDir, ".gsd-t", "task-counter-config.json");
    fs.writeFileSync(cfg, JSON.stringify({ limit }));
  } else {
    const cfg = path.join(tmpDir, ".gsd-t", "task-counter-config.json");
    if (fs.existsSync(cfg)) fs.unlinkSync(cfg);
  }
}

function writeTokenLog(rows) {
  const fp = path.join(tmpDir, ".gsd-t", "token-log.md");
  const header = "| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |\n|----------------|--------------|---------|------|-------|-------------|-------|--------|-----------|--------|------|------|\n";
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  fs.writeFileSync(fp, header + body + "\n");
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

describe("getSessionStatus (task-counter based)", () => {
  it("returns 'normal' when count < 60% of limit", () => {
    writeCounter(0, 10);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "normal");
    assert.equal(status.consumed, 0);
    assert.equal(status.pct, 0);
    assert.equal(status.estimated_remaining, 10);
  });

  it("returns 'warn' at 60-70% of limit", () => {
    writeCounter(6, 10); // 60%
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "warn");
  });

  it("returns 'downgrade' at 70-85% of limit", () => {
    writeCounter(7, 10); // 70%
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "downgrade");
  });

  it("returns 'conserve' at 85-95% of limit", () => {
    writeCounter(9, 10); // 90%
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "conserve");
  });

  it("returns 'stop' at >= 95% of limit", () => {
    writeCounter(10, 10); // 100%
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "stop");
  });

  it("falls back to default limit of 5 when no config exists", () => {
    writeCounter(0); // no config file
    const status = getSessionStatus(tmpDir);
    assert.equal(status.consumed, 0);
    assert.equal(status.estimated_remaining, 5);
  });

  it("respects GSD_T_TASK_LIMIT env override", () => {
    writeCounter(0, 5);
    process.env.GSD_T_TASK_LIMIT = "20";
    const status = getSessionStatus(tmpDir);
    assert.equal(status.estimated_remaining, 20);
  });

  it("computes pct as consumed / limit", () => {
    writeCounter(3, 10);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.pct, 30);
  });

  it("returns consumed=0 when counter file is missing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-empty-"));
    fs.mkdirSync(path.join(emptyDir, ".gsd-t"), { recursive: true });
    const status = getSessionStatus(emptyDir);
    assert.equal(status.consumed, 0);
    assert.equal(status.threshold, "normal");
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

// ── getDegradationActions ─────────────────────────────────────────────────────

describe("getDegradationActions", () => {
  it("returns empty actions at normal threshold", () => {
    writeCounter(0, 10);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "normal");
    assert.equal(result.actions.length, 0);
    assert.deepEqual(result.modelOverrides, {});
  });

  it("returns budget alert action at warn threshold", () => {
    writeCounter(6, 10);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "warn");
    assert.ok(result.actions.length > 0);
    assert.ok(result.actions.some((a) => /budget/i.test(a) || /alert/i.test(a)));
  });

  it("returns sonnet:execute → haiku override at downgrade threshold", () => {
    writeCounter(7, 10);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "downgrade");
    assert.equal(result.modelOverrides["sonnet:execute"], "haiku");
  });

  it("keeps sonnet for QA at downgrade threshold", () => {
    writeCounter(7, 10);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.modelOverrides["sonnet:qa"], "sonnet");
  });

  it("downgrades opus red-team to sonnet at downgrade", () => {
    writeCounter(7, 10);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.modelOverrides["opus:red-team"], "sonnet");
  });

  it("pauses doc-ripple at conserve threshold", () => {
    writeCounter(9, 10);
    const result = getDegradationActions(tmpDir);
    assert.equal(result.threshold, "conserve");
    assert.ok(result.actions.some((a) => /doc-ripple/i.test(a)));
  });

  it("returns hard stop action at stop threshold", () => {
    writeCounter(10, 10);
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
    writeCounter(0, 100);
    // Clear token-log so estimateCost doesn't use historical avg from prior tests
    fs.writeFileSync(path.join(tmpDir, ".gsd-t", "token-log.md"), "");
    const tasks = [
      { model: "haiku", taskType: "execute", complexity: 1.0 },
      { model: "haiku", taskType: "qa", complexity: 1.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    const expected = estimateCost("haiku", "execute", { projectDir: tmpDir }) + estimateCost("haiku", "qa", { projectDir: tmpDir });
    assert.equal(result.estimatedTokens, expected);
  });

  it("returns feasible=true when task-equivalents fit in remaining budget", () => {
    writeCounter(0, 10);
    const tasks = [{ model: "haiku", taskType: "execute", complexity: 1.0 }];
    const result = estimateMilestoneCost(tasks, tmpDir);
    assert.equal(result.feasible, true);
  });

  it("returns feasible=false when task count exceeds remaining budget", () => {
    writeCounter(0, 2);
    const tasks = [
      { model: "opus", taskType: "execute", complexity: 1.0 },
      { model: "opus", taskType: "execute", complexity: 1.0 },
      { model: "opus", taskType: "execute", complexity: 1.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    assert.equal(result.feasible, false);
  });

  it("returns estimatedPct as percentage of task-slot budget", () => {
    writeCounter(0, 10);
    const tasks = [
      { model: "haiku", taskType: "execute", complexity: 1.0 },
      { model: "haiku", taskType: "execute", complexity: 1.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    assert.equal(result.estimatedPct, 20); // 2 tasks / 10 limit = 20%
  });

  it("returns zero tokens for empty task list", () => {
    writeCounter(0, 10);
    const result = estimateMilestoneCost([], tmpDir);
    assert.equal(result.estimatedTokens, 0);
    assert.equal(result.estimatedPct, 0);
    assert.equal(result.feasible, true);
  });

  it("sums multiple tasks with different models", () => {
    writeCounter(0, 100);
    fs.writeFileSync(path.join(tmpDir, ".gsd-t", "token-log.md"), "");
    const tasks = [
      { model: "haiku", taskType: "execute", complexity: 1.0 },
      { model: "sonnet", taskType: "qa", complexity: 1.0 },
      { model: "opus", taskType: "red-team", complexity: 1.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    const expected = estimateCost("haiku", "execute", { projectDir: tmpDir }) + estimateCost("sonnet", "qa", { projectDir: tmpDir }) + estimateCost("opus", "red-team", { projectDir: tmpDir });
    assert.equal(result.estimatedTokens, expected);
  });
});
