#!/usr/bin/env node
'use strict';

/**
 * M44 Proof Measurement Driver (backlog #15 — T/2 criterion)
 *
 * Goal: prove v3.19.00's parallel dispatcher actually fans out concurrently.
 *
 * Method:
 *   1. Build a temp project with a 4-task file-disjoint tasks.md fixture.
 *   2. Inject a synthetic spawner into bin/gsd-t-parallel.cjs::runDispatch
 *      that launches test/fixtures/m44-proof/worker-sim.js as a detached
 *      child (same contract as the real autoSpawnHeadless).
 *   3. Measure:
 *        T_seq = sum of per-worker durations when called sequentially.
 *        T_par = wall-clock span from first spawn_started to last .done
 *                marker when dispatched via runDispatch.
 *   4. Criterion: T_par ≤ T_seq / 2   ( = parallelism_factor ≥ 2 for N=4 )
 *
 * This proves the DISPATCHER. It does NOT prove that 4 Claude workers
 * produce correct code in T/2. That is a separate, API-budget-intensive
 * experiment (backlog #15 follow-up). The dispatcher is the shipped code
 * in v3.19.00, and its mechanics are what the tag certifies.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { runDispatch } = require(path.join(__dirname, 'gsd-t-parallel.cjs'));
const { writeSpawnPlan } = require(path.join(__dirname, 'spawn-plan-writer.cjs'));
const { markTaskDone, markSpawnEnded } = require(path.join(__dirname, 'spawn-plan-status-updater.cjs'));

// When invoked with --visualize, write spawn-plan files into the REAL project
// directory (not the temp fixture dir) so the live dashboard at :7455 can
// render the fan-out in real time. Off by default to keep the measurement
// directory clean.
const VISUALIZE = process.argv.includes('--visualize');
const REAL_PROJECT_DIR = path.resolve(__dirname, '..');

// ── fixture setup ───────────────────────────────────────────────────────────

function buildFixtureProject(workDurationMs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm44-proof-'));
  fs.mkdirSync(path.join(root, '.gsd-t', 'domains', 'm99-d1-proof'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gsd-t', 'spawns'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gsd-t', 'events'), { recursive: true });

  const tasksMd = fs.readFileSync(
    path.join(__dirname, '..', 'test', 'fixtures', 'm44-proof', 'fixture.tasks.md'),
    'utf8',
  );
  fs.writeFileSync(path.join(root, '.gsd-t', 'domains', 'm99-d1-proof', 'tasks.md'), tasksMd);

  const partitionMd = [
    '# Partition — M99',
    '',
    '## Wave 1',
    '- m99-d1-proof (all tasks disjoint, no deps)',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, '.gsd-t', 'partition.md'), partitionMd);

  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

// ── spawner (injected into runDispatch) ────────────────────────────────────

function makeSpawner({ outDir, workerDurationMs }) {
  const launched = [];
  const spawner = ({ env }) => {
    const childEnv = Object.assign({}, process.env, env, {
      OUT_DIR: outDir,
      WORKER_DURATION_MS: String(workerDurationMs),
    });
    const workerPath = path.join(__dirname, '..', 'test', 'fixtures', 'm44-proof', 'worker-sim.js');
    const child = spawn(process.execPath, [workerPath], {
      env: childEnv, detached: true, stdio: 'ignore',
    });
    child.unref();
    const spawnId = 'm44-proof-' + env.GSD_T_WORKER_INDEX + '-' + Date.now();
    const taskIds = env.GSD_T_WORKER_TASK_IDS.split(',');

    if (VISUALIZE) {
      try {
        writeSpawnPlan({
          spawnId,
          kind: 'headless-detached',
          milestone: 'M99',
          wave: 'wave-1',
          domains: ['m99-d1-proof'],
          tasks: taskIds.map((id) => ({ id, title: 'Proof ' + id, status: 'in_flight' })),
          projectDir: REAL_PROJECT_DIR,
        });
      } catch (e) { process.stderr.write('[visualize] writeSpawnPlan failed: ' + e.message + '\n'); }
    }

    launched.push({
      spawnId, pid: child.pid,
      taskIds,
      launchedAt: process.hrtime.bigint(),
    });
    return { id: spawnId, pid: child.pid, logPath: null };
  };
  return { spawner, launched };
}

function markLaunchedDone(launched) {
  if (!VISUALIZE) return;
  for (const l of launched) {
    try {
      for (const id of l.taskIds) {
        markTaskDone({ spawnId: l.spawnId, taskId: id, projectDir: REAL_PROJECT_DIR, commit: 'proof-sim', tokens: null });
      }
      markSpawnEnded({ spawnId: l.spawnId, projectDir: REAL_PROJECT_DIR });
    } catch (e) { process.stderr.write('[visualize] mark-done failed: ' + e.message + '\n'); }
  }
}

// ── wait for all .done markers ─────────────────────────────────────────────

async function waitForMarkers(outDir, expectedCount, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let present;
    try { present = fs.readdirSync(outDir).filter((n) => n.endsWith('.done')); }
    catch { present = []; }
    if (present.length >= expectedCount) return present;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timeout waiting for ' + expectedCount + ' .done markers in ' + outDir);
}

function readMarkers(outDir) {
  return fs.readdirSync(outDir)
    .filter((n) => n.endsWith('.done'))
    .map((n) => JSON.parse(fs.readFileSync(path.join(outDir, n), 'utf8')))
    .sort((a, b) => a.workerIndex - b.workerIndex);
}

// ── runs ────────────────────────────────────────────────────────────────────

async function runParallelPass(workerDurationMs) {
  const projectDir = buildFixtureProject(workerDurationMs);
  const outDir = path.join(projectDir, 'worker-out');
  fs.mkdirSync(outDir, { recursive: true });

  const { spawner, launched } = makeSpawner({ outDir, workerDurationMs });

  const t0 = process.hrtime.bigint();
  const result = runDispatch({
    projectDir,
    command: 'gsd-t-execute',
    mode: 'unattended',
    env: { GSD_T_UNATTENDED: '1' },
    spawnHeadlessImpl: spawner,
  });
  const dispatchReturnedAt = process.hrtime.bigint();

  if (result.fanOutCount < 2) {
    cleanup(projectDir);
    throw new Error('parallel dispatch did not fan out (decision=' + result.decision + ', fanOutCount=' + result.fanOutCount + ')');
  }

  await waitForMarkers(outDir, result.fanOutCount);
  const t1 = process.hrtime.bigint();

  markLaunchedDone(launched);

  const markers = readMarkers(outDir);
  const wallClockMs = Number(t1 - t0) / 1e6;
  const dispatchOverheadMs = Number(dispatchReturnedAt - t0) / 1e6;
  const perWorkerDurationMs = markers.map((m) => m.durationMs);
  const sumWorkerDurationMs = perWorkerDurationMs.reduce((a, b) => a + b, 0);

  cleanup(projectDir);
  return {
    mode: 'parallel',
    fanOutCount: result.fanOutCount,
    launched: launched.length,
    wallClockMs,
    dispatchOverheadMs,
    perWorkerDurationMs,
    sumWorkerDurationMs,
    workerPids: markers.map((m) => m.pid),
    markers,
  };
}

async function runSequentialPass(workerDurationMs, taskCount = 4) {
  // Sequential baseline: run N workers back-to-back, same worker-sim.js.
  // This is what a single-worker supervisor would do before v3.19.00.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm44-proof-seq-'));
  const outDir = path.join(tmp, 'worker-out');
  fs.mkdirSync(outDir, { recursive: true });

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < taskCount; i++) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        path.join(__dirname, '..', 'test', 'fixtures', 'm44-proof', 'worker-sim.js'),
      ], {
        env: Object.assign({}, process.env, {
          OUT_DIR: outDir,
          WORKER_DURATION_MS: String(workerDurationMs),
          GSD_T_WORKER_INDEX: String(i),
          GSD_T_WORKER_TOTAL: String(taskCount),
          GSD_T_WORKER_TASK_IDS: 'M99-D1-T' + (i + 1),
        }),
        stdio: 'ignore',
      });
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('worker exit ' + code)));
      child.on('error', reject);
    });
  }
  const t1 = process.hrtime.bigint();
  const markers = readMarkers(outDir);
  const wallClockMs = Number(t1 - t0) / 1e6;
  cleanup(tmp);

  return {
    mode: 'sequential',
    taskCount,
    wallClockMs,
    perWorkerDurationMs: markers.map((m) => m.durationMs),
    sumWorkerDurationMs: markers.map((m) => m.durationMs).reduce((a, b) => a + b, 0),
  };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const workerDurationMs = parseInt(process.env.WORKER_DURATION_MS || '8000', 10);
  process.stdout.write('M44 Proof Measurement (worker duration=' + workerDurationMs + 'ms)\n');
  process.stdout.write('─'.repeat(60) + '\n');

  const seq = await runSequentialPass(workerDurationMs);
  process.stdout.write('Sequential (N=4 workers run back-to-back)\n');
  process.stdout.write('  T_seq (wall-clock):   ' + seq.wallClockMs.toFixed(1) + ' ms\n');
  process.stdout.write('  sum(worker durations): ' + seq.sumWorkerDurationMs.toFixed(1) + ' ms\n');
  process.stdout.write('\n');

  const par = await runParallelPass(workerDurationMs);
  process.stdout.write('Parallel (runDispatch, N=' + par.fanOutCount + ' concurrent workers)\n');
  process.stdout.write('  T_par (wall-clock):   ' + par.wallClockMs.toFixed(1) + ' ms\n');
  process.stdout.write('  dispatch overhead:     ' + par.dispatchOverheadMs.toFixed(1) + ' ms\n');
  process.stdout.write('  sum(worker durations): ' + par.sumWorkerDurationMs.toFixed(1) + ' ms\n');
  process.stdout.write('  per-worker durations:  [' + par.perWorkerDurationMs.map((x) => x.toFixed(0)).join(', ') + '] ms\n');
  process.stdout.write('  worker pids:           [' + par.workerPids.join(', ') + ']\n');
  process.stdout.write('\n');

  const ratio = par.wallClockMs / seq.wallClockMs;
  const speedup = seq.wallClockMs / par.wallClockMs;
  const parallelismFactor = par.sumWorkerDurationMs / par.wallClockMs;
  const criterion = par.wallClockMs <= seq.wallClockMs / 2;

  process.stdout.write('─'.repeat(60) + '\n');
  process.stdout.write('Result\n');
  process.stdout.write('  T_par / T_seq        = ' + ratio.toFixed(3) + '\n');
  process.stdout.write('  speedup              = ' + speedup.toFixed(2) + '×\n');
  process.stdout.write('  parallelism_factor   = ' + parallelismFactor.toFixed(2) + '  (ideal = ' + par.fanOutCount + ')\n');
  process.stdout.write('  T/2 criterion        = ' + (criterion ? 'MET ✓' : 'NOT MET ✗') + '  (T_par ≤ T_seq/2)\n');

  const report = {
    generatedAt: new Date().toISOString(),
    workerDurationMs,
    sequential: seq,
    parallel: par,
    ratio, speedup, parallelismFactor,
    criterionMet: criterion,
  };
  const reportPath = path.join(process.cwd(), '.gsd-t', 'm44-proof-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write('\nReport written: ' + reportPath + '\n');

  process.exit(criterion ? 0 : 1);
}

main().catch((e) => { process.stderr.write('ERROR: ' + (e && e.stack || e) + '\n'); process.exit(2); });
