'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const capture = require('../bin/gsd-t-token-capture.cjs');

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m41-cap-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ── _parseUsageFromResult ──────────────────────────────────────────────

test('_parseUsageFromResult: bare {usage} shape', () => {
  const u = capture._parseUsageFromResult({ usage: { input_tokens: 10, output_tokens: 5 } });
  assert.deepEqual(u, { input_tokens: 10, output_tokens: 5 });
});

test('_parseUsageFromResult: wrapped {result: {usage}} shape', () => {
  const u = capture._parseUsageFromResult({ result: { usage: { input_tokens: 7, output_tokens: 3 } } });
  assert.deepEqual(u, { input_tokens: 7, output_tokens: 3 });
});

test('_parseUsageFromResult: {content, usage} shape (bare variant)', () => {
  const u = capture._parseUsageFromResult({ content: [{type:'text'}], usage: { input_tokens: 1 } });
  assert.deepEqual(u, { input_tokens: 1 });
});

test('_parseUsageFromResult: missing usage returns undefined', () => {
  assert.equal(capture._parseUsageFromResult({ content: [] }), undefined);
  assert.equal(capture._parseUsageFromResult({}), undefined);
  assert.equal(capture._parseUsageFromResult(null), undefined);
  assert.equal(capture._parseUsageFromResult(undefined), undefined);
  assert.equal(capture._parseUsageFromResult('string'), undefined);
});

// ── _formatTokensCell ──────────────────────────────────────────────────

test('_formatTokensCell: usage present with cost', () => {
  const cell = capture._formatTokensCell({
    input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 10, total_cost_usd: 0.42
  });
  assert.equal(cell, 'in=100 out=50 cr=20 cc=10 $0.42');
});

test('_formatTokensCell: missing usage → "—"', () => {
  assert.equal(capture._formatTokensCell(undefined), '—');
  assert.equal(capture._formatTokensCell(null), '—');
});

test('_formatTokensCell: never writes "0" for missing usage', () => {
  const cell = capture._formatTokensCell(undefined);
  assert.notEqual(cell, '0');
  assert.notEqual(cell, 'N/A');
});

// ── captureSpawn: happy path ───────────────────────────────────────────

test('captureSpawn: happy path calls spawnFn once and records usage', async () => {
  const dir = makeTmpProject();
  try {
    let callCount = 0;
    const fakeResult = { usage: { input_tokens: 42, output_tokens: 17, cache_read_input_tokens: 5, cache_creation_input_tokens: 2, total_cost_usd: 0.01 } };
    const out = await capture.captureSpawn({
      command: 'test-cmd',
      step: 'Step 1',
      model: 'haiku',
      description: 'test spawn',
      projectDir: dir,
      spawnFn: async () => { callCount++; return fakeResult; },
    });
    assert.equal(callCount, 1);
    assert.equal(out.result, fakeResult);
    assert.deepEqual(out.usage, fakeResult.usage);
    assert.ok(out.rowWritten.tokenLogPath);
    assert.ok(fs.existsSync(out.rowWritten.tokenLogPath));
    const log = fs.readFileSync(out.rowWritten.tokenLogPath, 'utf8');
    assert.match(log, /in=42 out=17 cr=5 cc=2 \$0\.01/);
  } finally { cleanup(dir); }
});

test('captureSpawn: missing usage path writes "—" and returns usage: undefined', async () => {
  const dir = makeTmpProject();
  try {
    const out = await capture.captureSpawn({
      command: 'test-cmd',
      step: 'Step 1',
      model: 'sonnet',
      description: 'no-usage test',
      projectDir: dir,
      spawnFn: async () => ({ content: [{type:'text',text:'hi'}] }),
    });
    assert.equal(out.usage, undefined);
    const log = fs.readFileSync(out.rowWritten.tokenLogPath, 'utf8');
    assert.match(log, /\|\s*—\s*\|/);
    assert.doesNotMatch(log, /\|\s*0\s*\|\s*-\s*\|/);
    assert.doesNotMatch(log, /N\/A\s*\|.*test-cmd/);
  } finally { cleanup(dir); }
});

test('captureSpawn: spawnFn throws → row written with spawn_error note, error re-thrown', async () => {
  const dir = makeTmpProject();
  try {
    const boom = new Error('boom');
    await assert.rejects(
      capture.captureSpawn({
        command: 'test-cmd',
        step: 'Step 1',
        model: 'opus',
        description: 'error test',
        projectDir: dir,
        spawnFn: async () => { throw boom; },
      }),
      /boom/
    );
    const log = fs.readFileSync(path.join(dir, '.gsd-t', 'token-log.md'), 'utf8');
    assert.match(log, /spawn_error: boom/);
    assert.match(log, /\|\s*—\s*\|/);
  } finally { cleanup(dir); }
});

