'use strict';

/**
 * gsd-t talk — one shared program; the session you face is found by its
 * terminal; each conversation is a copy of that session, written to the
 * project's .gsd-t/talk/ as it happens; "we're done, pass it on / ignore" end
 * it. Driven with real HTTP requests, a stub `claude` and a fake voice.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSpeechFilter, startTalk, parseArgs, sayText, endIntent, recentSummaries } = require('../bin/gsd-t-talk.cjs');

// The GSD-T reply header, stamped from the live clock like a real reply.
function liveHeader() {
  const d = new Date();
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return `${day}: ${mon} ${d.getDate()}, ${d.getFullYear()} ${hm} PDT — GSD-T v6.1.20 — CURRENT`;
}

function sentences(text) {
  const out = [];
  const f = createSpeechFilter((s) => out.push(s));
  // Feed in small pieces, the way Claude streams.
  for (let i = 0; i < text.length; i += 7) f.push(text.slice(i, i + 7));
  f.end();
  return out;
}

test('speech filter: header line, tables and code are not spoken', () => {
  const said = sentences([
    liveHeader(),
    '',
    'Sign-up has **three** steps. First you enter an email.',
    '',
    '| Step | What |',
    '|---|---|',
    '| 1 | email |',
    '',
    '- Then a `code` arrives.',
    '```js',
    'const x = 1;',
    '```',
    'Done.',
  ].join('\n'));
  assert.deepEqual(said, [
    'Sign-up has three steps.',
    'First you enter an email.',
    'The table is in the transcript.',
    'Then a code arrives.',
    'The code is in the transcript.',
    'Done.',
  ]);
});

test('speech filter: a finished sentence is spoken before its line ends', () => {
  const out = [];
  const f = createSpeechFilter((s) => out.push(s));
  f.push('This is the first sentence. And the second is still');
  assert.deepEqual(out, ['This is the first sentence.']);
  f.push(' coming.\n');
  assert.deepEqual(out, ['This is the first sentence.', 'And the second is still coming.']);
});

test('endIntent: plain endings paste unless told to ignore; tolerant of dictation spelling', () => {
  assert.equal(endIntent("We're done. Pass it on."), 'pass');
  assert.equal(endIntent('Okay, we are done, pass it on'), 'pass');
  assert.equal(endIntent('were done, passed on'), 'pass');
  assert.equal(endIntent("We’re done. Ignore."), 'ignore');
  assert.equal(endIntent("We're done."), 'pass', 'an ending pastes by default');
  assert.equal(endIntent('Done.'), 'pass');
  assert.equal(endIntent('Done, pass it on.'), 'pass', 'dictation dropped "we\'re"');
  assert.equal(endIntent('Done, paste in this session.'), 'pass');
  assert.equal(endIntent('done, ignore'), 'ignore');
  assert.equal(endIntent('Is the build done yet? Did you pass it on to the backend team?'), null);
  assert.equal(endIntent('Can you pass it on to the backend?'), null);
  assert.equal(endIntent('Ignore the lint warnings'), null);
});

test('parseArgs: kokoro by default; status/stop; anything unknown halts', () => {
  assert.equal(parseArgs([]).voice, 'kokoro');
  assert.equal(parseArgs(['status']).action, 'status');
  assert.equal(parseArgs(['--voice', 'google']).speaker, 'en-US-Chirp3-HD-Algieba');
  assert.throws(() => parseArgs(['--voice', 'robot']), /kokoro or google/);
  assert.throws(() => parseArgs(['--loud']), /unknown option/);
});

test('sayText: only { "text": "<words>" } with words', () => {
  assert.equal(sayText('{"text":"  hello  "}'), 'hello');
  assert.equal(sayText('{"text":"   "}'), null);
  assert.equal(sayText('"hello"'), null);
});

// A stand-in for `claude --print --input-format stream-json --resume <id> --fork-session`:
// answers each message with the header, two sentences and a table, then a result.
const STUB_CLAUDE = `#!/usr/bin/env node
require('fs').appendFileSync(process.env.TALK_TEST_ARGS, JSON.stringify(['COPY=' + (process.env.GSDT_TALK_COPY || '')].concat(process.argv.slice(2)).concat(['CONFIG=' + (process.env.CLAUDE_CONFIG_DIR || '')])) + '\\n');
let buf = '';
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const delta = (t) => emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: t } } });
process.stdin.on('data', (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf('\\n')) !== -1) {
    const msg = JSON.parse(buf.slice(0, nl));
    buf = buf.slice(nl + 1);
    const asked = msg.message.content[0].text;
    // The original session's queued notice runs as a turn of its own, before ours.
    if (process.env.TALK_TEST_BACKGROUND && !global.didBackground) {
      global.didBackground = true;
      delta('Checking that background workflow.');
      emit({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } });
      emit({ type: 'result', is_error: false, result: '' });
    }
    emit({ type: 'user', isReplay: true, message: { role: 'user', content: [{ type: 'text', text: asked }] } });
    setTimeout(() => {
      if (/spoken conversation is ending/.test(asked)) {
        delta('We chose option two.');
      } else {
        delta(process.env.TALK_TEST_HEADER + '\\n\\n');
        delta('You asked: ' + asked + '. Here is more.\\n');
        delta('| a | b |\\n');
      }
      emit({ type: 'result', is_error: false, result: 'ok' });
    }, 50);
  }
});
`;

const PANE = '%90';

function setup() {
  process.env.TALK_TEST_HEADER = liveHeader();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-talk-test-'));
  const home = path.join(root, 'home');
  const app = path.join(root, 'MyApp');
  fs.mkdirSync(app, { recursive: true });
  // Claude Code's own record of a live session in pane %90; this test process stands in for its claude.
  const sessions = path.join(home, '.claude', 'sessions');
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(sessions, process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: 'abcd1234-session', cwd: app, kind: 'interactive', entrypoint: 'cli', tmux: 'projects:@9.' + PANE }));
  const claudeBin = path.join(root, 'claude-stub.js');
  fs.writeFileSync(claudeBin, STUB_CLAUDE, { mode: 0o755 });
  process.env.TALK_TEST_ARGS = path.join(root, 'args.jsonl');
  const played = [];
  const stopped = [];
  const voice = { name: 'fake', ready: Promise.resolve(), synth: async (t) => t, close() {} };
  const player = {
    play(text) {
      played.push(text);
      let finish;
      const done = new Promise((r) => { finish = r; });
      const timer = setTimeout(finish, 30);
      return { done, stop() { stopped.push(text); clearTimeout(timer); finish(); } };
    },
  };
  let focused = PANE;
  const cueLog = [];
  const cues = { set(k) { cueLog.push(k); }, stop() { cueLog.push(null); } };
  const judged = [];
  let judgeReply = '{"end":"continue"}';
  const judgeEnd = async (p) => { judged.push(p); return judgeReply; };
  const start = () => startTalk({
    home, claudeBin, makeVoice: () => voice, player, cues, focus: () => focused, log: () => {}, judgeEnd,
  });
  return { root, home, app, played, stopped, cueLog, judged, judge: (r) => { judgeReply = r; }, start, focusOn: (t) => { focused = t; } };
}

async function post(session, route, body, token) {
  const res = await fetch(`http://127.0.0.1:${session.port}${route}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (token === undefined ? session.token : token), 'content-type': 'application/json' },
    body: body === undefined ? '' : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function waitFor(pred) {
  const end = Date.now() + 3000;
  while (!pred()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
}

function transcript(s) {
  const dir = path.join(s.app, '.gsd-t', 'talk');
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  return { name: files[0], text: fs.readFileSync(path.join(dir, files[0]), 'utf8') };
}

test('talk: words go to a copy of the focused session; prose spoken; transcript written as it happens', async () => {
  const s = setup();
  const session = await s.start();
  try {
    const handoffFile = path.join(s.home, '.claude', '.gsd-t-talk.json');
    assert.equal(JSON.parse(fs.readFileSync(handoffFile, 'utf8')).port, session.port);
    assert.equal(fs.statSync(handoffFile).mode & 0o777, 0o600);

    const r = await post(session, '/say', { text: 'how does sign-up work' });
    assert.deepEqual(r.json, { ok: true, queued: false });
    await waitFor(() => s.played.length === 3);
    assert.deepEqual(s.played, ['You asked: how does sign-up work.', 'Here is more.', 'The table is in the transcript.']);

    const args = JSON.parse(fs.readFileSync(process.env.TALK_TEST_ARGS, 'utf8').trim());
    assert.deepEqual(args.slice(args.indexOf('--resume')), ['--resume', 'abcd1234-session', '--fork-session', 'CONFIG=']);

    const t = transcript(s);
    assert.match(t.name, /^\d{4}-\d{2}-\d{2}-\d{4}-abcd1234\.md$/);
    assert.match(t.text, /\*\*You:\*\* how does sign-up work/);
    assert.match(t.text, /\*\*Claude:\*\* You asked: how does sign-up work\. Here is more\./);
    assert.doesNotMatch(t.text, /GSD-T v6/, 'the header line is not saved');
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: no session in the focused window is refused out loud', async () => {
  const s = setup();
  s.focusOn('%91');
  const session = await s.start();
  try {
    const r = await post(session, '/say', { text: 'hello' });
    assert.equal(r.status, 409);
    assert.match(r.json.reason, /%91/);
    await waitFor(() => s.played.includes('No Claude session is running in this window.'));
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: "we\'re done, pass it on" saves a summary and returns the paste', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'which option' });
    const r = await post(session, '/say', { text: "We're done. Pass it on." });
    assert.equal(r.json.ended, 'pass');
    const t = transcript(s);
    assert.equal(r.json.paste, 'Claude Voice Session: We chose option two. Full transcript: .gsd-t/talk/' + t.name);
    assert.match(t.text, /## Summary\n\nWe chose option two\.\n\nOutcome: passed on to the session/);
    assert.deepEqual(recentSummaries(s.app, 5), [{ name: t.name, summary: 'We chose option two.' }]);
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: "we\'re done, ignore" saves only', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'a question' });
    const r = await post(session, '/say', { text: "We're done, ignore." });
    assert.deepEqual(r.json, { ok: true, ended: 'ignore' });
    assert.match(transcript(s).text, /Outcome: ignored \(saved only\)/);
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: the next conversation is given the earlier summaries', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'first talk' });
    await post(session, '/say', { text: "We're done, ignore." });
    fs.writeFileSync(process.env.TALK_TEST_ARGS, '');
    await post(session, '/say', { text: 'second talk' });
    await waitFor(() => fs.readFileSync(process.env.TALK_TEST_ARGS, 'utf8').length > 0);
    const args = JSON.parse(fs.readFileSync(process.env.TALK_TEST_ARGS, 'utf8').trim());
    const prompt = args[args.indexOf('--append-system-prompt') + 1];
    assert.match(prompt, /Earlier spoken conversations in this project/);
    assert.match(prompt, /We chose option two\./);
    // Both conversations kept, even though they started in the same minute.
    assert.equal(fs.readdirSync(path.join(s.app, '.gsd-t', 'talk')).length, 2);
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: wrong key, empty words and unknown path are refused', async () => {
  const s = setup();
  const session = await s.start();
  try {
    assert.equal((await post(session, '/say', { text: 'hi' }, 'nope')).status, 401);
    assert.equal((await post(session, '/hush', undefined, '')).status, 401);
    assert.equal((await post(session, '/say', { text: '  ' })).status, 400);
    assert.equal((await post(session, '/other', {})).status, 404);
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: hush stops the voice and drops the rest of that answer', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'first' });
    await waitFor(() => s.played.length === 1);
    assert.equal((await post(session, '/hush')).status, 200);
    assert.deepEqual(s.stopped, ['You asked: first.']);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(s.played.length, 1, 'nothing more of the hushed answer is spoken');

    await post(session, '/say', { text: 'second' });
    await waitFor(() => s.played.includes('You asked: second.'));
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: words sent while Claude is busy wait their turn', async () => {
  const s = setup();
  const session = await s.start();
  try {
    assert.equal((await post(session, '/say', { text: 'one' })).json.queued, false);
    assert.equal((await post(session, '/say', { text: 'two' })).json.queued, true);
    await waitFor(() => s.played.includes('You asked: two.'));
    assert.ok(s.played.indexOf('You asked: one.') < s.played.indexOf('You asked: two.'));
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: a second program halts while one runs; a stale handoff is replaced; closing removes it', async () => {
  const s = setup();
  const handoff = path.join(s.home, '.claude', '.gsd-t-talk.json');
  fs.writeFileSync(handoff, JSON.stringify({ port: 1, token: 'x', pid: process.ppid }));
  await assert.rejects(s.start(), /already running/);
  fs.writeFileSync(handoff, JSON.stringify({ port: 1, token: 'x', pid: 999999 }));
  const session = await s.start();
  assert.equal(JSON.parse(fs.readFileSync(handoff, 'utf8')).pid, process.pid);
  session.close();
  assert.equal(fs.existsSync(handoff), false);
  fs.rmSync(s.root, { recursive: true, force: true });
});

test('talk: a session under a second account folder is found, and its copy runs under that account', async () => {
  const s = setup();
  // Move the record from ~/.claude to ~/.claude-hilo.
  const from = path.join(s.home, '.claude', 'sessions', process.pid + '.json');
  const hilo = path.join(s.home, '.claude-hilo', 'sessions');
  fs.mkdirSync(hilo, { recursive: true });
  fs.renameSync(from, path.join(hilo, process.pid + '.json'));
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'hello hilo' });
    await waitFor(() => s.played.includes('You asked: hello hilo.'));
    const args = JSON.parse(fs.readFileSync(process.env.TALK_TEST_ARGS, 'utf8').trim());
    assert.equal(args[args.length - 1], 'CONFIG=' + path.join(s.home, '.claude-hilo'));
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: a record for an ended process, a non-interactive one, or talk\'s own copy is ignored', () => {
  const { liveSessions } = require('../bin/gsd-t-talk.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-talk-rec-'));
  const dir = path.join(root, '.claude', 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '999999.json'), JSON.stringify({ pid: 999999, sessionId: 'dead', cwd: '/x', kind: 'interactive', tmux: 'p:@1.%1' }));
  fs.writeFileSync(path.join(dir, process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: 'printed', cwd: '/x', kind: 'print', tmux: 'p:@1.%2' }));
  fs.writeFileSync(path.join(dir, process.pid + '.abc.key'), 'not a record');
  // talk's own copy of a session: same pane, scripted entry point.
  fs.writeFileSync(path.join(dir, process.ppid + '.json'), JSON.stringify({ pid: process.ppid, sessionId: 'copy', cwd: '/x', kind: 'interactive', entrypoint: 'sdk-cli', tmux: 'p:@1.%3' }));
  assert.deepEqual(liveSessions(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('talk: a turn the copy runs on its own is not taken as the answer, not spoken, and does not crash talk', async () => {
  const s = setup();
  process.env.TALK_TEST_BACKGROUND = '1';
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'Yeah.' });
    const dir = path.join(s.app, '.gsd-t', 'talk');
    const read = () => fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8');
    await waitFor(() => /\*\*Claude:\*\*/.test(read()));
    assert.ok(!s.played.some((p) => /background workflow/.test(p)), 'the copy\'s own turn is not spoken');
    const t = read();
    assert.match(t, /\*\*Claude:\*\* You asked: Yeah\./);
    assert.doesNotMatch(t, /background workflow/);
  } finally {
    delete process.env.TALK_TEST_BACKGROUND;
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

// David, 2026-10-22: "If talk crashes, it should restart automatically. If it fails
// again, restart one more time. If it still fails, say talk crashed and can't restart,
// and log the error." [RULE] talk-restarts-twice-then-halts
function fakeWorkers(exits) {
  const started = [];
  return {
    started,
    startWorker() {
      const exit = exits[started.length];
      started.push(exit);
      let kill;
      const exited = new Promise((r) => { kill = () => r({ code: 0, signal: null, stderrTail: '' }); if (exit) setImmediate(() => r(exit)); });
      return { exited, kill };
    },
  };
}

test('supervisor: when two restarts in a row fail, it gives up once with the error', async () => {
  const { runSupervisor } = require('../bin/gsd-t-talk.cjs');
  const crash = { code: 1, signal: null, stderrTail: 'TypeError: boom' };
  const w = fakeWorkers([crash, crash, crash, crash]);
  const crashes = [];
  const gaveUp = [];
  const sup = runSupervisor({ startWorker: w.startWorker, log: () => {}, onCrash: (c) => crashes.push(c), onGiveUp: (g) => gaveUp.push(g) });
  assert.equal(await sup.done, 'gave-up');
  assert.equal(w.started.length, 3, 'first run + two restarts');
  assert.deepEqual(crashes.map((c) => c.attempt), [1, 2, 3]);
  assert.equal(crashes[0].stderrTail, 'TypeError: boom');
  assert.deepEqual(gaveUp, [{ reason: 'exit 1', stderrTail: 'TypeError: boom' }]);
});

test('supervisor: a clean stop is not a crash; a crash after a minute of running is a fresh crash', async () => {
  const { runSupervisor, HEALTHY_MS } = require('../bin/gsd-t-talk.cjs');
  const stopped = fakeWorkers([{ code: 0, signal: null, stderrTail: '' }]);
  const s1 = runSupervisor({ startWorker: stopped.startWorker, log: () => {}, onCrash: () => assert.fail('not a crash'), onGiveUp: () => assert.fail('no give-up') });
  assert.equal(await s1.done, 'stopped');

  // Crash, crash, then a crash after a long healthy run: the count starts over, so no give-up yet.
  let t = 0;
  const crash = { code: 1, signal: null, stderrTail: 'x' };
  const w = fakeWorkers([crash, crash, crash, { code: 0, signal: null, stderrTail: '' }]);
  const startWorker = () => {
    const h = w.startWorker();
    if (w.started.length === 3) t += HEALTHY_MS; // the second restart came up and ran a minute
    return h;
  };
  const s2 = runSupervisor({ startWorker, log: () => {}, onCrash: () => {}, onGiveUp: () => assert.fail('count should have reset'), now: () => t });
  assert.equal(await s2.done, 'stopped');
  assert.equal(w.started.length, 4);
});

// ATOS-V2, 2026-10-22: a talk copy picked up the session's unfinished build, committed,
// pushed and launched a workflow beside the real window. A copy may only read.
// [RULE] talk-copies-read-only
test('talk: copies can only read and search — no edits, shell, workflows, messages or connected services', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'hello' });
    await waitFor(() => s.played.includes('You asked: hello.'));
    const args = JSON.parse(fs.readFileSync(process.env.TALK_TEST_ARGS, 'utf8').trim());
    assert.equal(args[args.indexOf('--tools') + 1], 'Read,Grep,Glob,WebSearch,WebFetch');
    assert.ok(args.includes('--strict-mcp-config'));
    assert.equal(args[args.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
    assert.ok(args.includes('--no-session-persistence'));
    assert.equal(args[0], 'COPY=1', 'the copy is marked so its start hook leaves talk alone');
    const prompt = args[args.indexOf('--append-system-prompt') + 1];
    assert.match(prompt, /You can only read and search/);
    assert.match(prompt, /Never explain this setup/);
    assert.match(prompt, /No preamble of any kind/);
    assert.doesNotMatch(prompt, /Do the work the user asks/);
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: the header line is never spoken or saved, even after a tool call', () => {
  const out = [];
  const f = createSpeechFilter((x) => out.push(x));
  f.push('\n');
  f.push(liveHeader().slice(0, 3));
  f.push(liveHeader().slice(3) + '\n\nThe answer is yes.\n');
  f.end();
  assert.deepEqual(out, ['The answer is yes.']);
  const { stripHeader } = require('../bin/gsd-t-talk.cjs');
  assert.equal(stripHeader('Working on it.\n' + liveHeader() + '\nDone.'), 'Working on it.\nDone.');
});

