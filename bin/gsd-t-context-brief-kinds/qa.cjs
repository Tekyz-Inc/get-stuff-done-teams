'use strict';

/**
 * qa kind collector — points the QA subagent at its protocol path,
 * detects the project test runner, and surfaces the most recent
 * qa-issues entries.
 *
 * Fail-CLOSED: requires `templates/prompts/qa-subagent.md`. Library
 * enforces this via the `requiresSources` declaration.
 */

const fs = require('fs');
const path = require('path');

const NAME = 'qa';
const PROTOCOL = 'templates/prompts/qa-subagent.md';
const QA_ISSUES = '.gsd-t/qa-issues.md';
const TAIL_LIMIT = 10;

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _detectTestRunner(projectDir) {
  const detected = {
    npmTest: null,
    playwrightConfig: null,
    cypressConfig: null,
    jestConfig: null,
    vitestConfig: null,
  };

  const pkgPath = path.join(projectDir, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg && pkg.scripts && typeof pkg.scripts.test === 'string') {
      detected.npmTest = pkg.scripts.test;
    }
  } catch (_) { /* fail-open */ }

  for (const f of ['playwright.config.ts', 'playwright.config.js', 'playwright.config.cjs', 'playwright.config.mjs']) {
    if (fs.existsSync(path.join(projectDir, f))) { detected.playwrightConfig = f; break; }
  }
  for (const f of ['cypress.config.ts', 'cypress.config.js', 'cypress.config.cjs']) {
    if (fs.existsSync(path.join(projectDir, f))) { detected.cypressConfig = f; break; }
  }
  for (const f of ['jest.config.ts', 'jest.config.js', 'jest.config.cjs']) {
    if (fs.existsSync(path.join(projectDir, f))) { detected.jestConfig = f; break; }
  }
  for (const f of ['vitest.config.ts', 'vitest.config.js', 'vitest.config.cjs', 'vitest.config.mjs']) {
    if (fs.existsSync(path.join(projectDir, f))) { detected.vitestConfig = f; break; }
  }

  return detected;
}

function _tailQaIssues(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  // qa-issues.md is generally a markdown table; keep last N table rows
  // (rows beginning with `|` and not separator-only).
  const rows = lines.filter((l) => /^\|/.test(l) && !/^\|\s*-+\s*\|/.test(l));
  // Drop header (first row), then keep tail.
  const body = rows.slice(1);
  const tail = body.slice(-TAIL_LIMIT).map((l) => {
    const t = l.trim();
    return t.length > 200 ? t.slice(0, 197) + '...' : t;
  });
  return tail;
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
  recordSource('package.json');

  const issuesText = _readMaybe(path.join(projectDir, QA_ISSUES));
  if (issuesText != null) recordSource(QA_ISSUES);

  const runner = _detectTestRunner(projectDir);
  const recentIssues = _tailQaIssues(issuesText);
  const allContracts = _scanContracts(projectDir);
  // Only DRAFT / PROPOSED contracts are surfaced individually — QA's job is
  // to verify implementations match contracts, but a 65-contract list would
  // bust the 10 KB cap. STABLE / UNKNOWN are counted, not enumerated.
  const enumerated = allContracts.filter((c) => c.status === 'DRAFT' || c.status === 'PROPOSED');
  for (const c of enumerated) recordSource(c.path);
  const counts = { STABLE: 0, DRAFT: 0, PROPOSED: 0, UNKNOWN: 0 };
  for (const c of allContracts) counts[c.status] = (counts[c.status] || 0) + 1;

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: enumerated,
    ancillary: {
      contractCount: allContracts.length,
      contractStatusCounts: counts,
      protocolPath: PROTOCOL,
      qaIssuesTail: recentIssues,
      testRunner: runner,
    },
  };
}

module.exports = {
  name: NAME,
  requiresSources: [PROTOCOL],
  collect,
  _detectTestRunner,
  _tailQaIssues,
};
