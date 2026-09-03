'use strict';

/**
 * M115 A5 — the non-convergence halt (`halt-convergence` domain, Wave 2).
 *
 * Proves `bin/gsd-t-testplan-halt.cjs`'s two loop caps:
 *
 *   [RULE] enumeration-loop-cap-three  — three question rounds without every row
 *     closed HALTS, naming every still-open row.
 *   [RULE] same-symptom-twice-halts    — the same failure signature twice running
 *     HALTS, aimed at the premise rather than a third attempt at the fix.
 *
 * Every case is run as a REAL subprocess (`node bin/gsd-t-testplan-halt.cjs check ...`)
 * so the exit codes asserted are the ones a real caller sees, not just a returned
 * object a caller could ignore. Each fixture doc lives under a fresh temp dir per test
 * so one test's loop-ledger state file cannot leak into another's.
 *
 * Contract: .gsd-t/contracts/test-plan-first-contract.md §2 (row schema), §4 (exit
 * codes/envelope), §6 (loop-ledger reuse, read-only).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const TOOL_PATH = path.join(__dirname, '..', 'bin', 'gsd-t-testplan-halt.cjs');
const LEDGER_PATH = path.join(__dirname, '..', 'bin', 'gsd-t-loop-ledger.cjs');
const LEDGER_SNAPSHOT = fs.readFileSync(LEDGER_PATH, 'utf8');

const OPEN_ROW_DOC = `# Test Plan

## Table: Alpha

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | a | b | c | none | sourced: req.md |
| 2 | a | b | c | none | GAP: nothing states this |
`;

const CLOSED_ROW_DOC = `# Test Plan

## Table: Alpha

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | a | b | c | none | sourced: req.md |
| 2 | a | b | c | none | sourced: req.md line 9 |
`;

const CONTRADICTION_DOC = `# Test Plan

## Table: Beta

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | a | b | c | none | GAP:CONTRADICTION: rule X and rule Y disagree |
`;

function freshProjectDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-m115-a5-'));
  return dir;
}

function writeDoc(dir, name, content) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

/** Run the tool as a real subprocess. Returns { exitCode, envelope }. */
function runCheck(args) {
  const res = spawnSync(process.execPath, [TOOL_PATH, 'check', ...args], {
    encoding: 'utf8',
  });
  assert.equal(res.error, undefined, `subprocess failed to launch: ${res.error}`);
  let envelope;
  try {
    envelope = JSON.parse(res.stdout.trim());
  } catch (e) {
    assert.fail(`stdout was not valid JSON: ${res.stdout}`);
  }
  return { exitCode: res.status, envelope };
}

test('M115 A5 — round 1, open rows remain: does NOT halt', () => {
  const dir = freshProjectDir();
  const doc = writeDoc(dir, 'plan.md', OPEN_ROW_DOC);

  const { exitCode, envelope } = runCheck(['--doc', doc, '--round', '1', '--projectDir', dir]);

  assert.equal(exitCode, 0, 'round 1 with open rows must not halt');
  assert.equal(envelope.ok, true);
  assert.equal(envelope.halted, false);
  assert.equal(envelope.openRows.length, 1);
});

test('M115 A5 — round 2, open rows remain: does NOT halt (cap fires only at round 3)', () => {
  const dir = freshProjectDir();
  const doc = writeDoc(dir, 'plan.md', OPEN_ROW_DOC);

  const { exitCode, envelope } = runCheck(['--doc', doc, '--round', '2', '--projectDir', dir]);

  assert.equal(exitCode, 0, 'round 2 with open rows must not halt the round cap');
  assert.equal(envelope.halted, false);
});

test('M115 A5 — round 3, open rows still remain: HALTS and names every open row', () => {
  const dir = freshProjectDir();
  const doc = writeDoc(dir, 'plan.md', OPEN_ROW_DOC);

  const { exitCode, envelope } = runCheck(['--doc', doc, '--round', '3', '--projectDir', dir]);

  assert.equal(exitCode, 4, '[RULE] enumeration-loop-cap-three must halt with exitCode 4');
  assert.equal(envelope.ok, false);
  assert.equal(envelope.halted, true);
  assert.match(envelope.haltReason, /enumeration-loop-cap-three/);
  assert.match(envelope.haltReason, /blocked-needs-human/);
  // Every still-open row is named by table + Seq — this is what makes the halt
  // actionable rather than a bare "blocked".
  assert.match(envelope.haltReason, /Alpha Seq 2/);
  assert.equal(envelope.violations.length, 1);
  assert.equal(envelope.violations[0].kind, 'enumeration-loop-cap-three');
  assert.match(envelope.violations[0].detail, /Alpha Seq 2/);
});

