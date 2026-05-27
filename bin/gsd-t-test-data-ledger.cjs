#!/usr/bin/env node
/**
 * gsd-t-test-data-ledger — M58 D1
 *
 * Append-only JSONL ledger tracking test data inserted during a Verify run,
 * plus a purge engine that removes those records from the underlying store
 * after the suite completes.
 *
 * Contract: .gsd-t/contracts/test-data-ledger-contract.md
 */

const fs = require('node:fs');
const path = require('node:path');

const LEDGER_RELPATH = path.join('.gsd-t', 'test-data-ledger.jsonl');

// ─── Adapter registry ─────────────────────────────────────────────────────

const adapters = new Map();

function registerAdapter(kind, adapter) {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new Error('registerAdapter: kind must be a non-empty string');
  }
  if (!adapter || typeof adapter.purge !== 'function') {
    throw new Error('registerAdapter: adapter must export a purge(...) function');
  }
  adapters.set(kind, adapter);
}

// Built-in adapters auto-register on module load.
registerAdapter('file-json-array', require('./gsd-t-test-data-adapters/file-json-array.cjs'));
registerAdapter('localStorage-key-prefix', require('./gsd-t-test-data-adapters/localstorage-key-prefix.cjs'));
registerAdapter('sqlite-table-where', require('./gsd-t-test-data-adapters/sqlite-table-where.cjs'));

// ─── Public API ───────────────────────────────────────────────────────────

function ledgerPathFor(projectDir) {
  return path.join(projectDir, LEDGER_RELPATH);
}

function appendInsert({ projectDir, runId, kind, store, id, taggedPrefix, insertedAt }) {
  if (typeof projectDir !== 'string' || projectDir.length === 0) {
    throw new Error('appendInsert: projectDir is required');
  }
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new Error('appendInsert: runId is required');
  }
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new Error('appendInsert: kind is required');
  }
  if (typeof store !== 'string' || store.length === 0) {
    throw new Error('appendInsert: store is required');
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('appendInsert: id is required');
  }
  const finalTaggedPrefix = typeof taggedPrefix === 'string' && taggedPrefix.length > 0
    ? taggedPrefix
    : 'E2E_';
  if (!id.startsWith(finalTaggedPrefix)) {
    throw new Error(`appendInsert: id "${id}" does not start with taggedPrefix "${finalTaggedPrefix}"`);
  }
  const finalInsertedAt = typeof insertedAt === 'string' && insertedAt.length > 0
    ? insertedAt
    : new Date().toISOString();

  const row = {
    runId,
    kind,
    store,
    id,
    taggedPrefix: finalTaggedPrefix,
    insertedAt: finalInsertedAt,
  };

  const ledgerPath = ledgerPathFor(projectDir);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(row) + '\n', 'utf8');
  return { ok: true, ledgerPath };
}

function listInserts({ projectDir, runId }) {
  if (typeof projectDir !== 'string' || projectDir.length === 0) {
    throw new Error('listInserts: projectDir is required');
  }
  const ledgerPath = ledgerPathFor(projectDir);
  if (!fs.existsSync(ledgerPath)) return [];
  const raw = fs.readFileSync(ledgerPath, 'utf8');
  const rows = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (runId && parsed.runId !== runId) continue;
      rows.push(parsed);
    } catch {
      // skip malformed lines (audit-trail is permissive)
    }
  }
  return rows;
}

async function purgeRunInserts({ projectDir, runId, dryRun }) {
  if (typeof projectDir !== 'string' || projectDir.length === 0) {
    throw new Error('purgeRunInserts: projectDir is required');
  }
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new Error('purgeRunInserts: runId is required');
  }
  const rows = listInserts({ projectDir, runId });
  const purged = [];
  const skipped = [];
  const errors = [];

  for (const row of rows) {
    if (dryRun === true) {
      purged.push(row); // dry-run treats every targeted row as 'would be purged'
      continue;
    }
    const adapter = adapters.get(row.kind);
    if (!adapter) {
      errors.push({ record: row, message: `no adapter registered for kind "${row.kind}"` });
      continue;
    }
    try {
      const result = await adapter.purge({
        store: row.store,
        id: row.id,
        taggedPrefix: row.taggedPrefix,
      });
      if (result === 'purged') {
        purged.push(row);
      } else if (result === 'absent') {
        skipped.push(row);
      } else {
        errors.push({ record: row, message: `adapter returned unexpected value "${String(result)}"` });
      }
    } catch (e) {
      errors.push({ record: row, message: e && e.message ? e.message : String(e) });
    }
  }

  return { purged, skipped, errors };
}

