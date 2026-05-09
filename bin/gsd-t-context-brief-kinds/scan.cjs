'use strict';

/**
 * scan kind collector — surfaces a repo-file-inventory hash, the prior
 * scan output mtime (if any), and the merged exclusion patterns.
 *
 * Fail-open: missing optional source → null/empty field, brief still written.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const NAME = 'scan';
const PRIOR_SCAN_OUTPUT = '.gsd-t/scan/output.md';
const SCAN_EXCLUSIONS = '.gsd-t/scan/exclusions.txt';
const GITIGNORE = '.gitignore';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _gitLsFiles(projectDir) {
  try {
    const stdout = execSync('git ls-files', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return String(stdout || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function _hashFileList(files) {
  const sorted = files.slice().sort();
  return crypto.createHash('sha256').update(sorted.join('\n')).digest('hex');
}

/**
 * Merge `.gitignore` patterns + `.gsd-t/scan/exclusions.txt` (if exists)
 * into a deduplicated, sorted list. Strips comment + blank lines.
 */
function _mergedExclusions(projectDir, recordSource) {
  const out = new Set();
  const giText = _readMaybe(path.join(projectDir, GITIGNORE));
  if (giText != null) {
    recordSource(GITIGNORE);
    for (const l of giText.split(/\r?\n/)) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      out.add(t);
    }
  }
  const seText = _readMaybe(path.join(projectDir, SCAN_EXCLUSIONS));
  if (seText != null) {
    recordSource(SCAN_EXCLUSIONS);
    for (const l of seText.split(/\r?\n/)) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      out.add(t);
    }
  }
  const arr = Array.from(out);
  arr.sort();
  return arr;
}

function _priorScanMtime(projectDir, recordSource) {
  const full = path.join(projectDir, PRIOR_SCAN_OUTPUT);
  if (!fs.existsSync(full)) return null;
  recordSource(PRIOR_SCAN_OUTPUT);
  try {
    const stat = fs.statSync(full);
    return new Date(stat.mtimeMs).toISOString();
  } catch (_) {
    return null;
  }
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;

  const files = _gitLsFiles(projectDir);
  const inventoryHash = files.length ? _hashFileList(files) : null;
  const inventoryCount = files.length;

  const exclusions = _mergedExclusions(projectDir, recordSource);
  const priorScanMtime = _priorScanMtime(projectDir, recordSource);

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: [],
    ancillary: {
      exclusions,
      inventoryCount,
      inventoryHash,
      priorScanMtime,
      priorScanPath: priorScanMtime ? PRIOR_SCAN_OUTPUT : null,
    },
  };
}

module.exports = {
  name: NAME,
  requiresSources: [],
  collect,
  _gitLsFiles,
  _hashFileList,
  _mergedExclusions,
};
