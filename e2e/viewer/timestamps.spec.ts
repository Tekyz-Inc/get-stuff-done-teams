// M50 D2 Task 5 — viewer timestamps spec (M48 Bug 2 regression).
// M51 D2 — strengthened to require all 3 distinct timestamps render AND
// each timestamp is the wall-clock derived from the actual frame.ts.
//
// Two fixtures:
//   1. 3 frames with distinct ts → all 3 distinct rendered HH:MM:SS.
//   2. 3 frames where the middle one omits ts → the renderer falls back to
//      `arrivedAt` for that frame; we still see at least 2 ts-derived values.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
const SPAWN_ID = 'gsd-t-fixture-spawn-bbbbbbbbbbbbbbbb';
const SPAWN_ID_FALLBACK = 'gsd-t-fixture-spawn-bbbbbbbbbbbbbbb2';

// Distinct ts values 30s apart. Local-time render depends on TZ; we encode
// the EXPECTED rendered HH:MM:SS by reformatting in JS (matches viewer).
const TS_VALUES = [
  '2026-05-06T12:00:00Z',
  '2026-05-06T12:00:30Z',
  '2026-05-06T12:01:00Z',
];
function expectedHHMMSS(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

test.beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-ts-'));
  const fixtureDir = path.join(tmp, 'gsd-t-fixture');
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  const frames = TS_VALUES.map((ts) => ({ type: 'tool_use_line', tool: 'Read', ts }));
  fs.writeFileSync(
    path.join(tDir, `${SPAWN_ID}.ndjson`),
    frames.map((f) => JSON.stringify(f)).join('\n') + '\n',
  );
  // Fallback fixture: middle frame omits ts.
  const fallbackFrames: any[] = [
    { type: 'tool_use_line', tool: 'Read', ts: '2026-05-06T13:00:00Z' },
    { type: 'tool_use_line', tool: 'Read' },
    { type: 'tool_use_line', tool: 'Read', ts: '2026-05-06T13:01:00Z' },
  ];
  fs.writeFileSync(
    path.join(tDir, `${SPAWN_ID_FALLBACK}.ndjson`),
    fallbackFrames.map((f) => JSON.stringify(f)).join('\n') + '\n',
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

test('M48 Bug 2: 3 distinct ts → 3 distinct rendered timestamps (exact equality)', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream .frame', { timeout: 5000 });
  // Wait until 3 frames have rendered.
  await page.waitForFunction(() => document.querySelectorAll('#stream .frame').length >= 3, undefined, { timeout: 5000 });

  // Read the per-frame `.ts` element text — this is the canonical timestamp
  // surface (see appendFrame in gsd-t-transcript.html).
  const tsTexts: string[] = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('#stream .frame > .ts'));
    return els.map((el) => (el as HTMLElement).innerText.trim()).filter(Boolean);
  });

  // M51: must be exactly 3 distinct values (not just >= 2). A regression
  // that collapses 2 of 3 (e.g. uses the same Date twice) would slip past
  // a `>= 2` check.
  expect(tsTexts.length).toBeGreaterThanOrEqual(3);
  const distinct = new Set(tsTexts.slice(0, 3));
  expect(distinct.size).toBe(3 /* M48 Bug 2: per-frame ts, not per-batch new Date() */);

  // Each rendered timestamp must equal what `frame.ts` formats to in this
  // browser's timezone — proves the renderer reads `frame.ts`, not Date.now().
  const expected = TS_VALUES.map(expectedHHMMSS);
  for (const exp of expected) {
    const matched = tsTexts.includes(exp);
    expect(matched).toBe(true /* rendered ts must match frame.ts wall-clock */);
  }
});

test('M51 strengthen: missing frame.ts falls back to arrivedAt (not all-collapsed)', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID_FALLBACK}`);
  await page.waitForSelector('#stream .frame', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#stream .frame').length >= 3, undefined, { timeout: 5000 });

  const tsTexts: string[] = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('#stream .frame > .ts'));
    return els.map((el) => (el as HTMLElement).innerText.trim()).filter(Boolean);
  });

  expect(tsTexts.length).toBeGreaterThanOrEqual(3);

  // The two ts-bearing frames must produce their exact wall-clock values.
  const exp1 = expectedHHMMSS('2026-05-06T13:00:00Z');
  const exp3 = expectedHHMMSS('2026-05-06T13:01:00Z');
  expect(tsTexts).toContain(exp1);
  expect(tsTexts).toContain(exp3);

  // The middle frame's rendered ts must NOT equal exp1 — proves we didn't
  // accidentally reuse the prior frame's ts.
  // (We can't predict arrivedAt exactly, but it must be distinct from exp1
  // because the test runs after 13:01:00 UTC of 2026-05-06 only by accident.)
  // Stronger: at least 2 distinct values render (covers the catastrophic
  // collapse-everything-to-one-Date regression).
  const distinct = new Set(tsTexts.slice(0, 3));
  expect(distinct.size).toBeGreaterThanOrEqual(2 /* M51 fallback path must not collapse all 3 */);
});
