// LIVE journey — /api/parallelism end-to-end against a running dashboard.
//
// Doctrine (post-M52): synthetic in-process startServer() fixtures pass while
// the live UI silently 500s. This spec runs against the user's actual running
// dashboard (default :7488) and walks the real HTTP + DOM path.
//
// Self-skip when no live dashboard is reachable so non-local CI is not red.
// Set GSD_T_LIVE_DASHBOARD_URL to override the base URL (default
// http://localhost:7488).

import { test, expect } from '@playwright/test';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const BASE = process.env.GSD_T_LIVE_DASHBOARD_URL ?? 'http://localhost:7488';

function probeBase(): Promise<{ alive: boolean; status?: number }> {
  return new Promise((resolve) => {
    const u = new URL(BASE);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: '/', method: 'GET', timeout: 1500 },
      (res) => { res.resume(); resolve({ alive: true, status: res.statusCode }); },
    );
    req.on('error', () => resolve({ alive: false }));
    req.on('timeout', () => { req.destroy(); resolve({ alive: false }); });
    req.end();
  });
}

function getJson(urlPath: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', timeout: 4000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: any = text;
          try { body = JSON.parse(text); } catch { /* keep raw */ }
          resolve({ status: res.statusCode || 0, body });
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
  test.skip(!probe.alive, `live dashboard not reachable at ${BASE} (set GSD_T_LIVE_DASHBOARD_URL or start it via /gsd-t-visualize)`);
});

test('GET /api/parallelism returns 200 with the schema-versioned envelope', async () => {
  const { status, body } = await getJson('/api/parallelism');
  expect(status, `expected 200; got ${status} body=${JSON.stringify(body).slice(0, 300)}`).toBe(200);
  expect(body, 'response body must be JSON object').toEqual(expect.objectContaining({
    schemaVersion: 1,
    parallelism_factor_mode: expect.stringMatching(/^(idle|active|.+)$/),
  }));
  // Required scalar fields per parallelism-report contract v1.0.0
  for (const key of ['generatedAt', 'activeWorkers', 'readyTasks', 'parallelism_factor', 'gate_decisions', 'color_state', 'activeSpawnAges_s']) {
    expect(body, `missing field "${key}"`).toHaveProperty(key);
  }
});

test('GET /api/parallelism does NOT 500 with the missing-module error', async () => {
  // Regression guard for the bug where ~/.claude/bin/parallelism-report.cjs
  // was missing — the dashboard server failed `require()` at request time.
  const { status, body } = await getJson('/api/parallelism');
  expect(status).not.toBe(500);
  if (typeof body === 'object' && body && 'error' in body) {
    expect(String((body as any).error)).not.toMatch(/parallelism-report module unavailable/);
    expect(String((body as any).detail || '')).not.toMatch(/Cannot find module .*parallelism-report\.cjs/);
  }
});

test('right-rail PARALLELISM panel populates (no perpetual error/blank)', async ({ page }) => {
  const apiResponses: Array<{ url: string; status: number }> = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/parallelism')) apiResponses.push({ url: r.url(), status: r.status() });
  });

  // The right rail (and its parallelism panel) lives on /transcripts.
  await page.goto(`${BASE}/transcripts`, { waitUntil: 'domcontentloaded' });
  // Wait up to 15s for the right rail to do its first poll (interval is 5s).
  await page.waitForResponse(
    (r) => r.url().includes('/api/parallelism') && r.status() < 500,
    { timeout: 15_000 },
  );

  const failed500 = apiResponses.filter((r) => r.status >= 500);
  expect(failed500, `right rail saw 5xx from /api/parallelism: ${JSON.stringify(failed500)}`).toEqual([]);

  // Best-effort DOM check: the rail should render *something* — either the
  // mode badge ("idle" / "active") or the panel container — not a permanent
  // blank where the panel ought to be. We accept either selector to stay
  // resilient to harmless markup changes.
  const railHints = await page.locator('text=/parallelism|PARALLELISM|idle|active/i').count();
  expect(railHints, 'expected the right rail to surface parallelism state in the DOM').toBeGreaterThan(0);
});

test('regression — ~/.claude/bin/parallelism-report.cjs is present', async () => {
  // The bug was structural: the dashboard server resolves
  // path.join(__dirname, "..", "bin", "parallelism-report.cjs") and __dirname
  // is ~/.claude/scripts/, so the file MUST be at ~/.claude/bin/. Catching it
  // here gives us a fast, network-independent regression signal.
  const expected = path.join(os.homedir(), '.claude', 'bin', 'parallelism-report.cjs');
  expect(fs.existsSync(expected), `missing: ${expected} — run \`gsd-t install\` to repair`).toBe(true);
});
