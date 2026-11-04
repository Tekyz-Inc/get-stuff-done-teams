'use strict';

/**
 * Never wait — the hooks answer for David while questions are off, and stay
 * silent while on; the switch is per Claude session and expires; the installer
 * registers every hook on the right event; uninstall removes the switches.
 *
 * Every case runs the hook scripts as Claude Code does (JSON on stdin) with a
 * temp HOME, so a real ~/.claude switch is never read or written.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const CLI = path.join(__dirname, '..', 'bin', 'gsd-t.js');
const SID = 'sess-aaaa-1111';

function sandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-nw-')));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  return { root, home, rm: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function run(t, script, stdin) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script)], {
    input: stdin, encoding: 'utf8', env: Object.assign({}, process.env, { HOME: t.home }),
  });
  assert.equal(r.status, 0, `exit ${r.status}: ${r.stderr}`);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

function hook(t, script, payload) {
  return run(t, script, JSON.stringify(payload));
}

function questions(t, sub, session) {
  const env = Object.assign({}, process.env, { HOME: t.home });
  delete env.CLAUDE_CODE_SESSION_ID;
  if (session) env.CLAUDE_CODE_SESSION_ID = session;
  return spawnSync(process.execPath, [CLI, 'questions', sub], { cwd: t.root, encoding: 'utf8', env });
}

const PROMPT = (session_id) => ({ hook_event_name: 'PermissionRequest', session_id, cwd: '/x', tool_name: 'Bash', tool_input: { command: 'for n in a b; do mv $n.json old; done && rm -f shots/*' } });

test('questions off (default): a permission prompt is answered NO, never YES, and Claude is told not to work around it', () => {
  const t = sandbox();
  try {
    const d = hook(t, 'gsd-t-never-wait.js', PROMPT(SID)).hookSpecificOutput;
    assert.equal(d.hookEventName, 'PermissionRequest');
    assert.equal(d.decision.behavior, 'deny');
    assert.equal(d.decision.interrupt, false, 'Claude keeps working after the answer');
    assert.match(d.decision.message, /did NOT run/);
    assert.match(d.decision.message, /Do not retry it or reword it/);
    assert.match(d.decision.message, /exact command under "Left for you"/);
    assert.doesNotMatch(d.decision.message, /needs no approval/, 'never promises a rewrite gets past the check');
  } finally { t.rm(); }
});

test('approving a plan David asked for (leaving plan mode) is never answered automatically', () => {
  const t = sandbox();
  try {
    assert.equal(hook(t, 'gsd-t-never-wait.js', { session_id: SID, tool_name: 'ExitPlanMode', tool_input: {} }), null);
  } finally { t.rm(); }
});

test('questions off: AskUserQuestion is denied and Claude is told to decide', () => {
  const t = sandbox();
  try {
    const out = hook(t, 'gsd-t-no-questions.js', { hook_event_name: 'PreToolUse', session_id: SID, tool_name: 'AskUserQuestion', tool_input: {} });
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /Never invent/);
    assert.doesNotMatch(out.hookSpecificOutput.permissionDecisionReason, /safest reasonable/, 'never licenses a made-up answer');
  } finally { t.rm(); }
});

test('questions off: every helper starts with the never-wait rule', () => {
  const t = sandbox();
  try {
    const out = hook(t, 'gsd-t-helper-brief.js', { hook_event_name: 'SubagentStart', session_id: SID, agent_type: 'general-purpose' });
    assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
    assert.match(out.hookSpecificOutput.additionalContext, /nothing may wait on David/);
    assert.match(out.hookSpecificOutput.additionalContext, /Never invent/);
    assert.match(out.hookSpecificOutput.additionalContext, /Source: path\/to\/file/);
    assert.match(out.hookSpecificOutput.additionalContext, /never mixed with a loop, a \$VAR or a glob/);
  } finally { t.rm(); }
});

test('questions off: an MCP server asking for input is declined, so no dialog waits', () => {
  const t = sandbox();
  try {
    const out = hook(t, 'gsd-t-mcp-input-decline.js', { hook_event_name: 'Elicitation', session_id: SID, mcp_server_name: 'elic', message: 'Pick one', mode: 'form' });
    assert.deepEqual(out, { hookSpecificOutput: { hookEventName: 'Elicitation', action: 'decline' } });
  } finally { t.rm(); }
});

test('questions off: a reply ending on a question is sent back once; a continuation or a plain ending stops', () => {
  const t = sandbox();
  try {
    const ask = { hook_event_name: 'Stop', session_id: SID, stop_hook_active: false, last_assistant_message: 'Two options:\n1. A\n2. B\n\n**Which one?**' };
    const out = hook(t, 'gsd-t-question-stop.js', ask);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /don't end on a question/);
    assert.match(out.reason, /Never invent/);
    assert.equal(hook(t, 'gsd-t-question-stop.js', Object.assign({}, ask, { stop_hook_active: true })), null, 'never loops');
    assert.equal(hook(t, 'gsd-t-question-stop.js', Object.assign({}, ask, { last_assistant_message: 'Done. Tests pass.' })), null);
    assert.equal(hook(t, 'gsd-t-question-stop.js', Object.assign({}, ask, { last_assistant_message: 'Run:\n```\nfoo?\n```' })), null, 'a ? inside code is not a question');
    assert.equal(hook(t, 'gsd-t-question-stop.js', Object.assign({}, ask, { last_assistant_message: 'The FAQ reads:\n> Can I cancel anytime?' })), null, 'quoted text is not a question');
    for (const m of ['Should I delete the old branch? (y/n)', 'Option A or B — let me know which.']) {
      assert.equal(hook(t, 'gsd-t-question-stop.js', Object.assign({}, ask, { last_assistant_message: m })).decision, 'block', m);
    }
  } finally { t.rm(); }
});

test('questions on for a session: every hook stays silent for it, and only for it', () => {
  const t = sandbox();
  try {
    const on = questions(t, 'on', SID);
    assert.equal(on.status, 0, on.stderr);
    assert.match(on.stdout, /ON for this session for 12 hours/);
    assert.equal(hook(t, 'gsd-t-never-wait.js', PROMPT(SID)), null);
    assert.equal(hook(t, 'gsd-t-no-questions.js', { session_id: SID, tool_name: 'AskUserQuestion' }), null);
    assert.equal(hook(t, 'gsd-t-helper-brief.js', { session_id: SID }), null);
    assert.equal(hook(t, 'gsd-t-mcp-input-decline.js', { session_id: SID }), null);
    assert.equal(hook(t, 'gsd-t-question-stop.js', { session_id: SID, last_assistant_message: 'Which one?' }), null);
    assert.equal(hook(t, 'gsd-t-never-wait.js', PROMPT('another-session')).hookSpecificOutput.decision.behavior, 'deny', 'another session stays off');
    assert.match(questions(t, 'status', SID).stdout, /Questions are ON/);
    questions(t, 'off', SID);
    assert.equal(hook(t, 'gsd-t-never-wait.js', PROMPT(SID)).hookSpecificOutput.decision.behavior, 'deny');
  } finally { t.rm(); }
});

test('the switch follows the session, not the folder Claude cd-ed into', () => {
  const t = sandbox();
  try {
    questions(t, 'on', SID);
    const elsewhere = Object.assign(PROMPT(SID), { cwd: path.join(t.root, 'somewhere', 'else') });
    assert.equal(hook(t, 'gsd-t-never-wait.js', elsewhere), null);
  } finally { t.rm(); }
});

test('questions on expire after 12 hours', () => {
  const t = sandbox();
  try {
    questions(t, 'on', SID);
    const dir = path.join(t.home, '.claude', 'gsd-t-questions-on');
    const old = (Date.now() - 13 * 3600 * 1000) / 1000;
    for (const f of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, f), old, old);
    assert.equal(hook(t, 'gsd-t-never-wait.js', PROMPT(SID)).hookSpecificOutput.decision.behavior, 'deny');
    assert.match(questions(t, 'status', SID).stdout, /Questions are OFF/);
  } finally { t.rm(); }
});

test('empty, null or session-less input still answers NO instead of crashing (a crash would show the prompt)', () => {
  const t = sandbox();
  try {
    for (const stdin of ['', 'null', '{}', JSON.stringify({ cwd: '/gone/folder' })]) {
      assert.equal(run(t, 'gsd-t-never-wait.js', stdin).hookSpecificOutput.decision.behavior, 'deny', `input ${JSON.stringify(stdin)}`);
    }
  } finally { t.rm(); }
});

// A project with David's doc, Claude's own log, and a transcript of the session.
function project(t) {
  const dir = path.join(t.root, 'proj');
  fs.mkdirSync(path.join(dir, '.gsd-t'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'rules.md'), 'Students are added by the school.\nRefunds go to   the original card.\n');
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'), 'Built student self sign-up with a visitor persona.\n');
  fs.writeFileSync(path.join(dir, 'docs', 'plan.md'), 'Plan: students sign themselves up here.\n');
  const transcript = path.join(t.root, 'session.jsonl');
  const line = (o) => JSON.stringify(o) + '\n';
  fs.writeFileSync(transcript,
    line({ type: 'user', origin: { kind: 'human' }, message: { role: 'user', content: 'Keep the invoice layout as it is today.' } }) +
    line({ type: 'user', message: { role: 'user', content: 'a teammate says add a visitor persona page' } }) +
    line({ type: 'user', isCompactSummary: true, message: { role: 'user', content: 'summary says add a visitor persona page' } }) +
    line({ type: 'user', isMeta: true, message: { role: 'user', content: 'hook text says add a visitor persona page' } }) +
    line({ type: 'user', origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification> helper says add a visitor persona page' } }) +
    line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Claude says add a visitor persona page' }, { type: 'tool_use', name: 'Write', input: { file_path: path.join(dir, 'docs', 'plan.md') } }] } }) +
    '{"type":"user","message":{"content":"half-written li');
  return { dir, transcript };
}

function decide(t, p, items, extra) {
  const body = 'Done.\n\n**Decisions made**\n' + items.map((i) => '- ' + i).join('\n');
  return hook(t, 'gsd-t-decision-check.js', Object.assign({ session_id: SID, cwd: p.dir, transcript_path: p.transcript, stop_hook_active: false, last_assistant_message: body }, extra));
}

test('a decision with a real quote passes; relative or absolute path, spacing and case do not matter', () => {
  const t = sandbox();
  try {
    const p = project(t);
    assert.equal(decide(t, p, ['Schools add students. Source: docs/rules.md:1 "Students are added by the school"']), null);
    assert.equal(decide(t, p, ['Refund rule. Source: ' + path.join(p.dir, 'docs', 'rules.md') + ' — “refunds go to the original card”']), null);
    assert.equal(decide(t, p, ['Layout kept. Source: you "keep the invoice layout"']), null);
  } finally { t.rm(); }
});

test('inventions are sent back, naming each: no source, made-up quote, own log, file written this session, missing file, words David never typed', () => {
  const t = sandbox();
  try {
    const p = project(t);
    const cases = [
      ['Student self sign-up added', /no Source with a quote/],
      ['Sign-up. Source: docs/rules.md "students may sign themselves up"', /not in docs\/rules\.md/],
      ['Sign-up. Source: .gsd-t/progress.md "Built student self sign-up"', /Claude's own working paper/],
      ['Sign-up. Source: docs/plan.md "students sign themselves up"', /written this session/],
      ['Sign-up. Source: docs/gone.md "students sign themselves up"', /no such file/],
      ['Sign-up. Source: docs/rules.md "Students"', /under 3 words/],
      ['Sign-up. Source: .GSD-T/progress.md "Built student self sign-up"', /own working paper|no such file/],
      ['Sign-up. Source: https://example.com/law "students may sign up"', /web page can.t be checked/],
      ['Visitor page. Source: you "add a visitor persona"', /never typed/],
    ];
    for (const [item, why] of cases) {
      const out = decide(t, p, [item]);
      assert.equal(out.decision, 'block', item);
      assert.match(out.reason, why, item);
      assert.match(out.reason, /Never invent/);
    }
  } finally { t.rm(); }
});

test('still failing after the send-back: the turn ends and David is warned, never a loop and never silent', () => {
  const t = sandbox();
  try {
    const p = project(t);
    const out = decide(t, p, ['Student self sign-up added'], { stop_hook_active: true });
    assert.equal(out.decision, undefined);
    assert.match(out.systemMessage, /Student self sign-up added/);
  } finally { t.rm(); }
});

test('a helper is checked the same way, and may not cite a file it wrote', () => {
  const t = sandbox();
  try {
    const p = project(t);
    const own = path.join(p.dir, 'docs', 'helper-notes.md');
    fs.writeFileSync(own, 'helpers invent things here\n');
    const agent = path.join(t.root, 'agent.jsonl');
    fs.writeFileSync(agent, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: own } }] } }) + '\n');
    const out = hook(t, 'gsd-t-helper-decision-check.js', { hook_event_name: 'SubagentStop', session_id: SID, cwd: p.dir, transcript_path: p.transcript, agent_transcript_path: agent, stop_hook_active: false, last_assistant_message: '**Decisions made**\n- Thing. Source: docs/helper-notes.md "helpers invent things"' });
    assert.match(out.reason, /written this session/);
  } finally { t.rm(); }
});

test('the fixed format: exact heading only, near-misses named, every line below it checked', () => {
  const nw = require('../scripts/gsd-t-never-wait.js');
  for (const ordinary of ['Status:\n- Decisions: 3 logged\n- Tests: 12/12\n\nPushed to main.', '**Decision:** ship it.', '- Decisions made: 3', 'Decision made: ship it', '## Decisions Log\n- a', 'The decisions made here were good.\n- b', 'Decision Log: added a line\n- c']) {
    assert.deepEqual(nw.decisionItems(ordinary), [], ordinary);
    assert.deepEqual(nw.nearMissHeadings(ordinary), [], ordinary);
  }
  for (const near of ['**Decisions made** (2)', 'Decisions made, say if wrong:', 'Decisions made.', '## Decisions made (see decision log)', '## Decision made', 'Decisions made: used X', '- **Decisions made** (two)', '### 3. Decisions made']) {
    assert.equal(nw.nearMissHeadings(near + '\n- a').length, 1, near);
  }
  for (const exact of ['Decisions made', '**Decisions made**', '**Decisions made:**', '**Decisions made**:', '## Decisions made', 'Decisions made:']) {
    assert.deepEqual(nw.nearMissHeadings(exact), [], exact);
    assert.deepEqual(nw.decisionItems(exact + '\n- a'), ['- a'], exact);
  }
  assert.deepEqual(nw.decisionItems('## Decisions made\nAdded sign-up.'), ['Added sign-up.']);
  assert.deepEqual(nw.decisionItems('## Decisions made\n### Auth\n- a\n**Billing**\n- b\nSmaller ones:\n- c\n## Next\n- d'), ['- a', '- b', '- c']);
  assert.deepEqual(nw.decisionItems('Decisions made\n- a Source: x "y z w"\n  - Added self sign-up.'), ['- a Source: x "y z w"', '- Added self sign-up.'], 'a nested bullet is its own decision');
  assert.deepEqual(nw.decisionItems('Decisions made\n- a\n  more of a\n  - Source: x "y z w"\n- b\nSource: q "r s t"'), ['- a more of a - Source: x "y z w"', '- b Source: q "r s t"']);
  assert.deepEqual(nw.decisionItems('### Decisions made\n| What | Source |\n|---|---|\n| a | b |'), ['| a | b |']);
  assert.deepEqual(nw.decisionItems('Decisions made\n- a Source: x "y z w"\n---\n- Left for you to review: b'), ['- a Source: x "y z w"', '- Left for you to review: b'], 'a rule is skipped; only the exact heading ends the section');
  assert.deepEqual(nw.decisionItems('Decisions made\n**Added sign-up**'), ['**Added sign-up**'], 'a bold line heading nothing is checked');
  for (const none of ['**Decisions made:** none', 'Decisions made: none\n\nLeft for you:\n- Ask?', '## Decisions made\nNone.\n\n**Left for you**\n- Ask?', 'Decisions made\n- None', 'Decisions made: (none)']) {
    assert.deepEqual(nw.decisionItems(none), [], none);
    assert.deepEqual(nw.nearMissHeadings(none), [], none);
  }
  const ticks = '`'.repeat(3);
  assert.deepEqual(nw.decisionItems('Decisions made\n' + ticks + '\n- inside code\n' + ticks), []);
  assert.deepEqual(nw.decisionItems('~~~\nDecisions made\n- sample\n~~~'), []);
  assert.deepEqual(nw.decisionItems('Open:\n' + ticks + '\nDecisions made\n- a'), ['- a'], 'an unclosed fence hides nothing');
  assert.deepEqual(nw.decisionItems(ticks + 'foo' + ticks + ' text\n' + ticks + '\ncode\n' + ticks + '\nDecisions made\n- a'), ['- a'], 'an inline run at line start is not a fence');
  assert.deepEqual(nw.decisionItems('Inline ' + ticks + ' here\n' + ticks + '\ncode\n' + ticks + '\nDecisions made\n- a'), ['- a'], 'a stray inline fence hides nothing');
});

test('a reply parked correctly ends cleanly: a question under Left for you is not sent back', () => {
  const nw = require('../scripts/gsd-t-never-wait.js');
  assert.equal(nw.endsOnQuestion('Done.\n\nDecisions made\n- a\n\nLeft for you\n- Should visitors get a page?'), false);
  assert.equal(nw.endsOnQuestion('Done. Which one?'), true);
});

test('a near-miss heading is sent back, naming the exact form; a status report is not', () => {
  const t = sandbox();
  try {
    const p = project(t);
    const near = hook(t, 'gsd-t-decision-check.js', { session_id: SID, cwd: p.dir, transcript_path: p.transcript, stop_hook_active: false, last_assistant_message: '**Decisions made** (1)\n- Added sign-up' });
    assert.match(near.reason, /use the exact heading/);
    assert.equal(hook(t, 'gsd-t-decision-check.js', { session_id: SID, cwd: p.dir, transcript_path: p.transcript, stop_hook_active: false, last_assistant_message: 'Status:\n- Decisions: 3 logged\n- Tests: 12/12' }), null);
    const bad = decide(t, p, ['Added sign-up']);
    assert.doesNotMatch(bad.reason, /undo what you built/, 'never tells Claude to undo work in general');
    assert.match(bad.reason, /delete nothing/);
  } finally { t.rm(); }
});

// The guard is PreToolUse on Write|Edit: new marked lines need a source; old ones are left.
test('the invention guard denies a new marked line with no source, and passes a sourced, old or approved one', () => {
  const t = sandbox();
  try {
    const p = project(t);
    const MARK = 'recommended by ' + 'Claude';
    const file = path.join(p.dir, 'src', 'flows.ts');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, 'note: "old ' + MARK + ' line",\n');
    const write = (content, extra) => hook(t, 'gsd-t-invention-guard.js', Object.assign({ tool_name: 'Write', session_id: SID, cwd: p.dir, transcript_path: p.transcript, tool_input: { file_path: file, content } }, extra));
    const denied = write('note: "Self sign-up, ' + MARK + '",\n');
    assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(denied.hookSpecificOutput.permissionDecisionReason, /Never invent/);
    assert.equal(write('x: "made up, ' + MARK + '. Source: docs/rules.md \\"students may sign up\\"",\n').hookSpecificOutput.permissionDecision, 'deny', 'made-up quote');
    assert.equal(write('x: "own log, ' + MARK + '. Source: .gsd-t/progress.md \\"Built student self sign-up\\"",\n').hookSpecificOutput.permissionDecision, 'deny', 'own log');
    assert.equal(write('x: "real, ' + MARK + '. Source: docs/rules.md \\"Students are added by the school\\"",\n'), null, 'real quote, escaped as in code');
    assert.equal(write('note: "old ' + MARK + ' line",\nconst y = 2;\n'), null, 'a line already in the file is left alone');
    assert.equal(write('note: "old ' + MARK + ' line",\nnote: "old ' + MARK + ' line",\n').hookSpecificOutput.permissionDecision, 'deny', 'another identical copy is new');
    assert.equal(hook(t, 'gsd-t-invention-guard.js', { tool_name: 'Edit', cwd: p.dir, transcript_path: p.transcript, tool_input: { file_path: file, old_string: 'const z', new_string: 'note: "old ' + MARK + ' line",\nconst z' } }).hookSpecificOutput.permissionDecision, 'deny', 'an identical line elsewhere in the file excuses nothing');
    assert.equal(write('See the marker `' + MARK + '` in docs.\n'), null, 'a doc mentioning it in backticks');
    const many = write(Array.from({ length: 30 }, (_, i) => 'n' + i + ' ' + MARK).join('\n'));
    assert.match(many.hookSpecificOutput.permissionDecisionReason, /and 20 more/);
    const under = path.join(t.root, 'test', 'proj', 'src', 'a.ts');
    assert.equal(hook(t, 'gsd-t-invention-guard.js', { tool_name: 'Write', cwd: path.join(t.root, 'test', 'proj'), transcript_path: p.transcript, tool_input: { file_path: under, content: 'n ' + MARK } }).hookSpecificOutput.permissionDecision, 'deny', 'a project under a folder named test is still guarded');
    assert.equal(hook(t, 'gsd-t-invention-guard.js', { tool_name: 'Edit', cwd: p.dir, transcript_path: p.transcript, tool_input: { file_path: path.join(p.dir, 'other.ts'), old_string: 'a ' + MARK, new_string: 'a ' + MARK + '\nb' } }), null);
    assert.equal(hook(t, 'gsd-t-invention-guard.js', { tool_name: 'Write', cwd: p.dir, tool_input: { file_path: path.join(p.dir, 'test', 'a.test.js'), content: MARK } }), null, 'tests exempt');
    assert.equal(hook(t, 'gsd-t-invention-guard.js', { tool_name: 'Write', cwd: p.dir, tool_input: { file_path: path.join(p.dir, '.gsd-t', 'progress.md'), content: MARK } }), null, 'own papers exempt');
    assert.equal(hook(t, 'gsd-t-invention-guard.js', { tool_name: 'Read', cwd: p.dir, tool_input: { file_path: file } }), null);
    assert.equal(run(t, 'gsd-t-invention-guard.js', ''), null, 'not a write');
    for (const text of ['***', 'the', '_', MARK, MARK + ' a']) {
      fs.writeFileSync(path.join(p.dir, '.gsd-t', 'inventions.json'), JSON.stringify({ approved: [{ text }] }));
      assert.equal(write('note: "Self sign-up, ' + MARK + '",\n').hookSpecificOutput.permissionDecision, 'deny', 'too broad: ' + text);
    }
    fs.writeFileSync(path.join(p.dir, '.gsd-t', 'inventions.json'), JSON.stringify({ approved: [{ text: 'Student self sign-up', why: 'David, alone' }] }));
    const selfApprove = hook(t, 'gsd-t-invention-guard.js', { tool_name: 'Write', session_id: SID, cwd: p.dir, tool_input: { file_path: path.join(p.dir, '.gsd-t', 'inventions.json'), content: '{}' } });
    assert.equal(selfApprove.hookSpecificOutput.permissionDecision, 'deny', 'an unattended run cannot approve itself');
    assert.equal(write('note: "Student self sign-up, ' + MARK + '",\n'), null, 'approved by name');
    assert.equal(write('note: "Visitor page, ' + MARK + '",\n').hookSpecificOutput.permissionDecision, 'deny', 'another item is not');
    fs.writeFileSync(path.join(p.dir, '.gsd-t', 'inventions.json'), '{bad');
    assert.match(write('note: "Self sign-up, ' + MARK + '",\n').hookSpecificOutput.permissionDecisionReason, /could not run/, 'denies on error');
  } finally { t.rm(); }
});

test('no decisions section, or questions on: silent', () => {
  const t = sandbox();
  try {
    const p = project(t);
    assert.equal(hook(t, 'gsd-t-decision-check.js', { session_id: SID, cwd: p.dir, last_assistant_message: 'Done. Tests pass.' }), null);
        questions(t, 'on', SID);
    assert.equal(decide(t, p, ['Student self sign-up added']), null);
  } finally { t.rm(); }
});

test('honest citations pass in the fixed format and its near spellings', () => {
  const t = sandbox();
  try {
    const p = project(t);
    fs.writeFileSync(path.join(p.dir, 'docs', 'My Rules.md'), 'See [the school rules](http://x) now.\n> Students are\n> added by the school.\nHe said "stop here" twice today.\n');
    fs.mkdirSync(path.join(t.home, 'notes'));
    fs.writeFileSync(path.join(t.home, 'notes', 'n.md'), 'Students are added by the school.\n');
    for (const item of [
      'A. Source: `docs/My Rules.md` "Students are added by the school"',
      'A. Source: docs/My Rules.md "Students are added by the school"',
      'A. Source: docs/rules.md:1 "Students are added by the school"',
      'A. Source: docs/rules.md#L1 "Students are added by the school"',
      'A. Source: ~/notes/n.md "Students are added by the school"',
      'A. **Source:** docs/rules.md "Students are added by the school"',
      'A. Source: docs/My Rules.md "See the school rules now"',
      'A. Source: docs/My Rules.md "He said "stop here" twice today"',
      'A. Source: docs/rules.md "not really in there" and Source: docs/rules.md "Students are added by the school"',
    ]) {
      assert.equal(decide(t, p, [item]), null, item);
    }
  } finally { t.rm(); }
});

test('words the transcript does not mark as typed by a person never count as "you"', () => {
  const t = sandbox();
  try {
    const p = project(t);
    assert.match(decide(t, p, ['Page. Source: you "a teammate says add"']).reason, /never typed/);
    assert.match(decide(t, p, ['Page. Source: you "helper says add a visitor"']).reason, /never typed/);
    fs.writeFileSync(p.transcript, fs.readFileSync(p.transcript, 'utf8').replace(/[^\n]*$/, ''));
    fs.appendFileSync(p.transcript, JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command', origin: { kind: 'human' }, prompt: 'Also use the blue header please' } }) + '\n' + JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command', origin: { kind: 'task-notification' }, prompt: 'notice says use green header' } }) + '\n');
    assert.equal(decide(t, p, ['Header. Source: you "use the blue header"']), null, 'typed mid-turn counts');
    assert.match(decide(t, p, ['Header. Source: you "says use green header"']).reason, /never typed/);
  } finally { t.rm(); }
});

test('a citation that cannot be checked fails loudly, and one bad item never waives the others', () => {
  const t = sandbox();
  try {
    const p = project(t);
    const bad = path.join(t.root, 'bad.jsonl');
    fs.writeFileSync(bad, '{"type":"user"\n{not json\n');
    const out = hook(t, 'gsd-t-decision-check.js', { session_id: SID, cwd: p.dir, transcript_path: bad, stop_hook_active: false, last_assistant_message: 'Decisions made\n- A. Source: you "keep the invoice layout"\n- Student self sign-up added' });
    assert.match(out.reason, /could not check it/);
    assert.match(out.reason, /Student self sign-up added/);
    const none = hook(t, 'gsd-t-decision-check.js', { session_id: SID, cwd: p.dir, stop_hook_active: false, last_assistant_message: 'Decisions made\n- A. Source: docs/rules.md "Students are added by the school"' });
    assert.match(none.reason, /no session record/);
    for (const stdin of ['', '{bad json', JSON.stringify({ session_id: SID, last_assistant_message: ['x'] })]) {
      assert.match(run(t, 'gsd-t-decision-check.js', stdin).systemMessage, /could not run/, stdin);
    }
  } finally { t.rm(); }
});

test('a write by a workflow helper, however deep its record, disqualifies the file', () => {
  const t = sandbox();
  try {
    const p = project(t);
    const own = path.join(p.dir, 'docs', 'wf-notes.md');
    fs.writeFileSync(own, 'workflow helper invented this\n');
    const deep = path.join(p.transcript.replace(/\.jsonl$/, ''), 'subagents', 'workflows', 'wf_1');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, 'a.jsonl'), JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: own } }] } }) + '\n');
    assert.match(decide(t, p, ['X. Source: docs/wf-notes.md "workflow helper invented"']).reason, /written this session/);
    if (process.platform === 'darwin') assert.match(decide(t, p, ['X. Source: docs/WF-NOTES.md "workflow helper invented"']).reason, /written this session/, 'case variant of the same file');
  } finally { t.rm(); }
});

test('gsd-t questions: outside a Claude session, or an unknown subcommand, exits 1', () => {
  const t = sandbox();
  try {
    assert.equal(questions(t, 'on', null).status, 1);
    const out = questions(t, 'on', null);
    assert.match(out.stdout + out.stderr, /inside a Claude Code session/);
    assert.equal(questions(t, 'maybe', SID).status, 1);
  } finally { t.rm(); }
});

test('install registers every hook on its event with the right matcher; uninstall removes them and the switches', () => {
  const t = sandbox();
  try {
    const settings = path.join(t.home, 'settings.json');
    fs.writeFileSync(settings, '{}');
    const cli = require('../bin/gsd-t.js');
    cli.configureNeverWaitHooks(settings);
    const h = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks;
    const find = (ev, script) => (h[ev] || []).find((e) => JSON.stringify(e).includes(script));
    assert.ok(find('PermissionRequest', 'gsd-t-never-wait.js'));
    assert.equal(find('PreToolUse', 'gsd-t-no-questions.js').matcher, 'AskUserQuestion');
    assert.ok(find('SubagentStart', 'gsd-t-helper-brief.js'));
    assert.ok(find('Elicitation', 'gsd-t-mcp-input-decline.js'));
    assert.ok(find('Stop', 'gsd-t-question-stop.js'));
    assert.ok(find('Stop', 'gsd-t-decision-check.js'));
    assert.ok(find('SubagentStop', 'gsd-t-helper-decision-check.js'));
    assert.equal(find('PreToolUse', 'gsd-t-invention-guard.js').matcher, 'Write|Edit');
    cli.configureNeverWaitHooks(settings);
    assert.equal(JSON.parse(fs.readFileSync(settings, 'utf8')).hooks.PermissionRequest.length, 1, 'idempotent');

    questions(t, 'on', SID);
    const env = Object.assign({}, process.env, { HOME: t.home });
    const un = spawnSync(process.execPath, [CLI, 'uninstall'], { encoding: 'utf8', env });
    assert.equal(un.status, 0, un.stderr);
    assert.ok(!fs.existsSync(path.join(t.home, '.claude', 'gsd-t-questions-on')));
  } finally { t.rm(); }
});
