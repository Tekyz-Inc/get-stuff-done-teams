'use strict';
const store = require('./graph-store');
const { indexProject } = require('./graph-indexer');
const { cgcProvider, cgcQuery } = require('./graph-cgc');

/**
 * Graph Abstraction Layer — unified query interface.
 * Routes queries to best available provider: CGC → native → grep.
 * Commands call query() and never interact with providers directly.
 */

const providers = [];
let sessionProvider = null; // cached per session
let _lastFreshnessCheck = 0; // timestamp of last staleness check

function registerProvider(provider) {
  providers.push(provider);
  providers.sort((a, b) => a.priority - b.priority);
}

function getProviders() {
  return [...providers];
}

function selectProvider() {
  if (sessionProvider) return sessionProvider;
  for (const p of providers) {
    if (p.available()) {
      sessionProvider = p;
      return p;
    }
  }
  return null;
}

function resetSession() {
  sessionProvider = null;
}

// --- Native provider ---

function nativeAvailable(projectRoot) {
  const meta = store.readMeta(projectRoot);
  return meta !== null && meta.entityCount > 0;
}

function nativeQuery(type, params, projectRoot) {
  const idx = store.readIndex(projectRoot);
  const calls = store.readCalls(projectRoot);
  const imps = store.readImports(projectRoot);
  const contracts = store.readContracts(projectRoot);
  const requirements = store.readRequirements(projectRoot);
  const tests = store.readTests(projectRoot);
  const surfaces = store.readSurfaces(projectRoot);

  switch (type) {
    case 'getEntity': {
      return idx.entities.find(e =>
        e.name === params.name &&
        (!params.file || e.file === params.file)
      ) || null;
    }

    case 'getEntities': {
      return idx.entities.filter(e => e.file === params.file);
    }

    case 'getEntitiesByDomain': {
      return idx.entities.filter(
        e => e.domain === params.domain
      );
    }

    case 'getCallers': {
      const edges = calls.edges.filter(
        e => e.callee === params.entity ||
             e.callee.endsWith(':' + params.entity)
      );
      return edges.map(e => {
        const caller = idx.entities.find(
          ent => ent.id === e.caller
        );
        return caller || { id: e.caller, name: e.caller };
      });
    }

    case 'getCallees': {
      const edges = calls.edges.filter(
        e => e.caller === params.entity ||
             e.caller.endsWith(':' + params.entity)
      );
      return edges.map(e => {
        const callee = idx.entities.find(
          ent => ent.id === e.callee
        );
        return callee || { id: e.callee, name: e.callee };
      });
    }

    case 'getTransitiveCallers':
    case 'getTransitiveCallees': {
      // Native: 1-level only (CGC enhances to N-level)
      const direction = type === 'getTransitiveCallers'
        ? 'getCallers' : 'getCallees';
      return nativeQuery(direction, params, projectRoot);
    }

    case 'getImports': {
      return imps.edges.filter(e => e.source === params.file);
    }

    case 'getImporters': {
      return imps.edges.filter(e => e.target === params.file ||
        e.target.endsWith('/' + params.file));
    }

    case 'getDomainOwner': {
      const entity = typeof params.entity === 'string'
        ? idx.entities.find(e => e.id === params.entity ||
                                  e.name === params.entity)
        : params.entity;
      return entity ? entity.domain : null;
    }

    case 'getContractFor': {
      const m = contracts.mappings.find(
        c => c.entity === params.entity ||
             c.entity.endsWith(':' + params.entity)
      );
      return m ? m.contract : null;
    }

    case 'getRequirementFor': {
      const m = requirements.mappings.find(
        r => r.entity === params.entity ||
             r.entity.endsWith(':' + params.entity)
      );
      return m ? m.requirement : null;
    }

    case 'getTestsFor': {
      return tests.mappings.filter(
        t => t.entity === params.entity ||
             t.entity.endsWith(':' + params.entity)
      );
    }

    case 'getDebtFor': {
      return []; // debt mapping is basic
    }

    case 'getSurfaceConsumers': {
      const m = surfaces.mappings.find(
        s => s.entity === params.entity ||
             s.entity.endsWith(':' + params.entity)
      );
      return m ? m.surfaces : [];
    }

    case 'findDuplicates': {
      // Native: name-based only (CGC adds AST comparison)
      const names = {};
      for (const e of idx.entities) {
        if (!names[e.name]) names[e.name] = [];
        names[e.name].push(e);
      }
      const dupes = [];
      for (const [name, ents] of Object.entries(names)) {
        if (ents.length > 1) {
          for (let i = 0; i < ents.length - 1; i++) {
            dupes.push({
              entityA: ents[i],
              entityB: ents[i + 1],
              similarity: 1.0
            });
          }
        }
      }
      return dupes;
    }

    case 'findDeadCode': {
      // Entities that are not called and not exported
      const calledIds = new Set(
        calls.edges.map(e => e.callee)
      );
      return idx.entities.filter(e =>
        !e.exported && !calledIds.has(e.id)
      );
    }

    case 'findCircularDeps': {
      // Native: import-level cycle detection
      const graph = {};
      for (const edge of imps.edges) {
        if (!graph[edge.source]) graph[edge.source] = [];
        graph[edge.source].push(edge.target);
      }
      const cycles = [];
      const visited = new Set();
      const stack = new Set();

      function dfs(node, pathArr) {
        if (stack.has(node)) {
          const cycleStart = pathArr.indexOf(node);
          if (cycleStart >= 0) {
            cycles.push({
              path: pathArr.slice(cycleStart),
              entities: []
            });
          }
          return;
        }
        if (visited.has(node)) return;
        visited.add(node);
        stack.add(node);
        pathArr.push(node);
        for (const neighbor of (graph[node] || [])) {
          dfs(neighbor, [...pathArr]);
        }
        stack.delete(node);
      }

      for (const node of Object.keys(graph)) {
        dfs(node, []);
      }
      return cycles;
    }

    case 'getDomainBoundaryViolations': {
      const violations = [];
      for (const edge of calls.edges) {
        const callerEnt = idx.entities.find(
          e => e.id === edge.caller
        );
        const calleeEnt = idx.entities.find(
          e => e.id === edge.callee
        );
        if (callerEnt && calleeEnt &&
            callerEnt.domain && calleeEnt.domain &&
            callerEnt.domain !== calleeEnt.domain) {
          violations.push({
            entity: calleeEnt,
            ownerDomain: calleeEnt.domain,
            accessedBy: callerEnt,
            accessorDomain: callerEnt.domain
          });
        }
      }
      return violations;
    }

    case 'getProvider': {
      const p = selectProvider();
      return p ? p.name : 'grep';
    }

    case 'getIndexStatus': {
      const meta = store.readMeta(projectRoot);
      return {
        provider: meta ? meta.provider : 'none',
        indexed: meta !== null,
        entityCount: meta ? meta.entityCount : 0,
        lastIndexed: meta ? meta.lastIndexed : null,
        stale: false,
        stalePaths: []
      };
    }

    case 'reindex': {
      return indexProject(projectRoot, {
        force: params.force || false
      });
    }

    default:
      return null;
  }
}

