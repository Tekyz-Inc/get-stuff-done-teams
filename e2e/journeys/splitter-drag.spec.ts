// Journey 4 — splitter-drag (mouse)
// Functional assertion: mousedown → mousemove → mouseup on the splitter
// changes the --main-pane-pct CSS variable AND persists splitterPct in
// sessionStorage. State change is verified by reading the CSS variable
// before and after.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn4-'));
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

test('mousedown + mousemove + mouseup on #splitter changes --main-pane-pct and persists', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#splitter', { timeout: 5000 });

  // Read the initial pct.
  const before = await page.evaluate(() => {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) || 50;
  });

  // Drive a real mouse drag: down on splitter, move 100px down, up.
  const splitter = page.locator('#splitter');
  const box = await splitter.boundingBox();
  if (!box) throw new Error('splitter has no bounding box');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 150, { steps: 10 });
  await page.mouse.up();

  // Wait for the CSS variable to change in response.
  await page.waitForFunction((b) => {
    const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) || 50;
    return Math.abs(cur - b) > 0.5;
  }, before, { timeout: 4000 });

  const after = await page.evaluate(() => {
    return {
      pct: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) || 50,
      stored: window.sessionStorage.getItem('gsd-t.viewer.splitterPct'),
    };
  });

  expect(Math.abs(after.pct - before)).toBeGreaterThan(0.5);
  expect(after.stored).not.toBeNull();
  expect(parseFloat(after.stored as string)).toBeCloseTo(after.pct, 0);
});
