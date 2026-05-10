'use strict';

/**
 * GSD-T Context Brief Generator (M55 D4)
 *
 * Pluggable, deterministic, zero-dep context-brief library + thin CLI.
 *
 * Pure inspector — no LLM spawn, no token spend, no side effects beyond reading
 * the filesystem, running read-only `git` commands inside per-kind collectors,
 * and (optionally) writing the resulting brief JSON to `--out`.
 *
 * Contract: .gsd-t/contracts/context-brief-contract.md v1.0.0 STABLE.
 *
 * Hard rules (mirroring bin/cli-preflight.cjs / bin/parallelism-report.cjs):
 *   1. Zero external runtime deps. Only Node built-ins.
 *   2. Synchronous public API.
 *   3. Per-kind throws are caught and surface as a structured error.
 *   4. Deterministic output — sorted arrays, alphabetical JSON keys.
 *   5. captureSpawn-exempt — see contract § captureSpawn Exemption.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = '1.0.0';
const MAX_BRIEF_BYTES = 10240;
const KINDS_DIR_NAME = 'gsd-t-context-brief-kinds';
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

const FAIL_CLOSED_KINDS = new Set(['qa', 'red-team', 'design-verify']);

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Synchronously assemble a context brief.
 *
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {string} opts.kind        one of KINDS
 * @param {string|null} [opts.domain]
 * @param {string} opts.spawnId
 * @param {boolean} [opts.strict=false]   upgrade fail-open kinds to fail-closed
 * @param {Date} [opts.now]               injected for tests / determinism
 * @returns {object} brief envelope
 */
function generateBrief(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('generateBrief: opts required');
  }
  const projectDir = typeof opts.projectDir === 'string' && opts.projectDir.length
    ? opts.projectDir
    : '.';
  const kind = opts.kind;
  const domain = (typeof opts.domain === 'string' && opts.domain.length) ? opts.domain : null;
  const spawnId = opts.spawnId;
  const strict = !!opts.strict;
  const now = opts.now instanceof Date ? opts.now : new Date();

  if (typeof kind !== 'string' || !kind.length) {
    throw new Error('generateBrief: kind required');
  }
  if (typeof spawnId !== 'string' || !spawnId.length) {
    throw new Error('generateBrief: spawnId required');
  }
  if (!SAFE_NAME_RE.test(spawnId)) {
    throw new Error('generateBrief: spawnId contains unsafe characters (allowed: [a-zA-Z0-9_-])');
  }
  if (domain != null && !SAFE_NAME_RE.test(domain)) {
    throw new Error('generateBrief: domain contains unsafe characters (allowed: [a-zA-Z0-9_-])');
  }

  const registry = loadKindRegistry();
  const kindMod = registry.find((k) => k.name === kind);
  if (!kindMod) {
    throw new Error('generateBrief: unknown kind "' + kind + '" (known: ' +
      registry.map((k) => k.name).sort().join(',') + ')');
  }

  // sourceMtimes is gathered via the recorder helper passed into the collector.
  const sourceMtimes = {};
  function recordSource(relPath) {
    if (typeof relPath !== 'string' || !relPath.length) return null;
    const full = path.join(projectDir, relPath);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { return null; }
    sourceMtimes[relPath] = new Date(stat.mtimeMs).toISOString();
    return stat;
  }

  // Required-source check (fail-closed kinds)
  const missingRequired = [];
  for (const req of (kindMod.requiresSources || [])) {
    const full = path.join(projectDir, req);
    if (!fs.existsSync(full)) missingRequired.push(req);
  }
  const isFailClosedKind = FAIL_CLOSED_KINDS.has(kind);
  if (missingRequired.length && (isFailClosedKind || strict)) {
    const err = new Error('generateBrief: required source(s) missing for kind=' + kind +
      ': ' + missingRequired.sort().join(', '));
    err.code = 'EREQUIRED_MISSING';
    err.missing = missingRequired.slice().sort();
    throw err;
  }

  let collected;
  try {
    collected = kindMod.collect({
      projectDir,
      kind,
      domain,
      spawnId,
      strict,
      recordSource,
    });
  } catch (err) {
    // Preserve structured failures (EREQUIRED_MISSING from OR-required kinds
    // such as design-verify) so the CLI can map them to exit 4.
    if (err && err.code === 'EREQUIRED_MISSING') throw err;
    const wrapped = new Error('generateBrief: kind "' + kind + '" collector threw: ' +
      (err && err.message || String(err)));
    wrapped.cause = err;
    throw wrapped;
  }

  if (!collected || typeof collected !== 'object') {
    throw new Error('generateBrief: kind "' + kind + '" collector returned non-object');
  }

  // Branch detection (read-only). Captured at the library level, not per-kind,
  // so all briefs share a uniform branch field.
  const branch = _gitCurrentBranch(projectDir);

  const brief = {
    ancillary: _normalizeAncillary(collected.ancillary),
    branch: branch || '',
    constraints: _normalizeConstraints(collected.constraints),
    contracts: _normalizeContracts(collected.contracts),
    domain,
    generatedAt: now.toISOString(),
    kind,
    schemaVersion: SCHEMA_VERSION,
    scope: _normalizeScope(collected.scope),
    sourceMtimes: _sortObjectKeys(sourceMtimes),
    spawnId,
  };

  // Hard cap enforcement at write-time.
  const serialized = stableStringify(brief);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BRIEF_BYTES) {
    const err = new Error('brief exceeds MAX_BRIEF_BYTES (' + Buffer.byteLength(serialized, 'utf8') +
      ' > ' + MAX_BRIEF_BYTES + ')');
    err.code = 'EBRIEF_TOO_LARGE';
    throw err;
  }

  return brief;
}

