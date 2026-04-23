#!/usr/bin/env node
'use strict';

/**
 * M44 Proof — synthetic worker
 *
 * Simulates a real worker's shape without consuming LLM budget:
 *   - sleeps WORKER_DURATION_MS (default 8000) to mimic work
 *   - reads GSD_T_WORKER_TASK_IDS, GSD_T_WORKER_INDEX from env
 *     (exactly the env vars runDispatch injects for real workers)
 *   - writes a completion marker file at OUT_DIR/<workerIndex>.done with
 *     timestamped startedAt + endedAt so the driver can reconstruct
 *     wall-clock timing post-hoc
 *
 * Zero LLM calls, zero network, zero side effects outside OUT_DIR.
 */

const fs = require('fs');
const path = require('path');

const durationMs = parseInt(process.env.WORKER_DURATION_MS || '8000', 10);
const outDir = process.env.OUT_DIR;
const workerIndex = process.env.GSD_T_WORKER_INDEX || '0';
const taskIds = process.env.GSD_T_WORKER_TASK_IDS || '';
const workerTotal = process.env.GSD_T_WORKER_TOTAL || '1';

// Exit cleanly when invoked without env vars (e.g. by `node --test` fixture sweep).
// This is a fixture worker, not a test — the proof driver always supplies OUT_DIR.
if (!outDir) { process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });

const startedAt = new Date().toISOString();
const startHr = process.hrtime.bigint();

setTimeout(() => {
  const endedAt = new Date().toISOString();
  const endHr = process.hrtime.bigint();
  const actualMs = Number(endHr - startHr) / 1e6;
  const marker = path.join(outDir, workerIndex + '.done');
  fs.writeFileSync(marker, JSON.stringify({
    workerIndex: Number(workerIndex),
    workerTotal: Number(workerTotal),
    taskIds: taskIds.split(',').filter(Boolean),
    startedAt, endedAt,
    durationMs: actualMs,
    requestedMs: durationMs,
    pid: process.pid,
  }, null, 2));
  process.exit(0);
}, durationMs);
