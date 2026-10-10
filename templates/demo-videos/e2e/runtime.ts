/**
 * Walkthrough runtime — narration is the master clock.
 *
 * How this differs from the old per-screen pipeline:
 *   - The whole walkthrough is ONE continuous recording. No per-screen clips,
 *     no stills, no slideshow. Real mouse movement, real clicks, real page
 *     transitions and animations.
 *   - Every step's length comes from the MEASURED duration of its own spoken
 *     sentence. Nothing is padded to a constant.
 *   - The action fires when the sentence starts, so the pointer moves WHILE
 *     the narrator is talking — the way a person actually demos software.
 *
 * A step is: one sentence + one thing that happens on screen.
 *   highlight(x)  outline it, mouse stays put     (naming something)
 *   click(x)      mouse glides to it and clicks   (operating something)
 *   goTo(url)     navigate                         (jumping elsewhere)
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';

export interface StepLog {
  index: number;
  /** ms from the start of the recording */
  startMs: number;
  endMs: number;
  narration: string;
  /** measured length of the spoken audio */
  audioMs: number;
  route: string;
  focus: string;
  action: 'highlight' | 'click' | 'hold' | 'type' | 'choose' | 'goto' | 'none';
  /** set when park() ran after this step, clearing the cursor before a navigation */
  parked?: boolean;
}

const log: StepLog[] = [];
/** Must match GAP_MS in scripts/walkthrough-mux.mjs. */
const GAP_MS = 150;
let t0 = 0;
let audio: Map<string, { file: string; ms: number }> = new Map();

export function startRun(clips: Map<string, { file: string; ms: number }>): void {
  t0 = Date.now();
  audio = clips;
  log.length = 0;
}

const now = () => Date.now() - t0;

/** Paint the cursor and highlight layer into the page (once per navigation). */
export async function installOverlay(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content: `
      #wt-cursor{position:fixed;width:22px;height:22px;border-radius:50%;
        background:rgba(13,148,136,.45);border:2px solid #0d9488;
        pointer-events:none;z-index:2147483647;transition:none;
        box-shadow:0 2px 10px rgba(0,0,0,.25)}
      .wt-ring{position:fixed;border:2px solid #0d9488;border-radius:10px;
        background:rgba(13,148,136,.10);pointer-events:none;z-index:2147483646;
        box-shadow:0 0 0 3px rgba(13,148,136,.12);
        transition:all .35s cubic-bezier(.4,0,.2,1)}
    `,
    })
    .catch(() => {});
  await page
    .evaluate(() => {
      if (!document.getElementById('wt-cursor')) {
        const c = document.createElement('div');
        c.id = 'wt-cursor';
        c.style.left = '-100px';
        c.style.top = '-100px';
        document.body.appendChild(c);
      }
    })
    .catch(() => {});
}

/** Glide the drawn cursor to a point over `ms`, so movement is visible. */
async function glide(page: Page, x: number, y: number, ms: number): Promise<void> {
  await page
    .evaluate(
      ({ x, y, ms }) => {
        const c = document.getElementById('wt-cursor');
        if (!c) return;
        c.style.transition = `left ${ms}ms cubic-bezier(.4,0,.2,1), top ${ms}ms cubic-bezier(.4,0,.2,1)`;
        c.style.left = `${x - 11}px`;
        c.style.top = `${y - 11}px`;
      },
      { x, y, ms },
    )
    .catch(() => {});
  // Move the REAL mouse too, so hover states fire.
  await page.mouse.move(x, y, { steps: 24 }).catch(() => {});
}

async function ring(page: Page, box: { x: number; y: number; width: number; height: number }): Promise<void> {
  await page
    .evaluate(
      (b) => {
        document.querySelectorAll('.wt-ring').forEach((n) => n.remove());
        const r = document.createElement('div');
        r.className = 'wt-ring';
        r.style.left = `${b.x - 6}px`;
        r.style.top = `${b.y - 6}px`;
        r.style.width = `${b.width + 12}px`;
        r.style.height = `${b.height + 12}px`;
        document.body.appendChild(r);
      },
      box,
    )
    .catch(() => {});
}

