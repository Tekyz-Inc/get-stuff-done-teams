// Journey 2 — click-completed-conversation
// Functional assertion: clicking an entry in the COMPLETED rail section loads
// that conversation's frames into #spawn-stream (bottom pane), AND does NOT
// mirror the live main session id (M48 Bug 4 + M52 narrowed-guard regression).

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let cleanup: (() => void) | null = null;

const MAIN_SID = 'live-main-jrn2-' + 'a'.repeat(16);
const MAIN_ID = 'in-session-' + MAIN_SID;
const COMPLETED_SID = 'completed-jrn2-' + 'b'.repeat(16);
const COMPLETED_ID = 'in-session-' + COMPLETED_SID;
const COMPLETED_TAG = 'COMPLETED-JRN2-MARKER-7f3a';
const MAIN_TAG = 'LIVE-MAIN-JRN2-MARKER-do-not-mirror';

test.beforeAll(async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn2-'));
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });

  // Live main: most-recent mtime + within active window (30s).
  fs.writeFileSync(path.join(tDir, MAIN_ID + '.ndjson'),
    JSON.stringify({ type: 'user_turn', ts: new Date().toISOString(), content: MAIN_TAG }) + '\n');

  // Completed: older mtime → outside active window → bucketed as Completed.
  const oldPath = path.join(tDir, COMPLETED_ID + '.ndjson');
  fs.writeFileSync(oldPath,
    JSON.stringify({ type: 'user_turn', ts: '2026-05-01T13:00:00Z', content: COMPLETED_TAG }) + '\n');
  fs.utimesSync(oldPath, new Date('2026-05-01T13:00:00Z'), new Date('2026-05-01T13:00:00Z'));

  const eventsDir = path.join(fixtureDir, '.gsd-t', 'events');
  const htmlPath = path.resolve(__dirname, '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.resolve(__dirname, '..', '..', 'scripts', 'gsd-t-transcript.html');
  const result = startServer(0, eventsDir, htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  server = result.server;
  await new Promise<void>((r) => server.once('listening', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  cleanup = () => { try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* ignore */ } };
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (cleanup) cleanup();
});

test('clicking a Completed rail entry loads its frames into #spawn-stream', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#main-stream', { timeout: 5000 });
  await page.waitForFunction(() => !!(window as any).__mainSessionId, { timeout: 5000 });

  // Wait for the completed entry to appear in the rail. Locate by the last-8
  // chars of the spawn-id, matching the renderer's display tail.
  const completedTail = COMPLETED_ID.slice(-8);
  const completedNode = page.locator(`#rail-completed-body .node`).filter({ hasText: completedTail });
  await completedNode.first().waitFor({ timeout: 8000 });

  // Capture the bottom pane state before click.
  const bottomBefore = await page.evaluate(() => {
    const el = document.getElementById('spawn-stream');
    return (el?.textContent || '').trim();
  });

  await completedNode.first().click();

  // Functional assertion: the bottom pane fetches the COMPLETED conversation
  // and renders its uniquely-tagged content.
  await page.waitForFunction((tag) => {
    const el = document.getElementById('spawn-stream');
    return !!(el && (el.textContent || '').includes(tag));
  }, COMPLETED_TAG, { timeout: 8000 });

  const bottomAfter = await page.evaluate(() => {
    const el = document.getElementById('spawn-stream');
    return (el?.textContent || '').trim();
  });

  expect(bottomAfter).toContain(COMPLETED_TAG);
  // Live main marker must NOT have leaked into the bottom pane (M48 Bug 4
  // + M52 narrowed guard regression).
  expect(bottomAfter).not.toContain(MAIN_TAG);
  // Hash should reflect the clicked spawn id, not the live main id.
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toContain(COMPLETED_ID);
  expect(hash).not.toContain(MAIN_ID);
  // Confirm STATE actually changed (not just that bottom shell rendered).
  expect(bottomAfter).not.toEqual(bottomBefore);
});
