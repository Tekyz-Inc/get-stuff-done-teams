'use strict';
/**
 * Regression: isMilestoneComplete must rely on STRUCTURED anchors in
 * progress.md (the `## Status:` header and the Milestones table row),
 * NOT on prose grep. The old prose-grep impl false-positived on Decision
 * Log entries that mentioned a milestone id and the word "complete" on
 * the same line — which caused the supervisor to declare M43 done after
 * iter 1 (2026-04-21 22:50–23:00 session). See progress.md 23:25 entry.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { isMilestoneComplete } = require('../bin/gsd-t-unattended.cjs');

function withTmpProgress(body, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-mscomp-'));
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), body);
  try { return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('isMilestoneComplete returns true when Status header phase is COMPLETE', () => {
  const body = [
    '# GSD-T Progress',
    '## Status: M43 COMPLETE — all done',
    '## Milestones',
    '| # | Milestone | Status | Version | Domains |',
    '|---|---|---|---|---|',
    '| M43 | Foo | EXECUTING | 1.0 | x |',
  ].join('\n');
  withTmpProgress(body, (dir) => {
    assert.equal(isMilestoneComplete(dir, 'M43'), true);
  });
});

test('isMilestoneComplete returns true when Milestones-table row is COMPLETE', () => {
  const body = [
    '# GSD-T Progress',
    '## Status: M44 PARTITIONED — next thing',
    '## Milestones',
    '| # | Milestone | Status | Version | Domains |',
    '|---|---|---|---|---|',
    '| M43 | Foo | COMPLETE | 1.2.3 | x |',
    '| M44 | Bar | PARTITIONED | 1.3.0 (target) | y |',
  ].join('\n');
  withTmpProgress(body, (dir) => {
    assert.equal(isMilestoneComplete(dir, 'M43'), true);
  });
});

test('isMilestoneComplete returns false when Status is non-terminal (PARTITIONED)', () => {
  const body = [
    '# GSD-T Progress',
    '## Status: M43 PARTITIONED — Token Attribution',
    '## Milestones',
    '| # | Milestone | Status | Version | Domains |',
    '|---|---|---|---|---|',
    '| M43 | Foo | PARTITIONED | 3.17.10 (target) | 6 |',
  ].join('\n');
  withTmpProgress(body, (dir) => {
    assert.equal(isMilestoneComplete(dir, 'M43'), false);
  });
});

test('isMilestoneComplete returns false when Decision Log prose mentions {id} + "complete"', () => {
  // This is the exact false-positive that caused the 2026-04-21 premature
  // done. The Decision Log mentioning M43 alongside the word "complete"
  // in passing must NOT satisfy the check.
  const body = [
    '# GSD-T Progress',
    '## Status: M43 PARTITIONED — in flight',
    '## Milestones',
    '| # | Milestone | Status | Version | Domains |',
    '|---|---|---|---|---|',
    '| M43 | Foo | PARTITIONED | x | y |',
    '## Decision Log',
    '- 2026-04-20: M42 COMPLETED — awaiting user direction for M43.',
    '- 2026-04-21: M43 partition committed; D3 Foundation complete in iter 1.',
    '- 2026-04-21: [quick · M43-D6-pre] live tee work — completed in this iter.',
  ].join('\n');
  withTmpProgress(body, (dir) => {
    assert.equal(isMilestoneComplete(dir, 'M43'), false,
      'Decision Log prose must not satisfy milestone-complete');
  });
});

test('isMilestoneComplete returns false when {id} is missing entirely', () => {
  const body = [
    '# GSD-T Progress',
    '## Status: M44 PARTITIONED',
    '## Milestones',
    '| # | Milestone | Status | Version | Domains |',
    '|---|---|---|---|---|',
    '| M44 | Bar | PARTITIONED | x | y |',
  ].join('\n');
  withTmpProgress(body, (dir) => {
    assert.equal(isMilestoneComplete(dir, 'M43'), false);
  });
});

test('isMilestoneComplete handles UNKNOWN id and missing file', () => {
  withTmpProgress('## Status: M43 COMPLETE', (dir) => {
    assert.equal(isMilestoneComplete(dir, 'UNKNOWN'), false);
    assert.equal(isMilestoneComplete(dir, ''), false);
    assert.equal(isMilestoneComplete(dir, null), false);
  });
  // Missing progress.md
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-mscomp-'));
  try {
    assert.equal(isMilestoneComplete(dir, 'M43'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isMilestoneComplete recognizes COMPLETED, DONE, VERIFIED as terminal', () => {
  for (const phase of ['COMPLETE', 'COMPLETED', 'DONE', 'VERIFIED']) {
    const body = [
      '## Status: M43 ' + phase + ' — fini',
      '## Milestones',
      '| # | Milestone | Status | Version | Domains |',
      '|---|---|---|---|---|',
      '| M43 | x | PARTITIONED | y | z |',
    ].join('\n');
    withTmpProgress(body, (dir) => {
      assert.equal(isMilestoneComplete(dir, 'M43'), true,
        `phase=${phase} should be terminal`);
    });
  }
});

test('isMilestoneComplete reads the live progress.md for M42 (always-complete sanity)', () => {
  // M42 is the oldest stable terminal milestone we can rely on as a fixed
  // anchor. Newer milestones (M43, M44, ...) cycle through PARTITIONED ->
  // COMPLETE on the live file, so asserting their state here turns this
  // into a snapshot test that silently goes stale every release.
  const repoDir = path.resolve(__dirname, '..');
  if (!fs.existsSync(path.join(repoDir, '.gsd-t', 'progress.md'))) return;
  assert.equal(isMilestoneComplete(repoDir, 'M42'), true,
    'live progress.md says M42 is COMPLETE');
});
