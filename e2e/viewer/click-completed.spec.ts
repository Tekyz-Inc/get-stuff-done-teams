// M52 — click-completed journey spec.
//
// BUG (pre-M52): the rail click + hashchange handlers early-returned for ANY
// spawn-id with the `in-session-` prefix. But ALL completed conversations in
// the COMPLETED rail section are `in-session-*` (that's how the M45 D2 hook
// captures them), so clicking ANY completed entry did nothing.
//
// FIX: only block the LIVE main session id (the one currently streamed by the
// top pane via /api/main-session). Historical in-session conversations route
// to the bottom pane normally via connect(id).
//
// JOURNEY:
//   1. Rail renders 1 active main session (top pane) and 3 completed
//      in-session conversations (alpha/beta/gamma).
//   2. Click each completed entry → bottom pane shows that entry's body.
//   3. Click the active main entry → bottom pane does NOT change.
//   4. location.hash updates per click; sessionStorage persists across reload.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';

const MAIN_SID = 'live-main-aaaaaaaaaaaaaaaa';
const MAIN_ID = 'in-session-' + MAIN_SID;
const COMPLETED = [
  { sid: 'completed-alpha-bbbbbbbbbbbbbbbb', tag: 'ALPHA-CONVO-MARKER-1f7c' },
  { sid: 'completed-beta-cccccccccccccccc',  tag: 'BETA-CONVO-MARKER-2e8d' },
  { sid: 'completed-gamma-dddddddddddddddd', tag: 'GAMMA-CONVO-MARKER-3a9e' },
];
const MAIN_TAG = 'LIVE-MAIN-MARKER-must-not-leak-to-bottom';

const ACTIVE_WINDOW_MS = 30_000; // matches IN_SESSION_ACTIVE_WINDOW_MS

test.beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-click-completed-'));
  const fixtureDir = path.join(tmp, 'gsd-t-fixture');
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });

  // Live main session: most-recent mtime so /api/main-session selects it,
  // and within the 30s active window so it's classified as `active` (not
  // bucketed into Completed).
  const mainPath = path.join(tDir, MAIN_ID + '.ndjson');
  fs.writeFileSync(mainPath, JSON.stringify({ type: 'user_turn', ts: '2026-05-06T13:00:00Z', content: MAIN_TAG }) + '\n');

  // Completed in-session conversations: write each, then push mtime back
  // beyond the 30s active window so they bucket as `completed`.
  const old = (Date.now() - (ACTIVE_WINDOW_MS + 60_000)) / 1000; // 1.5 min ago
  for (let i = 0; i < COMPLETED.length; i++) {
    const c = COMPLETED[i];
    const p = path.join(tDir, 'in-session-' + c.sid + '.ndjson');
    const ts = `2026-05-06T12:0${i}:00Z`;
    fs.writeFileSync(p, JSON.stringify({ type: 'user_turn', ts, content: c.tag }) + '\n');
    fs.utimesSync(p, old - i * 10, old - i * 10); // staggered, all > 30s old
  }
  // Bump the main file mtime to be most-recent.
  const nowSec = Date.now() / 1000;
  fs.utimesSync(mainPath, nowSec, nowSec);

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

// Same pane-attribution init script as dual-pane.spec.ts: MutationObservers on
// each pane element so we can prove which pane received which content.
function paneAttributionInitScript() {
  return () => {
    (window as any).__topPaneFrameContents = [] as string[];
    (window as any).__bottomPaneFrameContents = [] as string[];
    function attach() {
      const top = document.getElementById('main-stream');
      const bot = document.getElementById('stream');
      if (top) {
        new MutationObserver((muts) => {
          for (const m of muts) {
            for (const n of Array.from(m.addedNodes)) {
              const t = (n as HTMLElement).innerText || (n as HTMLElement).textContent || '';
              if (t) (window as any).__topPaneFrameContents.push(t);
            }
          }
        }).observe(top, { childList: true, subtree: true });
      }
      if (bot) {
        new MutationObserver((muts) => {
          for (const m of muts) {
            for (const n of Array.from(m.addedNodes)) {
              const t = (n as HTMLElement).innerText || (n as HTMLElement).textContent || '';
              if (t) (window as any).__bottomPaneFrameContents.push(t);
            }
          }
        }).observe(bot, { childList: true, subtree: true });
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
    } else {
      attach();
    }
  };
}

async function bottomContents(page: any): Promise<string[]> {
  return await page.evaluate(() => Array.from((window as any).__bottomPaneFrameContents || []));
}
async function topContents(page: any): Promise<string[]> {
  return await page.evaluate(() => Array.from((window as any).__topPaneFrameContents || []));
}

async function waitForBottomToContain(page: any, marker: string, timeoutMs = 4000) {
  const t0 = Date.now();
  for (;;) {
    const c = await bottomContents(page);
    if (c.some((s) => s.includes(marker))) return;
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(`bottom pane never received marker "${marker}"; got: ${JSON.stringify(c)}`);
    }
    await page.waitForTimeout(75);
  }
}

