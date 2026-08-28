/**
 * TEMPLATE — one continuous recorded walkthrough, following a named cast.
 *
 * One sentence, one thing on screen, in the same order as the .lines.mjs file.
 * The step's LENGTH comes from the measured audio; nothing here sets a duration
 * except the settle waits after a navigation.
 *
 *   highlight(x)      outline it, mouse stays put     (naming something)
 *   click(x)          mouse glides to it and clicks   (operating something)
 *   enter(x, value)   type a REAL value into a field  (entering data)
 *   choose(x, option) OPEN a dropdown and pick        (making a decision)
 *   goTo(url)         navigate                        (jumping elsewhere)
 *   none()            no target — ONLY for a genuinely abstract line
 *
 * EVERY DROPDOWN USES choose(), NEVER highlight(). A select that is merely
 * outlined shows nothing: the viewer cannot see what the alternatives were, or
 * that a choice was made at all. The choice IS the story — it is where Maya's
 * situation becomes Tyler's decision.
 *
 * VALUES COME FROM cast.mjs, never retyped as literals here. A name in two
 * places will eventually disagree with itself, and then the narration says one
 * thing while the screen shows another.
 *
 * AVOID highlight() IMMEDIATELY FOLLOWED BY goTo(). On camera that reads as
 * "they clicked that thing and it took us here" — and they did not.
 */
import { test } from '@playwright/test';
import { loadNarration } from './manifest';
import { LOC, signInAsAdmin } from './signin';
import { AIRCRAFT, COURSE, INSTRUCTOR, MAYA, PRODUCTS, STAGES, STUDENT_NAME } from './cast.mjs';
import {
  act, choose, click, enter, highlight, installOverlay, none, startRun, step, writeRunLog,
} from './runtime';

const NAME = 'example';
const { ready, audio: AUDIO, L } = loadNarration(NAME);
const [PLANE, CFI, GROUND, KIT] = PRODUCTS;

/** Settle after a navigation. 6-8s, not 5 — a 5s read shows a populated page as empty. */
const SETTLE = 7000;

test(`walkthrough — ${NAME}`, async ({ page }) => {
  // A spec whose audio is not rendered SKIPS. Playwright imports every spec
  // before applying --grep, so throwing here takes down the whole run.
  test.skip(!ready, 'narration not rendered yet');
  test.setTimeout(25 * 60_000);

  startRun(AUDIO as never);
  await signInAsAdmin(page);

  const settle = async (ms = SETTLE) => {
    await page.waitForTimeout(ms);
    await installOverlay(page);   // the overlay does not survive a navigation
  };
  const field = (label: string) => page.getByLabel(new RegExp(label, 'i'));
  const button = (name: string) => page.getByRole('button', { name: new RegExp(name, 'i') });

  // ── Why this course exists ──────────────────────────────────────────────
  await page.goto(`/location/${LOC}/{programs-route}`, { waitUntil: 'domcontentloaded' });
  await settle();

  await step(page, L[0], none());                                  // Maya walked in
  await step(page, L[1], click(button('{New Program}')));          // so I'm building it
  await settle(2500);

  // ── The course ──────────────────────────────────────────────────────────
  await step(page, L[2], enter(field('{Program Name}'), COURSE.name));
  await step(page, L[3], choose(field('{Certificate}'), COURSE.certificate));
  await step(page, L[4], choose(field('{Regulation}'), COURSE.regulation));
  await step(page, L[5], enter(field('{Total Hours}'), COURSE.hours));
  await step(page, L[6], choose(field('{Category}'), COURSE.category));

  // ── The syllabus — one stage per line, each named, typed and picked ─────
  await step(page, L[7], click(button('{Add Stage}')));
  await settle(2000);

  for (const [i, stage] of STAGES.entries()) {
    // Each stage is one narrated beat: name it, and the type is what the
    // sentence is actually about (Ground vs Dual vs Solo).
    await step(page, L[8 + i], enter(field('{Stage Name}'), stage.name));
    // act(), not a bare await — choose() only BUILDS an action; awaiting one
    // does nothing and leaves the field empty.
    await act(page, choose(field('{Stage Type}'), stage.type));
    await act(page, enter(field('{Stage Hours}'), stage.hours));
    if (stage.endorsement) await page.getByLabel(/{endorsement}/i).check().catch(() => {});
    await button('{Add Stage}').click().catch(() => {});
    await page.waitForTimeout(800);
  }
  await installOverlay(page);

  // ── The products — everything a charge attaches to ──────────────────────
  await page.goto(`/location/${LOC}/{products-route}`, { waitUntil: 'domcontentloaded' });
  await settle();

  await step(page, L[13], none());                                 // what Maya pays for

  // Four products, created on camera. L[14..17] each narrate one.
  for (const [i, product] of PRODUCTS.entries()) {
    await step(page, L[14 + i], click(button('{New Product}')));
    await settle(2000);
    await act(page, enter(field('{Product Name}'), product.name));
    await act(page, choose(field('{Product Type}'), product.type));
    await act(page, enter(field('{Price}'), product.price));
    await act(page, choose(field('{Billing}'), product.unit));
    await button('^Save').click().catch(() => {});
    await settle(3000);
  }

  // Attach all four to the course — the sum of these IS the invoice.
  await page.goto(`/location/${LOC}/{programs-route}`, { waitUntil: 'domcontentloaded' });
  await settle();
  await step(page, L[18], choose(field('{Products}'), PLANE.name));
  for (const p of [CFI, GROUND, KIT]) await act(page, choose(field('{Products}'), p.name));

  await step(page, L[19], highlight(page.getByText(/{Total}|{Estimated}/i).first()));
  await step(page, L[20], click(button('{Publish}')));
  await settle();

  // ── Maya ────────────────────────────────────────────────────────────────
  await page.goto(`/location/${LOC}/{students-route}`, { waitUntil: 'domcontentloaded' });
  await settle();

  await step(page, L[21], click(button('{Add Student}')));
  await settle(2500);
  await act(page, enter(field('{Full Name}'), STUDENT_NAME));
  await act(page, enter(field('{Email}'), MAYA.email));
  await act(page, enter(field('{Phone}'), MAYA.phone));

  await step(page, L[22], choose(field('{Availability}'), MAYA.availability));
  await step(page, L[23], choose(field('{Enroll}'), COURSE.name));
  await step(page, L[24], choose(field('{Instructor}'), INSTRUCTOR.name));
  await button('^Save').click().catch(() => {});
  await settle();

  // ── Her first lesson ────────────────────────────────────────────────────
  await page.goto(`/location/${LOC}/{schedule-route}`, { waitUntil: 'domcontentloaded' });
  await settle();

  await step(page, L[25], highlight(page.getByText(new RegExp(AIRCRAFT.tail, 'i')).first()));
  await step(page, L[26], highlight(page.getByText(new RegExp(STUDENT_NAME, 'i')).first()));

  // The step log is the proof of what was on screen when. The mux reads it.
  writeRunLog(NAME);
});
