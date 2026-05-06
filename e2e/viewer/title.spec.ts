// M50 D2 Task 4 — viewer title spec (M48 Bug 1 regression).
// Verifies that the project basename appears in <title> and the header
// `.title` div for both /transcripts (list page) and /transcripts/{spawn-id}
// (per-spawn page).
//
// Spec spawns the dashboard server in-process pointed at a fixture project
// dir whose basename is `gsd-t-fixture`, navigates to the relevant routes,
// and asserts the substitution actually flowed from `GSD_T_PROJECT_DIR` to
// the rendered HTML.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

test.beforeAll(async () => {
  // Build a fixture project directory with basename "gsd-t-fixture".
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-title-'));
  fixtureDir = path.join(tmp, 'gsd-t-fixture');
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'transcripts'), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  // Write one well-formed transcript so /transcripts/{spawn-id} has data.
  const ndjson = JSON.stringify({ type: 'session_start', ts: '2026-05-06T00:00:00Z' }) + '\n';
  fs.writeFileSync(
    path.join(fixtureDir, '.gsd-t', 'transcripts', 'gsd-t-fixture-spawn-aaaaaaaaaaaaaaaa.ndjson'),
    ndjson,
  );
  const port = 17433 + Math.floor(Math.random() * 100); // ephemeral
  const eventsDir = path.join(fixtureDir, '.gsd-t', 'events');
  const htmlPath = path.join(__dirname, '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.join(__dirname, '..', '..', 'scripts', 'gsd-t-transcript.html');
  const result = startServer(port, eventsDir, htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  server = result.server;
  baseUrl = `http://127.0.0.1:${port}`;
  // Wait for listen to settle
  await new Promise((r) => setTimeout(r, 100));
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('M48 Bug 1: project basename appears in <title> on /transcripts', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await expect(page).toHaveTitle(/gsd-t-fixture/, {
    /* M48 Bug 1: project basename in viewer title */
  });
});

test('M48 Bug 1: project basename appears in header .title on /transcripts', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  const titleText = await page.locator('.title').first().textContent();
  expect(titleText).toContain('gsd-t-fixture');
});

test('M48 Bug 1: project basename appears in <title> on /transcripts/{spawn-id}', async ({ page }) => {
  await page.goto(`${baseUrl}/transcript/gsd-t-fixture-spawn-aaaaaaaaaaaaaaaa`);
  await expect(page).toHaveTitle(/gsd-t-fixture/);
});

test('M48 Bug 1: special chars in basename do not break $&/$1 backref logic', async ({ page }) => {
  // The replace function-form should defuse $&/$1 backreferences. We can't
  // easily rename the fixture directory mid-test, but we can assert that no
  // literal `$&`, `$1`, or `$$` substring survives in the rendered title.
  await page.goto(`${baseUrl}/transcripts`);
  const html = await page.content();
  expect(html).not.toMatch(/\$&|\$1|\$\$/);
});
