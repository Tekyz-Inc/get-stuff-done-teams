'use strict';

/**
 * discuss kind collector — surfaces current state from progress.md plus a
 * trimmed CLAUDE.md slice for a discuss-phase exploratory worker.
 *
 * Fail-open: missing optional source → empty field, brief still written.
 */

const fs = require('fs');
const path = require('path');

const NAME = 'discuss';
const PROGRESS_PATH = '.gsd-t/progress.md';
const CLAUDE_MD_PATH = 'CLAUDE.md';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _progressHeader(progressText) {
  if (!progressText) return null;
  // First 30 lines = title + status + version + current milestone block.
  // Cap to 4,000 chars to honor MAX_BRIEF_BYTES (10 KB) once combined with
  // claudeMdSummary and the envelope.
  const head = progressText.split(/\r?\n/).slice(0, 30).join('\n');
  return head.length > 4000 ? head.slice(0, 3997) + '...' : head;
}

function _claudeMdSummary(claudeText) {
  if (!claudeText) return null;
  // First 800 chars covers the project-level summary; honors the
  // 10 KB MAX_BRIEF_BYTES cap once combined with progressHeader + envelope.
  return claudeText.length > 800 ? claudeText.slice(0, 797) + '...' : claudeText;
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;

  const progressText = _readMaybe(path.join(projectDir, PROGRESS_PATH));
  if (progressText) recordSource(PROGRESS_PATH);

  const claudeText = _readMaybe(path.join(projectDir, CLAUDE_MD_PATH));
  if (claudeText) recordSource(CLAUDE_MD_PATH);

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: [],
    ancillary: {
      progressHeader: _progressHeader(progressText),
      claudeMdSummary: _claudeMdSummary(claudeText),
    },
  };
}

module.exports = {
  name: NAME,
  requiresSources: [],
  collect,
  _progressHeader,
  _claudeMdSummary,
};
