// Journey 8 — auto-follow-toggle
// Functional assertion: toggling #auto-follow checkbox flips its `checked`
// state AND persists `gsdt.autoFollow` in localStorage. The downstream
// behavior (scroll-to-newest) is covered indirectly — the test asserts the
// state mutation that controls it.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn8-'));
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

test('toggling #auto-follow flips checked state and persists localStorage', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#auto-follow', { timeout: 5000 });

  const before = await page.evaluate(() => ({
    checked: (document.getElementById('auto-follow') as HTMLInputElement | null)?.checked,
    stored: window.localStorage.getItem('gsdt.autoFollow'),
  }));

  // Click the checkbox via the underlying input element (the parent label
  // wraps it but Playwright .click() on the input toggles directly).
  await page.click('#auto-follow');

  await page.waitForFunction((b) => {
    const el = document.getElementById('auto-follow') as HTMLInputElement | null;
    return el ? el.checked !== b : false;
  }, before.checked, { timeout: 3000 });

  const after = await page.evaluate(() => ({
    checked: (document.getElementById('auto-follow') as HTMLInputElement | null)?.checked,
    stored: window.localStorage.getItem('gsdt.autoFollow'),
  }));

  expect(after.checked).not.toEqual(before.checked);
  // change handler writes '0' or '1' on every toggle.
  expect(['0', '1']).toContain(after.stored);
});
