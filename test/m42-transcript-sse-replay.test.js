'use strict';
/**
 * M42 D2 follow-up — SSE replay robustness
 *
 * Verifies the /transcript/:spawnId/stream route emits the correct
 * event-shape for four scenarios:
 *
 *   1. running with content      → replay `data:` frames for every ndjson line
 *   2. finished (done/failed/stopped) → replay + `event: end` + server closes
 *   3. existing but 0-byte file   → `event: status` with status="empty"
 *   4. missing file (no ndjson, no index entry) → `event: status` status="waiting"
 *
 * All scenarios use real http.createServer via startServer(...) and a
 * tmpdir-backed fake project. No producer involvement — we seed ndjson and
 * .index.json directly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const server = require('../scripts/gsd-t-dashboard-server.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-m42-sse-replay-'));
}

function freePort() {
  // OS-assigned port 0 would be better but startServer hard-codes .listen(port).
  // Use a high randomized port instead.
  return 18000 + Math.floor(Math.random() * 500);
}

async function startTestServer(projectDir) {
  const dashHtml = path.join(projectDir, 'dashboard.html');
  fs.writeFileSync(dashHtml, '<!DOCTYPE html><html><body>dashboard</body></html>');
  const transcriptHtml = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
  const port = freePort();
  fs.mkdirSync(path.join(projectDir, '.gsd-t', 'events'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, '.gsd-t', 'transcripts'), { recursive: true });
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

/**
 * Collect raw SSE chunks for `holdMs`, then destroy the request if the
 * server hasn't closed first. Returns the full concatenated body plus a
 * `serverClosed` flag indicating whether the server ended the stream on
 * its own (the finished-spawn branch does this).
 */
function collectStream(port, url, holdMs) {
  return new Promise((resolve, reject) => {
    let body = '';
    let serverClosed = false;
    const req = http.get(`http://127.0.0.1:${port}${url}`, (res) => {
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => { serverClosed = true; resolve({ body, serverClosed }); });
      res.on('error', reject);
    });
    req.on('error', reject);
    setTimeout(() => {
      if (!serverClosed) {
        req.destroy();
        resolve({ body, serverClosed });
      }
    }, holdMs);
  });
}

function writeIndex(projectDir, spawns) {
  const p = path.join(projectDir, '.gsd-t', 'transcripts', '.index.json');
  fs.writeFileSync(p, JSON.stringify({ spawns }, null, 2));
}

function writeTranscript(projectDir, spawnId, lines) {
  const p = path.join(projectDir, '.gsd-t', 'transcripts', `${spawnId}.ndjson`);
  fs.writeFileSync(p, lines.length ? lines.join('\n') + '\n' : '');
}

/** Count `data: ...\n\n` frames (default event) in the SSE body. */
function countDataFrames(body) {
  // Each frame ends with a blank line. A "data:" frame has no `event:` prefix.
  const frames = body.split('\n\n').filter((f) => f.startsWith('data:'));
  return frames.length;
}

/** Extract all `event: <name>\ndata: {...}` pairs. */
function extractNamedEvents(body) {
  const out = [];
  const blocks = body.split('\n\n');
  for (const block of blocks) {
    if (!block.startsWith('event:')) continue;
    const nl = block.indexOf('\n');
    if (nl < 0) continue;
    const eventName = block.slice(6, nl).trim();
    const rest = block.slice(nl + 1);
    if (!rest.startsWith('data:')) continue;
    const payload = rest.slice(5).trim();
    let parsed = null;
    try { parsed = JSON.parse(payload); } catch { /* leave null */ }
    out.push({ event: eventName, data: parsed, raw: payload });
  }
  return out;
}

test('SSE replay — Test 1: running spawn replays all existing ndjson lines', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const spawnId = 's-test1';
    writeTranscript(dir, spawnId, [
      JSON.stringify({ type: 'system', session_id: 'abc' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'hello' }] } }),
    ]);
    writeIndex(dir, [{ spawnId, status: 'running', startedAt: new Date().toISOString() }]);

    const { body } = await collectStream(port, `/transcript/${spawnId}/stream`, 300);
    const dataFrames = countDataFrames(body);
    assert.equal(dataFrames, 3, `expected 3 data frames, got ${dataFrames}. body=${JSON.stringify(body)}`);
  } finally {
    srv.close();
  }
});

test('SSE replay — Test 2: finished spawn emits end event and server closes', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const spawnId = 's-test2';
    const endedAt = new Date().toISOString();
    writeTranscript(dir, spawnId, [
      JSON.stringify({ type: 'system', session_id: 'xyz' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } }),
      JSON.stringify({ type: 'result', subtype: 'success' }),
    ]);
    writeIndex(dir, [{ spawnId, status: 'done', startedAt: endedAt, endedAt }]);

    // Hold 500ms; the server should close on its own well before that.
    const { body, serverClosed } = await collectStream(port, `/transcript/${spawnId}/stream`, 500);

    const dataFrames = countDataFrames(body);
    assert.equal(dataFrames, 3, `expected 3 data frames, got ${dataFrames}`);

    const named = extractNamedEvents(body);
    const endEvents = named.filter((e) => e.event === 'end');
    assert.equal(endEvents.length, 1, `expected 1 end event, got ${endEvents.length}`);
    assert.equal(endEvents[0].data.status, 'done');
    assert.equal(endEvents[0].data.endedAt, endedAt);
    assert.equal(serverClosed, true, 'server should close the stream on finished spawn');
  } finally {
    srv.close();
  }
});

test('SSE replay — Test 3: 0-byte transcript emits status=empty frame', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    const spawnId = 's-test3';
    writeTranscript(dir, spawnId, []); // 0 bytes
    writeIndex(dir, [{ spawnId, status: 'running', startedAt: new Date().toISOString() }]);

    const { body } = await collectStream(port, `/transcript/${spawnId}/stream`, 300);

    const dataFrames = countDataFrames(body);
    assert.equal(dataFrames, 0, `expected 0 data frames on empty file, got ${dataFrames}`);

    const named = extractNamedEvents(body);
    const statusEvents = named.filter((e) => e.event === 'status');
    assert.equal(statusEvents.length, 1, `expected 1 status event, got ${statusEvents.length}`);
    assert.equal(statusEvents[0].data.status, 'empty');
    assert.match(statusEvents[0].data.reason, /empty/i);
  } finally {
    srv.close();
  }
});

test('SSE replay — Test 4: missing file emits status=waiting frame', async () => {
  const dir = mkTmp();
  const { port, srv } = await startTestServer(dir);
  try {
    // No transcript file, no index entry.
    const { body } = await collectStream(port, '/transcript/s-bogus/stream', 300);

    const dataFrames = countDataFrames(body);
    assert.equal(dataFrames, 0, `expected 0 data frames for missing file, got ${dataFrames}`);

    const named = extractNamedEvents(body);
    const statusEvents = named.filter((e) => e.event === 'status');
    assert.equal(statusEvents.length, 1, `expected 1 status event, got ${statusEvents.length}`);
    assert.equal(statusEvents[0].data.status, 'waiting');
    assert.match(statusEvents[0].data.reason, /no transcript file/i);
  } finally {
    srv.close();
  }
});
