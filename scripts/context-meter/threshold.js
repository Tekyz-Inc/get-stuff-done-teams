/**
 * scripts/context-meter/threshold.js
 *
 * Pure-function module for the context-meter PostToolUse hook.
 *
 * Responsibilities:
 *   1. Compute the context-window percentage from a token count + window size.
 *   2. Map that percentage to a token-budget band (normal / warn / stop).
 *      Boundaries mirror bin/token-budget.js v3.0.0 exactly so the
 *      `threshold` field in the state file is consistent across consumers.
 *   3. Build the exact `additionalContext` string the hook emits when the
 *      measured percentage meets or exceeds the configured thresholdPct.
 *
 * v3.0.0 (M35): The `downgrade` and `conserve` bands were REMOVED. The
 * three-band model is: normal < 70 ≤ warn < 85 ≤ stop. Silent model
 * degradation and silent phase-skipping violate GSD-T's quality principles.
 *
 * Zero side effects. Zero dependencies. CommonJS.
 */

// ── Band boundaries (must match bin/token-budget.js THRESHOLDS exactly) ──────
// Lower bound inclusive, upper bound exclusive.
const BANDS = Object.freeze({
  warn: 70,
  stop: 85,
});

/**
 * Compute context-window percentage (0–100+).
 *
 * Fail-safe: any non-finite, negative, or zero-window input returns 0 — the
 * caller should treat 0 as "normal/safe, no action needed".
 *
 * Does NOT clamp above 100. If real usage reports 102.3%, return 102.3; the
 * band mapping handles it (>= 95 → stop).
 *
 * @param {{ inputTokens: number, modelWindowSize: number }} args
 * @returns {number}
 */
function computePct({ inputTokens, modelWindowSize } = {}) {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(modelWindowSize)) {
    return 0;
  }
  if (inputTokens < 0 || modelWindowSize <= 0) {
    return 0;
  }
  return (inputTokens / modelWindowSize) * 100;
}

/**
 * Map a percentage to a token-budget band (v3.0.0 three-band model).
 *
 * Boundaries (inclusive on the lower edge):
 *   pct <  70 → "normal"
 *   pct <  85 → "warn"
 *   pct >= 85 → "stop"
 *
 * Non-finite input → "normal" (fail-safe — never escalate on garbage).
 *
 * @param {number} pct
 * @returns {"normal"|"warn"|"stop"}
 */
function bandFor(pct) {
  if (!Number.isFinite(pct)) return "normal";
  if (pct >= BANDS.stop) return "stop";
  if (pct >= BANDS.warn) return "warn";
  return "normal";
}

/**
 * Build the `additionalContext` string the hook emits, or null if the
 * measured percentage is below the configured thresholdPct.
 *
 * Exact format (from .gsd-t/contracts/context-meter-contract.md line 139):
 *   ⚠️ Context window at {pct.toFixed(1)}% of {modelWindowSize}. Run /user:gsd-t-pause to checkpoint and clear before continuing.
 *
 * `modelWindowSize` is emitted as the raw integer — no commas, no "K" suffix.
 *
 * @param {{ pct: number, modelWindowSize: number, thresholdPct: number }} args
 * @returns {string|null}
 */
function buildAdditionalContext({ pct, modelWindowSize, thresholdPct } = {}) {
  if (!Number.isFinite(pct) || !Number.isFinite(thresholdPct)) return null;
  if (pct < thresholdPct) return null;
  return `⚠️ Context window at ${pct.toFixed(1)}% of ${modelWindowSize}. Run /user:gsd-t-pause to checkpoint and clear before continuing.`;
}

module.exports = { computePct, bandFor, buildAdditionalContext, BANDS };
