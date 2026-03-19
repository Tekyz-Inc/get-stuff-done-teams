'use strict';
const { execFileSync, spawn } = require('child_process');
const path = require('path');
const store = require('./graph-store');

/**
 * CGC (CodeGraphContext) MCP provider.
 * Communicates with CGC via JSON-RPC over stdio (MCP protocol).
 * Falls back gracefully when CGC is unavailable.
 */

let healthCache = null;
let cgcProcess = null;
let requestId = 0;

// --- CGC Process Management ---

function findCgcCommand() {
  // Check if 'cgc' is available on PATH
  try {
    execFileSync('cgc', ['--version'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return 'cgc';
  } catch { /* not found */ }

  // Check common Python locations
  const paths = [
    'codegraphcontext',
    'python -m codegraphcontext'
  ];
  for (const cmd of paths) {
    try {
      const [bin, ...args] = cmd.split(' ');
      execFileSync(bin, [...args, '--version'], {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return cmd;
    } catch { /* not found */ }
  }
  return null;
}

function startCgcServer() {
  const cmd = findCgcCommand();
  if (!cmd) return null;

  try {
    const [bin, ...baseArgs] = cmd.split(' ');
    const args = [...baseArgs, 'mcp', 'start'];
    const proc = spawn(bin, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    proc.on('error', () => { cgcProcess = null; });
    proc.on('exit', () => { cgcProcess = null; });

    return proc;
  } catch { return null; }
}

function stopCgcServer() {
  if (cgcProcess) {
    try { cgcProcess.kill(); } catch { /* ignore */ }
    cgcProcess = null;
  }
}

// --- JSON-RPC over stdio ---

function sendRequest(proc, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: params || {}
    }) + '\n';

    let responseData = '';
    const timeout = setTimeout(() => {
      proc.stdout.removeListener('data', onData);
      reject(new Error('CGC request timeout'));
    }, 10000);

    function onData(chunk) {
      responseData += chunk.toString();
      const lines = responseData.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const resp = JSON.parse(line.trim());
          if (resp.id === id) {
            clearTimeout(timeout);
            proc.stdout.removeListener('data', onData);
            if (resp.error) {
              reject(new Error(resp.error.message));
            } else {
              resolve(resp.result);
            }
            return;
          }
        } catch { /* partial line, keep reading */ }
      }
    }

    proc.stdout.on('data', onData);
    proc.stdin.write(request);
  });
}

function sendRequestSync(proc, method, params, timeoutMs) {
  // Synchronous wrapper using execFileSync workaround
  // For the sync API that GSD-T commands expect,
  // we use a helper script pattern
  const ms = timeoutMs || 10000;
  try {
    const script = `
      const net = require('net');
      const req = ${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: params || {}
      })};
      process.stdin.resume();
      process.stdout.write(JSON.stringify(req) + '\\n');
    `;
    // This won't work for stdio — we need the async approach
    // Fall back to spawning a one-shot process
    return sendToolCallSync(method, params, ms);
  } catch { return null; }
}

function sendToolCallSync(toolName, args, timeoutMs) {
  const cmd = findCgcCommand();
  if (!cmd) return null;

  try {
    const [bin, ...baseArgs] = cmd.split(' ');
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args || {} }
    });

    // Spawn CGC, send request, read response
    const result = execFileSync(bin, [...baseArgs, 'mcp', 'start'], {
      input: JSON.stringify({
        jsonrpc: '2.0', id: 0,
        method: 'initialize', params: {}
      }) + '\n' +
      JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'notifications/initialized', params: {}
      }) + '\n' + request + '\n',
      encoding: 'utf8',
      timeout: timeoutMs || 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Parse response lines — find the one with id: 1
    const lines = result.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const resp = JSON.parse(line.trim());
        if (resp.id === 1 && resp.result) {
          // Extract text content from MCP response
          const content = resp.result.content;
          if (Array.isArray(content) && content[0]) {
            return JSON.parse(content[0].text);
          }
          return resp.result;
        }
      } catch { /* skip non-JSON lines */ }
    }
    return null;
  } catch { return null; }
}

// --- Health Detection ---

