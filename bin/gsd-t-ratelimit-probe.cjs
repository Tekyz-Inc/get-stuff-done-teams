#!/usr/bin/env node
'use strict';

/**
 * GSD-T Rate-Limit Probe — Sweep Runner (M55 D3)
 *
 * One-shot empirical measurement of the Claude account's parallelism
 * ceiling under realistic GSD-T spawn shape.
 *
 * Output: `.gsd-t/ratelimit-map.json` (canonical, schema-versioned 1.0.0).
 *
 * Sweep matrix:
 *   parallel_workers ∈ {1, 2, 3, 4, 5, 6, 8}
 *   context_tokens   ∈ {10_000, 30_000, 60_000, 100_000}
 *   runs_per_cell    = 3
 *   total_runs       = 28 cells × 3 = 84
 *
 *   + backoff probe (deliberately provoke 429 at workers=8 / 100k)
 *   + steady-state probe (workers=3 / 30k for 5 minutes)
 *
 * Every spawn flows through `bin/gsd-t-token-capture.cjs::captureSpawn`.
 *
 * Contract: .gsd-t/contracts/ratelimit-map-contract.md v1.0.0 STABLE
 *
 * CLI:
 *   node bin/gsd-t-ratelimit-probe.cjs --json [--quick] [--out PATH]
 *     [--no-worktree]                  // run in cwd, skip throwaway worktree
 *     [--steady-state-sec N]           // override steady-state duration (debug)
 *     [--max-cells N]                  // hard ceiling on cells (debug/abort)
 *     [--max-token-budget N]           // abort sweep if cumulative tokens exceed N
 *     [--max-wall-clock-min N]         // abort sweep if wall-clock exceeds N min
 *     [--force-refresh]                // (informational; no caching yet)
 *
 * Zero external deps (Node built-ins only).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const SCHEMA_VERSION = '1.0.0';

const SWEEP_WORKERS = [1, 2, 3, 4, 5, 6, 8];
const SWEEP_CONTEXTS = [10000, 30000, 60000, 100000];
const RUNS_PER_CELL = 3;

const DECLARED_SAFE_P95_TTFT_MS = 8000;
const STEADY_STATE_DEFAULT_SEC = 300;     // 5 min
const STEADY_STATE_SAMPLE_SEC = 30;
const STEADY_STATE_WORKERS = 3;
const STEADY_STATE_CONTEXT = 30000;

const BACKOFF_TRIGGER_WORKERS = 8;
const BACKOFF_TRIGGER_CONTEXT = 100000;
const BACKOFF_TRIGGER_RUNS = 3;
const BACKOFF_RECOVERY_SAMPLES = 12;
const BACKOFF_RECOVERY_CADENCE_MS = 5000;

const FIXTURES_DIR_REL = '.gsd-t/fixtures/ratelimit-probe';
const WORKER_BIN_REL = 'bin/gsd-t-ratelimit-probe-worker.cjs';

const DEFAULT_BACKOFF_MS = 30000;

// ── Args ────────────────────────────────────────────────────────────────────

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

// ── Pure helpers (exported for tests) ───────────────────────────────────────

function buildSweepMatrix({ workers, contexts, runsPerCell }) {
  const cells = [];
  for (const w of workers) {
    for (const c of contexts) {
      cells.push({ workers: w, contextTokens: c, runsPerCell });
    }
  }
  return cells;
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

function summarizeCell(runs) {
  const ttfts = runs
    .map((r) => r.ttftMs)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  const total429 = runs.filter((r) => r && r.status429 === true).length;
  const p50 = ttfts.length ? Math.round(percentile(ttfts, 50)) : null;
  const p95 = ttfts.length ? Math.round(percentile(ttfts, 95)) : null;
  const declaredSafe = total429 === 0 && p95 !== null && p95 <= DECLARED_SAFE_P95_TTFT_MS;
  return {
    p50TtftMs: p50,
    p95TtftMs: p95,
    total429,
    declaredSafe,
  };
}

function maskAccount({ apiKey, oauthToken }) {
  if (apiKey) {
    const prefix = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
    return { account: prefix, authPath: 'api-key' };
  }
  if (oauthToken) {
    const prefix = crypto.createHash('sha256').update(oauthToken).digest('hex').slice(0, 16);
    return { account: 'oauth-' + prefix, authPath: 'oauth-claude-max' };
  }
  return { account: 'unknown', authPath: 'unknown' };
}

function deriveRecommended({ matrix, backoffProbe, steadyState }) {
  // peakConcurrency: highest workers value with declaredSafe=true at any context
  let peak = 1;
  let perWorker = 10000;
  for (const cell of matrix) {
    if (cell.summary && cell.summary.declaredSafe) {
      if (cell.workers > peak) peak = cell.workers;
    }
  }
  // perWorkerContextBudgetTokens: highest context where declaredSafe holds at peak
  for (const cell of matrix) {
    if (cell.summary && cell.summary.declaredSafe && cell.workers === peak) {
      if (cell.contextTokens > perWorker) perWorker = cell.contextTokens;
    }
  }
  // safeConcurrencyAt60kContext: highest workers value with declaredSafe at 60k
  let safe60 = 1;
  for (const cell of matrix) {
    if (cell.contextTokens === 60000 && cell.summary && cell.summary.declaredSafe) {
      if (cell.workers > safe60) safe60 = cell.workers;
    }
  }
  // backoffMs: median first-success tElapsedMs in recovery samples; else default
  let backoffMs = DEFAULT_BACKOFF_MS;
  if (backoffProbe && backoffProbe.trigger429Count === 0) {
    backoffMs = 0;
  } else if (backoffProbe && Array.isArray(backoffProbe.post429RecoverySamples)) {
    const firstOk = backoffProbe.post429RecoverySamples.find((s) => s && s.ok === true);
    if (firstOk && typeof firstOk.tElapsedMs === 'number') {
      backoffMs = firstOk.tElapsedMs;
    }
  }
  const steadyStatePass = !!(steadyState && steadyState.ok);
  return {
    safeConcurrencyAt60kContext: safe60,
    peakConcurrency: peak,
    perWorkerContextBudgetTokens: perWorker,
    backoffMs,
    steadyState3Workers5MinPass: steadyStatePass,
  };
}

// ── Credential discovery ────────────────────────────────────────────────────

function tryReadOAuthToken() {
  // 1. file path (older installs)
  const fp = path.join(os.homedir(), '.claude', '.credentials.json');
  if (fs.existsSync(fp)) {
    try {
      const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const t = j && j.claudeAiOauth && j.claudeAiOauth.accessToken;
      if (t) return { token: t, tier: j.claudeAiOauth.rateLimitTier || null };
    } catch (_) {}
  }
  // 2. macOS Keychain (newer Claude Code installs)
  if (process.platform === 'darwin') {
    try {
      const r = spawnSync('security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-a', os.userInfo().username, '-w'],
        { encoding: 'utf8', timeout: 5000 });
      if (r.status === 0 && r.stdout) {
        const raw = r.stdout.trim();
        try {
          const j = JSON.parse(raw);
          const t = j && j.claudeAiOauth && j.claudeAiOauth.accessToken;
          if (t) return { token: t, tier: j.claudeAiOauth.rateLimitTier || null };
        } catch (_) {}
      }
    } catch (_) {}
  }
  return { token: null, tier: null };
}

function detectClaudeCliVersion() {
  try {
    const r = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (r.status === 0 && r.stdout) {
      const m = r.stdout.match(/(\d+\.\d+\.\d+)/);
      if (m) return m[1];
    }
  } catch (_) {}
  return 'unknown';
}

// ── Worktree management ─────────────────────────────────────────────────────

function createWorktree(projectDir) {
  const wtBase = path.join(os.tmpdir(), 'gsd-t-ratelimit-probe-' + process.pid + '-' + Date.now());
  const r = spawnSync('git', ['-C', projectDir, 'worktree', 'add', '--detach', wtBase, 'HEAD'],
    { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) {
    return { worktreeDir: null, error: 'worktree-add-failed: ' + (r.stderr || r.stdout || '').slice(0, 200) };
  }
  return { worktreeDir: wtBase, error: null };
}

function removeWorktree(projectDir, worktreeDir) {
  if (!worktreeDir) return;
  try {
    spawnSync('git', ['-C', projectDir, 'worktree', 'remove', '--force', worktreeDir],
      { encoding: 'utf8', timeout: 30000 });
  } catch (_) {}
  // Best-effort cleanup
  try {
    if (fs.existsSync(worktreeDir)) fs.rmSync(worktreeDir, { recursive: true, force: true });
  } catch (_) {}
}

// ── Single worker spawn ─────────────────────────────────────────────────────

function spawnWorker({ workerBin, fixturePath, workerId, cellWorkers, cellContextTokens, runIdx, cwd }) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn('node', [
      workerBin,
      '--fixture', fixturePath,
      '--worker-id', workerId,
      '--cell-workers', String(cellWorkers),
      '--cell-context-tokens', String(cellContextTokens),
      '--run-idx', String(runIdx),
      '--cwd', cwd,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('exit', () => {
      // Worker emits one NDJSON line; parse first JSON-y line.
      let envelope = null;
      for (const line of stdout.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try { envelope = JSON.parse(t); break; } catch (_) {}
      }
      if (!envelope) {
        envelope = {
          workerId, cellWorkers, cellContextTokens, runIdx,
          ttftMs: null, totalMs: 0, status429: false, retryAfterMs: null,
          exitCode: -1,
          failedReason: 'no-envelope: ' + (stderr || stdout || '').slice(0, 200),
        };
      }
      resolve(envelope);
    });
    child.on('error', (err) => {
      resolve({
        workerId, cellWorkers, cellContextTokens, runIdx,
        ttftMs: null, totalMs: 0, status429: false, retryAfterMs: null,
        exitCode: -1,
        failedReason: 'spawn-error: ' + (err && err.message || err),
      });
    });
  });
}

// ── Cell runner (parallel across cellWorkers) ───────────────────────────────

async function runCell({ projectDir, workerBin, fixturePath, workers, contextTokens, runsPerCell, cwd, captureSpawn, cellLabel }) {
  const allRuns = [];
  for (let r = 0; r < runsPerCell; r++) {
    // Spawn `workers` children concurrently for this run
    const runPromises = [];
    for (let w = 0; w < workers; w++) {
      const workerId = 'w' + w + '-r' + r;
      const desc = cellLabel + ' worker=' + workerId;
      // captureSpawn wraps the worker spawn so token-log gets the row.
      const p = captureSpawn({
        command: 'gsd-t-ratelimit-probe',
        step: 'sweep',
        model: 'haiku',
        description: desc,
        projectDir,
        domain: 'm55-d3',
        task: 'T6-sweep',
        notes: 'cell w=' + workers + ' c=' + contextTokens + ' run=' + r,
        spawnFn: () => spawnWorker({
          workerBin, fixturePath, workerId,
          cellWorkers: workers, cellContextTokens: contextTokens, runIdx: r, cwd,
        }),
      }).then((wrapped) => wrapped && wrapped.result).catch((err) => ({
        workerId, cellWorkers: workers, cellContextTokens: contextTokens, runIdx: r,
        ttftMs: null, totalMs: 0, status429: false, retryAfterMs: null, exitCode: -1,
        failedReason: 'capture-throw: ' + (err && err.message || err),
      }));
      runPromises.push(p);
    }
    const runResults = await Promise.all(runPromises);
    allRuns.push(...runResults);
  }
  return allRuns;
}

// ── Backoff probe ───────────────────────────────────────────────────────────

async function runBackoffProbe({ projectDir, workerBin, fixtureForContext, cwd, captureSpawn }) {
  const triggerFixture = fixtureForContext(BACKOFF_TRIGGER_CONTEXT);
  const triggerRuns = await runCell({
    projectDir, workerBin, fixturePath: triggerFixture,
    workers: BACKOFF_TRIGGER_WORKERS, contextTokens: BACKOFF_TRIGGER_CONTEXT,
    runsPerCell: BACKOFF_TRIGGER_RUNS, cwd, captureSpawn,
    cellLabel: 'backoff-trigger',
  });
  const trigger429Count = triggerRuns.filter((r) => r && r.status429 === true).length;

  // Recovery sampling: every 5s for 60s, single worker each time
  const samples = [];
  const sampleStart = Date.now();
  for (let i = 0; i < BACKOFF_RECOVERY_SAMPLES; i++) {
    await new Promise((r) => setTimeout(r, BACKOFF_RECOVERY_CADENCE_MS));
    const tElapsedMs = Date.now() - sampleStart;
    const fixturePath = fixtureForContext(10000); // small fixture for fast recovery probes
    const resultWrapped = await captureSpawn({
      command: 'gsd-t-ratelimit-probe',
      step: 'backoff-recover',
      model: 'haiku',
      description: 'backoff-recover sample=' + i,
      projectDir,
      domain: 'm55-d3',
      task: 'T6-backoff',
      notes: 'recovery sample at ' + tElapsedMs + 'ms',
      spawnFn: () => spawnWorker({
        workerBin, fixturePath,
        workerId: 'recover-' + i,
        cellWorkers: 1, cellContextTokens: 10000, runIdx: i, cwd,
      }),
    }).catch(() => ({ result: null }));
    const r = resultWrapped && resultWrapped.result;
    samples.push({
      tElapsedMs,
      ok: !!(r && !r.status429 && r.exitCode === 0 && r.ttftMs != null),
      ttftMs: r && r.ttftMs != null ? r.ttftMs : null,
      status429: !!(r && r.status429),
    });
  }
  return {
    triggerCell: { workers: BACKOFF_TRIGGER_WORKERS, contextTokens: BACKOFF_TRIGGER_CONTEXT, runs: BACKOFF_TRIGGER_RUNS },
    trigger429Count,
    triggerRuns,
    post429RecoverySamples: samples,
  };
}

// ── Steady-state probe ──────────────────────────────────────────────────────

async function runSteadyState({ projectDir, workerBin, fixtureForContext, cwd, captureSpawn, durationSec }) {
  const fixturePath = fixtureForContext(STEADY_STATE_CONTEXT);
  const samples = [];
  const startMs = Date.now();
  let sampleIdx = 0;
  while ((Date.now() - startMs) / 1000 < durationSec) {
    sampleIdx++;
    const sampleStart = Date.now();
    const cellRuns = [];
    const cellPromises = [];
    for (let w = 0; w < STEADY_STATE_WORKERS; w++) {
      cellPromises.push(captureSpawn({
        command: 'gsd-t-ratelimit-probe',
        step: 'steady-state',
        model: 'haiku',
        description: 'steady-state s=' + sampleIdx + ' w=' + w,
        projectDir,
        domain: 'm55-d3',
        task: 'T6-steady',
        notes: 'sample idx ' + sampleIdx,
        spawnFn: () => spawnWorker({
          workerBin, fixturePath,
          workerId: 'ss-' + sampleIdx + '-w' + w,
          cellWorkers: STEADY_STATE_WORKERS, cellContextTokens: STEADY_STATE_CONTEXT, runIdx: sampleIdx, cwd,
        }),
      }).then((wr) => wr && wr.result).catch(() => null));
    }
    const all = await Promise.all(cellPromises);
    for (const r of all) if (r) cellRuns.push(r);
    const ttfts = cellRuns.map((r) => r.ttftMs).filter((v) => v != null).sort((a, b) => a - b);
    const ttftMedian = ttfts.length ? Math.round(percentile(ttfts, 50)) : null;
    const any429 = cellRuns.some((r) => r.status429);
    const tElapsedSec = Math.round((Date.now() - startMs) / 1000);
    samples.push({
      tElapsedSec,
      sampleDurationMs: Date.now() - sampleStart,
      workersOk: cellRuns.filter((r) => !r.status429 && r.exitCode === 0).length,
      ttftMs: ttftMedian,
      status429: any429,
    });
    // Respect the 30s sample cadence — wait the remainder of the window.
    const elapsedThisSample = Date.now() - sampleStart;
    const remaining = STEADY_STATE_SAMPLE_SEC * 1000 - elapsedThisSample;
    if (remaining > 0 && (Date.now() - startMs) / 1000 < durationSec) {
      await new Promise((r) => setTimeout(r, remaining));
    }
  }
  // Sustained ITPM/OTPM: rough — context_tokens × (workersOk/sample) / minute, output ≈ 1-token reply
  // We keep these conservative and informational; D2/D5 consume `recommended` not these directly.
  const totalSec = (Date.now() - startMs) / 1000;
  const totalIn = samples.reduce((a, s) => a + (s.workersOk || 0) * STEADY_STATE_CONTEXT, 0);
  const totalOut = samples.reduce((a, s) => a + (s.workersOk || 0) * 1, 0);
  const sustainedItpm = totalSec > 0 ? Math.round((totalIn / totalSec) * 60) : 0;
  const sustainedOtpm = totalSec > 0 ? Math.round((totalOut / totalSec) * 60) : 0;
  const ok = samples.length > 0 && samples.every((s) => !s.status429);
  return {
    workers: STEADY_STATE_WORKERS,
    contextTokens: STEADY_STATE_CONTEXT,
    durationSec,
    sampleCadenceSec: STEADY_STATE_SAMPLE_SEC,
    samples,
    sustainedItpm,
    sustainedOtpm,
    ok,
  };
}

// ── Main sweep ──────────────────────────────────────────────────────────────

async function runFullSweep(opts) {
  const projectDir = opts.projectDir || process.cwd();
  const quick = !!opts.quick;
  const noWorktree = !!opts.noWorktree;
  const steadyStateSec = opts.steadyStateSec || STEADY_STATE_DEFAULT_SEC;
  const maxCells = opts.maxCells || (quick ? 1 : SWEEP_WORKERS.length * SWEEP_CONTEXTS.length);
  const maxTokenBudget = opts.maxTokenBudget || (quick ? 100000 : 250000);
  const maxWallClockMin = opts.maxWallClockMin || (quick ? 5 : 45);

  const workerBin = path.join(projectDir, WORKER_BIN_REL);
  if (!fs.existsSync(workerBin)) {
    throw new Error('worker bin not found: ' + workerBin);
  }
  const fixturesDir = path.join(projectDir, FIXTURES_DIR_REL);
  const fixtureForContext = (ctxTokens) => {
    return path.join(fixturesDir, 'context-' + (ctxTokens / 1000) + 'k.txt');
  };

  // Credential masking
  const oauth = tryReadOAuthToken();
  const apiKey = process.env.ANTHROPIC_API_KEY || null;
  const masked = maskAccount({ apiKey, oauthToken: oauth.token });
  const accountTier = (apiKey ? null : oauth.tier) || (process.env.GSD_T_ACCOUNT_TIER || 'unknown');
  const claudeCliVersion = detectClaudeCliVersion();

  // Worktree
  let worktreeDir = projectDir;
  let worktreeNote = null;
  if (!noWorktree && !quick) {
    const wt = createWorktree(projectDir);
    if (wt.error) {
      worktreeNote = 'worktree-fallback: ' + wt.error;
      worktreeDir = projectDir;
    } else {
      worktreeDir = wt.worktreeDir;
    }
  }

  // captureSpawn shim
  const { captureSpawn } = require(path.join(projectDir, 'bin', 'gsd-t-token-capture.cjs'));

  const matrix = [];
  const notes = [];
  if (worktreeNote) notes.push(worktreeNote);
  notes.push('authPath: ' + masked.authPath);
  notes.push('claudeCliVersion: ' + claudeCliVersion);

  const sweepStartMs = Date.now();
  const cells = quick
    ? [{ workers: 1, contextTokens: 10000, runsPerCell: 1 }]
    : buildSweepMatrix({ workers: SWEEP_WORKERS, contexts: SWEEP_CONTEXTS, runsPerCell: RUNS_PER_CELL });

  let cellsExecuted = 0;
  let abortReason = null;
  for (const cell of cells) {
    if (cellsExecuted >= maxCells) {
      abortReason = 'maxCells (' + maxCells + ') reached';
      break;
    }
    const wallClockMin = (Date.now() - sweepStartMs) / 60000;
    if (wallClockMin > maxWallClockMin) {
      abortReason = 'maxWallClockMin (' + maxWallClockMin + ') exceeded at ' + wallClockMin.toFixed(1) + 'min';
      break;
    }
    const fixturePath = fixtureForContext(cell.contextTokens);
    if (!fs.existsSync(fixturePath)) {
      const summary = { p50TtftMs: null, p95TtftMs: null, total429: 0, declaredSafe: false };
      matrix.push({
        workers: cell.workers, contextTokens: cell.contextTokens,
        runs: [{ runIdx: 0, ttftMs: null, totalMs: 0, status429: false, retryAfterMs: null, exitCode: -1, failedReason: 'fixture-missing: ' + fixturePath }],
        summary,
      });
      cellsExecuted++;
      continue;
    }
    const cellLabel = 'cell w=' + cell.workers + '/c=' + cell.contextTokens;
    process.stderr.write('[probe] ' + cellLabel + ' starting (' + cell.runsPerCell + ' runs)\n');
    let runs;
    try {
      runs = await runCell({
        projectDir, workerBin, fixturePath,
        workers: cell.workers, contextTokens: cell.contextTokens,
        runsPerCell: cell.runsPerCell, cwd: worktreeDir, captureSpawn, cellLabel,
      });
    } catch (err) {
      runs = [{ runIdx: 0, ttftMs: null, totalMs: 0, status429: false, retryAfterMs: null, exitCode: -1, failedReason: 'cell-throw: ' + (err && err.message || err) }];
    }
    const summary = summarizeCell(runs);
    matrix.push({ workers: cell.workers, contextTokens: cell.contextTokens, runs, summary });
    cellsExecuted++;
    process.stderr.write('[probe] ' + cellLabel + ' done: p50=' + summary.p50TtftMs + 'ms p95=' + summary.p95TtftMs + 'ms 429=' + summary.total429 + ' safe=' + summary.declaredSafe + '\n');
  }
  if (abortReason) notes.push('sweep-aborted: ' + abortReason);

  // Backoff probe (LAST in sweep, only on full)
  let backoffProbe = null;
  if (!quick && !abortReason) {
    process.stderr.write('[probe] backoff-probe starting\n');
    try {
      backoffProbe = await runBackoffProbe({
        projectDir, workerBin, fixtureForContext, cwd: worktreeDir, captureSpawn,
      });
      process.stderr.write('[probe] backoff-probe done: trigger429=' + backoffProbe.trigger429Count + ' samples=' + backoffProbe.post429RecoverySamples.length + '\n');
    } catch (err) {
      notes.push('backoff-probe-failed: ' + (err && err.message || err));
    }
  }

  // Steady-state probe
  let steadyState = null;
  if (!quick && !abortReason) {
    process.stderr.write('[probe] steady-state starting (' + steadyStateSec + 's)\n');
    try {
      steadyState = await runSteadyState({
        projectDir, workerBin, fixtureForContext, cwd: worktreeDir, captureSpawn,
        durationSec: steadyStateSec,
      });
      process.stderr.write('[probe] steady-state done: ok=' + steadyState.ok + ' samples=' + steadyState.samples.length + '\n');
    } catch (err) {
      notes.push('steady-state-failed: ' + (err && err.message || err));
    }
  }

  // Worktree teardown
  if (!noWorktree && !quick && worktreeDir !== projectDir) {
    removeWorktree(projectDir, worktreeDir);
  }

  const recommended = deriveRecommended({ matrix, backoffProbe, steadyState });

  const out = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    claudeCliVersion,
    account: masked.account,
    accountTier,
    authPath: masked.authPath,
    matrix,
    backoffProbe,
    steadyState,
    recommended,
    notes,
  };
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const projectDir = process.cwd();
  const quick = !!args.quick;
  const opts = {
    projectDir,
    quick,
    noWorktree: !!args['no-worktree'],
    steadyStateSec: args['steady-state-sec'] ? parseInt(args['steady-state-sec'], 10) : undefined,
    maxCells: args['max-cells'] ? parseInt(args['max-cells'], 10) : undefined,
    maxTokenBudget: args['max-token-budget'] ? parseInt(args['max-token-budget'], 10) : undefined,
    maxWallClockMin: args['max-wall-clock-min'] ? parseInt(args['max-wall-clock-min'], 10) : undefined,
  };
  const out = await runFullSweep(opts);
  const defaultOut = quick
    ? path.join(projectDir, '.gsd-t', 'quick-smoke.json')
    : path.join(projectDir, '.gsd-t', 'ratelimit-map.json');
  const outPath = args.out || defaultOut;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  if (args.json) {
    process.stdout.write(JSON.stringify({ outPath, recommended: out.recommended, notes: out.notes }) + '\n');
  } else {
    process.stdout.write('Wrote ' + outPath + '\n');
    process.stdout.write('  peakConcurrency: ' + out.recommended.peakConcurrency + '\n');
    process.stdout.write('  safeAt60k:       ' + out.recommended.safeConcurrencyAt60kContext + '\n');
    process.stdout.write('  perWorkerBudget: ' + out.recommended.perWorkerContextBudgetTokens + '\n');
    process.stdout.write('  backoffMs:       ' + out.recommended.backoffMs + '\n');
    process.stdout.write('  steady5MinPass:  ' + out.recommended.steadyState3Workers5MinPass + '\n');
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write('FATAL: ' + (err && err.stack || err) + '\n');
    process.exit(2);
  });
}

module.exports = {
  SCHEMA_VERSION,
  SWEEP_WORKERS,
  SWEEP_CONTEXTS,
  RUNS_PER_CELL,
  DECLARED_SAFE_P95_TTFT_MS,
  buildSweepMatrix,
  summarizeCell,
  maskAccount,
  deriveRecommended,
  percentile,
  runFullSweep,
};
