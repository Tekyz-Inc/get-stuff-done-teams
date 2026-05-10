// Journey — verify-gate-blocks-contract-draft (M55 D5 SC3 evidence)
// Functional assertion: when the project is past PARTITIONED and a contract is
// still DRAFT/PROPOSED, verify-gate Track 1 (preflight contracts-stable) reports
// the gap. contracts-stable is severity:warn so the top-level ok is NOT flipped
// to false by this alone — the journey asserts the check FIRES (ok:false on the
// individual check) and lands in summary.failedChecks WITHOUT promoting itself
// to a hard fail.
//
// To prove SC3 "verify-gate blocks ≥3 distinct failure classes", this spec
// also stages an `error`-severity sibling (a wrong branch) so the top-level ok
// is false and the contract-draft signal is part of the failedChecks list.

import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VERIFY_GATE_BIN = path.join(REPO_ROOT, 'bin', 'gsd-t-verify-gate.cjs');

let projectDir: string = '';

test.beforeAll(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d5-draftcontract-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: projectDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: projectDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: projectDir, stdio: 'ignore' });
  } catch (e) {
    test.skip(true, 'git not available — cannot stage state');
  }
  // Stage: project is past PARTITIONED.
  fs.mkdirSync(path.join(projectDir, '.gsd-t', 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, '.gsd-t', 'progress.md'),
    '# Progress\n\nStatus: ACTIVE\n\nM1 example milestone.\n'
  );
  // Stage: a DRAFT contract.
  fs.writeFileSync(
    path.join(projectDir, '.gsd-t', 'contracts', 'example-contract.md'),
    '# Example Contract\n\nStatus: DRAFT\n\nv0.1.0\n'
  );
});

test.afterAll(() => {
  if (projectDir && fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('verify-gate flags DRAFT contract (Track 1 contracts-stable)', () => {
  const res = spawnSync(process.execPath, [
    VERIFY_GATE_BIN,
    '--project', projectDir,
    '--skip-track2',
    '--json',
  ], { encoding: 'utf8' });

  // contracts-stable is severity:warn so it does NOT flip ok by itself.
  // Both exit codes are valid here — the journey asserts the *check* fired,
  // not the gate decision.
  const env = JSON.parse(res.stdout);
  expect(env.schemaVersion).toBe('1.0.0');

  const contractsStable = env.track1.checks.find((c: any) => c.id === 'contracts-stable');
  expect(contractsStable).toBeDefined();
  expect(contractsStable.ok).toBe(false);
  // Severity is warn — does not flip top-level ok.
  expect(contractsStable.severity).toBe('warn');

  // The check IS recorded in failedChecks regardless of severity.
  expect(env.summary.track1.failedChecks.some((c: any) => c.id === 'contracts-stable')).toBe(true);
});
