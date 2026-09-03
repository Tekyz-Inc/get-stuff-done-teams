'use strict';

/**
 * M115 A3 — self-answered rows stay visible (plan-visibility, Wave 2).
 *
 * Proves the mold's structural rule set (`templates/TestPlan-spec.md`): every
 * `DECIDED-WITHOUT-YOU` row in a sequence table must also appear, individually
 * sourced, under a `## Decided without you` heading placed before the first
 * table — so a reviewer can overrule any self-answered decision from one
 * heading, without reading every table.
 *
 * This test does not implement `bin/gsd-t-testplan-lint.cjs` (owned by
 * `deterministic-gates`, Wave 3) — it proves the RULES that lint must
 * implement are each independently checkable and each independently
 * violable, using a small structural checker local to this test file.
 *
 * Structural only: headings matched as headings (line starting with `## `),
 * rows matched as table rows (`|`-delimited), columns read by position.
 * Never a substring search across the whole document as one blob of text.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const HEADING = '## Decided without you';
const MARKER = 'DECIDED-WITHOUT-YOU';

/**
 * Parses a Markdown test-plan document into:
 *  - decidedHeadingIndex: character offset of the `## Decided without you`
 *    heading line, or -1 if absent.
 *  - decidedGroupLines: the bullet lines under that heading (before the next
 *    `## `/`---` boundary), each parsed into { table, seq, evidencePresent }.
 *  - tables: [{ name, rows: [{ seq, source }] }] for every `## Table: X`
 *    section, each row read from its Markdown table cells by position
 *    (column 6 = Source).
 *  - firstTableIndex: character offset of the first `## Table:` heading, or
 *    -1 if none.
 */
function parsePlan(doc) {
  const lines = doc.split('\n');
  let decidedHeadingLineIdx = -1;
  let firstTableLineIdx = -1;
  const tables = [];
  let currentTable = null;
  const decidedGroupLines = [];
  let inDecidedGroup = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === HEADING) {
      decidedHeadingLineIdx = i;
      inDecidedGroup = true;
      continue;
    }

    // Any other `## ` heading, or a `---` divider, closes the decided group.
    if (inDecidedGroup && (/^##\s/.test(line) || line.trim() === '---')) {
      inDecidedGroup = false;
    }

    if (inDecidedGroup) {
      const m = line.match(/^-\s+`([^`]+)`\s+Seq\s+`([^`]+)`\s+—\s+(.*)$/);
      if (m) {
        const [, table, seq, rest] = m;
        const evidencePresent = /evidence:\s*\S/.test(rest);
        decidedGroupLines.push({ table, seq, evidencePresent, raw: line });
      } else if (line.trim().startsWith('- ')) {
        // A bullet under the heading that doesn't match the expected shape
        // still counts as "something under the heading" for emptiness checks,
        // but carries no identifiable evidence.
        decidedGroupLines.push({ table: null, seq: null, evidencePresent: false, raw: line });
      }
      continue;
    }

    const tableHeadingMatch = line.match(/^##\s+Table:\s*(.+)$/);
    if (tableHeadingMatch) {
      if (firstTableLineIdx === -1) firstTableLineIdx = i;
      currentTable = { name: tableHeadingMatch[1].trim(), rows: [] };
      tables.push(currentTable);
      continue;
    }

    if (currentTable && line.trim().startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter((_, idx, arr) => {
        // Drop leading/trailing empty cells produced by a line starting/ending with '|'.
        return true;
      });
      // Normalize: split('|') on "| a | b |" -> ['', ' a ', ' b ', ''].
      const trimmed = line.trim();
      const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
      const parts = inner.split('|').map((c) => c.trim());

      // Skip header row and separator row.
      if (parts[0] === 'Seq' || /^-+$/.test(parts[0])) continue;
      if (parts.length < 6) continue;

      currentTable.rows.push({ seq: parts[0], source: parts[5] });
    }
  }

  return {
    decidedHeadingLineIdx,
    decidedGroupLines,
    tables,
    firstTableLineIdx,
    hasHeadingAtAll: decidedHeadingLineIdx !== -1,
  };
}

/**
 * Runs the five A3 rules against a parsed plan. Returns an array of
 * violation kind strings (empty = clean).
 */
