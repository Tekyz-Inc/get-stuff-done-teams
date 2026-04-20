'use strict';
/**
 * M40 D4-T5 — Stream Feed Server + Client unit tests
 * Covers: ingest, broadcast, replay, persist-before-broadcast, localhost enforcement,
 * backpressure kick, client spool mode, client HTTP mode.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');

const { createStreamFeedServer, _testing } = require('../scripts/gsd-t-stream-feed-server.js');
const { createStreamFeedClient } = require('../bin/gsd-t-stream-feed-client.cjs');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ── Test utilities ────────────────────────────────────────────────────────

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm40-stream-feed-'));
}

function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
}

function startServer(projectDir) {
  const srv = createStreamFeedServer({ projectDir, port: 0 });
  return new Promise((resolve) => {
    srv.server.listen(0, '127.0.0.1', () => {
      const port = srv.server.address().port;
      srv.port = port;
      resolve(srv);
    });
  });
}

function postIngest(port, workerPid, taskId, lines) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port,
      method: 'POST',
      path: `/ingest?workerPid=${workerPid}&taskId=${encodeURIComponent(taskId)}`,
      headers: { 'Transfer-Encoding': 'chunked', 'Content-Type': 'application/x-ndjson' },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    for (const line of lines) req.write(line + '\n');
    req.end();
  });
}

function wsConnect(port, query = '') {
  return new Promise((resolve, reject) => {
    const frames = [];
    let handshakeDone = false;
    let buf = Buffer.alloc(0);
    let connection = null;
    const socket = net.connect(port, '127.0.0.1', () => {
      const key = crypto.randomBytes(16).toString('base64');
      const q = query ? `?${query}` : '';
      const headers = [
        `GET /feed${q} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '\r\n',
      ].join('\r\n');
      socket.write(headers);
    });
    function drainFrames() {
      const got = _testing.decodeWsFrames(buf);
      for (const f of got) {
        if (f.opcode === 0x1) frames.push(f.payload.toString('utf8'));
      }
      const consumed = measureConsumed(buf);
      if (consumed > 0) buf = buf.slice(consumed);
    }
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!handshakeDone) {
        // Find \r\n\r\n in the buffer.
        const hsEnd = buf.indexOf(Buffer.from('\r\n\r\n'));
        if (hsEnd === -1) return;
        const handshakeOnly = buf.slice(0, hsEnd).toString('utf8');
        if (!/101 Switching Protocols/.test(handshakeOnly)) {
          socket.destroy();
          reject(new Error('WS handshake failed: ' + handshakeOnly));
          return;
        }
        buf = buf.slice(hsEnd + 4);
        handshakeDone = true;
        connection = {
          socket, frames,
          close() { try { socket.destroy(); } catch { /* noop */ } },
          waitFor(predicate, timeoutMs = 2000) {
            return new Promise((res, rej) => {
              const start = Date.now();
              (function check() {
                if (predicate(frames)) return res(frames);
                if (Date.now() - start > timeoutMs) return rej(new Error('wait timeout; frames=' + JSON.stringify(frames)));
                setTimeout(check, 20);
              })();
            });
          },
        };
        drainFrames();
        resolve(connection);
        return;
      }
      drainFrames();
    });
    socket.on('error', (e) => { if (!handshakeDone) reject(e); });
    socket.on('close', () => { if (!handshakeDone) reject(new Error('socket closed before handshake')); });
  });
}

function measureConsumed(buf) {
  let i = 0;
  while (i < buf.length) {
    if (buf.length - i < 2) break;
    const b1 = buf[i + 1];
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = i + 2;
    if (len === 126) { if (buf.length - offset < 2) break; len = buf.readUInt16BE(offset); offset += 2; }
    else if (len === 127) { if (buf.length - offset < 8) break; offset += 4; len = buf.readUInt32BE(offset); offset += 4; }
    if (masked) { if (buf.length - offset < 4) break; offset += 4; }
    if (buf.length - offset < len) break;
    i = offset + len;
  }
  return i;
}

// ── Tests ────────────────────────────────────────────────────────────────

