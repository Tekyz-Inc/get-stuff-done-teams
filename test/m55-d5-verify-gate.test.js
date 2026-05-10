'use strict';

/**
 * M55 D5 — verify-gate library unit tests.
 *
 * Tests Track 1 hard-fail, Track 2 fan-out (mocked runParallel), summary
 * truncation ≤500 tokens, schema-version stability, defensive-on-missing-map,
 * and idempotent-rerun.
 *
 * Contract: .gsd-t/contracts/verify-gate-contract.md v1.0.0 STABLE.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lib = require('../bin/gsd-t-verify-gate.cjs');

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m55-d5-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// Mock runParallel that mirrors the D2 envelope shape.
function makeMockRunParallel({ shouldFail = false, workers = null } = {}) {
  return async (opts) => {
    const planWorkers = workers || opts.workers;
    const results = planWorkers.map((w, i) => ({
      id: w.id,
      ok: !shouldFail,
      exitCode: shouldFail ? 1 : 0,
      signal: null,
      durationMs: 100 + i * 10,
      stdoutPath: null,
      stderrPath: null,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncatedToTemp: false,
      stderrTruncatedToTemp: false,
      timedOut: false,
      cancelled: false,
    }));
    return {
      schemaVersion: '1.0.0',
      ok: !shouldFail,
      wallClockMs: 250,
      maxConcurrencyApplied: opts.maxConcurrency,
      failFast: !!opts.failFast,
      results,
      notes: [],
    };
  };
}

// ── Schema-version stability ────────────────────────────────────────────────

test('runVerifyGate: returns v1.0.0 envelope shape', async () => {
  const dir = makeTmpProject();
  try {
    const env = await lib.runVerifyGate({
      projectDir: dir,
      skipTrack1: true,
      skipTrack2: true,
    });
    assert.equal(env.schemaVersion, '1.0.0');
    assert.equal(env.ok, true);
    assert.ok(env.track1 && typeof env.track1 === 'object');
    assert.ok(env.track2 && typeof env.track2 === 'object');
    assert.ok(env.summary && typeof env.summary === 'object');
    assert.equal(typeof env.llmJudgePromptHint, 'string');
    assert.ok(env.meta && typeof env.meta.runId === 'string' && typeof env.meta.generatedAt === 'string');
  } finally {
    cleanup(dir);
  }
});

// ── Track 1 hard-fail ──────────────────────────────────────────────────────

test('runVerifyGate: track1 fail → ok false regardless of track2', async () => {
  const dir = makeTmpProject();
  try {
    // Make a CLAUDE.md with an Expected branch the project isn't on,
    // so branch-guard fires.
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Test\n\nExpected branch: never-this-branch-12345\n');

    const env = await lib.runVerifyGate({
      projectDir: dir,
      preflightChecks: ['branch-guard'],
      skipTrack2: true,
    });

    // Track 1 may be ok or not depending on whether `git` is available.
    // We assert: if track1.ok === false, top-level ok === false.
    if (!env.track1.ok) {
      assert.equal(env.ok, false);
      assert.equal(env.summary.verdict, 'FAIL');
      assert.ok(env.summary.track1.failedChecks.length >= 1);
    }
  } finally {
    cleanup(dir);
  }
});

test('runVerifyGate: track1 ok + track2 fail → ok false', async () => {
  const dir = makeTmpProject();
  try {
    const mockRP = makeMockRunParallel({ shouldFail: true });
    const env = await lib.runVerifyGate({
      projectDir: dir,
      skipTrack1: true,
      parallelTrack: [{ id: 'fakecli', cmd: 'echo', args: ['boom'] }],
      runParallelImpl: mockRP,
    });
    assert.equal(env.ok, false);
    assert.equal(env.track1.ok, true);
    assert.equal(env.track2.ok, false);
    assert.equal(env.summary.verdict, 'FAIL');
    assert.equal(env.summary.track2.failedWorkers.length, 1);
  } finally {
    cleanup(dir);
  }
});

// ── Track 2 fan-out (mocked) ────────────────────────────────────────────────

test('runVerifyGate: track 2 fan-out wires plan into runParallel', async () => {
  const dir = makeTmpProject();
  try {
    let received = null;
    const mockRP = async (opts) => {
      received = opts;
      const results = opts.workers.map((w) => ({
        id: w.id,
        ok: true,
        exitCode: 0,
        durationMs: 50,
        stdoutPath: null,
        stderrPath: null,
        stdoutBytes: 0, stderrBytes: 0,
        stdoutTruncatedToTemp: false, stderrTruncatedToTemp: false,
        timedOut: false, cancelled: false,
      }));
      return { schemaVersion: '1.0.0', ok: true, wallClockMs: 50, maxConcurrencyApplied: opts.maxConcurrency, failFast: !!opts.failFast, results, notes: [] };
    };
    const plan = [
      { id: 'cli-a', cmd: 'echo', args: ['a'] },
      { id: 'cli-b', cmd: 'echo', args: ['b'] },
    ];
    const env = await lib.runVerifyGate({
      projectDir: dir,
      skipTrack1: true,
      parallelTrack: plan,
      maxConcurrency: 3,
      runParallelImpl: mockRP,
    });
    assert.ok(received, 'runParallel should have been called');
    assert.equal(received.maxConcurrency, 3);
    assert.equal(received.workers.length, 2);
    assert.equal(received.command, 'gsd-t-verify-gate');
    assert.equal(received.step, 'Track 2');
    assert.equal(env.track2.workers.length, 2);
    assert.equal(env.track2.workers[0].id, 'cli-a');
    assert.equal(env.track2.workers[1].id, 'cli-b');
  } finally {
    cleanup(dir);
  }
});

// ── Summary truncation ≤500 tokens ─────────────────────────────────────────

test('runVerifyGate: summary stays ≤500 tokens even with many failed workers', async () => {
  const dir = makeTmpProject();
  try {
    const big = 'x'.repeat(50000);
    const mockRP = async (opts) => {
      const results = opts.workers.map((w) => ({
        id: w.id, ok: false, exitCode: 1, durationMs: 100,
        stdoutPath: null, stderrPath: null,
        stdoutBytes: big.length, stderrBytes: 0,
        stdoutTruncatedToTemp: false, stderrTruncatedToTemp: false,
        timedOut: false, cancelled: false,
      }));
      return { schemaVersion: '1.0.0', ok: false, wallClockMs: 100, maxConcurrencyApplied: 4, failFast: false, results, notes: [] };
    };
    const plan = Array.from({ length: 10 }, (_, i) => ({
      id: 'cli-' + i, cmd: 'echo', args: ['x'],
    }));
    const env = await lib.runVerifyGate({
      projectDir: dir,
      skipTrack1: true,
      parallelTrack: plan,
      runParallelImpl: mockRP,
    });
    const summaryJson = JSON.stringify(env.summary);
    const tokens = Math.ceil(summaryJson.length * 0.25);
    assert.ok(tokens <= 500, 'summary should be ≤500 tokens, got ' + tokens);
  } finally {
    cleanup(dir);
  }
});

// ── Defensive on missing ratelimit-map.json ────────────────────────────────

test('_resolveMaxConcurrency: missing map → fallback 2 + warning note', () => {
  const dir = makeTmpProject();
  try {
    const r = lib._resolveMaxConcurrency({ projectDir: dir, explicit: undefined });
    assert.equal(r.value, 2);
    assert.ok(r.notes.some((n) => /ratelimit-map\.json absent/.test(n)));
  } finally {
    cleanup(dir);
  }
});

test('_resolveMaxConcurrency: map with peakConcurrency → uses it', () => {
  const dir = makeTmpProject();
  try {
    fs.writeFileSync(
      path.join(dir, '.gsd-t', 'ratelimit-map.json'),
      JSON.stringify({ recommended: { peakConcurrency: 6 } })
    );
    const r = lib._resolveMaxConcurrency({ projectDir: dir });
    assert.equal(r.value, 6);
    assert.equal(r.notes.length, 0);
  } finally {
    cleanup(dir);
  }
});

test('_resolveMaxConcurrency: map without peakConcurrency → fallback 2 + note', () => {
  const dir = makeTmpProject();
  try {
    fs.writeFileSync(
      path.join(dir, '.gsd-t', 'ratelimit-map.json'),
      JSON.stringify({ recommended: {} })
    );
    const r = lib._resolveMaxConcurrency({ projectDir: dir });
    assert.equal(r.value, 2);
    assert.ok(r.notes.some((n) => /missing recommended\.peakConcurrency/.test(n)));
  } finally {
    cleanup(dir);
  }
});

test('_resolveMaxConcurrency: explicit overrides map', () => {
  const dir = makeTmpProject();
  try {
    fs.writeFileSync(
      path.join(dir, '.gsd-t', 'ratelimit-map.json'),
      JSON.stringify({ recommended: { peakConcurrency: 6 } })
    );
    const r = lib._resolveMaxConcurrency({ projectDir: dir, explicit: 3 });
    assert.equal(r.value, 3);
    assert.equal(r.notes.length, 0);
  } finally {
    cleanup(dir);
  }
});

// ── Idempotent re-run ──────────────────────────────────────────────────────

test('runVerifyGate: idempotent — same source-state produces byte-identical track1+summary', async () => {
  const dir = makeTmpProject();
  try {
    const mockRP = makeMockRunParallel({ shouldFail: false });
    const plan = [{ id: 'a', cmd: 'echo', args: ['1'] }, { id: 'b', cmd: 'echo', args: ['2'] }];
    const opts = {
      projectDir: dir,
      skipTrack1: true,
      parallelTrack: plan,
      runParallelImpl: mockRP,
    };
    const e1 = await lib.runVerifyGate(opts);
    const e2 = await lib.runVerifyGate(opts);

    // track1 byte-identical (skipTrack1 path is deterministic).
    assert.deepEqual(e1.track1, e2.track1);

    // summary byte-identical (verdict + ok flags + sorted lists).
    assert.deepEqual(e1.summary, e2.summary);

    // workers list byte-identical at the (id, ok, exitCode, skipped, reason)
    // level — durationMs may vary.
    const stripDuration = (env) => env.track2.workers.map(w => ({
      id: w.id, ok: w.ok, exitCode: w.exitCode, skipped: w.skipped, reason: w.reason,
    }));
    assert.deepEqual(stripDuration(e1), stripDuration(e2));
  } finally {
    cleanup(dir);
  }
});

// ── Determinism: workers sorted by id ascending ────────────────────────────

test('runVerifyGate: track2.workers sorted by id ASC', async () => {
  const dir = makeTmpProject();
  try {
    // Mock that returns results in REVERSE order of workers passed in.
    const mockRP = async (opts) => ({
      schemaVersion: '1.0.0', ok: true, wallClockMs: 50,
      maxConcurrencyApplied: opts.maxConcurrency, failFast: false, notes: [],
      results: [...opts.workers].reverse().map((w, i) => ({
        id: w.id, ok: true, exitCode: 0, durationMs: 10 + i,
        stdoutPath: null, stderrPath: null,
        stdoutBytes: 0, stderrBytes: 0,
        stdoutTruncatedToTemp: false, stderrTruncatedToTemp: false,
        timedOut: false, cancelled: false,
      })),
    });
    const plan = [
      { id: 'zeta',  cmd: 'echo', args: [] },
      { id: 'alpha', cmd: 'echo', args: [] },
      { id: 'mu',    cmd: 'echo', args: [] },
    ];
    const env = await lib.runVerifyGate({
      projectDir: dir,
      skipTrack1: true,
      parallelTrack: plan,
      runParallelImpl: mockRP,
    });
    const ids = env.track2.workers.map((w) => w.id);
    assert.deepEqual(ids, ['alpha', 'mu', 'zeta']);
  } finally {
    cleanup(dir);
  }
});

// ── Skip-flag behavior ─────────────────────────────────────────────────────

test('runVerifyGate: skipTrack1 sets track1.skipped:true and ok unaffected by it', async () => {
  const dir = makeTmpProject();
  try {
    const mockRP = makeMockRunParallel({ shouldFail: false });
    const env = await lib.runVerifyGate({
      projectDir: dir,
      skipTrack1: true,
      parallelTrack: [{ id: 'a', cmd: 'echo', args: ['1'] }],
      runParallelImpl: mockRP,
    });
    assert.equal(env.track1.skipped, true);
    assert.equal(env.track1.ok, true);
    assert.equal(env.ok, true);
    assert.deepEqual(env.track1.notes, ['skipped by flag']);
  } finally {
    cleanup(dir);
  }
});

test('runVerifyGate: skipTrack2 sets track2.skipped:true and ok depends on track1', async () => {
  const dir = makeTmpProject();
  try {
    const env = await lib.runVerifyGate({
      projectDir: dir,
      skipTrack1: true,
      skipTrack2: true,
    });
    assert.equal(env.track2.skipped, true);
    assert.equal(env.track2.ok, true);
    assert.equal(env.ok, true);
  } finally {
    cleanup(dir);
  }
});

// ── runId derivation ───────────────────────────────────────────────────────

test('_runIdFromDate: deterministic ISO-without-colons stamp', () => {
  const d = new Date('2026-05-09T17:08:25.000Z');
  const id = lib._runIdFromDate(d);
  assert.equal(id, 'verify-gate-2026-05-09T17-08-25Z');
});

// ── Internal: head/tail snippet ─────────────────────────────────────────────

test('_headTail: short text passes through unchanged', () => {
  assert.equal(lib._headTail('short', 10), 'short');
});

test('_headTail: long text head + tail with separator', () => {
  const text = 'A'.repeat(50) + 'MID' + 'B'.repeat(50);
  const out = lib._headTail(text, 10);
  assert.ok(out.startsWith('AAAAAAAAAA'));
  assert.ok(out.endsWith('BBBBBBBBBB'));
  assert.ok(out.includes('…'));
});

// ── Internal: sanitize for JSON ─────────────────────────────────────────────

test('_sanitizeForJson: replaces unprintable control chars with ?', () => {
  const ctrl = String.fromCharCode(0) + 'ok' + String.fromCharCode(7);
  const out = lib._sanitizeForJson(ctrl);
  assert.equal(out, '?ok?');
});

test('_sanitizeForJson: preserves \\n and \\t', () => {
  const out = lib._sanitizeForJson('a\nb\tc');
  assert.equal(out, 'a\nb\tc');
});

// ── parseArgv ──────────────────────────────────────────────────────────────

test('_parseArgv: --skip-track1 and --skip-track2', () => {
  const out = lib._parseArgv(['--skip-track1', '--skip-track2']);
  assert.equal(out.skipTrack1, true);
  assert.equal(out.skipTrack2, true);
});

test('_parseArgv: --max-concurrency parses positive int', () => {
  const out = lib._parseArgv(['--max-concurrency', '5']);
  assert.equal(out.maxConcurrency, 5);
});

test('_parseArgv: --max-concurrency rejects bad value', () => {
  const out = lib._parseArgv(['--max-concurrency', 'NaN']);
  assert.ok(out._badFlag);
});

test('_parseArgv: unknown flag flagged', () => {
  const out = lib._parseArgv(['--bogus']);
  assert.ok(out._badFlag);
});
