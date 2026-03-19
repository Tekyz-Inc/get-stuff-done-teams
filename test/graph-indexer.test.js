'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { parseJavaScript, parsePython, getParser } = require('../bin/graph-parsers');
const { indexProject } = require('../bin/graph-indexer');
const { buildOverlay, buildDomainMap } = require('../bin/graph-overlay');
const store = require('../bin/graph-store');

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-indexer-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('graph-parsers — JavaScript', () => {
  it('extracts function declarations', () => {
    const { entities } = parseJavaScript(
      'function doStuff(a, b) {\n  return a + b;\n}\n',
      'test.js'
    );
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].name, 'doStuff');
    assert.strictEqual(entities[0].type, 'function');
    assert.strictEqual(entities[0].line, 1);
  });

  it('extracts async function declarations', () => {
    const { entities } = parseJavaScript(
      'async function fetchData() {}\n',
      'test.js'
    );
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].name, 'fetchData');
  });

  it('extracts arrow functions', () => {
    const { entities } = parseJavaScript(
      'const add = (a, b) => a + b;\n',
      'test.js'
    );
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].name, 'add');
    assert.strictEqual(entities[0].type, 'function');
  });

  it('extracts const function expressions', () => {
    const { entities } = parseJavaScript(
      'const handler = function(req, res) {};\n',
      'test.js'
    );
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].name, 'handler');
  });

  it('extracts class declarations', () => {
    const { entities } = parseJavaScript(
      'class UserService {\n  getUser() {\n    return null;\n  }\n}\n',
      'test.js'
    );
    const cls = entities.find(e => e.type === 'class');
    const method = entities.find(e => e.type === 'method');
    assert.ok(cls, 'should find class');
    assert.strictEqual(cls.name, 'UserService');
    assert.ok(method, 'should find method');
    assert.strictEqual(method.name, 'getUser');
  });

  it('extracts ES import statements', () => {
    const { imports } = parseJavaScript(
      "import { readFile, writeFile } from 'fs';\n",
      'test.js'
    );
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].target, 'fs');
    assert.deepStrictEqual(imports[0].names, ['readFile', 'writeFile']);
  });

  it('extracts default import', () => {
    const { imports } = parseJavaScript(
      "import path from 'path';\n",
      'test.js'
    );
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].target, 'path');
    assert.deepStrictEqual(imports[0].names, ['path']);
  });

  it('extracts require statements', () => {
    const { imports } = parseJavaScript(
      "const { join } = require('path');\n",
      'test.js'
    );
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].target, 'path');
    assert.deepStrictEqual(imports[0].names, ['join']);
  });

  it('extracts default require', () => {
    const { imports } = parseJavaScript(
      "const fs = require('fs');\n",
      'test.js'
    );
    assert.strictEqual(imports.length, 1);
    assert.deepStrictEqual(imports[0].names, ['fs']);
  });

  it('detects exported functions', () => {
    const { entities } = parseJavaScript(
      'export function doWork() {}\n',
      'test.js'
    );
    assert.strictEqual(entities[0].exported, true);
  });

  it('detects module.exports', () => {
    const code = 'function foo() {}\nfunction bar() {}\nmodule.exports = { foo, bar };\n';
    const { entities } = parseJavaScript(code, 'test.js');
    const foo = entities.find(e => e.name === 'foo');
    const bar = entities.find(e => e.name === 'bar');
    assert.ok(foo.exported);
    assert.ok(bar.exported);
  });

  it('handles mixed content', () => {
    const code = [
      "const fs = require('fs');",
      "const path = require('path');",
      '',
      'function readConfig(filePath) {',
      '  return JSON.parse(fs.readFileSync(filePath));',
      '}',
      '',
      'class ConfigManager {',
      '  load() { return readConfig("config.json"); }',
      '}',
      '',
      'module.exports = { readConfig, ConfigManager };',
    ].join('\n');
    const result = parseJavaScript(code, 'config.js');
    assert.ok(result.entities.length >= 3); // readConfig, ConfigManager, load
    assert.strictEqual(result.imports.length, 2); // fs, path
  });
});

describe('graph-parsers — Python', () => {
  it('extracts function definitions', () => {
    const { entities } = parsePython(
      'def calculate(a, b):\n    return a + b\n',
      'calc.py'
    );
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].name, 'calculate');
    assert.strictEqual(entities[0].type, 'function');
  });

  it('extracts class definitions', () => {
    const { entities } = parsePython(
      'class UserModel:\n    def __init__(self):\n        pass\n',
      'models.py'
    );
    const cls = entities.find(e => e.type === 'class');
    assert.ok(cls);
    assert.strictEqual(cls.name, 'UserModel');
  });

  it('extracts methods inside classes', () => {
    const { entities } = parsePython(
      'class Svc:\n    def process(self):\n        pass\n',
      'svc.py'
    );
    const method = entities.find(e => e.type === 'method');
    assert.ok(method);
    assert.strictEqual(method.name, 'process');
  });

  it('extracts import statements', () => {
    const { imports } = parsePython(
      'import os\nfrom pathlib import Path, PurePath\n',
      'main.py'
    );
    assert.strictEqual(imports.length, 2);
    assert.strictEqual(imports[0].target, 'os');
    assert.deepStrictEqual(imports[1].names, ['Path', 'PurePath']);
  });

  it('skips private functions', () => {
    const { entities } = parsePython(
      'def _internal():\n    pass\ndef public():\n    pass\n',
      'mod.py'
    );
    assert.strictEqual(entities.length, 1);
    assert.strictEqual(entities[0].name, 'public');
  });
});

