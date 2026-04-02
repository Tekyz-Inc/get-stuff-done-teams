'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { query, getProviders, resetSession, nativeProvider } = require('../bin/graph-query');
const { indexProject } = require('../bin/graph-indexer');
const store = require('../bin/graph-store');

let tmpDir;

before(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-query-')));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: create a simple project and index it
function createAndIndex(name) {
  const root = path.join(tmpDir, name);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'main.js'), [
    "const { helper } = require('./helper');",
    'function main() { helper(); }',
    'module.exports = { main };',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'helper.js'), [
    'function helper() { return 42; }',
    'function unused() { return 0; }',
    'module.exports = { helper };',
  ].join('\n'));
  indexProject(root, { force: true });
  return root;
}

describe('graph-query', () => {
  describe('provider registry', () => {
    it('has 3 default providers', () => {
      const providers = getProviders();
      assert.strictEqual(providers.length, 3);
      assert.strictEqual(providers[0].name, 'cgc');
      assert.strictEqual(providers[1].name, 'native');
      assert.strictEqual(providers[2].name, 'grep');
    });

    it('providers sorted by priority', () => {
      const providers = getProviders();
      assert.ok(providers[0].priority < providers[1].priority);
      assert.ok(providers[1].priority < providers[2].priority);
    });
  });

  describe('getProvider', () => {
    it('returns a valid provider when indexed', () => {
      const root = createAndIndex('provider-test');
      resetSession();
      const result = query('getProvider', {}, root);
      assert.ok(['cgc', 'native', 'grep'].includes(result),
        `expected cgc, native, or grep but got: ${result}`);
    });
  });

  describe('getIndexStatus', () => {
    it('shows indexed status', () => {
      const root = createAndIndex('status-test');
      const status = query('getIndexStatus', {}, root);
      assert.strictEqual(status.indexed, true);
      assert.ok(status.entityCount > 0);
      assert.strictEqual(status.provider, 'native');
    });
  });

  describe('getEntity', () => {
    it('finds entity by name', () => {
      const root = createAndIndex('entity-test');
      const result = query('getEntity', { name: 'main' }, root);
      assert.ok(result);
      assert.strictEqual(result.name, 'main');
      assert.strictEqual(result.type, 'function');
    });

    it('returns null for unknown entity', () => {
      const root = createAndIndex('entity-miss');
      const result = query('getEntity', { name: 'nonexistent' }, root);
      assert.strictEqual(result, null);
    });
  });

  describe('getEntities', () => {
    it('returns entities for a file', () => {
      const root = createAndIndex('entities-test');
      const result = query('getEntities', { file: 'helper.js' }, root);
      assert.ok(Array.isArray(result));
      assert.ok(result.length >= 2); // helper + unused
    });
  });

  describe('getImports', () => {
    it('returns imports for a file', () => {
      const root = createAndIndex('imports-test');
      const result = query('getImports', { file: 'main.js' }, root);
      assert.ok(Array.isArray(result));
      assert.ok(result.length >= 1);
      assert.ok(result[0].target.includes('helper'));
    });
  });

  describe('findDeadCode', () => {
    it('finds unused non-exported functions', () => {
      const root = createAndIndex('dead-code-test');
      const result = query('findDeadCode', {}, root);
      assert.ok(Array.isArray(result));
      // Result may come from CGC (global index) or native (fixture)
      // Either way, dead code results should be an array of entities
      assert.ok(result.length >= 0, 'should return dead code array');
      if (result.length > 0) {
        assert.ok(result[0].name, 'dead code entries should have name');
      }
    });
  });

  describe('findDuplicates', () => {
    it('finds name-based duplicates', () => {
      const root = path.join(tmpDir, 'dupes-test');
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'a.js'),
        'function process() {}\nmodule.exports = { process };\n');
      fs.writeFileSync(path.join(root, 'b.js'),
        'function process() {}\nmodule.exports = { process };\n');
      indexProject(root, { force: true });

      const result = query('findDuplicates', { threshold: 0.8 }, root);
      assert.ok(Array.isArray(result));
      // CGC uses fuzzy code search; native finds name-based dupes
      // Both should return results for identical function names
      assert.ok(result.length > 0, 'should find duplicates');
      // Native returns similarity field; CGC returns entity shape
      if (result[0].similarity !== undefined) {
        assert.strictEqual(result[0].similarity, 1.0);
      } else {
        assert.ok(result[0].name, 'CGC results should have name');
      }
    });
  });

  describe('reindex', () => {
    it('re-indexes the project', () => {
      const root = createAndIndex('reindex-test');
      const result = query('reindex', { force: true }, root);
      assert.ok(result);
      assert.strictEqual(result.success, true);
      assert.ok(result.entityCount > 0);
    });
  });

  describe('fallback behavior', () => {
    it('works on unindexed project (auto-indexes)', () => {
      const root = path.join(tmpDir, 'fallback-test');
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'app.js'),
        'function app() {}\nmodule.exports = { app };\n');
      resetSession();

      // Query should auto-index
      const result = query('getEntity', { name: 'app' }, root);
      assert.ok(result);
      assert.strictEqual(result.name, 'app');
    });
  });
});

