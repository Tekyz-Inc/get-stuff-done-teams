'use strict';

/**
 * design-verify kind collector — points the Design Verification subagent
 * at its design contract path(s), extracts Figma URL(s), and surfaces
 * any screenshot manifest.
 *
 * Fail-CLOSED: requires at least one of:
 *   - `.gsd-t/contracts/design-contract.md` (flat)
 *   - `.gsd-t/contracts/design/INDEX.md` (hierarchical)
 *
 * The library enforces fail-closed via the FAIL_CLOSED_KINDS rule:
 * if NEITHER required source is present, generateBrief raises
 * EREQUIRED_MISSING. To express the OR-of-required-sources, the
 * collector itself emits the structured error during `collect`.
 */

const fs = require('fs');
const path = require('path');

const NAME = 'design-verify';
const FLAT_CONTRACT = '.gsd-t/contracts/design-contract.md';
const HIER_INDEX = '.gsd-t/contracts/design/INDEX.md';
const SCREENSHOT_MANIFEST = '.gsd-t/screenshots/manifest.json';

function _readMaybe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function _figmaUrls(text) {
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?figma\.com\/[A-Za-z0-9_./?#=&%-]+/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(text)) != null) {
    const u = m[0].replace(/[).,;]+$/, '');
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function _designContractsList(projectDir, recordSource) {
  const out = [];
  // Flat: design-contract*.md at top of contracts/
  const contractsDir = path.join(projectDir, '.gsd-t', 'contracts');
  let entries;
  try { entries = fs.readdirSync(contractsDir); } catch (_) { entries = []; }
  for (const f of entries) {
    if (/^design.*\.md$/i.test(f)) {
      const rel = '.gsd-t/contracts/' + f;
      out.push(rel);
      recordSource(rel);
    }
  }
  // Hierarchical: .gsd-t/contracts/design/**/*.md
  const designDir = path.join(contractsDir, 'design');
  if (fs.existsSync(designDir)) {
    const stack = [designDir];
    while (stack.length) {
      const cur = stack.pop();
      let inner;
      try { inner = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
      for (const ent of inner) {
        const full = path.join(cur, ent.name);
        if (ent.isDirectory()) {
          stack.push(full);
        } else if (ent.isFile() && full.endsWith('.md')) {
          const rel = path.relative(projectDir, full);
          out.push(rel);
          recordSource(rel);
        }
      }
    }
  }
  out.sort();
  return out;
}

function collect(ctx) {
  const { projectDir, recordSource } = ctx;

  // Required-source OR check (library only knows AND-of-required, so we
  // express the OR rule here).
  const flatPresent = fs.existsSync(path.join(projectDir, FLAT_CONTRACT));
  const hierPresent = fs.existsSync(path.join(projectDir, HIER_INDEX));
  if (!flatPresent && !hierPresent) {
    const err = new Error('design-verify: no design contract found (' +
      FLAT_CONTRACT + ' or ' + HIER_INDEX + ')');
    err.code = 'EREQUIRED_MISSING';
    err.missing = [FLAT_CONTRACT, HIER_INDEX];
    throw err;
  }

  const designPaths = _designContractsList(projectDir, recordSource);

  // Pull all Figma URLs across every located design contract.
  const figmaUrls = [];
  const seen = new Set();
  for (const rel of designPaths) {
    const text = _readMaybe(path.join(projectDir, rel));
    if (!text) continue;
    for (const u of _figmaUrls(text)) {
      if (seen.has(u)) continue;
      seen.add(u);
      figmaUrls.push(u);
    }
  }
  figmaUrls.sort();

  let screenshotManifest = null;
  if (fs.existsSync(path.join(projectDir, SCREENSHOT_MANIFEST))) {
    screenshotManifest = SCREENSHOT_MANIFEST;
    recordSource(SCREENSHOT_MANIFEST);
  }

  return {
    scope: { owned: [], notOwned: [], deliverables: [] },
    constraints: [],
    contracts: designPaths.map((p) => ({ path: p, status: 'UNKNOWN' })),
    ancillary: {
      designContractPaths: designPaths,
      figmaUrls,
      screenshotManifest,
    },
  };
}

module.exports = {
  name: NAME,
  // Library treats requiresSources as AND. design-verify uses the OR-of-two
  // pattern instead, raising EREQUIRED_MISSING from inside collect().
  requiresSources: [],
  collect,
  _figmaUrls,
  _designContractsList,
};
