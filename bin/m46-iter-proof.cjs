#!/usr/bin/env node
'use strict';

/**
 * M46-D1 Iter-Parallel Proof Harness (T10)
 *
 * Measures the parallelism speedup of `_runIterParallel` vs. a serial
 * baseline using a synthetic 10-iter workload where each iter sleeps
 * 200ms and returns a successful IterResult.
 *
 * Method:
 *   1. Serial baseline (batchSize=1): run 10 iters one at a time via
 *      `_runIterParallel(..., batchSize=1)` in a loop. Expect ~2000ms.
 *   2. Parallel (batchSize=4): run 10 iters in batches of 4+4+2 via the
 *      same helper. Expect ~600ms (3 batches × 200ms).
 *   3. Compute speedup = T_serial / T_par,
 *      parallelism_factor = (10 × 200) / T_par.
 *   4. Pass iff T_par/T_serial ≤ 0.35 AND speedup ≥ 3.0.
 *
 * Output: .gsd-t/metrics/m46-iter-proof.json + human summary on stdout.
 * Exit: 0 on pass, 1 on fail.
 */

const fs = require('fs');
const path = require('path');

const ITER_COUNT = 10;
const ITER_SLEEP_MS = 200;
const BATCH_SERIAL = 1;
const BATCH_PARALLEL = 4;
const THRESHOLD_RATIO = 0.35;
const THRESHOLD_SPEEDUP = 3.0;

const { _runIterParallel } = require(path.join(__dirname, 'gsd-t-unattended.cjs')).__test__;

// ── synthetic iterFn ───────────────────────────────────────────────────────

let iterSeq = 0;
function makeIterFn(sleepMs) {
  return async function fakeIter(_state, _opts) {
    const id = iterSeq++;
    await new Promise((r) => setTimeout(r, sleepMs));
    return {
      status: 'ok',
      tasksDone: ['t' + id],
      verifyNeeded: false,
      artifacts: [],
    };
  };
}

// ── runners ────────────────────────────────────────────────────────────────

async function runSerial(total, sleepMs) {
  const iterFn = makeIterFn(sleepMs);
  const state = {};
  const opts = {};
  const t0 = process.hrtime.bigint();
  const results = [];
  for (let i = 0; i < total; i++) {
    const batch = await _runIterParallel(state, opts, iterFn, BATCH_SERIAL);
    results.push(...batch);
  }
  const t1 = process.hrtime.bigint();
  return {
    wallClockMs: Number(t1 - t0) / 1e6,
    results,
  };
}

async function runParallel(total, batchSize, sleepMs) {
  const iterFn = makeIterFn(sleepMs);
  const state = {};
  const opts = {};
  const t0 = process.hrtime.bigint();
  const results = [];
  let remaining = total;
  while (remaining > 0) {
    const n = Math.min(batchSize, remaining);
    const batch = await _runIterParallel(state, opts, iterFn, n);
    results.push(...batch);
    remaining -= n;
  }
  const t1 = process.hrtime.bigint();
  return {
    wallClockMs: Number(t1 - t0) / 1e6,
    results,
  };
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  process.stdout.write(
    `M46-D1 Iter-Parallel Proof (N=${ITER_COUNT} iters, sleep=${ITER_SLEEP_MS}ms each)\n`,
  );
  process.stdout.write('─'.repeat(60) + '\n');

  iterSeq = 0;
  const serial = await runSerial(ITER_COUNT, ITER_SLEEP_MS);
  process.stdout.write(`Serial baseline (batchSize=${BATCH_SERIAL}, ${ITER_COUNT} iters sequentially)\n`);
  process.stdout.write(`  T_serial (wall-clock): ${serial.wallClockMs.toFixed(1)} ms\n`);
  process.stdout.write(`  results:               ${serial.results.length} (ok=${serial.results.filter((r) => r.status === 'ok').length})\n\n`);

  iterSeq = 0;
  const parallel = await runParallel(ITER_COUNT, BATCH_PARALLEL, ITER_SLEEP_MS);
  process.stdout.write(`Parallel (batchSize=${BATCH_PARALLEL}, batches of 4+4+2)\n`);
  process.stdout.write(`  T_par (wall-clock):    ${parallel.wallClockMs.toFixed(1)} ms\n`);
  process.stdout.write(`  results:               ${parallel.results.length} (ok=${parallel.results.filter((r) => r.status === 'ok').length})\n\n`);

  const ratio = parallel.wallClockMs / serial.wallClockMs;
  const speedup = serial.wallClockMs / parallel.wallClockMs;
  const parallelismFactor = (ITER_COUNT * ITER_SLEEP_MS) / parallel.wallClockMs;
  const passed = ratio <= THRESHOLD_RATIO && speedup >= THRESHOLD_SPEEDUP;

  process.stdout.write('─'.repeat(60) + '\n');
  process.stdout.write('Result\n');
  process.stdout.write(`  T_par / T_serial     = ${ratio.toFixed(3)} (threshold ≤ ${THRESHOLD_RATIO})\n`);
  process.stdout.write(`  speedup              = ${speedup.toFixed(2)}× (threshold ≥ ${THRESHOLD_SPEEDUP})\n`);
  process.stdout.write(`  parallelism_factor   = ${parallelismFactor.toFixed(2)} (ideal ≈ ${BATCH_PARALLEL})\n`);
  process.stdout.write(`  verdict              = ${passed ? 'PASS ✓' : 'FAIL ✗'}\n`);

  const report = {
    timestamp: new Date().toISOString(),
    iter_count: ITER_COUNT,
    iter_sleep_ms: ITER_SLEEP_MS,
    batch_size_serial: BATCH_SERIAL,
    batch_size_parallel: BATCH_PARALLEL,
    T_serial_ms: serial.wallClockMs,
    T_par_ms: parallel.wallClockMs,
    speedup,
    parallelism_factor: parallelismFactor,
    threshold_T_par_over_T_serial: THRESHOLD_RATIO,
    threshold_speedup: THRESHOLD_SPEEDUP,
    passed,
  };
  const reportDir = path.join(process.cwd(), '.gsd-t', 'metrics');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'm46-iter-proof.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(`\nReport written: ${reportPath}\n`);

  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${(e && e.stack) || e}\n`);
  process.exit(2);
});
