#!/usr/bin/env node

/**
 * GSD-T Check Headless Sessions — Read-back banner helper
 *
 * Scans .gsd-t/headless-sessions/ for completed sessions that have not yet
 * been surfaced to the user. Consumed by `gsd-t-resume` and `gsd-t-status`
 * to print a "Headless runs since you left" banner at the start of their
 * output. After surfacing, marks the session file with `surfaced: true`
 * so the banner never re-appears for the same session.
 *
 * Zero external dependencies (Node.js built-ins only).
 *
 * Contract: .gsd-t/contracts/headless-auto-spawn-contract.md v1.0.0
 * Consumers: commands/gsd-t-resume.md, commands/gsd-t-status.md
 */

const fs = require("fs");
const path = require("path");

const SESSIONS_DIR_REL = path.join(".gsd-t", "headless-sessions");

module.exports = {
  checkCompletedSessions,
  markSurfaced,
  formatBanner,
  printBannerIfAny,
};

/**
 * @param {string} [projectDir]
 * @returns {Array<object>} unsurfaced completed sessions, oldest first
 */
function checkCompletedSessions(projectDir) {
  const dir = path.join(projectDir || process.cwd(), SESSIONS_DIR_REL);
  if (!fs.existsSync(dir)) return [];

  const entries = [];
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }

  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    if (f.endsWith("-context.json")) continue;
    const fp = path.join(dir, f);
    try {
      const s = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (s && s.status === "completed" && s.surfaced !== true) {
        entries.push(s);
      }
    } catch (_) {
      // skip malformed session files silently
    }
  }

  entries.sort((a, b) => {
    const ta = a.endTimestamp || a.startTimestamp || "";
    const tb = b.endTimestamp || b.startTimestamp || "";
    return ta.localeCompare(tb);
  });

  return entries;
}

/**
 * Mark a session as surfaced so the banner won't re-appear for it.
 * @param {string} projectDir
 * @param {string} id
 */
function markSurfaced(projectDir, id) {
  const fp = path.join(projectDir || process.cwd(), SESSIONS_DIR_REL, `${id}.json`);
  if (!fs.existsSync(fp)) return;
  try {
    const s = JSON.parse(fs.readFileSync(fp, "utf8"));
    s.surfaced = true;
    fs.writeFileSync(fp, JSON.stringify(s, null, 2) + "\n");
  } catch (_) {
    /* ignore */
  }
}

/**
 * Format a human-readable banner for the given sessions. Does not print.
 * @param {Array<object>} sessions
 * @returns {string}
 */
function formatBanner(sessions) {
  if (!sessions || sessions.length === 0) return "";
  const lines = [];
  lines.push("## Headless runs since you left");
  lines.push("");
  for (const s of sessions) {
    const duration = computeDurationLabel(s.startTimestamp, s.endTimestamp);
    const outcome = s.exitCode === 0 ? "success" : `exit ${s.exitCode}`;
    const cmd = s.command || "(unknown)";
    lines.push(`- **${s.id}** — ${cmd} — ${duration} — ${outcome}`);
    if (s.logPath) lines.push(`  Log: \`${s.logPath}\``);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Convenience wrapper: check, print to stdout if any, mark surfaced.
 * Returns number of sessions surfaced.
 */
function printBannerIfAny(projectDir) {
  const sessions = checkCompletedSessions(projectDir);
  if (sessions.length === 0) return 0;
  process.stdout.write(formatBanner(sessions) + "\n");
  for (const s of sessions) markSurfaced(projectDir, s.id);
  return sessions.length;
}

function computeDurationLabel(startIso, endIso) {
  if (!startIso || !endIso) return "unknown duration";
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!isFinite(start) || !isFinite(end) || end < start) return "unknown duration";
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return `${mins}m ${rem}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

// ── CLI entry point ─────────────────────────────────────────────────────────

if (require.main === module) {
  const projectDir = process.argv[2] || process.cwd();
  const n = printBannerIfAny(projectDir);
  process.exit(n > 0 ? 0 : 0);
}
