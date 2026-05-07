// LIVE journey — multi-kind live-activity: bash + monitor + tool concurrent.
//
// Doctrine (post-M52): specs run against the user's actual running dashboard.
// Self-skip when no live dashboard is reachable.
//
// This spec exercises the events-JSONL synthetic path for Monitor kind,
// since issuing a live Monitor tool call from a Playwright spec would
// recurse into the orchestrator. Teardown reverts .gsd-t/events/<today>.jsonl
// to pre-test state.
//
// Contract: .gsd-t/contracts/live-activity-contract.md v1.0.0 §1 + §2

import { test, expect } from '@playwright/test';
import * as http from 'node:http';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = process.env.GSD_T_LIVE_DASHBOARD_URL ?? 'http://localhost:7488';

let bashChild: cp.ChildProcess | null = null;
let eventsFile = '';
let preTestContent = '';
let appendedLines: string[] = [];

function probeBase(): Promise<{ alive: boolean }> {
  return new Promise((resolve) => {
    const u = new URL(BASE);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: '/', method: 'GET', timeout: 2000 },
      (res) => { res.resume(); resolve({ alive: true }); },
    );
    req.on('error', () => resolve({ alive: false }));
    req.on('timeout', () => { req.destroy(); resolve({ alive: false }); });
    req.end();
  });
}

