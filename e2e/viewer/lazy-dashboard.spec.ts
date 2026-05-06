// M50 D2 Task 8 — lazy-dashboard banner spec (M49 regression).
// M51 D2 — strengthened to:
//   - assert exact stdout banner format (not substring containment)
//   - cover the dead-pid branch (pidfile points at a non-existent process)
//   - cover the live-pid branch (pidfile points at the test process itself)
//   - cover the no-pidfile branch (no pidfile exists)
// Three distinct branches, three distinct asserted shapes.

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

function makeFixtureDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm50-lazy-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'headless-sessions'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'events'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
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

// Compute a guaranteed-dead pid: spawn a quick child, capture its pid,
// wait for it to exit. After exit the OS may reuse the pid eventually but
// for the duration of this test it's reliably dead.
function getDeadPid(): number {
  const r = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  return r.pid as number;
}

test('M49 banner: no dashboard pidfile → file path + visualize hint, no URL', () => {
  const dir = makeFixtureDir();
  const pidFile = path.join(dir, '.gsd-t', '.dashboard.pid');
  if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);

  const banner = captureBanner(dir);

  // M51: exact line shape — `▶ Transcript file: …` and the next-line
  // visualize hint. Substring `'Transcript file:'` alone passed even when
  // both branches printed.
  expect(banner).toMatch(/▶ Transcript file: [^\n]+\.log\n[ \t]+\(to view live: gsd-t-visualize\)/);
  // No live URL banner.
  expect(banner).not.toMatch(/▶ Live transcript: http:\/\//);
  expect(banner).not.toMatch(/http:\/\/(127\.0\.0\.1|localhost):\d+/);
});

test('M49 banner: dashboard pidfile points at DEAD pid → file path + visualize hint', () => {
  // M51 strengthen: a pidfile pointing at a stale (dead) pid must fall
  // back to the file-path banner. Today's spec only covers live + missing.
  const dir = makeFixtureDir();
  const pidFile = path.join(dir, '.gsd-t', '.dashboard.pid');
  fs.writeFileSync(pidFile, String(getDeadPid()));

  const banner = captureBanner(dir);

  expect(banner).toMatch(/▶ Transcript file: [^\n]+\.log\n[ \t]+\(to view live: gsd-t-visualize\)/);
  expect(banner).not.toMatch(/▶ Live transcript: http:\/\//);
});

test('M49 banner: dashboard pidfile points at LIVE pid → exact URL banner shape', () => {
  const dir = makeFixtureDir();
  const pidFile = path.join(dir, '.gsd-t', '.dashboard.pid');
  fs.writeFileSync(pidFile, String(process.pid));

  const banner = captureBanner(dir);

  // M51: exact shape — `▶ Live transcript: http://127.0.0.1:{port}/transcript/{id}`.
  expect(banner).toMatch(/▶ Live transcript: http:\/\/127\.0\.0\.1:\d+\/transcript\/[A-Za-z0-9_-]+/);
  // No file-path branch should fire.
  expect(banner).not.toMatch(/▶ Transcript file:/);
});