function checkA3(doc) {
  const p = parsePlan(doc);
  const violations = [];

  // Rule: heading absent entirely (distinct from present-and-empty).
  if (!p.hasHeadingAtAll) {
    violations.push('decided-heading-missing');
    // Every downstream rule assumes the heading exists; nothing else to check.
    return violations;
  }

  // Rule: heading must appear before the first sequence table.
  if (p.firstTableLineIdx !== -1 && p.decidedHeadingLineIdx > p.firstTableLineIdx) {
    violations.push('decided-heading-after-first-table');
  }

  // Collect every DECIDED-WITHOUT-YOU row across all tables.
  const selfAnsweredRows = [];
  for (const t of p.tables) {
    for (const r of t.rows) {
      if (r.source.includes(MARKER)) {
        selfAnsweredRows.push({ table: t.name, seq: r.seq });
      }
    }
  }

  // Rule: every self-answered row has a matching, evidenced entry under the heading.
  for (const row of selfAnsweredRows) {
    const match = p.decidedGroupLines.find((g) => g.table === row.table && g.seq === row.seq);
    if (!match) {
      violations.push('self-answered-row-not-in-group');
    } else if (!match.evidencePresent) {
      violations.push('decided-entry-unsourced');
    }
  }

  // Rule: nothing under the heading that is not a self-answered row (group is exactly the set).
  for (const g of p.decidedGroupLines) {
    const isRealSentence = /^None — every row is sourced\.$/.test(g.raw.replace(/^-\s*/, '').trim())
      || g.raw.includes('None — every row is sourced.');
    if (isRealSentence) continue;
    const isKnownRow = selfAnsweredRows.some((r) => r.table === g.table && r.seq === g.seq);
    if (!isKnownRow) {
      violations.push('decided-group-has-extra-entry');
    }
  }

  return violations;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

const WELL_FORMED = `# TestPlan-Example

One sentence of purpose.

---

## Decided without you

- \`Renewals\` Seq \`2\` — assumed same-day renewal keeps the original due date — evidence: no requirement states either reading, chose the less surprising one

---

## Table: Renewals

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | book is out, due today | renew it | due date extends 14 days | due date updated | docs/requirements.md#renewal |
| 2 | book renewed same day twice | renew again same day | keeps original extended due date | none | DECIDED-WITHOUT-YOU — no requirement states either reading, chose the less surprising one |

---

## Open gaps

None — every row is answered.

---

## Sign-off

| Signed by | Date |
|---|---|
| Jane | 2026-09-03 |
`;

function replaceOnce(doc, from, to) {
  const idx = doc.indexOf(from);
  assert.notEqual(idx, -1, `fixture setup: could not find ${JSON.stringify(from)}`);
  return doc.slice(0, idx) + to + doc.slice(idx + from.length);
}

// ─── Positive case ──────────────────────────────────────────────────────────

test('A3: a well-formed plan is clean', () => {
  const violations = checkA3(WELL_FORMED);
  assert.deepEqual(violations, []);
});

// ─── Negative cases (the load-bearing half) ────────────────────────────────

test('A3: a self-answered row in a table with NO entry under the heading is detectably wrong', () => {
  const doc = replaceOnce(
    WELL_FORMED,
    "- `Renewals` Seq `2` — assumed same-day renewal keeps the original due date — evidence: no requirement states either reading, chose the less surprising one\n",
    ''
  );
  const violations = checkA3(doc);
  assert.ok(violations.includes('self-answered-row-not-in-group'));
});

test('A3: an entry under the heading with no evidence named is detectably wrong', () => {
  const doc = replaceOnce(
    WELL_FORMED,
    '— evidence: no requirement states either reading, chose the less surprising one',
    ''
  );
  const violations = checkA3(doc);
  assert.ok(violations.includes('decided-entry-unsourced'));
});

test('A3: the heading placed after the first table is detectably wrong', () => {
  // Move the "## Decided without you" block to after the "## Table: Renewals" section.
  const decidedBlock = `## Decided without you

- \`Table: Renewals\` Seq \`2\` — assumed same-day renewal keeps the original due date — evidence: no requirement states either reading, chose the less surprising one

---

`;
  let doc = WELL_FORMED.replace(decidedBlock, '');
  doc = doc.replace(
    '## Open gaps',
    `${decidedBlock}## Open gaps`
  );
  const violations = checkA3(doc);
  assert.ok(violations.includes('decided-heading-after-first-table'));
});

test('A3: the heading absent entirely is detectably wrong, distinct from present-and-empty', () => {
  const decidedBlock = `## Decided without you

- \`Renewals\` Seq \`2\` — assumed same-day renewal keeps the original due date — evidence: no requirement states either reading, chose the less surprising one

---

`;
  const docMissing = WELL_FORMED.replace(decidedBlock, '');
  const violationsMissing = checkA3(docMissing);
  assert.ok(violationsMissing.includes('decided-heading-missing'));

  const docEmpty = docMissing.replace(
    '## Table: Renewals',
    '## Decided without you\n\nNone — every row is sourced.\n\n---\n\n## Table: Renewals'
  );
  // The empty-but-present doc still has a self-answered row 2 with no matching
  // entry — that is a DIFFERENT violation (self-answered-row-not-in-group),
  // proving present-and-empty is not conflated with heading-missing.
  const violationsEmpty = checkA3(docEmpty);
  assert.ok(!violationsEmpty.includes('decided-heading-missing'));
  assert.ok(violationsEmpty.includes('self-answered-row-not-in-group'));
});

test('A3: a heading mentioned only in prose (not as a real ## heading) does not satisfy the rule', () => {
  const decidedBlock = `## Decided without you

- \`Renewals\` Seq \`2\` — assumed same-day renewal keeps the original due date — evidence: no requirement states either reading, chose the less surprising one

---

`;
  const docMissingHeading = WELL_FORMED.replace(decidedBlock, '');
  const docWithProseMention = docMissingHeading.replace(
    'One sentence of purpose.',
    'One sentence of purpose. See the Decided without you section below for context.'
  );
  const violations = checkA3(docWithProseMention);
  assert.ok(violations.includes('decided-heading-missing'), 'a prose mention must not count as the heading');
});
