'use strict';

/**
 * Project graph exclude list (.gsd-t/graph-exclude.json).
 *
 * Ancillary trees (design / Figma exports, prototypes) are not the application;
 * a project lists them and the graph skips them. The indexer and the freshness
 * walker must agree, or an excluded file reads as a phantom ADD on every query.
 * [RULE] freshness-excludes-match-indexer-skipdirs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadGraphExcludes, _toRegex } = require('../bin/gsd-t-graph-exclude.cjs');
const { enumerateFiles } = require('../bin/gsd-t-graph-index.cjs');

function repo(files, exclude) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm118-ex-'));
  for (const f of files) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), 'export const x = 1;\n');
  }
  if (exclude !== undefined) {
    fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.gsd-t', 'graph-exclude.json'),
      typeof exclude === 'string' ? exclude : JSON.stringify(exclude));
  }
  return dir;
}

const FILES = [
  'src/app.ts',
  'src/figma/Button.tsx',
  'design/exports/Frame1.tsx',
  'design-system/tokens.ts',
  'src/components/Card.figma.tsx',
  'src/components/Card.tsx',
];

test('no exclude file → every source file indexed', () => {
  const dir = repo(FILES);
  try {
    assert.equal(enumerateFiles(dir).length, FILES.length);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('folder prefixes and globs are excluded; look-alike names are not', () => {
  const dir = repo(FILES, { exclude: ['design/', 'src/Figma', '**/*.figma.tsx'] });
  try {
    const rels = enumerateFiles(dir).map((f) => f.relPath).sort();
    // "design/" must NOT swallow "design-system/" (prefix is a whole path segment);
    // "src/Figma" matches src/figma case-insensitively.
    assert.deepEqual(rels, ['design-system/tokens.ts', 'src/app.ts', 'src/components/Card.tsx']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('glob semantics: * stays in one folder, ** crosses folders', () => {
  assert.ok(_toRegex('src/*/gen').test('src/a/gen/x.ts'));
  assert.ok(!_toRegex('src/*/gen').test('src/a/b/gen/x.ts'));
  assert.ok(_toRegex('src/**/gen').test('src/a/b/gen/x.ts'));
  assert.ok(_toRegex('**/*.figma.tsx').test('Top.figma.tsx'));
});

test('malformed exclude file HALTS instead of silently indexing everything', () => {
  for (const bad of ['{not json', JSON.stringify({ exclude: 'design/' }), JSON.stringify({ exclude: [1] })]) {
    const dir = repo(FILES, bad);
    try {
      assert.throws(() => loadGraphExcludes(dir), /graph-exclude\.json/);
      assert.throws(() => enumerateFiles(dir), /graph-exclude\.json/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('freshness walker agrees with the indexer: excluded files are not phantom ADDs', () => {
  const dir = repo(FILES, { exclude: ['design/', 'src/figma/'] });
  const { openStore, closeStore } = require('../bin/gsd-t-graph-index.cjs');
  const { compute_touched_files } = require('../bin/gsd-t-graph-freshness.cjs');
  const db = openStore(path.join(dir, 'empty.db'));
  try {
    // Empty store: every live file is an ADD, so ADDs == exactly what freshness walks.
    const indexed = enumerateFiles(dir).map((f) => f.relPath).sort();
    const res = compute_touched_files(db, dir);
    assert.deepEqual([...res.adds].sort(), indexed);
    assert.ok(!res.adds.some((r) => r.startsWith('design/') || r.startsWith('src/figma/')));
  } finally { closeStore(db); fs.rmSync(dir, { recursive: true, force: true }); }
});
