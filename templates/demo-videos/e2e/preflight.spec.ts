/**
 * Stage 0 — check every walkthrough's targets WITHOUT recording.
 * TEMPLATE: fill SCREENS and DRILLDOWNS with what your specs point at.
 *
 * Recording is the slow way to discover a bad selector: the run stops at the
 * first sentence whose target is not on screen, so a spec with three bad
 * selectors costs three full recordings to find them all. This walks the same
 * screens and reports EVERY missing target in one pass.
 *
 *   DEMO_RUN=1 npx playwright test --project=walkthrough --grep preflight
 *
 * It never asserts, so it cannot fail the suite — it prints a report. The real
 * gate is still the recording itself, which refuses to narrate what is not
 * visible; this just makes getting there quick.
 */
import { test } from '@playwright/test';
import { LOC, signInAsAdmin } from './signin';

interface Target {
  where: string;
  what: string;
  find: (page: any) => any;
}

/** Everything the specs point at, grouped by the screen it must appear on. */
const SCREENS: Array<{ route: string; settle: number; targets: Target[] }> = [
  {
    route: `/location/${LOC}/dashboard`,
    // 6-8 SECONDS, NOT 5 — a 5s read reports a populated page as empty.
    settle: 8_000,
    targets: [
      { where: 'dashboard', what: '{a heading}', find: (p) => p.getByText(/{Heading}/i) },
      { where: 'dashboard', what: '{a card}', find: (p) => p.getByText(/{Card Title}/i) },
    ],
  },
];

/**
 * Screens reached by opening a record and clicking its tabs, rather than by URL.
 * COUNT THE TABS ON SCREEN — a record with 7 tabs narrated as 3 ships an error.
 */
const DRILLDOWNS: Array<{
  name: string;
  open: (page: any) => Promise<void>;
  tabs: Array<{ tab: string; targets: Target[] }>;
}> = [
  // {
  //   name: 'aircraft',
  //   open: async (p) => {
  //     await p.goto(`/location/${LOC}/{route}`, { waitUntil: 'domcontentloaded' });
  //     await p.waitForTimeout(8_000);
  //     await p.getByRole('button', { name: /{Open Record}/i }).first().click();
  //     await p.waitForTimeout(6_000);
  //   },
  //   tabs: [{ tab: '{Tab Name}', targets: [...] }],
  // },
];

async function firstVisible(loc: any): Promise<{ visible: boolean; n: number }> {
  const n = await loc.count().catch(() => 0);
  for (let i = 0; i < n; i += 1) {
    if (await loc.nth(i).isVisible().catch(() => false)) return { visible: true, n };
  }
  return { visible: false, n };
}

test('walkthrough — preflight target check', async ({ page }) => {
  test.setTimeout(25 * 60_000);
  await signInAsAdmin(page);

  const missing: string[] = [];
  let checked = 0;

  for (const screen of SCREENS) {
    await page.goto(screen.route, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(screen.settle);

    for (const t of screen.targets) {
      checked += 1;
      const { visible, n } = await firstVisible(t.find(page));
      if (!visible) missing.push(`${t.where.padEnd(14)} ${t.what}  (${n} matched, none visible)`);
    }
  }

  for (const d of DRILLDOWNS) {
    await d.open(page).catch(() => {});
    for (const group of d.tabs) {
      const tab = page
        .getByRole('button', { name: new RegExp(`^${group.tab}$`, 'i') })
        .first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click().catch(() => {});
        await page.waitForTimeout(5_000);
      } else {
        missing.push(`${d.name.padEnd(14)} tab "${group.tab}" not reachable`);
        continue;
      }
      for (const t of group.targets) {
        checked += 1;
        const { visible, n } = await firstVisible(t.find(page));
        if (!visible) missing.push(`${t.where.padEnd(14)} ${t.what}  (${n} matched, none visible)`);
      }
    }
  }

  console.log(`\n── preflight: ${checked} targets checked, ${missing.length} missing`);
  for (const m of missing) console.log(`   MISSING  ${m}`);
  if (!missing.length) console.log('   all targets visible');
});