test('talk: working sounds — thinking after you speak, tools while tools run, silent once it speaks', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'cue test' });
    await waitFor(() => s.played.includes('You asked: cue test.'));
    assert.equal(s.cueLog[0], 'thinking');
    assert.ok(s.cueLog.includes(null), 'stopped when it spoke');
    await post(session, '/hush');
    assert.equal(s.cueLog[s.cueLog.length - 1], null, 'hush silences the cue');
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: cue files are real audio, written once', () => {
  const { ensureCues } = require('../bin/gsd-t-talk.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-cues-'));
  const c = ensureCues(dir);
  for (const file of [c.thinking, c.tools]) {
    const b = fs.readFileSync(file);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.ok(b.length > 10000);
  }
  const before = fs.statSync(c.thinking).mtimeMs;
  ensureCues(dir);
  assert.equal(fs.statSync(c.thinking).mtimeMs, before);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('talk: "that\'s good" is judged with the last reply — an approval continues, a close pastes', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'option two?' });
    await waitFor(() => s.played.includes('You asked: option two?.') || s.played.some((p) => /option two/.test(p)));
    s.judge('{"end":"continue"}');
    const cont = await post(session, '/say', { text: "That's good." });
    assert.deepEqual(cont.json, { ok: true, queued: false }, 'an approval is sent to Claude');
    assert.match(s.judged[0], /You asked: option two\?/, 'Haiku sees the last reply');
    await waitFor(() => s.played.some((p) => /That's good/.test(p)));
    s.judge('{"end":"pass"}');
    const end = await post(session, '/say', { text: "That's good, thanks." });
    assert.equal(end.json.ended, 'pass');
    assert.match(end.json.paste, /^Claude Voice Session: /);
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: a long remark is never treated as an ending, and nothing open means nothing to judge', () => {
  const { mightEnd, parseEnd } = require('../bin/gsd-t-talk.cjs');
  assert.ok(mightEnd("That's good."));
  assert.ok(mightEnd('Okay, paste it.'));
  assert.ok(!mightEnd('That is good but the second screen also needs the done button moved to the left of cancel please'));
  assert.ok(!mightEnd('How does sign-up work?'));
  assert.equal(parseEnd('{"end":"continue"}'), null);
  assert.equal(parseEnd('{"end":"ignore"}'), 'ignore');
  assert.throws(() => parseEnd('maybe'), /not JSON/);
});

