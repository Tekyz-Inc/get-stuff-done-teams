/**
 * bin/model-windows.cjs
 *
 * Single source of truth for Claude model → context-window size (in input
 * tokens). The context meter and every downstream budget module must size the
 * window from the MODEL ACTUALLY RUNNING, not a hardcoded constant.
 *
 * Why this exists
 * ---------------
 * Prior to this module every budget site hardcoded `200000` with a comment
 * "claude-opus-4-6 default". Opus 4.6 and 4.7 (and Sonnet 4.x) ship a
 * 1,000,000-token context window. Hardcoding 200k made the context meter
 * overcount usage 5× and fire the headless handoff at ~64% of context
 * REMAINING. This map fixes that at the source.
 *
 * Resolution strategy
 * -------------------
 * GSD-T jumps between models per-subagent, so a static config value is wrong.
 * The orchestrator session whose transcript the meter reads, however, runs a
 * single model for its lifetime, and every assistant message in the transcript
 * records its `model` id. `windowForModel(modelId)` maps that id to a window.
 *
 * Matching is by longest-prefix so versioned ids resolve even if a future
 * dated suffix appears (e.g. "claude-opus-4-7-20260115" → opus 4.x entry).
 * Unknown / missing model → SAFE_DEFAULT_WINDOW (the large 1M window: a guard
 * that triggers late is worse than one that never undercounts a real 1M
 * session — but see note below; we deliberately pick the large default so the
 * meter does NOT regress to premature handoffs on an unrecognized new model).
 *
 * Zero dependencies. CommonJS. Pure functions.
 */

"use strict";

// The conservative fallback when a model can't be resolved. We choose the
// LARGE window (1M) on purpose: the bug we are fixing is premature handoff
// from a too-SMALL assumed window. An unknown future model is far more likely
// to have a >=1M window than a 200k one, and an over-large window degrades
// gracefully (handoff a little late) whereas an under-small one breaks the
// workflow (handoff way too early, the reported symptom).
const SAFE_DEFAULT_WINDOW = 1_000_000;

// The legacy small window, kept as a named export for the few call sites that
// must preserve old behavior explicitly (e.g. fixtures, back-compat configs).
const LEGACY_SMALL_WINDOW = 200_000;

// Longest-prefix map: key is a model-id prefix, value is the input-token
// context window for that model family. Order does not matter — resolution
// picks the LONGEST matching prefix.
const MODEL_WINDOWS = Object.freeze({
  // Opus 4.6 / 4.7 — 1M context window.
  "claude-opus-4-6": 1_000_000,
  "claude-opus-4-7": 1_000_000,
  // Generic opus-4 fallback (covers any 4.x point release not listed above).
  "claude-opus-4": 1_000_000,

  // Sonnet 4.x — 1M context window.
  "claude-sonnet-4": 1_000_000,

  // Haiku 4.x — 200k context window.
  "claude-haiku-4": 200_000,

  // Pre-4 families (defensive — older long sessions / replayed transcripts).
  "claude-3-7-sonnet": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-opus": 200_000,
});

/**
 * Resolve a context-window size (input tokens) for a Claude model id.
 *
 * @param {string|null|undefined} modelId  e.g. "claude-opus-4-7" or
 *        "claude-opus-4-7-20260115". Non-string / empty → SAFE_DEFAULT_WINDOW.
 * @returns {number} positive integer window size
 */
function windowForModel(modelId) {
  if (typeof modelId !== "string" || modelId.length === 0) {
    return SAFE_DEFAULT_WINDOW;
  }
  const id = modelId.trim().toLowerCase();

  let best = null;
  let bestLen = -1;
  for (const prefix of Object.keys(MODEL_WINDOWS)) {
    if (id.startsWith(prefix) && prefix.length > bestLen) {
      best = MODEL_WINDOWS[prefix];
      bestLen = prefix.length;
    }
  }
  return best != null ? best : SAFE_DEFAULT_WINDOW;
}

module.exports = {
  windowForModel,
  MODEL_WINDOWS,
  SAFE_DEFAULT_WINDOW,
  LEGACY_SMALL_WINDOW,
};
