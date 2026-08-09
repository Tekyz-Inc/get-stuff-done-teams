'use strict';

/**
 * GSD-T CLI Preflight (M55 D1)
 *
 * Pluggable, deterministic, zero-dep state-precondition library + thin CLI.
 *
 * Pure inspector — no LLM spawn, no token spend, no side effects beyond reading
 * the filesystem and running a small fixed list of read-only `git` / `lsof`
 * commands inside individual checks.
 *
 * Contract: .gsd-t/contracts/cli-preflight-contract.md v1.0.0 STABLE.
 *
 * Hard rules (mirroring bin/parallelism-report.cjs):
 *   1. Zero external runtime deps. Only Node built-ins.
 *   2. Synchronous public API; never throws to the caller.
 *   3. Per-check throws are caught, recorded, do not abort the run.
 *   4. Deterministic output — sort `checks[]` by id, sort `notes[]`.
 *   5. captureSpawn-exempt — see contract § captureSpawn Exemption.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = '1.0.0';
const CHECKS_DIR_NAME = 'cli-preflight-checks';
const VALID_SEVERITIES = new Set(['error', 'warn', 'info']);

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {string} [opts.projectDir='.']
 * @param {string[]} [opts.checks]   restrict to these check ids (default = all built-ins)
 * @param {string} [opts.mode='json'] informational; envelope is identical
 * @returns {{ ok: boolean, schemaVersion: string, checks: object[], notes: string[] }}
 */
function runPreflight(opts) {
  opts = opts || {};
  const projectDir = opts.projectDir || '.';
  const restrict = Array.isArray(opts.checks) ? new Set(opts.checks) : null;
  const notes = [];

  const registry = _loadRegistry(notes);

  const selected = restrict
    ? registry.filter((c) => restrict.has(c.id))
    : registry;

  const checkResults = [];
  for (const check of selected) {
    const result = _runOneCheck(check, { projectDir }, notes);
    checkResults.push(result);
  }

  // Sort checks by id, ascending. Sort notes ascending.
  checkResults.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  notes.sort();

  const ok = !checkResults.some((c) => c.ok === false && c.severity === 'error');

  return {
    schemaVersion: SCHEMA_VERSION,
    ok,
    checks: checkResults,
    notes,
  };
}

/**
 * Render an envelope as a human-readable text summary.
 * @param {object} envelope
 * @returns {string}
 */
function renderText(envelope) {
  const lines = [];
  const status = envelope.ok ? 'OK' : 'FAIL';
  lines.push('cli-preflight: ' + status + ' (schema v' + envelope.schemaVersion + ')');
  lines.push('');
  for (const c of envelope.checks) {
    const icon = c.ok ? '✓' : (c.severity === 'error' ? '✗' : '!');
    lines.push('  ' + icon + ' [' + c.severity.padEnd(5) + '] ' + c.id + ' — ' + c.msg);
  }
  if (envelope.notes && envelope.notes.length) {
    lines.push('');
    lines.push('Notes:');
    for (const n of envelope.notes) lines.push('  - ' + n);
  }
  return lines.join('\n');
}

// ── Internal helpers ────────────────────────────────────────────────────────

function _loadRegistry(notes) {
  const dir = path.join(__dirname, CHECKS_DIR_NAME);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    notes.push('registry: checks dir unreadable (' + (err && err.message || err) + ')');
    return [];
  }

  const checks = [];
  for (const filename of entries) {
    if (!filename.endsWith('.cjs')) continue;
    const full = path.join(dir, filename);
    let mod;
    try {
      mod = require(full);
    } catch (err) {
      notes.push('registry: ' + filename + ' load failed (' + (err && err.message || err) + ')');
      continue;
    }
    if (!_isValidCheckModule(mod, filename)) {
      notes.push('registry: ' + filename + ' malformed');
      continue;
    }
    checks.push(mod);
  }
  // Sort registry deterministically too — order of execution doesn't affect
  // output (results are sorted again before return) but stable order makes
  // notes ordering predictable.
  checks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return checks;
}

function _isValidCheckModule(mod, filename) {
  if (!mod || typeof mod !== 'object') return false;
  if (typeof mod.id !== 'string' || !mod.id.length) return false;
  if (!VALID_SEVERITIES.has(mod.severity)) return false;
  if (typeof mod.run !== 'function') return false;
  // Filename stem must match id, so a directory scan = a stable id namespace.
  const stem = filename.replace(/\.cjs$/, '');
  if (stem !== mod.id) return false;
  return true;
}

function _runOneCheck(check, ctx, notes) {
  let raw;
  try {
    raw = check.run(ctx);
  } catch (err) {
    const msg = 'check threw: ' + (err && err.message || String(err));
    notes.push(check.id + ': ' + msg);
    return {
      id: check.id,
      ok: false,
      severity: check.severity,
      msg,
    };
  }

  if (!raw || typeof raw !== 'object' || typeof raw.ok !== 'boolean') {
    const msg = 'check returned invalid shape';
    notes.push(check.id + ': ' + msg);
    return {
      id: check.id,
      ok: false,
      severity: check.severity,
      msg,
    };
  }

  const out = {
    id: check.id,
    ok: raw.ok,
    severity: check.severity,
    msg: typeof raw.msg === 'string' ? raw.msg : '',
  };
  if (raw.details && typeof raw.details === 'object' && Object.keys(raw.details).length > 0) {
    out.details = raw.details;
  }
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function _parseArgv(argv) {
  const out = { projectDir: '.', mode: 'json', skip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') {
      out.projectDir = argv[++i] || '.';
    } else if (a === '--json') {
      out.mode = 'json';
    } else if (a === '--text') {
      out.mode = 'text';
    } else if (a === '--skip') {
      const list = argv[++i] || '';
      out.skip = list.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function _printHelp() {
  const lines = [
    'Usage: node bin/cli-preflight.cjs [options]',
    '',
    'Options:',
    '  --project DIR     Project root (default: .)',
    '  --json            Print JSON envelope (default)',
    '  --text            Print human-readable summary',
    '  --skip id1,id2    Skip listed checks (each appends a note)',
    '  --help            Show this help',
    '',
    'Exit codes:',
    '  0  preflight ok',
    '  4  preflight failed (>=1 error-severity check failed)',
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

function _runCli(argv) {
  const args = _parseArgv(argv);
  if (args.help) {
    _printHelp();
    return 0;
  }

  // Build initial registry to know what's available, then filter via --skip.
  const noteSink = [];
  const registry = _loadRegistry(noteSink);
  const allIds = registry.map((c) => c.id);
  const skipSet = new Set(args.skip);
  const selected = allIds.filter((id) => !skipSet.has(id));

  const envelope = runPreflight({
    projectDir: args.projectDir,
    checks: selected,
    mode: args.mode,
  });

  // Append `--skip` notes deterministically.
  for (const id of args.skip) {
    envelope.notes.push('skipped: ' + id);
  }
  envelope.notes.sort();

  if (args.mode === 'text') {
    process.stdout.write(renderText(envelope) + '\n');
  } else {
    process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  }
  return envelope.ok ? 0 : 4;
}

if (require.main === module) {
  const code = _runCli(process.argv.slice(2));
  process.exit(code);
}

module.exports = {
  runPreflight,
  renderText,
  SCHEMA_VERSION,
  // Exposed for unit tests only; not part of the public contract.
  _loadRegistry,
  _isValidCheckModule,
  _runOneCheck,
  _parseArgv,
};
