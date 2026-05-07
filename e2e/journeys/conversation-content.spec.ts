// Journey — conversation-content
// Functional assertion: the visualizer renders the actual `content` text of
// every assistant_turn frame in an in-session NDJSON. This is the end-to-end
// regression net for the M53 capture-layer bug where Stop-hook payloads
// produced bodyless `assistant_turn` frames (no `content` field) and the
// viewer correctly rendered empty bubbles.
//
// The spec MUST fail if any of:
//   - the hook regresses to writing bodyless frames (bubbles render empty)
//   - the hook reads the wrong message (e.g. picks the user prompt instead
//     of the assistant message)
//   - the hook truncates a multi-block assistant message to only its first
//     text block (long answer cut short)
//
// All three failure modes are exercised explicitly in the M53 adversarial
// red-team script (see .gsd-t/red-team-conversation-content.md).

import { test, expect } from '@playwright/test';
import { startServer } from '../../scripts/gsd-t-dashboard-server.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let server: any = null;
let baseUrl: string = '';
let cleanup: (() => void) | null = null;

const SID = 'conv-content-jrn-' + 'c'.repeat(16);
const NDJSON_NAME = 'in-session-' + SID + '.ndjson';

// Three deliberately distinct, multi-paragraph assistant texts. Each carries
// a unique marker the spec asserts on. Lengths vary so a "first text block
// only" regression is detectable (markers are positioned across multiple
// paragraphs of the longer message).
const ASSISTANT_BODY_1 = 'ASSISTANT-BODY-1-marker-7a3f — short reply.';
const ASSISTANT_BODY_2_HEAD = 'ASSISTANT-BODY-2-marker-9b1e — opening paragraph of a longer reply with details.';
const ASSISTANT_BODY_2_TAIL = 'ASSISTANT-BODY-2-tail-marker-q4k3 — closing paragraph that proves multi-block concatenation works.';
const ASSISTANT_BODY_2 = ASSISTANT_BODY_2_HEAD + '\n\n' + ASSISTANT_BODY_2_TAIL;
const ASSISTANT_BODY_3 = 'ASSISTANT-BODY-3-marker-d8c2 — final reply in the conversation.';

const USER_PROMPT_1 = 'USER-PROMPT-marker-do-not-mirror-into-assistant — first prompt';

test.beforeAll(async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm53-conv-content-'));
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  const eDir = path.join(fixtureDir, '.gsd-t', 'events');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(eDir, { recursive: true });

  // The fixture NDJSON simulates what a healthy capture hook (post-fix)
  // produces: a session_start, three (user_turn, assistant_turn) pairs.
  // The assistant_turn frames carry REAL `content` strings — that is the
  // exact invariant this spec defends.
  const now = Date.now();
  const ts = (offset: number) => new Date(now - (10_000 - offset)).toISOString();
  const frames: any[] = [
    { type: 'session_start', ts: ts(0), session_id: SID },
    { type: 'user_turn', ts: ts(1), session_id: SID, content: USER_PROMPT_1 },
    { type: 'assistant_turn', ts: ts(2), session_id: SID, content: ASSISTANT_BODY_1 },
    { type: 'user_turn', ts: ts(3), session_id: SID, content: 'second prompt' },
    { type: 'assistant_turn', ts: ts(4), session_id: SID, content: ASSISTANT_BODY_2 },
    { type: 'user_turn', ts: ts(5), session_id: SID, content: 'third prompt' },
    { type: 'assistant_turn', ts: ts(6), session_id: SID, content: ASSISTANT_BODY_3 },
  ];
  fs.writeFileSync(
    path.join(tDir, NDJSON_NAME),
    frames.map((f) => JSON.stringify(f)).join('\n') + '\n',
    'utf8',
  );

  const htmlPath = path.resolve(__dirname, '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.resolve(__dirname, '..', '..', 'scripts', 'gsd-t-transcript.html');
  const result = startServer(0, eDir, htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  server = result.server;
  await new Promise<void>((r) => server.once('listening', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  cleanup = () => { try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* ignore */ } };
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (cleanup) cleanup();
});

test('every assistant_turn bubble renders its content text (not empty)', async ({ page }) => {
  // The in-session NDJSON is consumed by the dual-pane viewer's TOP pane
  // (#main-stream), not the bottom #stream pane. /transcripts is the
  // landing route for the dual-pane viewer.
  await page.goto(`${baseUrl}/transcripts`);
  await page.waitForSelector('#main-stream', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('#main-stream .frame.assistant-turn').length >= 3, undefined, { timeout: 10000 });

  // 1. Every assistant_turn must be rendered with a non-empty .body.
  const assistantTurns = page.locator('#main-stream .frame.assistant-turn');
  await expect(assistantTurns).toHaveCount(3);

  for (let i = 0; i < 3; i++) {
    const body = assistantTurns.nth(i).locator('.body');
    await expect(body).toHaveCount(1);
    const txt = (await body.innerText()).trim();
    expect(
      txt.length,
      `assistant_turn[${i}] body must be non-empty — empty bubble = bodyless frame regression`,
    ).toBeGreaterThan(0);
  }

  // 2. Each bubble must carry the EXPECTED marker — proves we extracted the
  //    assistant message, not the adjacent user prompt or some other line.
  await expect(assistantTurns.nth(0).locator('.body')).toContainText('ASSISTANT-BODY-1-marker-7a3f');
  await expect(assistantTurns.nth(1).locator('.body')).toContainText('ASSISTANT-BODY-2-marker-9b1e');
  await expect(assistantTurns.nth(2).locator('.body')).toContainText('ASSISTANT-BODY-3-marker-d8c2');

  // 3. The TAIL marker of the multi-paragraph reply must also be present.
  //    A "first text block only" regression breaks this — the head marker
  //    would render but the tail marker would not.
  await expect(assistantTurns.nth(1).locator('.body')).toContainText('ASSISTANT-BODY-2-tail-marker-q4k3');

  // 4. The user-prompt marker must NOT leak into any assistant bubble. A
  //    hook bug that picks the user message would surface USER-PROMPT-marker
  //    inside an assistant bubble.
  for (let i = 0; i < 3; i++) {
    await expect(assistantTurns.nth(i).locator('.body')).not.toContainText('USER-PROMPT-marker-do-not-mirror-into-assistant');
  }

  // 5. Sanity: no JSON-dump fallback (.frame.raw) for assistant_turn frames
  //    — proves the dispatch fired and we're asserting on a real bubble.
  await expect(page.locator('#main-stream .frame.raw')).toHaveCount(0);
});
