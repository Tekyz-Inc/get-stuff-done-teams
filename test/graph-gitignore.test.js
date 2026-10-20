'use strict';

/**
 * The graph respects .gitignore, and a file path it has never seen fails.
 *
 * ATOS-V2, 2026-10-20: 114,245 of 117,788 graph nodes came from git-ignored
 * test bundles (prototype/.e2e-build/), rebuilt on every test run and so
 * re-indexed on every query — lookups crept toward the 30 s timeout. And
 * `who-imports src/ui/Photo.tsx` answered [] for a file that is really
 * `prototype/src/ui/Photo.tsx`, with 11 importers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const INDEXER = path.join(REPO, 'bin', 'gsd-t-graph-index.cjs');
const QUERY = path.join(REPO, 'bin', 'gsd-t-graph-query-cli.cjs');
const { enumerateFiles } = require('../bin/gsd-t-graph-index.cjs');
const { compute_touched_files } = require('../bin/gsd-t-graph-freshness.cjs');

// Probes live beside the repo: the indexer refuses a symlinked path, and /tmp is one on macOS.
function probe(files, { git }) {
  const dir = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-gitignore-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  if (git) execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}
function rm(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

const SHAPE = {
  '.gitignore': 'prototype/.e2e-build/\n*.generated.ts\n',
  'prototype/src/ui/Photo.tsx': 'export const Photo = () => 1;\n',
  'prototype/src/ui/cards.tsx': 'import { Photo } from "./Photo";\nexport const Card = () => Photo();\n',
  'prototype/.e2e-build/roles/assets/index-abc.js': 'function bundled() { return 1; }\n',
  'prototype/src/api.generated.ts': 'export function gen() { return 1; }\n',
  'prototype/dist/app.js': 'function built() { return 1; }\n', // skip list still applies
};

test('indexer: git-ignored files are not listed; untracked visible files are', () => {
  const dir = probe(SHAPE, { git: true });
  try {
    const files = enumerateFiles(dir).map((f) => f.relPath).sort();
    assert.deepEqual(files, ['prototype/src/ui/Photo.tsx', 'prototype/src/ui/cards.tsx']);
  } finally { rm(dir); }
});

test('indexer: outside a git repo the folder walk is unchanged', () => {
  const dir = probe(SHAPE, { git: false });
  try {
    const files = enumerateFiles(dir).map((f) => f.relPath);
    assert.ok(files.includes('prototype/.e2e-build/roles/assets/index-abc.js'), 'no git → no .gitignore to apply');
    assert.ok(!files.includes('prototype/dist/app.js'), 'skip list still applies');
  } finally { rm(dir); }
});

test('freshness: a git-ignored file is never a phantom new file', () => {
  const dir = probe(SHAPE, { git: true });
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    fs.writeFileSync(path.join(dir, 'prototype/.e2e-build/roles/assets/index-new.js'), 'function x() {}\n');
    const Database = require('../bin/gsd-t-require-store.cjs').requireBetterSqlite();
    const db = new Database(path.join(dir, '.gsd-t', 'graphDB', 'graph.db'), { readonly: true });
    try {
      const touched = compute_touched_files(db, dir);
      const all = [...touched.adds, ...touched.edits, ...touched.deletes].map(String);
      assert.ok(!all.some((f) => f.includes('.e2e-build')), `ignored bundle showed as changed: ${JSON.stringify(all)}`);
    } finally { db.close(); }
  } finally { rm(dir); }
});

test('who-imports: a path the graph has never seen fails and names the likely file', () => {
  const dir = probe(SHAPE, { git: true });
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const bad = spawnSync('node', [QUERY, 'who-imports', 'src/ui/Photo.tsx'], { cwd: dir, encoding: 'utf8' });
    assert.equal(bad.status, 1);
    const j = JSON.parse(bad.stdout);
    assert.equal(j.reason, 'not-in-graph');
    assert.deepEqual(j.didYouMean, ['prototype/src/ui/Photo.tsx']);

    const good = JSON.parse(execFileSync('node', [QUERY, 'who-imports', 'prototype/src/ui/Photo.tsx'], { cwd: dir, encoding: 'utf8' }));
    assert.deepEqual(good.results, ['prototype/src/ui/cards.tsx']);
  } finally { rm(dir); }
});

test('blast-radius: an unknown file path fails the same way', () => {
  const dir = probe(SHAPE, { git: true });
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const r = spawnSync('node', [QUERY, 'blast-radius', 'ui/Photo.tsx'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(r.stdout).reason, 'not-in-graph');
  } finally { rm(dir); }
});

test('a path written from the caller\'s folder is read from there; an edit is seen without re-indexing', () => {
  const dir = probe(SHAPE, { git: true });
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    fs.mkdirSync(path.join(dir, 'prototype/src/x'));
    fs.writeFileSync(path.join(dir, 'prototype/src/x/b.tsx'), 'import { Photo } from "../ui/Photo";\nexport const B = () => Photo();\n');
    const r = JSON.parse(execFileSync('node', [QUERY, 'who-imports', 'src/ui/Photo.tsx'], { cwd: path.join(dir, 'prototype'), encoding: 'utf8' }));
    assert.equal(r.target, 'prototype/src/ui/Photo.tsx');
    assert.deepEqual(r.results, ['prototype/src/ui/cards.tsx', 'prototype/src/x/b.tsx']);
  } finally { rm(dir); }
});

test('a path that names different real files from the root and from the caller\'s folder asks which', () => {
  const dir = probe({ 'src/a.ts': 'export const A = 1;\n', 'web/src/a.ts': 'export const W = 1;\n' }, { git: true });
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const r = spawnSync('node', [QUERY, 'who-imports', 'src/a.ts'], { cwd: path.join(dir, 'web'), encoding: 'utf8' });
    assert.equal(r.status, 2);
    const j = JSON.parse(r.stdout);
    assert.equal(j.reason, 'ambiguous-path');
    assert.deepEqual(j.candidates.sort(), ['src/a.ts', 'web/src/a.ts']);
  } finally { rm(dir); }
});
