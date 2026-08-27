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
  action: 'highlight' | 'click' | 'goto' | 'none';
}

const log: StepLog[] = [];
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
  | { kind: 'goto'; url: string }
  | { kind: 'none' };

export const highlight = (loc: Locator): Action => ({ kind: 'highlight', loc });
export const click = (loc: Locator): Action => ({ kind: 'click', loc });
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
      if (action.kind === 'click') {
        await page.waitForTimeout(420);
        await target.click({ timeout: 15_000 }).catch(() => {});
        await clearRing(page);
        await installOverlay(page);
      }
    }
  }

  // Hold for whatever is left of the spoken sentence.
  const spent = now() - startMs;
  const remain = clip.ms - spent;
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

/** Write the per-step record: the proof of what was really on screen when. */
export function writeRunLog(name: string): void {
  const dir = path.join(process.cwd(), '.demo-build', 'walkthroughs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${name}.json`),
    JSON.stringify({ name, steps: log }, null, 2),
  );
}
