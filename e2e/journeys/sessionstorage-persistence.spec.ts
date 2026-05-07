// Journey 10 — sessionstorage-persistence
// Functional assertion: sessionStorage keys for splitterPct, rightRailCollapsed,
// completedExpanded survive a page reload AND the DOM reflects the restored
// values on the second load.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn10-'));
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

test('splitterPct + rightRailCollapsed + completedExpanded survive reload', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#splitter', { timeout: 5000 });

  // Set known values, then reload and verify restoration.
  await page.evaluate(() => {
    window.sessionStorage.setItem('gsd-t.viewer.splitterPct', '65');
    window.sessionStorage.setItem('gsd-t.viewer.rightRailCollapsed', '1');
    window.sessionStorage.setItem('gsd-t.viewer.completedExpanded', '0');
  });

  await page.reload();
  await page.waitForSelector('#splitter', { timeout: 5000 });

  const restored = await page.evaluate(() => ({
    pct: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')),
    panel: document.getElementById('spawn-plan-panel')?.getAttribute('data-collapsed'),
    expanded: document.querySelector('section.rail-completed')?.getAttribute('data-expanded'),
    storedPct: window.sessionStorage.getItem('gsd-t.viewer.splitterPct'),
    storedRail: window.sessionStorage.getItem('gsd-t.viewer.rightRailCollapsed'),
    storedComp: window.sessionStorage.getItem('gsd-t.viewer.completedExpanded'),
  }));

  // Storage must persist verbatim across reload.
  expect(restored.storedPct).toEqual('65');
  expect(restored.storedRail).toEqual('1');
  expect(restored.storedComp).toEqual('0');

  // DOM must reflect the persisted values.
  expect(restored.pct).toBeCloseTo(65, 0);
  expect(restored.panel).toEqual('true');
  expect(restored.expanded).toEqual('false');
});
