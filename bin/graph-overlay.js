'use strict';
const fs = require('fs');
const path = require('path');

/**
 * GSD-T context mapper — enriches code entities with
 * domain ownership, contract mapping, requirement traceability,
 * test mapping, debt mapping, and surface detection.
 */

function readFileOrEmpty(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return ''; }
}

function listDirs(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch { return []; }
}

function buildDomainMap(projectRoot) {
  const domainsDir = path.join(projectRoot, '.gsd-t', 'domains');
  const map = {};
  for (const domain of listDirs(domainsDir)) {
    const scopePath = path.join(domainsDir, domain, 'scope.md');
    const content = readFileOrEmpty(scopePath);
    const fileRefs = [];
    for (const line of content.split('\n')) {
      const m = line.match(/[-*]\s+`([^`]+)`/);
      if (m) fileRefs.push(m[1].replace(/\s*\(.*\)/, '').trim());
    }
    map[domain] = fileRefs;
  }
  return map;
}

function mapDomains(entities, projectRoot) {
  const domainMap = buildDomainMap(projectRoot);
  for (const entity of entities) {
    for (const [domain, files] of Object.entries(domainMap)) {
      if (files.some(f => entity.file.includes(f))) {
        entity.domain = domain;
        break;
      }
    }
  }
}

function mapContracts(entities, projectRoot) {
  const contractsDir = path.join(
    projectRoot, '.gsd-t', 'contracts'
  );
  const mappings = [];
  try {
    const files = fs.readdirSync(contractsDir)
      .filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = readFileOrEmpty(
        path.join(contractsDir, file)
      );
      for (const entity of entities) {
        if (content.includes(entity.name)) {
          mappings.push({
            entity: entity.id,
            contract: file,
            section: ''
          });
        }
      }
    }
  } catch { /* no contracts dir */ }
  return { mappings };
}

function mapRequirements(entities, projectRoot) {
  const reqPath = path.join(
    projectRoot, 'docs', 'requirements.md'
  );
  const content = readFileOrEmpty(reqPath);
  const mappings = [];
  if (!content) return { mappings };

  const reqLines = content.split('\n');
  for (const entity of entities) {
    for (const line of reqLines) {
      const reqMatch = line.match(/(REQ-\d+)/);
      if (reqMatch && line.includes(entity.name)) {
        mappings.push({
          entity: entity.id,
          requirement: reqMatch[1]
        });
      }
    }
  }
  return { mappings };
}

function mapTests(entities, projectRoot) {
  const mappings = [];
  const testDirs = ['test', 'tests', '__tests__', 'spec'];
  for (const dir of testDirs) {
    const testDir = path.join(projectRoot, dir);
    try {
      const files = fs.readdirSync(testDir)
        .filter(f => /\.(test|spec)\.(js|ts|py)$/.test(f));
      for (const testFile of files) {
        const content = readFileOrEmpty(
          path.join(testDir, testFile)
        );
        for (const entity of entities) {
          if (content.includes(entity.name)) {
            mappings.push({
              entity: entity.id,
              testFile: path.join(dir, testFile),
              testName: ''
            });
          }
        }
      }
    } catch { /* no test dir */ }
  }
  return { mappings };
}

function mapDebt(entities, projectRoot) {
  const debtPath = path.join(
    projectRoot, '.gsd-t', 'techdebt.md'
  );
  const content = readFileOrEmpty(debtPath);
  const mappings = [];
  if (!content) return mappings;

  for (const entity of entities) {
    const lines = content.split('\n');
    for (const line of lines) {
      const debtMatch = line.match(/(TD-\d+)/);
      if (debtMatch && (
        line.includes(entity.name) ||
        line.includes(entity.file)
      )) {
        mappings.push({
          id: debtMatch[1],
          entity: entity.id,
          description: line.trim()
        });
      }
    }
  }
  return mappings;
}

function detectSurfaces(entities, projectRoot) {
  const surfaceDirs = {
    'web': ['web', 'frontend', 'client', 'webapp', 'www'],
    'mobile': ['mobile', 'app', 'ios', 'android', 'react-native'],
    'cli': ['cli', 'bin', 'commands'],
    'api': ['api', 'server', 'backend', 'routes'],
    'shared': ['shared', 'common', 'lib', 'utils', 'core']
  };

  const mappings = [];
  for (const entity of entities) {
    const surfaces = [];
    for (const [surface, dirs] of Object.entries(surfaceDirs)) {
      if (dirs.some(d => entity.file.startsWith(d + '/') ||
                        entity.file.startsWith(d + '\\'))) {
        surfaces.push(surface);
      }
    }
    if (surfaces.length > 0) {
      mappings.push({ entity: entity.id, surfaces });
    }
  }
  return { mappings };
}

function buildOverlay(projectRoot, entities) {
  mapDomains(entities, projectRoot);
  const contracts = mapContracts(entities, projectRoot);
  const requirements = mapRequirements(entities, projectRoot);
  const tests = mapTests(entities, projectRoot);
  const surfaces = detectSurfaces(entities, projectRoot);
  const debt = mapDebt(entities, projectRoot);

  return { contracts, requirements, tests, surfaces, debt };
}

module.exports = {
  buildOverlay, buildDomainMap, mapDomains,
  mapContracts, mapRequirements, mapTests,
  mapDebt, detectSurfaces
};
