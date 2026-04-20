'use strict';

const SECTION_HEADERS = Object.freeze({
  task: '## Task',
  scope: '## Scope',
  constraints: '## Constraints',
  contracts: '## Contracts',
  stackRules: '## Stack Rules',
  doneSignal: '## Done Signal',
  cwd: '## CWD Invariant'
});

const CWD_INVARIANT_BODY = [
  'As your FIRST bash action, run: `pwd`',
  'If the output does not equal {projectDir}, STOP and fail fast. Do not proceed.',
  'If you must `cd` into a subdirectory, do it inside a subshell `(cd ... && ...)` so the parent cwd is preserved.'
].join('\n');

const PREAMBLE_TEMPLATE = [
  'You are a GSD-T orchestrator worker. You have ONE task. You will not be asked to do anything else.',
  '',
  'Project: {projectName}',
  'Milestone: {milestone}',
  'Domain: {domain}',
  'Task: {taskId}',
  'Expected branch: {expectedBranch}',
  'Project dir: {projectDir}',
  '',
  'Operate under --dangerously-skip-permissions. Be autonomous. Do not ask questions. Commit your work on the expected branch before exiting.'
].join('\n');

function renderPreamble(fields) {
  const required = ['projectName', 'milestone', 'domain', 'taskId', 'expectedBranch', 'projectDir'];
  for (const k of required) {
    if (!fields || fields[k] == null || fields[k] === '') {
      throw new Error(`renderPreamble requires ${k}`);
    }
  }
  return PREAMBLE_TEMPLATE.replace(/\{(\w+)\}/g, (_, key) => fields[key]);
}

function renderCwdInvariant(projectDir) {
  if (!projectDir) throw new Error('renderCwdInvariant requires projectDir');
  return CWD_INVARIANT_BODY.replace('{projectDir}', projectDir);
}

function renderTemplate(sections) {
  const {
    preamble,
    taskStatement,
    scope,
    constraints,
    contractExcerpts,
    stackRules,
    completionSpec,
    cwdInvariant
  } = sections || {};

  if (!preamble) throw new Error('renderTemplate requires preamble');
  if (!taskStatement) throw new Error('renderTemplate requires taskStatement');
  if (!scope) throw new Error('renderTemplate requires scope');
  if (!constraints) throw new Error('renderTemplate requires constraints');
  if (!completionSpec) throw new Error('renderTemplate requires completionSpec');
  if (!cwdInvariant) throw new Error('renderTemplate requires cwdInvariant');

  const parts = [
    preamble,
    '',
    `${SECTION_HEADERS.task}\n${taskStatement.trim()}`,
    '',
    `${SECTION_HEADERS.scope}\n${scope.trim()}`,
    '',
    `${SECTION_HEADERS.constraints}\n${constraints.trim()}`
  ];

  if (contractExcerpts && contractExcerpts.trim()) {
    parts.push('', `${SECTION_HEADERS.contracts}\n${contractExcerpts.trim()}`);
  }
  if (stackRules && stackRules.trim()) {
    parts.push('', `${SECTION_HEADERS.stackRules}\n${stackRules.trim()}`);
  }

  parts.push('', `${SECTION_HEADERS.doneSignal}\n${completionSpec.trim()}`);
  parts.push('', `${SECTION_HEADERS.cwd}\n${cwdInvariant.trim()}`);

  return parts.join('\n') + '\n';
}

module.exports = {
  SECTION_HEADERS,
  CWD_INVARIANT_BODY,
  PREAMBLE_TEMPLATE,
  renderPreamble,
  renderCwdInvariant,
  renderTemplate
};
