/**
 * Tests for bin/token-budget.cjs
 * Uses Node.js built-in test runner (node --test)
 *
 * v3.12.0 (M38 meter reduction): single-band model (normal / threshold).
 * Three-band bands (warn, stop), stale-band, dead-meter detection, and
 * getDegradationActions export are REMOVED. The orchestrator reads the
 * band and routes spawns via autoSpawnHeadless() — the meter no longer
 * emits a degradation policy.
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
  estimateMilestoneCost,
  getModelCostRatios,
} = require("../bin/token-budget.cjs");

const MODEL_WINDOW = 200000;
const DEFAULT_THRESHOLD_PCT = 75;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const state = path.join(tmpDir, ".gsd-t", ".context-meter-state.json");
  if (fs.existsSync(state)) fs.unlinkSync(state);
  const log = path.join(tmpDir, ".gsd-t", "token-log.md");
  if (fs.existsSync(log)) fs.unlinkSync(log);
  const cfg = path.join(tmpDir, ".gsd-t", "context-meter-config.json");
  if (fs.existsSync(cfg)) fs.unlinkSync(cfg);
});

function writeState({ inputTokens, ageMs = 0, modelWindowSize = MODEL_WINDOW }) {
  const pct = (inputTokens / modelWindowSize) * 100;
  const ts = new Date(Date.now() - ageMs).toISOString();
  const payload = {
    version: 1,
    timestamp: ts,
    inputTokens,
    modelWindowSize,
    pct,
    threshold: "normal",
    checkCount: 1,
    lastError: null,
  };
  fs.writeFileSync(
    path.join(tmpDir, ".gsd-t", ".context-meter-state.json"),
    JSON.stringify(payload),
  );
}

function writeConfig(thresholdPct) {
  fs.writeFileSync(
    path.join(tmpDir, ".gsd-t", "context-meter-config.json"),
    JSON.stringify({
      version: 1,
      thresholdPct,
      modelWindowSize: MODEL_WINDOW,
      checkFrequency: 5,
      statePath: ".gsd-t/.context-meter-state.json",
      logPath: ".gsd-t/context-meter.log",
      timeoutMs: 2000,
    }),
  );
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
    assert.equal(cost, 1000 * 5);
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

// ── getSessionStatus (single-band v3.12) ─────────────────────────────────────

describe("getSessionStatus (single-band v3.12)", () => {
  it("reads fresh state file and returns real values", () => {
    writeState({ inputTokens: 40000 });
    const status = getSessionStatus(tmpDir);
    assert.equal(status.consumed, 40000);
    assert.equal(status.estimated_remaining, 160000);
    assert.equal(status.pct, 20);
    assert.equal(status.threshold, "normal");
  });

  it("returns 'normal' well below default 75% threshold", () => {
    writeState({ inputTokens: 100000 }); // 50%
    assert.equal(getSessionStatus(tmpDir).threshold, "normal");
  });

  it("returns 'normal' just below default threshold boundary (74%)", () => {
    writeState({ inputTokens: 148000 }); // 74%
    assert.equal(getSessionStatus(tmpDir).threshold, "normal");
  });

  it("returns 'threshold' at 75% (inclusive lower, default thresholdPct)", () => {
    writeState({ inputTokens: 150000 }); // 75%
    assert.equal(getSessionStatus(tmpDir).threshold, "threshold");
  });

  it("returns 'threshold' at 85%", () => {
    writeState({ inputTokens: 170000 });
    assert.equal(getSessionStatus(tmpDir).threshold, "threshold");
  });

  it("returns 'threshold' at 95%+", () => {
    writeState({ inputTokens: 195000 });
    assert.equal(getSessionStatus(tmpDir).threshold, "threshold");
  });

  it("honors custom thresholdPct from context-meter-config.json", () => {
    writeConfig(60);
    writeState({ inputTokens: 120000 }); // 60%
    assert.equal(getSessionStatus(tmpDir).threshold, "threshold");
  });

  it("returns 'normal' when below custom thresholdPct (80%)", () => {
    writeConfig(80);
    writeState({ inputTokens: 150000 }); // 75%
    assert.equal(getSessionStatus(tmpDir).threshold, "normal");
  });

  it("falls back to heuristic when state file is missing", () => {
    const status = getSessionStatus(tmpDir);
    assert.equal(status.consumed, 0);
    assert.equal(status.threshold, "normal");
    assert.equal(status.estimated_remaining, MODEL_WINDOW);
  });

  it("falls back to heuristic when state file is older than 5min (no stale band)", () => {
    writeState({ inputTokens: 195000, ageMs: 6 * 60 * 1000 });
    const status = getSessionStatus(tmpDir);
    // v3.12 (M38): stale state no longer produces a special band.
    // It falls through to the heuristic, which for an empty log returns normal.
    assert.equal(status.threshold, "normal");
    assert.equal(status.consumed, 0);
  });

  it("falls back to heuristic when state file has lastError set (no stale band)", () => {
    const statePath = path.join(tmpDir, ".gsd-t", ".context-meter-state.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        timestamp: null,
        inputTokens: 0,
        modelWindowSize: 200000,
        pct: 0,
        threshold: "normal",
        checkCount: 2102,
        lastError: {
          code: "some_error",
          message: "parse failure",
          timestamp: "2026-04-15T20:49:56.259Z",
        },
      })
    );
    const status = getSessionStatus(tmpDir);
    assert.equal(status.threshold, "normal");
    assert.equal(status.deadReason, undefined);
  });

  it("never returns deadReason field", () => {
    writeState({ inputTokens: 40000 });
    const status = getSessionStatus(tmpDir);
    assert.equal(status.deadReason, undefined);
  });

  it("heuristic sums today's tokens from token-log.md", () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 10:00`;
    writeTokenLog([
      [today, today, "gsd-t-execute", "Step 1", "sonnet", "60s", "n", "50000", "null", "", "execute", "N/A"],
      [today, today, "gsd-t-execute", "Step 2", "sonnet", "60s", "n", "100000", "null", "", "execute", "N/A"],
    ]);
    const status = getSessionStatus(tmpDir);
    assert.equal(status.consumed, 150000);
    assert.equal(status.pct, 75);
    // 75% reaches default threshold (75)
    assert.equal(status.threshold, "threshold");
  });

  it("reports consumed=0 on missing state and empty log", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-empty-"));
    fs.mkdirSync(path.join(emptyDir, ".gsd-t"), { recursive: true });
    const status = getSessionStatus(emptyDir);
    assert.equal(status.consumed, 0);
    assert.equal(status.threshold, "normal");
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("threshold is only 'normal' or 'threshold' — never warn/stop/stale/dead-meter", () => {
    for (const tokens of [0, 40000, 100000, 148000, 150000, 170000, 195000]) {
      writeState({ inputTokens: tokens });
      const status = getSessionStatus(tmpDir);
      assert.ok(
        status.threshold === "normal" || status.threshold === "threshold",
        `unexpected threshold "${status.threshold}" — must be normal|threshold`,
      );
    }
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

// ── getDegradationActions removed in v3.12 ────────────────────────────────────

describe("getDegradationActions (removed in v3.12)", () => {
  it("is no longer exported", () => {
    const mod = require("../bin/token-budget.cjs");
    assert.equal(mod.getDegradationActions, undefined);
  });
});

// ── estimateMilestoneCost ─────────────────────────────────────────────────────

describe("estimateMilestoneCost", () => {
  it("returns estimatedTokens as sum of task estimates", () => {
    writeState({ inputTokens: 0 });
    const tasks = [
      { model: "haiku", taskType: "execute", complexity: 1.0 },
      { model: "haiku", taskType: "qa", complexity: 1.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    const expected = estimateCost("haiku", "execute", { projectDir: tmpDir }) + estimateCost("haiku", "qa", { projectDir: tmpDir });
    assert.equal(result.estimatedTokens, expected);
  });

  it("returns feasible=true when estimated tokens fit in remaining window", () => {
    writeState({ inputTokens: 0 });
    const tasks = [{ model: "haiku", taskType: "execute", complexity: 1.0 }];
    const result = estimateMilestoneCost(tasks, tmpDir);
    assert.equal(result.feasible, true);
  });

  it("returns feasible=false when estimated tokens exceed remaining window", () => {
    writeState({ inputTokens: 199000 }); // ~1k remaining
    const tasks = [
      { model: "opus", taskType: "execute", complexity: 5.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    assert.equal(result.feasible, false);
  });

  it("returns estimatedPct as percentage of model window", () => {
    writeState({ inputTokens: 0 });
    const tasks = [
      { model: "haiku", taskType: "execute", complexity: 1.0 },
    ];
    const result = estimateMilestoneCost(tasks, tmpDir);
    // haiku execute base = 8000, 8000/200000 = 4%
    assert.equal(result.estimatedPct, 4);
  });

  it("returns zero tokens for empty task list", () => {
    writeState({ inputTokens: 0 });
    const result = estimateMilestoneCost([], tmpDir);
    assert.equal(result.estimatedTokens, 0);
    assert.equal(result.estimatedPct, 0);
    assert.equal(result.feasible, true);
  });

  it("sums multiple tasks with different models", () => {
    writeState({ inputTokens: 0 });
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
