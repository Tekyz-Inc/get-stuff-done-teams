#!/usr/bin/env node
'use strict';

/**
 * M55-D2 Parallel-CLI Substrate Proof Harness (T5/T6)
 *
 * Charter SC2: ≥3× wall-clock speedup vs. serial baseline.
 *
 * Method:
 *   1. Construct N synthetic CLI workers (default N=6), each `node -e
 *      'setTimeout(_ => process.exit(0), 250)'` — deterministic 250 ms work
 *      with no real I/O. Mirrors `bin/m46-iter-proof.cjs` shape.
 *   2. Sequential baseline: spawn each worker via `runParallel({maxConcurrency:1})`
 *      so the captureSpawn / tee path runs identically — only concurrency
 *      differs from the parallel run.
 *   3. Parallel run: `runParallel({maxConcurrency:N})`. Same N workers.
 *   4. Compute speedup = T_serial / T_par. Pass iff speedup ≥ 3.0.
 *
 * Output: stdout summary + appends to .gsd-t/metrics/m55-substrate-proof.txt.
 * Exit: 0 on pass, 1 on fail.
 */

const fs = require('fs');
const path = require('path');

const { runParallel } = require(path.join(__dirname, 'parallel-cli.cjs'));

const N_WORKERS = parseInt(process.env.M55_PROOF_N || '6', 10);
const SLEEP_MS = parseInt(process.env.M55_PROOF_SLEEP_MS || '250', 10);
const THRESHOLD_SPEEDUP = parseFloat(process.env.M55_PROOF_THRESHOLD || '3.0');

function makeWorkers(n, sleepMs) {
  const workers = [];
  for (let i = 0; i < n; i++) {
    workers.push({
      id: 'w' + String(i).padStart(2, '0'),
      cmd: process.execPath,
      args: ['-e', `setTimeout(() => process.exit(0), ${sleepMs})`],
    });
  }
  return workers;
}

async function runSerial(n, sleepMs) {
  const t0 = process.hrtime.bigint();
  const r = await runParallel({
    workers: makeWorkers(n, sleepMs),
    maxConcurrency: 1,
    command: 'm55-substrate-proof',
    step: 'serial',
  });
  const t1 = process.hrtime.bigint();
  return { wallClockMs: Number(t1 - t0) / 1e6, envelope: r };
}

async function runParallelN(n, sleepMs) {
  const t0 = process.hrtime.bigint();
  const r = await runParallel({
    workers: makeWorkers(n, sleepMs),
    maxConcurrency: n,
    command: 'm55-substrate-proof',
    step: 'parallel',
  });
  const t1 = process.hrtime.bigint();
  return { wallClockMs: Number(t1 - t0) / 1e6, envelope: r };
}

async function main() {
  process.stdout.write(
    `M55-D2 Parallel-CLI Substrate Proof (N=${N_WORKERS} workers, sleep=${SLEEP_MS}ms each)\n`,
  );
  process.stdout.write('─'.repeat(60) + '\n');

  process.stdout.write('Sequential baseline (maxConcurrency=1)…\n');
  const serial = await runSerial(N_WORKERS, SLEEP_MS);
  const serialOk = serial.envelope.results.filter((r) => r.ok).length;
  process.stdout.write(`  T_serial = ${serial.wallClockMs.toFixed(1)} ms (${serialOk}/${N_WORKERS} ok)\n\n`);

  process.stdout.write(`Parallel (maxConcurrency=${N_WORKERS})…\n`);
  const parallel = await runParallelN(N_WORKERS, SLEEP_MS);
  const parallelOk = parallel.envelope.results.filter((r) => r.ok).length;
  process.stdout.write(`  T_par    = ${parallel.wallClockMs.toFixed(1)} ms (${parallelOk}/${N_WORKERS} ok)\n\n`);

  const speedup = serial.wallClockMs / parallel.wallClockMs;
  const ratio = parallel.wallClockMs / serial.wallClockMs;
  const parallelismFactor = (N_WORKERS * SLEEP_MS) / parallel.wallClockMs;
  const passed = speedup >= THRESHOLD_SPEEDUP;

  process.stdout.write('─'.repeat(60) + '\n');
  process.stdout.write('Result\n');
  process.stdout.write(`  speedup            = ${speedup.toFixed(2)}× (threshold ≥ ${THRESHOLD_SPEEDUP})\n`);
  process.stdout.write(`  T_par / T_serial   = ${ratio.toFixed(3)}\n`);
  process.stdout.write(`  parallelism_factor = ${parallelismFactor.toFixed(2)} (ideal ≈ ${N_WORKERS})\n`);
  process.stdout.write(`  verdict            = ${passed ? 'PASS ✓' : 'FAIL ✗'}\n`);

  // Append result line to metrics file (charter SC2).
  const metricsDir = path.join(process.cwd(), '.gsd-t', 'metrics');
  fs.mkdirSync(metricsDir, { recursive: true });
  const metricsPath = path.join(metricsDir, 'm55-substrate-proof.txt');
  const summaryLine = [
    new Date().toISOString(),
    `N=${N_WORKERS}`,
    `sleepMs=${SLEEP_MS}`,
    `T_serial=${serial.wallClockMs.toFixed(1)}ms`,
    `T_par=${parallel.wallClockMs.toFixed(1)}ms`,
    `speedup=${speedup.toFixed(2)}x`,
    `verdict=${passed ? 'PASS' : 'FAIL'}`,
  ].join(' | ') + '\n';
  fs.appendFileSync(metricsPath, summaryLine);
  process.stdout.write(`\nAppended: ${metricsPath}\n`);

  // Also dump a structured JSON sibling for downstream consumers.
  const reportPath = path.join(metricsDir, 'm55-substrate-proof.json');
  const report = {
    timestamp: new Date().toISOString(),
    n_workers: N_WORKERS,
    sleep_ms: SLEEP_MS,
    T_serial_ms: serial.wallClockMs,
    T_par_ms: parallel.wallClockMs,
    speedup,
    parallelism_factor: parallelismFactor,
    threshold_speedup: THRESHOLD_SPEEDUP,
    passed,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(`Wrote:    ${reportPath}\n`);

  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${(e && e.stack) || e}\n`);
  process.exit(2);
});
