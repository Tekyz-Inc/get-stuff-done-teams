'use strict';

/**
 * M44 D8 T7 — dashboard /api/spawn-plans endpoint tests
 *
 * Verifies: GET returns correct shape (only active plans), spawnsDir helper,
 * SSE channel emits an initial snapshot.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { startServer, listActiveSpawnPlans, spawnsDir, readSpawnPlanFile } =
  require('../scripts/gsd-t-dashboard-server.js');
const { writeSpawnPlan } = require('../bin/spawn-plan-writer.cjs');
const { markSpawnEnded } = require('../bin/spawn-plan-status-updater.cjs');

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm44d8-ep-'));
}

function getJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + port + urlPath, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(body) }); }
        catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

test('GET /api/spawn-plans returns only active plans, newest first', async () => {
  const dir = mktemp();
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  writeSpawnPlan({ spawnId: 'old-ended', kind: 'in-session-subagent', projectDir: dir, tasks: [] });
  markSpawnEnded({ spawnId: 'old-ended', projectDir: dir });
  // Delay so active's startedAt > other's
  await new Promise((r) => setTimeout(r, 10));
  writeSpawnPlan({ spawnId: 'active-now', kind: 'in-session-subagent', projectDir: dir, tasks: [] });

  const { server } = startServer(0, path.join(dir, '.gsd-t', 'events'), '/tmp/idx.html', dir);
  const port = server.address().port;
  try {
    const r = await getJson(port, '/api/spawn-plans');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.plans));
    assert.equal(r.body.plans.length, 1);
    assert.equal(r.body.plans[0].spawnId, 'active-now');
  } finally {
    server.close();
  }
});

test('listActiveSpawnPlans filters ended plans out', () => {
  const dir = mktemp();
  writeSpawnPlan({ spawnId: 'a', kind: 'in-session-subagent', projectDir: dir, tasks: [] });
  writeSpawnPlan({ spawnId: 'b', kind: 'in-session-subagent', projectDir: dir, tasks: [] });
  markSpawnEnded({ spawnId: 'b', projectDir: dir });
  const active = listActiveSpawnPlans(dir);
  assert.equal(active.length, 1);
  assert.equal(active[0].spawnId, 'a');
});

test('spawnsDir returns .gsd-t/spawns under the project', () => {
  const dir = mktemp();
  assert.equal(spawnsDir(dir), path.join(dir, '.gsd-t', 'spawns'));
});

test('readSpawnPlanFile returns parsed JSON or null', () => {
  const dir = mktemp();
  const p = writeSpawnPlan({ spawnId: 'rd', kind: 'in-session-subagent', projectDir: dir, tasks: [] });
  const plan = readSpawnPlanFile(p);
  assert.ok(plan);
  assert.equal(plan.spawnId, 'rd');
  // Non-existent / corrupt
  assert.equal(readSpawnPlanFile(path.join(dir, 'nope.json')), null);
});

test('SSE /api/spawn-plans/stream emits initial snapshot', async () => {
  const dir = mktemp();
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  writeSpawnPlan({ spawnId: 'sse-1', kind: 'in-session-subagent', projectDir: dir, tasks: [] });
  const { server } = startServer(0, path.join(dir, '.gsd-t', 'events'), '/tmp/idx.html', dir);
  const port = server.address().port;

  await new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:' + port + '/api/spawn-plans/stream', (res) => {
      let chunks = '';
      res.on('data', (c) => {
        chunks += c.toString('utf8');
        // First SSE `data:` line should contain our spawnId
        if (chunks.includes('sse-1')) {
          req.destroy();
          resolve();
        }
      });
      res.on('error', reject);
    });
    setTimeout(() => { req.destroy(); reject(new Error('SSE timeout')); }, 3000);
  });
  server.close();
});
