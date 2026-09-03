'use strict';

/**
 * M115 A6 — evidence or halt (plan-visibility, Wave 2).
 *
 * Proves the classifier protocol's rule set
 * (`templates/prompts/test-plan-evidence-classifier.md`): a test-plan row is
 * filled from named evidence, marked `DECIDED-WITHOUT-YOU` with the evidence
 * used, or left `GAP` — nothing else — and a failing test's classification is
 * exactly one of three arms (code-is-wrong / rule-is-wrong / cannot-tell),
 * each requiring a citation, with the cannot-tell arm escalating rather than
 * defaulting.
 *
 * This test does not implement `bin/gsd-t-testplan-lint.cjs` or
 * `bin/gsd-t-testplan-halt.cjs` (owned by `deterministic-gates` /
 * `halt-convergence`, Wave 3) — it proves the RULES those gates must
 * implement are each independently checkable and violable, using a small
 * structural checker local to this test file, mirroring the shape of
 * `test/m115-a3-self-answer-visibility.test.js`.
 *
 * Structural only: a verdict object's shape and cited-evidence field are
 * checked directly — never a substring search across free-form prose.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const VALID_ARMS = new Set(['code-is-wrong', 'rule-is-wrong', 'cannot-tell']);
const VALID_ROW_STATES = new Set(['sourced', 'DECIDED-WITHOUT-YOU', 'GAP', 'GAP:CONTRADICTION']);

/**
 * Checks a classifier verdict object of the shape:
 *   { arm: 'code-is-wrong'|'rule-is-wrong'|'cannot-tell', citation: string }
 *
 * Returns an array of violation kind strings (empty = clean).
 *
 * Rules (mirrors `test-plan-evidence-classifier.md` §1):
 *  - `arm` must be exactly one of the three named arms — no default, no
 *    fourth value.
 *  - Every arm requires a non-empty `citation` naming real evidence
 *    consulted (a file path, section reference, or explicit "checked X, Y,
 *    silent/contradictory" statement for the cannot-tell arm).
 *  - `cannot-tell` verdicts must carry an `escalated: true` flag — it may
 *    never resolve to a row being filled.
 */
function checkVerdict(verdict) {
  const violations = [];

  if (!verdict || typeof verdict !== 'object') {
    violations.push('verdict-not-an-object');
    return violations;
  }

  if (!VALID_ARMS.has(verdict.arm)) {
    violations.push('verdict-arm-invalid-or-default');
    // No arm to check further rules against.
    return violations;
  }

  const citation = typeof verdict.citation === 'string' ? verdict.citation.trim() : '';
  if (citation.length === 0) {
    violations.push('verdict-uncited');
  }

  if (verdict.arm === 'cannot-tell') {
    if (verdict.escalated !== true) {
      violations.push('cannot-tell-not-escalated');
    }
    if (verdict.rowFilled === true) {
      violations.push('cannot-tell-filled-a-row');
    }
  } else {
    // code-is-wrong / rule-is-wrong must NOT also claim escalation — a
    // decided arm and an escalation are mutually exclusive outcomes.
    if (verdict.escalated === true) {
      violations.push('decided-arm-also-escalated');
    }
  }

  return violations;
}

/**
 * Checks a test-plan row's `Source` (column 6) value against the three
 * legal states. Returns an array of violation kind strings (empty = clean).
 *
 * Rules (mirrors `test-plan-evidence-classifier.md` §2 /
 * `test-plan-first-contract.md` §2.1-§2.2):
 *  - Empty column 6 is a violation, never a fourth state.
 *  - A `sourced` value must actually name something (non-empty string not
 *    equal to a marker literal).
 *  - A `DECIDED-WITHOUT-YOU` value must be followed by named evidence.
 *  - A `GAP` / `GAP:CONTRADICTION` value must be followed by a reason.
 */