const nativeProvider = {
  name: 'native',
  priority: 2,
  _projectRoot: null,
  setProjectRoot(root) { this._projectRoot = root; },
  available() {
    return this._projectRoot
      ? nativeAvailable(this._projectRoot) : false;
  },
  query(type, params) {
    return nativeQuery(type, params, this._projectRoot);
  }
};

// --- Grep fallback provider ---

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SAFE_ENTITY_RE = /^[\w.\-/\\:]+$/;

function grepQuery(type, params, projectRoot) {
  switch (type) {
    case 'getCallers': {
      const name = params.entity;
      if (!name || !SAFE_ENTITY_RE.test(name)) return [];
      try {
        const out = execFileSync('grep', ['-rn', name + '(', '--include=*.js', '--include=*.ts', '--include=*.py', projectRoot], { encoding: 'utf8', timeout: 5000 });
        return out.split('\n').filter(Boolean).map(line => {
          const [file] = line.split(':');
          return {
            id: file,
            name: 'grep_result',
            file: path.relative(projectRoot, file)
          };
        });
      } catch { return []; }
    }

    case 'getImporters': {
      const name = params.file || params.entity;
      if (!name || !SAFE_ENTITY_RE.test(name)) return [];
      try {
        const out = execFileSync('grep', ['-rn', '-e', 'import.*' + name, '-e', 'require.*' + name, '--include=*.js', '--include=*.ts', projectRoot], { encoding: 'utf8', timeout: 5000 });
        return out.split('\n').filter(Boolean).map(line => ({
          source: line.split(':')[0],
          target: name,
          names: [],
          line: parseInt(line.split(':')[1]) || 0
        }));
      } catch { return []; }
    }

    case 'getProvider':
      return 'grep';

    case 'getIndexStatus':
      return {
        provider: 'grep',
        indexed: false,
        entityCount: 0,
        lastIndexed: null,
        stale: true,
        stalePaths: []
      };

    default:
      return null;
  }
}

