'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runOrchestrator } = require('../bin/gsd-t-orchestrator.js');

function mkFixtureProject(options) {
  const { domains } = options || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-orch-int-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'domains'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), '# Progress\n');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fx' }));

  fs.writeFileSync(
    path.join(dir, '.gsd-t', 'contracts', 'completion-signal-contract.md'),
    '# Completion Signal Contract\n\n## Done Signal\n- commit\n- progress.md entry\n'
  );

  for (const d of domains) {
    const domDir = path.join(dir, '.gsd-t', 'domains', d.name);
    fs.mkdirSync(domDir, { recursive: true });
    fs.writeFileSync(path.join(domDir, 'scope.md'), `# Domain: ${d.name}\n\n## Owned Files\n- ${d.name}/*\n`);
    fs.writeFileSync(path.join(domDir, 'constraints.md'), `# Constraints: ${d.name}\n\n## Must Follow\n- none\n`);
    fs.writeFileSync(path.join(domDir, 'tasks.md'), d.tasksMd);
  }
  return dir;
}

function stubRunWorker(plan) {
  let idx = -1;
  return async ({ task, onSpawn }) => {
    idx++;
    const outcome = plan[idx] || { ok: true };
    if (typeof onSpawn === 'function') {
      onSpawn({ child: { kill() {} }, pid: 10000 + idx });
    }
    return {
      result: outcome.ok
        ? { ok: true, missing: [], details: {} }
        : { ok: false, missing: outcome.missing || ['worker_exit_nonzero'], details: {} },
      exitCode: outcome.ok ? 0 : (outcome.exitCode || 2),
      durationMs: 1,
      timedOut: !!outcome.timedOut,
      stderr: '',
      workerPid: 10000 + idx
    };
  };
}

test('integration: 3-wave run drives every wave to done, onFrame emits wave-boundary start+done for each wave', async () => {
  const dir = mkFixtureProject({
    domains: [{
      name: 'd-int',
      tasksMd: [
        '# Tasks: d-int',
        '',
        '### Task 1: W0-A',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        '',
        '### Task 2: W0-B',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        '',
        '### Task 3: W1-A',
        '- **Wave**: 1',
        '- **Dependencies**: NONE',
        '',
        '### Task 4: W1-B',
        '- **Wave**: 1',
        '- **Dependencies**: NONE',
        '',
        '### Task 5: W2-ONLY',
        '- **Wave**: 2',
        '- **Dependencies**: NONE',
        ''
      ].join('\n')
    }]
  });

  const frames = [];
  const res = await runOrchestrator({
    projectDir: dir,
    milestone: 'M-int-3',
    maxParallel: 2,
    workerTimeoutMs: 5000,
    runWorkerImpl: stubRunWorker([
      { ok: true }, { ok: true }, { ok: true }, { ok: true }, { ok: true }
    ]),
    onFrame: (f) => frames.push(f),
    installSignalHandlers: false
  });

  assert.equal(res.status, 'done');
  assert.equal(res.waves.length, 3);
  assert.equal(res.waves[0].done, 2);
  assert.equal(res.waves[1].done, 2);
  assert.equal(res.waves[2].done, 1);

  const waveBoundaries = frames.filter((f) => f.type === 'wave-boundary');
  const starts = waveBoundaries.filter((f) => f.state === 'start').map((f) => f.wave);
  const dones = waveBoundaries.filter((f) => f.state === 'done').map((f) => f.wave);
  assert.deepEqual(starts, [0, 1, 2], 'wave-boundary start emitted for each wave in order');
  assert.deepEqual(dones, [0, 1, 2], 'wave-boundary done emitted for each wave in order');
  for (const d of waveBoundaries.filter((f) => f.state === 'done')) {
    assert.ok(typeof d.durationMs === 'number' && d.durationMs >= 0, 'wave-boundary done has durationMs');
  }

  const state = JSON.parse(fs.readFileSync(path.join(dir, '.gsd-t', 'orchestrator', 'state.json'), 'utf8'));
  assert.equal(state.status, 'done');
  const pids = Object.values(state.tasks).map((t) => t.workerPid).filter((p) => p != null);
  assert.equal(pids.length, 5, 'state.json records workerPid for every task');
});

