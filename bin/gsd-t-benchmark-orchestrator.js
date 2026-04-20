#!/usr/bin/env node
'use strict';

// D0-T2 — M40 speed-benchmark gate driver.
// Compares wall-clock time for two ways of executing the same fixed workload:
//   (a) orchestrator path  — one `claude -p` spawn per task, wave-join loop
//                            driven by bin/gsd-t-orchestrator.js
//   (b) in-session path    — a single `claude -p` session that runs the same
//                            tasks sequentially (the honest "one Claude Code
//                            window" comparison)
// Contract: .gsd-t/contracts/wave-join-contract.md v1.0.0

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PKG_ROOT = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(PKG_ROOT, 'test', 'fixtures', 'm40-benchmark-workload');
const PASS_TOLERANCE = 1.05;

function parseCliArgs(argv) {
  const args = {
    runs: 3,
    reportPath: null,
    resultsPath: null,
    fixtureDir: DEFAULT_FIXTURE,
    mockClaude: null,
    projectDir: process.cwd(),
    keepTmp: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { args.help = true; }
    else if (a === '--runs') { args.runs = parseInt(argv[++i], 10); }
    else if (a === '--report-path') { args.reportPath = argv[++i]; }
    else if (a === '--results-path') { args.resultsPath = argv[++i]; }
    else if (a === '--fixture-dir') { args.fixtureDir = path.resolve(argv[++i]); }
    else if (a === '--mock-claude') { args.mockClaude = path.resolve(argv[++i]); }
    else if (a === '--project-dir') { args.projectDir = path.resolve(argv[++i]); }
    else if (a === '--keep-tmp') { args.keepTmp = true; }
  }
  if (!Number.isInteger(args.runs) || args.runs < 1) {
    throw new Error('--runs must be a positive integer');
  }
  return args;
}

function printHelp() {
  process.stdout.write([
    'Usage: gsd-t benchmark-orchestrator [options]',
    '',
    'Runs the M40 speed-benchmark kill-switch gate: compares orchestrator',
    'path vs in-session path on a fixed workload and emits a verdict.',
    '',
    'Options:',
    '  --runs <n>             Number of runs per side (default 3).',
    '  --report-path <path>   Human-readable report (default docs/m40-benchmark-report.md).',
    '  --results-path <path>  Machine-readable JSON (default .gsd-t/benchmark-results.json).',
    '  --fixture-dir <path>   Override benchmark workload fixture directory.',
    '  --mock-claude <path>   Use this binary as `claude` (for smoke tests).',
    '  --project-dir <path>   Project directory to write outputs into (default cwd).',
    '  --keep-tmp             Preserve per-run tmp directories for diagnosis.',
    '  -h, --help             Show this help.',
    '',
    'Verdict is PASS when median(orchestrator_ms) <= median(in-session_ms) * 1.05.',
    '',
  ].join('\n'));
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(s), d);
    else fs.copyFileSync(s, d);
  }
}

function gitInitRepo(dir) {
  const opts = { cwd: dir, stdio: 'ignore' };
  spawnSync('git', ['init', '-q', '-b', 'main'], opts);
  spawnSync('git', ['config', 'user.email', 'bench@gsd-t.local'], opts);
  spawnSync('git', ['config', 'user.name', 'benchmark'], opts);
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], opts);
  spawnSync('git', ['add', '-A'], opts);
  spawnSync('git', ['commit', '-q', '-m', 'benchmark fixture baseline'], opts);
}

function prepareRun(fixtureDir, label, runIdx) {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), `m40-bench-${label}-${runIdx}-`));
  const dest = path.join(tmpBase, 'workload');
  copyDirSync(fixtureDir, dest);
  gitInitRepo(dest);
  return { tmpBase, dest };
}

