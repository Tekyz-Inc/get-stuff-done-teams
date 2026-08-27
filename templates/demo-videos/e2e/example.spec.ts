/**
 * TEMPLATE — one continuous recorded walkthrough.
 *
 * One sentence, one thing on screen, in the same order as the .lines.mjs file.
 * The step's LENGTH comes from the measured audio; nothing here sets a duration
 * except the settle waits after a navigation.
 *
 *   highlight(x)  outline it, mouse stays put     (naming something)
 *   click(x)      mouse glides to it and clicks   (operating something)
 *   goTo(url)     navigate                        (jumping elsewhere)
 *   none()        no target — ONLY for a genuinely abstract line
 *
 * AVOID highlight() IMMEDIATELY FOLLOWED BY goTo(). On camera that reads as
 * "they clicked that thing and it took us here" — and they did not. Click the
 * real navigation, or park the cursor somewhere neutral first.
 */
import { test } from '@playwright/test';
import { loadNarration } from './manifest';
import { LOC, signInAsAdmin } from './signin';
import { click, highlight, installOverlay, none, startRun, step, writeRunLog } from './runtime';

const NAME = 'example';
const { ready, audio: AUDIO, L } = loadNarration(NAME);

test(`walkthrough — ${NAME}`, async ({ page }) => {
  // A spec whose audio is not rendered SKIPS. Playwright imports every spec
  // before applying --grep, so throwing here takes down the whole run.
  test.skip(!ready, 'narration not rendered yet');
  test.setTimeout(20 * 60_000);

  startRun(AUDIO as never);
  await signInAsAdmin(page);

  await page.goto(`/location/${LOC}/{route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);        // 6-8s, not 5 — see the settle note
  await installOverlay(page);

  await step(page, L[0], none());
  await step(page, L[1], highlight(page.getByText(/{Card Title}/i)));
  await step(page, L[2], highlight(page.getByText(/{List Heading}/i)));
  await step(page, L[3], highlight(page.getByText(/{Rate}/i).first()));

  await step(page, L[4], click(page.getByRole('button', { name: /{Open Record}/i })));
  // Re-install the overlay after every navigation — the cursor and highlight
  // layers are injected into the page and do not survive one.
  await page.waitForTimeout(6000);
  await installOverlay(page);

  await step(page, L[5], none());

  // The step log is the proof of what was on screen when. The mux reads it.
  writeRunLog(NAME);
});
