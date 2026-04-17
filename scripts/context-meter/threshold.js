/**
 * scripts/context-meter/threshold.js
 *
 * Pure-function module for the context-meter PostToolUse hook.
 *
 * Responsibilities:
 *   1. Compute the context-window percentage from a token count + window size.
 *   2. Map that percentage to a band (normal / threshold). Boundaries mirror
 *      bin/token-budget.cjs v3.12 — a single-band model that flips at
 *      thresholdPct from config.
 *   3. Build the `additionalContext` marker the hook emits at or above
 *      threshold. v3.12 (M38) replaces the M37 MANDATORY STOP banner with a
 *      short silent breadcrumb the orchestrator reads — Claude is not asked
 *      to halt mid-session; structural headless-by-default spawning handles
 *      overflow instead.
 *
 * Zero side effects. Zero dependencies. CommonJS.
 */

/**
 * Compute context-window percentage (0–100+).
 *
 * Fail-safe: any non-finite, negative, or zero-window input returns 0.
 * Does NOT clamp above 100.
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
 * Map a percentage to a band (v3.12 single-band model).
 *
 *   pct <  thresholdPct → "normal"
 *   pct >= thresholdPct → "threshold"
 *
 * Non-finite input → "normal" (fail-safe — never escalate on garbage).
 *
 * @param {number} pct
 * @param {number} [thresholdPct=75]
 * @returns {"normal"|"threshold"}
 */
function bandFor(pct, thresholdPct = 75) {
  if (!Number.isFinite(pct)) return "normal";
  if (!Number.isFinite(thresholdPct)) return "normal";
  return pct >= thresholdPct ? "threshold" : "normal";
}

/**
 * Build the `additionalContext` marker the hook emits, or null if the
 * measured percentage is below the configured thresholdPct.
 *
 * v3.12 (M38): returns a short machine-readable marker, NOT a user-facing
 * STOP banner. The orchestrator's spawn path reads the state file's band
 * and routes the next subagent through autoSpawnHeadless(). The marker is
 * a redundant breadcrumb — Claude should not treat it as an instruction.
 *
 * @param {{ pct: number, modelWindowSize: number, thresholdPct: number }} args
 * @returns {string|null}
 */
function buildAdditionalContext({ pct, modelWindowSize, thresholdPct } = {}) {
  if (!Number.isFinite(pct) || !Number.isFinite(thresholdPct)) return null;
  if (pct < thresholdPct) return null;
  return "next-spawn-headless:true";
}

module.exports = { computePct, bandFor, buildAdditionalContext };
