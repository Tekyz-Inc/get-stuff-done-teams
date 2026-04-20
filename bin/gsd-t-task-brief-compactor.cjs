'use strict';

const DROP_ORDER = Object.freeze([
  'stackRules',
  'contractExcerpts',
  'constraintsExtra'
]);

const NON_DROPPABLE = Object.freeze([
  'preamble',
  'taskStatement',
  'scope',
  'constraintsMustFollow',
  'completionSpec',
  'cwdInvariant'
]);

class TaskBriefTooLarge extends Error {
  constructor(msg, breakdown) {
    super(msg);
    this.name = 'TaskBriefTooLarge';
    this.breakdown = breakdown;
  }
}

function byteLength(str) {
  return Buffer.byteLength(str || '', 'utf8');
}

function computeBreakdown(sections) {
  const breakdown = {};
  let total = 0;
  for (const k of Object.keys(sections)) {
    const b = byteLength(sections[k]);
    breakdown[k] = b;
    total += b;
  }
  breakdown.__total = total;
  return breakdown;
}

function compactToTarget(sections, maxBytes) {
  if (!sections || typeof sections !== 'object') {
    throw new Error('compactToTarget requires sections object');
  }
  if (typeof maxBytes !== 'number' || maxBytes <= 0) {
    throw new Error('compactToTarget requires maxBytes > 0');
  }

  const out = { ...sections };
  const total = () => {
    let sum = 0;
    for (const k of Object.keys(out)) sum += byteLength(out[k]);
    return sum;
  };

  if (total() <= maxBytes) return out;

  for (const key of DROP_ORDER) {
    if (out[key]) {
      out[key] = '';
      if (total() <= maxBytes) return out;
    }
  }

  const nonDroppable = {};
  let ndTotal = 0;
  for (const k of NON_DROPPABLE) {
    const b = byteLength(out[k]);
    nonDroppable[k] = b;
    ndTotal += b;
  }
  if (ndTotal > maxBytes) {
    throw new TaskBriefTooLarge(
      `Non-droppable sections (${ndTotal} bytes) exceed maxBytes (${maxBytes})`,
      { nonDroppable, maxBytes, ndTotal }
    );
  }

  return out;
}

module.exports = {
  compactToTarget,
  TaskBriefTooLarge,
  DROP_ORDER,
  NON_DROPPABLE,
  byteLength
};
