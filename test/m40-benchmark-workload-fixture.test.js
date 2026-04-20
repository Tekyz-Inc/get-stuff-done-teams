'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { readAllTasks, groupByWave, validateNoForwardDeps } = require('../bin/gsd-t-orchestrator-queue.cjs');
const { buildTaskBrief } = require('../bin/gsd-t-task-brief.js');

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures', 'm40-benchmark-workload');

test('benchmark fixture: directory layout is present', () => {
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, 'README.md')));
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, '.gsd-t', 'contracts', 'completion-signal-contract.md')));
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, '.gsd-t', 'domains', 'bench-d1', 'scope.md')));
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, '.gsd-t', 'domains', 'bench-d1', 'constraints.md')));
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, '.gsd-t', 'domains', 'bench-d1', 'tasks.md')));
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, 'package.json')), 'fixture must define npm test');
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, 'test', 'run.js')), 'fixture must ship a test runner');
  assert.ok(fs.existsSync(path.join(FIXTURE_DIR, '.gitignore')), 'fixture must ignore orchestrator byproducts');
});

test('benchmark fixture: .gitignore excludes orchestrator byproducts', () => {
  const ig = fs.readFileSync(path.join(FIXTURE_DIR, '.gitignore'), 'utf8');
  for (const needle of ['.gsd-t/events/', '.gsd-t/orchestrator/', 'heartbeat-']) {
    assert.ok(ig.includes(needle), `.gitignore must exclude ${needle}`);
  }
});

test('benchmark fixture: tasks carry ownedPatterns from Files: field', () => {
  const tasks = readAllTasks(FIXTURE_DIR);
  for (const t of tasks) {
    assert.ok(Array.isArray(t.ownedPatterns) && t.ownedPatterns.length >= 2,
      `${t.id} should have at least 2 owned patterns (output file + test file)`);
  }
});

test('benchmark fixture: tasks.md parses cleanly (4 tasks, 2 waves)', () => {
  const tasks = readAllTasks(FIXTURE_DIR);
  assert.equal(tasks.length, 4);
  const waves = groupByWave(tasks);
  assert.equal(waves.get(0).length, 2);
  assert.equal(waves.get(1).length, 2);
});

test('benchmark fixture: wave deps are valid (no forward cross-wave deps)', () => {
  const tasks = readAllTasks(FIXTURE_DIR);
  assert.doesNotThrow(() => validateNoForwardDeps(tasks));
});

test('benchmark fixture: buildTaskBrief produces a valid brief for T1', () => {
  const brief = buildTaskBrief({
    milestone: 'M40-bench',
    domain: 'bench-d1',
    taskId: 'bench-d1-t1',
    projectDir: FIXTURE_DIR,
    expectedBranch: 'main'
  });
  assert.ok(brief.includes('## Task'));
  assert.ok(brief.includes('Generate out/a.txt'));
  assert.ok(brief.includes('## Done Signal'));
  assert.ok(brief.includes('## CWD Invariant'));
  assert.ok(Buffer.byteLength(brief, 'utf8') <= 10000);
});

test('benchmark fixture: buildTaskBrief produces valid briefs for all 4 tasks', () => {
  for (let i = 1; i <= 4; i++) {
    const brief = buildTaskBrief({
      milestone: 'M40-bench',
      domain: 'bench-d1',
      taskId: `bench-d1-t${i}`,
      projectDir: FIXTURE_DIR
    });
    assert.ok(brief.length > 500, `T${i} brief should be non-trivial`);
    assert.ok(brief.includes('## Done Signal'), `T${i} must include Done Signal`);
  }
});