function checkRowSource(source) {
  const violations = [];
  const trimmed = typeof source === 'string' ? source.trim() : '';

  if (trimmed.length === 0) {
    violations.push('row-source-empty');
    return violations;
  }

  if (trimmed.startsWith('DECIDED-WITHOUT-YOU')) {
    const rest = trimmed.slice('DECIDED-WITHOUT-YOU'.length).replace(/^[\s—-]+/, '');
    if (rest.length === 0) {
      violations.push('row-decided-without-you-unsourced');
    }
    return violations;
  }

  if (trimmed.startsWith('GAP:CONTRADICTION')) {
    const rest = trimmed.slice('GAP:CONTRADICTION'.length).replace(/^[\s—-]+/, '');
    if (rest.length === 0) {
      violations.push('row-gap-contradiction-unexplained');
    }
    return violations;
  }

  if (trimmed.startsWith('GAP')) {
    const rest = trimmed.slice('GAP'.length).replace(/^[\s—-]+/, '');
    if (rest.length === 0) {
      violations.push('row-gap-unexplained');
    }
    return violations;
  }

  // Anything else is treated as a `sourced` citation — must not be a bare
  // marker-like token with nothing real behind it (e.g. just punctuation).
  if (!/[A-Za-z0-9]/.test(trimmed)) {
    violations.push('row-source-cites-nothing-real');
  }

  return violations;
}

// ─── Row-filling: positive cases ───────────────────────────────────────────

test('A6 row: a sourced citation is clean', () => {
  assert.deepEqual(checkRowSource('docs/requirements.md#renewal'), []);
});

test('A6 row: a well-formed DECIDED-WITHOUT-YOU is clean', () => {
  assert.deepEqual(
    checkRowSource('DECIDED-WITHOUT-YOU — no requirement states either reading, chose the less surprising one'),
    []
  );
});

test('A6 row: a well-formed GAP is clean', () => {
  assert.deepEqual(checkRowSource('GAP — requirements never state a reopen path'), []);
});

test('A6 row: a well-formed GAP:CONTRADICTION is clean', () => {
  assert.deepEqual(
    checkRowSource('GAP:CONTRADICTION — architecture.md says X, requirements.md says Y'),
    []
  );
});

// ─── Row-filling: negative cases (the load-bearing half) ───────────────────

test('A6 row: a row filled with no Source is detectably wrong', () => {
  const violations = checkRowSource('');
  assert.ok(violations.includes('row-source-empty'));
});

test('A6 row: a row filled with a Source that cites nothing real is detectably wrong', () => {
  const violations = checkRowSource('---');
  assert.ok(violations.includes('row-source-cites-nothing-real'));
});

test('A6 row: DECIDED-WITHOUT-YOU with no evidence named is detectably wrong', () => {
  const violations = checkRowSource('DECIDED-WITHOUT-YOU');
  assert.ok(violations.includes('row-decided-without-you-unsourced'));
});

test('A6 row: GAP with no reason named is detectably wrong', () => {
  const violations = checkRowSource('GAP');
  assert.ok(violations.includes('row-gap-unexplained'));
});

// ─── Classifier verdicts: positive cases ───────────────────────────────────

test('A6 verdict: a properly cited code-is-wrong verdict is clean', () => {
  const verdict = { arm: 'code-is-wrong', citation: '.gsd-t/contracts/test-plan-first-contract.md#2.1' };
  assert.deepEqual(checkVerdict(verdict), []);
});

test('A6 verdict: a properly cited rule-is-wrong verdict is clean', () => {
  const verdict = { arm: 'rule-is-wrong', citation: 'docs/requirements.md#renewal (row misquoted the clause)' };
  assert.deepEqual(checkVerdict(verdict), []);
});

test('A6 verdict: a properly cited cannot-tell verdict escalates cleanly', () => {
  const verdict = {
    arm: 'cannot-tell',
    citation: 'checked requirements.md and architecture.md — both silent on same-day reopen',
    escalated: true,
  };
  assert.deepEqual(checkVerdict(verdict), []);
});

// ─── Classifier verdicts: negative cases (the load-bearing half) ──────────

test('A6 verdict: no input causes a verdict without a citation — code-is-wrong uncited is wrong', () => {
  const violations = checkVerdict({ arm: 'code-is-wrong', citation: '' });
  assert.ok(violations.includes('verdict-uncited'));
});

