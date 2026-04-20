'use strict';
/**
 * M40 D4-T6 — Token aggregator tests
 *
 * Covers:
 *   - processFrame: task-boundary sets ctx; assistant usage accumulates; result overwrites
 *   - writeTokenUsageJsonl schema v1 shape
 *   - updateTokenLog rewrites Tokens column by taskId match
 *   - runOnce end-to-end: fixture JSONL → rollup → log update
 *   - malformed JSON skipped silently
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  processFrame,
  initGroup,
  writeTokenUsageJsonl,
  updateTokenLog,
  formatTokenSummary,
  readFrames,
  runOnce,
  SCHEMA_VERSION,
} = require('../scripts/gsd-t-token-aggregator.js');

function mktmp(prefix = 'gsd-t-tokagg-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('processFrame: task-boundary start creates group and sets ctx', () => {
  const groups = new Map();
  const ctx = { current: null, sessionMap: new Map() };
  processFrame({
    type: 'task-boundary', state: 'start',
    taskId: 't-1', workerPid: 999,
    domain: 'd4-stream-feed-server', wave: 3,
    ts: '2026-04-20T14:00:00.000Z',
  }, groups, ctx);
  assert.equal(groups.size, 1);
  const g = groups.get('999::t-1');
  assert.ok(g);
  assert.equal(g.domain, 'd4-stream-feed-server');
  assert.equal(g.wave, 3);
  assert.equal(g.startTs, '2026-04-20T14:00:00.000Z');
  assert.deepEqual(ctx.current, { workerPid: 999, taskId: 't-1' });
});

test('processFrame: assistant frames accumulate usage against current ctx', () => {
  const groups = new Map();
  const ctx = { current: null, sessionMap: new Map() };
  processFrame({
    type: 'task-boundary', state: 'start',
    taskId: 't-2', workerPid: 1000, domain: 'd1', wave: 1,
  }, groups, ctx);
  processFrame({
    type: 'assistant',
    message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 } },
  }, groups, ctx);
  processFrame({
    type: 'assistant',
    message: { usage: { input_tokens: 200, output_tokens: 75, cache_read_input_tokens: 20, cache_creation_input_tokens: 8 } },
  }, groups, ctx);
  const g = groups.get('1000::t-2');
  assert.equal(g.inputTokens, 300);
  assert.equal(g.outputTokens, 125);
  assert.equal(g.cacheReadInputTokens, 30);
  assert.equal(g.cacheCreationInputTokens, 13);
  assert.equal(g.assistantFrames, 2);
});

test('processFrame: result frame overwrites aggregate and sets cost', () => {
  const groups = new Map();
  const ctx = { current: null, sessionMap: new Map() };
  processFrame({
    type: 'task-boundary', state: 'start',
    taskId: 't-3', workerPid: 1001, domain: 'd5', wave: 3,
  }, groups, ctx);
  processFrame({
    type: 'assistant',
    message: { usage: { input_tokens: 50, output_tokens: 10 } },
  }, groups, ctx);
  processFrame({
    type: 'result',
    usage: { input_tokens: 999, output_tokens: 111, cache_read_input_tokens: 77, cache_creation_input_tokens: 22 },
    total_cost_usd: 0.0342,
    num_turns: 4,
    duration_ms: 12500,
  }, groups, ctx);
  const g = groups.get('1001::t-3');
  // Result overrides per-assistant accumulation.
  assert.equal(g.inputTokens, 999);
  assert.equal(g.outputTokens, 111);
  assert.equal(g.cacheReadInputTokens, 77);
  assert.equal(g.cacheCreationInputTokens, 22);
  assert.equal(g.costUSD, 0.0342);
  assert.equal(g.numTurns, 4);
  assert.equal(g.durationMs, 12500);
  assert.equal(g.hasResult, true);
});

test('processFrame: task-boundary done/failed captures endTs + state', () => {
  const groups = new Map();
  const ctx = { current: null, sessionMap: new Map() };
  processFrame({
    type: 'task-boundary', state: 'start',
    taskId: 't-4', workerPid: 1002, domain: 'd1', wave: 2,
    ts: '2026-04-20T14:00:00.000Z',
  }, groups, ctx);
  processFrame({
    type: 'task-boundary', state: 'done',
    taskId: 't-4', workerPid: 1002,
    ts: '2026-04-20T14:05:30.000Z',
  }, groups, ctx);
  const g = groups.get('1002::t-4');
  assert.equal(g.state, 'done');
  assert.equal(g.endTs, '2026-04-20T14:05:30.000Z');
});

test('processFrame: frames without context are dropped', () => {
  const groups = new Map();
  const ctx = { current: null, sessionMap: new Map() };
  processFrame({
    type: 'assistant',
    message: { usage: { input_tokens: 100, output_tokens: 50 } },
  }, groups, ctx);
  assert.equal(groups.size, 0);
});

test('formatTokenSummary: formats in/out/cr/cc + cost (or em-dash if null)', () => {
  const r = { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 10, cacheCreationInputTokens: 5, costUSD: 0.0342 };
  assert.equal(formatTokenSummary(r), 'in=100 out=50 cr=10 cc=5 $0.03');
  const r2 = { ...r, costUSD: null };
  assert.equal(formatTokenSummary(r2), 'in=100 out=50 cr=10 cc=5 —');
});

test('writeTokenUsageJsonl: appends one line per row with schemaVersion', () => {
  const dir = mktmp();
  const out = path.join(dir, 'metrics', 'token-usage.jsonl');
  const rows = [
    { schemaVersion: 1, taskId: 't-a', inputTokens: 100 },
    { schemaVersion: 1, taskId: 't-b', inputTokens: 200 },
  ];
  writeTokenUsageJsonl(out, rows);
  const content = fs.readFileSync(out, 'utf8');
  const lines = content.split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  const parsed = lines.map(l => JSON.parse(l));
  assert.equal(parsed[0].taskId, 't-a');
  assert.equal(parsed[1].taskId, 't-b');
});

test('updateTokenLog: rewrites Tokens column by taskId match', () => {
  const dir = mktmp();
  const logPath = path.join(dir, 'token-log.md');
  fs.writeFileSync(logPath, [
    '# GSD-T Token Log',
    '',
    '| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |',
    '|----------------|--------------|---------|------|-------|-------------|-------|--------|-----------|--------|------|------|',
    '| 2026-04-20 14:00 | 2026-04-20 14:02 | execute | Step 5 | sonnet | 120s | ok | - | no | d4 | d4-t5 | 45 |',
    '| 2026-04-20 14:10 | 2026-04-20 14:15 | execute | Step 5 | sonnet | 300s | ok | - | no | d4 | d4-t6 | 50 |',
    '',
  ].join('\n'));
  const rows = [
    { taskId: 'd4-t5', inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 100, cacheCreationInputTokens: 20, costUSD: 0.05 },
    { taskId: 'd4-t6', inputTokens: 2000, outputTokens: 800, cacheReadInputTokens: 200, cacheCreationInputTokens: 40, costUSD: 0.09 },
  ];
  const res = updateTokenLog(logPath, rows);
  assert.equal(res.updated, 2);
  const after = fs.readFileSync(logPath, 'utf8');
  assert.match(after, /in=1000 out=500 cr=100 cc=20 \$0\.05/);
  assert.match(after, /in=2000 out=800 cr=200 cc=40 \$0\.09/);
});

test('updateTokenLog: no-op when taskId not present', () => {
  const dir = mktmp();
  const logPath = path.join(dir, 'token-log.md');
  const original = [
    '| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |',
    '|----------------|--------------|---------|------|-------|-------------|-------|--------|-----------|--------|------|------|',
    '| 2026-04-20 14:00 | 2026-04-20 14:02 | execute | Step 5 | sonnet | 120s | ok | - | no | d4 | d4-t5 | 45 |',
    '',
  ].join('\n');
  fs.writeFileSync(logPath, original);
  const res = updateTokenLog(logPath, [{ taskId: 'does-not-exist', inputTokens: 1 }]);
  assert.equal(res.updated, 0);
  assert.equal(fs.readFileSync(logPath, 'utf8'), original);
});

test('readFrames: skips malformed JSON, returns valid frames', () => {
  const dir = mktmp();
  const feedLog = path.join(dir, 'feed.jsonl');
  fs.writeFileSync(feedLog, [
    JSON.stringify({ type: 'task-boundary', state: 'start', taskId: 't-x', workerPid: 1 }),
    '{malformed garbage',
    '',
    JSON.stringify({ type: 'result', usage: { input_tokens: 50, output_tokens: 25 } }),
  ].join('\n'));
  const frames = readFrames(feedLog);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].type, 'task-boundary');
  assert.equal(frames[1].type, 'result');
});

test('runOnce: end-to-end with fixture JSONL', () => {
  const dir = mktmp();
  const feedLog = path.join(dir, 'feed.jsonl');
  const outputPath = path.join(dir, 'metrics', 'token-usage.jsonl');
  const tokenLogPath = path.join(dir, 'token-log.md');

  fs.writeFileSync(feedLog, [
    JSON.stringify({ type: 'task-boundary', state: 'start', taskId: 't-A', workerPid: 9001, domain: 'd1', wave: 2, ts: '2026-04-20T14:00:00.000Z' }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 500, output_tokens: 100 } } }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 300, output_tokens: 60 } } }),
    JSON.stringify({ type: 'result', usage: { input_tokens: 800, output_tokens: 160, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 }, total_cost_usd: 0.0251, num_turns: 3, duration_ms: 9000 }),
    JSON.stringify({ type: 'task-boundary', state: 'done', taskId: 't-A', workerPid: 9001, ts: '2026-04-20T14:05:00.000Z' }),
    JSON.stringify({ type: 'task-boundary', state: 'start', taskId: 't-B', workerPid: 9002, domain: 'd4', wave: 3, ts: '2026-04-20T14:06:00.000Z' }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 200, output_tokens: 40 } } }),
  ].join('\n'));

  fs.writeFileSync(tokenLogPath, [
    '| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |',
    '|----------------|--------------|---------|------|-------|-------------|-------|--------|-----------|--------|------|------|',
    '| 2026-04-20 14:00 | 2026-04-20 14:05 | execute | Step 5 | sonnet | 300s | ok | - | no | d1 | t-A | 45 |',
    '| 2026-04-20 14:06 | 2026-04-20 14:08 | execute | Step 5 | sonnet | 120s | ok | - | no | d4 | t-B | 50 |',
    '',
  ].join('\n'));

  const { rows, logUpdate } = runOnce({
    feedLog, projectDir: dir, outputPath, tokenLogPath, mode: 'once',
  });

  // Two task groups.
  assert.equal(rows.length, 2);
  const a = rows.find(r => r.taskId === 't-A');
  const b = rows.find(r => r.taskId === 't-B');

  // t-A: result frame overwrites assistant sum.
  assert.equal(a.inputTokens, 800);
  assert.equal(a.outputTokens, 160);
  assert.equal(a.cacheReadInputTokens, 50);
  assert.equal(a.cacheCreationInputTokens, 10);
  assert.equal(a.costUSD, 0.0251);
  assert.equal(a.numTurns, 3);
  assert.equal(a.durationMs, 9000);
  assert.equal(a.partial, false);
  assert.equal(a.state, 'done');
  assert.equal(a.domain, 'd1');
  assert.equal(a.wave, 2);
  assert.equal(a.schemaVersion, SCHEMA_VERSION);

  // t-B: no result yet → partial.
  assert.equal(b.inputTokens, 200);
  assert.equal(b.outputTokens, 40);
  assert.equal(b.costUSD, null);
  assert.equal(b.partial, true);
  assert.equal(b.state, null);

  // Token log got both rows rewritten.
  assert.equal(logUpdate.updated, 2);
  const logAfter = fs.readFileSync(tokenLogPath, 'utf8');
  assert.match(logAfter, /in=800 out=160 cr=50 cc=10 \$0\.03/);
  assert.match(logAfter, /in=200 out=40 cr=0 cc=0 —/);

  // Aggregate JSONL written with schema v1.
  const aggContent = fs.readFileSync(outputPath, 'utf8');
  const aggLines = aggContent.split('\n').filter(Boolean);
  assert.equal(aggLines.length, 2);
  for (const l of aggLines) {
    const obj = JSON.parse(l);
    assert.equal(obj.schemaVersion, 1);
  }
});

test('runOnce: missing feed-log returns zero rows', () => {
  const dir = mktmp();
  const feedLog = path.join(dir, 'does-not-exist.jsonl');
  const outputPath = path.join(dir, 'metrics', 'token-usage.jsonl');
  const tokenLogPath = path.join(dir, 'token-log.md');
  const { rows, logUpdate } = runOnce({
    feedLog, projectDir: dir, outputPath, tokenLogPath, mode: 'once',
  });
  assert.equal(rows.length, 0);
  assert.equal(logUpdate.updated, 0);
});
