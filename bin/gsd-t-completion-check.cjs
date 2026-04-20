'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function tryRun(cmd, cwd) {
  try {
    return { ok: true, out: run(cmd, cwd), code: 0 };
  } catch (err) {
    return { ok: false, out: (err.stdout || '') + (err.stderr || ''), code: err.status == null ? -1 : err.status };
  }
}

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = escaped.replace(/\*\*/g, '::DBLSTAR::').replace(/\*/g, '[^/]*').replace(/::DBLSTAR::/g, '.*').replace(/\?/g, '[^/]');
  return new RegExp('^' + re + '$');
}

function matchesAny(filePath, patterns) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some(p => globToRegex(p).test(filePath));
}

function assertCompletion(opts) {
  const {
    taskId,
    projectDir,
    expectedBranch,
    taskStart,
    skipTest = false,
    ownedPatterns = []
  } = opts || {};

  if (!taskId || !projectDir || !expectedBranch || !taskStart) {
    throw new Error('assertCompletion requires taskId, projectDir, expectedBranch, taskStart');
  }

  const missing = [];
  const details = {};

  const branchRes = tryRun('git branch --show-current', projectDir);
  const currentBranch = branchRes.ok ? branchRes.out.trim() : '';
  details.currentBranch = currentBranch;

  const sinceArg = JSON.stringify(taskStart);
  const logCmd = `git log ${JSON.stringify(expectedBranch)} --since=${sinceArg} --pretty=format:%H%x00%s`;
  const logRes = tryRun(logCmd, projectDir);
  const commits = [];
  const taskIdRe = new RegExp('^' + taskId.replace(/[.+^${}()|[\]\\]/g, '\\$&') + '(\\b|:)');
  if (logRes.ok) {
    for (const line of logRes.out.split('\n')) {
      if (!line) continue;
      const [sha, subject] = line.split('\x00');
      if (subject && taskIdRe.test(subject)) commits.push({ sha, subject });
    }
  }
  details.commits = commits;
  if (commits.length === 0) missing.push('no_commit_on_branch');

  const progressPath = path.join(projectDir, '.gsd-t', 'progress.md');
  let progressEntry = null;
  if (fs.existsSync(progressPath)) {
    const body = fs.readFileSync(progressPath, 'utf8');
    const lines = body.split('\n');
    const entryRe = new RegExp('^- \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}.*' + taskId.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
    for (const line of lines) {
      if (entryRe.test(line)) {
        progressEntry = line;
        break;
      }
    }
  }
  details.progressEntry = progressEntry;
  if (!progressEntry) missing.push('no_progress_entry');

  if (!skipTest) {
    const testRes = tryRun('npm test --silent', projectDir);
    details.testExitCode = testRes.code;
    details.testOutput = (testRes.out || '').slice(-2000);
    if (!testRes.ok) missing.push('tests_failed');
  } else {
    details.testSkipped = true;
  }

  const statusRes = tryRun('git status --porcelain', projectDir);
  const uncommitted = [];
  if (statusRes.ok) {
    for (const line of statusRes.out.split('\n')) {
      if (!line.trim()) continue;
      const filePath = line.slice(3).trim();
      if (matchesAny(filePath, ownedPatterns)) uncommitted.push(filePath);
    }
  }
  details.uncommitted = uncommitted;
  if (uncommitted.length > 0) missing.push('uncommitted_owned_changes');

  return { ok: missing.length === 0, missing, details };
}

module.exports = { assertCompletion };
