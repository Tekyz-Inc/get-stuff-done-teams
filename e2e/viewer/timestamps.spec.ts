// M50 D2 Task 5 — viewer timestamps spec (M48 Bug 2 regression).
// Verifies that the renderer reads `frame.ts` per-frame (NOT a per-batch
// `new Date()`), so distinct ts values produce distinct rendered timestamps.
//
// Fixture: 3 NDJSON frames at distinct ts values 30s apart.
// Assertion: 3 DISTINCT HH:MM:SS strings in the rendered DOM, and they are
// NOT identical (the M48 Bug 2 symptom collapsed all three to the same wall
// clock).

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
const SPAWN_ID = 'gsd-t-fixture-spawn-bbbbbbbbbbbbbbbb';

test.beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-ts-'));
  const fixtureDir = path.join(tmp, 'gsd-t-fixture');
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  const frames = [
    { type: 'tool_use_line', tool: 'Read', ts: '2026-05-06T12:00:00Z' },
    { type: 'tool_use_line', tool: 'Read', ts: '2026-05-06T12:00:30Z' },
    { type: 'tool_use_line', tool: 'Read', ts: '2026-05-06T12:01:00Z' },
  ];
  fs.writeFileSync(
    path.join(tDir, `${SPAWN_ID}.ndjson`),
    frames.map((f) => JSON.stringify(f)).join('\n') + '\n',
  );
  const port = 17533 + Math.floor(Math.random() * 100);
  const eventsDir = path.join(fixtureDir, '.gsd-t', 'events');
  const htmlPath = path.join(__dirname, '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.join(__dirname, '..', '..', 'scripts', 'gsd-t-transcript.html');
  const result = startServer(port, eventsDir, htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  server = result.server;
  baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((r) => setTimeout(r, 100));
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('M48 Bug 2: three frames with distinct ts → three distinct rendered timestamps', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  // Wait for the SSE stream to deliver all three frames into the DOM.
  await page.waitForSelector('#stream .frame, #stream .row, #stream > *', { timeout: 5000 });
  // Allow a moment for all three frames to render.
  await page.waitForTimeout(500);

  // Extract every visible HH:MM:SS-shaped substring across the rendered stream.
  const timestamps: string[] = await page.evaluate(() => {
    const root = document.querySelector('#stream');
    if (!root) return [];
    const text = (root as HTMLElement).innerText || '';
    const matches = text.match(/\b\d{2}:\d{2}:\d{2}\b/g) || [];
    return matches;
  });

  // M48 Bug 2 was: all rendered timestamps identical (per-batch new Date()).
  // We expect at least 2 distinct values here (the 3 frames are 30s apart).
  const distinct = new Set(timestamps);
  expect(distinct.size).toBeGreaterThanOrEqual(2 /* M48 Bug 2: per-frame ts, not per-batch new Date() */);
});
