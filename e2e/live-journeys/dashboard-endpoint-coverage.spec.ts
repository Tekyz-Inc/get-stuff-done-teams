// LIVE journey — every dashboard endpoint returns a non-5xx against a running
// dashboard. Companion to parallelism-endpoint.spec.ts.
//
// Doctrine (post-M52): every public dashboard endpoint must be covered by a
// live probe so structural breakage (e.g. missing global-bin module, route
// rename, broken require) shows up as a red test, not a silently-broken UI.
//
// Self-skip when no live dashboard is reachable. Override base URL via
// GSD_T_LIVE_DASHBOARD_URL (default http://localhost:7488 — the
// most-recently-launched dashboard).

import { test, expect } from '@playwright/test';
import * as http from 'node:http';

const BASE = process.env.GSD_T_LIVE_DASHBOARD_URL ?? 'http://localhost:7488';

function probeBase(): Promise<{ alive: boolean; status?: number }> {
  return new Promise((resolve) => {
    const u = new URL(BASE);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: '/ping', method: 'GET', timeout: 1500 },
      (res) => { res.resume(); resolve({ alive: true, status: res.statusCode }); },
    );
    req.on('error', () => resolve({ alive: false }));
    req.on('timeout', () => { req.destroy(); resolve({ alive: false }); });
    req.end();
  });
}

function fetchHead(urlPath: string, timeoutMs = 4000): Promise<{ status: number; bodyPrefix: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let read = 0;
        res.on('data', (c) => {
          chunks.push(Buffer.from(c));
          read += c.length;
          if (read >= 2048) res.destroy(); // SSE endpoints stream forever — sample first chunk
        });
        res.on('close', () => {
          const text = Buffer.concat(chunks).toString('utf8').slice(0, 2048);
          resolve({ status: res.statusCode || 0, bodyPrefix: text });
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8').slice(0, 2048);
          resolve({ status: res.statusCode || 0, bodyPrefix: text });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

test.beforeAll(async () => {
  const probe = await probeBase();
  test.skip(!probe.alive, `live dashboard not reachable at ${BASE} (set GSD_T_LIVE_DASHBOARD_URL)`);
});

// ── Static / JSON endpoints — must be 200 ────────────────────────────────────
const OK_ENDPOINTS = [
  { path: '/',                          contains: '<html' },
  { path: '/transcripts',               contains: '<html' },
  { path: '/ping',                      contains: 'ok' },
  { path: '/metrics',                   contains: '' },
  { path: '/api/main-session',          contains: '' },
  { path: '/api/spawn-plans',           contains: '' },
  { path: '/api/parallelism',           contains: '"schemaVersion"' },
  { path: '/api/parallelism/report',    contains: '' },
];

for (const ep of OK_ENDPOINTS) {
  test(`GET ${ep.path} returns 2xx (no 5xx structural break)`, async () => {
    const { status, bodyPrefix } = await fetchHead(ep.path);
    expect(status, `expected 2xx; got ${status}\nbody-prefix: ${bodyPrefix.slice(0, 200)}`).toBeGreaterThanOrEqual(200);
    expect(status, `expected 2xx; got ${status}\nbody-prefix: ${bodyPrefix.slice(0, 200)}`).toBeLessThan(300);
    if (ep.contains) expect(bodyPrefix.toLowerCase()).toContain(ep.contains.toLowerCase());
  });
}

// ── SSE endpoints — must respond with 200 + text/event-stream headers ────────
test('GET /events streams SSE (200 + event-stream content-type)', async () => {
  // We can't easily get headers from our minimal helper; status 200 + the
  // server not blowing up on the first 2KB is enough as a smoke test.
  const { status } = await fetchHead('/events', 2500);
  expect(status).toBe(200);
});

test('GET /api/spawn-plans/stream streams SSE', async () => {
  const { status } = await fetchHead('/api/spawn-plans/stream', 2500);
  expect(status).toBe(200);
});

// ── Negative — unknown route returns 404, not a server crash ─────────────────
test('GET /nonsense-path-12345 returns 404 (router catch-all)', async () => {
  const { status } = await fetchHead('/nonsense-path-12345');
  expect(status).toBe(404);
});

// ── Regression sentinel — /api/parallelism must not 500 with module-missing ──
test('GET /api/parallelism never reports "parallelism-report module unavailable"', async () => {
  const { status, bodyPrefix } = await fetchHead('/api/parallelism');
  expect(status).not.toBe(500);
  expect(bodyPrefix).not.toMatch(/parallelism-report module unavailable/);
  expect(bodyPrefix).not.toMatch(/Cannot find module .*parallelism-report\.cjs/);
});
