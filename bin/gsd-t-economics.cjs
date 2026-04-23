"use strict";

/**
 * gsd-t-economics — M44 D6 (pre-spawn economics estimator)
 *
 * Contract: .gsd-t/contracts/economics-estimator-contract.md (v0.1.0 skeleton; v1.0.0 after T3).
 *
 * Hard invariants:
 *   - Zero external runtime deps (Node built-ins only).
 *   - Corpus loaded ONCE at module init (sync read, cached).
 *   - NEVER returns undefined — global median fallback guarantees a number.
 *   - D6 is a HINT only; D2 owns the final gate decision.
 *   - Event emission is best-effort; failures never fail the estimate.
 *
 * T1 (this file): stub surface — exports estimateTaskFootprint with a
 * deterministic placeholder response. T2 replaces the body with the real
 * lookup + fallback algorithm.
 */

// eslint-disable-next-line no-unused-vars
const fs = require("node:fs");
// eslint-disable-next-line no-unused-vars
const path = require("node:path");

/**
 * Estimate a task's CW footprint and produce a mode-specific recommendation.
 *
 * @param {object} opts
 * @param {{id:string, command?:string, step?:string, domain?:string}} opts.taskNode
 * @param {'in-session'|'unattended'} opts.mode
 * @param {string} [opts.projectDir]
 * @returns {{estimatedCwPct:number, parallelOk:boolean, split:boolean, workerCount:number, matchedRows:number, confidence:'HIGH'|'MEDIUM'|'LOW'|'FALLBACK'}}
 */
function estimateTaskFootprint(_opts) {
  // T1 stub — returns a deterministic placeholder so downstream consumers
  // can wire against the contract interface while T2 implementation lands.
  return {
    estimatedCwPct: 0,
    parallelOk: true,
    split: false,
    workerCount: 1,
    matchedRows: 0,
    confidence: "FALLBACK",
  };
}

module.exports = {
  estimateTaskFootprint,
};
