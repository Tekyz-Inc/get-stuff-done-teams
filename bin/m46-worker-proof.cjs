#!/usr/bin/env node
'use strict';

/**
 * M46-D2 Worker Sub-Dispatch Proof Harness (T7)
 *
 * Measures the parallelism speedup of `dispatchWorkerTasks` vs. a serial
 * baseline using a synthetic 6-task file-disjoint workload.
 *
 * Method:
 *   1. Serial baseline: run 6 `sleep 2 && echo done > …` tasks one by one
 *      via `child_process.execSync`. Record `T_serial` (wall-clock ms).
 *   2. Parallel via `dispatchWorkerTasks`: stub the dispatcher's
 *      `runDispatch` boundary (via a mocked `gsd-t-parallel.cjs` in
 *      require.cache) to execute tasks concurrently with
 *      `child_process.exec` + `Promise.all`. This measures the dispatch
 *      SCHEDULER's fan-out behaviour, not real headless claude-p spawns.
 *   3. Compute speedup and parallelism_factor. Pass iff speedup ≥ 2.5.
 *
 * Output: .gsd-t/metrics/m46-worker-proof.json + human summary on stdout.
 * Exit: 0 on pass, 1 on fail.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execSync } = require('child_process');

const THRESHOLD = 2.5;
const TASK_COUNT = 6;
const PID = process.pid;
const TMP_DIR = path.join(os.tmpdir(), `m46-proof-${PID}`);

function ensureTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function cleanupTmpDir() {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

function buildTasks() {
  const tasks = [];
  for (let i = 0; i < TASK_COUNT; i++) {
    const outPath = path.join(TMP_DIR, `task-${i}.out`);
    tasks.push({
      taskId: `T-${i}`,
      files: [outPath],
      command: `sleep 2 && echo done > ${outPath}`,
    });
  }
  return tasks;
}

// ── serial baseline ────────────────────────────────────────────────────────

function runSerial(tasks) {
  const perTaskMs = [];
  const t0 = process.hrtime.bigint();
  for (const task of tasks) {
    const ts = process.hrtime.bigint();
    execSync(task.command, { stdio: 'ignore' });
    const te = process.hrtime.bigint();
    perTaskMs.push(Number(te - ts) / 1e6);
  }
  const t1 = process.hrtime.bigint();
  return {
    wallClockMs: Number(t1 - t0) / 1e6,
    perTaskMs,
    meanTaskMs: perTaskMs.reduce((a, b) => a + b, 0) / perTaskMs.length,
  };
}

// ── parallel via stubbed runDispatch ──────────────────────────────────────

function installParallelStub() {
  // Pre-populate require.cache for bin/gsd-t-parallel.cjs with a stub whose
  // `runDispatch` executes the task `command` field concurrently via exec +
  // Promise.all. This isolates measurement to the dispatcher scheduler and
  // avoids invoking real claude-p children.
  const parallelPath = require.resolve(path.join(__dirname, 'gsd-t-parallel.cjs'));
  const stubModule = {
    exports: {
      runDispatch: async ({ tasks }) => {
        const workerResults = await Promise.all(tasks.map((task) => new Promise((resolve) => {
          const started = Date.now();
          exec(task.command, (err) => {
            resolve({
              taskId: task.taskId,
              exitCode: err ? (err.code || 1) : 0,
              durationMs: Date.now() - started,
            });
          });
        })));
        return {
          decision: 'fan-out',
          fanOutCount: tasks.length,
          workerResults,
        };
      },
    },
    loaded: true,
    id: parallelPath,
    filename: parallelPath,
    paths: [],
    children: [],
  };
  require.cache[parallelPath] = stubModule;
}

async function runParallel(tasks) {
  installParallelStub();
  // Fresh require after stub install, in case worker-dispatch was pre-loaded.
  const dispatchPath = require.resolve(path.join(__dirname, 'gsd-t-worker-dispatch.cjs'));
  delete require.cache[dispatchPath];
  const { dispatchWorkerTasks } = require(dispatchPath);

  const t0 = process.hrtime.bigint();
  const result = await dispatchWorkerTasks({
    projectDir: TMP_DIR,
    parentSessionId: `m46-proof-${PID}`,
    tasks,
    maxParallel: TASK_COUNT,
  });
  const t1 = process.hrtime.bigint();

  return {
    wallClockMs: Number(t1 - t0) / 1e6,
    parallel: result.parallel,
    reason: result.reason,
    taskResults: result.taskResults,
  };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  ensureTmpDir();
  process.stdout.write(`M46-D2 Worker Sub-Dispatch Proof (N=${TASK_COUNT} tasks, tmp=${TMP_DIR})\n`);
  process.stdout.write('─'.repeat(60) + '\n');

  const tasks = buildTasks();

  const serial = runSerial(tasks);
  process.stdout.write('Serial baseline (execSync, tasks run back-to-back)\n');
  process.stdout.write(`  T_serial (wall-clock): ${serial.wallClockMs.toFixed(1)} ms\n`);
  process.stdout.write(`  per-task durations:    [${serial.perTaskMs.map((x) => x.toFixed(0)).join(', ')}] ms\n`);
  process.stdout.write(`  mean(task duration):   ${serial.meanTaskMs.toFixed(1)} ms\n\n`);

  // Reset task output files before parallel run so exec doesn't race on
  // leftovers (each task writes its own file so this is just hygiene).
  for (let i = 0; i < TASK_COUNT; i++) {
    const p = path.join(TMP_DIR, `task-${i}.out`);
    try { fs.unlinkSync(p); } catch (_) { /* ignore */ }
  }

  const parallel = await runParallel(tasks);
  process.stdout.write(`Parallel via dispatchWorkerTasks (runDispatch stub, concurrent exec)\n`);
  process.stdout.write(`  T_par (wall-clock):    ${parallel.wallClockMs.toFixed(1)} ms\n`);
  process.stdout.write(`  parallel dispatched:   ${parallel.parallel} (reason=${parallel.reason})\n`);
  process.stdout.write(`  per-task results:      ${parallel.taskResults.length} tasks\n\n`);

  const speedup = serial.wallClockMs / parallel.wallClockMs;
  const parallelismFactor = (TASK_COUNT * serial.meanTaskMs) / parallel.wallClockMs;
  const passed = speedup >= THRESHOLD;

  process.stdout.write('─'.repeat(60) + '\n');
  process.stdout.write('Result\n');
  process.stdout.write(`  speedup              = ${speedup.toFixed(2)}× (threshold ≥ ${THRESHOLD})\n`);
  process.stdout.write(`  parallelism_factor   = ${parallelismFactor.toFixed(2)} (ideal = ${TASK_COUNT})\n`);
  process.stdout.write(`  verdict              = ${passed ? 'PASS ✓' : 'FAIL ✗'}\n`);

  const report = {
    timestamp: new Date().toISOString(),
    task_count: TASK_COUNT,
    T_serial_ms: serial.wallClockMs,
    T_par_ms: parallel.wallClockMs,
    speedup,
    parallelism_factor: parallelismFactor,
    threshold: THRESHOLD,
    passed,
  };
  const reportDir = path.join(process.cwd(), '.gsd-t', 'metrics');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'm46-worker-proof.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(`\nReport written: ${reportPath}\n`);

  cleanupTmpDir();
  process.exit(passed ? 0 : 1);
}

process.on('exit', cleanupTmpDir);
process.on('SIGINT', () => { cleanupTmpDir(); process.exit(130); });
process.on('SIGTERM', () => { cleanupTmpDir(); process.exit(143); });

main().catch((e) => {
  process.stderr.write(`ERROR: ${(e && e.stack) || e}\n`);
  cleanupTmpDir();
  process.exit(2);
});
