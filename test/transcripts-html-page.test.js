'use strict';
// /transcripts content negotiation: browsers (Accept: text/html) get an HTML
// index page; programmatic clients (fetch's default Accept */* or explicit
// application/json) keep getting the JSON shape the dashboard JS already
// consumes. Regression: prior to v3.18.13 the route ALWAYS returned raw JSON,
// so when the Live Stream button (always-enabled per 2026-04-23 user contract)
// had no spawn data and fell through to /transcripts, the browser landed on
// `{"spawns":[]}` — bad UX.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const srv = require('../scripts/gsd-t-dashboard-server.js');

function withServer(spawns, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-tx-html-'));
  fs.mkdirSync(path.join(tmp, '.gsd-t', 'events'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.gsd-t', 'transcripts'), { recursive: true });
  if (spawns) {
    fs.writeFileSync(
      path.join(tmp, '.gsd-t', 'transcripts', '.index.json'),
      JSON.stringify({ spawns }),
    );
  }
  const htmlPath = path.join(__dirname, '..', 'scripts', 'gsd-t-dashboard.html');
  const { server } = srv.startServer(0, path.join(tmp, '.gsd-t', 'events'), htmlPath, tmp);
  const port = server.address().port;
  return Promise.resolve(fn(port)).finally(() => {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
}

function fetchUrl(port, accept) {
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: '/transcripts', headers: { accept } }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
  });
}

test('renderTranscriptsHtml — empty list shows clear empty state', () => {
  const html = srv.renderTranscriptsHtml([]);
  assert.match(html, /No spawn transcripts yet/);
  assert.match(html, /\/gsd-t-quick/, 'empty state should hint at how to generate one');
  assert.match(html, /href="\/"/, 'empty state should link back to dashboard');
});

test('renderTranscriptsHtml — populated list renders rows with transcript links', () => {
  const html = srv.renderTranscriptsHtml([
    { spawnId: 's-abc', command: 'gsd-t-quick', description: 'demo', status: 'running', startedAt: new Date().toISOString(), endedAt: null },
    { spawnId: 's-def', command: 'gsd-t-execute', description: 'd2', status: 'done', startedAt: '2026-04-23T00:00:00Z', endedAt: '2026-04-23T00:01:00Z' },
  ]);
  assert.match(html, /href="\/transcript\/s-abc"/);
  assert.match(html, /href="\/transcript\/s-def"/);
  assert.match(html, /status-running/);
  assert.match(html, /status-done/);
  assert.match(html, /2 spawns/);
});

test('renderTranscriptsHtml — escapes HTML in spawn metadata', () => {
  const html = srv.renderTranscriptsHtml([
    { spawnId: 's-x', command: 'q', description: '<script>alert(1)</script>', status: 'done', startedAt: '2026-04-23T00:00:00Z', endedAt: null },
  ]);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('GET /transcripts with Accept: text/html returns HTML page', async () => {
  await withServer(null, async (port) => {
    const r = await fetchUrl(port, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    assert.equal(r.status, 200);
    assert.match(r.type, /text\/html/);
    assert.match(r.body, /No spawn transcripts yet/);
  });
});

test('GET /transcripts with Accept: */* (fetch default) returns JSON — back-compat', async () => {
  await withServer([{ spawnId: 's-1', command: 'q', description: 'd', status: 'done', startedAt: '2026-04-23T00:00:00Z', endedAt: null }], async (port) => {
    const r = await fetchUrl(port, '*/*');
    assert.equal(r.status, 200);
    assert.match(r.type, /application\/json/);
    const parsed = JSON.parse(r.body);
    assert.equal(parsed.spawns.length, 1);
    assert.equal(parsed.spawns[0].spawnId, 's-1');
  });
});

test('GET /transcripts with Accept: application/json returns JSON', async () => {
  await withServer([], async (port) => {
    const r = await fetchUrl(port, 'application/json');
    assert.equal(r.status, 200);
    assert.match(r.type, /application\/json/);
    assert.deepEqual(JSON.parse(r.body), { spawns: [] });
  });
});

test('GET /transcripts HTML page lists populated spawns from index', async () => {
  await withServer([
    { spawnId: 's-live', command: 'gsd-t-execute', description: 'task one', status: 'running', startedAt: new Date().toISOString(), endedAt: null },
  ], async (port) => {
    const r = await fetchUrl(port, 'text/html');
    assert.equal(r.status, 200);
    assert.match(r.body, /s-live/);
    assert.match(r.body, /gsd-t-execute/);
    assert.match(r.body, /task one/);
    assert.match(r.body, /href="\/transcript\/s-live"/);
  });
});
