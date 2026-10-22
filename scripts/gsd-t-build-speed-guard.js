#!/usr/bin/env node
/**
 * gsd-t-build-speed-guard.js
 *
 * PreToolUse hook on Bash. Blocks the two repeat-work patterns that measured
 * as the largest avoidable cost in long builds (ATOS-V2, Oct 2026: 1,392
 * Playwright runs in one build, 31% failed, 430 re-runs straight after a
 * failure; about 8 agent-hours in foreground "sleep, check" loops).
 *
 * [RULE] e2e-no-unchanged-rerun
 * [RULE] e2e-narrow-before-full
 * [RULE] no-foreground-wait-loops
 * [RULE] guards-decide-from-recorded-facts
 *
 * THE OUTCOMES
 *   Playwright run identical to one that failed, no project file changed  BLOCK
 *   Whole-config run after a whole-config failure, no narrower pass since  BLOCK
 *   Foreground loop or sleep waiting more than a minute                    BLOCK
 *   Anything else                                                          ALLOW
 *
 * Outcomes are recorded by gsd-t-e2e-record.js (PostToolUse) and
 * gsd-t-e2e-failure-record.js (PostToolUseFailure) from Playwright's own
 * summary line ("3 failed", "12 passed"). A run whose summary was not seen
 * (backgrounded, killed, reporter printed none) records nothing, so nothing is
 * ever blocked on a guessed outcome. Outside a git work tree there is no file
 * fingerprint, so the e2e rules do not apply there.
 *
 * --- Stdin (Claude Code PreToolUse payload) --------------------------------
 *   { "tool_name": "Bash", "cwd": "...",
 *     "tool_input": { "command": "...", "run_in_background": true|false } }
 *
 * --- Decision contract -----------------------------------------------------
 *   Deny:  {"hookSpecificOutput":{"hookEventName":"PreToolUse",
 *           "permissionDecision":"deny","permissionDecisionReason":"..."}}
 *   Allow: exit 0, no output.
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const WAIT_LIMIT_S = 60;
const STATE_DIR = path.join(os.homedir(), ".claude", "gsd-t-e2e");

// Files a test run itself writes, and GSD-T's own logs: changing them is not a fix.
const NOT_A_FIX = [
  ":(exclude,glob)**/test-results/**",
  ":(exclude,glob)**/playwright-report/**",
  ":(exclude,glob)**/blob-report/**",
  ":(exclude,glob).gsd-t/**",
];

// Flags whose value is the next token (when not written as --flag=value).
const VALUE_FLAGS = new Set([
  "-c", "--config", "--project", "-g", "--grep", "--grep-invert", "-j", "--workers",
  "--reporter", "--output", "--retries", "--timeout", "-x", "--max-failures",
  "--repeat-each", "--shard", "--global-timeout", "--trace", "--tsconfig",
]);

// ─── Command parsing ────────────────────────────────────────────────────────

function segments(command) {
  return String(command).split(/&&|\|\||;|\||\n/).map((s) => s.trim()).filter(Boolean);
}

function tokens(segment) {
  const out = [];
  for (const m of segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

/**
 * The Playwright run inside a Bash command, or null.
 * @returns {{ dir, configKey, runKey, full } | null}
 */
function playwrightRun(command, cwd) {
  let dir = cwd;
  for (const seg of segments(command)) {
    const t = tokens(seg);
    if (t[0] === "cd" && t[1]) { dir = path.resolve(dir, t[1].replace(/^~(?=$|\/)/, os.homedir())); continue; }
    const at = t.findIndex((x, i) => x === "test" && i > 0 && /(^|\/)playwright$/.test(t[i - 1]));
    if (at < 0) continue;
    let config = "default";
    const projects = [];
    const positional = [];
    const filters = [];
    for (let i = at + 1; i < t.length; i++) {
      const a = t[i];
      if (/^\d?>/.test(a) || a === ">" || a === "2>&1") { i += a.endsWith(">") ? 1 : 0; continue; }
      const [flag, inline] = a.startsWith("--") && a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
      if (flag.startsWith("-")) {
        const value = inline !== undefined ? inline : (VALUE_FLAGS.has(flag) ? t[++i] : undefined);
        if (flag === "-c" || flag === "--config") config = value;
        else if (flag === "--project") projects.push(value);
        else if (flag === "-g" || flag === "--grep" || flag === "--grep-invert") filters.push(flag + "=" + value);
        else if (flag === "--last-failed" || flag === "--only-changed") filters.push(flag);
        continue;
      }
      positional.push(a);
    }
    const configKey = [dir, config, projects.sort().join(",")].join("|");
    return {
      dir,
      configKey,
      runKey: [configKey, positional.sort().join(","), filters.sort().join(",")].join("|"),
      full: positional.length === 0 && filters.length === 0,
    };
  }
  return null;
}

// ─── Project fingerprint and state ──────────────────────────────────────────

function git(dir, args) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
}

/** Git root of dir, or null when dir is not inside a git work tree. */
function gitRoot(dir) {
  if (!fs.existsSync(dir)) return null;
  const r = git(dir, ["rev-parse", "--show-toplevel"]);
  if (r.error) throw new Error("git could not be run: " + r.error.message);
  return r.status === 0 ? r.stdout.trim() : null;
}

