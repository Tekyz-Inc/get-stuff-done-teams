'use strict';
/**
 * M42 D3 — sidebar tree build + kill handler
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const server = require('../scripts/gsd-t-dashboard-server.js');
const tee = require('../bin/gsd-t-transcript-tee.cjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m42-sidebar-'));
}

// ── Tree build algorithm (extracted from inline HTML script for testing) ─────

function buildTree(spawns) {
  const byId = new Map();
  const roots = [];
  for (const s of spawns) byId.set(s.spawnId, { ...s, children: [] });
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const ts = (a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0);
  roots.sort(ts);
  for (const n of byId.values()) n.children.sort(ts);
  return roots;
}

test('buildTree — flat list becomes list of roots', () => {
  const roots = buildTree([
    { spawnId: 's-a', parentId: null, startedAt: '2026-04-20T10:00:00Z' },
    { spawnId: 's-b', parentId: null, startedAt: '2026-04-20T10:01:00Z' },
  ]);
  assert.equal(roots.length, 2);
  assert.equal(roots[0].spawnId, 's-b'); // newest first
  assert.equal(roots[1].spawnId, 's-a');
});

test('buildTree — parent-child links into tree', () => {
  const roots = buildTree([
    { spawnId: 's-a', parentId: null, startedAt: '2026-04-20T10:00:00Z' },
    { spawnId: 's-a.c1', parentId: 's-a', startedAt: '2026-04-20T10:01:00Z' },
    { spawnId: 's-a.c2', parentId: 's-a', startedAt: '2026-04-20T10:02:00Z' },
  ]);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].spawnId, 's-a');
  assert.equal(roots[0].children.length, 2);
  assert.equal(roots[0].children[0].spawnId, 's-a.c2'); // newest first
});

test('buildTree — orphan whose parent is missing floats to root', () => {
  const roots = buildTree([
    { spawnId: 's-orphan', parentId: 's-gone', startedAt: '2026-04-20T10:00:00Z' },
    { spawnId: 's-root', parentId: null, startedAt: '2026-04-20T10:01:00Z' },
  ]);
  const ids = roots.map((r) => r.spawnId).sort();
  assert.deepEqual(ids, ['s-orphan', 's-root']);
});

test('buildTree — deep nesting (3 levels)', () => {
  const roots = buildTree([
    { spawnId: 'a', parentId: null, startedAt: '2026-04-20T10:00:00Z' },
    { spawnId: 'a.b', parentId: 'a', startedAt: '2026-04-20T10:01:00Z' },
    { spawnId: 'a.b.c', parentId: 'a.b', startedAt: '2026-04-20T10:02:00Z' },
  ]);
  assert.equal(roots[0].children[0].children[0].spawnId, 'a.b.c');
});

// ── Kill handler ─────────────────────────────────────────────────────────────

function makeFakeRes() {
  const res = { _status: 0, _headers: null, _body: '' };
  res.writeHead = (s, h) => { res._status = s; res._headers = h; };
  res.end = (b) => { res._body = b || ''; };
  return res;
}

test('handleTranscriptKill — unknown spawn returns 404', () => {
  const dir = mkTmp();
  const req = { method: 'POST' };
  const res = makeFakeRes();
  server.handleTranscriptKill(req, res, 's-unknown', dir);
  assert.equal(res._status, 404);
});

test('handleTranscriptKill — spawn with no pid returns 409', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir, meta: { command: 'x' } });
  // no workerPid set
  const res = makeFakeRes();
  server.handleTranscriptKill({ method: 'POST' }, res, id, dir);
  assert.equal(res._status, 409);
  assert.match(res._body, /no_pid_recorded/);
});

test('handleTranscriptKill — invalid spawn-id returns 400', () => {
  const dir = mkTmp();
  const res = makeFakeRes();
  server.handleTranscriptKill({ method: 'POST' }, res, '../etc', dir);
  assert.equal(res._status, 400);
});

test('handleTranscriptKill — ESRCH (process gone) returns 200 already_stopped', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir, meta: { command: 'x' } });
  // Write an obviously-dead pid (ultra-high number)
  const idx = server.readTranscriptsIndex(dir);
  idx.spawns[0].workerPid = 999999;
  server.writeTranscriptsIndex(dir, idx);
  const res = makeFakeRes();
  server.handleTranscriptKill({ method: 'POST' }, res, id, dir);
  assert.equal(res._status, 200);
  assert.match(res._body, /already_stopped/);
});

test('handleTranscriptKill — real child process gets SIGTERMed', async () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir, meta: { command: 'x' } });

  // Spawn a sleep child we can SIGTERM
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });
  try {
    // Wait for it to settle
    await new Promise((r) => setTimeout(r, 50));
    const idx = server.readTranscriptsIndex(dir);
    idx.spawns[0].workerPid = child.pid;
    server.writeTranscriptsIndex(dir, idx);

    const res = makeFakeRes();
    server.handleTranscriptKill({ method: 'POST' }, res, id, dir);
    assert.equal(res._status, 200);
    assert.match(res._body, /stopped|already_stopped/);

    // Confirm registry transitioned to stopped
    const idx2 = server.readTranscriptsIndex(dir);
    assert.equal(idx2.spawns[0].status, 'stopped');
    assert.ok(idx2.spawns[0].endedAt);

    // Wait for child to actually die
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
});

// ── End-to-end: POST over HTTP ───────────────────────────────────────────────

function freePort() { return 17500 + Math.floor(Math.random() * 400); }

async function startTestServer(projectDir) {
  const dashHtml = path.join(projectDir, 'dashboard.html');
  fs.writeFileSync(dashHtml, '<html></html>');
  fs.mkdirSync(path.join(projectDir, '.gsd-t', 'events'), { recursive: true });
  const transcriptHtml = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
  const port = freePort();
  const { server: srv } = server.startServer(
    port,
    path.join(projectDir, '.gsd-t', 'events'),
    dashHtml,
    projectDir,
    transcriptHtml,
  );
  await new Promise((r) => setTimeout(r, 20));
  return { port, srv };
}

function postKill(port, id) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/transcript/' + encodeURIComponent(id) + '/kill', method: 'POST' },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('POST /transcript/:id/kill — end-to-end', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const id = tee.allocateSpawnId();
    tee.openTranscript({ spawnId: id, projectDir: dir, meta: { command: 'x' } });
    const idx = server.readTranscriptsIndex(dir);
    idx.spawns[0].workerPid = 999999;
    server.writeTranscriptsIndex(dir, idx);

    const resp = await postKill(port, id);
    assert.equal(resp.status, 200);
    assert.match(resp.body, /already_stopped/);
  } finally {
    srv.close();
  }
});

test('GET /transcript/:id/kill — wrong method returns 404 (only POST matches)', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const resp = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/transcript/s-any/kill`, (res) => {
        res.on('data', () => { /* drain */ });
        res.on('end', () => resolve({ status: res.statusCode }));
      }).on('error', reject);
    });
    assert.equal(resp.status, 404);
  } finally {
    srv.close();
  }
});
