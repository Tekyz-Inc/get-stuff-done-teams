'use strict';

/**
 * partition kind collector — surfaces the current milestone row from
 * progress.md, the file-disjointness rules excerpt, and the existing
 * domain table for partition-phase workers.
 *
 * Fail-open: missing optional source → empty field, brief still written.
 */

const fs = require('fs');
const path = require('path');

const NAME = 'partition';
const PROGRESS_PATH = '.gsd-t/progress.md';
const DISJOINT_RULES_PATH = '.gsd-t/contracts/file-disjointness-rules.md';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _currentMilestoneRow(progressText) {
  if (!progressText) return null;
  // Find first ACTIVE / DEFINED / PARTITIONED / PLANNED / EXECUTING row in the
  // Milestones table — this is the milestone partition is operating on.
  const lines = progressText.split(/\r?\n/);
  for (const line of lines) {
    if (/^\|\s*M\d+\s*\|.*(DEFINED|PARTITIONED|PLANNED|EXECUTING|EXECUTED|VERIFY)/i.test(line)) {
      // Truncate row to first 800 chars to honor 2,500-token brief cap.
      return line.length > 800 ? line.slice(0, 800) + ' …' : line;
    }
  }
  return null;
}

function _existingDomains(projectDir) {
  const dir = path.join(projectDir, '.gsd-t', 'domains');
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return []; }
  return entries.filter((e) => /^[a-z0-9_-]+$/i.test(e)).sort();
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;

  const progressText = _readMaybe(path.join(projectDir, PROGRESS_PATH));
  if (progressText) recordSource(PROGRESS_PATH);

  const disjointRules = _readMaybe(path.join(projectDir, DISJOINT_RULES_PATH));
  if (disjointRules) recordSource(DISJOINT_RULES_PATH);

  const milestoneRow = _currentMilestoneRow(progressText);
  const domains = _existingDomains(projectDir);

  // Trim disjoint-rules excerpt to ~1,200 chars to honor cap.
  let rulesExcerpt = null;
  if (disjointRules) {
    rulesExcerpt = disjointRules.length > 1200
      ? disjointRules.slice(0, 1197) + '...'
      : disjointRules;
  }

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: [],
    ancillary: {
      currentMilestoneRow: milestoneRow,
      existingDomains: domains,
      disjointnessRulesExcerpt: rulesExcerpt,
    },
  };
}

module.exports = {
  name: NAME,
  requiresSources: [],
  collect,
  _currentMilestoneRow,
  _existingDomains,
};
