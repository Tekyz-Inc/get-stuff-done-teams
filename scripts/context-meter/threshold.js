/**
 * scripts/context-meter/threshold.js
 *
 * Pure-function module for the context-meter PostToolUse hook.
 *
 * Responsibilities:
 *   1. Compute the context-window percentage from a token count + window size.
 *   2. Map that percentage to a token-budget band (normal / warn / downgrade /
 *      conserve / stop). Boundaries mirror bin/token-budget.js exactly so the
 *      `threshold` field in the state file is consistent across consumers.
 *   3. Build the exact `additionalContext` string the hook emits when the
 *      measured percentage meets or exceeds the configured thresholdPct.
 *
 * Zero side effects. Zero dependencies. CommonJS.
 */

// ── Band boundaries (must match bin/token-budget.js THRESHOLDS exactly) ──────
// Lower bound inclusive, upper bound exclusive.
const BANDS = Object.freeze({
  warn: 60,
  downgrade: 70,
  conserve: 85,
  stop: 95,
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
 * Map a percentage to a token-budget band.
 *
 * Boundaries (inclusive on the lower edge):
 *   pct <  60 → "normal"
 *   pct <  70 → "warn"
 *   pct <  85 → "downgrade"
 *   pct <  95 → "conserve"
 *   pct >= 95 → "stop"
 *
 * Non-finite input → "normal" (fail-safe — never escalate on garbage).
 *
 * @param {number} pct
 * @returns {"normal"|"warn"|"downgrade"|"conserve"|"stop"}
 */
function bandFor(pct) {
  if (!Number.isFinite(pct)) return "normal";
  if (pct >= BANDS.stop) return "stop";
  if (pct >= BANDS.conserve) return "conserve";
  if (pct >= BANDS.downgrade) return "downgrade";
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