function checkCgcHealth() {
  if (healthCache) return healthCache;

  const cmd = findCgcCommand();
  if (!cmd) {
    healthCache = {
      available: false,
      version: null,
      capabilities: [],
      command: null
    };
    return healthCache;
  }

  // CGC binary exists — try to get version
  let version = null;
  try {
    const [bin, ...args] = cmd.split(' ');
    version = execFileSync(bin, [...args, '--version'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch { /* version unknown */ }

  healthCache = {
    available: true,
    version,
    command: cmd,
    capabilities: [
      'analyze_code_relationships',
      'find_dead_code',
      'find_code',
      'find_most_complex_functions',
      'calculate_cyclomatic_complexity',
      'execute_cypher_query',
      'add_code_to_graph',
      'get_repository_stats',
      'watch_directory',
      'visualize_graph_query'
    ]
  };
  return healthCache;
}

function resetHealthCache() {
  healthCache = null;
}

// --- Query Translation ---

function cgcQuery(toolName, args) {
  const health = checkCgcHealth();
  if (!health.available) return null;
  return sendToolCallSync(toolName, args);
}

// --- GSD-T Overlay Enrichment ---

function enrichWithOverlay(cgcResults, projectRoot) {
  if (!cgcResults || !Array.isArray(cgcResults)) return [];

  const contracts = store.readContracts(projectRoot);
  const requirements = store.readRequirements(projectRoot);
  const tests = store.readTests(projectRoot);
  const surfaces = store.readSurfaces(projectRoot);

  return cgcResults.map(entity => {
    const id = entity.id || `${entity.file}:${entity.line}:${entity.name}`;
    const contractMap = contracts.mappings.find(
      m => m.entity === id
    );
    const reqMap = requirements.mappings.find(
      m => m.entity === id
    );
    const testMaps = tests.mappings.filter(
      m => m.entity === id
    );
    const surfaceMap = surfaces.mappings.find(
      m => m.entity === id
    );

    return {
      ...entity,
      id,
      contract: contractMap ? contractMap.contract : null,
      requirement: reqMap ? reqMap.requirement : null,
      tests: testMaps,
      surfaces: surfaceMap ? surfaceMap.surfaces : []
    };
  });
}

// --- Normalize CGC Results to GSD-T Entity Shape ---

function normalizeEntity(cgcEntity) {
  const name = cgcEntity.name || cgcEntity.function_name
    || cgcEntity.caller_function || cgcEntity.symbol || '';
  const file = cgcEntity.file_path || cgcEntity.caller_file_path
    || cgcEntity.path || '';
  const line = cgcEntity.line_number || cgcEntity.caller_line_number
    || cgcEntity.line || 0;
  return {
    id: `${file}:${line}:${name}`,
    name,
    type: cgcEntity.type || cgcEntity.kind || 'function',
    file,
    line,
    domain: null,
    exported: cgcEntity.exported !== false,
    complexity: cgcEntity.complexity || cgcEntity.cyclomatic_complexity || null,
    source: cgcEntity.source || null,
    callArgs: cgcEntity.call_args || null,
    callLine: cgcEntity.call_line_number || null
  };
}

function normalizeResults(cgcResult) {
  if (!cgcResult) return null;

  // Direct array
  if (Array.isArray(cgcResult)) {
    return cgcResult.map(normalizeEntity);
  }

  // CGC wraps in .results which can be object or array
  const r = cgcResult.results;
  if (r) {
    // find_callers/callees: results.results[]
    if (r.results && Array.isArray(r.results)) {
      return r.results.map(normalizeEntity);
    }
    // dead_code: results.potentially_unused_functions[]
    if (r.potentially_unused_functions) {
      return r.potentially_unused_functions.map(normalizeEntity);
    }
    // find_code: results.functions_by_name[]
    if (r.functions_by_name) {
      return r.functions_by_name.map(normalizeEntity);
    }
    // find_code: results.functions_containing[]
    if (r.functions_containing) {
      return r.functions_containing.map(normalizeEntity);
    }
    // Direct array of results (complexity)
    if (Array.isArray(r)) {
      return r.map(normalizeEntity);
    }
  }

  // Legacy shapes
  if (cgcResult.functions) {
    return cgcResult.functions.map(normalizeEntity);
  }
  if (cgcResult.dead_code) {
    return cgcResult.dead_code.map(normalizeEntity);
  }
  if (cgcResult.matches) {
    return cgcResult.matches.map(normalizeEntity);
  }
  return null;
}

// --- Provider Interface ---

const cgcProvider = {
  name: 'cgc',
  priority: 1,
  _projectRoot: null,
  setProjectRoot(root) { this._projectRoot = root; },

  available() {
    return checkCgcHealth().available;
  },

  query(type, params, projectRoot) {
    const root = projectRoot || this._projectRoot;

    switch (type) {
      case 'getCallers': {
        const result = cgcQuery('analyze_code_relationships', {
          query_type: 'find_callers',
          target: params.entity
        });
        const entities = normalizeResults(result);
        return entities
          ? enrichWithOverlay(entities, root) : null;
      }

      case 'getTransitiveCallers': {
        const result = cgcQuery('analyze_code_relationships', {
          query_type: 'find_all_callers',
          target: params.entity
        });
        const entities = normalizeResults(result);
        return entities
          ? enrichWithOverlay(entities, root) : null;
      }

      case 'getCallees': {
        const result = cgcQuery('analyze_code_relationships', {
          query_type: 'find_callees',
          target: params.entity
        });
        const entities = normalizeResults(result);
        return entities
          ? enrichWithOverlay(entities, root) : null;
      }

      case 'getTransitiveCallees': {
        const result = cgcQuery('analyze_code_relationships', {
          query_type: 'find_all_callees',
          target: params.entity
        });
        const entities = normalizeResults(result);
        return entities
          ? enrichWithOverlay(entities, root) : null;
      }

      case 'findDeadCode': {
        const result = cgcQuery('find_dead_code', {
          exclude_decorated_with: params.exclude || []
        });
        const entities = normalizeResults(result);
        return entities
          ? enrichWithOverlay(entities, root) : null;
      }

      case 'findComplexFunctions': {
        const result = cgcQuery('find_most_complex_functions', {
          top_n: params.limit || 20
        });
        return normalizeResults(result);
      }

      case 'getComplexity': {
        const result = cgcQuery('calculate_cyclomatic_complexity', {
          function_name: params.name,
          file_path: params.file || undefined
        });
        return result;
      }

      case 'findDuplicates': {
        const result = cgcQuery('find_code', {
          query: params.target || '*',
          fuzzy_search: true,
          edit_distance: 2
        });
        return normalizeResults(result);
      }

      case 'findCircularDeps': {
        const result = cgcQuery('execute_cypher_query', {
          cypher_query: `MATCH path = (a:Function)-[:CALLS*2..${params.maxDepth || 5}]->(a) RETURN a.name AS name, a.path AS file, a.line_number AS line LIMIT 20`
        });
        if (!result) return null;
        return Array.isArray(result)
          ? result.map(normalizeEntity)
          : [];
      }

      case 'getEntity': {
        const result = cgcQuery('find_code', {
          query: params.name,
          fuzzy_search: false
        });
        const entities = normalizeResults(result);
        return entities && entities.length > 0
          ? enrichWithOverlay([entities[0]], root)[0]
          : null;
      }

      case 'getCallChain': {
        const result = cgcQuery('analyze_code_relationships', {
          query_type: 'call_chain',
          target: params.from,
          context: params.to
        });
        return normalizeResults(result);
      }

      case 'getModuleDeps': {
        const result = cgcQuery('analyze_code_relationships', {
          query_type: 'module_deps',
          target: params.module
        });
        return normalizeResults(result);
      }

      case 'getClassHierarchy': {
        const result = cgcQuery('analyze_code_relationships', {
          query_type: 'class_hierarchy',
          target: params.className
        });
        return normalizeResults(result);
      }

      case 'getStats': {
        return cgcQuery('get_repository_stats', {});
      }

      case 'cypher': {
        return cgcQuery('execute_cypher_query', {
          cypher_query: params.query
        });
      }

      default:
        return null;
    }
  }
};

module.exports = {
  cgcProvider, checkCgcHealth, resetHealthCache,
  cgcQuery, enrichWithOverlay, normalizeEntity,
  normalizeResults, findCgcCommand, sendToolCallSync,
  stopCgcServer
};
