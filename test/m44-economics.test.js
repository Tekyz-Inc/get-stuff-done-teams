'use strict';
/**
 * M44 D6 — pre-spawn economics estimator
 *
 * Exercises bin/gsd-t-economics.cjs end-to-end against fixture corpora in
 * tmpdirs. Tests do NOT depend on the live .gsd-t/metrics/token-usage.jsonl.
 *
 * Contract: .gsd-t/contracts/economics-estimator-contract.md (v1.0.0)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const economics = require('../bin/gsd-t-economics.cjs');

// ─── fixture helpers ──────────────────────────────────────────────────────

function mkTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m44-d6-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'metrics'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function writeCorpus(projectDir, rows) {
  const p = path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

/** Synthesize a token-usage row with the given triplet and total split arbitrarily. */
function row(command, step, domain, totalTokens) {
  return {
    schemaVersion: 2,
    ts: '2026-04-22T00:00:00.000Z',
    source: 'live',
    command,
    step,
    model: 'sonnet',
    startedAt: '2026-04-22 10:00',
    endedAt: '2026-04-22 10:00',
    durationMs: 0,
    inputTokens: Math.floor(totalTokens * 0.3),
    outputTokens: Math.floor(totalTokens * 0.1),
    cacheReadInputTokens: Math.floor(totalTokens * 0.55),
    cacheCreationInputTokens: Math.floor(totalTokens * 0.05),
    costUSD: null,
    domain,
    task: null,
    milestone: null,
    ctxPct: null,
    notes: null,
    hasUsage: true,
  };
}

function readEvents(projectDir) {
  const dir = path.join(projectDir, '.gsd-t', 'events');
  const out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const line of src.split('\n')) {
        if (!line) continue;
        try { out.push(JSON.parse(line)); } catch (_) {}
      }
    }
  } catch (_) {}
  return out;
}

// ─── tests ────────────────────────────────────────────────────────────────

test('exact match with >=5 rows → HIGH confidence + plausible CwPct', () => {
  const dir = mkTmpProject();
  try {
    const rows = [];
    // 6 rows of the same triplet, varying totals around 100 K tokens (50% CW)
    for (let i = 0; i < 6; i++) {
      rows.push(row('gsd-t-execute', 'Step 4', 'auth-service', 100_000 + i * 1000));
    }
    writeCorpus(dir, rows);
    economics._resetCorpusCache();

    const res = economics.estimateTaskFootprint({
      taskNode: { id: 'X-1', command: 'gsd-t-execute', step: 'Step 4', domain: 'auth-service' },
      mode: 'in-session',
      projectDir: dir,
    });

    assert.equal(res.confidence, 'HIGH');
    assert.equal(res.matchedRows, 6);
    // Median of 6 samples around 100 K → ~50% of 200 K ceiling
    assert.ok(res.estimatedCwPct > 45 && res.estimatedCwPct < 60,
      `expected CwPct in (45, 60), got ${res.estimatedCwPct}`);
    assert.equal(res.parallelOk, true); // 50% < in-session 85% threshold
    assert.equal(res.split, false);
  } finally {
    cleanup(dir);
  }
});

test('exact match with 1-4 rows → MEDIUM confidence', () => {
  const dir = mkTmpProject();
  try {
    writeCorpus(dir, [
      row('gsd-t-quick', 'Step 0', '-', 80_000),
      row('gsd-t-quick', 'Step 0', '-', 90_000),
      row('gsd-t-quick', 'Step 0', '-', 100_000),
    ]);
    economics._resetCorpusCache();

    const res = economics.estimateTaskFootprint({
      taskNode: { id: 'X-2', command: 'gsd-t-quick', step: 'Step 0', domain: '-' },
      mode: 'in-session',
      projectDir: dir,
    });

    assert.equal(res.confidence, 'MEDIUM');
    assert.equal(res.matchedRows, 3);
  } finally {
    cleanup(dir);
  }
});

test('no exact match but domain match → LOW confidence', () => {
  const dir = mkTmpProject();
  try {
    writeCorpus(dir, [
      row('gsd-t-execute', 'Step 4', 'shared-dom', 100_000),
      row('gsd-t-execute', 'Step 4', 'shared-dom', 110_000),
    ]);
    economics._resetCorpusCache();

    const res = economics.estimateTaskFootprint({
      taskNode: { id: 'X-3', command: 'novel-command', step: 'novel-step', domain: 'shared-dom' },
      mode: 'in-session',
      projectDir: dir,
    });

    assert.equal(res.confidence, 'LOW');
    assert.ok(res.matchedRows > 0);
  } finally {
    cleanup(dir);
  }
});

test('no match anywhere → FALLBACK + global median', () => {
  const dir = mkTmpProject();
  try {
    // Build a corpus whose rows are ALL on one triplet so the global median is predictable.
    writeCorpus(dir, [
      row('cmd-a', 'step-a', 'dom-a', 100_000),
      row('cmd-a', 'step-a', 'dom-a', 120_000),
      row('cmd-a', 'step-a', 'dom-a', 140_000),
    ]);
    economics._resetCorpusCache();

    const res = economics.estimateTaskFootprint({
      taskNode: { id: 'X-4', command: 'unknown', step: 'unknown', domain: 'unknown' },
      mode: 'in-session',
      projectDir: dir,
    });

    assert.equal(res.confidence, 'FALLBACK');
    assert.equal(res.matchedRows, 0);
    // Global median of [100 K, 120 K, 140 K] = 120 K → 60% of CW
    assert.ok(res.estimatedCwPct > 55 && res.estimatedCwPct < 65,
      `expected CwPct ≈ 60, got ${res.estimatedCwPct}`);
  } finally {
    cleanup(dir);
  }
});

