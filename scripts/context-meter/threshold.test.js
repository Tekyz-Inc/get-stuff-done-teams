/**
 * scripts/context-meter/threshold.test.js
 *
 * Tests for threshold.js — context-meter's pure-function band/emit module.
 *
 * v3.12 (M38): single-band model (normal|threshold). The M37 MANDATORY STOP
 * banner is replaced with a short silent marker consumed by the orchestrator.
 *
 * Run: node --test scripts/context-meter/threshold.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computePct,
  bandFor,
  buildAdditionalContext,
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

// ── bandFor — single-band (normal/threshold) ─────────────────────────────────

test("bandFor — 0 → normal (default threshold 75)", () => {
  assert.equal(bandFor(0), "normal");
});

test("bandFor — 74.9 → normal (below default 75)", () => {
  assert.equal(bandFor(74.9), "normal");
});

test("bandFor — 75 → threshold (inclusive lower, default)", () => {
  assert.equal(bandFor(75), "threshold");
});

test("bandFor — 85 → threshold", () => {
  assert.equal(bandFor(85), "threshold");
});

test("bandFor — 95 → threshold", () => {
  assert.equal(bandFor(95), "threshold");
});

test("bandFor — 150 → threshold (no upper clamp)", () => {
  assert.equal(bandFor(150), "threshold");
});

test("bandFor — explicit thresholdPct 60, pct 59 → normal", () => {
  assert.equal(bandFor(59, 60), "normal");
});

test("bandFor — explicit thresholdPct 60, pct 60 → threshold", () => {
  assert.equal(bandFor(60, 60), "threshold");
});

test("bandFor — explicit thresholdPct 90, pct 80 → normal", () => {
  assert.equal(bandFor(80, 90), "normal");
});

test("bandFor — NaN pct → normal (fail-safe)", () => {
  assert.equal(bandFor(NaN), "normal");
});

test("bandFor — Infinity → normal (fail-safe: Infinity is NOT finite)", () => {
  assert.equal(bandFor(Infinity), "normal");
});

test("bandFor — NaN thresholdPct → normal (fail-safe)", () => {
  assert.equal(bandFor(80, NaN), "normal");
});

test("bandFor — undefined → normal", () => {
  assert.equal(bandFor(undefined), "normal");
});

test("bandFor — never returns warn/stop/stale/dead-meter (v3.12 cleanup)", () => {
  for (const p of [0, 50, 69, 70, 74, 75, 80, 85, 90, 95, 100, 150]) {
    const b = bandFor(p);
    assert.ok(b === "normal" || b === "threshold", `band for ${p} was ${b}`);
  }
});

// ── buildAdditionalContext — single-band silent marker ───────────────────────

test("buildAdditionalContext — below threshold returns null", () => {
  assert.equal(
    buildAdditionalContext({ pct: 50, modelWindowSize: 200000, thresholdPct: 75 }),
    null
  );
});

test("buildAdditionalContext — at threshold returns short silent marker", () => {
  const result = buildAdditionalContext({
    pct: 75,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.equal(result, "next-spawn-headless:true");
});

test("buildAdditionalContext — above threshold returns same marker (no pct interpolation)", () => {
  const result = buildAdditionalContext({
    pct: 92.7,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.equal(result, "next-spawn-headless:true");
});

test("buildAdditionalContext — marker is machine-readable and short (< 40 chars)", () => {
  const result = buildAdditionalContext({
    pct: 80,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.ok(typeof result === "string");
  assert.ok(result.length < 40, `marker too long: ${result.length}`);
});

test("buildAdditionalContext — marker contains NO user-facing language (no MANDATORY, STOP, /, /clear)", () => {
  const result = buildAdditionalContext({
    pct: 80,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.ok(!/MANDATORY/.test(result));
  assert.ok(!/STOP/.test(result));
  assert.ok(!/\//.test(result));
  assert.ok(!/\/clear/.test(result));
  assert.ok(!/Destructive/.test(result));
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

test("buildAdditionalContext — zero pct vs zero threshold emits (0 >= 0)", () => {
  const result = buildAdditionalContext({
    pct: 0,
    modelWindowSize: 200000,
    thresholdPct: 0,
  });
  assert.equal(result, "next-spawn-headless:true");
});

test("buildAdditionalContext — pct over 100% still emits", () => {
  const result = buildAdditionalContext({
    pct: 102.3,
    modelWindowSize: 200000,
    thresholdPct: 75,
  });
  assert.equal(result, "next-spawn-headless:true");
});