/**
 * Discover and load all kind collector modules from
 * `bin/gsd-t-context-brief-kinds/*.cjs`.
 * @returns {Array<{name:string, requiresSources:string[], collect:Function}>}
 */
function loadKindRegistry() {
  const dir = path.join(__dirname, KINDS_DIR_NAME);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_) {
    return [];
  }
  const out = [];
  for (const filename of entries) {
    if (!filename.endsWith('.cjs')) continue;
    const full = path.join(dir, filename);
    let mod;
    try { mod = require(full); } catch (_) { continue; }
    if (!_isValidKindModule(mod, filename)) continue;
    out.push(mod);
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

const KINDS = ['design-verify', 'discuss', 'execute', 'impact', 'milestone', 'partition', 'plan', 'qa', 'red-team', 'scan', 'verify'];

/**
 * Deterministic JSON stringifier — alphabetical keys at every nesting level,
 * arrays preserved in caller-supplied order. Used by `generateBrief` for
 * cap-check and by the test suite for byte-identical assertions.
 * @param {*} value
 * @returns {string}
 */
function stableStringify(value) {
  return JSON.stringify(_canonicalize(value), null, 2);
}

// ── Internal helpers ────────────────────────────────────────────────────────

function _isValidKindModule(mod, filename) {
  if (!mod || typeof mod !== 'object') return false;
  if (typeof mod.name !== 'string' || !mod.name.length) return false;
  if (typeof mod.collect !== 'function') return false;
  if (mod.requiresSources != null && !Array.isArray(mod.requiresSources)) return false;
  // filename stem must match name
  const stem = filename.replace(/\.cjs$/, '');
  if (stem !== mod.name) return false;
  return true;
}

function _gitCurrentBranch(projectDir) {
  try {
    const { execSync } = require('child_process');
    const stdout = execSync('git branch --show-current', {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(stdout || '').trim();
  } catch (_) {
    return '';
  }
}

function _normalizeScope(scope) {
  const s = scope && typeof scope === 'object' ? scope : {};
  return {
    deliverables: _sortStringArray(s.deliverables),
    notOwned: _sortStringArray(s.notOwned),
    owned: _sortStringArray(s.owned),
  };
}

function _normalizeConstraints(c) {
  return _sortStringArray(c);
}

function _normalizeContracts(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    out.push({
      path: typeof item.path === 'string' ? item.path : '',
      status: typeof item.status === 'string' ? item.status : 'UNKNOWN',
    });
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

function _normalizeAncillary(a) {
  if (!a || typeof a !== 'object') return {};
  // Recursively canonicalize ancillary objects so JSON is deterministic.
  return _canonicalize(a);
}

function _sortStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  const xs = arr.filter((v) => typeof v === 'string');
  xs.sort();
  return xs;
}

function _sortObjectKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

function _canonicalize(v) {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map(_canonicalize);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = _canonicalize(v[k]);
    return out;
  }
  return v;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function _parseArgv(argv) {
  const out = { projectDir: '.', mode: 'json', strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--kind') out.kind = argv[++i];
    else if (a === '--domain') out.domain = argv[++i];
    else if (a === '--spawn-id') out.spawnId = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--project') out.projectDir = argv[++i] || '.';
    else if (a === '--json') out.mode = 'json';
    else if (a === '--strict') out.strict = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function _printHelp(stream) {
  const lines = [
    'Usage: node bin/gsd-t-context-brief.cjs --kind X --spawn-id Y [options]',
    '',
    'Options:',
    '  --kind X          one of: execute|verify|qa|red-team|design-verify|scan',
    '  --domain Y        domain id, [a-zA-Z0-9_-]+ (required for execute/verify/qa/red-team)',
    '  --spawn-id Z      spawn id, [a-zA-Z0-9_-]+ (required)',
    '  --out PATH        write brief to file (default: stdout)',
    '  --json            JSON output to stdout (default)',
    '  --strict          fail-closed on any missing source',
    '  --project DIR     project root (default: .)',
    '  --help, -h        show this help',
    '',
    'Exit codes:',
    '  0  brief generated',
    '  2  CLI usage error / path-safety reject',
    '  4  required source missing OR --strict missing source OR over-cap',
  ];
  (stream || process.stdout).write(lines.join('\n') + '\n');
}

function _runCli(argv) {
  const args = _parseArgv(argv);
  if (args.help) { _printHelp(); return 0; }

  if (typeof args.kind !== 'string' || !args.kind.length) {
    process.stderr.write('error: --kind is required\n');
    return 2;
  }
  if (typeof args.spawnId !== 'string' || !args.spawnId.length) {
    process.stderr.write('error: --spawn-id is required\n');
    return 2;
  }
  if (!SAFE_NAME_RE.test(args.spawnId)) {
    process.stderr.write('error: --spawn-id must match [a-zA-Z0-9_-]+ (got: ' + JSON.stringify(args.spawnId) + ')\n');
    return 2;
  }
  if (args.domain != null && !SAFE_NAME_RE.test(args.domain)) {
    process.stderr.write('error: --domain must match [a-zA-Z0-9_-]+ (got: ' + JSON.stringify(args.domain) + ')\n');
    return 2;
  }

  let brief;
  try {
    brief = generateBrief({
      projectDir: args.projectDir,
      kind: args.kind,
      domain: args.domain || null,
      spawnId: args.spawnId,
      strict: args.strict,
    });
  } catch (err) {
    process.stderr.write('error: ' + (err && err.message || String(err)) + '\n');
    if (err && (err.code === 'EREQUIRED_MISSING' || err.code === 'EBRIEF_TOO_LARGE')) return 4;
    // Unknown-kind / unsafe-input / other usage errors → exit 2.
    if (err && /unsafe|required|unknown|spawnId|domain/i.test(err.message)) return 2;
    return 4;
  }

  const json = stableStringify(brief);
  if (args.out) {
    try {
      fs.mkdirSync(path.dirname(args.out), { recursive: true });
      fs.writeFileSync(args.out, json + '\n');
    } catch (err) {
      process.stderr.write('error: failed to write --out: ' + (err && err.message || err) + '\n');
      return 4;
    }
  } else {
    process.stdout.write(json + '\n');
  }
  return 0;
}

if (require.main === module) {
  const code = _runCli(process.argv.slice(2));
  process.exit(code);
}

module.exports = {
  generateBrief,
  loadKindRegistry,
  stableStringify,
  SCHEMA_VERSION,
  MAX_BRIEF_BYTES,
  KINDS,
  // Test-only exports
  _parseArgv,
  _isValidKindModule,
  _canonicalize,
  _gitCurrentBranch,
  SAFE_NAME_RE,
  FAIL_CLOSED_KINDS,
};
