'use strict';
/**
 * M40 D6-T1 — Orchestrator Recovery
 *
 * Reconstructs run state from an existing `.gsd-t/orchestrator/state.json`
 * so the orchestrator can be resumed after a crash/SIGINT/kill.
 *
 * Contract: stream-json-sink v1.1.0 (for workerPid/taskId attribution),
 *           completion-signal v1.x (assertCompletion reconciliation),
 *           wave-join v1.x (wave ordering + second-fail-halt policy).
 *
 * Rules:
 *   - state.json absent             → { mode: 'fresh' }
 *   - status ∈ {done,failed,stopped,interrupted,completed} → { mode: 'terminal' }
 *   - status === 'running'          → { mode: 'resume', ... }
 *     - Every task with status === 'running' is reconciled via assertCompletion:
 *         ok                       → DONE (status rewritten, retry count preserved)
 *         missing only progress    → flagged for operator triage (status: 'ambiguous')
 *         missing commit+test+etc  → FAILED (respects existing retryCount — if already
 *                                   retried once, second-fail-halt is triggered by caller)
 *     - A live `workerPid` on a task gets a best-effort `kill -0` liveness check; stale
 *       pid is logged but treated as crashed (not silently reclaimed).
 *     - currentWave = first wave with any task not in {done, ambiguous}; null if all done.
 *
 * The caller (the orchestrator `--resume` CLI flag, D6-T2) decides what to do with
 * ambiguous tasks — this module never silently claims completion.
 */

const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join('.gsd-t', 'orchestrator');
const STATE_FILE = 'state.json';

const TERMINAL_STATUSES = new Set(['done', 'failed', 'stopped', 'interrupted', 'completed']);

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {Function} [opts.assertCompletionImpl] - for testing (default: real impl)
 * @param {Function} [opts.pidLivenessCheck]     - for testing (default: process.kill(pid, 0))
 * @param {Function} [opts.now]                  - iso string; default new Date().toISOString()
 * @returns {object} { mode, currentWave, tasks, state, ambiguous, notes }
 */
