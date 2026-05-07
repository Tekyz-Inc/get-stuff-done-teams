// Replay helpers for M52 journey specs.
//
// Loads NDJSON fixtures captured from real `.gsd-t/transcripts/in-session-*.ndjson`
// files, writes them into a temp project directory, starts the dashboard
// server on an ephemeral port (port: 0 + server.address().port readback —
// matches the e2e/viewer/dual-pane.spec.ts pattern), and yields a baseUrl +
// IDs the spec can navigate to.
//
// Zero new runtime deps — relies only on Node built-ins and Playwright's
// built-in route/fulfill (specs may call `page.route` themselves to inject
// SSE-shaped chunks if they need a controlled drip).

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Server } from 'node:http';
import type { Page } from '@playwright/test';

const FIXTURES_DIR = path.join(__dirname);

export interface FixtureBundle {
  baseUrl: string;
  server: Server;
  fixtureDir: string;
  mainSessionId: string;
  spawnIds: string[];
  frameCount: number;
  cleanup: () => Promise<void>;
}

export interface ReplayOptions {
  // Path under e2e/fixtures/journeys/ — e.g. 'fixture-medium-session.ndjson'.
  fixture: string;
  // Override the source session_id with this one (so the spec can navigate
  // to a known #hash). Defaults to a random uuid.
  asSessionId?: string;
  // Treat as an in-session main transcript (writes to .gsd-t/transcripts/
  // with `in-session-{id}` prefix). Default true.
  inSession?: boolean;
}

function loadFixtureFrames(fixtureName: string): { frames: any[]; sourceId: string | null } {
  const p = path.join(FIXTURES_DIR, fixtureName);
  const raw = fs.readFileSync(p, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  let sourceId: string | null = null;
  const frames: any[] = [];
  for (const line of lines) {
    if (line.startsWith('// source:')) {
      const m = /in-session-([a-f0-9-]+)/.exec(line);
      if (m) sourceId = m[1];
      continue;
    }
    try {
      frames.push(JSON.parse(line));
    } catch {
      // skip malformed lines silently — fixtures are committed with PII scrub markers
    }
  }
  return { frames, sourceId };
}

function rewriteSessionIds(frames: any[], newId: string): any[] {
  return frames.map((f) => {
    const copy = { ...f };
    if (copy.session_id) copy.session_id = newId;
    if (copy.payload && typeof copy.payload === 'object' && copy.payload.session_id) {
      copy.payload = { ...copy.payload, session_id: newId };
    }
    return copy;
  });
}

function makeTempProjectDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'm52-journey-'));
}

function randomId(): string {
  // eslint-disable-next-line no-bitwise
  const r = () => ((Math.random() * 0x10000) | 0).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

export async function startReplayServer(opts: ReplayOptions): Promise<FixtureBundle> {
  const { frames } = loadFixtureFrames(opts.fixture);
  const sessionId = opts.asSessionId || randomId();
  const fixtureDir = makeTempProjectDir();
  const tDir = path.join(fixtureDir, '.gsd-t', 'transcripts');
  const eDir = path.join(fixtureDir, '.gsd-t', 'events');
  fs.mkdirSync(tDir, { recursive: true });
  fs.mkdirSync(eDir, { recursive: true });

  const inSession = opts.inSession !== false;
  const transcriptName = inSession ? `in-session-${sessionId}.ndjson` : `${sessionId}.ndjson`;
  const rewritten = rewriteSessionIds(frames, sessionId);
  fs.writeFileSync(path.join(tDir, transcriptName), rewritten.map((f) => JSON.stringify(f)).join('\n') + '\n');

  // Lazy-require so this module stays a `.ts` source-only helper without
  // pulling the dashboard server into Playwright's TypeScript resolution
  // surface at import time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startServer } = require(path.resolve(__dirname, '..', '..', '..', 'scripts', 'gsd-t-dashboard-server.js'));
  const htmlPath = path.resolve(__dirname, '..', '..', '..', 'scripts', 'gsd-t-dashboard.html');
  const transcriptHtmlPath = path.resolve(__dirname, '..', '..', '..', 'scripts', 'gsd-t-transcript.html');

  const result = startServer(0, eDir, htmlPath, fixtureDir, transcriptHtmlPath, { idleTtlMs: 0 });
  const server: Server = result.server;
  await new Promise<void>((r) => server.once('listening', () => r()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const cleanup = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  return {
    baseUrl,
    server,
    fixtureDir,
    mainSessionId: sessionId,
    spawnIds: [],
    frameCount: rewritten.length,
    cleanup,
  };
}

// Lower-level helper for specs that want to drip frames into the page via
// EventSource interception rather than serving from disk. Matches the
// dual-pane.spec.ts pattern: patch EventSource in an init script, then
// drive frames via page.evaluate().
export async function replayFixture(
  page: Page,
  fixtureName: string,
  options?: { matcher?: (url: string) => boolean }
): Promise<{ frames: any[] }> {
  const { frames } = loadFixtureFrames(fixtureName);
  const matcher = options?.matcher || (() => true);
  await page.addInitScript(({ frames, matcherSrc }) => {
    const Real = (window as any).EventSource;
    const matcherFn = new Function('url', `return (${matcherSrc})(url);`) as (u: string) => boolean;
    (window as any).EventSource = function (url: string) {
      const es = new Real(url);
      if (matcherFn(url)) {
        // Drip frames synchronously after construction so tests that wait
        // for the next animation frame see them in DOM.
        queueMicrotask(() => {
          for (const frame of frames) {
            const data = JSON.stringify(frame);
            const ev = new MessageEvent('message', { data });
            try { (es as any).dispatchEvent(ev); } catch { /* ignore — Real EventSource won't accept synthetic events; specs that need this should use route() instead */ }
          }
        });
      }
      return es;
    };
    (window as any).EventSource.prototype = Real.prototype;
  }, { frames, matcherSrc: matcher.toString() });
  return { frames };
}

// Convenience: navigate, wait for either DOM ready signal, then return.
export async function gotoAndReady(page: Page, url: string, readySelector = 'body'): Promise<void> {
  await page.goto(url);
  await page.waitForSelector(readySelector, { timeout: 5000 });
}
