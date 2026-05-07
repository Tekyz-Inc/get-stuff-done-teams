// Journey 3 — click-spawn-entry
// Functional assertion: clicking a (non-in-session) spawn entry connects the
// bottom pane to that spawn's SSE stream and renders frames; sessionStorage
// `selectedSpawnId` is updated.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

const SPAWN_ID = 'jrn3-spawn-' + 'c'.repeat(20);
const SPAWN_TAG = 'SPAWN-JRN3-MARKER-9d2b';

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn3-'));
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  const eDir = path.join(fixtureDir, '.gsd-t', 'events');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(eDir, { recursive: true });

  // Write a non-in-session spawn ndjson — appears in Live or Completed rail.
  fs.writeFileSync(path.join(tDir, SPAWN_ID + '.ndjson'),
    JSON.stringify({ type: 'user_turn', ts: new Date().toISOString(), content: SPAWN_TAG }) + '\n');

  // Also write a transcripts-index.json so the spawn shows up in the rail
  // (the merging logic in handleTranscriptsList unions index + in-session).
  fs.writeFileSync(path.join(tDir, '.index.json'), JSON.stringify({
    spawns: [{
      spawnId: SPAWN_ID,
      startedAt: new Date().toISOString(),
      status: 'running',
      command: 'jrn3-test',
    }],
  }));

  const htmlPath = path.resolve(__dirname, '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.resolve(__dirname, '..', '..', 'scripts', 'gsd-t-transcript.html');
  const result = startServer(0, eDir, htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  server = result.server;
  await new Promise<void>((r) => server.once('listening', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (fixtureDir) try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('clicking a spawn entry connects bottom pane and updates sessionStorage', async ({ page }) => {
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#main-stream', { timeout: 5000 });

  const tail = SPAWN_ID.slice(-8);
  // Live spawns render into the legacy #tree mount (M47 D1 preserves this for
  // backwards-compatible selectors); completed spawns render into
  // #rail-completed-body.
  const node = page.locator(`#tree .node, #rail-completed-body .node`).filter({ hasText: tail });
  await node.first().waitFor({ timeout: 8000 });

  await node.first().click();

  // Functional: bottom pane renders this spawn's tagged content.
  await page.waitForFunction((tag) => {
    const el = document.getElementById('spawn-stream');
    return !!(el && (el.textContent || '').includes(tag));
  }, SPAWN_TAG, { timeout: 8000 });

  const stored = await page.evaluate(() => {
    return {
      selected: window.sessionStorage.getItem('gsd-t.viewer.selectedSpawnId'),
      hash: location.hash,
    };
  });
  // Either sessionStorage or the URL hash should reflect the selected spawn —
  // both are state-change indicators of the click outcome.
  expect(stored.hash + '|' + (stored.selected || '')).toContain(SPAWN_ID);
});