// ── recordSpawnRow: header management ──────────────────────────────────

test('recordSpawnRow: creates new token-log.md with canonical header when missing', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'c', step: 'S1', model: 'm',
      startedAt: '2026-04-20 12:00', endedAt: '2026-04-20 12:01',
    });
    const txt = fs.readFileSync(path.join(dir, '.gsd-t', 'token-log.md'), 'utf8');
    assert.ok(txt.includes(capture.NEW_HEADER), 'new header present');
    assert.ok(txt.includes(capture.NEW_SEP), 'separator present');
  } finally { cleanup(dir); }
});

test('recordSpawnRow: upgrades old header in place, preserves existing rows', () => {
  const dir = makeTmpProject();
  try {
    const oldLog = `# GSD-T Token Log\n\n| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |\n|---|---|---|---|---|---|---|---|---|---|\n| 2026-04-19 10:00 | 2026-04-19 10:05 | old-cmd | Step 1 | haiku | 300s | preserved | d | t | 42 |\n`;
    fs.writeFileSync(path.join(dir, '.gsd-t', 'token-log.md'), oldLog);

    capture.recordSpawnRow({
      projectDir: dir,
      command: 'new-cmd', step: 'S1', model: 'sonnet',
      startedAt: '2026-04-20 12:00', endedAt: '2026-04-20 12:01',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const txt = fs.readFileSync(path.join(dir, '.gsd-t', 'token-log.md'), 'utf8');
    assert.ok(txt.includes(capture.NEW_HEADER), 'header upgraded');
    assert.match(txt, /old-cmd.*preserved/, 'old row preserved');
    assert.match(txt, /new-cmd/, 'new row appended');
    assert.match(txt, /in=10 out=5/, 'new tokens cell correct');
  } finally { cleanup(dir); }
});

test('recordSpawnRow: appends JSONL record with schemaVersion=1', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'c', step: 'S1', model: 'haiku',
      startedAt: '2026-04-20 12:00', endedAt: '2026-04-20 12:01',
      usage: { input_tokens: 10, output_tokens: 5, total_cost_usd: 0.01 },
      domain: 'd1', task: 'T1',
    });
    const jsonl = fs.readFileSync(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), 'utf8');
    const line = jsonl.trim().split('\n')[0];
    const rec = JSON.parse(line);
    assert.equal(rec.schemaVersion, 1);
    assert.equal(rec.command, 'c');
    assert.equal(rec.inputTokens, 10);
    assert.equal(rec.outputTokens, 5);
    assert.equal(rec.costUSD, 0.01);
    assert.equal(rec.source, 'live');
    assert.equal(rec.domain, 'd1');
    assert.equal(rec.task, 'T1');
  } finally { cleanup(dir); }
});

// ── Concurrent atomic append ───────────────────────────────────────────

test('recordSpawnRow: 3 parallel calls append 3 distinct rows, none interleaved', async () => {
  const dir = makeTmpProject();
  try {
    const calls = [0,1,2].map(i => Promise.resolve().then(() => capture.recordSpawnRow({
      projectDir: dir,
      command: `c${i}`, step: `S${i}`, model: 'haiku',
      startedAt: `2026-04-20 12:0${i}`, endedAt: `2026-04-20 12:0${i}`,
      usage: { input_tokens: i, output_tokens: i },
    })));
    await Promise.all(calls);
    const txt = fs.readFileSync(path.join(dir, '.gsd-t', 'token-log.md'), 'utf8');
    const rows = txt.split('\n').filter(l => /^\| 2026-04-20/.test(l));
    assert.equal(rows.length, 3);
    // Each row must be a single well-formed pipe-delimited line (no interleaved chars)
    for (const r of rows) {
      const cells = r.split('|').length - 1;
      assert.equal(cells, 12, `row has expected column count: ${r}`);
    }
  } finally { cleanup(dir); }
});

// ── Zero-deps verification ─────────────────────────────────────────────

test('zero external npm deps: source only requires node built-ins or local siblings', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'gsd-t-token-capture.cjs'), 'utf8');
  const requires = [];
  const re = /require\(['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(src)) !== null) requires.push(m[1]);
  const BUILTINS = new Set(['fs', 'path', 'os', 'util', 'events', 'stream', 'buffer', 'child_process']);
  const LOCAL_OK = (p) => p.startsWith('.') || p.startsWith('/');
  for (const r of requires) {
    assert.ok(BUILTINS.has(r) || LOCAL_OK(r), `unexpected external require: ${r}`);
  }
});
