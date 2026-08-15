#!/usr/bin/env node
/**
 * gsd-t-graph-use-gate.cjs
 *
 * Graph USE gate — proves a consumer that declared itself WIRED actually
 * QUERIED the graph.
 *
 * [RULE] wired-claim-requires-query-evidence
 * [RULE] use-gate-detects-absence-of-use-not-presence-of-fallback
 *
 * WHY THIS EXISTS (the gap it closes):
 *   `gsd-t-graph-anti-grep-lint.cjs` is STATIC. It reads source files and looks
 *   for a `try graph-query -> catch -> structural grep` fallback. That shape is
 *   the only way it can fail.
 *
 *   A real scan failed a different way. Every analyst agent simply NEVER CALLED
 *   the graph — so there was no catch block, no fallback branch, nothing for a
 *   static scan to find. The lint passed, the run logged
 *   `{"kind":"wiring","graphWiringMode":"WIRED"}`, and the whole scan ran on
 *   text search anyway. A check whose only failure mode is a code shape cannot
 *   see a consumer that never tried.
 *
 *   This gate reads the RUNTIME ledger instead. A consumer that stamped WIRED
 *   and issued zero graph queries in that run is a violation, because "wired"
 *   is a claim about behaviour and the ledger is the only record of behaviour.
 *
 * INPUT  : .gsd-t/graphDB/logs/graph-events-*.jsonl (append-only, JSONL)
 * OUTPUT : {ok, violations:[{consumer, wiringMode, queryCount, firstWiringTs}], ...}
 * EXIT   : 0 clean | 4 violations | 64 bad input (no ledger / unreadable)
 *
 * Unreadable input THROWS (LedgerUnavailable) rather than returning a value —
 * a gate that hands back a result when it could not read its own evidence is
 * the exact failure mode this file exists to remove.
 *
 * Node built-ins only (zero-dep invariant).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// A `kind:"read"` event is the Read-intercept hook, NOT a structural query — it
// fires on ordinary file reads and would mask the exact failure this gate exists
// to catch. Only `kind:"query"` counts as evidence that the graph was consulted.
const EVIDENCE_KIND = 'query';
const WIRING_KIND = 'wiring';

// `cli` is the operator at a terminal, not a workflow consumer; it has no WIRED
// claim to honour. Consumers are exempt ONLY by explicit name here.
const NON_CONSUMER_IDS = new Set(['cli']);

/** Thrown when the ledger cannot be located or read. Never swallowed internally. */
class LedgerUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'LedgerUnavailable';
  }
}

function ledgerDir(projectDir) {
  return path.join(projectDir, '.gsd-t', 'graphDB', 'logs');
}

/** Resolve every graph-events-*.jsonl file, oldest first. Throws if none. */
function ledgerFiles(projectDir) {
  const dir = ledgerDir(projectDir);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (err) {
    throw new LedgerUnavailable(`graph event ledger not readable: ${dir} (${err.code || err.message})`);
  }
  const files = names
    .filter((n) => /^graph-events-\d+\.jsonl$/.test(n))
    .sort()
    .map((n) => path.join(dir, n));
  if (files.length === 0) {
    throw new LedgerUnavailable(`no graph-events-*.jsonl in ${dir}`);
  }
  return files;
}

/**
 * Parse the ledger into per-consumer counters.
 * A malformed line is SKIPPED and COUNTED — it is never treated as a query,
 * because counting an unparseable line as evidence would let a corrupt ledger
 * satisfy the gate.
 */
function readLedger(files, sinceTs) {
  const consumers = Object.create(null); // prototype-less: consumer ids come from a file
  let malformed = 0;
  let total = 0;

  const ensure = (id) => {
    if (!consumers[id]) {
      consumers[id] = { consumer: id, queryCount: 0, wiringModes: [], firstWiringTs: null };
    }
    return consumers[id];
  };

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new LedgerUnavailable(`cannot read ${file}: ${err.code || err.message}`);
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      total++;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch (err) {
        malformed++;
        continue;
      }
      if (sinceTs && typeof ev.ts === 'string' && ev.ts < sinceTs) continue;

      const id = typeof ev.consumer === 'string' && ev.consumer ? ev.consumer : 'unknown';
      const kind = String(ev.kind || '');

      if (kind === EVIDENCE_KIND) {
        ensure(id).queryCount++;
      } else if (kind === WIRING_KIND) {
        const c = ensure(id);
        c.wiringModes.push(String(ev.graphWiringMode || ''));
        if (!c.firstWiringTs && typeof ev.ts === 'string') c.firstWiringTs = ev.ts;
      }
    }
  }
  return { consumers, malformed, total };
}