test('M115 A5 — round 3 with a GAP:CONTRADICTION row also HALTS and names it', () => {
  const dir = freshProjectDir();
  const doc = writeDoc(dir, 'plan.md', CONTRADICTION_DOC);

  const { exitCode, envelope } = runCheck(['--doc', doc, '--round', '3', '--projectDir', dir]);

  assert.equal(exitCode, 4);
  assert.equal(envelope.halted, true);
  assert.match(envelope.haltReason, /Beta Seq 1/);
});

test('M115 A5 — converges by round 2 (all rows closed): NOT halted, even at the round-3 boundary later', () => {
  const dir = freshProjectDir();
  const doc = writeDoc(dir, 'plan.md', CLOSED_ROW_DOC);

  const round1 = runCheck(['--doc', doc, '--round', '1', '--projectDir', dir]);
  assert.equal(round1.exitCode, 0);
  assert.equal(round1.envelope.openRows.length, 0);

  const round2 = runCheck(['--doc', doc, '--round', '2', '--projectDir', dir]);
  assert.equal(round2.exitCode, 0, 'a converged plan must not halt on round 2');
  assert.equal(round2.envelope.halted, false);

  // Even reaching round 3 with the SAME closed doc must not fire the round cap —
  // the cap is conditioned on open rows remaining, not on the round number alone.
  const round3 = runCheck(['--doc', doc, '--round', '3', '--projectDir', dir]);
  assert.equal(round3.exitCode, 0, 'the round cap must never fire on a converged plan');
  assert.equal(round3.envelope.halted, false);
});

test('M115 A5 — same failure signature twice running: HALTS, aimed at the premise', () => {
  const dir = freshProjectDir();
  const doc = writeDoc(dir, 'plan.md', OPEN_ROW_DOC);

  // Two rounds in a row against the SAME still-open row set → the same computed
  // signature → the repeated-symptom cap must fire on the 2nd occurrence, well
  // before the round-3 boundary.
  const first = runCheck(['--doc', doc, '--round', '1', '--projectDir', dir]);
  assert.equal(first.exitCode, 0, 'the first occurrence of a signature must not halt');

  const second = runCheck(['--doc', doc, '--round', '2', '--projectDir', dir]);
  assert.equal(second.exitCode, 4, '[RULE] same-symptom-twice-halts must halt on the 2nd occurrence');
  assert.equal(second.envelope.halted, true);
  assert.match(second.envelope.haltReason, /same-symptom-twice-halts/);
  // The message must direct at the PREMISE, never at retrying the fix.
  assert.match(second.envelope.haltReason, /belief behind the fix is wrong/);
  assert.match(second.envelope.haltReason, /re-examine the premise/);
  assert.doesNotMatch(second.envelope.haltReason, /try (a )?third time/i);
  assert.equal(second.envelope.violations[0].kind, 'same-symptom-twice-halts');
});

test('M115 A5 — two DIFFERENT signatures in a row: does NOT halt the repeated-symptom cap', () => {
  const dir = freshProjectDir();
  const docA = writeDoc(dir, 'plan-a.md', CLOSED_ROW_DOC); // signature: no-open-rows
  const docB = writeDoc(dir, 'plan-b.md', OPEN_ROW_DOC); // signature: Alpha::2

  const first = runCheck(['--doc', docA, '--round', '1', '--projectDir', dir]);
  assert.equal(first.exitCode, 0);

  const second = runCheck(['--doc', docB, '--round', '2', '--projectDir', dir]);
  assert.equal(second.exitCode, 0, 'a different signature must not trip the repeated-symptom cap');
  assert.equal(second.envelope.halted, false);
});

test('M115 A5 — explicit --assertion/--surface/--fileClass identity also converges/repeats correctly', () => {
  const dir = freshProjectDir();
  const doc = writeDoc(dir, 'plan.md', OPEN_ROW_DOC);

  const common = ['--doc', doc, '--projectDir', dir, '--assertion', 'expects X', '--surface', 'screen.tsx', '--fileClass', 'ui'];

  const first = runCheck([...common, '--round', '1']);
  assert.equal(first.exitCode, 0);

  const second = runCheck([...common, '--round', '2']);
  assert.equal(second.exitCode, 4, 'an explicit identity repeated twice must still halt');
  assert.equal(second.envelope.halted, true);
});

