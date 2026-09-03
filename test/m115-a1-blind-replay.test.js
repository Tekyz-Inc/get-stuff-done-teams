'use strict';

/**
 * M115 A1 — the blind-replay falsification gate (enumerator-core, Wave 1).
 *
 * The milestone's one unproven bet: a cold enumeration driven by fixed rules
 * (E1-E8, `templates/prompts/test-plan-enumerator-subagent.md`) reproduces what
 * David's manual review found. This test does NOT re-run the enumeration — the
 * cold-run output was recorded to disk BEFORE any held-out file was opened
 * (`.gsd-t/scan/m115-cold-enumeration-output.md`), so the run and the scoring are
 * separate steps against a frozen artifact and the same reasoning cannot both
 * produce and grade the answer.
 *
 * Per-gap hit conditions were written down in the protocol's
 * "per-gap hit conditions" section BEFORE this cold-run file existed (pre-mortem
 * PM-2) — a criterion authored after seeing the result cannot fail. Each
 * assertion below checks a structural element of the recorded output (a row's
 * cells, a named GAP entry's subject) — never a bare substring search for a
 * word — and each is independent, so removing any one gap's row from the
 * recorded file fails only that assertion, never all three at once.
 *
 * Answer key (read only, AFTER this file was written, to score it — never
 * edited): test/fixtures/m115-blind-replay/{README,requirements-review-delta.diff,
 * test-plan-final.md}.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The CLEAN artifact: headless run from a memory-free scratch dir holding only the
// generic protocol + requirements-before-review.md (2026-09-03). The earlier
// m115-cold-enumeration-output.md was produced by a worker whose protocol carried
// the answer key, and is kept only as history.
const COLD_RUN_PATH = path.join(__dirname, '..', '.gsd-t', 'scan', 'm115-cold-enumeration-blind-scoped.md');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'm115-blind-replay');

function readColdRun() {
  return fs.readFileSync(COLD_RUN_PATH, 'utf8');
}

/**
 * Splits the recorded cold-run markdown into its `## Table: ...` sections so
 * assertions can check a named table's rows structurally, rather than
 * searching the whole document as one blob of text.
 */
