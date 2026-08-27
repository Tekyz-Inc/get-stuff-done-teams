/**
 * Get to the app as the admin persona.  TEMPLATE — fill the {tokens}.
 *
 * Not narrated: the mux trims everything before the first spoken word, so the
 * gate, the sign-in and the first navigation never appear in the finished video.
 */
import { expect, type Page } from '@playwright/test';

export async function signInAsAdmin(page: Page): Promise<void> {
  const pw = process.env.DEMO_GATE_PW;
  if (!pw) throw new Error('DEMO_GATE_PW not set');

  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  const gate = page.getByPlaceholder('Enter password');
  if (await gate.isVisible().catch(() => false)) {
    await gate.click();
    await gate.pressSequentially(pw, { delay: 20 });
    await page.getByRole('button', { name: /enter demo/i }).click();
    await page.waitForURL((u) => !u.pathname.includes('demo-gate'), { timeout: 30_000 });
  }

  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  const card = page.getByRole('button', { name: /{Admin Persona Name}/i });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.click();
  await page.waitForURL(/dashboard/, { timeout: 60_000, waitUntil: 'commit' });

  // Dismiss any first-run tour so it does not sit over the screens.
  const dismiss = page.getByRole('button', { name: /{explore on my own}/i });
  if (await dismiss.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)) {
    await dismiss.dispatchEvent('click');
  }
}

/**
 * The tenant/location that actually HOLDS the demo data.
 *
 * ASK FOR THIS BY NAME and record it here with a comment saying why it is what
 * it is. Two videos in the source run were filmed against the wrong one because
 * the numbering was counter-intuitive and nothing in the code revealed it.
 */
export const LOC = '{tenant-or-location-id}';
