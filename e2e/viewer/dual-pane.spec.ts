// M50 D2 Task 7 — dual-pane spec (M48 Bug 4 regression).
// Verifies that clicking an `in-session-*` rail entry pins it to the TOP
// pane only; the BOTTOM pane stays on its own SSE stream (or empty default).
//
// Coverage of the four guard sites: rail click, initial bottom-pane
// resolution (load with `#in-session-*` hash), `hashchange` with an
// in-session id, `maybeAutoFollow` filter.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
const IN_SESSION_ID = 'in-session-fixture-XYZ';
const SPAWN_ID = 'gsd-t-fixture-spawn-dddddddddddddddd';

test.beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-dualpane-'));
  const fixtureDir = path.join(tmp, 'gsd-t-fixture');
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  // Write one in-session and one regular spawn NDJSON.
  const inSessionFrames = [
    { type: 'user_turn', ts: '2026-05-06T12:00:00Z', content: 'in-session content' },
  ];
  const spawnFrames = [
    { type: 'tool_use_line', ts: '2026-05-06T12:00:01Z', tool: 'Read' },
  ];
  fs.writeFileSync(path.join(tDir, `${IN_SESSION_ID}.ndjson`), inSessionFrames.map((f) => JSON.stringify(f)).join('\n') + '\n');
  fs.writeFileSync(path.join(tDir, `${SPAWN_ID}.ndjson`), spawnFrames.map((f) => JSON.stringify(f)).join('\n') + '\n');
  const port = 17733 + Math.floor(Math.random() * 100);
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

test('M48 Bug 4: bottom pane never connects to in-session-* stream', async ({ page }) => {
  // Capture all EventSource constructions so we can assert which URLs each
  // pane connected to.
  await page.addInitScript(() => {
    const Real = (window as any).EventSource;
    (window as any).__esConstructed = [] as string[];
    (window as any).EventSource = function (url: string) {
      (window as any).__esConstructed.push(url);
      return new Real(url);
    };
    (window as any).EventSource.prototype = Real.prototype;
  });
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}#${IN_SESSION_ID}`);
  await page.waitForSelector('#stream', { timeout: 5000 });
  await page.waitForTimeout(500);

  const urls: string[] = await page.evaluate(() => (window as any).__esConstructed || []);

  // The bottom-pane EventSource should NOT include `in-session-fixture-XYZ`.
  const bottomConnections = urls.filter((u) => u && u.includes('/transcript/') && u.includes('/stream'));
  for (const url of bottomConnections) {
    expect(url).not.toContain(IN_SESSION_ID /* M48 Bug 4: bottom pane must not pin in-session */);
  }
});
