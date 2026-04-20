'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SECTION_HEADERS,
  CWD_INVARIANT_BODY,
  PREAMBLE_TEMPLATE,
  renderPreamble,
  renderCwdInvariant,
  renderTemplate
} = require('../bin/gsd-t-task-brief-template.cjs');

test('renderPreamble: substitutes all fields', () => {
  const out = renderPreamble({
    projectName: 'GSD-T',
    milestone: 'M40',
    domain: 'd1-orchestrator-core',
    taskId: 'd1-t3',
    expectedBranch: 'main',
    projectDir: '/abs/path'
  });
  assert.ok(out.includes('Project: GSD-T'));
  assert.ok(out.includes('Milestone: M40'));
  assert.ok(out.includes('Domain: d1-orchestrator-core'));
  assert.ok(out.includes('Task: d1-t3'));
  assert.ok(out.includes('Expected branch: main'));
  assert.ok(out.includes('Project dir: /abs/path'));
  assert.ok(out.includes('--dangerously-skip-permissions'));
  assert.ok(!out.includes('{projectName}'));
});

test('renderPreamble: missing field throws', () => {
  assert.throws(() => renderPreamble({ projectName: 'x' }), /requires/);
});

test('renderCwdInvariant: substitutes projectDir', () => {
  const out = renderCwdInvariant('/my/dir');
  assert.ok(out.includes('If the output does not equal /my/dir'));
  assert.ok(out.includes('pwd'));
  assert.ok(out.includes('subshell'));
});

test('renderCwdInvariant: no projectDir throws', () => {
  assert.throws(() => renderCwdInvariant(''), /requires/);
});

test('renderTemplate: full render has all required sections in order', () => {
  const out = renderTemplate({
    preamble: 'PREAMBLE',
    taskStatement: 'Do the thing',
    scope: 'Owned: foo.js',
    constraints: 'Must not: delete files',
    contractExcerpts: 'Contract A says X',
    stackRules: 'Type hints required',
    completionSpec: 'All 5 signals',
    cwdInvariant: 'pwd check'
  });
  const idxTask = out.indexOf(SECTION_HEADERS.task);
  const idxScope = out.indexOf(SECTION_HEADERS.scope);
  const idxConstraints = out.indexOf(SECTION_HEADERS.constraints);
  const idxContracts = out.indexOf(SECTION_HEADERS.contracts);
  const idxStack = out.indexOf(SECTION_HEADERS.stackRules);
  const idxDone = out.indexOf(SECTION_HEADERS.doneSignal);
  const idxCwd = out.indexOf(SECTION_HEADERS.cwd);

  assert.ok(idxTask > 0);
  assert.ok(idxTask < idxScope);
  assert.ok(idxScope < idxConstraints);
  assert.ok(idxConstraints < idxContracts);
  assert.ok(idxContracts < idxStack);
  assert.ok(idxStack < idxDone);
  assert.ok(idxDone < idxCwd);
});

test('renderTemplate: optional sections omitted when empty', () => {
  const out = renderTemplate({
    preamble: 'PREAMBLE',
    taskStatement: 'Do it',
    scope: 'scope',
    constraints: 'cons',
    completionSpec: 'done',
    cwdInvariant: 'pwd'
  });
  assert.ok(!out.includes(SECTION_HEADERS.contracts));
  assert.ok(!out.includes(SECTION_HEADERS.stackRules));
  assert.ok(out.includes(SECTION_HEADERS.task));
  assert.ok(out.includes(SECTION_HEADERS.doneSignal));
  assert.ok(out.includes(SECTION_HEADERS.cwd));
});

test('renderTemplate: missing required section throws', () => {
  assert.throws(() => renderTemplate({
    preamble: 'P',
    taskStatement: 'T',
    scope: 'S',
    constraints: 'C',
    completionSpec: 'D'
    // missing cwdInvariant
  }), /cwdInvariant/);
});

test('CWD_INVARIANT_BODY: verbatim prose from contract', () => {
  assert.ok(CWD_INVARIANT_BODY.includes('As your FIRST bash action, run: `pwd`'));
  assert.ok(CWD_INVARIANT_BODY.includes('STOP and fail fast'));
  assert.ok(CWD_INVARIANT_BODY.includes('subshell'));
});

test('PREAMBLE_TEMPLATE: contains all token placeholders', () => {
  for (const k of ['projectName','milestone','domain','taskId','expectedBranch','projectDir']) {
    assert.ok(PREAMBLE_TEMPLATE.includes(`{${k}}`), `missing {${k}}`);
  }
});
