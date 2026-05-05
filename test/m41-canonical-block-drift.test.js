'use strict';

// M41 D2-T4: canonical block drift guard.
// Asserts:
//   1. No command file still carries the legacy `T_START=$(date +%s)` bash block.
//   2. No command file shows a `| N/A |` rendering in the Tokens position.
//   3. Every OBSERVABILITY LOGGING block is paired with a captureSpawn (or
//      recordSpawnRow, for fire-and-forget spawns like unattended.md).
//   4. `templates/CLAUDE-global.md` and the live `~/.claude/CLAUDE.md` source
//      both describe the Token Capture Rule, so subagent spawns inherit it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const commandsDir = path.join(repoRoot, 'commands');

function listCommandFiles() {
  return fs.readdirSync(commandsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(commandsDir, f));
}

test('no command file still contains legacy `T_START=$(date +%s)` bash block', () => {
  const offenders = [];
  for (const file of listCommandFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    // Match the legacy bash inline form only — allow incidental prose containing
    // `T_START` as a variable name elsewhere.
    if (/T_START=\$\(date \+%s\)/.test(src)) offenders.push(path.basename(file));
  }
  assert.deepEqual(offenders, [], `Legacy T_START blocks remain in: ${offenders.join(', ')}`);
});

test('no command file renders `| N/A |` in a Tokens cell', () => {
  const offenders = [];
  for (const file of listCommandFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    if (/\| N\/A \|/.test(src)) offenders.push(path.basename(file));
  }
  assert.deepEqual(offenders, [], `| N/A | rows remain in: ${offenders.join(', ')}`);
});

test('every OBSERVABILITY LOGGING block is paired with captureSpawn or recordSpawnRow', () => {
  const offenders = [];
  for (const file of listCommandFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const obsCount = (src.match(/OBSERVABILITY LOGGING/g) || []).length;
    if (obsCount === 0) continue;
    const hasCapture = /captureSpawn|recordSpawnRow/.test(src);
    if (!hasCapture) offenders.push(path.basename(file));
  }
  assert.deepEqual(offenders, [], `Files declare OBSERVABILITY LOGGING without capture hook: ${offenders.join(', ')}`);
});

test('templates/CLAUDE-global.md carries the Token Capture Rule', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'templates', 'CLAUDE-global.md'), 'utf8');
  assert.match(src, /Token Capture Rule/, 'templates/CLAUDE-global.md is missing the Token Capture Rule section');
  assert.match(src, /gsd-t-token-capture\.cjs/, 'templates/CLAUDE-global.md does not reference bin/gsd-t-token-capture.cjs');
});

test('project CLAUDE.md and templates/CLAUDE-global.md both reference bin/gsd-t-token-capture.cjs', () => {
  const projectClaude = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
  const globalTemplate = fs.readFileSync(path.join(repoRoot, 'templates', 'CLAUDE-global.md'), 'utf8');
  assert.match(projectClaude, /gsd-t-token-capture\.cjs/);
  assert.match(globalTemplate, /gsd-t-token-capture\.cjs/);
});

test('PROJECT_BIN_TOOLS in bin/gsd-t.js includes gsd-t-token-capture.cjs', () => {
  // Token Capture Rule (CLAUDE.md): every Task spawn MUST flow through
  // bin/gsd-t-token-capture.cjs. For that contract to hold in installed projects,
  // the installer's PROJECT_BIN_TOOLS array MUST list the wrapper. Without this
  // guard, init/update-all silently ships projects without the wrapper, every
  // Task subagent spawn fails to find it, and the rule degrades to advisory.
  // (Discovered 2026-05-05 across 15 of 18 registered projects.)
  const installer = fs.readFileSync(path.join(repoRoot, 'bin', 'gsd-t.js'), 'utf8');
  const block = installer.match(/const PROJECT_BIN_TOOLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'PROJECT_BIN_TOOLS array not found in bin/gsd-t.js');
  assert.match(block[1], /["']gsd-t-token-capture\.cjs["']/,
    'PROJECT_BIN_TOOLS must include "gsd-t-token-capture.cjs" — the Token Capture Rule depends on every project having the wrapper at bin/gsd-t-token-capture.cjs');
});