test('M115 A5 — unreadable/missing input: exit 64, never 0', () => {
  const dir = freshProjectDir();

  const missingDoc = runCheck(['--doc', path.join(dir, 'does-not-exist.md'), '--round', '1', '--projectDir', dir]);
  assert.equal(missingDoc.exitCode, 64);
  assert.equal(missingDoc.envelope.ok, false);

  const doc = writeDoc(dir, 'plan.md', OPEN_ROW_DOC);

  const missingRound = runCheck(['--doc', doc, '--projectDir', dir]);
  assert.equal(missingRound.exitCode, 64);

  const badRound = runCheck(['--doc', doc, '--round', '0', '--projectDir', dir]);
  assert.equal(badRound.exitCode, 64);

  const notANumber = runCheck(['--doc', doc, '--round', 'abc', '--projectDir', dir]);
  assert.equal(notANumber.exitCode, 64);

  const missingDocFlag = runCheck(['--round', '1', '--projectDir', dir]);
  assert.equal(missingDocFlag.exitCode, 64);

  const unknownSubcommand = spawnSync(process.execPath, [TOOL_PATH, 'bogus'], { encoding: 'utf8' });
  assert.equal(unknownSubcommand.status, 64);
});

test('M115 A5 — a directory passed as --doc: exit 64, never 0', () => {
  const dir = freshProjectDir();
  const { exitCode, envelope } = runCheck(['--doc', dir, '--round', '1', '--projectDir', dir]);
  assert.equal(exitCode, 64);
  assert.equal(envelope.ok, false);
});

test('M115 A5 — a forced internal error (corrupt loop-ledger state): exit 64, never a thrown stack trace', () => {
  const dir = freshProjectDir();
  const doc = writeDoc(dir, 'plan.md', OPEN_ROW_DOC);

  // Corrupt the ledger's own state file ahead of time so its appendCycle() call
  // returns { ok:false } — forcing the tool's "loop-ledger rejected the cycle"
  // internal-error path without touching the ledger's source.
  const stateDir = path.join(dir, '.gsd-t');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'loop-ledger-state.json'), '{ not valid json', 'utf8');

  const res = spawnSync(process.execPath, [TOOL_PATH, 'check', '--doc', doc, '--round', '1', '--projectDir', dir], {
    encoding: 'utf8',
  });

  assert.equal(res.status, 64, 'a corrupt ledger state must halt at 64, never crash or pass at 0');
  assert.equal(res.status, 64);
  // Never a thrown stack trace escaping to stderr as the process's reported failure —
  // the tool must have printed its own JSON envelope on stdout instead.
  let envelope;
  assert.doesNotThrow(() => {
    envelope = JSON.parse(res.stdout.trim());
  }, 'the tool must emit a JSON envelope, not a bare stack trace, even on internal error');
  assert.equal(envelope.ok, false);
  assert.equal(envelope.exitCode, 64);
  assert.ok(envelope.reason, 'the 64 envelope must state a reason');
});

test('M115 A5 — bin/gsd-t-loop-ledger.cjs is untouched (byte-identical, read-only reuse)', () => {
  const current = fs.readFileSync(LEDGER_PATH, 'utf8');
  assert.equal(current, LEDGER_SNAPSHOT, 'the loop ledger must never be edited by this domain');

  const gitDiff = spawnSync('git', ['diff', '--stat', '--', 'bin/gsd-t-loop-ledger.cjs'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.equal(gitDiff.status, 0);
  assert.equal(gitDiff.stdout.trim(), '', 'git diff on the loop ledger must be empty');
});

test('M115 A5 — parseOpenRows recognises sourced / GAP / GAP:CONTRADICTION per contract §2.2', () => {
  const { parseOpenRows } = require(TOOL_PATH);

  const openFromGap = parseOpenRows(OPEN_ROW_DOC);
  assert.equal(openFromGap.length, 1);
  assert.equal(openFromGap[0].table, 'Alpha');
  assert.equal(openFromGap[0].seq, '2');

  const openFromClosed = parseOpenRows(CLOSED_ROW_DOC);
  assert.equal(openFromClosed.length, 0, 'a fully sourced doc has zero open rows');

  const openFromContradiction = parseOpenRows(CONTRADICTION_DOC);
  assert.equal(openFromContradiction.length, 1);
  assert.equal(openFromContradiction[0].table, 'Beta');
});
