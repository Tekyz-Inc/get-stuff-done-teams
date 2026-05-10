'use strict';

/**
 * plan kind collector — surfaces the current milestone row plus a list of
 * partitioned domain names with their scope.md "Files Owned" first-N entries.
 *
 * Fail-open: missing optional source → empty field, brief still written.
 */

const fs = require('fs');
const path = require('path');

const NAME = 'plan';
const PROGRESS_PATH = '.gsd-t/progress.md';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _currentMilestoneRow(progressText) {
  if (!progressText) return null;
  const lines = progressText.split(/\r?\n/);
  for (const line of lines) {
    if (/^\|\s*M\d+\s*\|.*(DEFINED|PARTITIONED|PLANNED|EXECUTING|EXECUTED|VERIFY)/i.test(line)) {
      return line.length > 800 ? line.slice(0, 800) + ' …' : line;
    }
  }
  return null;
}

function _domainSummaries(projectDir, currentMilestonePrefix, recordSource) {
  const dir = path.join(projectDir, '.gsd-t', 'domains');
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return []; }
  const out = [];
  for (const name of entries.sort()) {
    if (currentMilestonePrefix && !name.startsWith(currentMilestonePrefix)) continue;
    const scopePath = '.gsd-t/domains/' + name + '/scope.md';
    const scopeText = _readMaybe(path.join(projectDir, scopePath));
    if (!scopeText) continue;
    if (recordSource) recordSource(scopePath);
    // First "## Responsibility" paragraph + first 3 "Files Owned" bullets.
    let resp = '';
    const respMatch = scopeText.match(/^##\s+Responsibility\s*\n([^\n]+)/mi);
    if (respMatch) resp = respMatch[1].trim().slice(0, 200);
    const files = [];
    const filesBody = scopeText.match(/^##\s+Files Owned\s*\n([\s\S]*?)(?=^##\s+|\s*$)/mi);
    if (filesBody) {
      const bullets = filesBody[1].split(/\r?\n/).filter((l) => /^[-*]\s+/.test(l)).slice(0, 3);
      for (const b of bullets) {
        const m = b.match(/^[-*]\s+`([^`]+)`/);
        if (m) files.push(m[1]);
      }
    }
    out.push({ domain: name, responsibility: resp, filesOwnedFirst3: files });
  }
  return out;
}

function _currentMilestonePrefix(progressText) {
  if (!progressText) return null;
  const m = progressText.match(/^\|\s*(M\d+)\s*\|.*(DEFINED|PARTITIONED|PLANNED|EXECUTING|EXECUTED|VERIFY)/im);
  return m ? m[1].toLowerCase() : null;
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;

  const progressText = _readMaybe(path.join(projectDir, PROGRESS_PATH));
  if (progressText) recordSource(PROGRESS_PATH);

  const milestoneRow = _currentMilestoneRow(progressText);
  const prefix = _currentMilestonePrefix(progressText);
  const domains = _domainSummaries(projectDir, prefix, recordSource);

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: [],
    ancillary: {
      currentMilestoneRow: milestoneRow,
      milestonePrefix: prefix,
      partitionedDomains: domains,
    },
  };
}

module.exports = {
  name: NAME,
  requiresSources: [],
  collect,
  _currentMilestoneRow,
  _currentMilestonePrefix,
  _domainSummaries,
};
