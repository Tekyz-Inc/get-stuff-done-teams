#!/usr/bin/env node
/**
 * gsd-t-compact-detector.js
 *
 * SessionStart hook that records compaction events.
 *
 * Claude Code fires SessionStart with `source: "compact"` immediately after an
 * auto-compaction. By contrast, a fresh launch fires with `source: "startup"`
 * and a resumed session fires with `source: "resume"`. Only `compact` is
 * recorded — it's the transition marker that separates one Context Window
 * from the next.
 *
 * Without this hook, Context Window boundaries are invisible: every iter
 * silently looks like a single CW. That breaks the canonical measurement
 * hierarchy (Run → Iter → Context Window → Turn → Tool call).
 *
 * Behavior:
 * - Zero-dep. Reads stdin JSON, silently fails on any error. Always exits 0 —
 *   throwing here would break Claude Code session startup.
 * - Only acts when `source === "compact"`.
 * - Appends one NDJSON row to `<cwd>/.gsd-t/metrics/compactions.jsonl`.
 * - Appends one compact_marker frame to the most-recently-modified
 *   `<cwd>/.gsd-t/transcripts/*.ndjson` (the live transcript). No-ops
 *   silently when no transcript exists.
 * - 1 MiB stdin cap (defense in depth; real payloads are tiny).
 * - Path-traversal guard: refuses any cwd that doesn't let the resolved
 *   output path stay under `<cwd>/.gsd-t/metrics/`.
 * - Off switch: if `<cwd>/.gsd-t/` does not exist, silent no-op. Creating it
 *   is opt-in; deleting it disables the hook without having to edit
 *   settings.json.
 *
 * Contract: .gsd-t/contracts/compaction-events-contract.md
 */
"use strict";

const fs = require("fs");
const path = require("path");

const MAX_STDIN = 1024 * 1024; // 1 MiB
const SCHEMA_VERSION = 1;

let input = "";
let aborted = false;

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (input.length > MAX_STDIN) {
    aborted = true;
    try { process.stdin.destroy(); } catch { /* noop */ }
  }
});
process.stdin.on("error", () => { /* silent */ });
process.stdin.on("end", () => {
  if (aborted) { exitClean(); return; }
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    exitClean();
    return;
  }

  if (!payload || typeof payload !== "object") { exitClean(); return; }

  // Only record `compact`. Startup / resume are no-ops.
  if (payload.source !== "compact") { exitClean(); return; }

  try {
    writeRow(payload);
  } catch {
    // silent — never throw
  }
  try {
    writeTranscriptMarker(payload);
  } catch {
    // silent — never throw
  }
  exitClean();
});

function writeRow(payload) {
  // `cwd` must be absolute when present. An invalid value is NOT silently
  // coerced to process.cwd() — that would let a malformed payload write
  // into whatever dir the hook happened to be spawned from.
  let cwd;
  if (typeof payload.cwd === "string") {
    if (!path.isAbsolute(payload.cwd)) return; // invalid — no-op
    cwd = payload.cwd;
  } else if (payload.cwd === undefined || payload.cwd === null) {
    cwd = process.cwd();
  } else {
    return; // non-string cwd — no-op
  }

  // `.gsd-t/` must exist — acts as the off-switch.
  const gsdDir = path.join(cwd, ".gsd-t");
  if (!fs.existsSync(gsdDir)) return;

  const metricsDir = path.join(gsdDir, "metrics");
  const outPath = path.join(metricsDir, "compactions.jsonl");

  // Path-traversal guard.
  const resolvedOut = path.resolve(outPath);
  const resolvedMetrics = path.resolve(metricsDir) + path.sep;
  if (!resolvedOut.startsWith(resolvedMetrics)) return;

  try {
    fs.mkdirSync(metricsDir, { recursive: true });
  } catch {
    return;
  }

  const row = {
    ts: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    session_id: typeof payload.session_id === "string" ? payload.session_id : null,
    prior_session_id: typeof payload.prior_session_id === "string"
      ? payload.prior_session_id
      : (typeof payload.previous_session_id === "string"
          ? payload.previous_session_id
          : null),
    source: "compact",
    cwd,
    hook: "SessionStart",
  };

  fs.appendFileSync(outPath, JSON.stringify(row) + "\n", "utf8");
}