describe('graph-parsers — getParser', () => {
  it('returns JS parser for .js', () => {
    assert.strictEqual(getParser('.js'), parseJavaScript);
  });

  it('returns JS parser for .ts', () => {
    assert.strictEqual(getParser('.ts'), parseJavaScript);
  });

  it('returns Python parser for .py', () => {
    assert.strictEqual(getParser('.py'), parsePython);
  });

  it('returns null for unknown extension', () => {
    assert.strictEqual(getParser('.rb'), null);
  });
});

describe('graph-indexer — indexProject', () => {
  it('indexes a simple JS project', () => {
    const root = path.join(tmpDir, 'simple-project');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'main.js'),
      "const { helper } = require('./helper');\nfunction main() { helper(); }\nmodule.exports = { main };\n"
    );
    fs.writeFileSync(
      path.join(root, 'helper.js'),
      'function helper() { return 42; }\nmodule.exports = { helper };\n'
    );

    const result = indexProject(root, { force: true });
    assert.strictEqual(result.success, true);
    assert.ok(result.entityCount >= 2);
    assert.ok(result.filesProcessed >= 2);

    // Verify storage was written
    const idx = store.readIndex(root);
    assert.ok(idx.entities.length >= 2);
  });

  it('skips non-stale index on second run', () => {
    const root = path.join(tmpDir, 'incremental-project');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'app.js'),
      'function app() {}\n'
    );

    const r1 = indexProject(root, { force: true });
    assert.ok(r1.filesProcessed > 0);

    const r2 = indexProject(root);
    assert.strictEqual(r2.filesProcessed, 0);
    assert.strictEqual(r2.filesSkipped, 1);
  });

  it('re-indexes when file changes', () => {
    const root = path.join(tmpDir, 'changed-project');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'mod.js'),
      'function first() {}\n'
    );

    indexProject(root, { force: true });

    // Modify file
    fs.writeFileSync(
      path.join(root, 'mod.js'),
      'function first() {}\nfunction second() {}\n'
    );

    const r2 = indexProject(root);
    assert.ok(r2.filesProcessed > 0);
    assert.ok(r2.entityCount >= 2);
  });

  it('handles empty project', () => {
    const root = path.join(tmpDir, 'empty-project');
    fs.mkdirSync(root, { recursive: true });
    const result = indexProject(root, { force: true });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.entityCount, 0);
  });

  it('excludes node_modules', () => {
    const root = path.join(tmpDir, 'with-nm');
    fs.mkdirSync(path.join(root, 'node_modules', 'dep'), {
      recursive: true
    });
    fs.writeFileSync(
      path.join(root, 'node_modules', 'dep', 'index.js'),
      'function dep() {}\n'
    );
    fs.writeFileSync(
      path.join(root, 'app.js'),
      'function app() {}\n'
    );

    const result = indexProject(root, { force: true });
    assert.strictEqual(result.entityCount, 1);
    const idx = store.readIndex(root);
    assert.ok(idx.entities.every(e => !e.file.includes('node_modules')));
  });
});

describe('graph-overlay', () => {
  it('buildDomainMap reads scope files', () => {
    const root = path.join(tmpDir, 'overlay-project');
    const domainDir = path.join(root, '.gsd-t', 'domains', 'auth');
    fs.mkdirSync(domainDir, { recursive: true });
    fs.writeFileSync(
      path.join(domainDir, 'scope.md'),
      '# Domain: auth\n## Owned Files\n- `src/auth.js` (NEW)\n'
    );

    const map = buildDomainMap(root);
    assert.ok(map.auth);
    assert.ok(map.auth.includes('src/auth.js'));
  });

  it('buildOverlay maps contracts', () => {
    const root = path.join(tmpDir, 'overlay-contracts');
    const contractsDir = path.join(root, '.gsd-t', 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.writeFileSync(
      path.join(contractsDir, 'api-contract.md'),
      '# API Contract\n## Routes\nhandleRequest endpoint\n'
    );

    const entities = [{
      id: 'api.js:1:handleRequest',
      name: 'handleRequest',
      type: 'function',
      file: 'api.js',
      line: 1,
      domain: null,
      exported: true
    }];

    const overlay = buildOverlay(root, entities);
    assert.ok(overlay.contracts.mappings.length > 0);
    assert.strictEqual(
      overlay.contracts.mappings[0].contract,
      'api-contract.md'
    );
  });
});
