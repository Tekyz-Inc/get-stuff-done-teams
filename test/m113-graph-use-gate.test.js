'use strict';

/**
 * M113 — Graph USE gate.
 *
 * [RULE] wired-claim-requires-query-evidence
 * [RULE] use-gate-detects-absence-of-use-not-presence-of-fallback
 *
 * The gate exists because the STATIC anti-grep lint cannot see a consumer that
 * never queried the graph at all — there is no catch block and no fallback
 * branch to find. These tests therefore lead with the NEGATIVE case: a WIRED
 * claim with zero queries MUST fail. A gate that cannot fail is not a gate.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  runGate,
  evaluate,
  LedgerUnavailable,
  NON_CONSUMER_IDS,
} = require('../bin/gsd-t-graph-use-gate.cjs');

/** Build a throwaway project dir containing a ledger with the given lines. */
function fixtureProject(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-use-gate-'));
  const logs = path.join(dir, '.gsd-t', 'graphDB', 'logs');
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(
    path.join(logs, 'graph-events-001.jsonl'),
    lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n'
  );
  return dir;
}

// ─── THE NEGATIVE TEST (the reason this file exists) ─────────────────────────

test('FAILS when a consumer claims WIRED and issues zero queries', () => {
  const dir = fixtureProject([
    { kind: 'wiring', ts: '2026-08-13T14:28:36Z', consumer: 'scan', graphWiringMode: 'WIRED' },
    // 200 Read-intercept events must NOT count as evidence of a structural query.
    ...Array.from({ length: 200 }, () => ({ kind: 'read', consumer: 'scan', ts: '2026-08-13T14:29:00Z' })),
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.ok, false, 'WIRED + 0 queries must not pass');
  assert.strictEqual(r.violations.length, 1);
  assert.strictEqual(r.violations[0].consumer, 'scan');
  assert.strictEqual(r.violations[0].queryCount, 0);
});

test('a kind:"read" event is never accepted as query evidence', () => {
  const r = evaluate({
    scan: { consumer: 'scan', queryCount: 0, wiringModes: ['WIRED'], firstWiringTs: 't' },
  });
  assert.strictEqual(r.violations.length, 1, 'reads must not satisfy a WIRED claim');
});

// ─── The positive cases ──────────────────────────────────────────────────────

test('PASSES when a WIRED claim is backed by real queries', () => {
  const dir = fixtureProject([
    { kind: 'wiring', ts: '2026-08-13T14:28:36Z', consumer: 'scan', graphWiringMode: 'WIRED' },
    { kind: 'query', ts: '2026-08-13T14:28:40Z', consumer: 'scan', verb: 'who-calls', outcome: 'hit' },
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.violations.length, 0);
});

test('an honest fallback-announced declaration is not a violation', () => {
  const dir = fixtureProject([
    { kind: 'wiring', ts: '2026-08-13T14:28:36Z', consumer: 'integrate', graphWiringMode: 'fallback-announced' },
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.ok, true, 'declaring a fallback is honest; the anti-grep lint governs whether it is allowed');
});

test('WIRED matching is case-insensitive', () => {
  // The producer/consumer casing mismatch is a real prior outage in this repo.
  const r = evaluate({
    scan: { consumer: 'scan', queryCount: 0, wiringModes: ['wired'], firstWiringTs: 't' },
  });
  assert.strictEqual(r.violations.length, 1, 'lowercase "wired" must be caught too');
});

test('a consumer that never declared anything is not checked', () => {
  const r = evaluate({
    someTool: { consumer: 'someTool', queryCount: 0, wiringModes: [], firstWiringTs: null },
  });
  assert.strictEqual(r.violations.length, 0);
  assert.strictEqual(r.checked.length, 0);
});

test('"cli" is exempt — it is the operator, not a workflow consumer', () => {
  assert.ok(NON_CONSUMER_IDS.has('cli'));
  const r = evaluate({
    cli: { consumer: 'cli', queryCount: 0, wiringModes: ['WIRED'], firstWiringTs: 't' },
  });
  assert.strictEqual(r.violations.length, 0);
});

// ─── Bad input HALTS; it never passes ────────────────────────────────────────

test('a missing ledger THROWS rather than returning clean', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-use-gate-empty-'));
  assert.throws(() => runGate({ projectDir: dir }), LedgerUnavailable,
    'no ledger must halt — a gate that passes without evidence is the bug this closes');
});

test('--verify-mode: no ledger is a DOCUMENTED no-op PASS, distinguishable in JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-use-gate-verify-'));
  const r = spawnSync(process.execPath,
    [path.join(__dirname, '..', 'bin', 'gsd-t-graph-use-gate.cjs'), '--project', dir, '--verify-mode'],
    { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'a project that never ran a graph consumer must not fail verify');
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.noOpPass, true, 'the no-op PASS must be distinguishable from a wired-and-clean PASS');
  assert.strictEqual(out.reason, 'no-graph-event-ledger');
});