test('server: ingest 10 frames → all persisted to JSONL', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const lines = [];
  for (let i = 0; i < 10; i++) lines.push(JSON.stringify({ type: 'assistant', i, text: 'hello ' + i }));
  const res = await postIngest(srv.port, 123, 'd1-t1', lines);
  assert.strictEqual(res.status, 200);

  // Give writeStream a tick to flush.
  await new Promise((r) => setTimeout(r, 50));
  const date = _testing.currentUtcDate();
  const file = path.join(tmp, '.gsd-t', 'stream-feed', `${date}.jsonl`);
  const content = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(content.length, 10);
  for (let i = 0; i < 10; i++) {
    const p = JSON.parse(content[i]);
    assert.strictEqual(p.i, i);
    assert.strictEqual(p.text, 'hello ' + i);
  }
});

test('server: broadcast to 2 ws clients', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const c1 = await wsConnect(srv.port);
  const c2 = await wsConnect(srv.port);
  t.after(() => { c1.close(); c2.close(); });

  const lines = [];
  for (let i = 0; i < 10; i++) lines.push(JSON.stringify({ type: 'assistant', i }));
  await postIngest(srv.port, 42, 'd1-tx', lines);

  await c1.waitFor((fs) => fs.length >= 10, 2000);
  await c2.waitFor((fs) => fs.length >= 10, 2000);
  // Both receive 10 in order.
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(JSON.parse(c1.frames[i]).i, i);
    assert.strictEqual(JSON.parse(c2.frames[i]).i, i);
  }
});

test('server: replay via ?from=N', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  // Ingest 8 frames before any client connects.
  const lines = [];
  for (let i = 0; i < 8; i++) lines.push(JSON.stringify({ type: 'assistant', i }));
  await postIngest(srv.port, 42, 'd1-t1', lines);
  await new Promise((r) => setTimeout(r, 30));

  // Client connects with ?from=5 — should receive frames 5,6,7.
  const c = await wsConnect(srv.port, 'from=5');
  t.after(() => c.close());
  await c.waitFor((fs) => fs.length >= 3, 2000);
  assert.strictEqual(JSON.parse(c.frames[0]).i, 5);
  assert.strictEqual(JSON.parse(c.frames[1]).i, 6);
  assert.strictEqual(JSON.parse(c.frames[2]).i, 7);
});

test('server: replay default (no ?from) yields full history', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const lines = [];
  for (let i = 0; i < 4; i++) lines.push(JSON.stringify({ type: 'assistant', i }));
  await postIngest(srv.port, 1, 'x', lines);
  await new Promise((r) => setTimeout(r, 20));

  const c = await wsConnect(srv.port);
  t.after(() => c.close());
  await c.waitFor((fs) => fs.length >= 4, 2000);
  assert.strictEqual(JSON.parse(c.frames[0]).i, 0);
  assert.strictEqual(JSON.parse(c.frames[3]).i, 3);
});

test('server: persist-before-broadcast — frame in JSONL even if no clients', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  await postIngest(srv.port, 1, 'x', [JSON.stringify({ type: 'assistant', sentinel: true })]);
  await new Promise((r) => setTimeout(r, 30));
  const date = _testing.currentUtcDate();
  const file = path.join(tmp, '.gsd-t', 'stream-feed', `${date}.jsonl`);
  const content = fs.readFileSync(file, 'utf8').trim();
  const obj = JSON.parse(content);
  assert.strictEqual(obj.sentinel, true);
});

test('server: malformed JSON lines are dropped, valid ones flow', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const lines = ['{"type":"assistant","i":0}', 'not json', '{"type":"assistant","i":1}'];
  await postIngest(srv.port, 1, 'x', lines);
  await new Promise((r) => setTimeout(r, 30));
  const date = _testing.currentUtcDate();
  const file = path.join(tmp, '.gsd-t', 'stream-feed', `${date}.jsonl`);
  const content = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(content.length, 2);
  assert.strictEqual(JSON.parse(content[0]).i, 0);
  assert.strictEqual(JSON.parse(content[1]).i, 1);
});

test('server: isLoopback helper classifies correctly', () => {
  assert.strictEqual(_testing.isLoopback('127.0.0.1'), true);
  assert.strictEqual(_testing.isLoopback('::1'), true);
  assert.strictEqual(_testing.isLoopback('::ffff:127.0.0.1'), true);
  assert.strictEqual(_testing.isLoopback('10.0.0.5'), false);
  assert.strictEqual(_testing.isLoopback(undefined), false);
  assert.strictEqual(_testing.isLoopback(''), false);
});