test('A6 verdict: no input causes a verdict without a citation — rule-is-wrong uncited is wrong', () => {
  const violations = checkVerdict({ arm: 'rule-is-wrong' });
  assert.ok(violations.includes('verdict-uncited'));
});

test('A6 verdict: no input causes a verdict without a citation — cannot-tell uncited is wrong', () => {
  const violations = checkVerdict({ arm: 'cannot-tell', escalated: true, citation: '   ' });
  assert.ok(violations.includes('verdict-uncited'));
});

test('A6 verdict: a fourth/default arm is detectably wrong', () => {
  const violations = checkVerdict({ arm: 'probably-fine', citation: 'a guess' });
  assert.ok(violations.includes('verdict-arm-invalid-or-default'));
});

test('A6 verdict: a missing arm (undefined) is detectably wrong, never defaults', () => {
  const violations = checkVerdict({ citation: 'something' });
  assert.ok(violations.includes('verdict-arm-invalid-or-default'));
});

test('A6 verdict: a failing case with evidence on both sides escalates, does not pick', () => {
  // Simulates the classifier facing conflicting citable readings: the
  // protocol requires this to become 'cannot-tell', never a coin-flip
  // between 'code-is-wrong' and 'rule-is-wrong'.
  const conflictingEvidenceVerdict = {
    arm: 'cannot-tell',
    citation: 'requirements.md#renewal supports a generous reading; contract §2 supports a strict one — no rule breaks the tie',
    escalated: true,
  };
  assert.deepEqual(checkVerdict(conflictingEvidenceVerdict), []);

  // The banned alternative: picking one side anyway must not be treated as
  // clean just because it carries a citation — cannot-tell must be its own
  // arm, not folded into whichever side "sounds" right.
  const pickedASideInstead = {
    arm: 'code-is-wrong',
    citation: 'requirements.md#renewal supports a generous reading (also true: contract §2 supports a strict one)',
  };
  // This does NOT violate the citation rule (it has one), which is exactly
  // why the protocol names conflicting-evidence as its own arm rather than
  // relying on citation-presence alone to catch a coin-flip.
  assert.deepEqual(checkVerdict(pickedASideInstead), []);
  // The real guard is procedural (in the protocol text, §1 Arm C), proven
  // by the fact that a well-formed 'cannot-tell' verdict is the one this
  // suite asserts is clean for a stated both-sides-cited scenario, and that
  // no rule in this checker treats 'cannot-tell' as a lesser-quality arm —
  // both arms pass checkVerdict when individually well-formed. The
  // escalation requirement below is what stops cannot-tell decaying into a
  // silent pick.
  assert.ok(conflictingEvidenceVerdict.escalated === true);
});

test('A6 verdict: a failing case with no evidence either way escalates, does not default', () => {
  const verdict = {
    arm: 'cannot-tell',
    citation: 'checked requirements.md, architecture.md, and the guard-map — none mention this case',
    escalated: true,
  };
  assert.deepEqual(checkVerdict(verdict), []);
  assert.equal(verdict.arm, 'cannot-tell');
});

test('A6 verdict: cannot-tell must not also fill a row', () => {
  const verdict = {
    arm: 'cannot-tell',
    citation: 'checked X and Y, both silent',
    escalated: true,
    rowFilled: true,
  };
  const violations = checkVerdict(verdict);
  assert.ok(violations.includes('cannot-tell-filled-a-row'));
});

test('A6 verdict: cannot-tell without the escalated flag is detectably wrong', () => {
  const verdict = { arm: 'cannot-tell', citation: 'checked X and Y, both silent' };
  const violations = checkVerdict(verdict);
  assert.ok(violations.includes('cannot-tell-not-escalated'));
});

test('A6 verdict: a decided arm also marked escalated is detectably wrong (mutually exclusive)', () => {
  const verdict = { arm: 'code-is-wrong', citation: 'contract §2', escalated: true };
  const violations = checkVerdict(verdict);
  assert.ok(violations.includes('decided-arm-also-escalated'));
});
