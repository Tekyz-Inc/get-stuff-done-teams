'use strict';

/**
 * execute kind collector — pulls domain scope/constraints/tasks/contracts
 * for a single domain so an execute-phase worker can grep the brief
 * instead of re-walking the repo.
 *
 * Fail-open: if the domain dir is missing, scope/constraints/contracts
 * are empty arrays — the brief is still written.
 */

const fs = require('fs');
const path = require('path');

const NAME = 'execute';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

/**
 * Extract bullet items under a `## Heading` (non-greedy, until the next `## ` or EOF).
 */
function _bulletsUnderSection(text, headingPattern) {
  if (!text) return [];
  // Locate `## <heading>` line; capture body until next `## ` or end-of-string.
  // (JS regex has no `\Z`; use the m-flag $ + a non-greedy lookahead, then
  // trim the tail at the next H2.)
  const re = new RegExp('^##\\s+' + headingPattern + '\\s*$', 'mi');
  const m = text.match(re);
  if (!m) return [];
  const start = m.index + m[0].length;
  const remainder = text.slice(start);
  const next = remainder.match(/^##\s+/m);
  const body = next ? remainder.slice(0, next.index) : remainder;
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    // Only top-level bullets (no leading whitespace) — sub-bullets belong to
    // their parent and would inflate the brief size.
    const bm = line.match(/^[-*]\s+(.+)$/);
    if (!bm) continue;
    let item = bm[1].replace(/`/g, '').replace(/\*\*/g, '').trim();
    if (!item) continue;
    if (item.length > 240) item = item.slice(0, 237) + '...';
    out.push(item);
  }
  return out;
}

/**
 * Extract a path glob list from "Owned Files/Directories" section bullets,
 * keeping only the leading code-fence path before any em-dash.
 */
function _sectionBody(text, headingRe) {
  if (!text) return '';
  const m = text.match(headingRe);
  if (!m) return '';
  const start = m.index + m[0].length;
  const remainder = text.slice(start);
  const next = remainder.match(/^##\s+/m);
  return next ? remainder.slice(0, next.index) : remainder;
}

function _ownedPathsFromScope(text) {
  const body = _sectionBody(text, /^##\s+Owned Files\/Directories\s*$/mi);
  if (!body) return [];
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    // Top-level only — captures `- ` `path``... but skips ` - sub.cjs ...` two-space-indent sub-bullets.
    const bm = line.match(/^[-*]\s+`([^`]+)`/);
    if (bm) out.push(bm[1]);
  }
  return out;
}

function _notOwnedPaths(text) {
  const body = _sectionBody(text, /^##\s+NOT Owned[^\n]*$/mi);
  if (!body) return [];
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    const bm = line.match(/^[-*]\s+`([^`]+)`/);
    if (bm) out.push(bm[1]);
  }
  return out;
}

/**
 * Collect contract paths referenced from inside the scope text — pattern
 * `.gsd-t/contracts/<name>.md`.
 */
function _contractsReferenced(text, projectDir) {
  if (!text) return [];
  const re = /\.gsd-t\/contracts\/[a-zA-Z0-9_./-]+\.md/g;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(text)) != null) {
    const p = m[0];
    if (seen.has(p)) continue;
    seen.add(p);
    let status = 'UNKNOWN';
    const full = path.join(projectDir, p);
    try {
      const c = fs.readFileSync(full, 'utf8');
      const sm = c.match(/Status:\s*\**\s*(STABLE|DRAFT|PROPOSED)/i);
      if (sm) status = sm[1].toUpperCase();
    } catch (_) { /* fail-open */ }
    out.push({ path: p, status });
  }
  return out;
}

/**
 * Extract the task ids ("T1", "T-2", "M55-D4-T3", …) from tasks.md.
 */
function _tasksFromTasksMd(text) {
  if (!text) return [];
  const out = [];
  const seen = new Set();
  function push(id) { if (!seen.has(id)) { seen.add(id); out.push(id); } }

  // ##/### M{NN}-D{N}-T{N} (Shape C heading) — try BEFORE the bare-T regex so
  // the M-prefixed id wins.
  const reC = /^#{2,3}\s+(M\d+-D\d+-T\d+)\b[^\n]*$/gm;
  let m;
  while ((m = reC.exec(text)) != null) push(m[1]);

  // ## T1 — heading (Shape A — bare T-id)
  const reH = /^##\s+(T-?\d+)\b[^\n]*$/gm;
  while ((m = reH.exec(text)) != null) push(m[1]);

  // - [ ] **M55-D4-T1** (Shape C bullets)
  const reBC = /^\s*-\s*\[[ x]\]\s+\*\*(M\d+-D\d+-T\d+)\*\*/gm;
  while ((m = reBC.exec(text)) != null) push(m[1]);

  return out;
}

function collect(ctx) {
  const { projectDir, domain, recordSource } = ctx;
  const ancillary = {
    expectedOutputs: [],
    filesOwned: [],
    notOwned: [],
    tasks: [],
  };
  let scope = { owned: [], notOwned: [], deliverables: [] };
  let constraints = [];
  let contracts = [];

  if (!domain) {
    return { scope, constraints, contracts, ancillary };
  }

  const dir = path.join(projectDir, '.gsd-t', 'domains', domain);
  if (!fs.existsSync(dir)) {
    // Fail-open: domain dir absent → empty fields.
    return { scope, constraints, contracts, ancillary };
  }

  const scopePath = '.gsd-t/domains/' + domain + '/scope.md';
  const constraintsPath = '.gsd-t/domains/' + domain + '/constraints.md';
  const tasksPath = '.gsd-t/domains/' + domain + '/tasks.md';

  const scopeText = _readMaybe(path.join(projectDir, scopePath));
  if (scopeText) recordSource(scopePath);
  const constraintsText = _readMaybe(path.join(projectDir, constraintsPath));
  if (constraintsText) recordSource(constraintsPath);
  const tasksText = _readMaybe(path.join(projectDir, tasksPath));
  if (tasksText) recordSource(tasksPath);

  const owned = _ownedPathsFromScope(scopeText);
  const notOwned = _notOwnedPaths(scopeText);
  const deliverables = _bulletsUnderSection(scopeText, 'Deliverables');

  scope = { owned, notOwned, deliverables };

  const mustFollow = _bulletsUnderSection(constraintsText, 'Must Follow');
  const mustNot = _bulletsUnderSection(constraintsText, 'Must Not');
  // Mark items by prefix so the worker can tell them apart.
  constraints = mustFollow.map((c) => 'MUST: ' + c).concat(mustNot.map((c) => 'MUST NOT: ' + c));

  contracts = _contractsReferenced(scopeText, projectDir);

  const tasks = _tasksFromTasksMd(tasksText);

  ancillary.filesOwned = owned;
  ancillary.notOwned = notOwned;
  ancillary.expectedOutputs = deliverables;
  ancillary.tasks = tasks;

  return { scope, constraints, contracts, ancillary };
}

module.exports = {
  name: NAME,
  requiresSources: [],
  collect,
  // Test-only exports
  _bulletsUnderSection,
  _ownedPathsFromScope,
  _notOwnedPaths,
  _contractsReferenced,
  _tasksFromTasksMd,
};
