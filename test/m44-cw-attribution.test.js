'use strict';
/**
 * M44 D7 — per-CW attribution: cw_id pass-through + calibration hook
 *
 * Two surfaces under test:
 *   1. bin/gsd-t-token-capture.cjs — optional cw_id field on the
 *      JSONL row writer, fully backward-compatible.
 *   2. scripts/gsd-t-calibration-hook.js — SessionStart handler that
 *      appends a compaction_post_spawn calibration event whenever a
 *      compact event correlates with an active unattended spawn.
 *
 * Contracts:
 *   - .gsd-t/contracts/metrics-schema-contract.md (v2.1.0)
 *   - .gsd-t/contracts/compaction-events-contract.md (v1.1.0)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const capture = require('../bin/gsd-t-token-capture.cjs');
const calibration = require('../scripts/gsd-t-calibration-hook.js');

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m44-d7-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ── recordSpawnRow: cw_id present ──────────────────────────────────────

test('recordSpawnRow: cw_id present → field serialized into JSONL row', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'gsd-t-execute',
      step: 'Step 4',
      model: 'sonnet',
      startedAt: '2026-04-22 10:00',
      endedAt: '2026-04-22 10:01',
      usage: { input_tokens: 100, output_tokens: 50, total_cost_usd: 0.02 },
      domain: 'd7',
      task: 'T-2',
      cw_id: 'spawn-abc-123',
    });
    const rows = readJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].cw_id, 'spawn-abc-123');
    // existing fields still present
    assert.equal(rows[0].command, 'gsd-t-execute');
    assert.equal(rows[0].inputTokens, 100);
    assert.equal(rows[0].domain, 'd7');
    assert.equal(rows[0].task, 'T-2');
  } finally { cleanup(dir); }
});

test('recordSpawnRow: cw_id coerced to string (numeric input → string output)', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'c', step: 'S1', model: 'haiku',
      startedAt: '2026-04-22 10:00', endedAt: '2026-04-22 10:01',
      cw_id: 42,
    });
    const rows = readJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows[0].cw_id, '42');
    assert.equal(typeof rows[0].cw_id, 'string');
  } finally { cleanup(dir); }
});

// ── recordSpawnRow: cw_id absent (backward-compat) ─────────────────────

test('recordSpawnRow: cw_id absent → field OMITTED from JSONL row (not null, not "")', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'gsd-t-execute',
      step: 'Step 4',
      model: 'sonnet',
      startedAt: '2026-04-22 10:00',
      endedAt: '2026-04-22 10:01',
      usage: { input_tokens: 100, output_tokens: 50 },
      domain: 'd7', task: 'T-2',
      // no cw_id
    });
    const rows = readJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 1);
    assert.ok(!('cw_id' in rows[0]), 'cw_id key must be absent, not null');
    // other v2 fields likewise absent (no opt-in by caller)
    assert.equal(rows[0].command, 'gsd-t-execute');
    assert.equal(rows[0].inputTokens, 100);
  } finally { cleanup(dir); }
});

test('recordSpawnRow: cw_id null → field OMITTED', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'c', step: 'S1', model: 'haiku',
      startedAt: '2026-04-22 10:00', endedAt: '2026-04-22 10:01',
      cw_id: null,
    });
    const rows = readJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.ok(!('cw_id' in rows[0]));
  } finally { cleanup(dir); }
});

test('recordSpawnRow: cw_id "" → field OMITTED', () => {
  const dir = makeTmpProject();
  try {
    capture.recordSpawnRow({
      projectDir: dir,
      command: 'c', step: 'S1', model: 'haiku',
      startedAt: '2026-04-22 10:00', endedAt: '2026-04-22 10:01',
      cw_id: '',
    });
    const rows = readJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.ok(!('cw_id' in rows[0]));
  } finally { cleanup(dir); }
});

// ── captureSpawn: cw_id forwarded ──────────────────────────────────────

test('captureSpawn: forwards cw_id to recordSpawnRow', async () => {
  const dir = makeTmpProject();
  try {
    await capture.captureSpawn({
      command: 'gsd-t-wave',
      step: 'Step 1',
      model: 'sonnet',
      description: 'cw_id forwarding',
      projectDir: dir,
      spawnFn: async () => ({ usage: { input_tokens: 5, output_tokens: 2 } }),
      cw_id: 'spawn-xyz-789',
    });
    const rows = readJsonl(path.join(dir, '.gsd-t', 'metrics', 'token-usage.jsonl'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].cw_id, 'spawn-xyz-789');
  } finally { cleanup(dir); }
});

// ── _buildJsonlRecord: direct serialization checks ─────────────────────

test('_buildJsonlRecord: cw_id branch matches existing session_id pattern', () => {
  const baseOpts = {
    command: 'c', step: 'S', model: 'm',
    startedAt: '2026-04-22 10:00', endedAt: '2026-04-22 10:01',
    durationSec: 60, usage: undefined,
  };
  const without = capture._buildJsonlRecord(baseOpts);
  assert.ok(!('cw_id' in without));

  const withCw = capture._buildJsonlRecord({ ...baseOpts, cw_id: 'cw-1' });
  assert.equal(withCw.cw_id, 'cw-1');

  const nullCw = capture._buildJsonlRecord({ ...baseOpts, cw_id: null });
  assert.ok(!('cw_id' in nullCw));

  const undefinedCw = capture._buildJsonlRecord({ ...baseOpts, cw_id: undefined });
  assert.ok(!('cw_id' in undefinedCw));
});

// ── Calibration hook: with active spawn ────────────────────────────────

function writeUnattendedState(dir, state) {
  const unattendedDir = path.join(dir, '.gsd-t', '.unattended');
  fs.mkdirSync(unattendedDir, { recursive: true });
  fs.writeFileSync(path.join(unattendedDir, 'state.json'), JSON.stringify(state));
}

test('calibration hook: source=compact + active spawn → calibration row written', () => {
  const dir = makeTmpProject();
  try {
    writeUnattendedState(dir, {
      version: '1.4.0',
      sessionId: 'unattended-2026-04-22-test',
      status: 'running',
      milestone: 'M44',
      iter: 1,
      activeTask: 'M44-D7-T3',
      estimatedCwPct: 0.85,
    });
    const payload = JSON.stringify({
      source: 'compact',
      cwd: dir,
      session_id: 'new-session-after-compact',
      input_tokens: 194000,
    });
    const written = calibration.handle(payload, { now: new Date('2026-04-22T12:00:00Z') });
    assert.ok(written, 'should have written a row');
    assert.equal(written.type, 'compaction_post_spawn');
    assert.equal(written.schemaVersion, 1);
    assert.equal(written.cw_id, 'unattended-2026-04-22-test');
    assert.equal(written.spawn_id, 'unattended-2026-04-22-test');
    assert.equal(written.task_id, 'M44-D7-T3');
    assert.equal(written.estimatedCwPct, 0.85);
    assert.ok(written.actualCwPct > 0.95 && written.actualCwPct < 1.0,
      `actualCwPct ${written.actualCwPct} should be ~0.97 for 194000/200000`);

    // and on disk
    const rows = readJsonl(path.join(dir, '.gsd-t', 'metrics', 'compactions.jsonl'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].type, 'compaction_post_spawn');
    assert.equal(rows[0].cw_id, 'unattended-2026-04-22-test');
  } finally { cleanup(dir); }
});

test('calibration hook: payload.input_tokens missing → falls back to compactMetadata.preTokens', () => {
  const dir = makeTmpProject();
  try {
    writeUnattendedState(dir, {
      sessionId: 's-1', status: 'running', activeTask: 'T-1',
    });
    const payload = JSON.stringify({
      source: 'compact',
      cwd: dir,
      compactMetadata: { preTokens: 150000 },
    });
    const written = calibration.handle(payload, { now: new Date('2026-04-22T12:00:00Z') });
    assert.ok(written);
    assert.ok(written.actualCwPct > 0.74 && written.actualCwPct < 0.76);
  } finally { cleanup(dir); }
});

test('calibration hook: cwCeilingTokens override applied', () => {
  const dir = makeTmpProject();
  try {
    writeUnattendedState(dir, {
      sessionId: 's-1', status: 'running',
      cwCeilingTokens: 100000,
    });
    const payload = JSON.stringify({
      source: 'compact', cwd: dir,
      input_tokens: 95000,
    });
    const written = calibration.handle(payload);
    assert.ok(written);
    assert.equal(written.actualCwPct, 0.95);
  } finally { cleanup(dir); }
});

// ── Calibration hook: silent no-op cases ───────────────────────────────

test('calibration hook: no .gsd-t/.unattended/state.json → silent no-op, NO row written', () => {
  const dir = makeTmpProject();
  try {
    // no state.json file
    const payload = JSON.stringify({
      source: 'compact',
      cwd: dir,
      input_tokens: 190000,
    });
    const written = calibration.handle(payload);
    assert.equal(written, null);
    const compactionsPath = path.join(dir, '.gsd-t', 'metrics', 'compactions.jsonl');
    assert.equal(fs.existsSync(compactionsPath), false,
      'no compactions.jsonl should be created when no active spawn');
  } finally { cleanup(dir); }
});

test('calibration hook: state.status !== "running" → silent no-op', () => {
  const dir = makeTmpProject();
  try {
    writeUnattendedState(dir, { sessionId: 's-1', status: 'stopped' });
    const payload = JSON.stringify({
      source: 'compact', cwd: dir, input_tokens: 190000,
    });
    const written = calibration.handle(payload);
    assert.equal(written, null);
    assert.equal(
      fs.existsSync(path.join(dir, '.gsd-t', 'metrics', 'compactions.jsonl')),
      false,
    );
  } finally { cleanup(dir); }
});

test('calibration hook: state.json malformed → silent no-op, no throw', () => {
  const dir = makeTmpProject();
  try {
    const unattendedDir = path.join(dir, '.gsd-t', '.unattended');
    fs.mkdirSync(unattendedDir, { recursive: true });
    fs.writeFileSync(path.join(unattendedDir, 'state.json'), '{ this is not json');
    const payload = JSON.stringify({
      source: 'compact', cwd: dir, input_tokens: 190000,
    });
    const written = calibration.handle(payload);
    assert.equal(written, null);
  } finally { cleanup(dir); }
});

test('calibration hook: source !== "compact" → silent no-op even with active spawn', () => {
  const dir = makeTmpProject();
  try {
    writeUnattendedState(dir, { sessionId: 's-1', status: 'running' });
    for (const source of ['startup', 'resume', undefined]) {
      const payload = JSON.stringify({ source, cwd: dir, input_tokens: 190000 });
      const written = calibration.handle(payload);
      assert.equal(written, null, `source=${source} should be no-op`);
    }
    assert.equal(
      fs.existsSync(path.join(dir, '.gsd-t', 'metrics', 'compactions.jsonl')),
      false,
    );
  } finally { cleanup(dir); }
});

test('calibration hook: input_tokens not derivable → silent no-op', () => {
  const dir = makeTmpProject();
  try {
    writeUnattendedState(dir, { sessionId: 's-1', status: 'running' });
    const payload = JSON.stringify({ source: 'compact', cwd: dir });
    const written = calibration.handle(payload);
    assert.equal(written, null);
  } finally { cleanup(dir); }
});

test('calibration hook: empty / non-json stdin → silent no-op', () => {
  assert.equal(calibration.handle(''), null);
  assert.equal(calibration.handle('not json'), null);
  assert.equal(calibration.handle('null'), null);
  assert.equal(calibration.handle('true'), null);
  assert.equal(calibration.handle('123'), null);
});

test('calibration hook: payload.cwd non-absolute → silent no-op', () => {
  const dir = makeTmpProject();
  try {
    writeUnattendedState(dir, { sessionId: 's-1', status: 'running' });
    const payload = JSON.stringify({
      source: 'compact',
      cwd: 'relative/path', // invalid
      input_tokens: 190000,
    });
    const written = calibration.handle(payload);
    assert.equal(written, null);
  } finally { cleanup(dir); }
});

// ── Coexistence: calibration hook + detector both can write ────────────

test('calibration row appends alongside existing v1.0.0 compact rows in same sink', () => {
  const dir = makeTmpProject();
  try {
    // Pre-populate with a v1.0.0 detector-style row
    const metricsDir = path.join(dir, '.gsd-t', 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    const existingRow = {
      ts: '2026-04-22T11:00:00.000Z',
      schemaVersion: 1,
      session_id: 's-old',
      prior_session_id: null,
      source: 'compact',
      cwd: dir,
      hook: 'SessionStart',
    };
    fs.writeFileSync(path.join(metricsDir, 'compactions.jsonl'),
      JSON.stringify(existingRow) + '\n');

    writeUnattendedState(dir, {
      sessionId: 'spawn-new', status: 'running', activeTask: 'T-X',
    });
    calibration.handle(JSON.stringify({
      source: 'compact', cwd: dir, input_tokens: 180000,
    }));

    const rows = readJsonl(path.join(metricsDir, 'compactions.jsonl'));
    assert.equal(rows.length, 2);
    // v1.0.0 row is unchanged
    assert.equal(rows[0].source, 'compact');
    assert.equal(rows[0].session_id, 's-old');
    assert.ok(!('type' in rows[0]) || rows[0].type === 'compact');
    // calibration row added
    assert.equal(rows[1].type, 'compaction_post_spawn');
    assert.equal(rows[1].cw_id, 'spawn-new');
  } finally { cleanup(dir); }
});

// ── Zero external deps ─────────────────────────────────────────────────

test('calibration hook: zero external npm deps (only built-ins or local siblings)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'gsd-t-calibration-hook.js'),
    'utf8',
  );
  const requires = [];
  const re = /require\(['"]([^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(src)) !== null) requires.push(m[1]);
  const BUILTINS = new Set([
    'fs', 'path', 'os', 'util', 'events', 'stream', 'buffer', 'child_process',
  ]);
  const LOCAL_OK = (p) => p.startsWith('.') || p.startsWith('/');
  for (const r of requires) {
    assert.ok(BUILTINS.has(r) || LOCAL_OK(r), `unexpected external require: ${r}`);
  }
});
