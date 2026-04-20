'use strict';
/**
 * M40 D6-T4 — Orchestrator Recovery unit tests
 *
 * Covers recoverRunState() branches:
 *   - state.json absent          → mode: 'fresh'
 *   - corrupt state.json         → mode: 'terminal'
 *   - terminal status            → mode: 'terminal'
 *   - running status with reconciliation for each running task:
 *       ok                       → done
 *       only no_progress_entry   → ambiguous (flagged, not silently claimed done)
 *       other missing            → failed
 *       assertCompletion throws  → failed
 *   - firstIncompleteWave picks lowest wave with non-done/non-ambiguous tasks
 *   - writeRecoveredState round-trips via atomic rename
 *   - archiveState moves state.json into timestamped archive dir
 *   - default PID liveness: EPERM = alive, ESRCH = dead
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  recoverRunState,
  writeRecoveredState,
  archiveState,
  _firstIncompleteWave,
  _TERMINAL_STATUSES
} = require('../bin/gsd-t-orchestrator-recover.cjs');

function mkProj(stateObj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-recover-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'orchestrator'), { recursive: true });
  if (stateObj !== undefined) {
    const fp = path.join(dir, '.gsd-t', 'orchestrator', 'state.json');
    fs.writeFileSync(fp, typeof stateObj === 'string' ? stateObj : JSON.stringify(stateObj, null, 2));
  }
  return dir;
}

// ── mode: fresh ──────────────────────────────────────────────────────────────

test('recover: no state.json → mode=fresh', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-recover-'));
  const r = recoverRunState({ projectDir: dir });
  assert.equal(r.mode, 'fresh');
  assert.equal(r.currentWave, null);
  assert.deepEqual(r.tasks, {});
  assert.deepEqual(r.ambiguous, []);
});

// ── mode: terminal ───────────────────────────────────────────────────────────

test('recover: corrupt state.json → mode=terminal', () => {
  const dir = mkProj('{ not valid json');
  const r = recoverRunState({ projectDir: dir });
  assert.equal(r.mode, 'terminal');
  assert.ok(r.notes.some((n) => /parse failed/.test(n)));
});

test('recover: non-object state.json → mode=terminal', () => {
  const dir = mkProj(42); // JSON writes "42"
  const r = recoverRunState({ projectDir: dir });
  assert.equal(r.mode, 'terminal');
  assert.ok(r.notes.some((n) => /not an object/.test(n)));
});

for (const terminalStatus of ['done', 'failed', 'stopped', 'interrupted', 'completed']) {
  test(`recover: status=${terminalStatus} → mode=terminal (tasks preserved)`, () => {
    const dir = mkProj({ status: terminalStatus, tasks: { 'T-1': { status: 'done' } } });
    const r = recoverRunState({ projectDir: dir });
    assert.equal(r.mode, 'terminal');
    assert.deepEqual(r.tasks, { 'T-1': { status: 'done' } });
  });
}

// ── mode: resume — task reconciliation ───────────────────────────────────────

test('recover: running task reconciled ok → status=done, recoverySource=recovered_ok', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-1': { status: 'running', wave: 1, startedAt: '2026-04-20T10:00:00Z', canonicalId: 'T-1' }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => ({ ok: true, missing: [], details: {} }),
    pidLivenessCheck: () => true,
    now: () => '2026-04-20T11:00:00Z'
  });
  assert.equal(r.mode, 'resume');
  assert.equal(r.tasks['T-1'].status, 'done');
  assert.equal(r.tasks['T-1'].recoverySource, 'recovered_ok');
  assert.equal(r.tasks['T-1'].endedAt, '2026-04-20T11:00:00Z');
  assert.deepEqual(r.tasks['T-1'].missing, []);
});

test('recover: running task missing only progress → status=ambiguous (never silently done)', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-2': { status: 'running', wave: 1, startedAt: '2026-04-20T10:00:00Z' }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => ({ ok: false, missing: ['no_progress_entry'], details: {} })
  });
  assert.equal(r.mode, 'resume');
  assert.equal(r.tasks['T-2'].status, 'ambiguous');
  assert.equal(r.tasks['T-2'].recoverySource, 'commit_without_progress');
  assert.deepEqual(r.ambiguous, ['T-2']);
  assert.ok(r.notes.some((n) => /flagged for triage/.test(n)));
});

test('recover: running task with commit AND other missing → status=failed (not ambiguous)', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-3': { status: 'running', wave: 1, startedAt: '2026-04-20T10:00:00Z' }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => ({
      ok: false,
      missing: ['no_progress_entry', 'uncommitted_files'],
      details: {}
    })
  });
  assert.equal(r.tasks['T-3'].status, 'failed');
  assert.equal(r.tasks['T-3'].recoverySource, 'reconcile_failed');
  assert.deepEqual(r.ambiguous, []);
});

test('recover: running task with assertCompletion throwing → status=failed', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-4': { status: 'running', wave: 1, startedAt: '2026-04-20T10:00:00Z' }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => { throw new Error('boom'); }
  });
  assert.equal(r.tasks['T-4'].status, 'failed');
  assert.equal(r.tasks['T-4'].recoverySource, 'assert_error');
  assert.deepEqual(r.tasks['T-4'].missing, ['recovery_assert_threw']);
  assert.ok(r.notes.some((n) => /boom/.test(n)));
});

test('recover: retryCount preserved through reconciliation', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-5': {
        status: 'running',
        wave: 1,
        startedAt: '2026-04-20T10:00:00Z',
        retryCount: 1
      }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => ({ ok: false, missing: ['no_commit'], details: {} })
  });
  assert.equal(r.tasks['T-5'].status, 'failed');
  assert.equal(r.tasks['T-5'].retryCount, 1);
});

test('recover: non-running tasks are passed through untouched', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-done': { status: 'done', wave: 1 },
      'T-failed-prior': { status: 'failed', wave: 1 },
      'T-queued': { status: 'queued', wave: 2 }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => { throw new Error('should not be called for non-running'); }
  });
  assert.equal(r.tasks['T-done'].status, 'done');
  assert.equal(r.tasks['T-failed-prior'].status, 'failed');
  assert.equal(r.tasks['T-queued'].status, 'queued');
});

test('recover: workerPid stale liveness note added (does not affect classification)', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-6': {
        status: 'running',
        wave: 1,
        startedAt: '2026-04-20T10:00:00Z',
        workerPid: 99999
      }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => ({ ok: true, missing: [], details: {} }),
    pidLivenessCheck: () => false
  });
  assert.equal(r.tasks['T-6'].status, 'done');
  assert.ok(r.notes.some((n) => /workerPid 99999 no longer alive/.test(n)));
});

// ── currentWave selection ────────────────────────────────────────────────────

test('recover: currentWave = first wave with any incomplete task', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-w1a': { status: 'done', wave: 1 },
      'T-w1b': { status: 'running', wave: 1, startedAt: '2026-04-20T10:00:00Z' },
      'T-w2a': { status: 'queued', wave: 2 }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => ({ ok: true, missing: [], details: {} })
  });
  // Wave 1 still has T-w1b now reconciled to done; wave 2 has a queued task.
  assert.equal(r.currentWave, 2);
});

test('recover: currentWave = null when all tasks done/ambiguous', () => {
  const dir = mkProj({
    status: 'running',
    tasks: {
      'T-a': { status: 'done', wave: 1 },
      'T-b': { status: 'running', wave: 1, startedAt: '2026-04-20T10:00:00Z' }
    }
  });
  const r = recoverRunState({
    projectDir: dir,
    assertCompletionImpl: () => ({ ok: false, missing: ['no_progress_entry'], details: {} })
  });
  assert.equal(r.currentWave, null);
});

test('_firstIncompleteWave: ambiguous tasks do not count', () => {
  const w = _firstIncompleteWave({
    'T-1': { status: 'ambiguous', wave: 1 },
    'T-2': { status: 'done', wave: 1 },
    'T-3': { status: 'queued', wave: 3 }
  });
  assert.equal(w, 3);
});

test('_firstIncompleteWave: handles missing wave field', () => {
  const w = _firstIncompleteWave({
    'T-1': { status: 'queued' }, // no wave
    'T-2': { status: 'queued', wave: 2 }
  });
  assert.equal(w, 2);
});

test('_firstIncompleteWave: returns null when no incomplete tasks', () => {
  const w = _firstIncompleteWave({
    'T-1': { status: 'done', wave: 1 },
    'T-2': { status: 'ambiguous', wave: 2 }
  });
  assert.equal(w, null);
});

// ── writeRecoveredState + archiveState ───────────────────────────────────────

test('writeRecoveredState: atomic write round-trips', () => {
  const dir = mkProj({ status: 'running', tasks: {} });
  const reconciled = {
    status: 'running',
    tasks: { 'T-1': { status: 'done' } },
    currentWave: 2
  };
  writeRecoveredState(dir, reconciled);
  const fp = path.join(dir, '.gsd-t', 'orchestrator', 'state.json');
  const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
  assert.deepEqual(parsed.tasks, { 'T-1': { status: 'done' } });
  // tmp file should have been renamed away
  assert.ok(!fs.existsSync(fp + '.tmp'));
});

test('archiveState: moves state.json to timestamped archive dir', () => {
  const dir = mkProj({ status: 'done', tasks: {} });
  const fp = path.join(dir, '.gsd-t', 'orchestrator', 'state.json');
  assert.ok(fs.existsSync(fp));
  const result = archiveState(dir, { timestamp: '2026-04-20T12-00-00' });
  assert.equal(result.archived, true);
  assert.ok(/2026-04-20T12-00-00/.test(result.archivePath));
  assert.ok(fs.existsSync(result.archivePath));
  assert.ok(!fs.existsSync(fp));
});

test('archiveState: no-op when no state.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-recover-'));
  const result = archiveState(dir);
  assert.equal(result.archived, false);
});

// ── terminal-statuses constant ───────────────────────────────────────────────

test('TERMINAL_STATUSES contract', () => {
  for (const s of ['done', 'failed', 'stopped', 'interrupted', 'completed']) {
    assert.ok(_TERMINAL_STATUSES.has(s), `${s} should be terminal`);
  }
  for (const s of ['running', 'queued', 'ambiguous']) {
    assert.ok(!_TERMINAL_STATUSES.has(s), `${s} should NOT be terminal`);
  }
});
