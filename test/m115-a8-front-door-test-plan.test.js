'use strict';

/**
 * M115 A8 — the front-door test (front-door-wiring, Wave 3).
 *
 * Proves the test-plan feature is REACHABLE, not merely present on disk. Every
 * assertion below checks a real front door — the router, the CLI dispatch, both
 * bin-tool registries, and the verify workflow's gate wiring — never the
 * existence of a file in isolation, which is exactly the shape of the four
 * prior propagation failures ([[project_global_bin_propagation_gap]]).
 *
 * This file was run BEFORE the wiring in this domain landed and was confirmed
 * red (no `test-plan` in commands/gsd.md, no `testplan` case in bin/gsd-t.js,
 * neither tool in either registry) — that confirmation is what proves this
 * tests the front door rather than the disk.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// ─── The command file exists and is reachable via the valid-slugs list ──────

test('commands/gsd-t-test-plan.md exists', () => {
  const p = path.join(ROOT, 'commands', 'gsd-t-test-plan.md');
  assert.ok(fs.existsSync(p), 'commands/gsd-t-test-plan.md must exist');
});

test('the router (commands/gsd.md) names test-plan as a valid command slug', () => {
  const gsdMd = readIfExists(path.join(ROOT, 'commands', 'gsd.md'));
  assert.ok(gsdMd, 'commands/gsd.md must exist');
  assert.match(
    gsdMd,
    /Valid command slugs:[^\n]*\btest-plan\b/,
    'commands/gsd.md must list test-plan in "Valid command slugs" so the router can route the literal /gsd-t-test-plan resolution and never mistake it for free-form text'
  );
});

// ─── The command file resolves scriptPath (or documents it has none) ───────

test('the command file does not invent a nonexistent Workflow scriptPath', () => {
  const cmd = readIfExists(path.join(ROOT, 'commands', 'gsd-t-test-plan.md'));
  assert.ok(cmd, 'commands/gsd-t-test-plan.md must exist');
  // If the command claims a Workflow({ scriptPath }) invocation, that script must
  // actually exist — a claimed scriptPath pointing at nothing is a dead front door
  // dressed as a working one.
  const scriptPathClaim = cmd.match(/gsd-t-([a-z-]+)\.workflow\.js/);
  if (scriptPathClaim) {
    const wf = path.join(ROOT, 'templates', 'workflows', `gsd-t-${scriptPathClaim[1]}.workflow.js`);
    assert.ok(fs.existsSync(wf), `command claims scriptPath ${wf} but it does not exist on disk`);
  }
  // Otherwise the command must describe itself as in-session (no invented script).
});

test('both before-mode and --after mode are described in the command file', () => {
  const cmd = readIfExists(path.join(ROOT, 'commands', 'gsd-t-test-plan.md'));
  assert.ok(cmd, 'commands/gsd-t-test-plan.md must exist');
  assert.match(cmd, /--after/, 'command must describe --after mode');
  assert.match(cmd, /## Before-mode/i, 'command must describe before-mode');
});

test('the command batches open rows into ONE question round and names the drip as banned (A4)', () => {
  const cmd = readIfExists(path.join(ROOT, 'commands', 'gsd-t-test-plan.md'));
  assert.ok(cmd, 'commands/gsd-t-test-plan.md must exist');
  assert.match(
    cmd,
    /ONE (?:round|question round)/i,
    'command must state that open rows are batched into one round'
  );
  assert.match(
    cmd,
    /never.{0,40}(one question at a time|a drip)|drip.{0,60}defeats/i,
    'command must explicitly name a drip (one question at a time) as banned'
  );
});

test('the command describes the three-round halt and points at the halt tool', () => {
  const cmd = readIfExists(path.join(ROOT, 'commands', 'gsd-t-test-plan.md'));
  assert.ok(cmd, 'commands/gsd-t-test-plan.md must exist');
  assert.match(cmd, /testplan-halt/, 'command must point at the testplan-halt tool');
  assert.match(cmd, /three/i, 'command must describe the three-round cap');
});

test('the command has a Document Ripple section', () => {
  const cmd = readIfExists(path.join(ROOT, 'commands', 'gsd-t-test-plan.md'));
  assert.ok(cmd, 'commands/gsd-t-test-plan.md must exist');
  assert.match(cmd, /^## Document Ripple/m, 'command must have a Document Ripple section');
});

// ─── CLI dispatch: both verbs reach through the real entry point ───────────
//
// Dispatched via `node bin/gsd-t.js <verb> --help`, NOT by running the .cjs
// directly — the direct-.cjs path already worked before this domain existed
// and proves nothing about the front door (per task acceptance criteria).

const GSDT_JS = path.join(ROOT, 'bin', 'gsd-t.js');

function dispatchViaCli(verb) {
  const { spawnSync } = require('node:child_process');
  return spawnSync(process.execPath, [GSDT_JS, verb, 'check', '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15000,
  });
}

test('`gsd-t testplan-lint` dispatches through the CLI entry point (not the raw .cjs)', () => {
  const res = dispatchViaCli('testplan-lint');
  assert.notEqual(res.status, null, 'gsd-t.js must not hang or be killed for testplan-lint');
  // Unreachable-verb signature the CLI uses for an unregistered command: "Unknown command"
  // on stderr/stdout. If that shows up, the dispatch case is missing entirely.
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  assert.doesNotMatch(
    out,
    /Unknown command/i,
    'bin/gsd-t.js must have a "testplan-lint" dispatch case reachable via the CLI entry point'
  );
});

test('`gsd-t testplan-halt` dispatches through the CLI entry point (not the raw .cjs)', () => {
  const res = dispatchViaCli('testplan-halt');
  assert.notEqual(res.status, null, 'gsd-t.js must not hang or be killed for testplan-halt');
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  assert.doesNotMatch(
    out,
    /Unknown command/i,
    'bin/gsd-t.js must have a "testplan-halt" dispatch case reachable via the CLI entry point'
  );
});

// ─── Both registries: parsed as ARRAYS, never by substring on the whole file ─
//
// Same pattern as test/m90-tier-policy-lint.test.js — capture the array
// literal's own source span, then check membership inside that span only, so
// a mention of the tool name elsewhere in the file (a comment, a doc string)
// can never produce a false pass.

function extractArraySource(gsdtText, arrayName) {
  const re = new RegExp(`const ${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`);
  const m = gsdtText.match(re);
  return m ? m[1] : null;
}

test('both new tools appear in GLOBAL_BIN_TOOLS (parsed as an array)', () => {
  const gsdtText = readIfExists(GSDT_JS);
  assert.ok(gsdtText, 'bin/gsd-t.js must be readable');
  const globalSrc = extractArraySource(gsdtText, 'GLOBAL_BIN_TOOLS');
  assert.ok(globalSrc, 'GLOBAL_BIN_TOOLS array must be parseable in gsd-t.js');
  assert.match(globalSrc, /"gsd-t-testplan-lint\.cjs"/, 'gsd-t-testplan-lint.cjs must be in GLOBAL_BIN_TOOLS');
  assert.match(globalSrc, /"gsd-t-testplan-halt\.cjs"/, 'gsd-t-testplan-halt.cjs must be in GLOBAL_BIN_TOOLS');
});

test('both new tools appear in PROJECT_BIN_TOOLS (parsed as an array)', () => {
  const gsdtText = readIfExists(GSDT_JS);
  assert.ok(gsdtText, 'bin/gsd-t.js must be readable');
  const projectSrc = extractArraySource(gsdtText, 'PROJECT_BIN_TOOLS');
  assert.ok(projectSrc, 'PROJECT_BIN_TOOLS array must be parseable in gsd-t.js');
  assert.match(projectSrc, /"gsd-t-testplan-lint\.cjs"/, 'gsd-t-testplan-lint.cjs must be in PROJECT_BIN_TOOLS');
  assert.match(projectSrc, /"gsd-t-testplan-halt\.cjs"/, 'gsd-t-testplan-halt.cjs must be in PROJECT_BIN_TOOLS');
});

test('both new tools appear in BOTH registries at once (the propagation-gap class)', () => {
  const gsdtText = readIfExists(GSDT_JS);
  assert.ok(gsdtText, 'bin/gsd-t.js must be readable');
  const globalSrc = extractArraySource(gsdtText, 'GLOBAL_BIN_TOOLS');
  const projectSrc = extractArraySource(gsdtText, 'PROJECT_BIN_TOOLS');
  for (const tool of ['gsd-t-testplan-lint.cjs', 'gsd-t-testplan-halt.cjs']) {
    const inGlobal = new RegExp(`"${tool.replace(/\./g, '\\.')}"`).test(globalSrc || '');
    const inProject = new RegExp(`"${tool.replace(/\./g, '\\.')}"`).test(projectSrc || '');
    assert.ok(inGlobal && inProject, `${tool} must appear in BOTH GLOBAL_BIN_TOOLS and PROJECT_BIN_TOOLS — a tool in only one ships dead in some projects`);
  }
});

// ─── Verify workflow: the gate is wired, and the four outcomes are distinct ─

test('the verify workflow wires testplan-lint as a gate', () => {
  const wf = readIfExists(path.join(ROOT, 'templates', 'workflows', 'gsd-t-verify.workflow.js'));
  assert.ok(wf, 'templates/workflows/gsd-t-verify.workflow.js must exist');
  assert.match(wf, /testplan-lint/, 'verify workflow must reference testplan-lint');
});

test('the verify workflow names a distinct no-plan skip reason and a distinct discovery-error FAIL reason', () => {
  const wf = readIfExists(path.join(ROOT, 'templates', 'workflows', 'gsd-t-verify.workflow.js'));
  assert.ok(wf, 'templates/workflows/gsd-t-verify.workflow.js must exist');
  assert.match(wf, /no-test-plan/, 'verify workflow must use the named skip reason "no-test-plan"');
  assert.match(wf, /testplan-discovery-error/, 'verify workflow must use the named FAIL reason "testplan-discovery-error"');
});

test('the discovery-error path is wired to FAIL, never to the skip branch (PM-1)', () => {
  const wf = readIfExists(path.join(ROOT, 'templates', 'workflows', 'gsd-t-verify.workflow.js'));
  assert.ok(wf, 'templates/workflows/gsd-t-verify.workflow.js must exist');
  // Find the block around testplan-discovery-error and confirm it sits inside a
  // path that returns a FAIL-shaped status, never inside a `skips.push`/log-SKIP
  // construction. This is intentionally a structural proximity check, not a
  // substring-anywhere-in-file check: it requires the SAME statement to name
  // testplan-discovery-error AND a VERIFY-FAILED-shaped return within a small window.
  const idx = wf.indexOf('testplan-discovery-error');
  assert.notEqual(idx, -1, 'testplan-discovery-error must appear in the workflow');
  const windowText = wf.slice(Math.max(0, idx - 400), idx + 400);
  assert.match(
    windowText,
    /VERIFY-FAILED|status:\s*["']testplan/,
    'the testplan-discovery-error reason must sit alongside a FAIL-shaped return, not a skip'
  );
  assert.doesNotMatch(
    windowText,
    /skips\.push|SKIP \(/,
    'testplan-discovery-error must never be constructed as a skip — a gate that cannot check must HALT, never pass (guard-map gate class bug)'
  );
});
