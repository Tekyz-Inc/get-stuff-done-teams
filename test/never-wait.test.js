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
    assert.match(d.decision.message, /exact command under "Decisions made"/);
    assert.doesNotMatch(d.decision.message, /needs no approval/, 'never promises a rewrite gets past the check');
  } finally { t.rm(); }
});

test('approving a plan David asked for (leaving plan mode) is never answered for him', () => {
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
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /Make the call yourself/);
  } finally { t.rm(); }
});

test('questions off: every helper starts with the never-wait rule', () => {
  const t = sandbox();
  try {
    const out = hook(t, 'gsd-t-helper-brief.js', { hook_event_name: 'SubagentStart', session_id: SID, agent_type: 'general-purpose' });
    assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
    assert.match(out.hookSpecificOutput.additionalContext, /nothing may wait on him/);
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
    cli.configureNeverWaitHooks(settings);
    assert.equal(JSON.parse(fs.readFileSync(settings, 'utf8')).hooks.PermissionRequest.length, 1, 'idempotent');

    questions(t, 'on', SID);
    const env = Object.assign({}, process.env, { HOME: t.home });
    const un = spawnSync(process.execPath, [CLI, 'uninstall'], { encoding: 'utf8', env });
    assert.equal(un.status, 0, un.stderr);
    assert.ok(!fs.existsSync(path.join(t.home, '.claude', 'gsd-t-questions-on')));
  } finally { t.rm(); }
});
