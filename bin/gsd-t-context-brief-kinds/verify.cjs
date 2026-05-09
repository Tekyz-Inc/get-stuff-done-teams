'use strict';

/**
 * verify kind collector — scans every contract under `.gsd-t/contracts/`
 * for status, gathers the success-criteria list from the active charter,
 * and surfaces the verify-gate plan reference (consumed by D5).
 *
 * Fail-open: missing optional source → null/empty field, brief still written.
 */

const fs = require('fs');
const path = require('path');

const NAME = 'verify';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _scanContracts(projectDir) {
  // Pure scan — does NOT record sources (caller decides which subset to record).
  const dir = path.join(projectDir, '.gsd-t', 'contracts');
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return []; }
  const out = [];
  for (const f of entries) {
    if (!f.endsWith('.md')) continue;
    const rel = '.gsd-t/contracts/' + f;
    const text = _readMaybe(path.join(projectDir, rel));
    if (!text) continue;
    let status = 'UNKNOWN';
    const m = text.match(/Status:\s*\**\s*(STABLE|DRAFT|PROPOSED)/i);
    if (m) status = m[1].toUpperCase();
    out.push({ path: rel, status });
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

/**
 * Extract numbered success-criterion entries (`1. ...`) from any charter
 * file under `.gsd-t/charters/`. Picks the most recent by mtime.
 */
function _successCriteriaFromCharter(projectDir, recordSource) {
  const dir = path.join(projectDir, '.gsd-t', 'charters');
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return { source: null, items: [] }; }
  const candidates = entries
    .filter((f) => f.endsWith('-charter.md') || f.endsWith('.md'))
    .map((f) => {
      const full = path.join(dir, f);
      let mt = 0;
      try { mt = fs.statSync(full).mtimeMs; } catch (_) { /* ignore */ }
      return { f, mt };
    })
    .sort((a, b) => b.mt - a.mt);
  if (!candidates.length) return { source: null, items: [] };

  const top = candidates[0];
  const rel = '.gsd-t/charters/' + top.f;
  const text = _readMaybe(path.join(projectDir, rel));
  if (!text) return { source: null, items: [] };
  recordSource(rel);

  // Find the success-criteria section: `## Falsifiable Success Criteria` (or similar).
  const re = /^##[^\n]*(?:Success Criteria|Falsifiable[^\n]*)\s*$([\s\S]*?)(?=^##\s+|\Z)/mi;
  const m = text.match(re);
  if (!m) return { source: rel, items: [] };

  const items = [];
  // Match `1. ...` or `1) ...` (number, dot or paren, space).
  const numberedRe = /^\s*\d+[.)]\s+(.+)$/gm;
  let nm;
  while ((nm = numberedRe.exec(m[1])) != null) {
    let item = nm[1].replace(/`/g, '').replace(/\*\*/g, '').trim();
    if (item.length > 200) item = item.slice(0, 197) + '...';
    items.push(item);
  }
  return { source: rel, items };
}

function _verifyGateContractRef(projectDir, recordSource) {
  const rel = '.gsd-t/contracts/verify-gate-contract.md';
  const full = path.join(projectDir, rel);
  if (!fs.existsSync(full)) return null;
  recordSource(rel);
  const text = _readMaybe(full);
  if (!text) return rel;
  return rel;
}

function _priorVerifyResults(projectDir, recordSource) {
  // Heuristic: most recent file under .gsd-t/verify/ if it exists.
  const dir = path.join(projectDir, '.gsd-t', 'verify');
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_) { return null; }
  if (!entries.length) return null;
  const sorted = entries
    .map((f) => {
      const full = path.join(dir, f);
      let mt = 0;
      try { mt = fs.statSync(full).mtimeMs; } catch (_) {}
      return { f, mt };
    })
    .sort((a, b) => b.mt - a.mt);
  if (!sorted.length) return null;
  const rel = '.gsd-t/verify/' + sorted[0].f;
  recordSource(rel);
  return rel;
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;
  const contracts = _scanContracts(projectDir);
  // Record mtimes only for the enumerated subset (DRAFT/PROPOSED).
  for (const c of contracts) {
    if (c.status === 'DRAFT' || c.status === 'PROPOSED') recordSource(c.path);
  }
  const sc = _successCriteriaFromCharter(projectDir, recordSource);
  const verifyGatePlan = _verifyGateContractRef(projectDir, recordSource);
  const priorVerifyResults = _priorVerifyResults(projectDir, recordSource);

  // Summarize contract list rather than inlining all 65+ paths twice.
  // The full status map lives in `contracts` already.
  const statusCounts = { STABLE: 0, DRAFT: 0, PROPOSED: 0, UNKNOWN: 0 };
  for (const c of contracts) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  }
  // Only DRAFT / PROPOSED contracts (the ones a verifier cares about) are
  // surfaced individually to the brief; STABLE / UNKNOWN are counted only.
  const enumerated = contracts.filter((c) => c.status === 'DRAFT' || c.status === 'PROPOSED');

  const ancillary = {
    charterSource: sc.source,
    contractCount: contracts.length,
    contractStatusCounts: statusCounts,
    enumeratedContracts: enumerated.map((c) => c.path).sort(),
    priorVerifyResults,
    successCriteria: sc.items,
    verifyGatePlan,
  };

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: enumerated,
    ancillary,
  };
}

module.exports = {
  name: NAME,
  requiresSources: [],
  collect,
  _scanContracts,
  _successCriteriaFromCharter,
};