function cleanupRun(tmpBase) {
  try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

function buildChildEnv(mockClaude) {
  const env = { ...process.env };
  if (mockClaude) env.GSD_T_CLAUDE_BIN = mockClaude;
  return env;
}

function captureOutput(res) {
  const parts = [];
  if (res && res.stdout) parts.push('--- stdout ---\n' + String(res.stdout));
  if (res && res.stderr) parts.push('--- stderr ---\n' + String(res.stderr));
  return parts.join('\n').slice(-4096);
}

function runOrchestratorSide({ fixtureDir, runIdx, mockClaude, logger, keepTmp = false, spawnImpl = spawnSync }) {
  const { tmpBase, dest } = prepareRun(fixtureDir, 'orch', runIdx);
  const bin = path.join(__dirname, 'gsd-t-orchestrator.js');
  const t0 = Date.now();
  let exitCode = null;
  let output = '';
  try {
    const res = spawnImpl(process.execPath, [
      bin,
      '--milestone', 'M40-bench',
      '--project-dir', dest,
      '--max-parallel', '8',
      '--worker-timeout', '180000',
    ], {
      env: buildChildEnv(mockClaude),
      encoding: 'utf8',
      timeout: 900000,
    });
    exitCode = res.status;
    output = captureOutput(res);
  } catch (e) {
    output = 'spawn_error: ' + (e && e.message);
  }
  const durationMs = Date.now() - t0;
  if (logger) logger.log(`[bench orch #${runIdx}] exit=${exitCode} duration=${durationMs}ms`);
  if (keepTmp && logger) logger.log(`  kept: ${tmpBase}`);
  if (!keepTmp) cleanupRun(tmpBase);
  return { durationMs, exitCode, stderr: output, tmpDir: keepTmp ? tmpBase : null };
}

function runInsessionSide({ fixtureDir, runIdx, mockClaude, logger, keepTmp = false, spawnImpl = spawnSync }) {
  const { tmpBase, dest } = prepareRun(fixtureDir, 'insession', runIdx);
  const claudeBin = mockClaude || process.env.GSD_T_CLAUDE_BIN || 'claude';
  const prompt = [
    '# In-session equivalent — M40 benchmark control',
    '',
    'You are simulating a single Claude Code window running /gsd-t-execute',
    'against this fixture sequentially (no external orchestrator).',
    '',
    `Project dir: ${dest}`,
    'Read .gsd-t/domains/*/tasks.md; for each wave in order, for each task in',
    'the wave: read the task body, create/modify the specified files per the',
    'Acceptance criteria, run `npm test` for that test, and commit on main.',
    '',
    'Do not spawn subagents. This is the baseline we are being compared against.',
    '',
  ].join('\n');
  const t0 = Date.now();
  let exitCode = null;
  let output = '';
  try {
    const res = spawnImpl(claudeBin, [
      '-p',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', 'sonnet',
    ], {
      cwd: dest,
      env: buildChildEnv(mockClaude),
      input: prompt,
      encoding: 'utf8',
      timeout: 900000,
    });
    exitCode = res.status;
    output = captureOutput(res);
  } catch (e) {
    output = 'spawn_error: ' + (e && e.message);
  }
  const durationMs = Date.now() - t0;
  if (logger) logger.log(`[bench insession #${runIdx}] exit=${exitCode} duration=${durationMs}ms`);
  if (keepTmp && logger) logger.log(`  kept: ${tmpBase}`);
  if (!keepTmp) cleanupRun(tmpBase);
  return { durationMs, exitCode, stderr: output, tmpDir: keepTmp ? tmpBase : null };
}

function collectEnv() {
  return {
    node: process.version,
    platform: `${process.platform}-${os.release()}`,
    arch: process.arch,
    cpuCount: os.cpus().length,
    totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
  };
}

function renderReportMd(results) {
  const lines = [];
  lines.push('# M40 Speed Benchmark — Gate Verdict');
  lines.push('');
  lines.push(`- **Generated**: ${results.generatedAt}`);
  lines.push(`- **Runs per side**: ${results.runs}`);
  lines.push(`- **Fixture**: ${results.fixtureDir}`);
  lines.push(`- **Verdict**: **${results.verdict}** — ${results.verdictDetail}`);
  lines.push('');
  lines.push('## Environment');
  lines.push('');
  lines.push(`- Node: ${results.env.node}`);
  lines.push(`- Platform: ${results.env.platform} (${results.env.arch})`);
  lines.push(`- CPUs: ${results.env.cpuCount}`);
  lines.push(`- RAM: ${results.env.freeMemMb} MB free / ${results.env.totalMemMb} MB total`);
  lines.push('');
  lines.push('## Per-run timings (ms)');
  lines.push('');
  lines.push('| # | Orchestrator | In-session |');
  lines.push('|---|--------------|------------|');
  for (let i = 0; i < results.runs; i++) {
    const o = results.orchestrator[i] || {};
    const s = results.insession[i] || {};
    lines.push(`| ${i + 1} | ${o.durationMs ?? '—'} (exit ${o.exitCode ?? '—'}) | ${s.durationMs ?? '—'} (exit ${s.exitCode ?? '—'}) |`);
  }
  lines.push('');
  lines.push(`- **Median orchestrator**: ${results.summary.medianOrchMs} ms`);
  lines.push(`- **Median in-session**:  ${results.summary.medianInsessionMs} ms`);
  lines.push(`- **Threshold** (insession × ${PASS_TOLERANCE}): ${results.summary.thresholdMs} ms`);
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push('- Same fixture (`test/fixtures/m40-benchmark-workload/`) copied to a fresh');
  lines.push('  tmp dir per run; git initialized; no cross-run state.');
  lines.push('- Orchestrator path: `bin/gsd-t-orchestrator.js` drives waves via the');
  lines.push('  D1 spawn loop + D2 brief builder.');
  lines.push('- In-session path: a single `claude -p` session handed the tasks');
  lines.push('  sequentially — no subagents.');
  lines.push('- `Date.now()` wall-clock, millisecond precision. Both sides include');
  lines.push('  their full lifecycle (startup + work + teardown).');
  lines.push('- PASS when `median(orchestrator_ms) ≤ median(in-session_ms) × 1.05`.');
  lines.push('');
  return lines.join('\n');
}

function computeVerdict(orchTimings, insessionTimings) {
  const orchOk = orchTimings.length && orchTimings.every((r) => r.exitCode === 0);
  const insOk = insessionTimings.length && insessionTimings.every((r) => r.exitCode === 0);
  const medianOrchMs = median(orchTimings.map((r) => r.durationMs));
  const medianInsessionMs = median(insessionTimings.map((r) => r.durationMs));
  const thresholdMs = Math.round(medianInsessionMs * PASS_TOLERANCE);
  let verdict = 'FAIL';
  let verdictDetail;
  if (!orchOk || !insOk) {
    verdictDetail = `one or more runs failed (orchestrator_ok=${orchOk}, insession_ok=${insOk}) — cannot trust comparison — M40 HALT RECOMMENDED`;
  } else if (medianOrchMs <= thresholdMs) {
    verdict = 'PASS';
    verdictDetail = `orchestrator ${medianOrchMs}ms ≤ in-session ${medianInsessionMs}ms × ${PASS_TOLERANCE} (${thresholdMs}ms) — Waves 2+3+4 unlocked`;
  } else {
    verdictDetail = `orchestrator ${medianOrchMs}ms > in-session ${medianInsessionMs}ms × ${PASS_TOLERANCE} (${thresholdMs}ms) — M40 HALT RECOMMENDED`;
  }
  return { verdict, verdictDetail, medianOrchMs, medianInsessionMs, thresholdMs };
}

async function runBenchmark(opts) {
  const {
    runs,
    fixtureDir,
    mockClaude,
    projectDir,
    reportPath,
    resultsPath,
    keepTmp = false,
    logger = console,
    orchestratorImpl = runOrchestratorSide,
    insessionImpl = runInsessionSide,
  } = opts;

  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`Fixture dir not found: ${fixtureDir}`);
  }

  const orchestrator = [];
  const insession = [];
  for (let i = 1; i <= runs; i++) {
    orchestrator.push(orchestratorImpl({ fixtureDir, runIdx: i, mockClaude, logger, keepTmp }));
    insession.push(insessionImpl({ fixtureDir, runIdx: i, mockClaude, logger, keepTmp }));
  }

  const summary = computeVerdict(orchestrator, insession);
  const results = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runs,
    fixtureDir,
    env: collectEnv(),
    orchestrator,
    insession,
    summary,
    verdict: summary.verdict,
    verdictDetail: summary.verdictDetail,
  };

  const rp = resultsPath || path.join(projectDir, '.gsd-t', 'benchmark-results.json');
  const rrp = reportPath || path.join(projectDir, 'docs', 'm40-benchmark-report.md');
  fs.mkdirSync(path.dirname(rp), { recursive: true });
  fs.mkdirSync(path.dirname(rrp), { recursive: true });
  fs.writeFileSync(rp, JSON.stringify(results, null, 2));
  fs.writeFileSync(rrp, renderReportMd(results));

  const verdictLine = results.verdict === 'PASS'
    ? `BENCHMARK: PASS — orchestrator ${summary.medianOrchMs}ms vs in-session ${summary.medianInsessionMs}ms — Waves 2+3+4 unlocked`
    : `BENCHMARK: FAIL — orchestrator ${summary.medianOrchMs}ms vs in-session ${summary.medianInsessionMs}ms — M40 HALT RECOMMENDED`;
  logger.log('');
  logger.log(verdictLine);
  logger.log(`  Results: ${rp}`);
  logger.log(`  Report:  ${rrp}`);

  return { results, resultsPath: rp, reportPath: rrp };
}

async function main() {
  let args;
  try { args = parseCliArgs(process.argv.slice(2)); }
  catch (e) { process.stderr.write(`Error: ${e.message}\n\n`); printHelp(); process.exit(2); }
  if (args.help) { printHelp(); process.exit(0); }

  try {
    const { results } = await runBenchmark(args);
    process.exit(results.verdict === 'PASS' ? 0 : 1);
  } catch (e) {
    process.stderr.write(`benchmark-orchestrator failed: ${e && e.message}\n`);
    if (e && e.stack) process.stderr.write(e.stack + '\n');
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseCliArgs,
  median,
  copyDirSync,
  gitInitRepo,
  prepareRun,
  cleanupRun,
  collectEnv,
  renderReportMd,
  computeVerdict,
  runOrchestratorSide,
  runInsessionSide,
  runBenchmark,
  PASS_TOLERANCE,
};