function recoverRunState(opts) {
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const statePath = path.join(projectDir, STATE_DIR, STATE_FILE);
  const notes = [];

  if (!fs.existsSync(statePath)) {
    return { mode: 'fresh', currentWave: null, tasks: {}, state: null, ambiguous: [], notes };
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (err) {
    notes.push(`state.json parse failed: ${err.message} — treating as terminal/corrupt`);
    return { mode: 'terminal', currentWave: null, tasks: {}, state: null, ambiguous: [], notes };
  }
  if (!state || typeof state !== 'object') {
    notes.push('state.json is not an object — treating as terminal/corrupt');
    return { mode: 'terminal', currentWave: null, tasks: {}, state: null, ambiguous: [], notes };
  }

  if (TERMINAL_STATUSES.has(state.status)) {
    return { mode: 'terminal', currentWave: null, tasks: state.tasks || {}, state, ambiguous: [], notes };
  }

  // Non-terminal: reconcile every in-flight task.
  const assertCompletionImpl = (opts && opts.assertCompletionImpl) || defaultAssertCompletion;
  const pidCheck = (opts && opts.pidLivenessCheck) || defaultPidLiveness;
  const expectedBranch = (opts && opts.expectedBranch) || state.expectedBranch || 'main';

  const tasks = { ...(state.tasks || {}) };
  const ambiguous = [];

  for (const [taskId, t] of Object.entries(tasks)) {
    if (t.status !== 'running') continue;

    // PID liveness — informational only
    if (t.workerPid) {
      const alive = pidCheck(t.workerPid);
      if (!alive) notes.push(`task ${taskId}: workerPid ${t.workerPid} no longer alive (crashed)`);
    }

    // Reconcile via assertCompletion
    let result;
    try {
      result = assertCompletionImpl({
        taskId: t.canonicalId || taskId,
        projectDir,
        expectedBranch,
        taskStart: t.startedAt,
        ownedPatterns: t.ownedPatterns || [],
        skipTest: true, // recovery shouldn't rerun the test suite per task
      });
    } catch (err) {
      notes.push(`task ${taskId}: assertCompletion threw — ${err.message}; treating as failed`);
      tasks[taskId] = {
        ...t,
        status: 'failed',
        endedAt: (opts && opts.now ? opts.now() : new Date().toISOString()),
        missing: ['recovery_assert_threw'],
        recoverySource: 'assert_error',
      };
      continue;
    }

    const missing = Array.isArray(result && result.missing) ? result.missing : [];

    if (result && result.ok) {
      tasks[taskId] = {
        ...t,
        status: 'done',
        endedAt: t.endedAt || (opts && opts.now ? opts.now() : new Date().toISOString()),
        missing: [],
        recoverySource: 'recovered_ok',
      };
      continue;
    }

    // Ambiguous case: commit present BUT progress entry missing (and no other issues).
    // Don't silently claim done; caller must triage.
    const onlyProgressMissing = missing.length === 1 && missing[0] === 'no_progress_entry';
    if (onlyProgressMissing) {
      tasks[taskId] = {
        ...t,
        status: 'ambiguous',
        missing,
        recoverySource: 'commit_without_progress',
      };
      ambiguous.push(taskId);
      notes.push(`task ${taskId}: commit found but no progress.md entry — flagged for triage`);
      continue;
    }

    // Otherwise: treat as failed. Preserve retryCount.
    tasks[taskId] = {
      ...t,
      status: 'failed',
      endedAt: (opts && opts.now ? opts.now() : new Date().toISOString()),
      missing,
      recoverySource: 'reconcile_failed',
    };
  }

  const currentWave = firstIncompleteWave(tasks);

  return {
    mode: 'resume',
    currentWave,
    tasks,
    state,
    ambiguous,
    notes,
  };
}

/**
 * Write back a reconciled state.json (same path) with recovered task statuses.
 * The orchestrator `--resume` flow uses this to persist the recovery results
 * before it begins retrying / continuing.
 */
function writeRecoveredState(projectDir, reconciled) {
  const statePath = path.join(projectDir, STATE_DIR, STATE_FILE);
  try { fs.mkdirSync(path.dirname(statePath), { recursive: true }); } catch { /* exists */ }
  const tmp = statePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(reconciled, null, 2) + '\n');
  fs.renameSync(tmp, statePath);
}

/**
 * Archive the existing state.json to .gsd-t/orchestrator/archive/{ts}/state.json
 * and remove the original. Used when mode === 'terminal' and a fresh run is desired.
 * Returns { archived: true, archivePath } or { archived: false } if nothing to archive.
 */
function archiveState(projectDir, opts) {
  const statePath = path.join(projectDir, STATE_DIR, STATE_FILE);
  if (!fs.existsSync(statePath)) return { archived: false };
  const ts = (opts && opts.timestamp) || new Date().toISOString().replace(/[:.]/g, '-');
  const archiveDir = path.join(projectDir, STATE_DIR, 'archive', ts);
  fs.mkdirSync(archiveDir, { recursive: true });
  const dest = path.join(archiveDir, STATE_FILE);
  fs.renameSync(statePath, dest);
  return { archived: true, archivePath: dest };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function firstIncompleteWave(tasks) {
  let min = Infinity;
  for (const t of Object.values(tasks)) {
    if (!t || typeof t !== 'object') continue;
    if (t.status === 'done' || t.status === 'ambiguous') continue;
    if (t.wave != null && Number.isFinite(Number(t.wave))) {
      const w = Number(t.wave);
      if (w < min) min = w;
    }
  }
  return min === Infinity ? null : min;
}

function defaultAssertCompletion(opts) {
  const { assertCompletion } = require('./gsd-t-completion-check.cjs');
  return assertCompletion(opts);
}

function defaultPidLiveness(pid) {
  if (!pid || !Number.isFinite(Number(pid))) return false;
  try {
    // signal 0 doesn't deliver a signal — only checks existence/permission.
    process.kill(Number(pid), 0);
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = exists but not ours (treat as alive)
    if (err && err.code === 'EPERM') return true;
    return false;
  }
}

module.exports = {
  recoverRunState,
  writeRecoveredState,
  archiveState,
  // exported for tests
  _firstIncompleteWave: firstIncompleteWave,
  _TERMINAL_STATUSES: TERMINAL_STATUSES,
};
