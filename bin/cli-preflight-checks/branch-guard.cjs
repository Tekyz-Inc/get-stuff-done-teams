'use strict';

/**
 * branch-guard — verify current git branch matches CLAUDE.md "Expected branch" rule.
 *
 * Severity: error (blocks). If CLAUDE.md has no "Expected branch:" line, the check
 * passes with `msg: "no expected-branch rule set"` (info-grade pass).
 *
 * Pure inspection — runs `git branch --show-current` (read-only) and reads CLAUDE.md.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ID = 'branch-guard';

function _readClaudeMd(projectDir) {
  const file = path.join(projectDir, 'CLAUDE.md');
  if (!fs.existsSync(file)) return null;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return null;
  }
}

function _extractExpectedBranch(text) {
  if (!text) return null;
  // Match `Expected branch:` (case-insensitive), allowing markdown emphasis like `**Expected branch**`,
  // backticks around the value, optional surrounding whitespace.
  // Examples that must match:
  //   "Expected branch: main"
  //   "Expected branch: `main`"
  //   "**Expected branch**: `develop`"
  //   "_Expected branch_: feature/foo"
  const re = /\*{0,2}\s*expected\s+branch\s*\*{0,2}\s*:\s*\**\s*`?([^\s`*\n]+)`?/i;
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function _currentBranch(projectDir) {
  // execSync is synchronous and read-only here.
  const stdout = execSync('git branch --show-current', {
    cwd: projectDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return String(stdout || '').trim();
}

function run({ projectDir }) {
  const md = _readClaudeMd(projectDir);
  if (md == null) {
    return {
      ok: true,
      msg: 'no CLAUDE.md found, skipping',
    };
  }
  const expected = _extractExpectedBranch(md);
  if (!expected) {
    return {
      ok: true,
      msg: 'no expected-branch rule set',
    };
  }

  let actual;
  try {
    actual = _currentBranch(projectDir);
  } catch (err) {
    return {
      ok: false,
      msg: 'git branch --show-current failed: ' + (err && err.message || err),
      details: { expected },
    };
  }

  if (!actual) {
    return {
      ok: false,
      msg: 'detached HEAD or empty branch (expected ' + expected + ')',
      details: { expected, actual: '' },
    };
  }

  if (actual === expected) {
    return {
      ok: true,
      msg: 'on expected branch ' + expected,
      details: { expected, actual },
    };
  }

  return {
    ok: false,
    msg: 'on ' + actual + ', expected ' + expected,
    details: { expected, actual },
  };
}

module.exports = {
  id: ID,
  severity: 'error',
  run,
  // Test-only exports
  _extractExpectedBranch,
  _readClaudeMd,
  _currentBranch,
};
