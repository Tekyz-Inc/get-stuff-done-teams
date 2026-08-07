#!/usr/bin/env node
/**
 * gsd-t-fallback-guard.js
 *
 * M106-D2 — PreToolUse hook on Write|Edit. Denies a write that introduces a
 * fallback the user never approved.
 *
 * [RULE] fallback-guard-denies-unapproved
 * [RULE] fallback-guard-halts-never-allows-on-error
 *
 * A fallback added while chasing a bug never appears in any plan — this is the
 * only trigger point that can catch it, because it fires at the moment the code
 * is written.
 *
 * ─── Stdin (Claude Code PreToolUse payload) ─────────────────────────────────
 *   { "tool_name": "Write"|"Edit", "cwd": "...",
 *     "tool_input": { "file_path": "...", "content"|"new_string": "..." } }
 *
 * ─── Decision contract ──────────────────────────────────────────────────────
 *   Deny:  {"hookSpecificOutput":{"hookEventName":"PreToolUse",
 *           "permissionDecision":"deny","permissionDecisionReason":"..."}}
 *   Allow: exit 0, no output.
 *
 * ─── HALT, never allow-on-error ─────────────────────────────────────────────
 *   This guard governs the No-Fallback rule, so it must not contain one. If the
 *   detector cannot run or its answer cannot be read, the write is DENIED with
 *   the reason — never quietly permitted. The single exception is a payload
 *   that is not a Write/Edit of source at all: that is "not applicable", not a
 *   failure, and it exits 0.
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SOURCE_EXT = new Set([".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx"]);
const TEST_PATH_RE = /(?:^|[\\/])(?:test|tests|__tests__|spec|e2e|fixtures?)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/i;

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }) + "\n");
  process.exit(0);
}

function allow() { process.exit(0); }

/** Locate the detector: project copy first, then the installed package. */
function findDetector(projectDir) {
  const candidates = [
    path.join(projectDir, "bin", "gsd-t-fallback-detect.cjs"),
    path.join(__dirname, "..", "bin", "gsd-t-fallback-detect.cjs"),
  ];
  try {
    const npmRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf8", timeout: 5000 });
    if (npmRoot.status === 0 && npmRoot.stdout) {
      candidates.push(path.join(npmRoot.stdout.trim(), "@tekyzinc", "gsd-t", "bin", "gsd-t-fallback-detect.cjs"));
    }
  } catch (_) { /* npm unavailable — the remaining candidates still apply */ }
  return candidates.find((c) => { try { return fs.existsSync(c); } catch (_) { return false; } }) || null;
}

/** Thrown when the settings file exists but cannot be understood. */
class ConfigUnreadable extends Error {}

/**
 * Is the gate switched on for this project?
 *
 * A settings file that cannot be read is NOT assumed to mean "on" — that would
 * be a guess about what the project wanted. It throws, and the caller denies
 * the write and says why. Only an ABSENT file means "on", because absence is
 * unambiguous.
 */
function isEnabled(projectDir) {
  const p = path.join(projectDir, ".gsd-t", "fallback-gate.json");
  if (!fs.existsSync(p)) return true; // absent = on, by design
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    throw new ConfigUnreadable(`${p} could not be read: ${e.message}`);
  }
  const cfg = JSON.parse(raw); // a parse failure throws, and the caller denies
  return cfg.enabled !== false;
}

function buildReason(findings, filePath) {
  const lines = [
    `This write adds ${findings.length === 1 ? "a fallback" : `${findings.length} fallbacks`} that was never approved.`,
    "",
  ];
  for (const f of findings.slice(0, 5)) {
    lines.push(`  ${f.what}`);
    if (f.snippet) lines.push(`    ${f.snippet}`);
    lines.push("");
  }
  lines.push(
    "A fallback continues after a failure. It produces wrong data that looks correct,",
    "and it removes the alarm for the bug that caused the failure.",
    "",
    "Do one of these:",
    "",
    "  1. Replace it with a halt — stop, and report what could not be done.",
    "     This is almost always the right answer.",
    "",
    "  2. Ask David for approval. Tell him, in plain words:",
    "       - what fails",
    "       - how often it really fails, with evidence",
    "       - why stopping is worse than continuing",
    "       - what it does instead (never a guessed value, never a partial result)",
    "     If he agrees, add the entry to .gsd-t/fallbacks.json and write again.",
    "",
    `  File: ${filePath}`
  );
  return lines.join("\n");
}

function main() {
  let input = "";
  let done = false;

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { input += c; });

  const finish = () => {
    if (done) return;
    done = true;

    let data;
    try {
      data = JSON.parse(input);
    } catch (_) {
      // An unparseable payload is not a write we can inspect — not applicable.
      return allow();
    }
    if (!data || typeof data !== "object") return allow();

    const tool = data.tool_name;
    if (tool !== "Write" && tool !== "Edit") return allow();

    const ti = (data.tool_input && typeof data.tool_input === "object") ? data.tool_input : {};
    const filePath = typeof ti.file_path === "string" ? ti.file_path : "";
    if (!filePath) return allow();

    const ext = path.extname(filePath);
    if (!SOURCE_EXT.has(ext)) return allow();          // not source — not applicable
    if (TEST_PATH_RE.test(filePath.replace(/\\/g, "/"))) return allow(); // tests are exempt

    const content = typeof ti.content === "string" ? ti.content
      : typeof ti.new_string === "string" ? ti.new_string
      : "";
    if (!content.trim()) return allow();

    const cwd = (typeof data.cwd === "string" && data.cwd) ? data.cwd : process.cwd();
    let on;
    try {
      on = isEnabled(cwd);
    } catch (e) {
      return deny(
        "The fallback gate's settings could not be read, so it is unclear whether\n" +
        `this project has switched the gate off.\n\n${e.message}\n\n` +
        "Fix the file, or delete it to leave the gate on."
      );
    }
    if (!on) return allow();                          // switched off for this project

    const detector = findDetector(cwd);
    if (!detector) {
      return deny(
        "The fallback detector could not be found, so this write cannot be checked.\n" +
        "Allowing it unchecked would be the exact thing this guard exists to prevent.\n\n" +
        "Reinstall GSD-T, or switch the gate off deliberately in\n" +
        ".gsd-t/fallback-gate.json with {\"enabled\": false}."
      );
    }

    const run = spawnSync(process.execPath,
      [detector, "--text", content, "--file", filePath, "--project", cwd, "--json"],
      { encoding: "utf8", timeout: 10000, maxBuffer: 8 * 1024 * 1024 });

    if (run.error || typeof run.stdout !== "string" || !run.stdout.trim()) {
      return deny(
        "The fallback check could not run, so this write cannot be verified.\n" +
        `Reason: ${run.error ? run.error.message : "the detector produced no output"}\n\n` +
        "This guard halts rather than letting an unchecked write through."
      );
    }

    let result;
    try {
      result = JSON.parse(run.stdout);
    } catch (_) {
      return deny("The fallback check returned something unreadable, so this write cannot be verified.");
    }

    if (result.exitCode === 64) {
      return deny(
        `The fallback check could not decide: ${result.error || "unknown reason"}\n\n` +
        (result.halt || "Fix the problem above, then write again.")
      );
    }

    if (result.ok) return allow();

    return deny(buildReason(result.findings || [], filePath));
  };

  process.stdin.on("end", finish);
  process.stdin.on("error", finish);
  const wd = setTimeout(finish, 8000);
  if (wd.unref) wd.unref();
}

if (require.main === module) main();

module.exports = { buildReason, findDetector, isEnabled };
