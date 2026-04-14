/**
 * Tests for bin/token-budget.js
 * Uses Node.js built-in test runner (node --test)
 *
 * v3.0.0 (M35): clean break — three-band model (normal / warn / stop).
 * Silent degradation bands (downgrade, conserve) and their model-override
 * side channel are REMOVED. getDegradationActions now returns
 * {band, pct, message} — no actions list, no modelOverrides.
 * Thresholds tightened to warn@70%, stop@85%.
 *
 * v2.0.0 (M34): getSessionStatus reads .gsd-t/.context-meter-state.json
 * produced by the Context Meter PostToolUse hook. When the state file is
 * absent or stale (>5min), it falls back to a historical heuristic from
 * .gsd-t/token-log.md against a 200k-token model window.
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

const MODEL_WINDOW = 200000;
let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-test-"));
  fs.mkdirSync(path.join(tmpDir, ".gsd-t"), { recursive: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Scrub state/log so each test starts from a clean slate.
  const state = path.join(tmpDir, ".gsd-t", ".context-meter-state.json");
  if (fs.existsSync(state)) fs.unlinkSync(state);
  const log = path.join(tmpDir, ".gsd-t", "token-log.md");
  if (fs.existsSync(log)) fs.unlinkSync(log);
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

// ── getSessionStatus (state-file primary) ────────────────────────────────────

describe("getSessionStatus (real-source, three-band v3.0.0)", () => {
  it("reads fresh state file and returns real values", () => {
    writeState({ inputTokens: 40000 });
    const status = getSessionStatus(tmpDir);
    assert.equal(status.consumed, 40000);
    assert.equal(status.estimated_remaining, 160000);
    assert.equal(status.pct, 20);
    assert.equal(status.threshold, "normal");
  });

  it("returns 'normal' below 70%", () => {
    writeState({ inputTokens: 100000 }); // 50%
    assert.equal(getSessionStatus(tmpDir).threshold, "normal");
  });

  it("returns 'normal' just below warn boundary (69%)", () => {
    writeState({ inputTokens: 138000 }); // 69%
    assert.equal(getSessionStatus(tmpDir).threshold, "normal");
  });

  it("returns 'warn' at 70% (inclusive lower)", () => {
    writeState({ inputTokens: 140000 }); // 70%
    assert.equal(getSessionStatus(tmpDir).threshold, "warn");
  });

  it("returns 'warn' at 71%", () => {
    writeState({ inputTokens: 142000 }); // 71%
    assert.equal(getSessionStatus(tmpDir).threshold, "warn");
  });

  it("returns 'warn' at 84% (still below stop)", () => {
    writeState({ inputTokens: 168000 }); // 84%
    assert.equal(getSessionStatus(tmpDir).threshold, "warn");
  });

  it("returns 'stop' at 85% (inclusive lower)", () => {
    writeState({ inputTokens: 170000 }); // 85%
    assert.equal(getSessionStatus(tmpDir).threshold, "stop");
  });

  it("returns 'stop' at 86%", () => {
    writeState({ inputTokens: 172000 }); // 86%
    assert.equal(getSessionStatus(tmpDir).threshold, "stop");
  });

  it("returns 'stop' at 95%+", () => {
    writeState({ inputTokens: 195000 }); // 97.5%
    assert.equal(getSessionStatus(tmpDir).threshold, "stop");
  });

  it("falls back to heuristic when state file is missing", () => {
    const status = getSessionStatus(tmpDir);
    assert.equal(status.consumed, 0);
    assert.equal(status.threshold, "normal");
    assert.equal(status.estimated_remaining, MODEL_WINDOW);
  });

  it("falls back to heuristic when state file is stale (>5min)", () => {
    writeState({ inputTokens: 195000, ageMs: 6 * 60 * 1000 });
    const status = getSessionStatus(tmpDir);
    // Stale → heuristic path → zero historical tokens → normal
    assert.equal(status.threshold, "normal");
    assert.equal(status.consumed, 0);
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
    // 75% → warn band under v3.0.0 (warn @ 70, stop @ 85)
    assert.equal(status.threshold, "warn");
  });

  it("reports consumed=0 on missing state and empty log", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-tb-empty-"));
    fs.mkdirSync(path.join(emptyDir, ".gsd-t"), { recursive: true });
    const status = getSessionStatus(emptyDir);
    assert.equal(status.consumed, 0);
    assert.equal(status.threshold, "normal");
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

// ── getDegradationActions (v3.0.0 three-band) ────────────────────────────────

describe("getDegradationActions (v3.0.0 three-band)", () => {
  it("returns normal band at low context", () => {
    writeState({ inputTokens: 10000 });
    const result = getDegradationActions(tmpDir);
    assert.equal(result.band, "normal");
    assert.equal(typeof result.pct, "number");
    assert.equal(typeof result.message, "string");
    // Clean-break guarantees: no actions array, no modelOverrides, no skipPhases.
    assert.equal(result.actions, undefined);
    assert.equal(result.modelOverrides, undefined);
    assert.equal(result.skipPhases, undefined);
    assert.equal(result.threshold, undefined);
  });

  it("returns warn band at 70% (inclusive lower boundary)", () => {
    writeState({ inputTokens: 140000 }); // 70%
    const result = getDegradationActions(tmpDir);
    assert.equal(result.band, "warn");
    assert.ok(/70|warn/i.test(result.message));
    assert.equal(result.modelOverrides, undefined);
  });

  it("returns warn band at 84% (still below stop)", () => {
    writeState({ inputTokens: 168000 }); // 84%
    const result = getDegradationActions(tmpDir);
    assert.equal(result.band, "warn");
    assert.equal(result.modelOverrides, undefined);
  });

  it("returns stop band at 85% (inclusive lower boundary)", () => {
    writeState({ inputTokens: 170000 }); // 85%
    const result = getDegradationActions(tmpDir);
    assert.equal(result.band, "stop");
    assert.ok(/stop|halt/i.test(result.message));
    assert.equal(result.modelOverrides, undefined);
  });

  it("returns stop band at 95%+", () => {
    writeState({ inputTokens: 195000 }); // 97.5%
    const result = getDegradationActions(tmpDir);
    assert.equal(result.band, "stop");
  });

  it("message references runway estimator handoff at stop band", () => {
    writeState({ inputTokens: 180000 }); // 90%
    const result = getDegradationActions(tmpDir);
    assert.equal(result.band, "stop");
    assert.ok(/runway|headless|hand/i.test(result.message));
  });

  it("band is never downgrade/conserve under v3.0.0 (clean break)", () => {
    for (const tokens of [10000, 140000, 168000, 170000, 195000]) {
      writeState({ inputTokens: tokens });
      const result = getDegradationActions(tmpDir);
      assert.ok(
        result.band === "normal" || result.band === "warn" || result.band === "stop",
        `unexpected band "${result.band}" — must be normal/warn/stop`,
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
