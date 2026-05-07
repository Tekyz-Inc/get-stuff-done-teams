// Journey 9 — kill-button
// Functional assertion: clicking the kill button on a spawn entry triggers
// POST /transcript/:id/kill AND the button text mutates to reflect the
// server response. We dismiss the confirm dialog via auto-handler so the
// click reaches the fetch.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let fixtureDir: string = '';

const SPAWN_ID = 'jrn9-kill-' + 'd'.repeat(20);

test.beforeAll(async () => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jrn9-'));
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  const eDir = path.join(fixtureDir, '.gsd-t', 'events');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(eDir, { recursive: true });
  fs.writeFileSync(path.join(tDir, SPAWN_ID + '.ndjson'),
    JSON.stringify({ type: 'user_turn', ts: new Date().toISOString(), content: 'KILL-TARGET' }) + '\n');
  // Mark as running with a workerPid so the kill button is enabled.
  fs.writeFileSync(path.join(tDir, '.index.json'), JSON.stringify({
    spawns: [{
      spawnId: SPAWN_ID,
      startedAt: new Date().toISOString(),
      status: 'running',
      command: 'jrn9-test',
      workerPid: 999999, // sentinel PID — kill request will fire but no real process will receive SIGTERM
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

test('click kill → POST /transcript/:id/kill fired → button text updates', async ({ page }) => {
  let killUrl: string | null = null;
  let killMethod: string | null = null;
  page.on('request', (req) => {
    if (req.url().includes('/kill')) { killUrl = req.url(); killMethod = req.method(); }
  });
  // Auto-accept confirm() so the kill goes through.
  page.on('dialog', (d) => d.accept());

  await page.goto(`${baseUrl}/transcripts`);
  const tail = SPAWN_ID.slice(-8);
  const node = page.locator(`#tree .node, #rail-completed-body .node`).filter({ hasText: tail });
  await node.first().waitFor({ timeout: 8000 });

  const killBtn = node.first().locator('button.kill');
  await killBtn.waitFor({ timeout: 3000 });

  const beforeText = await killBtn.textContent();

  await killBtn.click();

  await page.waitForFunction(() => true, null, { timeout: 1500 });

  expect(killUrl).not.toBeNull();
  expect(killUrl).toContain(SPAWN_ID);
  expect(killMethod).toEqual('POST');

  // Button should reflect the server response (e.g. "killed" / "err" / status).
  const afterText = await killBtn.textContent();
  expect(afterText).not.toEqual(beforeText);
});
