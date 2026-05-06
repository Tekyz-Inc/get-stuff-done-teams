// M50 D2 Task 6 — chat-bubbles spec (M48 Bug 3 regression).
// M51 D2 — strengthened to assert:
//   - exact CSS classes on each frame: .frame.user.user-turn,
//     .frame.assistant-turn, .frame.session-start, .frame.tool-call-line
//   - structural elements (.body for turns, .badge for session-start, etc.)
//   - tool_use frame coverage (4th renderer per M48 dispatch)
//   - .truncated-tag span when frame.truncated === true
//
// A `<div>hello</div>` (raw text without classes) MUST NOT pass these checks.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
const SPAWN_ID = 'gsd-t-fixture-spawn-cccccccccccccccc';
const SESSION_ID_HEX = 'abcdef0123456789';

test.beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-bubbles-'));
  const fixtureDir = path.join(tmp, 'gsd-t-fixture');
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  const frames: any[] = [
    { type: 'session_start', ts: '2026-05-06T12:00:00Z', session_id: SESSION_ID_HEX },
    { type: 'user_turn', ts: '2026-05-06T12:00:01Z', content: 'hello-user-content' },
    { type: 'assistant_turn', ts: '2026-05-06T12:00:02Z', content: 'hi-assistant-content' },
    { type: 'tool_use', ts: '2026-05-06T12:00:03Z', name: 'Read' },
    // Truncated user turn for the truncated-tag test
    { type: 'user_turn', ts: '2026-05-06T12:00:04Z', content: 'truncated-content', truncated: true },
  ];
  fs.writeFileSync(
    path.join(tDir, `${SPAWN_ID}.ndjson`),
    frames.map((f) => JSON.stringify(f)).join('\n') + '\n',
  );
  const eventsDir = path.join(fixtureDir, '.gsd-t', 'events');
  const htmlPath = path.join(__dirname, '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.join(__dirname, '..', '..', 'scripts', 'gsd-t-transcript.html');
  const result = startServer(0, eventsDir, htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  server = result.server;
  await new Promise<void>((r) => server.once('listening', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('M48 Bug 3: user_turn renders as .frame.user.user-turn with .body content', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#stream .frame').length >= 5, undefined, { timeout: 5000 });

  // M51: assert the EXACT CSS classes the renderer applies. A naive
  // regression that wraps `JSON.stringify(frame)` in a <div> WITHOUT classes
  // (or with the wrong classes) fails this test.
  // Fixture has 2 user_turn frames (one normal, one truncated).
  await expect(page.locator('#stream .frame.user.user-turn')).toHaveCount(2);
  const userTurn = page.locator('#stream .frame.user.user-turn').first();
  await expect(userTurn.locator('.body')).toHaveText('hello-user-content');
  await expect(userTurn.locator('.prefix')).toHaveText('>');
});

test('M48 Bug 3: assistant_turn renders as .frame.assistant-turn with .body content', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream .frame', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#stream .frame').length >= 5, undefined, { timeout: 5000 });

  const at = page.locator('#stream .frame.assistant-turn').first();
  await expect(page.locator('#stream .frame.assistant-turn')).toHaveCount(1);
  await expect(at.locator('.body')).toHaveText('hi-assistant-content');
  await expect(at.locator('.prefix')).toHaveText('⏺');
});

test('M48 Bug 3: session_start renders as .frame.session-start with .badge', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream .frame', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#stream .frame').length >= 5, undefined, { timeout: 5000 });

  const ss = page.locator('#stream .frame.session-start').first();
  await expect(page.locator('#stream .frame.session-start')).toHaveCount(1);
  await expect(ss.locator('.badge')).toHaveText('◆ session');
  // Truncated session_id (first 8 chars) must appear in the bubble.
  await expect(ss).toContainText(SESSION_ID_HEX.slice(0, 8));
});

test('M48 Bug 3: tool_use renders as .frame.tool-call-line', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream .frame', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#stream .frame').length >= 5, undefined, { timeout: 5000 });

  // 4th renderer per M48 dispatch table.
  const tu = page.locator('#stream .frame.tool-call-line').first();
  await expect(page.locator('#stream .frame.tool-call-line')).toHaveCount(1);
  await expect(tu).toContainText('Read');
});

test('M48 Bug 3: known frame types do NOT render as JSON.stringify dumps', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream .frame', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#stream .frame').length >= 5, undefined, { timeout: 5000 });

  const streamText = await page.locator('#stream').first().innerText();
  expect(streamText).not.toContain('{"type":"user_turn"');
  expect(streamText).not.toContain('{"type":"assistant_turn"');
  expect(streamText).not.toContain('{"type":"session_start"');
  expect(streamText).not.toContain('{"type":"tool_use"');

  // No `.frame.raw` (the JSON-dump fallback) should be present for these
  // 4 known types — proves the dispatch fired before the fallback.
  await expect(page.locator('#stream .frame.raw')).toHaveCount(0);
});

test('M51 strengthen: truncated user_turn shows .truncated-tag span', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream .frame', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#stream .frame').length >= 5, undefined, { timeout: 5000 });

  // Two user_turn frames in fixture: first NOT truncated, second IS.
  // Only the second should have a .truncated-tag span.
  const turns = page.locator('#stream .frame.user.user-turn');
  await expect(turns).toHaveCount(2);
  await expect(turns.nth(0).locator('.truncated-tag')).toHaveCount(0);
  await expect(turns.nth(1).locator('.truncated-tag')).toHaveCount(1);
  await expect(turns.nth(1).locator('.truncated-tag')).toHaveText('(truncated)');
});
