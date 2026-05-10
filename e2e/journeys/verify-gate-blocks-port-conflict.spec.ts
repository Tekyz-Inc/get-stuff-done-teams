// Journey — verify-gate-blocks-port-conflict (M55 D5 SC3 evidence)
// Functional assertion: when .gsd-t/.unattended/config.json declares a
// requiredFreePort that's actually occupied, verify-gate Track 1
// (preflight ports-free) returns ok:false and flips the envelope ok.

import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VERIFY_GATE_BIN = path.join(REPO_ROOT, 'bin', 'gsd-t-verify-gate.cjs');

let projectDir: string = '';
let server: net.Server | null = null;
let occupiedPort: number = 0;

test.beforeAll(async () => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d5-portconflict-'));
  // Open a TCP listener on an ephemeral port.
  server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => resolve());
  });
  occupiedPort = (server.address() as net.AddressInfo).port;

  fs.mkdirSync(path.join(projectDir, '.gsd-t', '.unattended'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, '.gsd-t', '.unattended', 'config.json'),
    JSON.stringify({ requiredFreePorts: [occupiedPort] })
  );
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
  if (projectDir && fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('verify-gate blocks on port conflict (Track 1 ports-free)', () => {
  const res = spawnSync(process.execPath, [
    VERIFY_GATE_BIN,
    '--project', projectDir,
    '--skip-track2',
    '--json',
  ], { encoding: 'utf8' });

  expect(res.status).toBe(4);

  const env = JSON.parse(res.stdout);
  expect(env.schemaVersion).toBe('1.0.0');
  expect(env.ok).toBe(false);

  const portsFree = env.track1.checks.find((c: any) => c.id === 'ports-free');
  expect(portsFree).toBeDefined();
  expect(portsFree.ok).toBe(false);
  expect(portsFree.severity).toBe('error');

  expect(env.summary.verdict).toBe('FAIL');
  expect(env.summary.track1.failedChecks.some((c: any) => c.id === 'ports-free')).toBe(true);
});
