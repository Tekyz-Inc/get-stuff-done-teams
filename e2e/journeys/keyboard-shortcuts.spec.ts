// Journey 11 — keyboard-shortcuts
// Functional assertion: the documented keyboard shortcuts on the splitter
// (ArrowUp/ArrowDown/Home/End) produce the documented state changes. This
// spec covers the FULL set of shortcuts on the focused element to prove
// each ev.key branch in the splitter:keydown listener is wired correctly.
//
// We verify each shortcut produces the contractual --main-pane-pct value
// (Home → 20, End → 80, ArrowDown → +5, ArrowUp → -5).

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn11-'));
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

async function readPct(page: any): Promise<number> {
  return await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) || 50);
}

test('Home → 20, End → 80, ArrowUp/Down each shift by 5', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#splitter', { timeout: 5000 });
  await page.locator('#splitter').focus();

  await page.keyboard.press('Home');
  await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) - 20) < 1, null, { timeout: 4000 });
  expect(await readPct(page)).toBeCloseTo(20, 0);

  await page.keyboard.press('End');
  await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) - 80) < 1, null, { timeout: 4000 });
  expect(await readPct(page)).toBeCloseTo(80, 0);

  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) - 75) < 1, null, { timeout: 4000 });
  expect(await readPct(page)).toBeCloseTo(75, 0);

  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-pane-pct')) - 80) < 1, null, { timeout: 4000 });
  expect(await readPct(page)).toBeCloseTo(80, 0);
});