test('rail renders 1 main session + 3 completed in-session entries', async ({ page }) => {
  await page.addInitScript(paneAttributionInitScript());
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#rail-main-body', { timeout: 5000 });
  await page.waitForSelector('#rail-completed-body', { timeout: 5000 });
  // First poll is async; wait for the rail to finish populating.
  await page.waitForFunction(
    (sids) => {
      const main = document.querySelectorAll('#rail-main-body .node');
      const completed = document.querySelectorAll('#rail-completed-body .node');
      const completedNames = Array.from(completed).map((n) => (n.textContent || '')).join(' ');
      return (
        main.length === 1 &&
        completed.length === sids.length &&
        sids.every((s: string) => completedNames.includes(s.slice(-8)))
      );
    },
    COMPLETED.map((c) => c.sid),
    { timeout: 6000 },
  );
});

test('clicking each completed entry loads it into the BOTTOM pane (and TOP pane stays on the live main session)', async ({ page }) => {
  await page.addInitScript(paneAttributionInitScript());
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#rail-completed-body .node', { timeout: 5000 });
  // Wait for top pane to bind so __mainSessionId is set.
  await page.waitForFunction(() => (window as any).__mainSessionId, { timeout: 5000 });
  // Wait for top pane to receive the MAIN_TAG so we can compare snapshots.
  await page.waitForFunction(
    (mark) => ((window as any).__topPaneFrameContents || []).some((s: string) => s.includes(mark)),
    MAIN_TAG,
    { timeout: 5000 },
  );
  const topBefore = await topContents(page);

  for (const c of COMPLETED) {
    const id = 'in-session-' + c.sid;
    const node = page.locator(`#rail-completed-body .node`).filter({ hasText: c.sid.slice(-8) });
    await expect(node).toHaveCount(1);
    await node.click();
    // location.hash updates.
    await page.waitForFunction(
      (expected) => location.hash === '#' + expected,
      id,
      { timeout: 3000 },
    );
    // Bottom pane receives this conversation's content.
    await waitForBottomToContain(page, c.tag);
  }

  // Final state: bottom pane must contain ALL three completed markers
  // (cumulative across the 3 clicks).
  const bot = await bottomContents(page);
  for (const c of COMPLETED) {
    expect(bot.some((s) => s.includes(c.tag))).toBe(true);
  }
  // Bottom pane MUST NOT have received the live-main marker.
  expect(bot.some((s) => s.includes(MAIN_TAG))).toBe(false);

  // Negative assertion: TOP pane must NOT have been clobbered with any of
  // the historical conversation content (catches adversary-c — routing the
  // click to the top pane instead of the bottom).
  const topAfter = await topContents(page);
  const topNew = topAfter.slice(topBefore.length);
  for (const c of COMPLETED) {
    expect(topNew.some((s) => s.includes(c.tag))).toBe(false);
  }
});

test('clicking the live MAIN entry does NOT load it into the bottom pane', async ({ page }) => {
  await page.addInitScript(paneAttributionInitScript());
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#rail-main-body .node', { timeout: 5000 });
  await page.waitForFunction(() => (window as any).__mainSessionId, { timeout: 5000 });

  // Top pane must contain MAIN_TAG (positive: top pane is wired).
  await page.waitForFunction(
    (mark) => ((window as any).__topPaneFrameContents || []).some((s: string) => s.includes(mark)),
    MAIN_TAG,
    { timeout: 5000 },
  );

  const beforeBot = await bottomContents(page);
  const hashBefore = await page.evaluate(() => location.hash);

  // Click the main entry.
  const mainNode = page.locator('#rail-main-body .node');
  await expect(mainNode).toHaveCount(1);
  await mainNode.click();

  // Allow time for any erroneous hash update + SSE wiring.
  await page.waitForTimeout(600);

  // Negative assertion: hash did NOT change to the main session id.
  const hashAfter = await page.evaluate(() => location.hash);
  expect(hashAfter).toBe(hashBefore);
  expect(hashAfter).not.toBe('#' + MAIN_ID);

  // Negative assertion: bottom pane did not gain the MAIN_TAG.
  const afterBot = await bottomContents(page);
  const newOnly = afterBot.slice(beforeBot.length);
  expect(newOnly.some((s) => s.includes(MAIN_TAG))).toBe(false);
});

test('sessionStorage persists across reload — bottom pane resumes the previously-clicked entry', async ({ page }) => {
  await page.addInitScript(paneAttributionInitScript());
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#rail-completed-body .node', { timeout: 5000 });
  await page.waitForFunction(() => (window as any).__mainSessionId, { timeout: 5000 });

  // Click BETA.
  const beta = COMPLETED[1];
  const betaNode = page.locator(`#rail-completed-body .node`).filter({ hasText: beta.sid.slice(-8) });
  await betaNode.click();
  await waitForBottomToContain(page, beta.tag);

  // Verify sessionStorage now holds the BETA spawn id.
  const storedId = await page.evaluate(() => sessionStorage.getItem('gsd-t.viewer.selectedSpawnId'));
  expect(storedId).toBe('in-session-' + beta.sid);

  // Reload — re-injecting the init script, but sessionStorage survives.
  await page.addInitScript(paneAttributionInitScript());
  await page.reload();
  await page.waitForSelector('#stream', { timeout: 5000 });
  await page.waitForFunction(() => (window as any).__mainSessionId, { timeout: 5000 });

  // Bottom pane should auto-resume the BETA conversation.
  await waitForBottomToContain(page, beta.tag, 5000);
});
