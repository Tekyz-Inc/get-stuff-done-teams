'use strict';
// /transcripts content negotiation: browsers (Accept: text/html) get the real
// transcript viewer (same HTML as /transcript/:id) with an empty spawn-id so
// the left rail + right spawn-plan panel render and the user can pick a spawn.
// Programmatic clients (fetch's default Accept */* or explicit
// application/json) keep getting the { spawns: [...] } JSON shape the
// dashboard JS already consumes.
//
// M45 D1 (2026-04-23) retired the v3.18.13 standalone `renderTranscriptsHtml`
// index page — the standalone-index assertions that previously lived in this
// file are gone. See test/m45-d1-transcripts-route-viewer.test.js for the
// positive viewer-route test set; this file focuses on route-level content
// negotiation invariants.

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
  const transcriptHtmlPath = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
  const { server } = srv.startServer(0, path.join(tmp, '.gsd-t', 'events'), htmlPath, tmp, transcriptHtmlPath);
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

test('GET /transcripts with Accept: text/html returns the viewer HTML', async () => {
  await withServer(null, async (port) => {
    const r = await fetchUrl(port, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    assert.equal(r.status, 200);
    assert.match(r.type, /text\/html/);
    // Viewer stable DOM markers (from scripts/gsd-t-transcript.html):
    assert.match(r.body, /<main id="stream">/, 'viewer main stream container present');
    assert.match(r.body, /id="tree"/, 'viewer left-rail tree container present');
    // Placeholder must have been substituted; literal string must be absent.
    assert.doesNotMatch(r.body, /__SPAWN_ID__/);
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
