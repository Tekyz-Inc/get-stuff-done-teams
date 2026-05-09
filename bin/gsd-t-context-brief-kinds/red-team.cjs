'use strict';

/**
 * red-team kind collector — points the Red Team subagent at its protocol,
 * surfaces the recent commits in scope, and seeds attack vector hints
 * extracted from the protocol's "broken patches" section.
 *
 * Fail-CLOSED: requires `templates/prompts/red-team-subagent.md`. Library
 * enforces this via the `requiresSources` declaration.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NAME = 'red-team';
const PROTOCOL = 'templates/prompts/red-team-subagent.md';
const COMMIT_LIMIT = 10;

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _recentCommits(projectDir) {
  try {
    const stdout = execSync('git log -' + COMMIT_LIMIT + ' --oneline --no-color', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(stdout || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, COMMIT_LIMIT);
  } catch (_) {
    return [];
  }
}

/**
 * Pull attack-vector seeds out of the protocol's "Test Pass-Through" /
 * "broken patches" section, if present. Falls back to an empty array.
 *
 * The protocol enumerates examples in a `- Remove the listener entirely`
 * style — we extract those bullets verbatim (clipped) so the worker can
 * read them inline without re-fetching the protocol.
 */
function _attackVectorSeeds(protocolText) {
  if (!protocolText) return [];
  const out = [];
  // Match the section that explicitly lists broken-patch examples.
  // (heading variants: "broken patch", "Test Pass-Through", "Attack Categories")
  const headings = [
    /^[#]+[^\n]*broken patches?[^\n]*$/im,
    /^[#]+[^\n]*Test Pass-Through[^\n]*$/im,
    /^[#]+\s+Attack Categories[^\n]*$/im,
  ];
  for (const h of headings) {
    const hm = protocolText.match(h);
    if (!hm) continue;
    const start = hm.index + hm[0].length;
    const remainder = protocolText.slice(start);
    const next = remainder.match(/^[#]+\s+/m);
    const body = next ? remainder.slice(0, next.index) : remainder;
    for (const line of body.split(/\r?\n/)) {
      const bm = line.match(/^\s+[-*]\s+(.+)$/);
      if (!bm) continue;
      let item = bm[1].replace(/`/g, '').replace(/\*\*/g, '').trim();
      if (item.length > 160) item = item.slice(0, 157) + '...';
      out.push(item);
      if (out.length >= 8) break;
    }
    if (out.length) break;
  }
  return out;
}

function _scanContracts(projectDir) {
  // Pure scan; caller decides which subset to record as sources.
  const dir = path.join(projectDir, '.gsd-t', 'contracts');
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return []; }
  const out = [];
  for (const f of entries) {
    if (!f.endsWith('.md')) continue;
    const rel = '.gsd-t/contracts/' + f;
    const text = _readMaybe(path.join(projectDir, rel));
    if (!text) continue;
    const m = text.match(/Status:\s*\**\s*(STABLE|DRAFT|PROPOSED)/i);
    out.push({ path: rel, status: m ? m[1].toUpperCase() : 'UNKNOWN' });
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;

  recordSource(PROTOCOL);

  const protocolText = _readMaybe(path.join(projectDir, PROTOCOL));
  const seeds = _attackVectorSeeds(protocolText);
  const recentCommits = _recentCommits(projectDir);
  const allContracts = _scanContracts(projectDir);
  const enumerated = allContracts.filter((c) => c.status === 'DRAFT' || c.status === 'PROPOSED');
  for (const c of enumerated) recordSource(c.path);
  const counts = { STABLE: 0, DRAFT: 0, PROPOSED: 0, UNKNOWN: 0 };
  for (const c of allContracts) counts[c.status] = (counts[c.status] || 0) + 1;

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: enumerated,
    ancillary: {
      attackVectorSeeds: seeds,
      contractCount: allContracts.length,
      contractStatusCounts: counts,
      protocolPath: PROTOCOL,
      recentCommits,
    },
  };
}

module.exports = {
  name: NAME,
  requiresSources: [PROTOCOL],
  collect,
  _recentCommits,
  _attackVectorSeeds,
};