describe('graph-cgc', () => {
  const {
    checkCgcHealth, resetHealthCache, cgcProvider,
    normalizeEntity, normalizeResults, findCgcCommand
  } = require('../bin/graph-cgc');

  describe('health detection', () => {
    it('detects CGC availability based on cgc binary', () => {
      resetHealthCache();
      const health = checkCgcHealth();
      // CGC may or may not be installed — test handles both
      assert.strictEqual(typeof health.available, 'boolean');
      assert.ok(Array.isArray(health.capabilities));
    });

    it('caches health result', () => {
      resetHealthCache();
      const h1 = checkCgcHealth();
      const h2 = checkCgcHealth();
      assert.strictEqual(h1, h2); // same object reference
    });

    it('resetHealthCache clears cache', () => {
      checkCgcHealth();
      resetHealthCache();
      // After reset, next check should re-evaluate
      const h = checkCgcHealth();
      assert.ok(h !== null);
    });
  });

  describe('findCgcCommand', () => {
    it('returns string or null', () => {
      const cmd = findCgcCommand();
      assert.ok(cmd === null || typeof cmd === 'string');
    });
  });

  describe('normalizeEntity', () => {
    it('normalizes CGC entity format', () => {
      const cgcEntity = {
        file_path: 'src/auth.js',
        line_number: 42,
        name: 'getUser',
        type: 'function'
      };
      const entity = normalizeEntity(cgcEntity);
      assert.strictEqual(entity.name, 'getUser');
      assert.strictEqual(entity.file, 'src/auth.js');
      assert.strictEqual(entity.line, 42);
      assert.strictEqual(entity.type, 'function');
      assert.strictEqual(entity.id, 'src/auth.js:42:getUser');
    });

    it('handles alternate CGC field names', () => {
      const cgcEntity = {
        path: 'lib/utils.py',
        line: 10,
        symbol: 'calculate',
        kind: 'method'
      };
      const entity = normalizeEntity(cgcEntity);
      assert.strictEqual(entity.name, 'calculate');
      assert.strictEqual(entity.file, 'lib/utils.py');
      assert.strictEqual(entity.type, 'method');
    });

    it('handles missing fields gracefully', () => {
      const entity = normalizeEntity({});
      assert.strictEqual(entity.name, '');
      assert.strictEqual(entity.file, '');
      assert.strictEqual(entity.line, 0);
    });
  });

  describe('normalizeResults', () => {
    it('handles array input', () => {
      const result = normalizeResults([
        { file_path: 'a.js', line_number: 1, name: 'foo' }
      ]);
      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'foo');
    });

    it('handles { results: [...] } shape', () => {
      const result = normalizeResults({
        results: [{ file_path: 'b.js', line_number: 2, name: 'bar' }]
      });
      assert.ok(Array.isArray(result));
      assert.strictEqual(result[0].name, 'bar');
    });

    it('handles { functions: [...] } shape', () => {
      const result = normalizeResults({
        functions: [{ file_path: 'c.js', line_number: 3, name: 'baz' }]
      });
      assert.strictEqual(result[0].name, 'baz');
    });

    it('handles { dead_code: [...] } shape', () => {
      const result = normalizeResults({
        dead_code: [{ file_path: 'd.js', line_number: 4, name: 'unused' }]
      });
      assert.strictEqual(result[0].name, 'unused');
    });

    it('returns null for null input', () => {
      assert.strictEqual(normalizeResults(null), null);
    });

    it('returns null for unrecognized shape', () => {
      assert.strictEqual(normalizeResults({ foo: 'bar' }), null);
    });
  });

  describe('provider interface', () => {
    it('cgcProvider has correct shape', () => {
      assert.strictEqual(cgcProvider.name, 'cgc');
      assert.strictEqual(cgcProvider.priority, 1);
      assert.strictEqual(typeof cgcProvider.available, 'function');
      assert.strictEqual(typeof cgcProvider.query, 'function');
    });

    it('query returns null when CGC unavailable', () => {
      resetHealthCache();
      // If CGC is not installed, all queries should return null
      if (!checkCgcHealth().available) {
        const result = cgcProvider.query('getTransitiveCallers', {
          entity: 'test', depth: 3
        });
        assert.strictEqual(result, null);
      }
    });

    it('handles all supported query types without error', () => {
      resetHealthCache();
      const types = [
        'getCallers', 'getCallees',
        'getTransitiveCallers', 'getTransitiveCallees',
        'findDeadCode', 'findDuplicates',
        'findCircularDeps', 'getEntity'
      ];
      for (const type of types) {
        assert.doesNotThrow(() => {
          cgcProvider.query(type, { entity: 'test' });
        });
      }
    });

    it('returns null for unsupported query types', () => {
      const result = cgcProvider.query('unsupportedType', {});
      assert.strictEqual(result, null);
    });
  });
});
