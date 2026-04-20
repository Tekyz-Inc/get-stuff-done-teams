'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compactToTarget,
  TaskBriefTooLarge,
  DROP_ORDER,
  NON_DROPPABLE,
  byteLength
} = require('../bin/gsd-t-task-brief-compactor.cjs');

function makeSections(overrides) {
  return {
    preamble: 'P',
    taskStatement: 'T',
    scope: 'S',
    constraintsMustFollow: 'MF',
    constraintsExtra: 'extra',
    contractExcerpts: 'CE',
    stackRules: 'SR',
    completionSpec: 'DS',
    cwdInvariant: 'CWD',
    ...overrides
  };
}

test('under budget: no trim', () => {
  const s = makeSections();
  const out = compactToTarget(s, 10000);
  assert.deepEqual(out, s);
});

test('over budget: drops stackRules first', () => {
  const s = makeSections({
    stackRules: 'X'.repeat(500),
    contractExcerpts: 'Y'.repeat(200)
  });
  const total = byteLength(s.stackRules) + byteLength(s.contractExcerpts) + 50;
  const out = compactToTarget(s, total - byteLength(s.stackRules) + 10);
  assert.equal(out.stackRules, '');
  assert.equal(out.contractExcerpts, s.contractExcerpts);
});

test('over budget: drops contractExcerpts after stackRules', () => {
  const s = makeSections({
    stackRules: 'X'.repeat(500),
    contractExcerpts: 'Y'.repeat(500)
  });
  const out = compactToTarget(s, 100);
  assert.equal(out.stackRules, '');
  assert.equal(out.contractExcerpts, '');
});

test('over budget: drops constraintsExtra after contracts + stack', () => {
  const s = makeSections({
    stackRules: 'X'.repeat(500),
    contractExcerpts: 'Y'.repeat(500),
    constraintsExtra: 'Z'.repeat(500)
  });
  const out = compactToTarget(s, 50);
  assert.equal(out.stackRules, '');
  assert.equal(out.contractExcerpts, '');
  assert.equal(out.constraintsExtra, '');
});

test('non-droppable sections preserved even under extreme budget', () => {
  const s = makeSections({
    stackRules: 'X'.repeat(5000),
    contractExcerpts: 'Y'.repeat(5000)
  });
  const out = compactToTarget(s, 50);
  assert.equal(out.preamble, 'P');
  assert.equal(out.taskStatement, 'T');
  assert.equal(out.scope, 'S');
  assert.equal(out.constraintsMustFollow, 'MF');
  assert.equal(out.completionSpec, 'DS');
  assert.equal(out.cwdInvariant, 'CWD');
});

test('non-droppable alone exceeds budget: throws TaskBriefTooLarge', () => {
  const s = makeSections({
    preamble: 'P'.repeat(10000),
    stackRules: '',
    contractExcerpts: '',
    constraintsExtra: ''
  });
  try {
    compactToTarget(s, 500);
    assert.fail('should throw');
  } catch (err) {
    assert.ok(err instanceof TaskBriefTooLarge);
    assert.ok(err.breakdown);
    assert.ok(err.breakdown.nonDroppable);
    assert.ok(err.breakdown.ndTotal > 500);
  }
});

test('DROP_ORDER: matches contract', () => {
  assert.deepEqual([...DROP_ORDER], ['stackRules', 'contractExcerpts', 'constraintsExtra']);
});

test('NON_DROPPABLE: matches contract', () => {
  assert.deepEqual([...NON_DROPPABLE], [
    'preamble', 'taskStatement', 'scope', 'constraintsMustFollow', 'completionSpec', 'cwdInvariant'
  ]);
});

test('invalid args throw', () => {
  assert.throws(() => compactToTarget(null, 100), /sections/);
  assert.throws(() => compactToTarget({}, 0), /maxBytes/);
  assert.throws(() => compactToTarget({}, -1), /maxBytes/);
});
