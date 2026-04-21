'use strict';
/**
 * M43 D5 — dialog-channel growth meter fixture tests.
 *
 * Covers:
 *   - Flat trajectory → shouldWarn=false
 *   - Steep linear growth → shouldWarn=true, sensible predicted horizon
 *   - Outlier resistance — one turn spikes, median absorbs it
 *   - Insufficient history (<3 in-session turns) → shouldWarn=false, reason set
 *   - Session isolation — rows with other session_id ignored
 *   - Empty JSONL — graceful, no throw
 *   - Missing file — graceful, reason=no_rows
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { estimateDialogGrowth } = require('../bin/runway-estimator.cjs');

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m43-d5-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'metrics'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function writeRows(projectDir, rows) {
  const p = path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}

function row({ sessionId, turnId, inputTokens, ts, sessionType = 'in-session' }) {
  return {
    schemaVersion: 2,
    ts: ts || new Date().toISOString(),
    source: 'live',
    command: 'in-session',
    step: 'turn',
    model: 'claude-opus-4-7',
    inputTokens,
    outputTokens: 100,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    session_id: sessionId,
    turn_id: turnId,
    sessionType,
    hasUsage: true,
  };
}

test('flat trajectory → shouldWarn=false', () => {
  const dir = makeTmpProject();
  try {
    const sid = 'sess-flat';
    const rows = [];
    const base = new Date('2026-04-21T10:00:00Z').getTime();
    for (let i = 0; i < 6; i++) {
      rows.push(row({
        sessionId: sid,
        turnId: `t-${i}`,
        inputTokens: 50000,
        ts: new Date(base + i * 60000).toISOString(),
      }));
    }
    writeRows(dir, rows);

    const r = estimateDialogGrowth({ projectDir: dir, sessionId: sid });
    assert.equal(r.shouldWarn, false);
    assert.equal(r.median_delta, 0);
    assert.equal(r.predicted_turns_to_compact, Infinity);
    assert.equal(r.history_len, 5); // last K=5 of 6
  } finally {
    cleanup(dir);
  }
});

test('steep linear growth → shouldWarn=true with sensible horizon', () => {
  const dir = makeTmpProject();
  try {
    const sid = 'sess-steep';
    const rows = [];
    const base = new Date('2026-04-21T10:00:00Z').getTime();
    // 6 turns growing by 20K each; latest = 180000. cap = 200K * 0.92 = 184000.
    // headroom at latest = 4000; slope = 20000 → ceil(4000/20000) = 1 turn.
    for (let i = 0; i < 6; i++) {
      rows.push(row({
        sessionId: sid,
        turnId: `t-${i}`,
        inputTokens: 80000 + i * 20000,
        ts: new Date(base + i * 60000).toISOString(),
      }));
    }
    writeRows(dir, rows);

    const r = estimateDialogGrowth({ projectDir: dir, sessionId: sid });
    assert.equal(r.shouldWarn, true);
    assert.equal(r.median_delta, 20000);
    assert.equal(r.slope, 20000);
    assert.equal(r.latest_input_tokens, 180000);
    assert.ok(Number.isFinite(r.predicted_turns_to_compact));
    assert.ok(r.predicted_turns_to_compact >= 0 && r.predicted_turns_to_compact <= 5);
  } finally {
    cleanup(dir);
  }
});

test('outlier resistance — single spike does not flip shouldWarn', () => {
  const dir = makeTmpProject();
  try {
    const sid = 'sess-outlier';
    const rows = [];
    const base = new Date('2026-04-21T10:00:00Z').getTime();
    // Flat at 50K, but one turn spikes to 100K, then returns to 50K.
    // Deltas between consecutive 5 turns: 0, +50K, -50K, 0 → median = 0.
    const values = [50000, 50000, 50000, 100000, 50000, 50000];
    for (let i = 0; i < values.length; i++) {
      rows.push(row({
        sessionId: sid,
        turnId: `t-${i}`,
        inputTokens: values[i],
        ts: new Date(base + i * 60000).toISOString(),
      }));
    }
    writeRows(dir, rows);

    const r = estimateDialogGrowth({ projectDir: dir, sessionId: sid });
    // Median of deltas is 0 → no growth, no warn, Infinity horizon.
    assert.equal(r.shouldWarn, false);
    assert.equal(r.median_delta, 0);
    assert.equal(r.predicted_turns_to_compact, Infinity);
  } finally {
    cleanup(dir);
  }
});

test('insufficient history (<3 in-session turns) → shouldWarn=false, reason set', () => {
  const dir = makeTmpProject();
  try {
    const sid = 'sess-short';
    const rows = [
      row({ sessionId: sid, turnId: 't-0', inputTokens: 50000, ts: '2026-04-21T10:00:00Z' }),
      row({ sessionId: sid, turnId: 't-1', inputTokens: 120000, ts: '2026-04-21T10:01:00Z' }),
    ];
    writeRows(dir, rows);

    const r = estimateDialogGrowth({ projectDir: dir, sessionId: sid });
    assert.equal(r.shouldWarn, false);
    assert.equal(r.reason, 'insufficient_history');
    assert.equal(r.history_len, 2);
  } finally {
    cleanup(dir);
  }
});

test('session isolation — other session_id rows are ignored', () => {
  const dir = makeTmpProject();
  try {
    const sid = 'sess-me';
    const other = 'sess-other';
    const base = new Date('2026-04-21T10:00:00Z').getTime();
    const rows = [];
    // 3 flat rows for the target session
    for (let i = 0; i < 3; i++) {
      rows.push(row({
        sessionId: sid,
        turnId: `me-${i}`,
        inputTokens: 50000,
        ts: new Date(base + i * 60000).toISOString(),
      }));
    }
    // 6 steep-growth rows for the OTHER session — must be ignored
    for (let i = 0; i < 6; i++) {
      rows.push(row({
        sessionId: other,
        turnId: `other-${i}`,
        inputTokens: 80000 + i * 20000,
        ts: new Date(base + i * 60000).toISOString(),
      }));
    }
    writeRows(dir, rows);

    const r = estimateDialogGrowth({ projectDir: dir, sessionId: sid });
    // Should only see the 3 flat rows for the target session
    assert.equal(r.history_len, 3);
    assert.equal(r.shouldWarn, false);
    assert.equal(r.median_delta, 0);
    assert.equal(r.latest_input_tokens, 50000);
  } finally {
    cleanup(dir);
  }
});

test('empty JSONL → graceful (no throw), reason=no_rows', () => {
  const dir = makeTmpProject();
  try {
    fs.writeFileSync(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), '');

    const r = estimateDialogGrowth({ projectDir: dir, sessionId: 'sess-empty' });
    assert.equal(r.shouldWarn, false);
    assert.equal(r.reason, 'no_rows');
    assert.equal(r.history_len, 0);
  } finally {
    cleanup(dir);
  }
});

test('missing JSONL file → graceful, reason=no_rows', () => {
  const dir = makeTmpProject();
  try {
    // Do NOT create the jsonl
    const r = estimateDialogGrowth({ projectDir: dir, sessionId: 'sess-missing' });
    assert.equal(r.shouldWarn, false);
    assert.equal(r.reason, 'no_rows');
  } finally {
    cleanup(dir);
  }
});

test('headless rows (sessionType !== in-session) are ignored', () => {
  const dir = makeTmpProject();
  try {
    const sid = 'sess-mixed';
    const base = new Date('2026-04-21T10:00:00Z').getTime();
    const rows = [];
    // 2 in-session (insufficient history)
    for (let i = 0; i < 2; i++) {
      rows.push(row({
        sessionId: sid,
        turnId: `ss-${i}`,
        inputTokens: 50000,
        ts: new Date(base + i * 60000).toISOString(),
      }));
    }
    // 6 headless — should all be filtered out
    for (let i = 0; i < 6; i++) {
      rows.push(row({
        sessionId: sid,
        turnId: `hl-${i}`,
        inputTokens: 100000 + i * 20000,
        ts: new Date(base + (i + 2) * 60000).toISOString(),
        sessionType: 'headless',
      }));
    }
    writeRows(dir, rows);

    const r = estimateDialogGrowth({ projectDir: dir, sessionId: sid });
    assert.equal(r.reason, 'insufficient_history');
    assert.equal(r.history_len, 2);
  } finally {
    cleanup(dir);
  }
});

test('missing sessionId → reason=missing_session_id', () => {
  const dir = makeTmpProject();
  try {
    const r = estimateDialogGrowth({ projectDir: dir });
    assert.equal(r.shouldWarn, false);
    assert.equal(r.reason, 'missing_session_id');
  } finally {
    cleanup(dir);
  }
});