test('talk: the handoff names the running version, so a release can replace an older talk', async () => {
  const s = setup();
  const session = await s.start();
  try {
    const h = JSON.parse(fs.readFileSync(path.join(s.home, '.claude', '.gsd-t-talk.json'), 'utf8'));
    assert.equal(h.version, require('../package.json').version);
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: "done" gets only "Okay", with the thinking tone kept on while the summary is written', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'one thing' });
    await waitFor(() => s.played.includes('The table is in the transcript.'));
    const before = s.played.length;
    const r = await post(session, '/say', { text: 'Done.' });
    assert.equal(r.json.ended, 'pass');
    await waitFor(() => s.played.length > before);
    assert.deepEqual(s.played.slice(before), ['Okay.']);
    assert.ok(s.cueLog.lastIndexOf('thinking') > s.cueLog.indexOf(null), 'the tone ran again for the summary');
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk start hook: inside a talk copy it does nothing, even with an older talk running', () => {
  const { spawnSync } = require('node:child_process');
  const hook = path.join(__dirname, '..', 'scripts', 'gsd-t-talk-start.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'talk-copy-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', '.gsd-t-talk.json'), JSON.stringify({ pid: process.pid, version: '0.0.1' }));
  const run = (extra) => spawnSync(process.execPath, [hook, path.join(home, 'missing-talk.cjs')], { encoding: 'utf8', env: { ...process.env, HOME: home, ...extra } });
  const copy = run({ GSDT_TALK_COPY: '1' });
  assert.equal(copy.status, 0, copy.stderr);
  assert.equal(copy.stderr, '');
  const normal = run({ GSDT_TALK_COPY: '' });
  assert.equal(normal.status, 1, 'outside a copy the same call reaches the real checks');
  fs.rmSync(home, { recursive: true, force: true });
});

test('talk: Esc stops every conversation at once — silent, no summary, transcript marked', async () => {
  const s = setup();
  const session = await s.start();
  try {
    await post(session, '/say', { text: 'esc test' });
    await waitFor(() => s.played.includes('You asked: esc test.'));
    const before = await post(session, '/state');
    assert.equal(before.json.open, 1);
    const r = await post(session, '/stop');
    assert.deepEqual(r.json, { ok: true, stopped: 1 });
    assert.equal(s.cueLog[s.cueLog.length - 1], null, 'no cue left playing');
    const heard = s.played.length;
    await new Promise((res) => setTimeout(res, 200));
    assert.equal(s.played.length, heard, 'nothing spoken after Esc');
    assert.ok(!s.played.some((p) => /Claude stopped/.test(p)));
    const t = transcript(s);
    assert.match(t.text, /Outcome: stopped/);
    assert.doesNotMatch(t.text, /## Summary/);
    const after = await post(session, '/state');
    assert.deepEqual(after.json, { ok: true, active: false, open: 0 });
  } finally {
    session.close();
    fs.rmSync(s.root, { recursive: true, force: true });
  }
});

test('talk: the date-and-version line is dropped in any spelling; a sentence naming a version is spoken', () => {
  const heard = (text) => {
    const out = [];
    const f = createSpeechFilter((x) => out.push(x));
    for (let i = 0; i < text.length; i += 5) f.push(text.slice(i, i + 5));
    f.end();
    return out;
  };
  const now = new Date();
  const mon = now.toLocaleString('en-US', { month: 'short' });
  const date = mon + ' ' + now.getDate() + ', ' + now.getFullYear();
  assert.deepEqual(heard('Day: Fri ' + date + ' 09:39 PDT — GSD-T v6.1.20 — CURRENT\n\nYes.'), ['Yes.']);
  assert.deepEqual(heard('**Fri: ' + date + ' 09:39 PDT — GSD-T v6.2.19 — CURRENT**\nYes.'), ['Yes.']);
  assert.deepEqual(heard('You are on GSD-T v6.2.19 now.'), ['You are on GSD-T v6.2.19 now.']);
});

test('auto-route: inside a talk copy it adds nothing to the prompt', () => {
  const { spawnSync } = require('node:child_process');
  const hook = path.join(__dirname, '..', 'scripts', 'gsd-t-auto-route.js');
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ prompt: 'hello', cwd: os.tmpdir() }), encoding: 'utf8', env: { ...process.env, GSDT_TALK_COPY: '1' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});
