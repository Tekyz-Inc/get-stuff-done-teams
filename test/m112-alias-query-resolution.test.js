'use strict';

/**
 * M112 — the alias fix was only half a fix: the edges were stored, then not found.
 *
 * hilo-figma-atos, 2026-08-11. `gsd-t graph who-imports src/lib/db.ts` returned
 * 5 importers. `grep -rl '@/lib/db' src` returned 793. The other 788 all wrote
 * the shortcut form.
 *
 * v5.11.26 taught the INDEXER to expand `@/lib/db` into `src/lib/db`, and it
 * does. What it did not do is meet the QUERY side. The resolver that appends a
 * file extension — turning `src/lib/db` into the real file id `src/lib/db.ts` —
 * opened with:
 *
 *     if (!dst.startsWith(".")) return dst;   // package/external
 *
 * An expanded alias has no leading dot, so it was classed as an external package
 * like "react" and returned untouched. The edge sat in the database as
 * `src/lib/db` while every query asked for `src/lib/db.ts`. The two never met.
 *
 * The v5.11.26 tests all asserted the edge was STORED correctly. Not one asked
 * whether it could then be FOUND. That is the gap these tests close: they go
 * through the query, which is the only thing a scan ever uses.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const INDEXER = path.join(REPO, 'bin', 'gsd-t-graph-index.cjs');
const QUERY = path.join(REPO, 'bin', 'gsd-t-graph-query-cli.cjs');

// The indexer refuses a path with a symlinked component, and /tmp is a symlink
// on macOS — so probes live beside the repo.
function probe(files) {
  const dir = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-aliasq-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function whoImports(dir, target) {
  const out = execFileSync('node', [QUERY, 'who-imports', target], {
    cwd: dir, encoding: 'utf8', stdio: 'pipe',
  });
  return JSON.parse(out);
}

// The Atos shape: a shared module reached BOTH ways. The relative importers are
// the 5 that were found; the alias importers are the 788 that were not.
const ATOS_SHAPE = {
  'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
  'src/lib/db.ts': 'export const db = 1;\n',
  'src/app/page.tsx': 'import { db } from "@/lib/db";\nexport const P = () => db;\n',
  'src/app/orders/page.tsx': 'import { db } from "@/lib/db";\nexport const O = () => db;\n',
  'src/components/table.tsx': 'import { db } from "@/lib/db";\nexport const T = () => db;\n',
  'src/lib/nearby.ts': 'import { db } from "./db";\nexport const N = db;\n',
};

test('M112: a file imported by shortcut is FOUND, not just stored', () => {
  const dir = probe(ATOS_SHAPE);
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const res = whoImports(dir, 'src/lib/db.ts');
    const importers = (res.results || []).map((r) => (typeof r === 'string' ? r : r.file || r.src)).sort();

    // Before the fix this returned ONE — the relative importer alone.
    assert.equal(importers.length, 4,
      `all four importers must be found, got ${JSON.stringify(importers)}`);
    for (const f of ['src/app/page.tsx', 'src/app/orders/page.tsx', 'src/components/table.tsx']) {
      assert.ok(importers.includes(f), `${f} imports it via the shortcut and must appear`);
    }
    assert.ok(importers.includes('src/lib/nearby.ts'), 'and the relative importer must still appear');
  } finally { rm(dir); }
});

test('M112: a package import is never turned into a file', () => {
  // The opposite failure: matching too eagerly would invent edges to files that
  // do not exist. "react" must stay "react".
  const dir = probe({
    'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    'src/a.ts': 'import React from "react";\nimport nav from "next/navigation";\nexport const A = 1;\n',
  });
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const res = whoImports(dir, 'react');
    // Nothing in the project is named react, so no file id may come back for it.
    const importers = (res.results || []).map((r) => (typeof r === 'string' ? r : r.file || r.src));
    for (const f of importers) {
      assert.ok(!/\.(ts|tsx|js|jsx)$/.test(String(f)) || f === 'src/a.ts',
        `a package query must not resolve to unrelated files — got ${f}`);
    }
  } finally { rm(dir); }
});

test('M112: an expanded alias is not re-joined to the importer directory', () => {
  // An expanded alias is ALREADY project-relative. Resolving it the way a
  // relative specifier is resolved would produce src/app/src/lib/db — a path no
  // file has, which is the same miss wearing a different shape.
  const dir = probe({
    'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    'src/lib/db.ts': 'export const db = 1;\n',
    'src/app/deep/nested/page.tsx': 'import { db } from "@/lib/db";\nexport const D = () => db;\n',
  });
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const importers = (whoImports(dir, 'src/lib/db.ts').results || [])
      .map((r) => (typeof r === 'string' ? r : r.file || r.src));
    assert.deepEqual(importers, ['src/app/deep/nested/page.tsx'],
      'depth must not affect an already-project-relative path');
  } finally { rm(dir); }
});

test('M112: the reverse direction agrees — a file reached both ways is one file', () => {
  // If the two import spellings resolved to different ids, the same module would
  // appear as two nodes and every coupling measure over it would be wrong.
  const dir = probe(ATOS_SHAPE);
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const dsts = execFileSync('sqlite3', [
      path.join(dir, '.gsd-t', 'graphDB', 'graph.db'),
      "SELECT DISTINCT dst FROM edges WHERE kind='IMPORT' AND dst LIKE '%db%';",
    ], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    assert.ok(!dsts.some((d) => d.includes('@/')), `no raw shortcut may survive — got ${JSON.stringify(dsts)}`);
  } finally { rm(dir); }
});

test('M112: a file exporting only constants is still findable', () => {
  // The second half of the Atos miss, and the one that survives fixing the
  // resolver alone. The set that decides whether an import target matches a real
  // file was built from FUNCTION nodes, so a module of constants, types, or
  // re-exports was not in it — and those are exactly the shared modules a whole
  // codebase imports. Atos's src/lib/db.ts exports a constant.
  const dir = probe({
    'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    'src/lib/constants.ts': 'export const MAX = 10;\nexport type Mode = "a" | "b";\n',
    'src/app/page.tsx': 'import { MAX } from "@/lib/constants";\nexport const P = () => MAX;\n',
  });
  try {
    execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const importers = (whoImports(dir, 'src/lib/constants.ts').results || [])
      .map((r) => (typeof r === 'string' ? r : r.file || r.src));
    assert.deepEqual(importers, ['src/app/page.tsx'],
      'a file with no functions is still a file, and its importers must be found');
  } finally { rm(dir); }
});

test('M112: the file set comes from the files table, not from function nodes', () => {
  const src = fs.readFileSync(QUERY, 'utf8');
  assert.match(src, /query-file-set-comes-from-files-table-not-inferred-from-functions/,
    'the rule must be named in the guard map');
  assert.match(src, /SELECT file FROM files/,
    'the authoritative list was already stored — inferring one was the bug');
  assert.match(src, /predates the files table/,
    'an older graph must SAY it is under-reporting, never silently do it');
});

test('M112: the resolver no longer returns early on every non-relative target', () => {
  // The exact line that caused it. A regression here is silent: queries still
  // answer, they just answer with a fraction of the truth.
  const src = fs.readFileSync(QUERY, 'utf8');
  assert.ok(!/if \(typeof dst !== "string" \|\| !dst\.startsWith\("\."\)\) return dst;/.test(src),
    'the blanket early return is what dropped 788 of 793 importers');
  assert.match(src, /query-resolves-expanded-alias-not-only-relative/,
    'the rule must be named in the guard map');
});
