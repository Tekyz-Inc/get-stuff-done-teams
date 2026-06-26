'use strict';
// Regression: tree-sitter 0.21's Node binding defaults to a 32 KB parse buffer
// and throws "Invalid argument" on larger source — silently dropping every file
// over ~32 KB. The extractor must pass an explicit bufferSize so large files
// (common in real repos: Atos has many) index correctly. Caught by the real-Atos
// streaming smoke test; all small-fixture unit tests missed it.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractEdges } = require('../bin/gsd-t-graph-edge-extract.cjs');

let dir;
before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm94-bigfile-')); });
after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

test('extractEdges parses a TSX file well over the 32 KB tree-sitter buffer limit', () => {
  const header = `import { useState } from 'react';\nimport { foo } from './foo';\n`;
  let body = '';
  for (let i = 0; i < 1200; i++) {
    body += `export function comp_${i}() { const x = foo(${i}); return x; }\n`;
  }
  const content = header + body;
  assert.ok(content.length > 40 * 1024, `fixture must exceed 32 KB (was ${content.length})`);
  const f = path.join(dir, 'big.tsx');
  fs.writeFileSync(f, content, 'utf8');

  // The whole point: a >32 KB file must yield real entities, not throw / return empty.
  const r = extractEdges(f, 'big.tsx');
  assert.ok(r && Array.isArray(r.entities), 'returns an entities array');
  assert.ok(r.entities.length >= 100, `large file should yield many entities (got ${r.entities ? r.entities.length : 'none'})`);
});

test('extractEdges still parses a small TSX file (no regression below the limit)', () => {
  const f = path.join(dir, 'small.tsx');
  fs.writeFileSync(f, `export function f() { return 1; }\n`, 'utf8');
  const r = extractEdges(f, 'small.tsx');
  assert.ok(r.entities.length >= 1, 'small file still extracts');
});
