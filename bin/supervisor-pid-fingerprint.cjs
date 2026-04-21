/**
 * Supervisor PID fingerprint.
 *
 * The supervisor.pid file is written as JSON `{pid, projectDir, startedAt}`
 * so that resume-time liveness checks can distinguish "our supervisor is
 * running" from "some other process recycled this PID."
 *
 * Backward-compat: if the file parses as a bare integer (legacy format),
 * treat it as `{pid, projectDir: null, startedAt: null, form: "legacy"}`
 * and let callers decide whether to trust it.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const PID_REL = path.join(".gsd-t", ".unattended", "supervisor.pid");

function pidPathFor(projectDir) {
  return path.join(path.resolve(projectDir), PID_REL);
}

function writePidFile(projectDir, pid) {
  if (!projectDir || typeof projectDir !== "string") {
    throw new Error("writePidFile: projectDir required");
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`writePidFile: invalid pid ${pid}`);
  }
  const entry = {
    pid,
    projectDir: path.resolve(projectDir),
    startedAt: new Date().toISOString(),
  };
  const p = pidPathFor(projectDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

function readPidFile(projectDir) {
  const p = pidPathFor(projectDir);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) return null;

  // Try JSON form first.
  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw);
      if (obj && Number.isInteger(obj.pid)) {
        return {
          pid: obj.pid,
          projectDir: obj.projectDir || null,
          startedAt: obj.startedAt || null,
          form: "json",
        };
      }
    } catch {
      // fall through to legacy attempt
    }
  }

  // Legacy bare-integer form.
  const n = Number.parseInt(raw, 10);
  if (Number.isInteger(n) && n > 0) {
    return { pid: n, projectDir: null, startedAt: null, form: "legacy" };
  }
  return null;
}

/**
 * verifyFingerprint(entry, projectDir, opts?)
 *
 * Returns { ok, reason, command? }:
 *   ok: true   → entry matches this project AND ps confirms gsd-t command line
 *   ok: false  → mismatch (see reason)
 *   ok: null   → inconclusive (legacy entry, can't verify)
 *
 * reason values when ok=false:
 *   "project_mismatch"   — entry.projectDir !== resolved projectDir
 *   "process_not_found"  — ps -p returned nothing
 *   "command_not_gsd_t"  — ps succeeded but command line doesn't match /gsd-t|unattended/i
 *   "ps_failed"          — ps threw (couldn't introspect)
 *
 * opts._execSync — injection point for tests
 */
function verifyFingerprint(entry, projectDir, opts = {}) {
  if (!entry || typeof entry !== "object") {
    return { ok: false, reason: "no_entry" };
  }
  if (entry.form === "legacy" || !entry.projectDir) {
    return { ok: null, reason: "legacy_fingerprint" };
  }
  const resolved = path.resolve(projectDir);
  if (entry.projectDir !== resolved) {
    return { ok: false, reason: "project_mismatch" };
  }

  const exec = opts._execSync || execSync;
  let cmd;
  try {
    const out = exec(`ps -p ${entry.pid} -o command=`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    cmd = (out || "").trim();
  } catch {
    return { ok: false, reason: "ps_failed" };
  }
  if (!cmd) {
    return { ok: false, reason: "process_not_found" };
  }
  if (!/gsd-t|unattended/i.test(cmd)) {
    return { ok: false, reason: "command_not_gsd_t", command: cmd };
  }
  return { ok: true, reason: "verified", command: cmd };
}

module.exports = {
  pidPathFor,
  writePidFile,
  readPidFile,
  verifyFingerprint,
};
