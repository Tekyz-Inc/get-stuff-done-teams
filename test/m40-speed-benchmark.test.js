'use strict';

// D0-T3 — smoke wrapper for bin/gsd-t-benchmark-orchestrator.js.
// Does NOT run the full 3-run verdict (that's an operator action with
// real `claude -p`). This file exercises the driver's plumbing —
// CLI parsing, median math, fixture copy + git init, output artifact
// generation, PASS/FAIL logic — using injected spawn mocks so the
// suite stays fast and deterministic.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const bench = require('../bin/gsd-t-benchmark-orchestrator.js');

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures', 'm40-benchmark-workload');

function silentLogger() {
  return { log: () => {} };
}

test('parseCliArgs: defaults + custom paths', () => {
  const a = bench.parseCliArgs([
    '--runs', '1',
    '--fixture-dir', FIXTURE_DIR,
    '--report-path', '/tmp/report.md',
    '--results-path', '/tmp/results.json',
    '--project-dir', '/tmp/proj',
    '--mock-claude', '/bin/true',
    '--keep-tmp',
  ]);
  assert.equal(a.runs, 1);
  assert.equal(a.fixtureDir, FIXTURE_DIR);
  assert.equal(a.reportPath, '/tmp/report.md');
  assert.equal(a.resultsPath, '/tmp/results.json');
  assert.equal(a.projectDir, '/tmp/proj');
  assert.equal(a.mockClaude, '/bin/true');
  assert.equal(a.keepTmp, true);
});

test('parseCliArgs: --keep-tmp defaults false', () => {
  const a = bench.parseCliArgs(['--runs', '1']);
  assert.equal(a.keepTmp, false);
});

test('parseCliArgs: rejects non-positive --runs', () => {
  assert.throws(() => bench.parseCliArgs(['--runs', '0']), /positive integer/);
  assert.throws(() => bench.parseCliArgs(['--runs', 'abc']), /positive integer/);
});

test('median: odd/even/empty', () => {
  assert.equal(bench.median([]), 0);
  assert.equal(bench.median([5]), 5);
  assert.equal(bench.median([1, 3, 5]), 3);
  assert.equal(bench.median([10, 20, 30, 40]), 25);
});

test('computeVerdict: PASS when orchestrator ≤ in-session × 1.05', () => {
  const v = bench.computeVerdict(
    [{ durationMs: 100, exitCode: 0 }, { durationMs: 110, exitCode: 0 }, { durationMs: 105, exitCode: 0 }],
    [{ durationMs: 200, exitCode: 0 }, { durationMs: 210, exitCode: 0 }, { durationMs: 205, exitCode: 0 }]
  );
  assert.equal(v.verdict, 'PASS');
  assert.equal(v.medianOrchMs, 105);
  assert.equal(v.medianInsessionMs, 205);
});

test('computeVerdict: FAIL when orchestrator > in-session × 1.05', () => {
  const v = bench.computeVerdict(
    [{ durationMs: 300, exitCode: 0 }, { durationMs: 310, exitCode: 0 }, { durationMs: 305, exitCode: 0 }],
    [{ durationMs: 200, exitCode: 0 }, { durationMs: 210, exitCode: 0 }, { durationMs: 205, exitCode: 0 }]
  );
  assert.equal(v.verdict, 'FAIL');
  assert.match(v.verdictDetail, /HALT RECOMMENDED/);
});

test('computeVerdict: FAIL when any run failed (cannot trust comparison)', () => {
  const v = bench.computeVerdict(
    [{ durationMs: 100, exitCode: 0 }, { durationMs: 100, exitCode: 1 }],
    [{ durationMs: 200, exitCode: 0 }, { durationMs: 200, exitCode: 0 }]
  );
  assert.equal(v.verdict, 'FAIL');
  assert.match(v.verdictDetail, /cannot trust/);
});

test('prepareRun + cleanupRun: fixture is copied, git init succeeds, cleanup removes tmp', () => {
  const { tmpBase, dest } = bench.prepareRun(FIXTURE_DIR, 'unit', 99);
  try {
    assert.ok(fs.existsSync(path.join(dest, '.gsd-t', 'domains', 'bench-d1', 'tasks.md')));
    assert.ok(fs.existsSync(path.join(dest, '.git')));
  } finally {
    bench.cleanupRun(tmpBase);
  }
  assert.equal(fs.existsSync(tmpBase), false);
});

test('renderReportMd: contains verdict, methodology, per-run rows', () => {
  const results = {
    generatedAt: '2026-04-19T00:00:00Z',
    runs: 2,
    fixtureDir: FIXTURE_DIR,
    env: bench.collectEnv(),
    orchestrator: [
      { durationMs: 100, exitCode: 0 },
      { durationMs: 110, exitCode: 0 },
    ],
    insession: [
      { durationMs: 200, exitCode: 0 },
      { durationMs: 210, exitCode: 0 },
    ],
    summary: { medianOrchMs: 105, medianInsessionMs: 205, thresholdMs: 215 },
    verdict: 'PASS',
    verdictDetail: 'ok',
  };
  const md = bench.renderReportMd(results);
  assert.match(md, /# M40 Speed Benchmark/);
  assert.match(md, /Verdict.*PASS/);
  assert.match(md, /\| 1 \| 100/);
  assert.match(md, /\| 2 \| 110/);
  assert.match(md, /Methodology/);
});

test('runBenchmark: smoke — --runs 1 against fixture, injected timings, PASS path writes both artifacts', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-bench-smoke-'));
  const orchestratorImpl = () => ({ durationMs: 100, exitCode: 0, stderr: '' });
  const insessionImpl = () => ({ durationMs: 200, exitCode: 0, stderr: '' });

  const out = await bench.runBenchmark({
    runs: 1,
    fixtureDir: FIXTURE_DIR,
    projectDir: workDir,
    reportPath: null,
    resultsPath: null,
    logger: silentLogger(),
    orchestratorImpl,
    insessionImpl,
  });

  assert.equal(out.results.verdict, 'PASS');
  assert.ok(fs.existsSync(out.resultsPath));
  assert.ok(fs.existsSync(out.reportPath));
  const parsed = JSON.parse(fs.readFileSync(out.resultsPath, 'utf8'));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.runs, 1);
  assert.equal(parsed.orchestrator[0].durationMs, 100);
  assert.equal(parsed.insession[0].durationMs, 200);
  const md = fs.readFileSync(out.reportPath, 'utf8');
  assert.match(md, /BENCHMARK|Speed Benchmark/);

  fs.rmSync(workDir, { recursive: true, force: true });
});