// ─── CLI ──────────────────────────────────────────────────────────────────

const COLOR = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

function parseArgs(argv) {
  const opts = {
    mode: null, // 'list' | 'purge'
    runId: null,
    dryRun: false,
    json: false,
    projectDir: process.cwd(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') opts.mode = 'list';
    else if (a === '--purge') opts.mode = 'purge';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--run' || a === '--run-id') {
      opts.runId = argv[++i] || null;
    } else if (a === '--project') {
      opts.projectDir = argv[++i] || process.cwd();
    } else if (a === '-h' || a === '--help') {
      opts.mode = 'help';
    }
  }
  return opts;
}

function printHelp() {
  process.stdout.write(`Usage: gsd-t test-data --list [--run <id>] [--json]
       gsd-t test-data --purge --run <id> [--dry-run] [--json]

Options:
  --list           List ledger entries (optionally filtered by --run)
  --purge          Purge ledger entries for a given --run
  --run <id>       Verify run id (e.g., verify-m58-20260527T091800Z)
  --dry-run        With --purge: report what would be purged without calling adapters
  --json           Emit JSON envelope instead of pretty output
  --project <dir>  Project directory (defaults to CWD)
  -h, --help       Show this help

Exit codes:
  0   success
  4   one or more adapter errors (purge mode)
  64  CLI argument error
`);
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.mode === 'help' || !opts.mode) {
    printHelp();
    return opts.mode === 'help' ? 0 : 64;
  }

  if (opts.mode === 'list') {
    const rows = listInserts({ projectDir: opts.projectDir, runId: opts.runId });
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ok: true, rows }) + '\n');
    } else {
      if (rows.length === 0) {
        process.stdout.write(`${COLOR.dim}No ledger entries${opts.runId ? ` for run "${opts.runId}"` : ''}.${COLOR.reset}\n`);
      } else {
        process.stdout.write(`${COLOR.bold}Test data ledger${opts.runId ? ` — run ${opts.runId}` : ''}${COLOR.reset}\n`);
        for (const r of rows) {
          process.stdout.write(`  ${COLOR.blue}${r.kind}${COLOR.reset} ${r.id} ${COLOR.dim}(${r.store})${COLOR.reset}\n`);
        }
        process.stdout.write(`\n${COLOR.bold}Total:${COLOR.reset} ${rows.length}\n`);
      }
    }
    return 0;
  }

  if (opts.mode === 'purge') {
    if (!opts.runId) {
      process.stderr.write('gsd-t test-data --purge requires --run <id>\n');
      return 64;
    }
    const envelope = await purgeRunInserts({
      projectDir: opts.projectDir,
      runId: opts.runId,
      dryRun: opts.dryRun,
    });
    if (opts.json) {
      process.stdout.write(JSON.stringify({
        ok: envelope.errors.length === 0,
        runId: opts.runId,
        dryRun: !!opts.dryRun,
        purged: envelope.purged.length,
        skipped: envelope.skipped.length,
        errors: envelope.errors,
      }) + '\n');
    } else {
      const tag = opts.dryRun ? '[DRY RUN] ' : '';
      process.stdout.write(`${COLOR.bold}${tag}Purge run ${opts.runId}${COLOR.reset}\n`);
      process.stdout.write(`  ${COLOR.green}purged:${COLOR.reset}  ${envelope.purged.length}\n`);
      process.stdout.write(`  ${COLOR.yellow}skipped:${COLOR.reset} ${envelope.skipped.length}\n`);
      process.stdout.write(`  ${COLOR.red}errors:${COLOR.reset}  ${envelope.errors.length}\n`);
      if (envelope.errors.length > 0) {
        process.stdout.write(`\n${COLOR.red}Errors:${COLOR.reset}\n`);
        for (const e of envelope.errors.slice(0, 5)) {
          process.stdout.write(`  - ${e.record.id} (${e.record.kind}): ${e.message}\n`);
        }
        if (envelope.errors.length > 5) {
          process.stdout.write(`  … and ${envelope.errors.length - 5} more\n`);
        }
      }
    }
    return envelope.errors.length === 0 ? 0 : 4;
  }

  printHelp();
  return 64;
}

module.exports = {
  appendInsert,
  listInserts,
  purgeRunInserts,
  registerAdapter,
  main,
  ledgerPathFor,
  LEDGER_RELPATH,
};

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`gsd-t test-data: ${err && err.message ? err.message : String(err)}\n`);
      process.exit(1);
    }
  );
}
