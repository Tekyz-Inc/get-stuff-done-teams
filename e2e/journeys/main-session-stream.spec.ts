// Journey 1 — main-session-stream
// Functional assertion: navigating to /transcripts loads main-session frames
// from the in-session NDJSON file into #main-stream and the empty-state
// disappears (state changed from "empty" → "populated").

import { test, expect } from '@playwright/test';
import { startReplayServer, FixtureBundle } from '../fixtures/journeys/replay-helpers';

test.describe('M52 J1 — main-session-stream', () => {
  let bundle: FixtureBundle;
  test.setTimeout(15000);

  test.beforeAll(async () => {
    bundle = await startReplayServer({ fixture: 'fixture-medium-session.ndjson', inSession: true });
  });

  test.afterAll(async () => { await bundle.cleanup(); });

  test('connectMain populates #main-stream with frames from the NDJSON file', async ({ page }) => {
    await page.goto(`${bundle.baseUrl}/transcripts`);
    await page.waitForSelector('#main-stream', { timeout: 5000 });

    // Wait for /api/main-session resolution + connectMain to populate frames.
    await page.waitForFunction(() => {
      const el = document.getElementById('main-stream');
      if (!el) return false;
      return el.children.length > 0 || (el.textContent || '').trim().length > 50;
    }, { timeout: 10000 });

    const populated = await page.evaluate(() => {
      const el = document.getElementById('main-stream');
      return {
        hasContent: !!(el && (el.textContent || '').trim().length > 0),
        childCount: el ? el.children.length : 0,
        mainSessionGlobal: (window as any).__mainSessionId || null,
      };
    });

    expect(populated.hasContent).toBe(true);
    expect(populated.childCount).toBeGreaterThan(0);
    // Functional invariant: the viewer attached itself to the main session id
    // (proves connectMain ran, not just that the empty shell rendered).
    expect(populated.mainSessionGlobal).toBeTruthy();
  });
});
