/**
 * Tests for bin/handoff-lock.js — fail-safe sentinel preventing parent/child
 * race conditions in `autoSpawnHeadless()`.
 *
 * Uses Node.js built-in test runner (node --test).
 *
 * Contract: .gsd-t/contracts/headless-auto-spawn-contract.md v1.0.0
 *           (lock primitive is an implementation detail — no contract bump)
 *
 * Coverage (≥11 unit tests):
 *   1.  acquire creates the lock file with required fields
 *   2.  acquire creates `.gsd-t/.handoff/` if absent
 *   3.  acquire fails when an unexpired lock is held
 *   4.  acquire succeeds when the prior lock has expired
 *   5.  release deletes the lock file
 *   6.  release is idempotent (no throw on missing file)
 *   7.  waitForLockRelease resolves when the lock disappears
 *   8.  waitForLockRelease rejects on timeout
 *   9.  cleanStaleLocks removes locks older than maxAgeMs
 *   10. cleanStaleLocks preserves fresh locks
 *   11. parent → spawn → child handoff race simulation
 *   12. acquire returns a release handle whose lockPath is the on-disk path
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const lockMod = require("../bin/handoff-lock.js");
const {
  acquireHandoffLock,
  releaseHandoffLock,
  waitForLockRelease,
  cleanStaleLocks,
  lockPathFor,
  HANDOFF_DIR_REL,
} = lockMod;

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-handoff-lock-"));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
});

// Each test gets a unique session id to prevent any cross-test bleed even
// if the temp dir cleanup races filesystem cache.
let counter = 0;
function nextSessionId() {
  counter += 1;
  return `test-session-${process.pid}-${Date.now()}-${counter}`;
}

// ── 1. acquire creates the lock file ────────────────────────────────────────

describe("handoff-lock: acquireHandoffLock", () => {
  it("creates a lock file containing sessionId, parentPid, acquiredAt, releaseBy", () => {
    const sid = nextSessionId();
    const handle = acquireHandoffLock(tmpDir, sid);

    assert.ok(fs.existsSync(handle.lockPath), "lock file should exist on disk");
    assert.equal(handle.sessionId, sid);

    const rec = JSON.parse(fs.readFileSync(handle.lockPath, "utf8"));
    assert.equal(rec.sessionId, sid);
    assert.equal(rec.parentPid, process.pid);
    assert.equal(typeof rec.acquiredAt, "number");
    assert.equal(typeof rec.releaseBy, "number");
    assert.ok(rec.releaseBy > rec.acquiredAt, "releaseBy must be after acquiredAt");

    releaseHandoffLock(handle);
  });

  // ── 2. acquire creates the .handoff directory if absent ──────────────────

  it("creates `.gsd-t/.handoff/` if it does not exist", () => {
    const sid = nextSessionId();
    const handoffDir = path.join(tmpDir, HANDOFF_DIR_REL);
    assert.equal(fs.existsSync(handoffDir), false, "precondition: dir absent");

    const handle = acquireHandoffLock(tmpDir, sid);
    assert.ok(fs.existsSync(handoffDir), ".handoff dir should be created");
    releaseHandoffLock(handle);
  });

  // ── 3. acquire fails when an unexpired lock is held ──────────────────────

  it("throws when an unexpired lock for the same sessionId already exists", () => {
    const sid = nextSessionId();
    const handle = acquireHandoffLock(tmpDir, sid, { ttlMs: 30000 });
    try {
      assert.throws(
        () => acquireHandoffLock(tmpDir, sid),
        /handoff lock held by PID \d+/,
      );
    } finally {
      releaseHandoffLock(handle);
    }
  });

  // ── 4. acquire succeeds when prior lock is expired ───────────────────────

  it("reclaims an expired lock and succeeds", () => {
    const sid = nextSessionId();
    // Forge an already-expired lock file directly on disk.
    const handoffDir = path.join(tmpDir, HANDOFF_DIR_REL);
    fs.mkdirSync(handoffDir, { recursive: true });
    const lockPath = lockPathFor(tmpDir, sid);
    const longAgo = Date.now() - 60_000;
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        sessionId: sid,
        parentPid: 999999,
        acquiredAt: longAgo,
        releaseBy: longAgo + 1000, // expired 59 seconds ago
      }) + "\n",
    );

    const handle = acquireHandoffLock(tmpDir, sid);
    const rec = JSON.parse(fs.readFileSync(handle.lockPath, "utf8"));
    assert.equal(rec.parentPid, process.pid, "fresh acquirer must own the lock");
    releaseHandoffLock(handle);
  });

  // ── 12. handle's lockPath matches the canonical helper ───────────────────

  it("returns a handle whose lockPath matches lockPathFor()", () => {
    const sid = nextSessionId();
    const handle = acquireHandoffLock(tmpDir, sid);
    assert.equal(handle.lockPath, lockPathFor(tmpDir, sid));
    releaseHandoffLock(handle);
  });
});

// ── 5/6. releaseHandoffLock ─────────────────────────────────────────────────

describe("handoff-lock: releaseHandoffLock", () => {
  it("deletes the lock file", () => {
    const sid = nextSessionId();
    const handle = acquireHandoffLock(tmpDir, sid);
    assert.ok(fs.existsSync(handle.lockPath));
    releaseHandoffLock(handle);
    assert.equal(fs.existsSync(handle.lockPath), false);
  });

  it("is idempotent — second release on a missing file does not throw", () => {
    const sid = nextSessionId();
    const handle = acquireHandoffLock(tmpDir, sid);
    releaseHandoffLock(handle);
    assert.doesNotThrow(() => releaseHandoffLock(handle));
  });
});

// ── 7/8. waitForLockRelease ─────────────────────────────────────────────────

describe("handoff-lock: waitForLockRelease", () => {
  it("resolves when the lock file is released", async () => {
    const sid = nextSessionId();
    const handle = acquireHandoffLock(tmpDir, sid);

    // Release after 250ms (a few poll intervals later).
    setTimeout(() => releaseHandoffLock(handle), 250);

    const result = await waitForLockRelease(tmpDir, sid, 5000);
    assert.equal(result, true);
  });

  it("rejects with a timeout error when the lock is never released", async () => {
    const sid = nextSessionId();
    const handle = acquireHandoffLock(tmpDir, sid);

    try {
      await assert.rejects(
        waitForLockRelease(tmpDir, sid, 300),
        /waitForLockRelease timeout after 300ms/,
      );
    } finally {
      releaseHandoffLock(handle);
    }
  });

  it("resolves immediately when no lock exists", async () => {
    const sid = nextSessionId();
    const result = await waitForLockRelease(tmpDir, sid, 1000);
    assert.equal(result, true);
  });
});

// ── 9/10. cleanStaleLocks ───────────────────────────────────────────────────

describe("handoff-lock: cleanStaleLocks", () => {
  it("removes lock files older than maxAgeMs", () => {
    const handoffDir = path.join(tmpDir, HANDOFF_DIR_REL);
    fs.mkdirSync(handoffDir, { recursive: true });

    const old1 = lockPathFor(tmpDir, "stale-a");
    const old2 = lockPathFor(tmpDir, "stale-b");
    const longAgo = Date.now() - 120_000; // 2 minutes ago
    for (const fp of [old1, old2]) {
      fs.writeFileSync(
        fp,
        JSON.stringify({
          sessionId: path.basename(fp).replace(/^lock-/, ""),
          parentPid: 1,
          acquiredAt: longAgo,
          releaseBy: longAgo + 1000,
        }) + "\n",
      );
    }

    const removed = cleanStaleLocks(tmpDir, 60_000);
    assert.equal(removed, 2);
    assert.equal(fs.existsSync(old1), false);
    assert.equal(fs.existsSync(old2), false);
  });

  it("preserves fresh locks (acquiredAt within maxAgeMs)", () => {
    const sid = nextSessionId();
    const handle = acquireHandoffLock(tmpDir, sid);

    const removed = cleanStaleLocks(tmpDir, 60_000);
    assert.equal(removed, 0);
    assert.ok(fs.existsSync(handle.lockPath), "fresh lock must survive cleanup");
    releaseHandoffLock(handle);
  });

  it("returns 0 when `.handoff/` does not exist", () => {
    assert.equal(cleanStaleLocks(tmpDir, 60_000), 0);
  });
});

// ── 11. Parent-child race simulation ────────────────────────────────────────

describe("handoff-lock: parent/child race simulation", () => {
  it("child waits while parent holds, then proceeds after release", async () => {
    const sid = nextSessionId();

    // Parent acquires before "spawning" the child.
    const parentHandle = acquireHandoffLock(tmpDir, sid);

    // Simulate the child's wait (it cannot read the continue-here file
    // until the parent releases the lock).
    const childWaitStart = Date.now();
    const childPromise = waitForLockRelease(tmpDir, sid, 5000);

    // Parent finishes its critical section after ~200ms and releases.
    const PARENT_HOLD_MS = 200;
    setTimeout(() => releaseHandoffLock(parentHandle), PARENT_HOLD_MS);

    const result = await childPromise;
    const elapsed = Date.now() - childWaitStart;

    assert.equal(result, true, "child must observe release");
    assert.ok(
      elapsed >= PARENT_HOLD_MS - 50,
      `child waited at least ${PARENT_HOLD_MS}ms (got ${elapsed}ms)`,
    );
    assert.equal(
      fs.existsSync(parentHandle.lockPath),
      false,
      "lock file should be gone after parent release",
    );
  });
});
