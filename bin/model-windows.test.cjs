/**
 * Tests for bin/model-windows.cjs — model → context-window resolution.
 *
 * The bug this fixes: the context meter hardcoded a 200k window so an Opus 4.7
 * session (1M window) read as 5× over budget, firing the headless handoff at
 * ~64% of context REMAINING. These tests pin the corrected windows.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  windowForModel,
  MODEL_WINDOWS,
  SAFE_DEFAULT_WINDOW,
  LEGACY_SMALL_WINDOW,
} = require("./model-windows.cjs");

test("Opus 4.7 resolves to a 1M window (the reported regression)", () => {
  assert.equal(windowForModel("claude-opus-4-7"), 1_000_000);
});

test("Opus 4.6 resolves to a 1M window", () => {
  assert.equal(windowForModel("claude-opus-4-6"), 1_000_000);
});

test("dated/versioned suffix still resolves via longest-prefix", () => {
  assert.equal(windowForModel("claude-opus-4-7-20260115"), 1_000_000);
  assert.equal(windowForModel("claude-sonnet-4-6-20251201"), 1_000_000);
});

test("Sonnet 4.x resolves to a 1M window", () => {
  assert.equal(windowForModel("claude-sonnet-4-6"), 1_000_000);
  assert.equal(windowForModel("claude-sonnet-4"), 1_000_000);
});

test("Haiku 4.x resolves to the 200k window", () => {
  assert.equal(windowForModel("claude-haiku-4-5-20251001"), 200_000);
  assert.equal(windowForModel("claude-haiku-4"), 200_000);
});

test("longest-prefix wins over a shorter generic prefix", () => {
  // "claude-opus-4-7" (15) must beat "claude-opus-4" (13). Both map to 1M
  // here, so assert the resolution mechanism via a value-independent check:
  // a hypothetical future divergence would surface if this regressed.
  assert.equal(windowForModel("claude-opus-4-7"), MODEL_WINDOWS["claude-opus-4-7"]);
});

test("case-insensitive and whitespace-tolerant", () => {
  assert.equal(windowForModel("  CLAUDE-OPUS-4-7  "), 1_000_000);
});

test("unknown / missing model falls back to the SAFE large default", () => {
  assert.equal(windowForModel("claude-future-99"), SAFE_DEFAULT_WINDOW);
  assert.equal(windowForModel(""), SAFE_DEFAULT_WINDOW);
  assert.equal(windowForModel(null), SAFE_DEFAULT_WINDOW);
  assert.equal(windowForModel(undefined), SAFE_DEFAULT_WINDOW);
  assert.equal(windowForModel(42), SAFE_DEFAULT_WINDOW);
});

test("SAFE_DEFAULT_WINDOW is the large (1M) window, not the legacy 200k", () => {
  // Core anti-regression assertion: the fallback must NOT reintroduce the
  // premature-handoff bug for an unrecognized model.
  assert.equal(SAFE_DEFAULT_WINDOW, 1_000_000);
  assert.equal(LEGACY_SMALL_WINDOW, 200_000);
  assert.notEqual(SAFE_DEFAULT_WINDOW, LEGACY_SMALL_WINDOW);
});

test("every mapped window is a positive integer", () => {
  for (const [k, v] of Object.entries(MODEL_WINDOWS)) {
    assert.ok(Number.isInteger(v) && v > 0, `${k} → ${v} must be a positive int`);
  }
});
