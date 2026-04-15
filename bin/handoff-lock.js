#!/usr/bin/env node

/**
 * GSD-T Handoff Lock — Fail-safe sentinel preventing parent/child race
 * conditions in `autoSpawnHeadless()`.
 *
 * Problem: when the interactive parent spawns a detached headless child to
 * resume a session, both processes may briefly contend for the continue-here
 * file and session JSON. If the child wakes and reads before the parent has
 * finished writing, it sees stale or partial state.
 *
 * Solution: the parent acquires a short-lived lock on
 * `.gsd-t/.handoff/lock-{sessionId}` BEFORE writing handoff artifacts and
 * releases it AFTER `child.unref()` returns. The child waits on the same
 * lock path before reading the continue-here file.
 *
 * Locks are TTL-bounded (default 30s) so a crashed parent can never wedge
 * a future spawn — `cleanStaleLocks()` swept by housekeeping or by the next
 * acquire attempt against an expired record reclaims the slot.
 *
 * Zero external dependencies (Node.js built-ins only).
 *
 * Contract: .gsd-t/contracts/headless-auto-spawn-contract.md v1.0.0
 *           (implementation-detail primitive; no contract bump)
 * Consumers: bin/headless-auto-spawn.js (Task 2 — wires this in),
 *            commands/gsd-t-resume.md (child-side wait).
 */

const fs = require("fs");
const path = require("path");

// ── Constants ────────────────────────────────────────────────────────────────

const HANDOFF_DIR_REL = path.join(".gsd-t", ".handoff");
const LOCK_FILE_PREFIX = "lock-";
const DEFAULT_TTL_MS = 30000;
const DEFAULT_WAIT_TIMEOUT_MS = 30000;
const DEFAULT_STALE_AGE_MS = 60000;
const POLL_INTERVAL_MS = 100;
const GRACE_MS = 500;

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  acquireHandoffLock,
  releaseHandoffLock,
  waitForLockRelease,
  cleanStaleLocks,
  // Exported for tests / consumer wiring:
  lockPathFor,
  HANDOFF_DIR_REL,
};

// ── acquireHandoffLock ───────────────────────────────────────────────────────

/**
 * Acquire an exclusive handoff lock for the given sessionId.
 *
 * @param {string} projectDir
 * @param {string} sessionId
 * @param {{ ttlMs?: number }} [opts]
 * @returns {{ lockPath: string, sessionId: string }} release handle
 * @throws {Error} if an unexpired lock already exists
 */
function acquireHandoffLock(projectDir, sessionId, opts) {
  if (!projectDir || typeof projectDir !== "string") {
    throw new Error("acquireHandoffLock: `projectDir` is required");
  }
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("acquireHandoffLock: `sessionId` is required");
  }
  const ttlMs = (opts && opts.ttlMs) || DEFAULT_TTL_MS;

  const dir = path.join(projectDir, HANDOFF_DIR_REL);
  ensureDir(dir);

  const lockPath = lockPathFor(projectDir, sessionId);

  // If a lock file already exists, decide whether it is still binding.
  if (fs.existsSync(lockPath)) {
    const existing = readLockSafe(lockPath);
    const now = Date.now();
    if (existing && now < existing.releaseBy + GRACE_MS) {
      throw new Error(
        `handoff lock held by PID ${existing.parentPid} until ${new Date(
          existing.releaseBy,
        ).toISOString()}`,
      );
    }
    // Expired or unparseable — reclaim it.
    try {
      fs.unlinkSync(lockPath);
    } catch (_) {
      /* race: someone else cleaned it; fall through */
    }
  }

  const acquiredAt = Date.now();
  const record = {
    sessionId,
    parentPid: process.pid,
    acquiredAt,
    releaseBy: acquiredAt + ttlMs,
  };

  // Write atomically: O_EXCL ensures we lose if a concurrent acquirer beats
  // us between the existsSync check above and this write.
  let fd;
  try {
    fd = fs.openSync(lockPath, "wx");
  } catch (e) {
    if (e && e.code === "EEXIST") {
      // Another acquirer raced ahead; surface a uniform error.
      const existing = readLockSafe(lockPath);
      const pid = existing ? existing.parentPid : "unknown";
      const until = existing
        ? new Date(existing.releaseBy).toISOString()
        : "unknown";
      throw new Error(`handoff lock held by PID ${pid} until ${until}`);
    }
    throw e;
  }
  try {
    fs.writeSync(fd, JSON.stringify(record, null, 2) + "\n");
  } finally {
    fs.closeSync(fd);
  }

  return { lockPath, sessionId };
}

// ── releaseHandoffLock ───────────────────────────────────────────────────────

/**
 * Release a previously acquired handoff lock. Idempotent — tolerates a
 * missing file (already released or never existed).
 *
 * @param {{ lockPath: string, sessionId: string }} handle
 */
function releaseHandoffLock(handle) {
  if (!handle || !handle.lockPath) return;
  try {
    fs.unlinkSync(handle.lockPath);
  } catch (e) {
    if (e && e.code === "ENOENT") return; // already released
    throw e;
  }
}

// ── waitForLockRelease ───────────────────────────────────────────────────────

/**
 * Poll until the lock file for {sessionId} no longer exists, OR until
 * timeoutMs elapses. Throws on timeout.
 *
 * @param {string} projectDir
 * @param {string} sessionId
 * @param {number} [timeoutMs]
 * @returns {Promise<true>}
 */
function waitForLockRelease(projectDir, sessionId, timeoutMs) {
  const limit = typeof timeoutMs === "number" ? timeoutMs : DEFAULT_WAIT_TIMEOUT_MS;
  const lockPath = lockPathFor(projectDir, sessionId);
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (!fs.existsSync(lockPath)) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= limit) {
        reject(new Error(`waitForLockRelease timeout after ${limit}ms`));
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
  });
}

// ── cleanStaleLocks ──────────────────────────────────────────────────────────

/**
 * Sweep `.gsd-t/.handoff/` and remove any `lock-*` file whose `acquiredAt`
 * is older than `maxAgeMs`. Returns the count of files removed.
 *
 * @param {string} projectDir
 * @param {number} [maxAgeMs]
 * @returns {number}
 */
function cleanStaleLocks(projectDir, maxAgeMs) {
  const limit = typeof maxAgeMs === "number" ? maxAgeMs : DEFAULT_STALE_AGE_MS;
  const dir = path.join(projectDir, HANDOFF_DIR_REL);
  if (!fs.existsSync(dir)) return 0;

  let removed = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return 0;
  }
  const now = Date.now();
  for (const name of entries) {
    if (!name.startsWith(LOCK_FILE_PREFIX)) continue;
    const fp = path.join(dir, name);
    const rec = readLockSafe(fp);
    // Unparseable lock files are treated as stale — they're not protecting
    // anything, and leaving them around defeats the cleaner.
    if (!rec || now - rec.acquiredAt > limit) {
      try {
        fs.unlinkSync(fp);
        removed++;
      } catch (_) {
        /* ignore */
      }
    }
  }
  return removed;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function lockPathFor(projectDir, sessionId) {
  return path.join(projectDir, HANDOFF_DIR_REL, `${LOCK_FILE_PREFIX}${sessionId}`);
}

function readLockSafe(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const j = JSON.parse(raw);
    if (
      typeof j === "object" &&
      j &&
      typeof j.acquiredAt === "number" &&
      typeof j.releaseBy === "number"
    ) {
      return j;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
