#!/usr/bin/env node
/**
 * GSD-T Stream Feed Server (M40 D4)
 *
 * Ingests stream-json frames from D1 workers via chunked HTTP POST to /ingest,
 * persists every frame to .gsd-t/stream-feed/YYYY-MM-DD.jsonl (persist-before-broadcast),
 * rotates daily at UTC midnight, broadcasts over WebSocket at /feed (with ?from=N replay),
 * enforces 127.0.0.1-only, kicks backpressured clients after 1000-frame buffer.
 *
 * Contract: .gsd-t/contracts/stream-json-sink-contract.md v1.x
 * Zero external deps — node http + crypto + fs + net only. Hand-rolled WS framing.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PORT = 7842;
const BACKPRESSURE_LIMIT = 1000;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ── Frame store ────────────────────────────────────────────────────────────

function createStreamFeedServer(opts = {}) {
  const projectDir = opts.projectDir || process.cwd();
  const port = Number(opts.port || process.env.GSD_T_STREAM_FEED_PORT || DEFAULT_PORT);
  const feedDir = path.join(projectDir, '.gsd-t', 'stream-feed');
  try { fs.mkdirSync(feedDir, { recursive: true }); } catch { /* exists */ }

  const clients = new Set();
  const stats = { framesIngested: 0, framesBroadcast: 0, clientsConnected: 0, kicked: 0 };
  const RECENT_BUFFER_MAX = opts.recentBufferMax || 10000;
  const recentFrames = []; // In-memory mirror of today's JSONL for replay durability.

  let currentDate = currentUtcDate();
  let currentFile = path.join(feedDir, `${currentDate}.jsonl`);
  let framesToday = countLines(currentFile);
  let writeStream = fs.createWriteStream(currentFile, { flags: 'a' });
  // Prime recent buffer from any pre-existing content so replay works from first connect.
  try {
    if (fs.existsSync(currentFile)) {
      const existing = fs.readFileSync(currentFile, 'utf8').split('\n').filter(l => l.length > 0);
      for (const l of existing.slice(-RECENT_BUFFER_MAX)) recentFrames.push(l);
    }
  } catch { /* noop */ }

  function rotateIfNeeded() {
    const d = currentUtcDate();
    if (d === currentDate) return;
    try { writeStream.end(); } catch { /* noop */ }
    currentDate = d;
    currentFile = path.join(feedDir, `${currentDate}.jsonl`);
    framesToday = countLines(currentFile);
    writeStream = fs.createWriteStream(currentFile, { flags: 'a' });
  }

  function persistFrame(line) {
    rotateIfNeeded();
    try {
      writeStream.write(line + '\n');
      framesToday += 1;
      stats.framesIngested += 1;
      recentFrames.push(line);
      if (recentFrames.length > RECENT_BUFFER_MAX) recentFrames.shift();
      return true;
    } catch (e) {
      process.stderr.write(`[stream-feed-server] persist failed: ${e.message}\n`);
      return false;
    }
  }

  function broadcast(line) {
    for (const client of clients) {
      if (client.sendBuffer.length >= BACKPRESSURE_LIMIT) {
        kickClient(client, 'backpressure');
        continue;
      }
      client.sendBuffer.push(line);
      flushClient(client);
      stats.framesBroadcast += 1;
    }
  }

  function flushClient(client) {
    if (client.flushing || client.closed) return;
    client.flushing = true;
    while (client.sendBuffer.length > 0 && !client.closed) {
      const line = client.sendBuffer.shift();
      const frame = encodeWsTextFrame(line);
      try {
        const ok = client.socket.write(frame);
        if (!ok) {
          client.socket.once('drain', () => { client.flushing = false; flushClient(client); });
          return;
        }
      } catch {
        client.closed = true;
        clients.delete(client);
        return;
      }
    }
    client.flushing = false;
  }

  function kickClient(client, reason) {
    if (client.closed) return;
    const kick = JSON.stringify({ type: 'kicked', reason });
    try {
      client.socket.write(encodeWsTextFrame(kick));
      client.socket.end(encodeWsCloseFrame(1001, reason));
    } catch { /* socket dead */ }
    client.closed = true;
    client.sendBuffer.length = 0;
    clients.delete(client);
    stats.kicked += 1;
  }

  function replayToClient(client, fromLine) {
    // Prefer in-memory buffer (survives write-stream lag). Fall back to file.
    try {
      let lines;
      if (recentFrames.length > 0) {
        lines = recentFrames;
      } else if (fs.existsSync(currentFile)) {
        const content = fs.readFileSync(currentFile, 'utf8');
        lines = content.split('\n').filter(l => l.length > 0);
      } else {
        lines = [];
      }
      const start = Math.max(0, Math.min(fromLine || 0, lines.length));
      for (let i = start; i < lines.length; i++) {
        client.sendBuffer.push(lines[i]);
        if (client.sendBuffer.length >= BACKPRESSURE_LIMIT) {
          kickClient(client, 'backpressure');
          return;
        }
      }
      flushClient(client);
    } catch (e) {
      process.stderr.write(`[stream-feed-server] replay failed: ${e.message}\n`);
    }
  }

  const server = http.createServer((req, res) => {
    const u = parseUrl(req.url);

    if (req.method === 'POST' && u.pathname === '/ingest') {
      ingestStream(req, res, { persistFrame, broadcast });
      return;
    }
    if (req.method === 'GET' && u.pathname === '/status') {
      const body = JSON.stringify({
        status: 'ok', port, currentFile, framesToday,
        clients: clients.size, stats,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    if (req.method === 'GET' && u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`GSD-T Stream Feed Server\nport=${port}\nframesToday=${framesToday}\nclients=${clients.size}\n`);
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  // Enforce 127.0.0.1-only at the socket level.
  server.on('connection', (socket) => {
    const addr = socket.remoteAddress;
    if (!isLoopback(addr)) {
      try { socket.destroy(); } catch { /* noop */ }
    }
  });

  // WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    const addr = socket.remoteAddress;
    if (!isLoopback(addr)) {
      try { socket.destroy(); } catch { /* noop */ }
      return;
    }
    const u = parseUrl(req.url);
    if (u.pathname !== '/feed') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n',
    ].join('\r\n');
    socket.write(headers);

    const client = { socket, sendBuffer: [], flushing: false, closed: false };
    clients.add(client);
    stats.clientsConnected += 1;

    const cleanupClient = () => {
      if (client.closed) return;
      client.closed = true;
      clients.delete(client);
      try { socket.destroy(); } catch { /* noop */ }
    };
    socket.on('close', cleanupClient);
    socket.on('error', cleanupClient);
    socket.on('end', cleanupClient);
    socket.on('data', (buf) => {
      const frames = decodeWsFrames(buf);
      for (const f of frames) {
        if (f.opcode === 0x8) { // close
          client.closed = true;
          try { socket.end(); } catch { /* noop */ }
          clients.delete(client);
        }
        // Ping/pong/other opcodes ignored (no app-level protocol).
      }
    });

    const fromLine = parseInt(u.query.from, 10);
    if (!Number.isNaN(fromLine)) {
      replayToClient(client, fromLine);
    } else {
      replayToClient(client, 0);
    }
  });

  function stop() {
    return new Promise((resolve) => {
      for (const client of clients) {
        try { client.socket.destroy(); } catch { /* noop */ }
      }
      clients.clear();
      try { writeStream.end(); } catch { /* noop */ }
      server.close(() => resolve());
    });
  }

  return {
    server, port, projectDir,
    listen(cb) { server.listen(port, '127.0.0.1', cb); },
    stop,
    stats,
    _internal: { clients, persistFrame, broadcast, rotateIfNeeded, replayToClient, recentFrames },
  };
}

// ── POST /ingest handler ──────────────────────────────────────────────────

function ingestStream(req, res, { persistFrame, broadcast }) {
  let buf = '';
  req.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.length === 0) continue;
      // Validate it's a JSON line; reject malformed but don't crash.
      try { JSON.parse(line); } catch { continue; }
      const ok = persistFrame(line);
      if (ok) broadcast(line);
    }
  });
  req.on('end', () => {
    if (buf.trim().length > 0) {
      const line = buf.trim();
      try { JSON.parse(line); persistFrame(line); broadcast(line); } catch { /* drop */ }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  req.on('error', () => {
    try { res.writeHead(400); res.end('ingest error'); } catch { /* noop */ }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function countLines(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content.split('\n').filter(l => l.length > 0).length;
  } catch { return 0; }
}

function parseUrl(u) {
  const q = {};
  const [pathname, qs] = u.split('?');
  if (qs) {
    for (const pair of qs.split('&')) {
      const [k, v] = pair.split('=');
      q[decodeURIComponent(k || '')] = decodeURIComponent(v || '');
    }
  }
  return { pathname, query: q };
}

function isLoopback(addr) {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// ── WebSocket framing (hand-rolled, RFC 6455) ─────────────────────────────

function encodeWsTextFrame(str) {
  const data = Buffer.from(str, 'utf8');
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, data]);
}

function encodeWsCloseFrame(code, reason) {
  const r = Buffer.from(reason || '', 'utf8');
  const body = Buffer.alloc(2 + r.length);
  body.writeUInt16BE(code || 1000, 0);
  r.copy(body, 2);
  const header = Buffer.alloc(2);
  header[0] = 0x88;
  header[1] = body.length;
  return Buffer.concat([header, body]);
}

function decodeWsFrames(buf) {
  const frames = [];
  let i = 0;
  while (i < buf.length) {
    if (buf.length - i < 2) break;
    const b0 = buf[i];
    const b1 = buf[i + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = i + 2;
    if (len === 126) {
      if (buf.length - offset < 2) break;
      len = buf.readUInt16BE(offset); offset += 2;
    } else if (len === 127) {
      if (buf.length - offset < 8) break;
      offset += 4;
      len = buf.readUInt32BE(offset); offset += 4;
    }
    let maskKey;
    if (masked) {
      if (buf.length - offset < 4) break;
      maskKey = buf.slice(offset, offset + 4);
      offset += 4;
    }
    if (buf.length - offset < len) break;
    let payload = buf.slice(offset, offset + len);
    if (masked && maskKey) {
      const out = Buffer.alloc(payload.length);
      for (let j = 0; j < payload.length; j++) out[j] = payload[j] ^ maskKey[j % 4];
      payload = out;
    }
    frames.push({ opcode, payload });
    i = offset + len;
  }
  return frames;
}

module.exports = {
  createStreamFeedServer,
  _testing: {
    encodeWsTextFrame,
    decodeWsFrames,
    isLoopback,
    parseUrl,
    currentUtcDate,
    countLines,
  },
};

// ── CLI ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') opts.port = Number(args[++i]);
    else if (args[i] === '--project-dir') opts.projectDir = args[++i];
  }
  const srv = createStreamFeedServer(opts);
  srv.listen(() => {
    process.stdout.write(`[stream-feed-server] listening on http://127.0.0.1:${srv.port}\n`);
    process.stdout.write(`[stream-feed-server] project: ${srv.projectDir}\n`);
  });
  let shuttingDown = false;
  async function shutdown(sig) {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(`[stream-feed-server] ${sig} — shutting down\n`);
    await srv.stop();
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
