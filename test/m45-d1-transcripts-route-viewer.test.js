'use strict';
// M45 D1 — GET /transcripts serves the viewer HTML (same file as
// /transcript/:id) with an empty __SPAWN_ID__ placeholder. Verifies:
//   1. text/html branch returns the viewer, not the retired standalone index
//   2. JSON back-compat preserved (*/* and application/json both return
//      { spawns: [...] })
//   3. Same HTML skeleton as /transcript/:id (modulo spawn-id substitution)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const srv = require('../scripts/gsd-t-dashboard-server.js');

function withServer(spawns, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m45d1-'));
  fs.mkdirSync(path.join(tmp, '.gsd-t', 'events'), { recursive: true });
  fs.mkdirSync(path.join(tmp, '.gsd-t', 'transcripts'), { recursive: true });
  if (spawns) {
    fs.writeFileSync(
      path.join(tmp, '.gsd-t', 'transcripts', '.index.json'),
      JSON.stringify({ spawns }),
    );
  }
  const htmlPath = path.join(__dirname, '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
  const { server } = srv.startServer(0, path.join(tmp, '.gsd-t', 'events'), htmlPath, tmp, transcriptHtmlPath);
  const port = server.address().port;
  return Promise.resolve(fn(port)).finally(() => {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
}

function fetchUrl(port, reqPath, accept) {
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: reqPath, headers: { accept } }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
  });
}

test('GET /transcripts with Accept: text/html returns the viewer with empty spawn-id', async () => {
  await withServer(null, async (port) => {
    const r = await fetchUrl(port, '/transcripts', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    assert.equal(r.status, 200);
    assert.match(r.type, /text\/html/);
    // Stable DOM markers from scripts/gsd-t-transcript.html viewer:
    assert.match(r.body, /<main id="stream">/, 'viewer main stream container present');
    assert.match(r.body, /id="tree"/, 'viewer left-rail tree container present');
    assert.match(r.body, /id="spawn-plan-panel"/, 'viewer right-panel spawn-plan container present');
    // Placeholder substitution succeeded:
    assert.doesNotMatch(r.body, /__SPAWN_ID__/, 'literal __SPAWN_ID__ placeholder must be substituted');
    assert.match(r.body, /data-spawn-id=""/, 'body carries empty data-spawn-id attribute');
  });
});

test('GET /transcripts serves the SAME HTML skeleton as /transcript/:id (minus spawn-id)', async () => {
  await withServer([{ spawnId: 's-x', command: 'q', description: 'd', status: 'running', startedAt: '2026-04-23T00:00:00Z', endedAt: null }], async (port) => {
    const listPage = await fetchUrl(port, '/transcripts', 'text/html');
    const detailPage = await fetchUrl(port, '/transcript/s-x', 'text/html');
    assert.equal(listPage.status, 200);
    assert.equal(detailPage.status, 200);
    // Normalize the spawn-id attribute so the two bodies are comparable.
    const norm = (s) => s.replace(/data-spawn-id="[^"]*"/g, 'data-spawn-id="__X__"');
    assert.equal(norm(listPage.body), norm(detailPage.body),
      '/transcripts and /transcript/:id serve the same viewer HTML modulo spawn-id substitution');
  });
});

test('GET /transcripts with Accept: application/json still returns { spawns: [...] } — back-compat', async () => {
  await withServer([
    { spawnId: 's-1', command: 'q', description: 'd', status: 'done', startedAt: '2026-04-23T00:00:00Z', endedAt: null },
    { spawnId: 's-2', command: 'e', description: 'd', status: 'running', startedAt: '2026-04-23T00:02:00Z', endedAt: null },
  ], async (port) => {
    const r = await fetchUrl(port, '/transcripts', 'application/json');
    assert.equal(r.status, 200);
    assert.match(r.type, /application\/json/);
    const parsed = JSON.parse(r.body);
    assert.equal(parsed.spawns.length, 2);
    // Sorted newest-first (s-2 started later than s-1).
    assert.equal(parsed.spawns[0].spawnId, 's-2');
    assert.equal(parsed.spawns[1].spawnId, 's-1');
  });
});

test('GET /transcripts with Accept: */* (fetch default) returns JSON — back-compat', async () => {
  await withServer([{ spawnId: 's-only', command: 'q', description: 'd', status: 'done', startedAt: '2026-04-23T00:00:00Z', endedAt: null }], async (port) => {
    const r = await fetchUrl(port, '/transcripts', '*/*');
    assert.equal(r.status, 200);
    assert.match(r.type, /application\/json/);
    const parsed = JSON.parse(r.body);
    assert.equal(parsed.spawns.length, 1);
    assert.equal(parsed.spawns[0].spawnId, 's-only');
  });
});
