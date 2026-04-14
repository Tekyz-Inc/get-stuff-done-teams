/**
 * scripts/context-meter/threshold.test.js
 *
 * Tests for threshold.js — context-meter's pure-function band/emit module.
 * Run: node --test scripts/context-meter/threshold.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computePct,
  bandFor,
  buildAdditionalContext,
  BANDS,
} = require("./threshold");

// ── computePct ───────────────────────────────────────────────────────────────

test("computePct — happy path 50%", () => {
  assert.equal(
    computePct({ inputTokens: 100000, modelWindowSize: 200000 }),
    50
  );
});

test("computePct — zero window returns 0", () => {
  assert.equal(
    computePct({ inputTokens: 100000, modelWindowSize: 0 }),
    0
  );
});

test("computePct — negative window returns 0", () => {
  assert.equal(
    computePct({ inputTokens: 100000, modelWindowSize: -1 }),
    0
  );
});

test("computePct — negative input returns 0", () => {
  assert.equal(
    computePct({ inputTokens: -5, modelWindowSize: 200000 }),
    0
  );
});

test("computePct — NaN input returns 0", () => {
  assert.equal(
    computePct({ inputTokens: NaN, modelWindowSize: 200000 }),
    0
  );
});

test("computePct — NaN window returns 0", () => {
  assert.equal(
    computePct({ inputTokens: 100000, modelWindowSize: NaN }),
    0
  );
});

test("computePct — Infinity returns 0", () => {
  assert.equal(
    computePct({ inputTokens: Infinity, modelWindowSize: 200000 }),
    0
  );
});

test("computePct — missing args returns 0", () => {
  assert.equal(computePct({}), 0);
  assert.equal(computePct(), 0);
});

test("computePct — does NOT clamp above 100", () => {
  assert.equal(
    computePct({ inputTokens: 250000, modelWindowSize: 200000 }),
    125
  );
});

test("computePct — small fraction", () => {
  const result = computePct({ inputTokens: 1, modelWindowSize: 200000 });
  assert.ok(result > 0 && result < 0.001);
});

// ── bandFor — boundary sweep (v3.0.0 three-band: normal/warn/stop) ───────────

test("bandFor — 0 → normal", () => {
  assert.equal(bandFor(0), "normal");
});

test("bandFor — 69 → normal", () => {
  assert.equal(bandFor(69), "normal");
});

test("bandFor — 69.9 → normal", () => {
  assert.equal(bandFor(69.9), "normal");
});

test("bandFor — 70 → warn (inclusive lower)", () => {
  assert.equal(bandFor(70), "warn");
});

test("bandFor — 71 → warn", () => {
  assert.equal(bandFor(71), "warn");
});

test("bandFor — 84 → warn", () => {
  assert.equal(bandFor(84), "warn");
});

test("bandFor — 84.9 → warn", () => {
  assert.equal(bandFor(84.9), "warn");
});

test("bandFor — 85 → stop (inclusive lower)", () => {
  assert.equal(bandFor(85), "stop");
});

test("bandFor — 86 → stop", () => {
  assert.equal(bandFor(86), "stop");
});

test("bandFor — 95 → stop", () => {
  assert.equal(bandFor(95), "stop");
});

test("bandFor — 150 → stop (no upper clamp)", () => {
  assert.equal(bandFor(150), "stop");
});

test("bandFor — NaN → normal (fail-safe)", () => {
  assert.equal(bandFor(NaN), "normal");
});

test("bandFor — Infinity → normal (fail-safe: Infinity is NOT finite)", () => {
  assert.equal(bandFor(Infinity), "normal");
});

test("bandFor — undefined → normal", () => {
  assert.equal(bandFor(undefined), "normal");
});

test("BANDS constant mirrors bin/token-budget.js v3.0.0 three-band model", () => {
  // Guard against accidental drift from the token-budget boundaries.
  assert.deepEqual(BANDS, { warn: 70, stop: 85 });
});

// ── buildAdditionalContext ───────────────────────────────────────────────────

test("buildAdditionalContext — below threshold returns null", () => {
  assert.equal(
    buildAdditionalContext({ pct: 50, modelWindowSize: 200000, thresholdPct: 75 }),
    null
  );
});

test("buildAdditionalContext — at threshold returns string", () => {
  const result = buildAdditionalContext({
    pct: 75,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.ok(typeof result === "string");
  assert.ok(result.includes("75.0%"));
});

test("buildAdditionalContext — above threshold exact contract string", () => {
  const result = buildAdditionalContext({
    pct: 76.2,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.equal(
    result,
    "⚠️ Context window at 76.2% of 200000. Run /user:gsd-t-pause to checkpoint and clear before continuing."
  );
});

test("buildAdditionalContext — decimal formatting rounds via toFixed(1)", () => {
  const result = buildAdditionalContext({
    pct: 76.25,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  // toFixed(1) on 76.25 → "76.3" (banker rounds vary but V8 gives "76.3" here)
  assert.ok(result.includes("76.3%") || result.includes("76.2%"));
  // Either rounding is acceptable — what matters is one decimal place.
  const match = result.match(/at (\d+\.\d)% of/);
  assert.ok(match, "must have exactly one decimal place");
});

test("buildAdditionalContext — modelWindowSize emitted raw (no commas)", () => {
  const result = buildAdditionalContext({
    pct: 80,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.ok(result.includes("of 200000."));
  assert.ok(!result.includes("200,000"));
  assert.ok(!result.includes("200K"));
});

test("buildAdditionalContext — NaN pct returns null", () => {
  assert.equal(
    buildAdditionalContext({ pct: NaN, modelWindowSize: 200000, thresholdPct: 75 }),
    null
  );
});

test("buildAdditionalContext — NaN thresholdPct returns null", () => {
  assert.equal(
    buildAdditionalContext({ pct: 80, modelWindowSize: 200000, thresholdPct: NaN }),
    null
  );
});

test("buildAdditionalContext — missing args returns null", () => {
  assert.equal(buildAdditionalContext({}), null);
  assert.equal(buildAdditionalContext(), null);
});

test("buildAdditionalContext — zero pct vs zero threshold emits", () => {
  // 0 >= 0 is true — edge case: if thresholdPct is 0, every call emits.
  const result = buildAdditionalContext({
    pct: 0,
    modelWindowSize: 200000,
    thresholdPct: 0,
  });
  assert.ok(typeof result === "string");
  assert.ok(result.includes("0.0%"));
});

test("buildAdditionalContext — pct over 100% still formats correctly", () => {
  const result = buildAdditionalContext({
    pct: 102.3,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.equal(
    result,
    "⚠️ Context window at 102.3% of 200000. Run /user:gsd-t-pause to checkpoint and clear before continuing."
  );
});

test("buildAdditionalContext — different modelWindowSize (1M)", () => {
  const result = buildAdditionalContext({
    pct: 80,
    modelWindowSize: 1000000,
    thresholdPct: 75,
  });
  assert.equal(
    result,
    "⚠️ Context window at 80.0% of 1000000. Run /user:gsd-t-pause to checkpoint and clear before continuing."
  );
});
