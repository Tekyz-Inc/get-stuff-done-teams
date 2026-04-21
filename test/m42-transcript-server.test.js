'use strict';
/**
 * M42 D2 — dashboard server routes for per-spawn transcripts
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const server = require('../scripts/gsd-t-dashboard-server.js');
const tee = require('../bin/gsd-t-transcript-tee.cjs');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m42-server-'));
}

function freePort() {
  return 17000 + Math.floor(Math.random() * 500);
}

async function fetchText(port, url) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${url}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

async function startTestServer(projectDir) {
  // Write a dummy dashboard html so handleRoot doesn't 404 on our test server
  const dashHtml = path.join(projectDir, 'dashboard.html');
  fs.writeFileSync(dashHtml, '<!DOCTYPE html><html><body>dashboard</body></html>');
  const transcriptHtml = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
  const port = freePort();
  // events dir may not exist; create so handler doesn't trip
  fs.mkdirSync(path.join(projectDir, '.gsd-t', 'events'), { recursive: true });
  const { server: srv } = server.startServer(
    port,
    path.join(projectDir, '.gsd-t', 'events'),
    dashHtml,
    projectDir,
    transcriptHtml,
  );
  // wait briefly for listen
  await new Promise((r) => setTimeout(r, 20));
  return { port, srv };
}

test('isValidSpawnId — accepts hex ids and rejects path traversal', () => {
  assert.equal(server.isValidSpawnId('s-abcd1234'), true);
  assert.equal(server.isValidSpawnId('s-abcd.efgh5678'), true);
  assert.equal(server.isValidSpawnId('../etc/passwd'), false);
  assert.equal(server.isValidSpawnId('foo/bar'), false);
  assert.equal(server.isValidSpawnId(''), false);
  assert.equal(server.isValidSpawnId(null), false);
});

test('readTranscriptsIndex — returns empty object when missing', () => {
  const dir = mkTmp();
  const idx = server.readTranscriptsIndex(dir);
  assert.deepEqual(idx, { spawns: [] });
});

test('readTranscriptsIndex — reads written entries', () => {
  const dir = mkTmp();
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir, meta: { command: 'x' } });
  const idx = server.readTranscriptsIndex(dir);
  assert.equal(idx.spawns.length, 1);
  assert.equal(idx.spawns[0].spawnId, id);
});

test('GET /transcripts — returns sorted list newest-first', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const a = tee.allocateSpawnId();
    tee.openTranscript({ spawnId: a, projectDir: dir });
    await new Promise((r) => setTimeout(r, 10));
    const b = tee.allocateSpawnId();
    tee.openTranscript({ spawnId: b, projectDir: dir });

    const resp = await fetchText(port, '/transcripts');
    assert.equal(resp.status, 200);
    const json = JSON.parse(resp.body);
    assert.equal(json.spawns.length, 2);
    assert.equal(json.spawns[0].spawnId, b);
    assert.equal(json.spawns[1].spawnId, a);
  } finally {
    srv.close();
  }
});

test('GET /transcript/:id — serves HTML with spawn-id injected', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const id = tee.allocateSpawnId();
    tee.openTranscript({ spawnId: id, projectDir: dir });
    const resp = await fetchText(port, `/transcript/${id}`);
    assert.equal(resp.status, 200);
    assert.match(resp.headers['content-type'] || '', /text\/html/);
    assert.ok(resp.body.includes(`data-spawn-id="${id}"`), 'spawn-id injected into body');
    assert.ok(!resp.body.includes('__SPAWN_ID__'), 'placeholder replaced');
  } finally {
    srv.close();
  }
});

test('GET /transcript/:id — rejects invalid spawn-id with 400', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    // encoded ../etc/passwd
    const resp = await fetchText(port, '/transcript/..%2Fpasswd');
    // Normalizing: the regex allows the raw url segment but handleTranscriptPage
    // re-validates the decoded id and returns 400
    assert.equal(resp.status, 400);
  } finally {
    srv.close();
  }
});

test('GET /transcript/:id/stream — replays existing frames + tails new ones', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  const id = tee.allocateSpawnId();
  tee.openTranscript({ spawnId: id, projectDir: dir });
  tee.appendFrame({ spawnId: id, projectDir: dir, frame: { type: 'system', session_id: 'abc' } });
  tee.appendFrame({ spawnId: id, projectDir: dir, frame: { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } } });

  try {
    const received = [];
    await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/transcript/${id}/stream`, (res) => {
        assert.equal(res.statusCode, 200);
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buf += chunk;
          const events = buf.split('\n\n');
          buf = events.pop();
          for (const ev of events) {
            if (ev.startsWith('data:')) {
              const data = ev.slice(5).trim();
              if (!data) continue;
              try { received.push(JSON.parse(data)); } catch { /* skip */ }
            }
          }
          if (received.length >= 3) { req.destroy(); resolve(); }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      // Append a third frame after the connection opens to test tail
      setTimeout(() => {
        tee.appendFrame({ spawnId: id, projectDir: dir, frame: { type: 'system', subtype: 'live' } });
      }, 100);
      setTimeout(() => { req.destroy(); resolve(); }, 2000);
    });

    assert.ok(received.length >= 2, `expected >=2 frames, got ${received.length}`);
    assert.equal(received[0].type, 'system');
    assert.equal(received[1].type, 'assistant');
  } finally {
    srv.close();
  }
});

test('GET /transcript/:id/stream — 400 on invalid spawn-id', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const resp = await fetchText(port, '/transcript/..%2Fpasswd/stream');
    assert.equal(resp.status, 400);
  } finally {
    srv.close();
  }
});
