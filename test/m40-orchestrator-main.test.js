'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runOrchestrator, parseCliArgs } = require('../bin/gsd-t-orchestrator.js');

function mkFixtureProject(options) {
  const { domains } = options || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-orch-main-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'domains'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), '# Progress\n');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fx' }));

  fs.writeFileSync(
    path.join(dir, '.gsd-t', 'contracts', 'completion-signal-contract.md'),
    '# Completion Signal Contract\n\n## Done Signal (all must hold)\n- commit\n- progress.md entry\n'
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
  return async ({ task }) => {
    idx++;
    const outcome = plan[idx] || { ok: true };
    return {
      result: outcome.ok
        ? { ok: true, missing: [], details: {} }
        : { ok: false, missing: outcome.missing || ['worker_exit_nonzero'], details: {} },
      exitCode: outcome.ok ? 0 : (outcome.exitCode || 2),
      durationMs: 1,
      timedOut: !!outcome.timedOut,
      stderr: ''
    };
  };
}

function recordingRunWorker(plan, sink) {
  let idx = -1;
  return async ({ task, brief }) => {
    idx++;
    sink.push({ when: Date.now(), taskId: task.id, brief });
    const outcome = plan[idx] || { ok: true };
    return {
      result: outcome.ok
        ? { ok: true, missing: [], details: {} }
        : { ok: false, missing: ['worker_exit_nonzero'], details: {} },
      exitCode: outcome.ok ? 0 : 2,
      durationMs: 1,
      timedOut: false,
      stderr: ''
    };
  };
}

test('parseCliArgs: extracts milestone + flags', () => {
  const args = parseCliArgs(['--milestone', 'M40', '--max-parallel', '5', '--worker-timeout', '60000']);
  assert.equal(args.milestone, 'M40');
  assert.equal(args.maxParallel, '5');
  assert.equal(args.workerTimeoutMs, '60000');
  assert.equal(args.help, false);
});

test('parseCliArgs: --help flag', () => {
  const args = parseCliArgs(['--help']);
  assert.equal(args.help, true);
});

test('runOrchestrator: empty project returns status=empty', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-orch-empty-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'domains'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), '# p\n');
  const logs = [];
  const res = await runOrchestrator({
    projectDir: dir,
    milestone: 'M-test',
    logger: { log: (m) => logs.push(m) }
  });
  assert.equal(res.status, 'empty');
});

test('runOrchestrator: single wave drives all tasks to done, exits status=done', async () => {
  const dir = mkFixtureProject({
    domains: [{
      name: 'd-alpha',
      tasksMd: [
        '# Tasks: d-alpha',
        '',
        '### Task 1: First',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        '',
        '### Task 2: Second',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        ''
      ].join('\n')
    }]
  });

  const res = await runOrchestrator({
    projectDir: dir,
    milestone: 'M-test',
    maxParallel: 2,
    workerTimeoutMs: 5000,
    runWorkerImpl: stubRunWorker([{ ok: true }, { ok: true }])
  });

  assert.equal(res.status, 'done');
  assert.equal(res.waves.length, 1);
  assert.equal(res.waves[0].total, 2);

  const state = JSON.parse(fs.readFileSync(path.join(dir, '.gsd-t', 'orchestrator', 'state.json'), 'utf8'));
  assert.equal(state.status, 'done');
});

test('runOrchestrator: strict wave barrier — wave 1 does not start until wave 0 complete', async () => {
  const dir = mkFixtureProject({
    domains: [{
      name: 'd-beta',
      tasksMd: [
        '# Tasks: d-beta',
        '',
        '### Task 1: W0-A',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        '',
        '### Task 2: W0-B',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        '',
        '### Task 3: W1',
        '- **Wave**: 1',
        '- **Dependencies**: NONE',
        ''
      ].join('\n')
    }]
  });

  const startOrder = [];
  const runWorkerImpl = recordingRunWorker(
    [{ ok: true }, { ok: true }, { ok: true }],
    startOrder
  );

  const res = await runOrchestrator({
    projectDir: dir,
    milestone: 'M-test',
    maxParallel: 3,
    workerTimeoutMs: 5000,
    runWorkerImpl
  });

  assert.equal(res.status, 'done');
  assert.equal(startOrder.length, 3);
  const w0 = startOrder.filter(o => o.taskId === 'd-beta:T1' || o.taskId === 'd-beta:T2');
  const w1 = startOrder.filter(o => o.taskId === 'd-beta:T3');
  assert.equal(w0.length, 2);
  assert.equal(w1.length, 1);
  const w0Max = Math.max(...w0.map(o => o.when));
  assert.ok(w1[0].when >= w0Max, 'wave 1 task must start after all wave 0 tasks dispatched');
});

test('runOrchestrator: double-fail in wave halts and returns failed', async () => {
  const dir = mkFixtureProject({
    domains: [{
      name: 'd-gamma',
      tasksMd: [
        '# Tasks: d-gamma',
        '',
        '### Task 1: Fails',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        ''
      ].join('\n')
    }]
  });

  const logs = [];
  const res = await runOrchestrator({
    projectDir: dir,
    milestone: 'M-test',
    maxParallel: 1,
    workerTimeoutMs: 5000,
    logger: { log: (m) => logs.push(m) },
    runWorkerImpl: stubRunWorker([{ ok: false }, { ok: false }])
  });

  assert.equal(res.status, 'failed');
  assert.equal(res.failedWave, 0);
  assert.ok(logs.some((m) => /wave_halt/.test(m)));

  const state = JSON.parse(fs.readFileSync(path.join(dir, '.gsd-t', 'orchestrator', 'state.json'), 'utf8'));
  assert.equal(state.status, 'failed');
});

test('runOrchestrator: writes events to .gsd-t/events/YYYY-MM-DD.jsonl', async () => {
  const dir = mkFixtureProject({
    domains: [{
      name: 'd-delta',
      tasksMd: [
        '# Tasks: d-delta',
        '',
        '### Task 1: Only',
        '- **Wave**: 0',
        '- **Dependencies**: NONE',
        ''
      ].join('\n')
    }]
  });

  await runOrchestrator({
    projectDir: dir,
    milestone: 'M-test',
    maxParallel: 1,
    workerTimeoutMs: 5000,
    runWorkerImpl: stubRunWorker([{ ok: true }])
  });

  const today = new Date().toISOString().slice(0, 10);
  const evFp = path.join(dir, '.gsd-t', 'events', today + '.jsonl');
  assert.ok(fs.existsSync(evFp), 'events file should be written');
  const events = fs.readFileSync(evFp, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const types = events.map((e) => e.event_type);
  assert.ok(types.includes('orchestrator_start'));
  assert.ok(types.includes('wave_start'));
  assert.ok(types.includes('task_start'));
  assert.ok(types.includes('orchestrator_done'));
});