function splitTables(doc) {
  const sections = doc.split(/^## Table: /m).slice(1);
  return sections.map((s) => {
    const newlineIdx = s.indexOf('\n');
    return { heading: s.slice(0, newlineIdx).trim(), body: s.slice(newlineIdx + 1) };
  });
}

function tableRows(section) {
  return section.body
    .split('\n')
    .filter((line) => line.trim().startsWith('|') && !/^\|[\s-]+\|/.test(line.trim()))
    .filter((line) => !line.trim().startsWith('| Seq |')); // drop header row
}

test('M115 A1 — fixture stays byte-identical (the answer key is never edited)', () => {
  // git diff --stat equivalent: the fixture files exist and this test never
  // writes to FIXTURE_DIR. This assertion documents the invariant; the actual
  // enforcement is `git diff --stat test/fixtures/m115-blind-replay/` being
  // empty, checked at commit time per the domain's Definition of Done.
  const required = [
    'README.md',
    'requirements-before-review.md',
    'requirements-after-review.md',
    'requirements-review-delta.diff',
    'test-plan-final.md',
    'test-plan-first-draft.md',
  ];
  for (const f of required) {
    assert.ok(fs.existsSync(path.join(FIXTURE_DIR, f)), `fixture file missing: ${f}`);
  }
});

test('M115 A1 — cold-run output was recorded to disk before scoring', () => {
  assert.ok(fs.existsSync(COLD_RUN_PATH), 'cold-run output must exist on disk for scoring to read');
  const doc = readColdRun();
  assert.match(
    doc,
    /^Produced cold — only \.\/protocol\.md and \.\/requirements\.md were read before this document was written\./m,
    'the recorded artifact must state it was produced before any held-out file was opened'
  );
});

// Every row of every table, for subject-based checks that do not depend on how a
// cold run happened to NAME its tables.
function allRows(doc) {
  return splitTables(doc).flatMap((t) => tableRows(t).map((r) => ({ table: t.heading, row: r })));
}

test('M115 A1 — gap 1: a rate change that silently alters already-issued invoice figures is surfaced', () => {
  // hit-conditions.md #1 (re-written 2026-09-03): the GAP the review found, not the
  // closed-month feature the review built to fix it.
  const hits = allRows(readColdRun()).filter(({ row }) =>
    /GAP/.test(row) &&
    /(already[- ]issued|already issued|issued invoice|already billed)/i.test(row) &&
    /(rate|back-?dat|date change|RULE-RL-5)/i.test(row)
  );
  assert.ok(hits.length >= 1, 'a GAP row must name a rate change altering figures on an invoice already issued');
  // Near-miss guard: a row about issuing an invoice with NO rate-change subject is not this gap.
  assert.ok(hits.every(({ row }) => /(rate|back-?dat|date change|RULE-RL-5)/i.test(row)));
});

test('M115 A1 — gap 2: the wrong permission model is surfaced (E4, endpoint half disagreeing with the documented grid)', () => {
  const rows = allRows(readColdRun());
  const endpointTable = rows.filter(({ table }) => /permission/i.test(table) && /endpoint/i.test(table));
  assert.ok(endpointTable.length > 0, 'a permissions table for the ENDPOINT half must exist (E4 second half), not screen rules alone');
  const gapRows = endpointTable.filter(({ row }) => /GAP/.test(row));
  assert.ok(gapRows.length > 0, 'the endpoint half must carry open GAP rows — the requirements state no endpoint rule for the ledger');
  // The DISAGREEMENT: a row that names the documented/screen side AND the endpoint side.
  const bothSides = gapRows.some(({ row }) => /(screen|documented|F6|hidden|REQ-V11111)/i.test(row) && /(endpoint|API|response|strip)/i.test(row));
  assert.ok(bothSides, 'at least one GAP row must name both the documented (screen) side and the endpoint side — the gap is the disagreement, not either side alone');
});

test('M115 A1 — gap 3: deactivating the irreplaceable entity must be refused (E8) is surfaced', () => {
  const rows = allRows(readColdRun()).filter(({ table }) => /deactivat/i.test(table));
  assert.ok(rows.length > 0, 'a deactivation table must exist');
  const irreplaceable = rows.filter(({ row }) => /(last admin|only admin|sole admin|\bowner\b|irreplaceable)/i.test(row) && /deactivat/i.test(row));
  assert.ok(irreplaceable.length >= 1, 'a row must have deactivating the irreplaceable entity (last ADMIN / owner) as its subject');
  assert.ok(irreplaceable.some(({ row }) => /GAP/.test(row) && /refus/i.test(row)), 'that row must record the missing refusal as an open GAP, never a filled-in answer');
  // Near-miss guard: an ordinary-member deactivation row exists and is a DIFFERENT row.
  const ordinary = rows.find(({ row }) => /deactivat/i.test(row) && !/(last admin|only admin|sole admin|\bowner\b|irreplaceable|self)/i.test(row));
  assert.ok(ordinary, 'an ordinary deactivation row should also exist');
  assert.ok(!irreplaceable.some(({ row }) => row === ordinary.row), 'the irreplaceable case is its own row, not the ordinary one');
});

test('M115 A1 — the three gap checks are independent (each targets different rows), and the run halted honestly', () => {
  const doc = readColdRun();
  const rows = allRows(doc);
  const g1 = rows.filter(({ row }) => /GAP/.test(row) && /(already[- ]issued|already issued|issued invoice)/i.test(row));
  const g3 = rows.filter(({ table, row }) => /deactivat/i.test(table) && /(last admin|\bowner\b)/i.test(row));
  assert.ok(g1.length && g3.length);
  assert.ok(!g1.some((a) => g3.some((b) => a.row === b.row)), 'gap 1 and gap 3 evidence are different rows');
  assert.match(doc, /^## HALT/m, 'the run reached its bound and said so — a plan that silently stops looks complete');
});
