'use strict';

/**
 * milestone kind collector — surfaces the most-recent COMPLETE milestone
 * row + the last 3 Decision Log entries + the version-bump rationale
 * heuristic for a milestone-definition worker.
 *
 * Fail-open: missing optional source → empty field, brief still written.
 */

const fs = require('fs');
const path = require('path');

const NAME = 'milestone';
const PROGRESS_PATH = '.gsd-t/progress.md';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _lastCompletedMilestone(progressText) {
  if (!progressText) return null;
  // Look for the first row in the Milestones table with status COMPLETE / COMPLETED.
  const lines = progressText.split(/\r?\n/);
  for (const line of lines) {
    if (/^\|\s*M\d+\s*\|.*\|\s*(COMPLETE|COMPLETED)\s*\|/i.test(line)) {
      return line.length > 800 ? line.slice(0, 800) + ' …' : line;
    }
  }
  return null;
}

function _versionFromProgress(progressText) {
  if (!progressText) return null;
  const m = progressText.match(/##\s+Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/i);
  return m ? m[1] : null;
}

function _lastDecisionLogEntries(progressText, n) {
  if (!progressText) return [];
  // Decision Log entries start with `- YYYY-MM-DD HH:MM`
  const re = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}[^\n]*$/gm;
  const all = [];
  let m;
  while ((m = re.exec(progressText)) != null) {
    let entry = m[0];
    if (entry.length > 400) entry = entry.slice(0, 397) + '...';
    all.push(entry);
  }
  return all.slice(0, n);
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;

  const progressText = _readMaybe(path.join(projectDir, PROGRESS_PATH));
  if (progressText) recordSource(PROGRESS_PATH);

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: [],
    ancillary: {
      lastCompletedMilestoneRow: _lastCompletedMilestone(progressText),
      currentVersion: _versionFromProgress(progressText),
      lastDecisionLogEntries: _lastDecisionLogEntries(progressText, 3),
    },
  };
}

module.exports = {
  name: NAME,
  requiresSources: [],
  collect,
  _lastCompletedMilestone,
  _versionFromProgress,
  _lastDecisionLogEntries,
};
