'use strict';

/**
 * branch-guard — verify current git branch matches CLAUDE.md "Expected branch" rule.
 *
 * Severity: error (blocks). If CLAUDE.md declares no expected-branch rule, the
 * check passes with a message that NAMES the gap ("NOT CHECKED — …") rather than
 * one that reads like approval: a pass that compared nothing must say so.
 *
 * The rule governs the MAIN checkout. Inside a linked worktree (a side copy of
 * the repo) the house rules require a feature branch, so being off the declared
 * branch there is correct, not a violation — the check passes and says why. The
 * one genuinely dangerous state in a side copy is a detached HEAD, where commits
 * belong to no branch and are easily lost; that still fails.
 *
 * An unreadable CLAUDE.md HALTS. Treating a permissions or corruption failure as
 * "no rules to enforce" is a real failure wearing a pass.
 *
 * Pure inspection — runs read-only git commands and reads CLAUDE.md.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { isLinkedWorktree } = require('../gsd-t-worktree-detect.cjs');

const ID = 'branch-guard';

// Distinguishes "the file is not there" (ordinary) from "the file is there and
// could not be read" (a failure). Collapsing both to null is what let a real
// error pass as a clean run.
const NO_FILE = Symbol('no-claude-md');

function _readClaudeMd(projectDir) {
  const file = path.join(projectDir, 'CLAUDE.md');
  if (!fs.existsSync(file)) return NO_FILE;
  // Deliberately no try/catch: an unreadable rules file is a real failure and
  // must reach the caller.
  return fs.readFileSync(file, 'utf8');
}

/**
 * Pull the expected branch out of CLAUDE.md, in either shape a project writes it.
 *
 * Nothing fills this in mechanically — /gsd-t-setup is a prose command, so a
 * person or an assistant types the line by hand. Accepting only one shape is how
 * the guard came to sit dead in every scaffolded project: the template wrote a
 * table row and the reader looked for a sentence.
 *
 *   Sentence:  "Expected branch: main"   "**Expected branch**: `develop`"
 *   Table row: "| Expected branch | `main` |"
 *
 * Returns the branch name, or an empty string when the project states no rule.
 */
function _extractExpectedBranch(text) {
  if (!text || typeof text !== 'string') return '';

  const row = text.match(
    /^\s*\|\s*\**\s*expected\s+branch\s*\**\s*\|\s*`?([^\s`|*]+)`?\s*\|/im
  );
  if (row) return row[1].trim();

  const line = text.match(/\*{0,2}\s*expected\s+branch\s*\*{0,2}\s*:\s*\**\s*`?([^\s`*\n|]+)`?/i);
  if (line) return line[1].trim();

  return '';
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
  let md;
  try {
    md = _readClaudeMd(projectDir);
  } catch (err) {
    return {
      ok: false,
      msg:
        'CLAUDE.md exists but could not be read (' +
        ((err && err.message) || err) +
        ') — the branch rule cannot be checked; fix the file or its permissions',
    };
  }

  if (md === NO_FILE) {
    return {
      ok: true,
      msg: 'NOT CHECKED — no CLAUDE.md in this project',
    };
  }

  // A project stating no rule is a fact about the project, and the verdict below
  // reports exactly that. Nothing was looked up and lost, and no value stands in
  // for a missing one.
  const expected = _extractExpectedBranch(md);
  const declaresARule = expected.length > 0;

  if (declaresARule === false) {
    return {
      ok: true,
      msg: 'NOT CHECKED — this project declares no expected branch',
    };
  }

  let actual;
  try {
    actual = _currentBranch(projectDir);
  } catch (err) {
    return {
      ok: false,
      msg: 'git branch --show-current failed: ' + ((err && err.message) || err),
      details: { expected },
    };
  }

  // A side copy of the repo is MEANT to be on its own branch — the house rules
  // require it. Only the main checkout is held to the declared branch.
  let inWorktree;
  try {
    inWorktree = isLinkedWorktree(projectDir);
  } catch (err) {
    return {
      ok: false,
      msg: 'could not tell whether this is a worktree: ' + ((err && err.message) || err),
      details: { expected, actual },
    };
  }

  if (inWorktree === true) {
    if (actual === '') {
      return {
        ok: false,
        msg: 'not on a branch in this worktree — commits made here would be lost',
        details: { expected, actual: '', worktree: true },
      };
    }
    return {
      ok: true,
      msg:
        'worktree on ' +
        actual +
        ' — the expected-branch rule (' +
        expected +
        ') governs the main checkout only',
      details: { expected, actual, worktree: true },
    };
  }

  if (actual === '') {
    return {
      ok: false,
      msg: 'detached HEAD or empty branch (expected ' + expected + ')',
      details: { expected, actual: '', worktree: false },
    };
  }

  if (actual === expected) {
    return {
      ok: true,
      msg: 'on expected branch ' + expected,
      details: { expected, actual, worktree: false },
    };
  }

  return {
    ok: false,
    msg: 'on ' + actual + ', expected ' + expected,
    details: { expected, actual, worktree: false },
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
  NO_FILE,
};
