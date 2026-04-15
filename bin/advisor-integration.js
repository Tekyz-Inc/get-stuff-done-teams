#!/usr/bin/env node

/**
 * GSD-T Advisor Integration — convention-based /advisor escalation fallback
 *
 * Per `.gsd-t/M35-advisor-findings.md`: Claude Code's native /advisor tool has
 * NO programmable API at subagent scope. This module exists as a seam so that
 * when Anthropic ships a programmable advisor endpoint, the function body can
 * be rewritten without touching callers.
 *
 * Current (M35 v1.0.0) behavior:
 *   - invokeAdvisor() always returns {available: false, guidance: null, loggedMiss: true}
 *   - The call appends a single `missed_escalation` record to
 *     `.gsd-t/token-log.md` so that token-telemetry's aggregate view can
 *     report how many escalation points occurred without a programmable path
 *   - Graceful degradation: if the log write fails, return loggedMiss: false
 *     but never throw — callers proceed at their assigned model either way
 *
 * Contract: `.gsd-t/contracts/model-selection-contract.md` v1.0.0 (M35 T4)
 * Zero external dependencies.
 */

const fs = require("fs");
const path = require("path");

const TOKEN_LOG_RELATIVE = ".gsd-t/token-log.md";

/**
 * Invoke the /advisor escalation hook.
 *
 * @param {object} args
 * @param {string} args.question    — the escalation question being asked
 * @param {object} [args.context]   — optional structured context (phase, domain, task)
 * @param {string} [args.projectDir] — project root; defaults to cwd
 * @returns {{available: boolean, guidance: string|null, loggedMiss: boolean}}
 */
function invokeAdvisor(args) {
  const { question, context, projectDir } = args || {};
  const dir = projectDir || process.cwd();

  // There is no programmable path to try. Record the miss and return.
  const loggedMiss = logMissedEscalation(dir, question, context);

  return {
    available: false,
    guidance: null,
    loggedMiss,
  };
}

/**
 * Append a single missed-escalation record to `.gsd-t/token-log.md`.
 * Returns true on successful append, false on any filesystem error
 * (non-throwing — this is a best-effort audit trail).
 *
 * @param {string} projectDir
 * @param {string} [question]
 * @param {object} [context]
 * @returns {boolean}
 */
function logMissedEscalation(projectDir, question, context) {
  try {
    const logPath = path.join(projectDir, TOKEN_LOG_RELATIVE);
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) return false;

    const ts = new Date().toISOString();
    const q = sanitizeOneLine(question || "(no question provided)");
    const ctxPhase = (context && context.phase) ? sanitizeOneLine(String(context.phase)) : "";
    const ctxDomain = (context && context.domain) ? sanitizeOneLine(String(context.domain)) : "";
    const ctxTask = (context && context.task) ? sanitizeOneLine(String(context.task)) : "";

    const line = `<!-- missed_escalation ${ts} phase=${ctxPhase} domain=${ctxDomain} task=${ctxTask} q="${q}" -->\n`;

    fs.appendFileSync(logPath, line, "utf8");
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Strip newlines and trim whitespace so the record stays on one line.
 */
function sanitizeOneLine(s) {
  return String(s).replace(/\s+/g, " ").trim().slice(0, 500);
}

module.exports = {
  invokeAdvisor,
  logMissedEscalation,
  TOKEN_LOG_RELATIVE,
};
