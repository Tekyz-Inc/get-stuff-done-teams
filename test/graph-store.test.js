'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const store = require('../bin/graph-store.js');

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-graph-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('graph-store', () => {
  describe('getGraphDir', () => {
    it('returns correct path', () => {
      const dir = store.getGraphDir('/project');
      assert.ok(dir.endsWith(path.join('.gsd-t', 'graph')));
    });
  });

  describe('ensureDir', () => {
    it('creates graph directory if missing', () => {
      const root = path.join(tmpDir, 'ensure-test');
      fs.mkdirSync(root, { recursive: true });
      store.ensureDir(root);
      const dir = store.getGraphDir(root);
      assert.ok(fs.existsSync(dir));
    });
  });

  describe('read operations — missing files', () => {
    it('readIndex returns empty entities', () => {
      const r = store.readIndex(path.join(tmpDir, 'nonexistent'));
      assert.deepStrictEqual(r, { entities: [] });
    });

    it('readCalls returns empty edges', () => {
      const r = store.readCalls(path.join(tmpDir, 'nonexistent'));
      assert.deepStrictEqual(r, { edges: [] });
    });

    it('readImports returns empty edges', () => {
      const r = store.readImports(path.join(tmpDir, 'nonexistent'));
      assert.deepStrictEqual(r, { edges: [] });
    });

    it('readContracts returns empty mappings', () => {
      const r = store.readContracts(path.join(tmpDir, 'nonexistent'));
      assert.deepStrictEqual(r, { mappings: [] });
    });

    it('readRequirements returns empty mappings', () => {
      const r = store.readRequirements(path.join(tmpDir, 'nonexistent'));
      assert.deepStrictEqual(r, { mappings: [] });
    });

    it('readTests returns empty mappings', () => {
      const r = store.readTests(path.join(tmpDir, 'nonexistent'));
      assert.deepStrictEqual(r, { mappings: [] });
    });

    it('readSurfaces returns empty mappings', () => {
      const r = store.readSurfaces(path.join(tmpDir, 'nonexistent'));
      assert.deepStrictEqual(r, { mappings: [] });
    });

    it('readMeta returns null', () => {
      const r = store.readMeta(path.join(tmpDir, 'nonexistent'));
      assert.strictEqual(r, null);
    });
  });

  describe('write and read roundtrip', () => {
    const root = path.join(os.tmpdir(), 'gsd-t-graph-roundtrip-' + Date.now());

    before(() => fs.mkdirSync(root, { recursive: true }));
    after(() => fs.rmSync(root, { recursive: true, force: true }));

    it('writeIndex + readIndex', () => {
      const data = { entities: [{ id: 'test:1:foo', name: 'foo', type: 'function', file: 'test.js', line: 1, domain: null, exported: true }] };
      store.writeIndex(root, data);
      const read = store.readIndex(root);
      assert.deepStrictEqual(read, data);
    });

    it('writeCalls + readCalls', () => {
      const data = { edges: [{ caller: 'a', callee: 'b', line: 5 }] };
      store.writeCalls(root, data);
      assert.deepStrictEqual(store.readCalls(root), data);
    });

    it('writeImports + readImports', () => {
      const data = { edges: [{ source: 'a.js', target: 'b.js', names: ['foo'], line: 1 }] };
      store.writeImports(root, data);
      assert.deepStrictEqual(store.readImports(root), data);
    });

    it('writeContracts + readContracts', () => {
      const data = { mappings: [{ entity: 'x', contract: 'api.md', section: 'routes' }] };
      store.writeContracts(root, data);
      assert.deepStrictEqual(store.readContracts(root), data);
    });

    it('writeRequirements + readRequirements', () => {
      const data = { mappings: [{ entity: 'x', requirement: 'REQ-001' }] };
      store.writeRequirements(root, data);
      assert.deepStrictEqual(store.readRequirements(root), data);
    });

    it('writeTests + readTests', () => {
      const data = { mappings: [{ entity: 'x', testFile: 'test/x.test.js', testName: 'x works' }] };
      store.writeTests(root, data);
      assert.deepStrictEqual(store.readTests(root), data);
    });

    it('writeSurfaces + readSurfaces', () => {
      const data = { mappings: [{ entity: 'x', surfaces: ['cli'] }] };
      store.writeSurfaces(root, data);
      assert.deepStrictEqual(store.readSurfaces(root), data);
    });

    it('writeMeta + readMeta', () => {
      const data = { lastIndexed: '2026-03-18T10:00:00Z', provider: 'native', entityCount: 5, relationshipCount: 10, duration: 100, fileHashes: { 'a.js': 'abc123' } };
      store.writeMeta(root, data);
      assert.deepStrictEqual(store.readMeta(root), data);
    });
  });

  describe('hashContent', () => {
    it('returns consistent md5 hash', () => {
      const h1 = store.hashContent('hello world');
      const h2 = store.hashContent('hello world');
      assert.strictEqual(h1, h2);
      assert.strictEqual(h1.length, 32);
    });

    it('returns different hash for different content', () => {
      const h1 = store.hashContent('hello');
      const h2 = store.hashContent('world');
      assert.notStrictEqual(h1, h2);
    });
  });

  describe('hashFile', () => {
    it('returns hash for existing file', () => {
      const fp = path.join(tmpDir, 'hash-test.txt');
      fs.writeFileSync(fp, 'test content', 'utf8');
      const h = store.hashFile(fp);
      assert.strictEqual(typeof h, 'string');
      assert.strictEqual(h.length, 32);
    });

    it('returns null for missing file', () => {
      const h = store.hashFile(path.join(tmpDir, 'no-such-file.txt'));
      assert.strictEqual(h, null);
    });
  });

  describe('isStale', () => {
    it('returns stale=true when no meta exists', () => {
      const root = path.join(tmpDir, 'stale-no-meta');
      fs.mkdirSync(root, { recursive: true });
      const result = store.isStale(root, ['/some/file.js']);
      assert.strictEqual(result.stale, true);
    });

    it('returns stale=false when file hashes match', () => {
      const root = path.join(tmpDir, 'stale-match');
      fs.mkdirSync(root, { recursive: true });
      const testFile = path.join(root, 'a.js');
      fs.writeFileSync(testFile, 'const x = 1;', 'utf8');
      const hash = store.hashFile(testFile);
      store.writeMeta(root, { fileHashes: { 'a.js': hash } });
      const result = store.isStale(root, [testFile]);
      assert.strictEqual(result.stale, false);
      assert.deepStrictEqual(result.changedFiles, []);
    });

    it('returns stale=true when file content changed', () => {
      const root = path.join(tmpDir, 'stale-changed');
      fs.mkdirSync(root, { recursive: true });
      const testFile = path.join(root, 'b.js');
      fs.writeFileSync(testFile, 'const x = 1;', 'utf8');
      store.writeMeta(root, { fileHashes: { 'b.js': 'old-hash' } });
      const result = store.isStale(root, [testFile]);
      assert.strictEqual(result.stale, true);
      assert.strictEqual(result.changedFiles.length, 1);
    });
  });

  describe('clear', () => {
    it('removes all graph files', () => {
      const root = path.join(tmpDir, 'clear-test');
      fs.mkdirSync(root, { recursive: true });
      store.writeIndex(root, { entities: [] });
      store.writeMeta(root, { entityCount: 0 });
      const dir = store.getGraphDir(root);
      assert.ok(fs.existsSync(path.join(dir, 'index.json')));
      store.clear(root);
      assert.ok(!fs.existsSync(path.join(dir, 'index.json')));
      assert.ok(!fs.existsSync(path.join(dir, 'meta.json')));
      // Directory still exists
      assert.ok(fs.existsSync(dir));
    });

    it('handles missing directory gracefully', () => {
      assert.doesNotThrow(() => {
        store.clear(path.join(tmpDir, 'no-such-dir'));
      });
    });
  });
});
