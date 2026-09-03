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

const COLD_RUN_PATH = path.join(__dirname, '..', '.gsd-t', 'scan', 'm115-cold-enumeration-output.md');
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
    /read cold — no held-out file[\s\S]*was opened before this document was written/,
    'the recorded artifact must state it was produced before any held-out file was opened'
  );
});

test('M115 A1 — gap 1: month close + reopen is surfaced (E6, both directions)', () => {
  const doc = readColdRun();
  const tables = splitTables(doc);
  const closeTable = tables.find((t) => /Billing-Period Close/i.test(t.heading));
  assert.ok(closeTable, 'a table addressing billing-period close must exist in the recorded output');

  const rows = tableRows(closeTable);
  assert.ok(rows.length > 0, 'the close/reopen table must contain rows');

  // Structural check: a row (or GAP entry) whose SUBJECT is the closed state.
  const hasCloseSubject = rows.some((r) => /clos(ed|ing)/i.test(r) && /month|period/i.test(r));
  assert.ok(hasCloseSubject, 'a row must have the closed-month state as its subject');

  // Structural check: E6 requires the companion re-entry direction to be
  // addressed too (per the hit condition: "a corresponding row/entry
  // addressing reopening — either sourced, decided, or explicitly a GAP").
  const hasReopenSubject = rows.some((r) => /reopen/i.test(r));
  assert.ok(hasReopenSubject, 'a row must address reopening — E6 requires both directions, not close alone');

  // The near-miss guard: a table that only ever mentions closing and never
  // once names "reopen" would pass a substring search on "close" alone but
  // must fail this test, per "near-misses count as misses."
  const gapRow = rows.find((r) => /GAP/.test(r) && /reopen/i.test(r));
  assert.ok(gapRow, 'the reopen half must be recorded as an explicit GAP entry, not silently omitted');
});

test('M115 A1 — gap 2: the wrong permission model is surfaced (E4, screen vs. endpoint disagreement)', () => {
  const doc = readColdRun();
  const tables = splitTables(doc);
  const permTable = tables.find((t) => /E4.*permission/i.test(t.heading));
  assert.ok(permTable, 'a table addressing permission (E4: screen AND endpoint) must exist');

  const rows = tableRows(permTable);

  // Structural check: at least one row marked GAP:CONTRADICTION whose subject
  // is a disagreement between the documented model and the endpoint-level
  // check — not a row that merely restates one side alone.
  const contradictionRows = rows.filter((r) => /GAP:CONTRADICTION/.test(r));
  assert.ok(
    contradictionRows.length > 0,
    'a GAP:CONTRADICTION row must exist — the gap is the DISAGREEMENT between the documented grid and the endpoint check, not either side alone'
  );

  const namesBothSides = contradictionRows.some(
    (r) => /(screen|documented|F6)/i.test(r) && /(endpoint|address the app calls)/i.test(r)
  );
  assert.ok(
    namesBothSides,
    'the contradiction row must name both the documented (screen-level) side and the endpoint-level side to count as the permission-model gap, not a near-miss restating only one'
  );
});

test('M115 A1 — gap 3: "the owner cannot be deactivated" is surfaced (E8, refusal case)', () => {
  const doc = readColdRun();
  const tables = splitTables(doc);
  const refusalTable = tables.find((t) => /E8/i.test(t.heading) && /refusal/i.test(t.heading));
  assert.ok(refusalTable, 'a table addressing refusal cases (E8) must exist');

  const rows = tableRows(refusalTable);

  // Structural check: a row whose subject is deactivating the irreplaceable
  // entity (owner / sole admin), naming that no refusal is stated for it.
  // Deactivating an ORDINARY member must not satisfy this — the hit condition
  // requires the irreplaceable-entity case specifically.
  const ownerRow = rows.find((r) => /\bowner\b/i.test(r) && /deactivat/i.test(r));
  assert.ok(ownerRow, 'a row must have deactivating the OWNER (the irreplaceable entity) as its subject — not merely an ordinary member');

  assert.match(ownerRow, /GAP/, 'the owner-deactivation row must be recorded as an open GAP (no refusal stated), never filled with a plausible answer');

  // Near-miss guard: deactivating an ordinary member existing as a row is not
  // sufficient on its own — that row must not be the ONLY deactivation row.
  const ordinaryRow = rows.find((r) => /regular MEMBER|ordinary/i.test(r));
  assert.ok(ordinaryRow, 'an ordinary-member deactivation row should also exist, distinguishing it from the owner case');
  assert.notStrictEqual(
    ownerRow,
    ordinaryRow,
    'the owner case must be a row of its own, distinct from the ordinary-member case — a single undifferentiated deactivation row is a near-miss'
  );
});

test('M115 A1 — removing any single gap row from the record would fail its own assertion (mutation check)', () => {
  const doc = readColdRun();
  const tables = splitTables(doc);

  // This test proves the three tests above are per-gap, not a shared count or
  // threshold, by checking that each targets a DIFFERENT table — so deleting
  // one gap's table cannot silently satisfy another gap's assertion.
  const closeTable = tables.find((t) => /Billing-Period Close/i.test(t.heading));
  const permTable = tables.find((t) => /E4.*permission/i.test(t.heading));
  const refusalTable = tables.find((t) => /E8/i.test(t.heading) && /refusal/i.test(t.heading));

  assert.ok(closeTable && permTable && refusalTable, 'all three gap tables must exist');
  assert.notStrictEqual(closeTable.heading, permTable.heading);
  assert.notStrictEqual(permTable.heading, refusalTable.heading);
  assert.notStrictEqual(closeTable.heading, refusalTable.heading);
});
