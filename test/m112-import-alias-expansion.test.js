'use strict';

/**
 * M112 — a quarter of every import edge pointed at a string no file matched.
 *
 * A project writes `import x from "@/lib/foo"` and declares what `@/` means in
 * its tsconfig. Stored raw, that target resolves to nothing: the graph records
 * an edge pointing at "@/lib/foo", and no file is ever named that.
 *
 * Measured on HiloAviation: 5,738 of 23,263 import edges — 25% — were
 * unexpanded shortcuts. Ask "does anything import this file?" and a quarter of
 * the real answers are missing, so live code looks unreferenced. A reachability
 * rule built on that data would have called 1,919 files of a working app dead.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const INDEXER = path.join(REPO, 'bin', 'gsd-t-graph-index.cjs');

// The indexer refuses a path with a symlinked component, and /tmp is a symlink
// on macOS — so probes live beside the repo.
function probe(files) {
  const dir = fs.mkdtempSync(path.join(path.dirname(REPO), '.gsdt-alias-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
}
function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

function importEdges(dir) {
  const out = execFileSync('sqlite3', [
    path.join(dir, '.gsd-t', 'graphDB', 'graph.db'),
    "SELECT src || ' -> ' || dst FROM edges WHERE kind='IMPORT' ORDER BY dst;",
  ], { encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean);
}

function buildIndex(dir) {
  execFileSync('node', [INDEXER], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
}

test('M112: a path shortcut is expanded to a real file path', () => {
  const dir = probe({
    'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    'src/lib/schema.ts': 'export const schema = 1;\n',
    'src/components/button.ts': 'import { schema } from "@/lib/schema";\nexport const B = () => schema;\n',
  });
  try {
    buildIndex(dir);
    const edges = importEdges(dir);
    assert.ok(edges.some((e) => e.endsWith('-> src/lib/schema')),
      `"@/lib/schema" must be stored as "src/lib/schema" — got ${JSON.stringify(edges)}`);
    assert.ok(!edges.some((e) => e.includes('@/')),
      'no raw shortcut may survive into the graph');
  } finally { rm(dir); }
});

test('M112: a package import is left exactly as written', () => {
  // "react" is not a shortcut. Rewriting it would invent an edge to a file that
  // does not exist — the opposite failure.
  const dir = probe({
    'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    'src/a.ts': 'import React from "react";\nimport next from "next/navigation";\nexport const A = 1;\n',
  });
  try {
    buildIndex(dir);
    const edges = importEdges(dir);
    assert.ok(edges.some((e) => e.endsWith('-> react')), 'react must stay react');
    assert.ok(edges.some((e) => e.endsWith('-> next/navigation')), 'and so must a scoped package path');
  } finally { rm(dir); }
});

test('M112: a tsconfig with comments and a URL still parses', () => {
  // These files routinely carry comments and trailing commas. Stripping them
  // naively destroys a URL — "https://x" loses everything after the //.
  const dir = probe({
    'tsconfig.json': [
      '{',
      '  "compilerOptions": {',
      '    // see https://example.com/docs for why',
      '    /* block comment */',
      '    "paths": { "@/*": ["./src/*"] },',
      '  }',
      '}',
    ].join('\n'),
    'src/lib/x.ts': 'export const x = 1;\n',
    'src/y.ts': 'import { x } from "@/lib/x";\nexport const y = x;\n',
  });
  try {
    buildIndex(dir);
    assert.ok(importEdges(dir).some((e) => e.endsWith('-> src/lib/x')),
      'the shortcut must expand despite comments and a URL in the config');
  } finally { rm(dir); }
});

test('M112: a project with no tsconfig indexes fine', () => {
  const dir = probe({
    'a.ts': 'import b from "./b";\nexport const a = b;\n',
    'b.ts': 'export default 1;\n',
  });
  try {
    buildIndex(dir);
    assert.ok(importEdges(dir).some((e) => e.includes('./b')),
      'nothing to expand is not an error');
  } finally { rm(dir); }
});

test('M112: baseUrl is honoured when the config sets one', () => {
  const dir = probe({
    'tsconfig.json': '{"compilerOptions":{"baseUrl":"./app","paths":{"~/*":["./modules/*"]}}}',
    'app/modules/m.ts': 'export const m = 1;\n',
    'app/main.ts': 'import { m } from "~/m";\nexport const main = m;\n',
  });
  try {
    buildIndex(dir);
    const edges = importEdges(dir);
    assert.ok(edges.some((e) => e.endsWith('-> app/modules/m')),
      `baseUrl must be applied — got ${JSON.stringify(edges)}`);
  } finally { rm(dir); }
});

test('M112: an unreadable tsconfig is announced, never silently ignored', () => {
  // Silently skipping expansion would leave every shortcut unresolved while the
  // build reports success — the failure this whole fix is about.
  const src = fs.readFileSync(INDEXER, 'utf8');
  assert.match(src, /import shortcuts will NOT be expanded/,
    'both the unreadable and the unparseable case must say so');
  assert.match(src, /import shortcuts: none declared/,
    'and a project with no config must say that too');
});
