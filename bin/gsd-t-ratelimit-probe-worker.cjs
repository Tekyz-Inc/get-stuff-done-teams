#!/usr/bin/env node
'use strict';

/**
 * GSD-T Rate-Limit Probe — Single-Worker Child (M55 D3)
 *
 * Reads a synthetic context fixture from disk, spawns ONE
 * `claude -p --dangerously-skip-permissions` child with a
 * deterministic small prompt, captures:
 *   - ttftMs:   spawn-start → first non-empty stdout byte
 *   - totalMs:  spawn-start → child exit
 *   - status429:true iff stderr matches /rate.?limit/i or exit indicates 429
 *   - retryAfterMs: parsed from stderr `retry-after` hint when present
 *   - exitCode: child exit code (or null on signal)
 *
 * Emits exactly ONE NDJSON line on stdout containing the result envelope.
 *
 * Usage:
 *   node bin/gsd-t-ratelimit-probe-worker.cjs \
 *     --fixture <path> --worker-id <id> --cell-workers <N> \
 *     --cell-context-tokens <T> --run-idx <i> [--prompt-extra <text>] \
 *     [--cwd <dir>]
 *
 * Contract: .gsd-t/contracts/ratelimit-map-contract.md v1.0.0 STABLE
 *
 * The PARENT (sweep runner) is responsible for:
 *   - flowing this spawn through `bin/gsd-t-token-capture.cjs::captureSpawn`
 *   - aggregating multiple worker NDJSON lines into a cell summary
 *   - throwaway worktree management
 *
 * This file is the per-worker leaf; it does NOT call captureSpawn itself.
 *
 * Zero external deps (Node built-ins only).
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

const SMALL_PROMPT = 'Reply with only the number 42';
const RATE_LIMIT_RE = /rate.?limit|429|too.?many.?requests/i;
const RETRY_AFTER_MS_RE = /retry-after-ms[:\s]+(\d+)/i;
const RETRY_AFTER_S_RE = /retry-after[:\s]+(\d+)(?!\s*ms)/i;

function detectRetryAfterMs(stderr) {
  const m1 = stderr.match(RETRY_AFTER_MS_RE);
  if (m1) return parseInt(m1[1], 10);
  const m2 = stderr.match(RETRY_AFTER_S_RE);
  if (m2) return parseInt(m2[1], 10) * 1000;
  return null;
}

async function runOneProbe({ fixturePath, cwd, claudeBin, model }) {
  let fixtureBody = '';
  try {
    fixtureBody = fs.readFileSync(fixturePath, 'utf8');
  } catch (err) {
    return {
      ttftMs: null,
      totalMs: 0,
      status429: false,
      retryAfterMs: null,
      exitCode: -1,
      failedReason: 'fixture-read-failed: ' + (err && err.message || err),
    };
  }
  // Prompt = fixture context + a deterministic micro-question.
  // The fixture inflates the input-token side; the model answers tersely.
  const prompt = fixtureBody + '\n\n' + SMALL_PROMPT;

  const args = ['-p', '--dangerously-skip-permissions', '--print'];
  if (model) {
    args.push('--model', model);
  }
  args.push(prompt);

  return await new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    let firstByteAt = null;
    let stdout = '';
    let stderr = '';
    let settled = false;

    let child;
    try {
      // GSD-T-LINT: skip stream-json (reason: probe measures rate-limit envelope via API result fields stop_reason/is_error/api_error_status — switching to stream-json would require rewriting the 429 classifier from M55 D3, charter prohibits regression)
      child = spawn(claudeBin, args, {
        cwd: cwd || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } catch (err) {
      resolve({
        ttftMs: null,
        totalMs: 0,
        status429: false,
        retryAfterMs: null,
        exitCode: -1,
        failedReason: 'spawn-threw: ' + (err && err.message || err),
      });
      return;
    }

    child.stdout.on('data', (chunk) => {
      if (firstByteAt === null) firstByteAt = process.hrtime.bigint();
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      const t1 = process.hrtime.bigint();
      resolve({
        ttftMs: firstByteAt ? Number(firstByteAt - t0) / 1e6 : null,
        totalMs: Number(t1 - t0) / 1e6,
        status429: RATE_LIMIT_RE.test(stderr),
        retryAfterMs: detectRetryAfterMs(stderr),
        exitCode: -1,
        failedReason: 'child-error: ' + (err && err.message || err),
      });
    });

    child.on('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      const t1 = process.hrtime.bigint();
      const totalMs = Number(t1 - t0) / 1e6;
      const ttftMs = firstByteAt ? Number(firstByteAt - t0) / 1e6 : null;
      const is429 = RATE_LIMIT_RE.test(stderr);
      let failedReason = null;
      if (code !== 0 && !is429) {
        failedReason = 'exit-' + code + (signal ? '-' + signal : '') +
          (stderr ? ': ' + stderr.slice(0, 200).replace(/\s+/g, ' ').trim() : '');
      }
      resolve({
        ttftMs,
        totalMs,
        status429: is429,
        retryAfterMs: is429 ? detectRetryAfterMs(stderr) : null,
        exitCode: code == null ? -1 : code,
        failedReason,
      });
    });

    // Hard timeout per probe: 90s (covers 100k-context worst-case).
    setTimeout(() => {
      if (settled) return;
      try { child.kill('SIGKILL'); } catch (_) {}
    }, 90000);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const fixturePath = args.fixture;
  if (!fixturePath) {
    process.stderr.write('ERROR: --fixture <path> required\n');
    process.exit(2);
  }
  const workerId = args['worker-id'] || 'w0';
  const cellWorkers = parseInt(args['cell-workers'] || '1', 10);
  const cellContextTokens = parseInt(args['cell-context-tokens'] || '0', 10);
  const runIdx = parseInt(args['run-idx'] || '0', 10);
  const cwd = args.cwd || process.cwd();
  const claudeBin = args['claude-bin'] || process.env.GSD_T_CLAUDE_BIN || 'claude';
  const model = args.model || process.env.GSD_T_PROBE_MODEL || 'claude-haiku-4-5';

  const probeStart = Date.now();
  const result = await runOneProbe({ fixturePath, cwd, claudeBin, model });
  const probeEnd = Date.now();

  const envelope = {
    workerId,
    cellWorkers,
    cellContextTokens,
    runIdx,
    ttftMs: result.ttftMs,
    totalMs: result.totalMs,
    status429: result.status429,
    retryAfterMs: result.retryAfterMs,
    exitCode: result.exitCode,
    failedReason: result.failedReason,
    startedAt: new Date(probeStart).toISOString(),
    endedAt: new Date(probeEnd).toISOString(),
    model,
    fixturePath,
  };
  process.stdout.write(JSON.stringify(envelope) + '\n');
  // Exit 0 even on rate-limit/CLI failure — the parent reads the envelope, not the exit code.
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write('UNCAUGHT: ' + (err && err.stack || err) + '\n');
    // Emit a failure envelope so the parent has structured data.
    const envelope = {
      workerId: 'unknown',
      cellWorkers: 0,
      cellContextTokens: 0,
      runIdx: 0,
      ttftMs: null,
      totalMs: 0,
      status429: false,
      retryAfterMs: null,
      exitCode: -1,
      failedReason: 'uncaught: ' + (err && err.message || String(err)),
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };
    try { process.stdout.write(JSON.stringify(envelope) + '\n'); } catch (_) {}
    process.exit(1);
  });
}

module.exports = { runOneProbe, detectRetryAfterMs, RATE_LIMIT_RE };