function getJson(urlPath: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', timeout: 5000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: any = text;
          try { body = JSON.parse(text); } catch { /* keep raw */ }
          resolve({ status: res.statusCode || 0, body });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function appendEvent(line: string): void {
  fs.appendFileSync(eventsFile, line + '\n');
  appendedLines.push(line);
}

async function pollActivities(timeoutMs = 10_000, predicate?: (activities: any[]) => boolean): Promise<any[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status, body } = await getJson('/api/live-activity');
    if (status === 200 && body && Array.isArray(body.activities)) {
      if (!predicate || predicate(body.activities)) return body.activities;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return [];
}

test.beforeAll(async () => {
  const probe = await probeBase();
  test.skip(
    !probe.alive,
    `live dashboard not reachable at ${BASE} (set GSD_T_LIVE_DASHBOARD_URL or start via /gsd-t-visualize)`,
  );
});

test.afterAll(async () => {
  // Teardown: kill bash, revert events file to pre-test state
  if (bashChild && !bashChild.killed) {
    try { bashChild.kill('SIGTERM'); } catch (_) { /* noop */ }
    bashChild = null;
  }

  // Revert events JSONL by removing appended lines
  if (eventsFile && appendedLines.length > 0) {
    try {
      const current = fs.readFileSync(eventsFile, 'utf8');
      // Remove appended lines: restore pre-test content
      // Simple approach: write back pre-test content + any lines not in appendedLines
      const appendedSet = new Set(appendedLines.map((l) => l.trim()));
      const kept = current.split('\n').filter((l) => l.trim() && !appendedSet.has(l.trim()));
      const restored = (preTestContent ? preTestContent.replace(/\n$/, '') + '\n' : '') +
        (kept.length > 0 ? kept.join('\n') + '\n' : '');
      // Write back pre-test content only
      fs.writeFileSync(eventsFile, preTestContent);
    } catch (_) { /* noop — teardown best-effort */ }
  }
  appendedLines = [];
});

test('live-activity-multikind — 3 concurrent kinds appear independently in rail', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  const projectDir = process.cwd();
  const eventsDir = path.join(projectDir, '.gsd-t', 'events');
  eventsFile = path.join(eventsDir, today + '.jsonl');

  // Capture pre-test events file content for teardown restoration
  try {
    preTestContent = fs.readFileSync(eventsFile, 'utf8');
  } catch (_) { preTestContent = ''; }

  const bashId = 'multikind-bash-' + Date.now();
  const monitorId = 'multikind-monitor-' + Date.now();
  const toolId = 'multikind-tool-' + Date.now();

  const now = new Date();
  const bashStart = now.toISOString();
  // Monitor: started now (no stop event)
  const monitorStart = now.toISOString();
  // Tool: started 31s ago (exceeds 30s threshold)
  const toolStart = new Date(now.getTime() - 31_000).toISOString();

  // Spawn real bash
  bashChild = cp.spawn('bash', ['-c', 'sleep 30 && echo done']);
  const pid = bashChild.pid || 0;

  // Write bash event (run_in_background)
  appendEvent(JSON.stringify({
    type: 'tool_use',
    name: 'Bash',
    tool_use_id: bashId,
    run_in_background: true,
    command: 'sleep 30 && echo done',
    pid,
    startedAt: bashStart,
  }));

  // Write synthetic Monitor event (no stop → kind:monitor)
  appendEvent(JSON.stringify({
    type: 'tool_use',
    name: 'Monitor',
    tool_use_id: monitorId,
    startedAt: monitorStart,
  }));

  // Write synthetic tool_use event older than 30s (kind:tool)
  appendEvent(JSON.stringify({
    type: 'tool_use',
    name: 'Write',
    tool_use_id: toolId,
    startedAt: toolStart,
  }));

  // STEP 1: Poll /api/live-activity every 500ms for up to 10s, assert 3 entries
  const activities = await pollActivities(10_000, (acts) => {
    const hasB = acts.some((a) => a.toolUseId === bashId || a.kind === 'bash');
    const hasM = acts.some((a) => a.toolUseId === monitorId || a.kind === 'monitor');
    const hasT = acts.some((a) => a.toolUseId === toolId || a.kind === 'tool');
    return hasB && hasM && hasT;
  });

  const hasBash = activities.some((a: any) => a.toolUseId === bashId || a.kind === 'bash');
  const hasMonitor = activities.some((a: any) => a.toolUseId === monitorId || a.kind === 'monitor');
  const hasTool = activities.some((a: any) => a.toolUseId === toolId || a.kind === 'tool');

  expect(hasBash, 'bash activity must appear in /api/live-activity').toBe(true);
  expect(hasMonitor, 'monitor activity must appear in /api/live-activity').toBe(true);
  expect(hasTool, 'tool activity must appear in /api/live-activity').toBe(true);

  // STEP 2: Open dashboard URL; assert 3 entries visible in #la-list
  await page.goto(`${BASE}/transcripts`, { waitUntil: 'domcontentloaded' });
  const laSection = page.locator('#rail-live-activity');
  await expect(laSection).toBeVisible({ timeout: 5000 });

  // Wait for at least 3 entries in the list (≤10s after page load, allowing polling)
  await page.waitForFunction(() => {
    const list = document.getElementById('la-list');
    return list && list.children.length >= 3;
  }, { timeout: 15_000 });

  const entryCount = await page.locator('#la-list .la-entry').count();
  expect(entryCount, 'at least 3 concurrent entries must appear in the rail').toBeGreaterThanOrEqual(3);

  // STEP 3: Assert all 3 have .la-pulsing (independent pulse per entry)
  const pulsingCount = await page.locator('#la-list .la-entry.la-pulsing').count();
  expect(pulsingCount, 'all new entries must have .la-pulsing class').toBeGreaterThanOrEqual(3);

  // STEP 4: Dedup correctness — same tool_use_id in events JSONL twice → still only 1 entry
  // Write the bash event again with the same tool_use_id (simulates orchestrator+events overlap)
  appendEvent(JSON.stringify({
    type: 'tool_use',
    name: 'Bash',
    tool_use_id: bashId,
    run_in_background: true,
    command: 'sleep 30 && echo done',
    pid,
    startedAt: bashStart,
  }));

  // Re-poll endpoint after a 5s+ interval (cache expires)
  await page.waitForTimeout(6000);
  const { status: s2, body: b2 } = await getJson('/api/live-activity');
  expect(s2).toBe(200);
  const bashCount = (b2.activities || []).filter((a: any) => a.toolUseId === bashId).length;
  expect(bashCount, 'duplicate tool_use_id must be deduped to exactly 1 entry').toBe(1);
});

test('live-activity-multikind — GET /api/live-activity returns schemaVersion:1', async () => {
  const { status, body } = await getJson('/api/live-activity');
  expect(status).toBe(200);
  expect(body.schemaVersion).toBe(1);
  expect(Array.isArray(body.activities)).toBe(true);
  expect(Array.isArray(body.notes)).toBe(true);
});
