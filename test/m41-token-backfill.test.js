'use strict';
/**
 * M41 D3 — historical backfill unit tests.
 *
 * Each test seeds a temp project with `.gsd-t/events/` or `.gsd-t/headless-*.log`
 * fixtures and asserts backfill.scanLogs + backfill.matchAndWrite behave per the
 * D3 acceptance criteria.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backfill = require('../bin/gsd-t-token-backfill.cjs');
const capture = require('../bin/gsd-t-token-capture.cjs');

function makeTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m41-bf-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function writeJsonl(file, frames) {
  fs.writeFileSync(file, frames.map((f) => JSON.stringify(f)).join('\n') + '\n');
}

function makeStreamJsonInit(ts, sessionId, model) {
  return { type: 'system', subtype: 'init', ts, session_id: sessionId, model };
}
function makeStreamJsonResult(ts, usage) {
  return { type: 'result', ts, usage };
}

async function collect(asyncIter) {
  const out = [];
  for await (const v of asyncIter) out.push(v);
  return out;
}

// ── Scanner tests ──────────────────────────────────────────────────────

test('scanLogs: yields envelopes from event-stream JSONL', async () => {
  const dir = makeTmp();
  try {
    const file = path.join(dir, '.gsd-t', 'events', '2026-04-01.jsonl');
    writeJsonl(file, [
      { type: 'command_invoked', ts: '2026-04-01T10:00:00.000Z', command: 'gsd-t-execute' },
      { type: 'spawn', ts: '2026-04-01T10:00:30.000Z', data: { command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet' } },
      { type: 'spawn_result', ts: '2026-04-01T10:05:00.000Z', data: {
        command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet',
        startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
        usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 1, total_cost_usd: 0.12 },
      }},
    ]);
    const got = await collect(backfill.scanLogs({ projectDir: dir }));
    assert.equal(got.length, 1);
    assert.equal(got[0].command, 'gsd-t-execute');
    assert.equal(got[0].step, 'Step 4');
    assert.equal(got[0].model, 'sonnet');
    assert.equal(got[0].envelope.input_tokens, 100);
  } finally { cleanup(dir); }
});

test('scanLogs: yields envelopes from headless stream-json log', async () => {
  const dir = makeTmp();
  try {
    const file = path.join(dir, '.gsd-t', 'headless-gsd-t-execute-2026-04-01-10-00-00.log');
    writeJsonl(file, [
      makeStreamJsonInit('2026-04-01T10:00:10.000Z', 'sess-1', 'claude-sonnet-4-6'),
      makeStreamJsonResult('2026-04-01T10:04:50.000Z', { input_tokens: 500, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, total_cost_usd: 0.45 }),
    ]);
    const got = await collect(backfill.scanLogs({ projectDir: dir }));
    assert.equal(got.length, 1);
    assert.equal(got[0].envelope.input_tokens, 500);
    assert.equal(got[0].command, 'gsd-t-execute'); // inferred from filename
  } finally { cleanup(dir); }
});

test('scanLogs: truncated JSONL line is skipped, not thrown', async () => {
  const dir = makeTmp();
  try {
    const file = path.join(dir, '.gsd-t', 'events', '2026-04-02.jsonl');
    fs.writeFileSync(file, '{"type":"result","ts":"2026-04-02T10:00:00Z","usage":{"input_tokens":50,"output_tok\n' + // truncated
                           JSON.stringify({ type: 'result', ts: '2026-04-02T11:00:00Z', usage: { input_tokens: 10, output_tokens: 2 } }) + '\n');
    const got = await collect(backfill.scanLogs({ projectDir: dir }));
    assert.equal(got.length, 1);
    assert.equal(got[0].envelope.input_tokens, 10);
  } finally { cleanup(dir); }
});

test('scanLogs: envelope with missing usage is skipped', async () => {
  const dir = makeTmp();
  try {
    const file = path.join(dir, '.gsd-t', 'events', '2026-04-03.jsonl');
    writeJsonl(file, [
      { type: 'result', ts: '2026-04-03T10:00:00Z' }, // no usage
      { type: 'result', ts: '2026-04-03T11:00:00Z', usage: { input_tokens: 7, output_tokens: 1 } },
    ]);
    const got = await collect(backfill.scanLogs({ projectDir: dir }));
    assert.equal(got.length, 1);
    assert.equal(got[0].envelope.input_tokens, 7);
  } finally { cleanup(dir); }
});

// ── Matcher / writer tests ─────────────────────────────────────────────

function seedTokenLog(dir, rows) {
  const header = '| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Tokens | Notes | Domain | Task | Ctx% |';
  const sep    = '|---|---|---|---|---|---|---|---|---|---|---|';
  const body = rows.map((r) =>
    `| ${r.startedAt} | ${r.endedAt} | ${r.command} | ${r.step} | ${r.model} | ${r.duration} | ${r.tokens || 'N/A'} | ${r.notes || '-'} | ${r.domain || '-'} | ${r.task || '-'} | ${r.ctx || 'N/A'} |`
  ).join('\n');
  const file = path.join(dir, '.gsd-t', 'token-log.md');
  fs.writeFileSync(file, `# GSD-T Token Log\n\n${header}\n${sep}\n${body}\n`);
  return file;
}

test('matchAndWrite: --patch-log updates N/A rows in place', async () => {
  const dir = makeTmp();
  try {
    seedTokenLog(dir, [{
      startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet', duration: '300s', tokens: 'N/A',
    }]);
    const envelopes = [{
      envelope: { input_tokens: 100, output_tokens: 20, total_cost_usd: 0.12 },
      sourceFile: 'x', startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet',
    }];
    const counters = await backfill.matchAndWrite({ projectDir: dir, envelopes, patchLog: true });
    assert.equal(counters.matched, 1);
    assert.equal(counters.patched, 1);
    const text = fs.readFileSync(path.join(dir, '.gsd-t', 'token-log.md'), 'utf8');
    assert.match(text, /in=100 out=20/);
    // Tokens cell is patched; Ctx% column may still read N/A — only the Tokens column matters.
    const dataRow = text.split('\n').find((l) => l.includes('gsd-t-execute'));
    const cols = dataRow.split('|').map((c) => c.trim());
    assert.notEqual(cols[7], 'N/A', 'Tokens cell should be patched');
    assert.notEqual(cols[7], '—');
  } finally { cleanup(dir); }
});

test('matchAndWrite: --dry-run writes nothing', async () => {
  const dir = makeTmp();
  try {
    const logPath = seedTokenLog(dir, [{
      startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet', duration: '300s', tokens: 'N/A',
    }]);
    const before = fs.readFileSync(logPath, 'utf8');
    const envelopes = [{
      envelope: { input_tokens: 100, output_tokens: 20 },
      sourceFile: 'x', startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet',
    }];
    const counters = await backfill.matchAndWrite({ projectDir: dir, envelopes, patchLog: true, dryRun: true });
    assert.equal(counters.parsed, 1);
    assert.equal(counters.matched, 1);
    assert.equal(counters.patched, 0);
    const after = fs.readFileSync(logPath, 'utf8');
    assert.equal(before, after);
    assert.equal(fs.existsSync(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl')), false);
  } finally { cleanup(dir); }
});

test('matchAndWrite: idempotent — running twice yields same JSONL count', async () => {
  const dir = makeTmp();
  try {
    seedTokenLog(dir, [{
      startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet', duration: '300s', tokens: 'N/A',
    }]);
    const env = [{
      envelope: { input_tokens: 100, output_tokens: 20 },
      sourceFile: 'x', startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet',
    }];
    await backfill.matchAndWrite({ projectDir: dir, envelopes: env, patchLog: true });
    await backfill.matchAndWrite({ projectDir: dir, envelopes: env, patchLog: true });
    const jsonl = fs.readFileSync(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), 'utf8');
    const lines = jsonl.split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'second run should not double-append');
  } finally { cleanup(dir); }
});

test('matchAndWrite: unmatched envelope appends backfill-only JSONL with marker note', async () => {
  const dir = makeTmp();
  try {
    // No seeded token-log row at this key
    const env = [{
      envelope: { input_tokens: 42, output_tokens: 7 },
      sourceFile: 'x', startedAt: '2026-05-01 12:00', endedAt: '2026-05-01 12:01',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet',
    }];
    const counters = await backfill.matchAndWrite({ projectDir: dir, envelopes: env, patchLog: true });
    assert.equal(counters.unmatched, 1);
    assert.equal(counters.new, 1);
    const jsonl = fs.readFileSync(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), 'utf8');
    const rec = JSON.parse(jsonl.trim().split('\n')[0]);
    assert.equal(rec.source, 'backfill');
    assert.match(rec.notes, /no original row/);
  } finally { cleanup(dir); }
});

test('matchAndWrite: matched envelope tags JSONL record with source=backfill', async () => {
  const dir = makeTmp();
  try {
    seedTokenLog(dir, [{
      startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet', duration: '300s', tokens: 'N/A',
    }]);
    const env = [{
      envelope: { input_tokens: 100, output_tokens: 20 },
      sourceFile: 'x', startedAt: '2026-04-01 10:00', endedAt: '2026-04-01 10:05',
      command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet',
    }];
    await backfill.matchAndWrite({ projectDir: dir, envelopes: env, patchLog: true });
    const jsonl = fs.readFileSync(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'), 'utf8');
    const rec = JSON.parse(jsonl.trim().split('\n')[0]);
    assert.equal(rec.source, 'backfill');
    // Backfill writes through recordSpawnRow → uses current SCHEMA_VERSION (v2 is additive over v1)
    assert.equal(rec.schemaVersion, capture.SCHEMA_VERSION);
    assert.equal(rec.inputTokens, 100);
    assert.equal(rec.outputTokens, 20);
  } finally { cleanup(dir); }
});

// ── CLI integration ────────────────────────────────────────────────────

test('CLI: node bin/gsd-t.js backfill-tokens --dry-run --project-dir {fixture} exits 0', () => {
  const dir = makeTmp();
  try {
    const file = path.join(dir, '.gsd-t', 'events', '2026-04-10.jsonl');
    writeJsonl(file, [
      { type: 'spawn_result', ts: '2026-04-10T10:00:00Z', data: {
        command: 'gsd-t-execute', step: 'Step 4', model: 'sonnet',
        startedAt: '2026-04-10 10:00', endedAt: '2026-04-10 10:05',
        usage: { input_tokens: 9, output_tokens: 3 },
      }},
    ]);
    const cli = path.join(__dirname, '..', 'bin', 'gsd-t.js');
    const res = spawnSync(process.execPath, [cli, 'backfill-tokens', '--dry-run', '--project-dir', dir], {
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    assert.match(res.stdout, /Scanned:/);
    assert.match(res.stdout, /Parsed: 1 envelopes/);
  } finally { cleanup(dir); }
});

test('CLI: unknown arg → exit 2', () => {
  const cli = path.join(__dirname, '..', 'bin', 'gsd-t.js');
  const res = spawnSync(process.execPath, [cli, 'backfill-tokens', '--not-a-real-flag'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});
