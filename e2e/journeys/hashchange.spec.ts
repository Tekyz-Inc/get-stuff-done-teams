// Journey 12 — hashchange
// Functional assertion: changing location.hash to a non-live spawn id loads
// that spawn into the bottom pane WITHOUT the live main session id leaking
// into the bottom (M48 Bug 4 + M52 narrowed-guard regression).

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

const MAIN_SID = 'live-main-jrn12-' + 'e'.repeat(15);
const MAIN_ID = 'in-session-' + MAIN_SID;
const COMPLETED_SID = 'completed-jrn12-' + 'f'.repeat(16);
const COMPLETED_ID = 'in-session-' + COMPLETED_SID;
const COMPLETED_TAG = 'COMPLETED-JRN12-MARKER-bd7c';
const MAIN_TAG = 'LIVE-MAIN-JRN12-MARKER-do-not-mirror';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn12-'));
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });

  // Live main: most recent, in active window.
  fs.writeFileSync(path.join(tDir, MAIN_ID + '.ndjson'),
    JSON.stringify({ type: 'user_turn', ts: new Date().toISOString(), content: MAIN_TAG }) + '\n');

  // Completed: older.
  const oldPath = path.join(tDir, COMPLETED_ID + '.ndjson');
  fs.writeFileSync(oldPath,
    JSON.stringify({ type: 'user_turn', ts: '2026-05-01T13:00:00Z', content: COMPLETED_TAG }) + '\n');
  fs.utimesSync(oldPath, new Date('2026-05-01T13:00:00Z'), new Date('2026-05-01T13:00:00Z'));

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

test('hashchange to a completed-id loads bottom pane with that conversation', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#main-stream', { timeout: 5000 });
  await page.waitForFunction(() => !!(window as any).__mainSessionId, { timeout: 5000 });

  // Mutate location.hash AFTER initial load so the hashchange listener fires.
  await page.evaluate((id) => { location.hash = '#' + id; }, COMPLETED_ID);

  // Bottom pane should fetch + render the completed conversation.
  await page.waitForFunction((tag) => {
    const el = document.getElementById('spawn-stream');
    return !!(el && (el.textContent || '').includes(tag));
  }, COMPLETED_TAG, { timeout: 8000 });

  const bottom = await page.evaluate(() => {
    const el = document.getElementById('spawn-stream');
    return (el?.textContent || '').trim();
  });
  expect(bottom).toContain(COMPLETED_TAG);
  expect(bottom).not.toContain(MAIN_TAG);

  // Now mutate location.hash to a different completed id mid-session.
  // Use the same id for simplicity (re-trigger hashchange with same value
  // doesn't fire — change to bare hash then back to confirm the handler
  // doesn't crash and the main pane is unaffected).
  const mainBefore = await page.evaluate(() => (document.getElementById('main-stream')?.textContent || '').slice(0, 200));

  await page.evaluate((id) => { location.hash = '#' + id; }, '');
  await page.evaluate((id) => { location.hash = '#' + id; }, COMPLETED_ID);
  await page.waitForFunction(() => true, null, { timeout: 500 });

  const mainAfter = await page.evaluate(() => (document.getElementById('main-stream')?.textContent || '').slice(0, 200));
  // Main pane content must not have changed in response to the hash-change;
  // hashchange only routes the BOTTOM pane.
  expect(mainAfter).toEqual(mainBefore);
});
