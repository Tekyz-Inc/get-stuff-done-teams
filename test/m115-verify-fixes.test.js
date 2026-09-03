'use strict';
// M115 verify round 2 — Red Team FAIL (1 HIGH, 2 MEDIUM, 1 LOW) + code-review (3 important,
// 3 nits). Each test below fails on the pre-fix code and names the finding it pins.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const LINT = path.join(REPO, 'bin', 'gsd-t-testplan-lint.cjs');
const HALT = path.join(REPO, 'bin', 'gsd-t-testplan-halt.cjs');
const { runGate } = require('../bin/gsd-t-traceability-gate.cjs');

const HEADER = '| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |\n|---|---|---|---|---|---|\n';
function plan({ decided = '> None — every row is sourced.', rows, extra = '' }) {
  return `# Test Plan — Widgets\n\n## Decided without you\n\n${decided}\n\n## Table: Widgets\n\n${HEADER}${rows}\n${extra}\n## Open gaps\n\n- none\n\n## Sign-off\n\n| Who | When | Verdict |\n|---|---|---|\n| David | 2026-09-03 | approved |\n`;
}
const SOURCED = '| 1 | none | Save a widget | Saved | none | sourced: requirements.md §1 |';
const GAP = '| 2 | none | Delete the last widget | ? | ? | GAP: requirements silent |';

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), `m115-vf-${prefix}-`)); }

// ── code-review important #1: unknown sections (the mandated HALT) must not stall the walker ──
test('lint: a plan carrying the contract-mandated HALT section is clean; the same plan without it is clean too', () => {
  const dir = tmp('lint');
  const withHalt = plan({ rows: SOURCED, extra: '## HALT — case-space bound reached\n\nRows written: 1. Left out: the rest.\n' });
  const p = path.join(dir, 'TestPlan-Widgets.md'); fs.writeFileSync(p, withHalt);
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  assert.strictEqual(r.exitCode, 0, JSON.stringify(r.violations));
  assert.ok(!r.violations.some((v) => v.kind === 'missing-or-out-of-order-section'));
});

test('lint: a required section that is genuinely absent is still reported (the walker did not become lax)', () => {
  const dir = tmp('lint2');
  const p = path.join(dir, 'TestPlan-Widgets.md');
  fs.writeFileSync(p, plan({ rows: SOURCED }).replace('## Sign-off', '## Signoff-typo'));
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  assert.strictEqual(r.exitCode, 4);
  assert.ok(r.violations.some((v) => v.kind === 'missing-or-out-of-order-section' && /sign-off/.test(v.detail)));
});

// ── code-review nit: the "None" sentence is positional, not a substring ──
test('lint: a Decided group that says "None" AND lists a self-answered row is not treated as empty', () => {
  const dir = tmp('lint3');
  const p = path.join(dir, 'TestPlan-Widgets.md');
  const decidedRow = '| 3 | none | Rename a widget | Renamed | none | DECIDED-WITHOUT-YOU: evidence: naming convention in CLAUDE.md |';
  fs.writeFileSync(p, plan({ decided: '> None — every row is sourced.\n- `Widgets` Seq `3` — evidence: naming convention', rows: `${SOURCED}\n${decidedRow}` }));
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  // Whatever else it says, it must NOT have concluded the group is the empty "None" form.
  assert.ok(!r.violations.some((v) => /explicitly empty|None/.test(v.detail) && /group/.test(v.detail) && /empty/.test(v.detail)) || r.exitCode === 0);
});

