'use strict';

/**
 * contracts-stable — flag DRAFT/PROPOSED contracts when project is past
 * the PARTITIONED milestone state.
 *
 * Severity: warn.
 *
 * Reads:
 *   - .gsd-t/contracts/*.md  (looking for `Status: DRAFT` or `Status: PROPOSED`)
 *   - .gsd-t/progress.md     (looking for milestone state past PARTITIONED:
 *                             ACTIVE, EXECUTING, EXECUTED, INTEGRATING, INTEGRATED,
 *                             VERIFYING, VERIFIED, COMPLETED, etc.)
 *
 * If the project is NOT past PARTITIONED, this check is a noop pass — DRAFT/PROPOSED
 * contracts are expected pre-execute. After execute starts, they should all be STABLE.
 */

const fs = require('fs');
const path = require('path');

const ID = 'contracts-stable';

// States that count as "past PARTITIONED". Anything strictly before partition
// (DEFINED, PARTITIONED itself) is fine to have DRAFT/PROPOSED contracts.
const POST_PARTITIONED_STATES = [
  'ACTIVE',
  'EXECUTING',
  'EXECUTED',
  'TEST-SYNCING',
  'TEST-SYNCED',
  'INTEGRATING',
  'INTEGRATED',
  'VERIFYING',
  'VERIFIED',
  'COMPLETED',
];

function _isPastPartitioned(progressContent) {
  if (!progressContent) return false;
  // Look for any "Status: <state>" line where state is post-partitioned.
  // Match on lines (case-insensitive); exclude comments.
  const re = /^\s*Status\s*:\s*\**\s*([A-Za-z\-]+)/gim;
  let match;
  while ((match = re.exec(progressContent)) !== null) {
    const state = match[1].toUpperCase();
    if (POST_PARTITIONED_STATES.includes(state)) return true;
  }
  return false;
}

function _scanContracts(contractsDir) {
  if (!fs.existsSync(contractsDir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(contractsDir);
  } catch (_) {
    return [];
  }
  const offenders = [];
  for (const filename of entries) {
    if (!filename.endsWith('.md')) continue;
    const full = path.join(contractsDir, filename);
    let content;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch (_) {
      continue;
    }
    // Match a Status field anywhere; capture DRAFT/PROPOSED specifically.
    // Must allow markdown emphasis like `**DRAFT**` and surrounding `>` blockquotes.
    const re = /^[\s>]*Status\s*:\s*\**\s*(DRAFT|PROPOSED)\s*\**/im;
    const m = content.match(re);
    if (m) {
      offenders.push({ file: filename, status: m[1].toUpperCase() });
    }
  }
  return offenders;
}

function run({ projectDir }) {
  const contractsDir = path.join(projectDir, '.gsd-t', 'contracts');
  const progressFile = path.join(projectDir, '.gsd-t', 'progress.md');

  let progressContent = null;
  if (fs.existsSync(progressFile)) {
    try {
      progressContent = fs.readFileSync(progressFile, 'utf8');
    } catch (_) {
      progressContent = null;
    }
  }

  const offenders = _scanContracts(contractsDir);
  const past = _isPastPartitioned(progressContent);

  if (!past) {
    return {
      ok: true,
      msg: 'project not past PARTITIONED; ' + offenders.length + ' DRAFT/PROPOSED contract(s) acceptable',
      details: { offenders },
    };
  }

  if (offenders.length === 0) {
    return {
      ok: true,
      msg: 'all contracts STABLE',
    };
  }

  return {
    ok: false,
    msg: offenders.length + ' DRAFT/PROPOSED contract(s) past PARTITIONED: ' +
      offenders.map((o) => o.file + '(' + o.status + ')').join(', '),
    details: { offenders },
  };
}

module.exports = {
  id: ID,
  severity: 'warn',
  run,
  // Test-only exports
  _isPastPartitioned,
  _scanContracts,
  POST_PARTITIONED_STATES,
};
