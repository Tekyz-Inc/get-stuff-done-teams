'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GRAPH_DIR = '.gsd-t/graph';
const FILES = {
  index: 'index.json',
  calls: 'calls.json',
  imports: 'imports.json',
  contracts: 'contracts.json',
  requirements: 'requirements.json',
  tests: 'tests.json',
  surfaces: 'surfaces.json',
  meta: 'meta.json'
};

function getGraphDir(projectRoot) {
  return path.join(projectRoot, GRAPH_DIR);
}

function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

function ensureDir(projectRoot) {
  const dir = getGraphDir(projectRoot);
  if (isSymlink(dir)) throw new Error('Graph directory is a symlink: ' + dir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readFile(projectRoot, fileName) {
  try {
    const fp = path.join(getGraphDir(projectRoot), fileName);
    if (isSymlink(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch { return null; }
}

function writeFile(projectRoot, fileName, data) {
  const dir = ensureDir(projectRoot);
  const fp = path.join(dir, fileName);
  if (isSymlink(fp)) throw new Error('Graph file is a symlink: ' + fp);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

function readIndex(root) {
  return readFile(root, FILES.index) || { entities: [] };
}

function readCalls(root) {
  return readFile(root, FILES.calls) || { edges: [] };
}

function readImports(root) {
  return readFile(root, FILES.imports) || { edges: [] };
}

function readContracts(root) {
  return readFile(root, FILES.contracts) || { mappings: [] };
}

function readRequirements(root) {
  return readFile(root, FILES.requirements) || { mappings: [] };
}

function readTests(root) {
  return readFile(root, FILES.tests) || { mappings: [] };
}

function readSurfaces(root) {
  return readFile(root, FILES.surfaces) || { mappings: [] };
}

function readMeta(root) {
  return readFile(root, FILES.meta);
}

function writeIndex(root, data) {
  writeFile(root, FILES.index, data);
}

function writeCalls(root, data) {
  writeFile(root, FILES.calls, data);
}

function writeImports(root, data) {
  writeFile(root, FILES.imports, data);
}

function writeContracts(root, data) {
  writeFile(root, FILES.contracts, data);
}

function writeRequirements(root, data) {
  writeFile(root, FILES.requirements, data);
}

function writeTests(root, data) {
  writeFile(root, FILES.tests, data);
}

function writeSurfaces(root, data) {
  writeFile(root, FILES.surfaces, data);
}

function writeMeta(root, data) {
  writeFile(root, FILES.meta, data);
}

function hashContent(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return hashContent(content);
  } catch { return null; }
}

function isStale(root, sourceFiles) {
  const meta = readMeta(root);
  if (!meta || !meta.fileHashes) {
    return { stale: true, changedFiles: sourceFiles };
  }
  const changed = [];
  for (const f of sourceFiles) {
    const hash = hashFile(f);
    const rel = path.relative(root, f);
    if (hash !== meta.fileHashes[rel]) changed.push(f);
  }
  return { stale: changed.length > 0, changedFiles: changed };
}

function clear(root) {
  const dir = getGraphDir(root);
  if (!fs.existsSync(dir)) return;
  for (const name of Object.values(FILES)) {
    const fp = path.join(dir, name);
    try { fs.unlinkSync(fp); } catch { /* ignore */ }
  }
}

module.exports = {
  getGraphDir, ensureDir,
  readIndex, readCalls, readImports, readContracts,
  readRequirements, readTests, readSurfaces, readMeta,
  writeIndex, writeCalls, writeImports, writeContracts,
  writeRequirements, writeTests, writeSurfaces, writeMeta,
  hashContent, hashFile, isStale, clear,
  FILES, GRAPH_DIR
};
