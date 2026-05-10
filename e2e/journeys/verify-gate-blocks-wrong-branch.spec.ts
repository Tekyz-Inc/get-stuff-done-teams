// Journey — verify-gate-blocks-wrong-branch (M55 D5 SC3 evidence)
// Functional assertion: when CLAUDE.md declares an Expected branch the project
// isn't on, verify-gate Track 1 (preflight branch-guard) returns ok:false and
// flips the top-level envelope ok to false.

import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VERIFY_GATE_BIN = path.join(REPO_ROOT, 'bin', 'gsd-t-verify-gate.cjs');

let projectDir: string = '';

test.beforeAll(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm55-d5-wrongbranch-'));
  // Init a git repo so branch-guard can run.
  try {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: projectDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: projectDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: projectDir, stdio: 'ignore' });
  } catch (e) {
    test.skip(true, 'git not available — cannot stage wrong-branch state');
  }
  // CLAUDE.md says we should be on `feature/never-this`. Repo is on `main`.
  fs.writeFileSync(
    path.join(projectDir, 'CLAUDE.md'),
    '# Project\n\nExpected branch: feature/never-this\n'
  );
  fs.mkdirSync(path.join(projectDir, '.gsd-t'), { recursive: true });
});

test.afterAll(() => {
  if (projectDir && fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('verify-gate blocks on wrong branch (Track 1 branch-guard)', () => {
  const res = spawnSync(process.execPath, [
    VERIFY_GATE_BIN,
    '--project', projectDir,
    '--skip-track2',
    '--json',
  ], { encoding: 'utf8' });

  // Exit code 4 indicates ok:false.
  expect(res.status).toBe(4);

  const env = JSON.parse(res.stdout);
  expect(env.schemaVersion).toBe('1.0.0');
  expect(env.ok).toBe(false);

  // Find the branch-guard check in track1 and assert it failed.
  const branchGuard = env.track1.checks.find((c: any) => c.id === 'branch-guard');
  expect(branchGuard).toBeDefined();
  expect(branchGuard.ok).toBe(false);
  expect(branchGuard.severity).toBe('error');

  // Summary should reflect the failure deterministically.
  expect(env.summary.verdict).toBe('FAIL');
  expect(env.summary.track1.failedChecks.some((c: any) => c.id === 'branch-guard')).toBe(true);
});
