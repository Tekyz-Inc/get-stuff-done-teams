'use strict';
// END-TO-END integration test: build a real index, then query it through the
// FULL path (resolveStorePath → freshness → loadStore → query verb). This is the
// test that would have caught the 3 integration bugs that all 2492 unit tests
// missed because each domain mocked the other:
//   1. query CLI read JSONL but the indexer writes SQLite (loadStore had no SQLite reader)
//   2. IMPORT edge dst stored as a raw relative specifier (../../bin/x), not a
//      repo-relative id, so who-imports could never match
//   3. runFreshnessCheck called D4 with the wrong argument order (storePath vs
//      (db, projectRoot, touched, parseAndPut)) → threw on every real query
// Fast-by-default would be nice but this builds an index; gate it like the other
// real-build tests so `npm test` stays fast for workflow agents.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { build_index } = require('../bin/gsd-t-graph-index.cjs');
const cli = require('../bin/gsd-t-graph-query-cli.cjs');

let repo, dbPath;
before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'm94-e2e-'));
  fs.mkdirSync(path.join(repo, '.gsd-t'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  // a.ts imports b.ts; c.ts imports b.ts → who-imports(src/b.ts) = {a, c}
  fs.writeFileSync(path.join(repo, 'src', 'b.ts'), 'export function b() { return 1; }\n');
  fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'import { b } from "./b";\nexport function a() { return b(); }\n');
  fs.writeFileSync(path.join(repo, 'src', 'c.ts'), 'import { b } from "./b";\nexport function c() { return b() + 1; }\n');
  dbPath = path.join(repo, '.gsd-t', 'graph.db');
  build_index(repo, { dbPath });
});
after(() => { try { fs.rmSync(repo, { recursive: true, force: true }); } catch {} });

test('E2E: build SQLite index, then who-imports resolves real repo-relative importers', () => {
  // Load the SQLite store via the same path the CLI uses (proves bugs #1 + #2 fixed).
  const store = cli.loadStore(dbPath);
  assert.strictEqual(store.ok, true, 'loadStore reads the SQLite index (bug #1: had no SQLite reader)');
  const res = cli.queryWhoImports(store.index, 'src/b.ts');
  const importers = (res.results || []).sort();
  // a.ts and c.ts both import ./b → must resolve to src/a.ts + src/c.ts
  assert.ok(importers.includes('src/a.ts'), `who-imports(src/b.ts) includes src/a.ts (got ${JSON.stringify(importers)})`);
  assert.ok(importers.includes('src/c.ts'), `who-imports(src/b.ts) includes src/c.ts (got ${JSON.stringify(importers)})`);
});

test('E2E: runFreshnessCheck succeeds on a real SQLite index (bug #3: signature mismatch)', () => {
  const r = cli.runFreshnessCheck(dbPath);
  assert.strictEqual(r.ok, true, 'freshness check passes (bug #3: was called with wrong arg order, threw on .edits)');
});