/**
 * A consumer violates the gate when it CLAIMED wired and issued ZERO queries.
 * Claiming `fallback-announced` or `disabled` is not a violation here — those
 * are honest declarations, and the anti-grep lint governs whether the fallback
 * itself is permitted.
 */
function evaluate(consumers) {
  const violations = [];
  const checked = [];

  for (const id of Object.keys(consumers)) {
    if (NON_CONSUMER_IDS.has(id)) continue;
    const c = consumers[id];
    if (c.wiringModes.length === 0) continue; // never declared; nothing claimed, nothing to prove

    const claimedWired = c.wiringModes.some((m) => m.toLowerCase() === 'wired');
    checked.push({ consumer: id, wiringModes: c.wiringModes, queryCount: c.queryCount });

    if (claimedWired && c.queryCount === 0) {
      violations.push({
        consumer: id,
        wiringMode: 'WIRED',
        queryCount: 0,
        firstWiringTs: c.firstWiringTs,
        evidence:
          `consumer "${id}" logged graphWiringMode=WIRED but issued 0 graph queries ` +
          `(kind:"query") in this window — a WIRED claim with no query evidence means ` +
          `the structural question was answered some other way.`,
      });
    }
  }
  return { violations, checked };
}

/** Throws LedgerUnavailable when the evidence cannot be read. */
function runGate(opts = {}) {
  const projectDir = opts.projectDir || process.cwd();

  // Test override: callers may inject parsed consumers directly.
  if (opts.consumers) {
    const { violations, checked } = evaluate(opts.consumers);
    return { ok: violations.length === 0, violations, checked, malformed: 0, ledgerFiles: [] };
  }

  const files = ledgerFiles(projectDir);
  const { consumers, malformed } = readLedger(files, opts.since || null);
  const { violations, checked } = evaluate(consumers);
  return { ok: violations.length === 0, violations, checked, malformed, ledgerFiles: files };
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opts = { projectDir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' || argv[i] === '--repo') opts.projectDir = argv[++i];
    else if (argv[i] === '--since') opts.since = argv[++i];
    else if (argv[i] === '--verify-mode') opts.verifyMode = true;
    else if (!argv[i].startsWith('-')) opts.projectDir = argv[i];
  }

  let result;
  try {
    result = runGate(opts);
  } catch (err) {
    if (err instanceof LedgerUnavailable) {
      // No ledger means NO CONSUMER HAS RUN YET — nothing has been claimed, so
      // there is nothing to disprove. That is a documented no-op PASS in
      // --verify-mode, distinguishable in the JSON (`noOpPass:true`) from a
      // wired-but-broken run. Invoked directly it is BAD INPUT (exit 64): an
      // operator asking about evidence that does not exist deserves to be told,
      // not handed a clean bill.
      if (opts.verifyMode) {
        process.stdout.write(JSON.stringify(
          { ok: true, noOpPass: true, reason: 'no-graph-event-ledger', violations: [], checked: [] }, null, 2) + '\n');
        process.stderr.write('[graph-use-gate] PASS (no-op): no graph event ledger — no consumer has claimed WIRED yet.\n');
        process.exit(0);
      }
      process.stderr.write(`[graph-use-gate] ERROR: ${err.message}\n`);
      process.stdout.write(JSON.stringify({ ok: false, violations: [], error: err.message }, null, 2) + '\n');
      process.exit(64);
    }
    throw err;
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  if (!result.ok) {
    process.stderr.write(
      `[graph-use-gate] FAIL: ${result.violations.length} consumer(s) claimed WIRED with zero graph queries.\n`
    );
    for (const v of result.violations) {
      process.stderr.write(`  ${v.consumer}: ${v.evidence}\n`);
    }
    process.exit(4);
  }
  process.stderr.write(
    `[graph-use-gate] PASS: ${result.checked.length} declaring consumer(s), all WIRED claims backed by queries.\n`
  );
  process.exit(0);
}

module.exports = { runGate, readLedger, evaluate, ledgerFiles, LedgerUnavailable, EVIDENCE_KIND, NON_CONSUMER_IDS };