test('runBenchmark: FAIL path — orchestrator too slow — exit-equivalent FAIL verdict', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm40-bench-smoke-fail-'));
  const orchestratorImpl = () => ({ durationMs: 500, exitCode: 0, stderr: '' });
  const insessionImpl = () => ({ durationMs: 200, exitCode: 0, stderr: '' });

  const out = await bench.runBenchmark({
    runs: 1,
    fixtureDir: FIXTURE_DIR,
    projectDir: workDir,
    logger: silentLogger(),
    orchestratorImpl,
    insessionImpl,
  });

  assert.equal(out.results.verdict, 'FAIL');
  assert.match(out.results.verdictDetail, /HALT RECOMMENDED/);

  fs.rmSync(workDir, { recursive: true, force: true });
});

test('runBenchmark: missing fixture dir throws', async () => {
  await assert.rejects(
    bench.runBenchmark({
      runs: 1,
      fixtureDir: '/nonexistent/path/to/fixture',
      projectDir: os.tmpdir(),
      logger: silentLogger(),
      orchestratorImpl: () => ({ durationMs: 1, exitCode: 0 }),
      insessionImpl: () => ({ durationMs: 1, exitCode: 0 }),
    }),
    /Fixture dir not found/
  );
});

test('runOrchestratorSide: injected spawnImpl is called with orchestrator bin + --project-dir', () => {
  const calls = [];
  const spawnImpl = (bin, args) => {
    calls.push({ bin, args });
    return { status: 0, stderr: '' };
  };
  const r = bench.runOrchestratorSide({
    fixtureDir: FIXTURE_DIR,
    runIdx: 1,
    mockClaude: '/bin/true',
    logger: silentLogger(),
    spawnImpl,
  });
  assert.equal(r.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].bin, /node/i);
  assert.ok(calls[0].args[0].endsWith('gsd-t-orchestrator.js'));
  assert.ok(calls[0].args.includes('--project-dir'));
  assert.ok(calls[0].args.includes('--milestone'));
});

test('runOrchestratorSide: captures BOTH stdout and stderr into stderr field (regression)', () => {
  const spawnImpl = () => ({
    status: 1,
    stdout: '[wave_halt] wave=0 failed_tasks=1\n',
    stderr: 'something on stderr\n',
  });
  const r = bench.runOrchestratorSide({
    fixtureDir: FIXTURE_DIR,
    runIdx: 1,
    mockClaude: '/bin/true',
    logger: silentLogger(),
    spawnImpl,
  });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /--- stdout ---/);
  assert.match(r.stderr, /wave_halt/);
  assert.match(r.stderr, /--- stderr ---/);
  assert.match(r.stderr, /something on stderr/);
});

test('runOrchestratorSide: keepTmp=true preserves tmp dir and reports tmpDir', () => {
  const spawnImpl = () => ({ status: 0, stdout: '', stderr: '' });
  const r = bench.runOrchestratorSide({
    fixtureDir: FIXTURE_DIR,
    runIdx: 77,
    mockClaude: '/bin/true',
    logger: silentLogger(),
    keepTmp: true,
    spawnImpl,
  });
  try {
    assert.ok(r.tmpDir, 'tmpDir should be reported when keepTmp=true');
    assert.ok(fs.existsSync(r.tmpDir), 'tmp dir should still exist on disk');
    assert.ok(fs.existsSync(path.join(r.tmpDir, 'workload', '.git')));
  } finally {
    if (r.tmpDir) fs.rmSync(r.tmpDir, { recursive: true, force: true });
  }
});

test('runOrchestratorSide: keepTmp=false (default) cleans up and tmpDir=null', () => {
  const spawnImpl = () => ({ status: 0, stdout: '', stderr: '' });
  const r = bench.runOrchestratorSide({
    fixtureDir: FIXTURE_DIR,
    runIdx: 78,
    mockClaude: '/bin/true',
    logger: silentLogger(),
    spawnImpl,
  });
  assert.equal(r.tmpDir, null);
});

test('runInsessionSide: injected spawnImpl is called with claude bin + --dangerously-skip-permissions', () => {
  const calls = [];
  const spawnImpl = (bin, args) => {
    calls.push({ bin, args });
    return { status: 0, stderr: '' };
  };
  const r = bench.runInsessionSide({
    fixtureDir: FIXTURE_DIR,
    runIdx: 1,
    mockClaude: '/bin/true',
    logger: silentLogger(),
    spawnImpl,
  });
  assert.equal(r.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, '/bin/true');
  assert.ok(calls[0].args.includes('-p'));
  assert.ok(calls[0].args.includes('--dangerously-skip-permissions'));
});
