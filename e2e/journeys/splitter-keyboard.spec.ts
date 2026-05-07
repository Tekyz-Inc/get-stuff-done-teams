// Journey 5 — splitter-keyboard
// Functional assertion: ArrowUp/ArrowDown/Home/End on the focused #splitter
// changes --main-pane-pct AND persists to sessionStorage.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn5-'));
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

test('ArrowDown shifts pct and Home/End snap to extremes', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#splitter', { timeout: 5000 });

  await page.locator('#splitter').focus();

  const before = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) || 50
  );

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');

  await page.waitForFunction((b) => {
    const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct'));
    return Math.abs(cur - b) > 1;
  }, before, { timeout: 4000 });

  const afterDown = await page.evaluate(() => ({
    pct: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')),
    stored: window.sessionStorage.getItem('gsd-t.viewer.splitterPct'),
  }));
  expect(afterDown.pct).toBeGreaterThan(before);
  expect(afterDown.stored).not.toBeNull();

  await page.keyboard.press('Home');
  await page.waitForFunction(() => {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct'));
    return Math.abs(v - 20) < 1;
  }, null, { timeout: 4000 });

  await page.keyboard.press('End');
  await page.waitForFunction(() => {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct'));
    return Math.abs(v - 80) < 1;
  }, null, { timeout: 4000 });

  const finalStored = await page.evaluate(() => window.sessionStorage.getItem('gsd-t.viewer.splitterPct'));
  expect(parseFloat(finalStored as string)).toBeCloseTo(80, 0);
});
