/**
 * gsd-t-unattended-heartbeat.cjs
 *
 * Liveness heartbeat watchdog for the unattended supervisor.
 *
 * Supersedes the pre-M43 `workerTimeoutMs` wall-clock guillotine as the
 * PRIMARY stuck-worker detector. The guillotine remains as an absolute
 * backstop (raised to 1 hour by default) for pathological cases where a
 * child never writes a single event.
 *
 * How it works
 * ────────────
 * The supervisor polls `.gsd-t/events/YYYY-MM-DD.jsonl` mtime every 60 s
 * during a worker iteration. If the mtime has not advanced for at least
 * `staleHeartbeatMs` (default 300_000 = 5 min), the worker is considered
 * stuck and SIGTERM'd. Healthy workers producing events run indefinitely
 * under the 1-hour absolute cap.
 *
 * This module is pure and side-effect-free by default. `checkHeartbeat()`
 * accepts injected `now` and `fsShim` so the entire watchdog can be
 * unit-tested with a fake clock and fake filesystem.
 *
 * Zero external dependencies — Node built-ins only.
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.1.0
 *   §"Heartbeat Watchdog"
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Build the events JSONL path for a given date.
 *
 * @param {string} projectDir
 * @param {Date|number} when  Date, or ms since epoch. Defaults to now when
 *   omitted at the call site.
 * @returns {string}
 */
function eventsPathFor(projectDir, when) {
  const d = when instanceof Date ? when : new Date(when || Date.now());
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return path.join(projectDir, ".gsd-t", "events", `${y}-${m}-${day}.jsonl`);
}

/**
 * Check whether the worker's event stream is stale.
 *
 * A worker is "stale" when the relevant events JSONL file's mtime has not
 * advanced within `staleHeartbeatMs` of the given `now`. The relevant file
 * is the one matching the date of `now` — if the loop crosses a UTC day
 * boundary mid-iteration, the new day's file is checked.
 *
 * Fresh worker grace: if the events file does not exist yet AND
 * `(now - workerStartedAt) < staleHeartbeatMs`, the worker is considered
 * healthy (still booting). After the grace window with no file, the worker
 * is stale.
 *
 * @param {object} params
 * @param {string} params.projectDir
 * @param {number} params.workerStartedAt  ms since epoch
 * @param {number} params.staleHeartbeatMs
 * @param {number} [params.now]            ms since epoch (defaults to Date.now())
 * @param {object} [params.fsShim]         { existsSync, statSync } — test hook
 * @returns {{stale: boolean, reason: string, lastEventMs: (number|null), ageMs: (number|null), eventsPath: string}}
 */
function checkHeartbeat({
  projectDir,
  workerStartedAt,
  staleHeartbeatMs,
  now,
  fsShim,
}) {
  if (typeof projectDir !== "string" || projectDir.length === 0) {
    throw new Error("checkHeartbeat: projectDir is required");
  }
  if (typeof workerStartedAt !== "number" || !Number.isFinite(workerStartedAt)) {
    throw new Error("checkHeartbeat: workerStartedAt must be a finite number");
  }
  if (
    typeof staleHeartbeatMs !== "number" ||
    !Number.isFinite(staleHeartbeatMs) ||
    staleHeartbeatMs <= 0
  ) {
    throw new Error("checkHeartbeat: staleHeartbeatMs must be a positive number");
  }
  const nowMs = typeof now === "number" ? now : Date.now();
  const shim = fsShim || fs;

  const eventsPath = eventsPathFor(projectDir, nowMs);

  let exists = false;
  try {
    exists = !!shim.existsSync(eventsPath);
  } catch (_) {
    exists = false;
  }

  if (!exists) {
    const sinceStart = nowMs - workerStartedAt;
    if (sinceStart < staleHeartbeatMs) {
      return {
        stale: false,
        reason: `events file not yet created (grace: ${sinceStart}ms < ${staleHeartbeatMs}ms)`,
        lastEventMs: null,
        ageMs: null,
        eventsPath,
      };
    }
    return {
      stale: true,
      reason: `events file ${eventsPath} absent for ${sinceStart}ms since worker start (threshold ${staleHeartbeatMs}ms)`,
      lastEventMs: null,
      ageMs: sinceStart,
      eventsPath,
    };
  }

  let stat;
  try {
    stat = shim.statSync(eventsPath);
  } catch (err) {
    // File existed at existsSync but stat failed — treat as stale only if
    // we are past the grace window. Under the grace window, assume transient.
    const sinceStart = nowMs - workerStartedAt;
    if (sinceStart < staleHeartbeatMs) {
      return {
        stale: false,
        reason: `events stat transient failure (grace): ${err.message}`,
        lastEventMs: null,
        ageMs: null,
        eventsPath,
      };
    }
    return {
      stale: true,
      reason: `events stat failed past grace: ${err.message}`,
      lastEventMs: null,
      ageMs: sinceStart,
      eventsPath,
    };
  }

  const mtimeMs =
    typeof stat.mtimeMs === "number"
      ? stat.mtimeMs
      : stat.mtime instanceof Date
        ? stat.mtime.getTime()
        : 0;

  // Reference point for staleness: max(mtime, workerStartedAt). This handles
  // the bootstrap case where the events file already existed from a prior
  // iteration — we don't want to kill the worker on its first 60s poll just
  // because it hasn't emitted yet. The worker gets at least staleHeartbeatMs
  // from its own start to produce the first event.
  const ref = Math.max(mtimeMs, workerStartedAt);
  const ageMs = nowMs - ref;

  if (ageMs >= staleHeartbeatMs) {
    return {
      stale: true,
      reason: `last event ${ageMs}ms ago (threshold ${staleHeartbeatMs}ms)`,
      lastEventMs: mtimeMs,
      ageMs,
      eventsPath,
    };
  }
  return {
    stale: false,
    reason: `fresh — last event ${ageMs}ms ago`,
    lastEventMs: mtimeMs,
    ageMs,
    eventsPath,
  };
}

module.exports = {
  checkHeartbeat,
  eventsPathFor,
  // Default heartbeat poll cadence — exported so tests and the supervisor
  // can reference a single source of truth.
  DEFAULT_HEARTBEAT_POLL_MS: 60 * 1000,
  DEFAULT_STALE_HEARTBEAT_MS: 5 * 60 * 1000,
};