async function clearRing(page: Page): Promise<void> {
  await page
    .evaluate(() => document.querySelectorAll('.wt-ring').forEach((n) => n.remove()))
    .catch(() => {});
}

/** Bring a target into view, clear of the caption strip along the bottom. */
async function reveal(page: Page, loc: Locator): Promise<Locator | null> {
  const n = await loc.count().catch(() => 0);
  let target: Locator | null = null;
  for (let i = 0; i < n; i += 1) {
    if (await loc.nth(i).isVisible().catch(() => false)) {
      target = loc.nth(i);
      break;
    }
  }
  if (!target) return null;
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(220);
  return target;
}

export type Action =
  | { kind: 'highlight'; loc: Locator }
  | { kind: 'click'; loc: Locator }
  | { kind: 'hold'; loc: Locator }
  | { kind: 'type'; loc: Locator; value: string }
  | { kind: 'choose'; loc: Locator; option: string | RegExp }
  | { kind: 'goto'; url: string }
  | { kind: 'none' };

export const highlight = (loc: Locator): Action => ({ kind: 'highlight', loc });
export const click = (loc: Locator): Action => ({ kind: 'click', loc });
/**
 * Press and HOLD — for controls an app opens by long-press (e.g. a hidden
 * prototype panel behind the version text). Shown on camera on purpose: the
 * videos double as a visual check of the app, so the viewer sees exactly how a
 * test condition was set.
 */
export const hold = (loc: Locator): Action => ({ kind: 'hold', loc });
/**
 * Type a REAL value into a field, visibly, while the sentence says it.
 *
 * Named `enter`, not `type` — `import { type X }` is TypeScript's type-only
 * import syntax, so an exported `type` is a trap for whoever imports it.
 */
export const enter = (loc: Locator, value: string): Action => ({ kind: 'type', loc, value });
/**
 * OPEN a dropdown, hold it open long enough to read, then pick one option.
 *
 * The choice is the most informative moment in a create-flow — it is where the
 * decision becomes visible. A select that is merely highlighted shows nothing:
 * the viewer cannot tell what the alternatives were, or that a choice happened.
 */
export const choose = (loc: Locator, option: string | RegExp): Action =>
  ({ kind: 'choose', loc, option });
export const goTo = (url: string): Action => ({ kind: 'goto', url });
export const none = (): Action => ({ kind: 'none' });

/**
 * Run one step.
 *
 * The sentence's measured audio length sets the step's length. The action
 * starts immediately, then the pointer rests wherever it landed for whatever
 * remains — which is what reads as "pointing while explaining". If a page load
 * eats the whole step the rest is zero and the timeline simply shifts; the
 * audio track is assembled afterward from these logged timings, never guessed.
 */
