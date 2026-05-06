// M50 D2 Task 4 — viewer title spec (M48 Bug 1 regression).
// M51 D2 — strengthened to require:
//   - exact <title> equality (not just regex contains)
//   - literal `$&` survives the function-form replacement (positive test, not
//     "absence of $&" which trivially passes on an empty page)
//   - basename appears in BOTH the document <title> AND the visible
//     header `.title` element (DOM, not just HTML source string)

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let backrefServer: any = null;
let backrefBaseUrl: string = '';

const FIXTURE_BASENAME = 'gsd-t-fixture';
// Literal `$&` substring — when re-injected via String.replace(rx, escapedName)
// in plain-string form, the regex engine interprets $& as the matched text and
// re-injects the placeholder fragment. Function-form replacement (the M48 fix
// in the server) defuses this. We assert the LITERAL substring survives.
const BACKREF_BASENAME = 'gsd-t-fix$&ture';

test.beforeAll(async () => {
  // Standard fixture
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-title-'));
  const fixtureDir = path.join(tmp, FIXTURE_BASENAME);
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'transcripts'), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  const ndjson = JSON.stringify({ type: 'session_start', ts: '2026-05-06T00:00:00Z' }) + '\n';
  fs.writeFileSync(
    path.join(fixtureDir, '.gsd-t', 'transcripts', `${FIXTURE_BASENAME}-spawn-aaaaaaaaaaaaaaaa.ndjson`),
    ndjson,
  );
  const eventsDir = path.join(fixtureDir, '.gsd-t', 'events');
  const htmlPath = path.join(__dirname, '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.join(__dirname, '..', '..', 'scripts', 'gsd-t-transcript.html');
  // Port 0 → OS picks an ephemeral free port (avoids EADDRINUSE collisions
  // when Playwright runs specs in parallel workers).
  const result = startServer(0, eventsDir, htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  server = result.server;
  await new Promise<void>((r) => server.once('listening', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  // Backref-defence fixture (literal `$&` substring in basename).
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-title-backref-'));
  const backrefDir = path.join(tmp2, BACKREF_BASENAME);
  fs.mkdirSync(path.join(backrefDir, '.gsd-t', 'transcripts'), { recursive: true });
  fs.mkdirSync(path.join(backrefDir, '.gsd-t', 'events'), { recursive: true });
  fs.writeFileSync(
    path.join(backrefDir, '.gsd-t', 'transcripts', `gsd-t-spawn-eeeeeeeeeeeeeeee.ndjson`),
    ndjson,
  );
  const events2 = path.join(backrefDir, '.gsd-t', 'events');
  const result2 = startServer(0, events2, htmlPath, backrefDir, transcriptHtmlPath, { idleTtlMs: 0 });
  backrefServer = result2.server;
  await new Promise<void>((r) => backrefServer.once('listening', () => r()));
  backrefBaseUrl = `http://127.0.0.1:${(backrefServer.address() as any).port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (backrefServer) await new Promise<void>((resolve) => backrefServer.close(() => resolve()));
});

test('M48 Bug 1: <title> exactly equals basename on /transcripts', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  // M51: exact title equality, not regex contains. A regression that hard-codes
  // a different basename (or leaves the placeholder) would slip a regex match.
  await expect(page).toHaveTitle(FIXTURE_BASENAME);
});

test('M48 Bug 1: header .title displays basename text on /transcripts', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  // M51: assert visible header text via DOM selector, not just HTML source.
  // A regression that injects the basename only into <title> but leaves
  // .title as `__PROJECT_NAME__` would slip a `page.content().contains(...)`.
  const titleText = await page.locator('header .title, .title').first().innerText();
  expect(titleText.trim()).toBe(FIXTURE_BASENAME);
});

test('M48 Bug 1: <title> exactly equals basename on /transcript/{spawn-id}', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/${FIXTURE_BASENAME}-spawn-aaaaaaaaaaaaaaaa`);
  await expect(page).toHaveTitle(FIXTURE_BASENAME);
});

test('M48 Bug 1: literal `$&` in basename survives function-form replacement', async ({ page }) => {
  // M51: this is the POSITIVE test of the backref defence. We don't assert
  // "the rendered HTML lacks $&" (which trivially passes on empty pages); we
  // assert the literal `$&` SURVIVES, proving the function-form replacement
  // is in effect.
  await page.goto(`${backrefBaseUrl}/transcripts`);
  // Browser unescapes &amp; → & for both <title> and rendered DOM text.
  // So the live document.title contains literal `$&`.
  const titleText = await page.title();
  expect(titleText).toBe(BACKREF_BASENAME);

  const headerText = await page.locator('header .title, .title').first().innerText();
  expect(headerText.trim()).toBe(BACKREF_BASENAME);

  // Defence in depth: the placeholder `__PROJECT_NAME__` must NOT appear
  // anywhere in the rendered document — covers the regression where a
  // string-form replace re-injects the placeholder via the $& backref.
  const html = await page.content();
  expect(html).not.toContain('__PROJECT_NAME__');
});