/** A hash of every project file that differs from the last commit. */
function fingerprint(root) {
  const diff = git(root, ["diff", "HEAD", "--", ".", ...NOT_A_FIX]);
  if (diff.status !== 0) throw new Error("git diff failed: " + String(diff.stderr).trim().slice(0, 300));
  const others = git(root, ["ls-files", "-z", "--others", "--exclude-standard", "--", ".", ...NOT_A_FIX]);
  if (others.status !== 0) throw new Error("git ls-files failed: " + String(others.stderr).trim().slice(0, 300));
  const h = crypto.createHash("sha1").update(git(root, ["rev-parse", "HEAD"]).stdout).update(diff.stdout);
  for (const rel of others.stdout.split("\0").filter(Boolean)) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const st = fs.statSync(abs);
    h.update(rel + ":" + st.size + ":" + st.mtimeMs + "\n");
  }
  return h.digest("hex");
}

function statePath(root) {
  return path.join(STATE_DIR, crypto.createHash("sha1").update(root).digest("hex").slice(0, 16) + ".json");
}

function readState(root) {
  const file = statePath(root);
  if (!fs.existsSync(file)) return { runs: {}, full: {} };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeState(root, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const file = statePath(root);
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

// ─── Recording (called by the PostToolUse / PostToolUseFailure entries) ─────

/** "failed" | "passed" | null, from Playwright's summary lines. */
function outcomeOf(text) {
  if (/^\s*\d+ failed\b/m.test(text)) return "failed";
  if (/^\s*\d+ passed\b/m.test(text)) return "passed";
  return null;
}

function record(payload, text) {
  const input = payload.tool_input || {};
  if (input.run_in_background === true) return;
  const run = playwrightRun(input.command || "", payload.cwd || process.cwd());
  if (!run) return;
  const outcome = outcomeOf(text);
  if (!outcome) return;
  const root = gitRoot(run.dir);
  if (!root) return;
  const state = readState(root);
  state.runs[run.runKey] = { outcome, fp: fingerprint(root), at: new Date().toISOString() };
  if (run.full) state.full[run.configKey] = { failed: outcome === "failed", narrowPassed: false };
  else if (outcome === "passed" && state.full[run.configKey]) state.full[run.configKey].narrowPassed = true;
  writeState(root, state);
}

// ─── Decisions ──────────────────────────────────────────────────────────────

function e2eBlock(command, cwd) {
  const run = playwrightRun(command, cwd);
  if (!run) return null;
  const root = gitRoot(run.dir);
  if (!root) return null;
  const state = readState(root);
  const last = state.runs[run.runKey];
  if (last && last.outcome === "failed" && last.fp === fingerprint(root)) {
    return "🔴 This exact Playwright run failed and no project file has changed since. " +
      "Read the error and the failure screenshot (test-results/**/test-failed-1.png) first, fix the cause, then run it again. " +
      "(To re-check a flaky test, change something real — a re-run of identical code proves nothing new.)";
  }
  const full = state.full[run.configKey];
  if (run.full && full && full.failed && !full.narrowPassed) {
    return "🔴 The last full run of this Playwright config failed. Re-run only what failed first " +
      "(name the failing spec files, or add --last-failed); run the whole config again once those pass.";
  }
  return null;
}

/** Total seconds a foreground wait could sleep, or Infinity for an open-ended loop. */
function waitSeconds(command) {
  const cmd = String(command);
  let worst = 0;
  for (const m of cmd.matchAll(/\b(while|until)\b[\s\S]*?\bdo\b([\s\S]*?)\bdone\b/g)) {
    if (/\bsleep\s+\d/.test(m[2])) return Infinity;
  }
  for (const m of cmd.matchAll(/\bfor\s+\w+\s+in\s+([^;\n]*?)\s*(?:;|\n)\s*do\b([\s\S]*?)\bdone\b/g)) {
    const s = m[2].match(/\bsleep\s+(\d+(?:\.\d+)?)/);
    if (!s) continue;
    const list = m[1].trim();
    const seq = list.match(/\$\(\s*seq\s+(\d+)(?:\s+(\d+))?\s*\)/);
    const brace = list.match(/^\{(\d+)\.\.(\d+)\}$/);
    const n = seq ? (seq[2] ? Number(seq[2]) - Number(seq[1]) + 1 : Number(seq[1]))
      : brace ? Number(brace[2]) - Number(brace[1]) + 1
      : list.split(/\s+/).length;
    worst = Math.max(worst, n * Number(s[1]));
  }
  const loopless = cmd.replace(/\b(while|until|for)\b[\s\S]*?\bdone\b/g, "");
  for (const m of loopless.matchAll(/\bsleep\s+(\d+(?:\.\d+)?)/g)) worst = Math.max(worst, Number(m[1]));
  return worst;
}

function waitBlock(input) {
  if (input.run_in_background === true) return null;
  const s = waitSeconds(input.command || "");
  if (s <= WAIT_LIMIT_S) return null;
  return "🔴 This command waits in the foreground (" + (s === Infinity ? "an open-ended sleep loop" : "up to " + Math.round(s) + "s of sleep") + "). " +
    "Run the same wait with run_in_background: true — you are notified once when it ends — or use Monitor for repeated events.";
}

function decide(payload) {
  if (payload.tool_name !== "Bash") return null;
  const input = payload.tool_input || {};
  return waitBlock(input) || e2eBlock(input.command || "", payload.cwd || process.cwd());
}

function readPayload() {
  return JSON.parse(fs.readFileSync(0, "utf8"));
}

function main() {
  const reason = decide(readPayload());
  if (!reason) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }));
}

if (require.main === module) main();

module.exports = { playwrightRun, waitSeconds, outcomeOf, record, decide, fingerprint, readPayload, statePath, STATE_DIR };