test('--verify-mode still FAILS a real WIRED-with-no-queries violation', () => {
  const dir = fixtureProject([
    { kind: 'wiring', ts: '2026-08-13T14:28:36Z', consumer: 'scan', graphWiringMode: 'WIRED' },
  ]);
  const r = spawnSync(process.execPath,
    [path.join(__dirname, '..', 'bin', 'gsd-t-graph-use-gate.cjs'), '--project', dir, '--verify-mode'],
    { encoding: 'utf8' });
  assert.strictEqual(r.status, 4, 'verify-mode must not soften a genuine violation');
});

test('a malformed line is counted, never treated as a query', () => {
  const dir = fixtureProject([
    { kind: 'wiring', ts: '2026-08-13T14:28:36Z', consumer: 'scan', graphWiringMode: 'WIRED' },
    '{ this is not json',
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.malformed, 1);
  assert.strictEqual(r.ok, false, 'a corrupt ledger must not satisfy the gate');
});

// ─── TD-395 (TimeTracking, 2026-09-03): attribution, not absence ─────────────
// [RULE] graph-use-attributes-unlabelled-queries-by-time
// A workflow claims WIRED under its own name; its workers' Bash-run queries land
// under the query CLI's default label "cli". 302 real queries were failed as zero.

test('unlabelled (cli) queries AFTER a WIRED claim count as that claimant\'s evidence', () => {
  const dir = fixtureProject([
    { ts: '2026-09-03T10:00:00Z', kind: 'wiring', consumer: 'phase', graphWiringMode: 'WIRED' },
    { ts: '2026-09-03T10:00:05Z', kind: 'query', consumer: 'cli', verb: 'who-calls' },
    { ts: '2026-09-03T10:00:09Z', kind: 'query', consumer: 'cli', verb: 'who-imports' },
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.violations.length, 0, 'the cli queries after the claim are the workflow consulting the graph');
  const phase = r.checked.find((c) => c.consumer === 'phase');
  assert.strictEqual(phase.queryCount, 0);
  assert.strictEqual(phase.attributedQueryCount, 2);
});

test('unlabelled queries BEFORE the claim are NOT evidence — nothing had claimed yet', () => {
  const dir = fixtureProject([
    { ts: '2026-09-03T09:00:00Z', kind: 'query', consumer: 'cli', verb: 'who-calls' },
    { ts: '2026-09-03T10:00:00Z', kind: 'wiring', consumer: 'phase', graphWiringMode: 'WIRED' },
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.violations.length, 1);
  assert.strictEqual(r.violations[0].consumer, 'phase');
  assert.strictEqual(r.violations[0].attributedQueryCount, 0);
});

test('a query by ANOTHER claimant is never borrowed — only unlabelled ids attribute', () => {
  const dir = fixtureProject([
    { ts: '2026-09-03T10:00:00Z', kind: 'wiring', consumer: 'phase', graphWiringMode: 'WIRED' },
    { ts: '2026-09-03T10:00:01Z', kind: 'wiring', consumer: 'verify', graphWiringMode: 'WIRED' },
    { ts: '2026-09-03T10:00:05Z', kind: 'query', consumer: 'verify', verb: 'who-calls' },
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.violations.length, 1, 'phase still has nothing; verify\'s own query is verify\'s');
  assert.strictEqual(r.violations[0].consumer, 'phase');
});

test('an unlabelled kind:"read" after the claim is still not evidence', () => {
  const dir = fixtureProject([
    { ts: '2026-09-03T10:00:00Z', kind: 'wiring', consumer: 'phase', graphWiringMode: 'WIRED' },
    { ts: '2026-09-03T10:00:05Z', kind: 'read', consumer: 'cli' },
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.violations.length, 1);
});

test('a WIRED claim with no timestamp cannot be placed in time — nothing is attributed to it', () => {
  const dir = fixtureProject([
    { ts: '2026-01-01T00:00:00Z', kind: 'query', consumer: 'cli', verb: 'who-calls' },
    { kind: 'wiring', consumer: 'verify', graphWiringMode: 'WIRED' },
  ]);
  const r = runGate({ projectDir: dir });
  assert.strictEqual(r.violations.length, 1, 'an untimestamped claim gets no evidence from earlier queries');
  assert.strictEqual(r.violations[0].attributedQueryCount, 0);
});