export async function step(
  page: Page,
  narration: string,
  action: Action = none(),
): Promise<void> {
  const clip = audio.get(narration);
  if (!clip) throw new Error(`[walkthrough] no audio for: "${narration.slice(0, 70)}"`);

  const startMs = now();
  let focus = '';

  if (action.kind === 'goto') {
    await page.goto(action.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await installOverlay(page);
    focus = action.url;
  } else if (action.kind !== 'none') {
    const target = await reveal(page, action.loc);
    if (!target) {
      throw new Error(
        `[walkthrough] target not visible for: "${narration.slice(0, 70)}"\n` +
          '  Every sentence must point at something that is actually on screen.',
      );
    }
    focus = (await target.innerText().catch(() => ''))?.slice(0, 40) ?? '';
    const box = await target.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await ring(page, box);
      await glide(page, cx, cy, 700);
      if (action.kind === 'choose') {
        // Open it, HOLD so the options are readable, then pick. A native
        // <select> cannot be opened visibly, so selectOption handles that one.
        await page.waitForTimeout(300);
        const tag = await target.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
        if (tag === 'select') {
          /**
           * Match the option by SUBSTRING, then select it by its exact text.
           *
           * selectOption({ label }) compares strings, so a RegExp stringifies
           * to "/.../" and matches nothing — and the option text carries a
           * suffix the record name does not ("… (Private Pilot) — 0 modules").
           * Both failures are silent: the select keeps its old value and the
           * created record comes out unlinked, which is exactly what shipped.
           */
          const want = action.option instanceof RegExp
            ? action.option.source.replace(/\\/g, '')
            : String(action.option);
          const labels = await target.locator('option').allInnerTexts();
          /**
           * Take the LAST match, not the first. A walkthrough that re-runs
           * leaves several records with the same name, and the newest — the
           * one this run just created — sorts last. Picking the first would
           * silently link the course to a curriculum from an older run.
           */
          const matches = labels
            .map((t) => t.replace(/\s+/g, ' ').trim())
            .filter((t) => t.includes(want) || want.includes(t));
          const match = matches[matches.length - 1];
          if (!match) {
            throw new Error(
              `[walkthrough] no option matching "${want}"\n` +
                `  options were: ${labels.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ')}`,
            );
          }
          const before = await target.inputValue().catch(() => '');
          await target.selectOption({ label: match });
          await page.waitForTimeout(400);
          const after = await target.inputValue().catch(() => '');
          if (after === before) {
            throw new Error(
              `[walkthrough] picking "${match}" did not change the select.\n` +
                '  A dropdown that does not move leaves the record unlinked.',
            );
          }
          focus = match.slice(0, 40);
          await clearRing(page);
          const spent0 = now() - startMs;
          const remain0 = clip.ms + GAP_MS - spent0;
          if (remain0 > 0) await page.waitForTimeout(remain0);
          log.push({
            index: log.length, startMs, endMs: now(), narration, audioMs: clip.ms,
            route: page.url().replace(/^https?:\/\/[^/]+/, ''), focus, action: 'choose',
          });
          return;
        } else {
          await target.click({ timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(900);
          const opt = page
            .getByRole('option', { name: action.option, exact: false })
            .or(page.getByRole('menuitem', { name: action.option, exact: false }))
            .first();
          await opt.click({ timeout: 10_000 }).catch(() => {});
        }
        focus = String(action.option).slice(0, 40);
        await clearRing(page);
      } else if (action.kind === 'type') {
        // Click in, clear, then type at a readable pace — fill() makes the
        // value appear instantly, which reads as a screenshot, not data entry.
        await page.waitForTimeout(300);
        await target.click({ timeout: 15_000 }).catch(() => {});
        await target.fill('').catch(() => {});
        await target.pressSequentially(action.value, { delay: 40 });
        // CHECK it landed. A dialog still animating in, or a field the app
        // re-renders under us, swallows the keystrokes — and an empty required
        // field only surfaces later as a save button that does nothing.
        const got = await target.inputValue().catch(() => '');
        if (!got.includes(action.value.slice(0, 8))) {
          throw new Error(
            `[walkthrough] typing "${action.value.slice(0, 40)}" did not land ` +
              `(field holds "${got.slice(0, 40)}")\n` +
              '  An empty field here means the record is created wrong, or not at all.',
          );
        }
        focus = action.value.slice(0, 40);
      } else if (action.kind === 'click') {
        await page.waitForTimeout(420);
        await target.click({ timeout: 15_000 }).catch(() => {});
        await clearRing(page);
        await installOverlay(page);
      } else if (action.kind === 'hold') {
        await page.waitForTimeout(300);
        await page.mouse.down();
        await page.waitForTimeout(1100);
        await page.mouse.up();
        await clearRing(page);
        await installOverlay(page);
      }
    }
  }

  // Hold for whatever is left of the spoken sentence, plus the breath the mux
  // leaves between sentences (GAP_MS). Without it every sentence is pushed late
  // by the gap, and on a screen with no page loads to absorb it the narration
  // drifts behind the pointer by several seconds over a video.
  const spent = now() - startMs;
  const remain = clip.ms + GAP_MS - spent;
  if (remain > 0) await page.waitForTimeout(remain);

  await clearRing(page);
  log.push({
    index: log.length,
    startMs,
    endMs: now(),
    narration,
    audioMs: clip.ms,
    route: page.url().replace(/^https?:\/\/[^/]+/, ''),
    focus,
    action: action.kind === 'none' ? 'none' : action.kind,
  });
}

/**
 * Move the cursor to neutral space and drop the highlight ring.
 *
 * A step that HIGHLIGHTS something, followed by a step that NAVIGATES, reads on
 * camera as "the narrator clicked that thing and it took us here". It did not:
 * the pointer is simply parked on the previous sentence's target while the page
 * changes underneath it. Calling this before a direct navigation removes the
 * implication, because nothing is under the cursor to appear pressed.
 */
export async function park(page: Page): Promise<void> {
  await clearRing(page);
  // Mark the PREVIOUS step as parked, so an implied-click audit can tell a
  // parked navigation (cursor moved to neutral space, ring cleared) from an
  // unparked one that really does read as a click.
  if (log.length) log[log.length - 1].parked = true;
  const size = page.viewportSize();
  const x = size ? Math.round(size.width * 0.5) : 700;
  const y = size ? Math.round(size.height * 0.92) : 830;
  await glide(page, x, y, 500);
  await page.waitForTimeout(550);
}

/**
 * Perform an action WITHOUT a narrated beat.
 *
 * For a field the narration does not name individually — a description, a code,
 * a phone number — the value still has to be typed on camera, but it does not
 * deserve its own sentence. `act()` runs the action at full visible speed and
 * lets the neighbouring sentence cover it.
 *
 * This exists because `enter()` and `choose()` only BUILD an action; awaiting
 * one bare does nothing at all, and the field silently stays empty.
 */
export async function act(page: Page, action: Action): Promise<void> {
  if (action.kind === 'none') return;
  if (action.kind === 'goto') {
    await page.goto(action.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await installOverlay(page);
    return;
  }
  const target = await reveal(page, action.loc);
  if (!target) {
    throw new Error(
      `[walkthrough] act(): target not visible for ${action.kind}\n` +
        '  A field that cannot be found is a field that stays empty.',
    );
  }
  const box = await target.boundingBox();
  if (box) {
    await glide(page, box.x + box.width / 2, box.y + box.height / 2, 400);
  }

  if (action.kind === 'type') {
    await target.click({ timeout: 15_000 }).catch(() => {});
    await target.fill('').catch(() => {});
    await target.pressSequentially(action.value, { delay: 28 });
    const got = await target.inputValue().catch(() => '');
    if (!got.includes(action.value.slice(0, 8))) {
      throw new Error(
        `[walkthrough] act(): typing "${action.value.slice(0, 40)}" did not land ` +
          `(field holds "${got.slice(0, 40)}")`,
      );
    }
  } else if (action.kind === 'choose') {
    const want = action.option instanceof RegExp
      ? action.option.source.replace(/\\/g, '')
      : String(action.option);
    const labels = await target.locator('option').allInnerTexts();
    const match = labels
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .find((t) => t.includes(want) || want.includes(t));
    if (!match) {
      throw new Error(
        `[walkthrough] act(): no option matching "${want}"\n` +
          `  options were: ${labels.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ')}`,
      );
    }
    await target.selectOption({ label: match });
  } else if (action.kind === 'click') {
    await target.click({ timeout: 15_000 });
  }
  await clearRing(page);
}

/** Write the per-step record: the proof of what was really on screen when. */
export function writeRunLog(name: string): void {
  const dir = path.join(process.cwd(), '.demo-build', 'walkthroughs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${name}.json`),
    JSON.stringify({ name, steps: log }, null, 2),
  );
}
