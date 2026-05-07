// Journey 7 — completed-collapse-toggle
// Functional assertion: clicking #rail-completed-toggle flips the
// data-expanded attribute on section.rail-completed AND persists
// gsd-t.viewer.completedExpanded in sessionStorage.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn7-'));
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

test('toggle flips data-expanded and persists completedExpanded', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#rail-completed-toggle', { timeout: 5000 });

  const before = await page.evaluate(() => ({
    expanded: document.querySelector('section.rail-completed')?.getAttribute('data-expanded'),
    stored: window.sessionStorage.getItem('gsd-t.viewer.completedExpanded'),
  }));

  await page.click('#rail-completed-toggle');

  await page.waitForFunction((b) => {
    return document.querySelector('section.rail-completed')?.getAttribute('data-expanded') !== b;
  }, before.expanded, { timeout: 3000 });

  const after = await page.evaluate(() => ({
    expanded: document.querySelector('section.rail-completed')?.getAttribute('data-expanded'),
    stored: window.sessionStorage.getItem('gsd-t.viewer.completedExpanded'),
  }));

  expect(after.expanded).not.toEqual(before.expanded);
  expect(after.stored).not.toBeNull();
  expect(['0', '1']).toContain(after.stored);
});