test('in-session mode uses 85% threshold for parallelOk', () => {
  const dir = mkTmpProject();
  try {
    // Row totaling ~170 K tokens → 85% of CW — right at the boundary.
    // Use a 168 K total → 84% → parallelOk=true.
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push(row('cmd', 'step', 'dom', 168_000));
    writeCorpus(dir, rows);
    economics._resetCorpusCache();

    const resUnder = economics.estimateTaskFootprint({
      taskNode: { id: 'X-5a', command: 'cmd', step: 'step', domain: 'dom' },
      mode: 'in-session',
      projectDir: dir,
    });
    assert.equal(resUnder.confidence, 'HIGH');
    assert.ok(resUnder.estimatedCwPct < 85);
    assert.equal(resUnder.parallelOk, true, `expected parallelOk=true at ${resUnder.estimatedCwPct}%`);
  } finally {
    cleanup(dir);
  }

  // Now above the 85% threshold
  const dir2 = mkTmpProject();
  try {
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push(row('cmd', 'step', 'dom', 180_000));
    writeCorpus(dir2, rows);
    economics._resetCorpusCache();

    const resOver = economics.estimateTaskFootprint({
      taskNode: { id: 'X-5b', command: 'cmd', step: 'step', domain: 'dom' },
      mode: 'in-session',
      projectDir: dir2,
    });
    assert.ok(resOver.estimatedCwPct > 85);
    assert.equal(resOver.parallelOk, false, `expected parallelOk=false at ${resOver.estimatedCwPct}%`);
    assert.equal(resOver.split, false); // in-session never splits
  } finally {
    cleanup(dir2);
  }
});

test('unattended mode uses 60% threshold for parallelOk + split', () => {
  // Under 60%
  const dir = mkTmpProject();
  try {
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push(row('cmd', 'step', 'dom', 100_000)); // 50%
    writeCorpus(dir, rows);
    economics._resetCorpusCache();

    const resUnder = economics.estimateTaskFootprint({
      taskNode: { id: 'X-6a', command: 'cmd', step: 'step', domain: 'dom' },
      mode: 'unattended',
      projectDir: dir,
    });
    assert.ok(resUnder.estimatedCwPct < 60);
    assert.equal(resUnder.parallelOk, true);
    assert.equal(resUnder.split, false);
  } finally {
    cleanup(dir);
  }

  // Over 60% → parallelOk=false + split=true
  const dir2 = mkTmpProject();
  try {
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push(row('cmd', 'step', 'dom', 140_000)); // 70%
    writeCorpus(dir2, rows);
    economics._resetCorpusCache();

    const resOver = economics.estimateTaskFootprint({
      taskNode: { id: 'X-6b', command: 'cmd', step: 'step', domain: 'dom' },
      mode: 'unattended',
      projectDir: dir2,
    });
    assert.ok(resOver.estimatedCwPct > 60);
    assert.equal(resOver.parallelOk, false);
    assert.equal(resOver.split, true);
  } finally {
    cleanup(dir2);
  }
});

test('economics_decision event written to .gsd-t/events/YYYY-MM-DD.jsonl', () => {
  const dir = mkTmpProject();
  try {
    writeCorpus(dir, [row('cmd', 'step', 'dom', 100_000)]);
    economics._resetCorpusCache();

    economics.estimateTaskFootprint({
      taskNode: { id: 'X-EVT', command: 'cmd', step: 'step', domain: 'dom' },
      mode: 'unattended',
      projectDir: dir,
    });

    const events = readEvents(dir);
    const decisions = events.filter((e) => e && e.type === 'economics_decision');
    assert.ok(decisions.length >= 1, 'expected at least one economics_decision event');
    const last = decisions[decisions.length - 1];
    assert.equal(last.task_id, 'X-EVT');
    assert.equal(last.mode, 'unattended');
    assert.equal(typeof last.estimatedCwPct, 'number');
    assert.ok(['HIGH', 'MEDIUM', 'LOW', 'FALLBACK'].includes(last.confidence));
    assert.equal(typeof last.parallelOk, 'boolean');
    assert.equal(typeof last.split, 'boolean');
    assert.equal(typeof last.matchedRows, 'number');
    assert.ok(typeof last.ts === 'string' && last.ts.length > 0);
  } finally {
    cleanup(dir);
  }
});

test('corpus loaded once per projectDir (cache)', () => {
  const dir = mkTmpProject();
  try {
    writeCorpus(dir, [row('cmd', 'step', 'dom', 100_000)]);
    economics._resetCorpusCache();

    const a = economics._loadCorpus(dir);
    const b = economics._loadCorpus(dir);
    assert.strictEqual(a, b, 'expected cached corpus to be strictly equal object');
  } finally {
    cleanup(dir);
  }
});

test('empty corpus → FALLBACK with globalMedian = 0', () => {
  const dir = mkTmpProject();
  try {
    // No token-usage.jsonl at all
    economics._resetCorpusCache();

    const res = economics.estimateTaskFootprint({
      taskNode: { id: 'X-EMPTY', command: 'cmd', step: 'step', domain: 'dom' },
      mode: 'in-session',
      projectDir: dir,
    });
    assert.equal(res.confidence, 'FALLBACK');
    assert.equal(res.matchedRows, 0);
    assert.equal(res.estimatedCwPct, 0);
    assert.equal(res.parallelOk, true); // 0% < 85% → parallelOk=true
  } finally {
    cleanup(dir);
  }
});
