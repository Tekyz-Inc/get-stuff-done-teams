'use strict';

/**
 * impact kind collector — surfaces current state from progress.md, the
 * integration-points contract for the active milestone, and a git diff
 * summary so an impact-analysis worker can understand the blast radius.
 *
 * Fail-open: missing optional source → empty field, brief still written.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NAME = 'impact';
const PROGRESS_PATH = '.gsd-t/progress.md';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _currentMilestonePrefix(progressText) {
  if (!progressText) return null;
  const m = progressText.match(/^\|\s*(M\d+)\s*\|.*(DEFINED|PARTITIONED|PLANNED|EXECUTING|EXECUTED|VERIFY)/im);
  return m ? m[1].toLowerCase() : null;
}

function _integrationPointsExcerpt(projectDir, prefix, recordSource) {
  if (!prefix) return null;
  const candidates = [
    '.gsd-t/contracts/' + prefix + '-integration-points.md',
    '.gsd-t/contracts/integration-points.md',
  ];
  for (const rel of candidates) {
    const text = _readMaybe(path.join(projectDir, rel));
    if (text) {
      if (recordSource) recordSource(rel);
      return text.length > 1500 ? text.slice(0, 1497) + '...' : text;
    }
  }
  return null;
}

function _gitDiffSummary(projectDir) {
  try {
    const stdout = execSync('git diff --shortstat HEAD', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return String(stdout || '').trim() || null;
  } catch (_) {
    return null;
  }
}

function _gitDiffNames(projectDir) {
  try {
    const stdout = execSync('git diff --name-only HEAD', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return String(stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 30);
  } catch (_) {
    return [];
  }
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;

  const progressText = _readMaybe(path.join(projectDir, PROGRESS_PATH));
  if (progressText) recordSource(PROGRESS_PATH);

  const prefix = _currentMilestonePrefix(progressText);
  const integration = _integrationPointsExcerpt(projectDir, prefix, recordSource);

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: [],
    ancillary: {
      milestonePrefix: prefix,
      integrationPointsExcerpt: integration,
      gitDiffSummary: _gitDiffSummary(projectDir),
      changedFiles: _gitDiffNames(projectDir),
    },
  };
}

module.exports = {
  name: NAME,
  requiresSources: [],
  collect,
  _currentMilestonePrefix,
  _integrationPointsExcerpt,
};
