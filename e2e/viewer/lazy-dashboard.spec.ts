// M50 D2 Task 8 — lazy-dashboard banner spec (M49 regression).
// Verifies the M49 banner shape change in `bin/headless-auto-spawn.cjs`:
//   - When NO dashboard pidfile is alive: banner contains
//     "▶ Transcript file: …" + "(to view live: gsd-t-visualize)" and no URL.
//   - When dashboard IS alive: banner contains "Live transcript: http://…".
//
// This spec is a Playwright spec only because it lives alongside the viewer
// suite. The actual assertions are on banner stdout, exercised via a Node
// child process — no browser is required.

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

function makeFixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-lazy-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'headless-sessions'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  // Provide a no-op gsd-t.js so the spawn doesn't hang the harness on a
  // missing CLI. The headless child exits immediately.
  fs.writeFileSync(path.join(dir, 'bin', 'gsd-t.js'), '#!/usr/bin/env node\nprocess.exit(0);\n');
  return dir;
}

function captureBanner(fixtureDir: string): string {
  const harness = `
    const { autoSpawnHeadless } = require('${path.resolve(__dirname, '..', '..', 'bin', 'headless-auto-spawn.cjs')}');
    autoSpawnHeadless({ command: 'gsd-t-status', projectDir: ${JSON.stringify(fixtureDir)} });
  `;
  const res = spawnSync(process.execPath, ['-e', harness], { encoding: 'utf8' });
  return (res.stdout || '') + (res.stderr || '');
}

test('M49 banner: no dashboard running → file path + visualize hint, no URL', () => {
  const dir = makeFixtureDir();
  // Make sure no dashboard pidfile exists.
  const pidFile = path.join(dir, '.gsd-t', '.dashboard.pid');
  if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);

  const banner = captureBanner(dir);
  expect(banner).toContain('Transcript file:' /* M49 lazy banner: dashboard not running */);
  expect(banner).toContain('to view live: gsd-t-visualize');
  expect(banner).not.toMatch(/http:\/\/(127\.0\.0\.1|localhost):\d+/);
});

test('M49 banner: dashboard pidfile points at live process → URL banner', () => {
  const dir = makeFixtureDir();
  // Use this test process's own pid as a "live" sentinel — process.kill(pid, 0)
  // succeeds, so the lazy probe will report running=true.
  const pidFile = path.join(dir, '.gsd-t', '.dashboard.pid');
  fs.writeFileSync(pidFile, String(process.pid));

  const banner = captureBanner(dir);
  expect(banner).toMatch(/Live transcript: http:\/\//);
});
