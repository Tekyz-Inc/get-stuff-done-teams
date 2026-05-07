// Journey 6 — right-rail-toggle
// Functional assertion: clicking #spawn-panel-toggle flips the
// data-collapsed attribute on #spawn-plan-panel AND persists
// gsd-t.viewer.rightRailCollapsed in sessionStorage.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn6-'));
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'transcripts'), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  const htmlPath = path.resolve(__dirname, '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.resolve(__dirname, '..', '..', 'scripts', 'gsd-t-transcript.html');
  const result = startServer(0, path.join(fixtureDir, '.gsd-t', 'events'), htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  server = result.server;
  await new Promise<void>((r) => server.once('listening', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (fixtureDir) try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('toggle flips data-collapsed and persists rightRailCollapsed', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#spawn-panel-toggle', { timeout: 5000 });

  const before = await page.evaluate(() => ({
    panel: document.getElementById('spawn-plan-panel')?.getAttribute('data-collapsed'),
    body: document.body.getAttribute('data-right-rail-collapsed'),
    stored: window.sessionStorage.getItem('gsd-t.viewer.rightRailCollapsed'),
  }));

  await page.click('#spawn-panel-toggle');

  await page.waitForFunction((b) => {
    const cur = document.getElementById('spawn-plan-panel')?.getAttribute('data-collapsed');
    return cur !== b;
  }, before.panel, { timeout: 3000 });

  const after = await page.evaluate(() => ({
    panel: document.getElementById('spawn-plan-panel')?.getAttribute('data-collapsed'),
    body: document.body.getAttribute('data-right-rail-collapsed'),
    stored: window.sessionStorage.getItem('gsd-t.viewer.rightRailCollapsed'),
  }));

  expect(after.panel).not.toEqual(before.panel);
  expect(after.body).not.toEqual(before.body);
  expect(after.stored).not.toBeNull();
  expect(['0', '1']).toContain(after.stored);
});