const grepProvider = {
  name: 'grep',
  priority: 3,
  _projectRoot: null,
  setProjectRoot(root) { this._projectRoot = root; },
  available() { return true; }, // always available
  query(type, params) {
    return grepQuery(type, params, this._projectRoot);
  }
};

// --- CGC Sync (Phase 2: keep Neo4j in sync at command boundary) ---

function _syncCgc(projectRoot) {
  if (!cgcProvider.available()) return;
  // Use CLI instead of MCP tool call — add_code_to_graph MCP is broken
  // on Windows in CGC 0.3.1 (directory param arrives as None)
  const { execFileSync } = require('child_process');
  const cgcEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  const cgcOpts = { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'], env: cgcEnv };

  // Attempt 1: normal sync
  try {
    execFileSync('cgc', ['index', projectRoot], cgcOpts);
    return;
  } catch (err1) {
    const msg1 = err1.stderr ? err1.stderr.toString() : err1.message;
    // Attempt 2: force re-index to recover from corrupt state
    try {
      execFileSync('cgc', ['index', projectRoot, '--force'], cgcOpts);
      process.stderr.write(
        '[GSD-T] CGC sync recovered via force re-index for ' +
        projectRoot + '\n'
      );
      return;
    } catch (err2) {
      const msg2 = err2.stderr ? err2.stderr.toString() : err2.message;
      // Both attempts failed — warn the user clearly
      process.stderr.write(
        '[GSD-T] ⚠ CGC sync FAILED for ' + projectRoot + '\n' +
        '  Error: ' + (msg2 || msg1).split('\n')[0] + '\n' +
        '  Impact: Neo4j graph is stale — deep call chain analysis ' +
        'may return outdated results\n' +
        '  Fix: run "cgc index ' + projectRoot + ' --force" manually\n'
      );
    }
  }
}

// --- Main query function ---

function query(type, params, projectRoot) {
  // Set project root on providers
  nativeProvider.setProjectRoot(projectRoot);
  grepProvider.setProjectRoot(projectRoot);

  // Auto-trigger reindex if stale (command-boundary freshness check)
  if (type !== 'reindex' && type !== 'getIndexStatus' &&
      type !== 'getProvider') {
    const now = Date.now();
    if (now - _lastFreshnessCheck > 500) {
      _lastFreshnessCheck = now;
      const meta = store.readMeta(projectRoot);
      if (!meta) {
        // No index exists — run initial index
        indexProject(projectRoot);
        _syncCgc(projectRoot);
      } else {
        // Check staleness — reindex if any files changed
        const result = indexProject(projectRoot);
        if (result.filesProcessed > 0) {
          _syncCgc(projectRoot);
        }
      }
    }
  }

  // Try providers in priority order
  for (const p of providers) {
    if (!p.available()) continue;
    if (p._projectRoot !== undefined) {
      p.setProjectRoot(projectRoot);
    }
    const result = p.query(type, params, projectRoot);
    if (result !== null && result !== undefined) return result;
  }

  return null;
}

// Register default providers
registerProvider(cgcProvider);
registerProvider(nativeProvider);
registerProvider(grepProvider);

module.exports = {
  query, registerProvider, getProviders,
  selectProvider, resetSession,
  nativeProvider, grepProvider
};