// ── Red Team HIGH: a GAP row must never clear an acceptance criterion ──
function projectWithPlanAndTask(rowsCited, seq) {
  const dir = tmp('trace');
  fs.mkdirSync(path.join(dir, '.gsd-t', 'test-plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'domains', 'widgets'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'test-plans', 'TestPlan-Widgets.md'), plan({ rows: rowsCited }));
  fs.writeFileSync(path.join(dir, '.gsd-t', 'domains', 'widgets', 'tasks.md'),
    `# Tasks\n\n### M999-D1-T1 — Save widget\n**Acceptance criteria**: a widget saves\n**Plan-Row**: Widgets#Widgets/Seq-${seq}\n`);
  return dir;
}
function planRowCleared(dir) {
  const r = runGate({ projectDir: dir });
  const t = (r.tasks || []).find((x) => /Save widget/.test(x.title));
  return { r, t };
}
test('traceability: a citation to a SOURCED plan row clears; the SAME citation to a GAP row does NOT', () => {
  const ok = planRowCleared(projectWithPlanAndTask(`${SOURCED}\n${GAP}`, 1));
  const gap = planRowCleared(projectWithPlanAndTask(`${SOURCED}\n${GAP}`, 2));
  assert.strictEqual(ok.r.violations.length, 0, 'sourced row clears the AC');
  assert.ok(gap.r.violations.length > 0, 'an open GAP row is an unanswered requirement and must not clear the AC');
});

// ── Red Team MEDIUM: a doc title cannot escape .gsd-t/test-plans/ ──
test('traceability: a Plan-Row doc title with path segments never resolves (containment)', () => {
  const dir = tmp('esc');
  fs.mkdirSync(path.join(dir, '.gsd-t', 'test-plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'domains', 'widgets'), { recursive: true });
  // A plan OUTSIDE the directory that would satisfy the citation if traversal worked.
  fs.writeFileSync(path.join(dir, '.gsd-t', 'TestPlan-Widgets.md'), plan({ rows: SOURCED }));
  fs.writeFileSync(path.join(dir, '.gsd-t', 'domains', 'widgets', 'tasks.md'),
    `# Tasks\n\n### M999-D1-T1 — Save widget\n**Acceptance criteria**: a widget saves\n**Plan-Row**: ../Widgets#Widgets/Seq-1\n`);
  const r = runGate({ projectDir: dir });
  assert.ok(r.violations.length > 0, 'the escaped path must not clear anything');
});

// ── Red Team LOW: a `##` inside a fenced block does not close the table scope ──
test('traceability: a fenced ## inside a table section does not end the table', () => {
  const fenced = `${SOURCED}\n\n\`\`\`text\n## not a heading\n\`\`\`\n\n| 4 | none | Save another | Saved | none | sourced: requirements.md §1 |`;
  const dir = projectWithPlanAndTask(fenced, 4);
  const { r } = planRowCleared(dir);
  assert.strictEqual(r.violations.length, 0, 'row 4 after the fence is still in the Widgets table');
});

// ── code-review important #2: a valueless --round is not round 1 ──
test('halt: --round with no value, 0, or letters exits 64', () => {
  const dir = tmp('halt');
  const p = path.join(dir, 'TestPlan-Widgets.md'); fs.writeFileSync(p, plan({ rows: `${SOURCED}\n${GAP}` }));
  for (const args of [['--doc', p, '--round'], ['--doc', p, '--round', '0'], ['--doc', p, '--round', 'abc'], ['--doc', p, '--round', '1.5']]) {
    const r = spawnSync(process.execPath, [HALT, 'check', ...args], { encoding: 'utf8', cwd: dir });
    assert.strictEqual(r.status, 64, `args ${JSON.stringify(args.slice(2))} → ${r.status} ${r.stdout.slice(0, 120)}`);
  }
  const good = spawnSync(process.execPath, [HALT, 'check', '--doc', p, '--round', '1'], { encoding: 'utf8', cwd: dir });
  assert.notStrictEqual(good.status, 64, 'a real round number is accepted');
});

// ── code-review nit: a gap restated under "Open gaps" is counted once ──
test('halt: parseOpenRows counts a gap row once even when Open gaps restates it as a table', () => {
  const { parseOpenRows } = require('../bin/gsd-t-testplan-halt.cjs');
  const doc = plan({ rows: `${SOURCED}\n${GAP}` }).replace('- none', `${HEADER}${GAP}`);
  const open = parseOpenRows(doc);
  assert.strictEqual(open.length, 1, JSON.stringify(open));
});

// ── verify run 4: one shared plan reader; fences of BOTH styles; EXACT six-cell rows ──
const EXTRA_GAP = '| 5 | none | Delete the last widget | ? | ? | GAP: requirements silent | extra |';

test('lint: a tilde-fenced fake heading does not satisfy a required section (Red Team HIGH, run 4)', () => {
  const dir = tmp('tilde');
  const p = path.join(dir, 'TestPlan-Widgets.md');
  // Real "Open gaps" and "Sign-off" are replaced by fenced fakes.
  const doc = plan({ rows: SOURCED }).replace('## Open gaps\n\n- none\n\n## Sign-off', '~~~text\n## Open gaps\n\n- none\n\n## Sign-off\n~~~\n\n## Not-sign-off');
  fs.writeFileSync(p, doc);
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  assert.strictEqual(r.exitCode, 4);
  assert.ok(r.violations.some((v) => v.kind === 'missing-or-out-of-order-section'));
});

test('lint: a row with an EXTRA cell is a violation (width is exact, not a lower bound)', () => {
  const dir = tmp('width');
  const p = path.join(dir, 'TestPlan-Widgets.md'); fs.writeFileSync(p, plan({ rows: `${SOURCED}\n${EXTRA_GAP}` }));
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  assert.strictEqual(r.exitCode, 4);
  assert.ok(r.violations.some((v) => v.kind === 'row-column-count-mismatch' && /7 columns/.test(v.detail)));
});

test('lint: a second "Decided without you" heading is flagged', () => {
  const dir = tmp('dup');
  const p = path.join(dir, 'TestPlan-Widgets.md');
  fs.writeFileSync(p, plan({ rows: SOURCED }).replace('## Table: Widgets', '## Decided without you\n\n> None — every row is sourced.\n\n## Table: Widgets'));
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  assert.ok(r.violations.some((v) => v.kind === 'duplicate-decided-group'));
});

test('traceability: an extra-cell GAP row never clears an acceptance criterion', () => {
  const { r } = planRowCleared(projectWithPlanAndTask(`${SOURCED}\n${EXTRA_GAP}`, 5));
  assert.ok(r.violations.length > 0, 'a malformed row is not a sourced answer');
});

test('traceability: a HEADLINE task cleared by a plan row no longer trips headline-without-test, but still needs an implementing path', () => {
  const dir = tmp('headline');
  fs.mkdirSync(path.join(dir, '.gsd-t', 'test-plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'domains', 'widgets'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'test-plans', 'TestPlan-Widgets.md'), plan({ rows: SOURCED }));
  fs.writeFileSync(path.join(dir, '.gsd-t', 'domains', 'widgets', 'tasks.md'),
    `# Tasks\n\n### M999-D1-T1 — Save widget\n**Headline**: true\n**Acceptance criteria**: a widget saves\n**Plan-Row**: Widgets#Widgets/Seq-1\n`);
  const r = runGate({ projectDir: dir });
  const kinds = r.violations.map((v) => v.kind);
  assert.ok(!kinds.includes('headline-without-test'), 'the plan row is the test');
  assert.ok(kinds.includes('headline-without-impl'), 'a test row is not an implementation path');
});

test('halt: an extra-cell row counts as OPEN, and a fenced "## Table:" is not a table', () => {
  const { parseOpenRows } = require('../bin/gsd-t-testplan-halt.cjs');
  const open = parseOpenRows(plan({ rows: `${SOURCED}\n${EXTRA_GAP}` }));
  assert.strictEqual(open.length, 1);
  assert.match(open[0].source, /MALFORMED-ROW/);
  const fenced = plan({ rows: SOURCED, extra: '```text\n## Table: Ghost\n\n' + HEADER + GAP + '\n```\n' });
  assert.strictEqual(parseOpenRows(fenced).length, 0, 'the fenced GAP row is text, not an open row');
});

// ── verify run 5: every reader of a section is fence-aware, and the halt names its rows ──
test('lint: a self-answered row whose Decided entry is hidden inside a tilde fence is NOT visible (Red Team HIGH, run 5)', () => {
  const dir = tmp('fenced-decided');
  const p = path.join(dir, 'TestPlan-Widgets.md');
  const decidedRow = '| 3 | none | Rename a widget | Renamed | none | DECIDED-WITHOUT-YOU: evidence: naming convention |';
  fs.writeFileSync(p, plan({ decided: '~~~text\n- `Widgets` Seq `3` — evidence: naming convention\n~~~', rows: `${SOURCED}\n${decidedRow}` }));
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  assert.strictEqual(r.exitCode, 4);
  assert.ok(r.violations.some((v) => /self-answered/.test(v.kind)), JSON.stringify(r.violations.map((v) => v.kind)));
});

test('lint: a fenced "None" sentence does not make the Decided group count as explicitly empty', () => {
  const dir = tmp('fenced-none');
  const p = path.join(dir, 'TestPlan-Widgets.md');
  fs.writeFileSync(p, plan({ decided: '```text\n> None — every row is sourced.\n```', rows: SOURCED }));
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  assert.strictEqual(r.exitCode, 4, 'a group whose only "None" is inside a code block has no visible content');
});

test('lint: a fenced pipe line before the real header is not the header, so row checks still run', () => {
  const dir = tmp('fenced-header');
  const p = path.join(dir, 'TestPlan-Widgets.md');
  const blankRow = '| 9 | none | Do a thing | Done |  |  |';
  fs.writeFileSync(p, plan({ rows: `${SOURCED}\n${blankRow}` }).replace('## Table: Widgets\n\n', '## Table: Widgets\n\n```text\n| not | a | header |\n```\n\n'));
  const r = JSON.parse(spawnSync(process.execPath, [LINT, '--doc', p], { encoding: 'utf8' }).stdout);
  assert.ok(r.violations.some((v) => /blank-source|blank-effect/.test(v.kind)), 'the blank row must be reported; the real header must be found');
  assert.ok(!r.violations.some((v) => v.kind === 'wrong-table-header'));
});

test('halt: the halt message names each open row by its source text, never "undefined"', () => {
  const dir = tmp('halt-msg');
  const p = path.join(dir, 'TestPlan-Widgets.md'); fs.writeFileSync(p, plan({ rows: `${SOURCED}\n${GAP}` }));
  const r = JSON.parse(spawnSync(process.execPath, [HALT, 'check', '--doc', p, '--round', '3'], { encoding: 'utf8', cwd: dir }).stdout);
  assert.strictEqual(r.exitCode, 4);
  assert.match(r.haltReason, /GAP: requirements silent/);
  assert.ok(!/undefined/.test(r.haltReason + JSON.stringify(r.violations)));
});
