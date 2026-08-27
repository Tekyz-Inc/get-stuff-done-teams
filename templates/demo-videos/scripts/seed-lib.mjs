/**
 * Shared machinery for the demo seeders.  TEMPLATE — fill the {tokens}.
 *
 * Every seeder drives the REAL UI as an admin, so every guardrail the app
 * enforces still applies. That is the point: a record created here is a record
 * a person could have created, which means the screen it populates is showing
 * something true.
 *
 * The rule all seeders follow: when the app refuses, REPORT WHAT IT SAID and
 * stop. Never retry past a refusal, never reach around the form. A refusal is
 * information — usually that the screen is empty for a reason worth knowing.
 * (In the run this was distilled from, one such refusal turned out to be a real
 * app bug: an enabled button whose click handler was inert.)
 *
 * WRITES TO A SHARED ENVIRONMENT. State plainly whether what you seed survives
 * — a shared demo site often resets nightly.
 */
import { chromium } from '@playwright/test';

export const BASE = process.env.DEMO_URL ?? '{https://demo.example.com}';

/**
 * The tenant/location that actually HOLDS the demo data.
 *
 * ASK FOR THIS BY NAME and record it here. Do not derive it — in the source
 * run the numbering was counter-intuitive and two videos were filmed against
 * the wrong tenant before it was pinned down.
 */
export const LOC = '{tenant-or-location-id}';

/** Open a browser and sign in as the admin persona. */
export async function open({ headed = process.env.HEADED === '1' } = {}) {
  const pw = process.env.DEMO_GATE_PW;
  if (!pw) throw new Error('DEMO_GATE_PW not set');

  const browser = await chromium.launch({ headless: !headed });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Password gate in front of the demo site, if there is one.
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  const gate = page.getByPlaceholder('Enter password');
  if (await gate.isVisible().catch(() => false)) {
    await gate.click();
    await gate.pressSequentially(pw, { delay: 20 });
    await page.getByRole('button', { name: /enter demo/i }).click();
    await page.waitForTimeout(3000);
  }

  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /{Admin Persona Name}/i }).click({ timeout: 30_000 });
  await page.waitForURL(/dashboard/, { timeout: 60_000, waitUntil: 'commit' });
  await page.waitForTimeout(5000);

  // Dismiss any first-run tour so it does not sit over the screens.
  const dismiss = page.getByRole('button', { name: /{explore on my own}/i });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.dispatchEvent('click');
    await page.waitForTimeout(800);
  }
  return { browser, page };
}

/**
 * Go somewhere and give it time to populate.
 *
 * PAGES NEED 6-8 SECONDS, NOT 5. Reading at 5s reported a populated page as
 * empty and produced a wrong "this module is empty" call.
 */
export async function visit(page, route, settleMs = 8000) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(settleMs);
}

/** Whatever the app is telling the user right now — toasts, alerts, banners. */
export async function messages(page) {
  const out = await page
    .locator('[role="alert"], [class*="toast"], [class*="Toast"]')
    .allInnerTexts()
    .catch(() => []);
  return out.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4);
}

/**
 * Match a dialog by its TITLE, never `.first()`.
 *
 * Several things on a page can carry role=dialog — a sidebar, an assistant
 * panel — so `.first()` silently drives the wrong one.
 */
export function dialogTitled(page, title) {
  return page.getByRole('dialog').filter({ hasText: title });
}

/** A refusal, reported rather than worked around. */
export function refused(what, why) {
  console.log(`REFUSED  ${what}`);
  if (why) console.log(`  app said: ${why}`);
}

export function seeded(what, detail = '') {
  console.log(`SEEDED   ${what}${detail ? '  — ' + detail : ''}`);
}

export function note(msg) {
  console.log(`  ${msg}`);
}
