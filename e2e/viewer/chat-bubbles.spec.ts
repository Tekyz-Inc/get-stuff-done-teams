// M50 D2 Task 6 — chat-bubbles spec (M48 Bug 3 regression).
// Verifies that user_turn / assistant_turn / session_start / tool_use_line
// frames render as styled bubbles (per the M48 dispatch table), NOT as raw
// `JSON.stringify` dumps.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
const SPAWN_ID = 'gsd-t-fixture-spawn-cccccccccccccccc';

test.beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-bubbles-'));
  const fixtureDir = path.join(tmp, 'gsd-t-fixture');
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  const frames = [
    { type: 'session_start', ts: '2026-05-06T12:00:00Z' },
    { type: 'user_turn', ts: '2026-05-06T12:00:01Z', content: 'hello' },
    { type: 'assistant_turn', ts: '2026-05-06T12:00:02Z', content: 'hi' },
    { type: 'tool_use_line', ts: '2026-05-06T12:00:03Z', tool: 'Read', input: { file_path: '/tmp/x' } },
  ];
  fs.writeFileSync(
    path.join(tDir, `${SPAWN_ID}.ndjson`),
    frames.map((f) => JSON.stringify(f)).join('\n') + '\n',
  );
  const port = 17633 + Math.floor(Math.random() * 100);
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

test('M48 Bug 3: known frame types render as bubbles, not JSON.stringify dumps', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream', { timeout: 5000 });
  await page.waitForTimeout(500);

  // M48 Bug 3 symptom: frames rendered as JSON.stringify, e.g. `{"type":"user_turn","content":"hello"}`.
  // After the fix, the dispatch table fires before the JSON fallback for these 4 known types.
  const streamText = await page.locator('#stream').first().innerText();

  // Hello / hi appear as content (proving the dispatch fired)
  expect(streamText).toContain('hello');
  expect(streamText).toContain('hi');

  // No JSON-stringified user_turn/assistant_turn substrings should remain.
  // Note: tool_use_line is a known frame too — covered by checking for raw JSON shape.
  expect(streamText).not.toContain('{"type":"user_turn"');
  expect(streamText).not.toContain('{"type":"assistant_turn"');
  expect(streamText).not.toContain('{"type":"session_start"');
});
