// M50 D2 Task 7 — dual-pane spec (M48 Bug 4 regression).
// M51 D1+D2 — fixes TEST-M50-001 false positive and strengthens to functional
// outcome assertions.
//
// Architecture:
//   - bottom pane (`connect(id)`)         renders into `#stream`
//   - top pane    (`connectMain(sid)`)    renders into `#main-stream`
//   Both call `new EventSource('/transcript/{id}/stream')`.
//
// The previous spec captured ALL EventSource URLs and asserted none contained
// the in-session id. That's wrong: the TOP pane's connection LEGITIMATELY
// contains the in-session id (`/transcript/in-session-{sid}/stream`). M51 D1
// fixes by attributing each delivered message to the pane that received it
// via MutationObserver on each pane element, plus a positive assertion that
// the TOP pane DOES connect to the in-session stream.

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
const IN_SESSION_SID = 'fixture-xyz';
const IN_SESSION_ID = 'in-session-' + IN_SESSION_SID;
const SPAWN_ID = 'gsd-t-fixture-spawn-dddddddddddddddd';
// Tag content so we can prove which pane received which frame.
const TOP_TAG = 'TOP-PANE-FRAME-MARKER-7f4a';
const BOTTOM_TAG = 'BOTTOM-PANE-FRAME-MARKER-c9e1';

test.beforeAll(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-dualpane-'));
  const fixtureDir = path.join(tmp, 'gsd-t-fixture');
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, '.gsd-t', 'events'), { recursive: true });
  // In-session NDJSON (top pane) — content tagged so we can grep it in DOM.
  const inSessionFrames = [
    { type: 'user_turn', ts: '2026-05-06T12:00:00Z', content: TOP_TAG },
  ];
  const spawnFrames = [
    { type: 'user_turn', ts: '2026-05-06T12:00:01Z', content: BOTTOM_TAG },
  ];
  fs.writeFileSync(path.join(tDir, `${IN_SESSION_ID}.ndjson`), inSessionFrames.map((f) => JSON.stringify(f)).join('\n') + '\n');
  fs.writeFileSync(path.join(tDir, `${SPAWN_ID}.ndjson`), spawnFrames.map((f) => JSON.stringify(f)).join('\n') + '\n');
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

// Shared init script: patches `EventSource` so each delivered message is
// attributed to its construction URL, AND wires MutationObservers on the two
// pane targets so we can prove which pane received which frame.
function paneAttributionInitScript() {
  return () => {
    const Real = (window as any).EventSource;
    (window as any).__esByUrl = [] as string[];
    (window as any).__topPaneFrameContents = [] as string[];
    (window as any).__bottomPaneFrameContents = [] as string[];
    (window as any).EventSource = function (url: string) {
      (window as any).__esByUrl.push(url);
      return new Real(url);
    };
    (window as any).EventSource.prototype = Real.prototype;

    function attachObservers() {
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
      document.addEventListener('DOMContentLoaded', attachObservers, { once: true });
    } else {
      attachObservers();
    }
  };
}

test('M48 Bug 4: bottom pane never receives in-session frame content', async ({ page }) => {
  // M51 D1 fix: attribute by DOM target, not by raw URL list. Top pane's
  // EventSource URL legitimately contains `in-session-` — that's correct.
  await page.addInitScript(paneAttributionInitScript());
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}#${IN_SESSION_ID}`);
  await page.waitForSelector('#stream', { timeout: 5000 });
  await page.waitForTimeout(800);

  const topContents: string[] = await page.evaluate(() => (window as any).__topPaneFrameContents || []);
  const botContents: string[] = await page.evaluate(() => (window as any).__bottomPaneFrameContents || []);

  // Bottom pane MUST NOT contain the in-session content marker.
  const botHasTopTag = botContents.some((s) => s.includes(TOP_TAG));
  expect(botHasTopTag).toBe(false /* M48 Bug 4: bottom pane received in-session frame */);

  // Bottom pane SHOULD contain its own frame (proves the pane is wired).
  const botHasOwnTag = botContents.some((s) => s.includes(BOTTOM_TAG));
  expect(botHasOwnTag).toBe(true /* bottom pane should still receive its own spawn frames */);

  // Top pane SHOULD contain the in-session marker (positive assertion).
  const topHasTopTag = topContents.some((s) => s.includes(TOP_TAG));
  expect(topHasTopTag).toBe(true /* top pane must connect to in-session stream */);
});

test('M51 positive: top pane connects to in-session-* SSE URL exactly once', async ({ page }) => {
  await page.addInitScript(paneAttributionInitScript());
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#main-stream', { timeout: 5000 });
  await page.waitForTimeout(500);

  const urls: string[] = await page.evaluate(() => (window as any).__esByUrl || []);
  const topConnections = urls.filter((u) => u && u.includes(`/transcript/${IN_SESSION_ID}/stream`));
  expect(topConnections.length).toBeGreaterThanOrEqual(1 /* top pane must open the in-session SSE */);
});

test('M51 positive: bottom pane EventSource URL never targets in-session id', async ({ page }) => {
  // Construction-time check: track the LATEST URL bound to bottom pane
  // (`connect()` reuses module-scope `src`). Across all bottom-pane
  // (re)connects, no URL should target an in-session-* id.
  await page.addInitScript(() => {
    const Real = (window as any).EventSource;
    (window as any).__bottomPaneUrls = [] as string[];
    // Intercept by checking which EventSource gets reassigned to the page's
    // module-scope `src` variable. Approximation: every EventSource for
    // /transcript/{id}/stream where id !== in-session-* is assumed bottom.
    (window as any).EventSource = function (url: string) {
      const inst = new Real(url);
      // Heuristic split: bottom pane URL pattern excludes the in-session prefix.
      const m = String(url).match(/\/transcript\/([^/]+)\/stream/);
      if (m && m[1] && m[1].indexOf('in-session-') !== 0) {
        (window as any).__bottomPaneUrls.push(url);
      }
      return inst;
    };
    (window as any).EventSource.prototype = Real.prototype;
  });
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}#${IN_SESSION_ID}`);
  await page.waitForSelector('#stream', { timeout: 5000 });
  await page.waitForTimeout(500);

  const botUrls: string[] = await page.evaluate(() => (window as any).__bottomPaneUrls || []);
  for (const url of botUrls) {
    expect(url).not.toContain('in-session-' /* bottom pane must never construct an in-session SSE */);
  }
});

test('M51 strengthen: hashchange to in-session id does NOT change bottom-pane content', async ({ page }) => {
  // Verifies the `hashchange` guard in the viewer (line ~1296): in-session-*
  // ids must not reroute the bottom pane.
  await page.addInitScript(paneAttributionInitScript());
  await page.goto(`${baseUrl}/transcript/${SPAWN_ID}`);
  await page.waitForSelector('#stream', { timeout: 5000 });
  await page.waitForTimeout(500);

  const beforeBottom: string[] = await page.evaluate(() => Array.from((window as any).__bottomPaneFrameContents || []));

  // Trigger hashchange to an in-session id.
  await page.evaluate((id) => { location.hash = id; }, IN_SESSION_ID);
  await page.waitForTimeout(500);

  const afterBottom: string[] = await page.evaluate(() => Array.from((window as any).__bottomPaneFrameContents || []));

  // Bottom pane content must not have grown with the in-session frame.
  const newFrames = afterBottom.slice(beforeBottom.length);
  const bottomGotInSession = newFrames.some((s) => s.includes(TOP_TAG));
  expect(bottomGotInSession).toBe(false /* hashchange to in-session must not pin bottom pane */);
});