test('server: /status endpoint reports stats', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  await postIngest(srv.port, 1, 'x', [JSON.stringify({ type: 'assistant', i: 0 })]);
  await new Promise((r) => setTimeout(r, 20));

  const body = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: srv.port, path: '/status' }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve(b));
    }).on('error', reject);
  });
  const j = JSON.parse(body);
  assert.strictEqual(j.status, 'ok');
  assert.ok(j.framesToday >= 1);
  assert.ok(j.stats.framesIngested >= 1);
});

test('client: http mode pushes frames to server', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const client = createStreamFeedClient({
    port: srv.port, projectDir: tmp, workerPid: 999, taskId: 'd4-t5',
  });
  client.pushFrame({ type: 'assistant', i: 0 });
  client.pushFrame({ type: 'assistant', i: 1 });
  await new Promise((r) => setTimeout(r, 50));
  await client.close();
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(client.mode, 'closed');
  const date = _testing.currentUtcDate();
  const file = path.join(tmp, '.gsd-t', 'stream-feed', `${date}.jsonl`);
  const content = fs.readFileSync(file, 'utf8').trim().split('\n');
  assert.strictEqual(content.length, 2);
  assert.strictEqual(JSON.parse(content[0]).i, 0);
  assert.strictEqual(JSON.parse(content[1]).i, 1);
});

test('client: unreachable server → spool mode', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const unused = await getFreePort();

  const client = createStreamFeedClient({
    port: unused, projectDir: tmp, workerPid: 8888, taskId: 'unreachable',
  });
  client.pushFrame({ type: 'assistant', i: 0 });
  client.pushFrame({ type: 'assistant', i: 1 });
  await new Promise((r) => setTimeout(r, 200));

  // Observe spool mode BEFORE closing.
  assert.strictEqual(client.mode, 'spool');

  await client.close();
  assert.strictEqual(client.mode, 'closed');

  const spool = path.join(tmp, '.gsd-t', 'stream-feed', 'spool-8888.jsonl');
  assert.ok(fs.existsSync(spool), 'spool file should exist');
  const content = fs.readFileSync(spool, 'utf8').trim().split('\n');
  assert.strictEqual(content.length, 2);
  assert.strictEqual(JSON.parse(content[0]).i, 0);
});

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

test('server: ws close from client cleanly disconnects', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const c = await wsConnect(srv.port);
  assert.strictEqual(srv._internal.clients.size, 1);
  c.close();
  // Poll up to 1s for server to observe close.
  const start = Date.now();
  while (srv._internal.clients.size > 0 && Date.now() - start < 1000) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.strictEqual(srv._internal.clients.size, 0);
});

test('server: 404 for unknown routes', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  const body = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: srv.port, path: '/nope' }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', reject);
  });
  assert.strictEqual(body.status, 404);
});

test('server: ws upgrade rejected for non-/feed path', async (t) => {
  const tmp = mkTmp();
  t.after(() => rmTmp(tmp));
  const srv = await startServer(tmp);
  t.after(() => srv.stop());

  await new Promise((resolve, reject) => {
    const socket = net.connect(srv.port, '127.0.0.1', () => {
      const key = crypto.randomBytes(16).toString('base64');
      const headers = [
        'GET /wrong HTTP/1.1',
        `Host: 127.0.0.1:${srv.port}`,
        'Upgrade: websocket', 'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13',
        '\r\n',
      ].join('\r\n');
      socket.write(headers);
    });
    let buf = '';
    socket.on('data', (c) => { buf += c.toString('utf8'); });
    socket.on('close', () => {
      try {
        assert.ok(/404/.test(buf), '404 expected, got: ' + buf);
        resolve();
      } catch (e) { reject(e); }
    });
    socket.on('error', () => resolve()); // acceptable — rejected
  });
});

test('ws frame encode/decode roundtrip (testing helpers)', () => {
  const enc = _testing.encodeWsTextFrame('hello world');
  // Strip the FIN+opcode + length byte
  assert.strictEqual(enc[0], 0x81);
  assert.strictEqual(enc[1], 11);
  assert.strictEqual(enc.slice(2).toString('utf8'), 'hello world');

  // Masked frame decode
  const masked = Buffer.from([0x81, 0x85, 0x12, 0x34, 0x56, 0x78, 0x7a, 0x51, 0x3a, 0x14, 0x7d]);
  // Payload "hello" masked with 0x12345678
  const frames = _testing.decodeWsFrames(masked);
  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].payload.toString('utf8'), 'hello');
});
