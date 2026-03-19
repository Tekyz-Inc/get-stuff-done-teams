'use strict';
const fs = require('fs');
const path = require('path');
const store = require('./graph-store');
const { getParser } = require('./graph-parsers');
const { buildOverlay } = require('./graph-overlay');

const DEFAULT_EXCLUDE = [
  'node_modules', '.git', 'dist', 'build',
  'coverage', '.gsd-t', '.claude', '__pycache__'
];

const SUPPORTED_EXTS = [
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py'
];

function walkFiles(dir, exclude) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (exclude.includes(e.name)) continue;
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        results.push(...walkFiles(full, exclude));
      } else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (SUPPORTED_EXTS.includes(ext)) {
          results.push(full);
        }
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return results;
}

function indexProject(projectRoot, options = {}) {
  const start = Date.now();
  const force = options.force || false;
  const exclude = options.exclude || DEFAULT_EXCLUDE;
  const errors = [];

  // Find source files
  const allFiles = walkFiles(projectRoot, exclude);

  // Check staleness
  if (!force) {
    const { stale, changedFiles } = store.isStale(
      projectRoot, allFiles
    );
    if (!stale) {
      const meta = store.readMeta(projectRoot);
      return {
        success: true,
        entityCount: meta ? meta.entityCount : 0,
        relationshipCount: meta ? meta.relationshipCount : 0,
        duration: Date.now() - start,
        errors: [],
        filesProcessed: 0,
        filesSkipped: allFiles.length
      };
    }
  }

  // Parse all files
  const allEntities = [];
  const allImports = [];
  const allCalls = [];
  const fileHashes = {};
  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const filePath of allFiles) {
    const ext = path.extname(filePath);
    const parser = getParser(ext);
    if (!parser) { filesSkipped++; continue; }

    const rel = path.relative(projectRoot, filePath)
      .replace(/\\/g, '/');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      fileHashes[rel] = store.hashContent(content);
      const result = parser(content, rel);
      allEntities.push(...result.entities);
      allImports.push(...result.imports);
      allCalls.push(...result.calls);
      filesProcessed++;
    } catch (e) {
      errors.push(`Parse error in ${rel}: ${e.message}`);
      filesSkipped++;
    }
  }

  // Build GSD-T overlay
  const overlay = buildOverlay(projectRoot, allEntities);

  // Resolve call edges (map callee names to entity IDs)
  const resolvedCalls = [];
  const entityByName = new Map();
  for (const e of allEntities) {
    if (!entityByName.has(e.name)) {
      entityByName.set(e.name, e);
    }
  }
  for (const call of allCalls) {
    const target = entityByName.get(call.callee);
    if (target) {
      resolvedCalls.push({
        caller: call.caller,
        callee: target.id,
        line: call.line
      });
    }
  }

  // Write to storage
  store.writeIndex(projectRoot, { entities: allEntities });
  store.writeCalls(projectRoot, { edges: resolvedCalls });
  store.writeImports(projectRoot, { edges: allImports });
  store.writeContracts(projectRoot, overlay.contracts);
  store.writeRequirements(projectRoot, overlay.requirements);
  store.writeTests(projectRoot, overlay.tests);
  store.writeSurfaces(projectRoot, overlay.surfaces);

  const relCount = resolvedCalls.length + allImports.length;
  store.writeMeta(projectRoot, {
    lastIndexed: new Date().toISOString(),
    provider: 'native',
    entityCount: allEntities.length,
    relationshipCount: relCount,
    duration: Date.now() - start,
    fileHashes
  });

  return {
    success: true,
    entityCount: allEntities.length,
    relationshipCount: relCount,
    duration: Date.now() - start,
    errors,
    filesProcessed,
    filesSkipped
  };
}

module.exports = { indexProject, walkFiles, DEFAULT_EXCLUDE };