/**
 * Find the most-recently-modified .ndjson in <cwd>/.gsd-t/transcripts/.
 * Returns the absolute path, or null if none exists or the directory is absent.
 *
 * Target-selection rules (M45 D2):
 * 1. Default: prefer the most-recently-modified SPAWN NDJSON (any file whose
 *    basename does NOT start with `in-session-`).
 * 2. Fallback: if no spawn NDJSON has been modified within the last
 *    IN_SESSION_FALLBACK_MS (30s) AND a fresh `in-session-*.ndjson` exists,
 *    target that file instead. Log the decision to stderr so regressions
 *    are obvious during debugging.
 * 3. Last resort: if only in-session NDJSONs exist, pick the newest one
 *    (covers the edge case where a user triggers /compact during a pure
 *    conversation session with no spawns in flight).
 */
const IN_SESSION_FALLBACK_MS = 30 * 1000; // 30 seconds

function findActiveTranscript(cwd) {
  const transcriptsDir = path.join(cwd, ".gsd-t", "transcripts");
  let entries;
  try {
    entries = fs.readdirSync(transcriptsDir);
  } catch {
    return null;
  }
  const ndjsons = entries.filter((e) => e.endsWith(".ndjson"));
  if (!ndjsons.length) return null;

  let newestSpawn = null;
  let newestSpawnMtime = -1;
  let newestInSession = null;
  let newestInSessionMtime = -1;
  for (const name of ndjsons) {
    const full = path.join(transcriptsDir, name);
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(full).mtimeMs;
    } catch {
      continue;
    }
    const isInSession = name.indexOf("in-session-") === 0;
    if (isInSession) {
      if (mtimeMs > newestInSessionMtime) {
        newestInSessionMtime = mtimeMs;
        newestInSession = full;
      }
    } else {
      if (mtimeMs > newestSpawnMtime) {
        newestSpawnMtime = mtimeMs;
        newestSpawn = full;
      }
    }
  }

  const now = Date.now();
  const spawnFresh = newestSpawn != null && (now - newestSpawnMtime) < IN_SESSION_FALLBACK_MS;

  if (spawnFresh) return newestSpawn;

  if (newestInSession != null) {
    try {
      process.stderr.write(
        "compact-detector: targeting " + path.basename(newestInSession) + " (fallback)\n"
      );
    } catch {
      // silent — stderr write must never break the hook
    }
    return newestInSession;
  }

  // No fresh spawn, no in-session — fall back to the newest spawn (even if stale)
  // so v1.0.0 behavior is preserved for legacy projects with no in-session file.
  return newestSpawn;
}

/**
 * Append a compact_marker frame to the active transcript NDJSON.
 * No-ops silently when no transcript exists.
 */
function writeTranscriptMarker(payload) {
  let cwd;
  if (typeof payload.cwd === "string") {
    if (!path.isAbsolute(payload.cwd)) return;
    cwd = payload.cwd;
  } else if (payload.cwd === undefined || payload.cwd === null) {
    cwd = process.cwd();
  } else {
    return;
  }

  const gsdDir = path.join(cwd, ".gsd-t");
  if (!fs.existsSync(gsdDir)) return;

  const transcriptPath = findActiveTranscript(cwd);
  if (!transcriptPath) return;

  // Path-traversal guard: resolved transcript path must stay under <cwd>/.gsd-t/transcripts/
  const transcriptsDir = path.join(gsdDir, "transcripts") + path.sep;
  if (!path.resolve(transcriptPath).startsWith(path.resolve(transcriptsDir))) return;

  const marker = {
    type: "compact_marker",
    ts: new Date().toISOString(),
    source: "compact",
    session_id: typeof payload.session_id === "string" ? payload.session_id : null,
    prior_session_id: typeof payload.prior_session_id === "string"
      ? payload.prior_session_id
      : (typeof payload.previous_session_id === "string"
          ? payload.previous_session_id
          : null),
  };

  // Include optional fields when present.
  if (typeof payload.trigger === "string") marker.trigger = payload.trigger;
  if (typeof payload.preTokens === "number") marker.preTokens = payload.preTokens;
  if (typeof payload.postTokens === "number") marker.postTokens = payload.postTokens;
  // Also check nested compactMetadata (scanner shape).
  if (payload.compactMetadata && typeof payload.compactMetadata === "object") {
    if (typeof payload.compactMetadata.trigger === "string" && !marker.trigger) {
      marker.trigger = payload.compactMetadata.trigger;
    }
    if (typeof payload.compactMetadata.preTokens === "number" && marker.preTokens == null) {
      marker.preTokens = payload.compactMetadata.preTokens;
    }
    if (typeof payload.compactMetadata.postTokens === "number" && marker.postTokens == null) {
      marker.postTokens = payload.compactMetadata.postTokens;
    }
  }

  fs.appendFileSync(transcriptPath, JSON.stringify(marker) + "\n", "utf8");
}

function exitClean() {
  try { process.stdout.write(""); } catch { /* noop */ }
  process.exit(0);
}
