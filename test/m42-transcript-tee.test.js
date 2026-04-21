'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tee = require('../bin/gsd-t-transcript-tee.cjs');

function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m42-tee-'));
  return dir;
}

test('allocateSpawnId — root gets s- prefix', () => {
  const id = tee.allocateSpawnId();
  assert.match(id, /^s-[0-9a-f]{8}$/);
});

test('allocateSpawnId — child is parent.child', () => {
  const root = tee.allocateSpawnId();
  const child = tee.allocateSpawnId({ parentId: root });
  assert.ok(child.startsWith(root + '.'));
  const suffix = child.slice(root.length + 1);
  assert.match(suffix, /^[0-9a-f]{8}$/);
});

test('openTranscript — creates ndjson + index entry', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  const r = tee.openTranscript({
    spawnId: id,
    projectDir: dir,
    meta: { command: 'gsd-t-execute', description: 'domain: auth', model: 'sonnet', workerPid: 12345 },
  });
  assert.equal(r.spawnId, id);
  assert.ok(fs.existsSync(r.transcriptPath));
  const list = tee.listTranscripts(dir);
  assert.equal(list.length, 1);
  assert.equal(list[0].spawnId, id);
  assert.equal(list[0].status, 'running');
  assert.equal(list[0].command, 'gsd-t-execute');
  assert.equal(list[0].workerPid, 12345);
});

test('appendFrame — object round-trips through ndjson', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir });
  tee.appendFrame({ spawnId: id, projectDir: dir, frame: { type: 'assistant', message: { content: 'hello' } } });
  const ndjson = fs.readFileSync(path.join(dir, '.gsd-t', 'transcripts', `${id}.ndjson`), 'utf8');
  const lines = ndjson.trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.type, 'assistant');
});

test('appendFrame — string raw line wrapped as {type:"raw"} when invalid JSON', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir });
  tee.appendFrame({ spawnId: id, projectDir: dir, frame: 'not json' });
  const ndjson = fs.readFileSync(path.join(dir, '.gsd-t', 'transcripts', `${id}.ndjson`), 'utf8');
  const parsed = JSON.parse(ndjson.trim());
  assert.equal(parsed.type, 'raw');
  assert.equal(parsed.line, 'not json');
});

test('appendFrame — valid JSON string passes through verbatim', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir });
  const payload = '{"type":"system","session_id":"abc"}';
  tee.appendFrame({ spawnId: id, projectDir: dir, frame: payload });
  const ndjson = fs.readFileSync(path.join(dir, '.gsd-t', 'transcripts', `${id}.ndjson`), 'utf8');
  assert.equal(ndjson.trim(), payload);
});

test('closeTranscript — updates endedAt + status', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir });
  const ok = tee.closeTranscript({ spawnId: id, projectDir: dir, status: 'done' });
  assert.equal(ok, true);
  const meta = tee.readTranscriptMeta(dir, id);
  assert.equal(meta.status, 'done');
  assert.ok(meta.endedAt);
});

test('closeTranscript — returns false for unknown spawn', () => {
  const dir = mkTmp();
  assert.equal(tee.closeTranscript({ spawnId: 'nope', projectDir: dir }), false);
});

test('listTranscripts — sorted newest-first', async () => {
  const dir = mkTmp();
  const a = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: a, projectDir: dir });
  await new Promise((r) => setTimeout(r, 5));
  const b = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: b, projectDir: dir });
  const list = tee.listTranscripts(dir);
  assert.equal(list[0].spawnId, b);
  assert.equal(list[1].spawnId, a);
});

test('makeStreamTee — splits chunks at newlines, preserves each line', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir });
  const t = tee.makeStreamTee({ spawnId: id, projectDir: dir });
  t.onChunk('{"type":"system"}\n{"type":"assis');
  t.onChunk('tant"}\n');
  const ndjson = fs.readFileSync(path.join(dir, '.gsd-t', 'transcripts', `${id}.ndjson`), 'utf8');
  const lines = ndjson.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).type, 'system');
  assert.equal(JSON.parse(lines[1]).type, 'assistant');
});

test('makeStreamTee — flush writes stranded tail as raw', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir });
  const t = tee.makeStreamTee({ spawnId: id, projectDir: dir });
  t.onChunk('partial line no newline');
  t.flush();
  const ndjson = fs.readFileSync(path.join(dir, '.gsd-t', 'transcripts', `${id}.ndjson`), 'utf8');
  const parsed = JSON.parse(ndjson.trim());
  assert.equal(parsed.type, 'raw');
  assert.equal(parsed.line, 'partial line no newline');
});

test('index.json — survives concurrent open of parent + child', () => {
  const dir = mkTmp();
  const parent = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: parent, projectDir: dir, meta: { command: 'gsd-t-unattended' } });
  const c1 = tee.allocateSpawnId({ parentId: parent });
  const c2 = tee.allocateSpawnId({ parentId: parent });
  tee.openTranscript({ spawnId: c1, projectDir: dir, meta: { parentId: parent, command: 'worker-iter-1' } });
  tee.openTranscript({ spawnId: c2, projectDir: dir, meta: { parentId: parent, command: 'worker-iter-2' } });
  const list = tee.listTranscripts(dir);
  assert.equal(list.length, 3);
  const children = list.filter((s) => s.parentId === parent);
  assert.equal(children.length, 2);
});

test('appendFrame without openTranscript still writes the ndjson', () => {
  const dir = mkTmp();
  const id = 's-fallback';
  tee.appendFrame({ spawnId: id, projectDir: dir, frame: { type: 'system' } });
  const p = path.join(dir, '.gsd-t', 'transcripts', `${id}.ndjson`);
  assert.ok(fs.existsSync(p));
});

test('openTranscript — idempotent on same spawnId', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir, meta: { command: 'a' } });
  tee.openTranscript({ spawnId: id, projectDir: dir, meta: { command: 'b' } });
  const list = tee.listTranscripts(dir);
  assert.equal(list.length, 1);
  assert.equal(list[0].command, 'b');
});