test('integration: second-failure in a wave halts the run and emits wave-boundary failed', async () => {
  const dir = mkFixtureProject({
    domains: [{
      name: 'd-fail',
      tasksMd: [
        '# Tasks: d-fail',
        '',
        '### Task 1: Will fail twice',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        '',
        '### Task 2: W1 — should never start',
        '- **Wave**: 1',
        '- **Dependencies**: NONE',
        ''
      ].join('\n')
    }]
  });

  const frames = [];
  const res = await runOrchestrator({
    projectDir: dir,
    milestone: 'M-int-fail',
    maxParallel: 1,
    workerTimeoutMs: 5000,
    runWorkerImpl: stubRunWorker([{ ok: false }, { ok: false }]),
    onFrame: (f) => frames.push(f),
    installSignalHandlers: false
  });

  assert.equal(res.status, 'failed');
  assert.equal(res.failedWave, 0);

  const wb = frames.filter((f) => f.type === 'wave-boundary');
  const failedBoundary = wb.find((f) => f.state === 'failed');
  assert.ok(failedBoundary, 'wave-boundary failed emitted');
  assert.equal(failedBoundary.wave, 0);
  assert.equal(failedBoundary.failed, 1);

  const w1Start = wb.find((f) => f.state === 'start' && f.wave === 1);
  assert.equal(w1Start, undefined, 'wave 1 must NOT have emitted start after wave 0 failed');
});

test('integration: SIGINT mid-wave terminates live workers, marks state=interrupted, exits with final status=interrupted', async () => {
  const dir = mkFixtureProject({
    domains: [{
      name: 'd-sig',
      tasksMd: [
        '# Tasks: d-sig',
        '',
        '### Task 1: Running when SIGINT fires',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        '',
        '### Task 2: Also running',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        ''
      ].join('\n')
    }]
  });

  const killedPids = [];
  let spawnedCount = 0;
  let resolveFirstSpawn;
  const firstSpawnSeen = new Promise((resolve) => { resolveFirstSpawn = resolve; });

  // Worker that hangs until its child.kill is called, then resolves as failed.
  const hangingRunWorker = ({ task, onSpawn }) => {
    return new Promise((resolve) => {
      const child = {
        kill: (sig) => {
          killedPids.push({ taskId: task.id, pid: child.pid, signal: sig });
          resolve({
            result: { ok: false, missing: ['worker_interrupted'], details: { signal: sig } },
            exitCode: -1,
            durationMs: 1,
            timedOut: false,
            stderr: '',
            workerPid: child.pid
          });
        }
      };
      child.pid = 20000 + spawnedCount++;
      if (typeof onSpawn === 'function') onSpawn({ child, pid: child.pid });
      if (spawnedCount === 2) resolveFirstSpawn();
    });
  };

  const run = runOrchestrator({
    projectDir: dir,
    milestone: 'M-int-sig',
    maxParallel: 2,
    workerTimeoutMs: 5000,
    runWorkerImpl: hangingRunWorker,
    installSignalHandlers: true
  });

  // Wait until both tasks have spawned, then fire SIGINT.
  await firstSpawnSeen;
  process.kill(process.pid, 'SIGINT');

  const res = await run;
  assert.equal(res.status, 'interrupted');
  assert.ok(killedPids.length >= 1, 'at least one worker received SIGTERM');
  for (const k of killedPids) assert.equal(k.signal, 'SIGTERM');

  const state = JSON.parse(fs.readFileSync(path.join(dir, '.gsd-t', 'orchestrator', 'state.json'), 'utf8'));
  assert.equal(state.status, 'interrupted');
  assert.ok(state.endedAt, 'interrupted run records endedAt');
});
