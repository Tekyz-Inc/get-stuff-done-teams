'use strict';

/**
 * Build-speed guard — blocks an unchanged re-run of a failed Playwright run, a
 * whole-config re-run before a narrower run passes, and long foreground waits.
 * Drives the real hook scripts with real payloads, in a scratch git project
 * and a fake HOME (state lives in ~/.claude/gsd-t-e2e).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const guard = require(path.join(SCRIPTS, 'gsd-t-build-speed-guard.js'));

function project() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bsg-home-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsg-proj-'));
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
  g('init', '-q');
  fs.writeFileSync(path.join(dir, 'app.js'), 'x\n');
  g('add', '.');
  g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  return { home, dir };
}

function hook(script, payload, home) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script)], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason : null;
}

const pre = (p, command, extra = {}) => hook('gsd-t-build-speed-guard.js', { tool_name: 'Bash', cwd: p.dir, tool_input: { command, ...extra } }, p.home);
const passed = (p, command, stdout) => hook('gsd-t-e2e-record.js', { tool_name: 'Bash', cwd: p.dir, tool_input: { command }, tool_response: { stdout, stderr: '' } }, p.home);
const failed = (p, command, error) => hook('gsd-t-e2e-failure-record.js', { tool_name: 'Bash', cwd: p.dir, tool_input: { command }, error }, p.home);

const RUN = 'npx playwright test e2e/login.spec.ts --reporter=list 2>&1 | tail -20';

test('an unchanged re-run of a failed run is blocked; any file change allows it', () => {
  const p = project();
  assert.equal(pre(p, RUN), null);
  passed(p, RUN, 'Running 3 tests\n  1 failed\n  2 passed (4.1s)');   // piped through tail: exit 0, still a failure
  assert.match(pre(p, RUN), /failed and no project file has changed/);
  assert.equal(pre(p, 'npx playwright test e2e/other.spec.ts'), null, 'a different run is not blocked');
  fs.writeFileSync(path.join(p.dir, 'app.js'), 'fixed\n');
  assert.equal(pre(p, RUN), null);
});

test('a failure reported through PostToolUseFailure blocks the same way', () => {
  const p = project();
  failed(p, 'npx playwright test e2e/a.spec.ts', 'Exit code 1\n  2 failed\n  [chromium] › a.spec.ts:3 › x');
  assert.match(pre(p, 'npx playwright test e2e/a.spec.ts'), /failed and no project file/);
});

test('test output files and .gsd-t logs do not count as a fix', () => {
  const p = project();
  failed(p, RUN, 'Exit code 1\n  1 failed');
  fs.mkdirSync(path.join(p.dir, 'test-results', 'x'), { recursive: true });
  fs.writeFileSync(path.join(p.dir, 'test-results', 'x', 'test-failed-1.png'), 'png');
  fs.mkdirSync(path.join(p.dir, '.gsd-t'));
  fs.writeFileSync(path.join(p.dir, '.gsd-t', 'token-log.md'), 'row');
  assert.match(pre(p, RUN), /no project file has changed/);
});

test('after a full-config failure, the next full run waits for a narrower pass', () => {
  const p = project();
  const FULL = 'cd ' + p.dir + ' && npx playwright test --config=playwright.roles.config.ts';
  failed(p, FULL, 'Exit code 1\n  4 failed\n  20 passed');
  fs.writeFileSync(path.join(p.dir, 'app.js'), 'attempt\n');
  assert.match(pre(p, FULL), /Re-run only what failed first/);
  const NARROW = 'npx playwright test --config=playwright.roles.config.ts --last-failed';
  assert.equal(pre(p, NARROW), null);
  passed(p, NARROW, '  4 passed (9s)');
  assert.equal(pre(p, FULL), null);
});

test('a run whose outcome was not seen records nothing', () => {
  const p = project();
  passed(p, RUN, 'Command running in background with ID: abc');
  passed(p, RUN, '');
  assert.equal(pre(p, RUN), null);
  assert.equal(fs.existsSync(path.join(p.home, '.claude', 'gsd-t-e2e')), false);
});

test('outside a git work tree the e2e rules do not apply', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bsg-home-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsg-nogit-'));
  const p = { home, dir };
  failed(p, RUN, 'Exit code 1\n  1 failed');
  assert.equal(pre(p, RUN), null);
});

test('run identity: flags that do not change which tests run are ignored', () => {
  const a = guard.playwrightRun('npx playwright test b.spec.ts a.spec.ts --workers=4 --reporter=line', '/p');
  const b = guard.playwrightRun('HEADED=1 npx playwright test a.spec.ts b.spec.ts', '/p');
  assert.equal(a.runKey, b.runKey);
  assert.equal(a.full, false);
  assert.equal(guard.playwrightRun('npx playwright test --project=walkthrough', '/p').full, true);
  assert.equal(guard.playwrightRun('npx playwright test -g "login"', '/p').full, false);
  assert.equal(guard.playwrightRun('npm test', '/p'), null);
  assert.equal(guard.playwrightRun('cd prototype && npx playwright test', '/p').dir, '/p/prototype');
});

test('long foreground waits are blocked; short or background ones are not', () => {
  const p = project();
  assert.match(pre(p, 'until curl -s localhost:3000; do sleep 5; done'), /open-ended sleep loop/);
  assert.match(pre(p, 'for i in $(seq 1 60); do curl -s x && break; sleep 10; done'), /up to 600s/);
  assert.match(pre(p, 'sleep 120 && ls'), /up to 120s/);
  assert.equal(pre(p, 'for i in 1 2 3; do curl -s x && break; sleep 2; done'), null);
  assert.equal(pre(p, 'sleep 5 && ls'), null);
  assert.equal(pre(p, 'until curl -s localhost:3000; do sleep 5; done', { run_in_background: true }), null);
  assert.equal(pre(p, 'while read l; do echo "$l"; done < f'), null);
});

test('outcome comes from the summary line', () => {
  assert.equal(guard.outcomeOf('  3 failed\n  1 passed'), 'failed');
  assert.equal(guard.outcomeOf('  12 passed (3.2s)'), 'passed');
  assert.equal(guard.outcomeOf('Error: no tests found'), null);
});
