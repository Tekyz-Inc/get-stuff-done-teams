#!/usr/bin/env node
'use strict';

/**
 * gsd-t-talk.cjs — GSD-T talk: spoken conversations with your Claude sessions.
 *
 * ONE shared talk program serves every session. The first GSD-T session starts
 * it (scripts/gsd-t-talk-start.js). It stays idle until you hold Ctrl+Option+Space
 * in the dictation app (WindowsVoiceTranscription), which sends "hush" on press
 * and your words to "say" on release.
 *
 * The session you are facing is the one in tmux's active pane, read from Claude
 * Code's own session records (sessions/<pid>.json in ~/.claude and every
 * ~/.claude-<name> account folder). Your first words
 * start a COPY of that session (it knows your conversation; the original is
 * never touched). Every exchange is written to the project's
 * .gsd-t/talk/<date>-<session>.md as it happens. "We're done, pass it on" ends
 * the conversation, saves a summary and hands it back for the dictation app to
 * paste into the session; "We're done, ignore" ends it and saves only.
 * Plan: .gsd-t/pseudocode/PseudoCode-Talk.md
 *
 * [RULE] mic-open-only-while-keys-held   [RULE] hush-stops-speech-never-work
 * [RULE] one-talk-program                [RULE] talk-door-local-and-keyed
 * [RULE] no-fallback-voice               [RULE] speak-for-decisions
 * [RULE] talk-session-by-tmux-pane       [RULE] transcript-written-as-it-happens
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync, execFileSync } = require('child_process');

const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
const RED = '\x1b[31m';
const DIM_ON = '\x1b[2m';
const RESET = '\x1b[0m';

// Spoken answers are shaped for quick decisions, not read-outs of the session.
const VOICE_STYLE = [
  'This is a spoken conversation. Every word you write is read aloud by text-to-speech, and the user speaks through dictation, so their words may contain transcription mistakes — read for intent.',
  'Write only your final reply: no narration while you work ("let me check", "now I will"), no step-by-step account of what you did.',
  'Lead with the one thing the user needs: the answer, the outcome, or the decision you need from them.',
  'When you need a decision: ask it in one sentence, give at most three options as "one…, two…, three…", each one short sentence with its trade-off, say which you recommend and why in one sentence, then stop.',
  'When reporting work: say what changed and what, if anything, the user must do. Leave out file names, code, commands and how you got there unless asked.',
  'Keep it to about seventy words. If there is more worth knowing, say so in one sentence and offer to go deeper.',
  'Never use tables, code blocks, URLs, file paths or markdown symbols.',
  'You can only read and search. Never resume or act on the session\'s unfinished work, background tasks or notifications. When the user wants something done, agree what it is; it reaches the session through the summary at the end.',
  'Answer only what was asked. Never explain this setup — that you are a copy, read-only, separate from other windows, or how this conversation works — unless the user asks about it.',
  'No preamble of any kind: no header line, date, time, version, status recap or restating the question. Start with the answer.',
].join(' ');

// A copy can read and search, nothing else: no edits, no shell, no workflows,
// no messages to other sessions, no timers, no connected services. Work reaches
// a session only as the "pass it on" summary the user sends themselves.
// [RULE] talk-copies-read-only
const READ_ONLY_TOOLS = 'Read,Grep,Glob,WebSearch,WebFetch';

const SUMMARY_REQUEST = 'The spoken conversation is ending. Write a summary for the main session: the decisions made and the points that matter, in plain sentences, under 120 words. Start directly with the content — no header line, no greeting.';

function talkDir(home) {
  return path.join(home, '.claude', 'gsd-t-talk');
}

function handoffPath(home) {
  return path.join(home, '.claude', '.gsd-t-talk.json');
}

/** `ps -p` exits 0 when the process exists and 1 when it does not. */
function pidAlive(pid) {
  const r = spawnSync('ps', ['-p', String(pid)], { stdio: 'ignore' });
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  throw new Error('could not check process ' + pid + ' (ps exit ' + r.status + ')');
}

// ── Which session you are facing ────────────────────────────────────────────
/** tmux's active pane — the tab you are looking at (it follows iTerm's tab switches). */
function tmuxFocusedPane() {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  const r = spawnSync('tmux', ['display-message', '-p', '#{pane_id}'], { encoding: 'utf8', env });
  if (r.status !== 0) throw new Error('tmux could not say which pane is active: ' + String(r.stderr).trim());
  return r.stdout.trim();
}

/**
 * Every live interactive Claude session, from Claude Code's own records in each
 * account folder (~/.claude, ~/.claude-<name>): { sessionId, cwd, pane, pid, configDir }.
 */
function liveSessions(home) {
  const out = [];
  for (const name of fs.readdirSync(home)) {
    if (name !== '.claude' && !name.startsWith('.claude-')) continue;
    const dir = path.join(home, name, 'sessions');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      // Only sessions you typed into: talk's own copies run as `sdk-cli`.
      if (rec.kind !== 'interactive' || rec.entrypoint !== 'cli' || typeof rec.tmux !== 'string' || !pidAlive(rec.pid)) continue;
      out.push({ sessionId: rec.sessionId, cwd: rec.cwd, pane: rec.tmux.slice(rec.tmux.lastIndexOf('.') + 1), pid: rec.pid, configDir: path.join(home, name) });
    }
  }
  return out;
}

/** The live Claude session in that tmux pane, or null when none is running there. */
function sessionForPane(home, pane) {
  const found = liveSessions(home).filter((s) => s.pane === pane);
  if (found.length > 1) throw new Error('two live Claude sessions claim pane ' + pane + ': ' + found.map((s) => s.pid).join(', '));
  return found.length ? found[0] : null;
}

// ── Ending the conversation ─────────────────────────────────────────────────
// Ending pastes the summary unless you say to ignore it. Plain phrases are
// matched in code; a short remark that only sounds like closing ("that's good")
// is judged by Haiku with Claude's last reply, because right after a question
// it can just mean "yes". [RULE] end-phrases-understood

function normalize(text) {
  return ' ' + text.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

/** Plain endings → 'pass' | 'ignore'; anything else → null. */
function endIntent(text) {
  const t = normalize(text);
  const words = t.trim().split(' ').length;
  const done = / (we're|we are|were|we re) done /.test(t) || (/ done /.test(t) && words <= 8);
  if (!done) return null;
  if (/ ignore /.test(t)) return 'ignore';
  return 'pass';
}

const CLOSING = / (done|finished|that's (good|it|all|great|fine|perfect)|thats (good|it|all|great|fine|perfect)|all set|wrap (it )?up|pass (it )?on|paste|ignore|goodbye|good bye|that'll do|that will do) /;

/** A short remark that might close the conversation — worth asking Haiku. */
function mightEnd(text) {
  const t = normalize(text);
  return t.trim().split(' ').length <= 12 && CLOSING.test(t);
}

function endPrompt(utterance, lastReply) {
  return [
    'A developer is in a spoken conversation with an assistant and may be ending it.',
    'The assistant\'s last reply:', '<<<', String(lastReply).slice(0, 1500), '>>>',
    'The developer now said:', '<<<', utterance, '>>>',
    'Is the developer ending the conversation?',
    '- If the remark answers or approves a specific choice the assistant just asked about or proposed (for example "that\'s good" meaning "yes, do that"), the conversation continues.',
    '- If the assistant just summarized, wrapped up, or asked whether there is anything else, a closing remark ("that\'s good", "thanks", "that\'s it", "all set") ends it.',
    '- "Done", "we\'re done", "paste it" or "pass it on" end it.',
    'Reply with JSON only: {"end": "continue"} or {"end": "pass"} (ending; hand the summary to the session — the default for any ending) or {"end": "ignore"} (ending, and the developer said to ignore, discard or not pass it on).',
  ].join('\n');
}

function parseEnd(raw) {
  const m = String(raw).match(/\{[^{}]*\}/);
  if (!m) throw new Error('end check reply was not JSON: ' + String(raw).slice(0, 120));
  const v = JSON.parse(m[0]).end;
  if (v === 'continue') return null;
  if (v === 'pass' || v === 'ignore') return v;
  throw new Error('end check gave an unknown answer: ' + m[0].slice(0, 120));
}

/** Haiku on your Claude login, no tools, no hooks, nothing saved. */
function askHaiku(text) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', 'haiku', '--output-format', 'json', '--setting-sources', '', '--tools', '', '--no-session-persistence'],
      { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), 20000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(new Error('end check could not start: ' + e.message)));
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('end check failed (exit ' + code + '): ' + (err + out).trim().slice(-200)));
      return resolve(JSON.parse(out).result);
    });
    child.stdin.end(text);
  });
}

// ── Which text is spoken ────────────────────────────────────────────────────
// The GSD-T reply header: "Day: Mon DD, YYYY HH:MM TZ — GSD-T vX.Y.Z — CURRENT".
const HEADER_LINE = /^[A-Z][a-z]{2}: [A-Z][a-z]{2} \d{1,2}, \d{4} .*GSD-T v/;

function stripHeader(text) {
  return text.split('\n').filter((l) => !HEADER_LINE.test(l.trim())).join('\n').trim();
}

function cleanProse(line) {
  return line
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .trim();
}

/**
 * Turns streamed answer text into sentences to speak. The header line, tables
 * and code are not spoken; each table or code block is announced once.
 */
function createSpeechFilter(onSentence) {
  let line = '';
  let prose = '';
  let inFence = false;
  let inTable = false;
  let firstLine = true;

  function flush() {
    for (const p of prose.split(/(?<=[.!?])\s+/)) {
      const s = p.trim();
      if (s) onSentence(s);
    }
    prose = '';
  }

  function addProse(text) {
    const cleaned = cleanProse(text);
    if (cleaned) prose = prose ? prose + ' ' + cleaned : cleaned;
  }

  function completeLine(text) {
    firstLine = false;
    if (/^\s*```/.test(text)) {
      if (!inFence) {
        flush();
        onSentence('The code is in the transcript.');
      }
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (/^\s*\|/.test(text)) {
      if (!inTable) {
        flush();
        onSentence('The table is in the transcript.');
      }
      inTable = true;
      return;
    }
    inTable = false;
    // The header line is never spoken, wherever it lands (after a tool call it is not the first line).
    if (HEADER_LINE.test(text.trim())) return;
    // Each line — a bullet, a heading, a paragraph — is its own utterance.
    addProse(text);
    flush();
  }

  return {
    push(text) {
      line += text;
      let nl = line.indexOf('\n');
      while (nl !== -1) {
        completeLine(line.slice(0, nl));
        line = line.slice(nl + 1);
        nl = line.indexOf('\n');
      }
      // Speak the finished sentences of a long line before the line ends, so
      // the voice starts early. Only for a line that is clearly prose.
      const maybeHeader = /^\s*[A-Z][a-z]{0,2}(:|$)/.test(line);
      if (inFence || maybeHeader || /^\s*(```|\|)/.test(line)) return;
      const m = line.match(/^(.*[.!?])\s+(\S.*)?$/s);
      if (!m) return;
      firstLine = false;
      addProse(m[1]);
      flush();
      line = m[2] === undefined ? '' : m[2];
    },
    end() {
      if (line) completeLine(line);
      line = '';
      flush();
      firstLine = true;
      inFence = false;
      inTable = false;
    },
  };
}

// ── Voices ──────────────────────────────────────────────────────────────────
// Each voice turns one sentence into a .wav file. A failure is reported, never
// swapped for another voice. [RULE] no-fallback-voice

function kokoroVoice(speaker) {
  const script = path.join(__dirname, 'gsd-t-talk-kokoro.py');
  const child = spawn('uv', ['run', '--quiet', '--with', 'kokoro-onnx', '--with', 'numpy', 'python', script, speaker], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting = new Map();
  let nextId = 1;
  let buf = '';
  let readyResolve;
  let readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  child.on('error', (e) => readyReject(new Error('could not start the Kokoro voice (it needs uv: brew install uv): ' + e.message)));
  child.on('exit', (code) => {
    const err = new Error('the Kokoro voice stopped (exit ' + code + ')');
    readyReject(err);
    for (const w of waiting.values()) w.reject(err);
    waiting.clear();
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let nl = buf.indexOf('\n');
    while (nl !== -1) {
      const msg = JSON.parse(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
      nl = buf.indexOf('\n');
      if (msg.ready) {
        readyResolve();
        continue;
      }
      const w = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) w.reject(new Error(msg.error));
      else w.resolve(msg.wav);
    }
  });
  return {
    name: 'Kokoro (' + speaker + ')',
    ready,
    synth(text) {
      const id = nextId++;
      return ready.then(() => new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, text }) + '\n');
      }));
    },
    close() { child.kill(); },
  };
}

/** Same billing rule as the demo-video narrator: your own project, never a guess. */
function googleProject() {
  const fromEnv = process.env.GOOGLE_TTS_PROJECT;
  if (fromEnv !== undefined && fromEnv.trim()) return fromEnv.trim();
  const adc = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
  if (fs.existsSync(adc)) {
    const quota = JSON.parse(fs.readFileSync(adc, 'utf8')).quota_project_id;
    if (quota) return String(quota).trim();
  }
  throw new Error('no Google Cloud project to bill the voice to — run: gcloud auth application-default set-quota-project <your-project-id>');
}

function googleVoice(speaker) {
  const project = googleProject();
  const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8' }).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-t-talk-'));
  let n = 0;
  return {
    name: 'Google (' + speaker + ')',
    ready: Promise.resolve(),
    async synth(text) {
      const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'x-goog-user-project': project, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', name: speaker },
          audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: 1.1 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('Google voice ' + res.status + ': ' + (await res.text()).slice(0, 200));
      n += 1;
      const file = path.join(dir, n + '.wav');
      fs.writeFileSync(file, Buffer.from((await res.json()).audioContent, 'base64'));
      return file;
    },
    close() {},
  };
}

function afplayPlayer() {
  return {
    play(file) {
      const child = spawn('afplay', [file], { stdio: 'ignore' });
      const done = new Promise((resolve) => child.on('exit', () => {
        fs.unlinkSync(file);
        resolve();
      }));
      return { done, stop() { child.kill(); } };
    },
  };
}

// ── Working sounds: while the copy thinks or runs tools ─────────────────────
// A soft up-and-down "do-do" while it thinks; a low-medium-high pattern while it
// runs tools. Both stop the moment it speaks or the keys are pressed.
// [RULE] talk-working-sounds
const CUE_RATE = 24000;

function cueSamples(notes, volume) {
  const out = [];
  for (const { f, ms, ding } of notes) {
    const n = Math.round((CUE_RATE * ms) / 1000);
    const fade = Math.min(n / 4, CUE_RATE * 0.012);
    for (let i = 0; i < n; i++) {
      // A ding strikes and decays like a small bell; a plain note fades in and out.
      const env = ding ? Math.min(1, i / (CUE_RATE * 0.004)) * Math.exp((-6 * i) / n) : Math.min(1, i / fade, (n - i) / fade);
      out.push(f ? volume * env * Math.sin((2 * Math.PI * f * i) / CUE_RATE) : 0);
    }
  }
  return out;
}

function writeWav(file, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(CUE_RATE, 24); h.writeUInt32LE(CUE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

/** The two cue files, written once (the name carries the design, so a change writes new ones). */
function ensureCues(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cues = {
    thinking: path.join(dir, 'thinking-v2.wav'),
    tools: path.join(dir, 'tools-v1.wav'),
  };
  if (!fs.existsSync(cues.thinking)) {
    // Subtle alternating dings, up, down, up, down: ding ding ding ding ding ding.
    const ding = (f) => ({ f, ms: 140, ding: true });
    const gap = { f: 0, ms: 160 };
    writeWav(cues.thinking, cueSamples([ding(659), gap, ding(523), gap, ding(659), gap, ding(523), gap, ding(659), gap, ding(523), gap], 0.09));
  }
  if (!fs.existsSync(cues.tools)) {
    writeWav(cues.tools, cueSamples([
      { f: 330, ms: 100 }, { f: 0, ms: 40 }, { f: 440, ms: 100 }, { f: 0, ms: 40 }, { f: 554, ms: 100 }, { f: 0, ms: 800 },
    ], 0.06));
  }
  return cues;
}

/** Loops one cue at a time with afplay; set(null) or stop() silences it. */
function afplayCues(dir) {
  const files = ensureCues(dir);
  let kind = null;
  let child = null;
  function loop() {
    if (!kind) return;
    const playing = kind;
    child = spawn('afplay', [files[playing]], { stdio: 'ignore' });
    child.on('exit', () => {
      if (kind === playing) loop();
    });
  }
  return {
    set(next) {
      if (next === kind) return;
      kind = next;
      if (child) child.kill();
      child = null;
      loop();
    },
    stop() { this.set(null); },
  };
}

// ── The speaker queue: synthesize ahead, play in order, drop on hush ────────
function createSpeaker(getVoice, player, onError, onPlay = () => {}) {
  let queue = [];
  let current = null;
  let generation = 0;
  let playing = false;

  async function drain() {
    if (playing) return;
    playing = true;
    while (queue.length) {
      const item = queue.shift();
      const outcome = await item.outcome;
      if (item.gen !== generation) continue;
      if (outcome.error) {
        onError(outcome.error);
        continue;
      }
      if (!item.keepCue) onPlay();
      current = player.play(outcome.file);
      await current.done;
      current = null;
    }
    playing = false;
  }

  return {
    say(sentence, { keepCue = false } = {}) {
      // Each sentence carries its own success or failure; a failed one is shown
      // red by drain and the next sentence still plays.
      const outcome = getVoice().synth(sentence).then((file) => ({ file }), (error) => ({ error }));
      queue.push({ gen: generation, outcome, keepCue });
      drain();
    },
    hush() {
      generation++;
      queue = [];
      if (current) current.stop();
    },
  };
}

// ── Claude: a copy of your session, kept running for the conversation ──────
function startClaude({ cwd, claudeBin, model, session, configDir, home, extraPrompt, onText, onTool, onToolDone = () => {}, onTurnEnd, onBackground, onExit }) {
  const prompt = extraPrompt ? VOICE_STYLE + '\n\n' + extraPrompt : VOICE_STYLE;
  // --replay-user-messages echoes each message we send. A copy of a session can
  // also run turns of its own (the original's queued task notifications arrive
  // first), so a turn is ours only from the echo of our message to its result.
  // [RULE] talk-turns-matched-by-echo
  const args = ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json',
    '--verbose', '--include-partial-messages', '--replay-user-messages', '--append-system-prompt', prompt,
    '--tools', READ_ONLY_TOOLS, '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence'];
  if (model) args.push('--model', model);
  // A copy of the session you are in: it knows the conversation so far, and
  // writing to the copy never touches the original. A resumed session also
  // skips startup-only hooks (a project's auto-resume would hijack the first turn).
  args.push('--resume', session, '--fork-session');
  // The copy runs under the session's own account folder (a second login's
  // sessions live in ~/.claude-<name>, and only that folder can resume them).
  const env = { ...process.env };
  // Not in any tmux pane: a copy must never claim the pane of the session it copies.
  delete env.TMUX;
  delete env.TMUX_PANE;
  if (configDir === path.join(home, '.claude')) delete env.CLAUDE_CONFIG_DIR;
  else env.CLAUDE_CONFIG_DIR = configDir;
  const child = spawn(claudeBin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let stderrTail = '';
  let sawText = false;
  let closing = false;
  const sent = [];      // texts we sent, waiting for their echo
  let ours = false;     // inside a turn that answers one of our messages
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + d).slice(-2000); });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let nl = buf.indexOf('\n');
    while (nl !== -1) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf('\n');
      if (!raw) continue;
      const ev = JSON.parse(raw);
      if (ev.type === 'user' && ev.isReplay) {
        const c = ev.message && ev.message.content;
        const text = Array.isArray(c) ? c.filter((x) => x.type === 'text').map((x) => x.text).join('') : String(c);
        if (sent.length && text === sent[0]) {
          sent.shift();
          ours = true;
        }
      } else if (ev.type === 'user' && ours) {
        const c = ev.message && ev.message.content;
        if (Array.isArray(c) && c.some((x) => x.type === 'tool_result')) onToolDone();
      } else if (ev.type === 'stream_event' && ev.event) {
        const e = ev.event;
        if (e.type === 'content_block_start' && e.content_block && e.content_block.type === 'text' && sawText && ours) onText('\n');
        if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') {
          if (ours) {
            sawText = true;
            onText(e.delta.text);
          } else onBackground('text');
        }
      } else if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
        for (const c of ev.message.content) {
          if (c.type !== 'tool_use') continue;
          if (ours) onTool(c.name);
          else onBackground(c.name);
        }
      } else if (ev.type === 'result') {
        sawText = false;
        if (ours) {
          ours = false;
          onTurnEnd(ev.is_error ? String(ev.result) : null);
        } else onBackground('turn ended');
      }
    }
  });
  child.on('error', (e) => onExit('could not start Claude (' + claudeBin + '): ' + e.message));
  child.on('exit', (code) => {
    if (closing) return;
    onExit('Claude stopped (exit ' + code + ')' + (stderrTail ? ': ' + stderrTail.trim() : ''));
  });
  return {
    send(text) {
      sent.push(text);
      child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n');
    },
    close() {
      closing = true;
      child.kill();
    },
  };
}

// ── Transcripts: one file per conversation, in the project ─────────────────
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** The summaries of this project's most recent talk conversations, newest first. */
function recentSummaries(cwd, limit) {
  const dir = path.join(cwd, '.gsd-t', 'talk');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort().reverse()) {
    const m = fs.readFileSync(path.join(dir, name), 'utf8').match(/\n## Summary\n\n([\s\S]*?)\n\nOutcome: /);
    if (m) out.push({ name, summary: m[1].trim() });
    if (out.length === limit) break;
  }
  return out;
}

// ── One conversation with one session ──────────────────────────────────────
function createConversation({ reg, home, claudeBin, model, speaker, cues, log }) {
  const app = path.basename(reg.cwd);
  const started = new Date();
  const dir = path.join(reg.cwd, '.gsd-t', 'talk');
  fs.mkdirSync(dir, { recursive: true });
  // Never overwrite an earlier transcript: two conversations in one minute get -2, -3, …
  const base = stamp(started) + '-' + reg.sessionId.slice(0, 8);
  let file = path.join(dir, base + '.md');
  for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, base + '-' + n + '.md');
  const relFile = path.relative(reg.cwd, file);
  fs.writeFileSync(file, `# Talk — ${app} — ${started.toISOString()}\n\nSession: ${reg.sessionId}\n\n---\n`, { flag: 'wx' });

  const history = recentSummaries(reg.cwd, 5);
  const extraPrompt = history.length
    ? 'Earlier spoken conversations in this project, newest first (from .gsd-t/talk/):\n' + history.map((h) => '- ' + h.name + ': ' + h.summary.replace(/\s+/g, ' ')).join('\n')
    : '';

  const conv = { app, file, relFile, dropping: false, closed: false, lastReply: '' };
  const filter = createSpeechFilter((s) => { if (!conv.dropping) speaker.say(s); });
  const waiting = [];
  let current = null;
  let turnText = '';

  function sendNext() {
    if (current || !waiting.length || conv.closed) return;
    current = waiting.shift();
    conv.dropping = current.silent;
    turnText = '';
    cues.set('thinking');
    if (!current.silent) {
      fs.appendFileSync(file, `\n**You:** ${current.text}\n`);
      log(app + ' · You: ' + current.text);
    }
    claude.send(current.text);
  }

  const claude = startClaude({
    cwd: reg.cwd, claudeBin, model, session: reg.sessionId, configDir: reg.configDir, home, extraPrompt,
    onTool(name) {
      log(app + ' · ' + name);
      if (!conv.dropping) cues.set('tools');
    },
    onToolDone() {
      if (!conv.dropping) cues.set('thinking');
    },
    onText(t) {
      turnText += t;
      if (!current.silent) filter.push(t);
    },
    onBackground(what) {
      // A turn the copy ran on its own (e.g. the original's queued notices): logged, never spoken.
      log(DIM_ON + app + ' · (not yours) ' + what + RESET);
    },
    onTurnEnd(err) {
      cues.stop();
      if (!current.silent) filter.end();
      const text = stripHeader(turnText);
      if (err) log(RED + app + ' · Claude: ' + err + RESET);
      if (!current.silent) {
        conv.lastReply = text;
        fs.appendFileSync(file, `\n**Claude:** ${text}\n`);
        log(app + ' · Claude: ' + text);
      }
      const done = current;
      current = null;
      done.resolve({ text, err });
      sendNext();
    },
    onExit(reason) {
      cues.stop();
      conv.closed = true;
      log(RED + app + ' · ' + reason + RESET);
      fs.appendFileSync(file, `\n_${reason}_\n`);
      speaker.say('Claude stopped. The conversation so far is saved.');
      if (current) current.resolve({ text: '', err: reason });
      for (const w of waiting) w.resolve({ text: '', err: reason });
      waiting.length = 0;
      conv.onClosed();
    },
  });

  function enqueue(text, silent) {
    return new Promise((resolve) => {
      waiting.push({ text, silent, resolve });
      sendNext();
    });
  }

  conv.busy = () => current !== null;
  conv.ask = (text) => {
    const queued = conv.busy();
    enqueue(text, false);
    return queued;
  };
  /** End the conversation: summarize, save, close. Resolves to the summary. */
  conv.end = async (outcome) => {
    const { text, err } = await enqueue(SUMMARY_REQUEST, true);
    if (err) throw new Error('could not summarize: ' + err);
    const label = outcome === 'pass' ? 'passed on to the session' : 'ignored (saved only)';
    fs.appendFileSync(file, `\n## Summary\n\n${text}\n\nOutcome: ${label}\n`);
    conv.closed = true;
    claude.close();
    return text;
  };
  conv.close = () => {
    conv.closed = true;
    claude.close();
  };
  conv.onClosed = () => {};
  return conv;
}

// ── The shared talk program ────────────────────────────────────────────────
/**
 * Start the talk program. Resolves to { port, token, close } once the local
 * door is open and the handoff file is written.
 */
async function startTalk({ home, claudeBin, model, makeVoice, player, cues, focus, log, judgeEnd = askHaiku }) {
  const file = handoffPath(home);
  if (fs.existsSync(file)) {
    const prior = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (prior.pid !== process.pid && pidAlive(prior.pid)) {
      throw new Error('talk is already running (pid ' + prior.pid + ') — `gsd-t talk stop` ends it');
    }
  }

  let voice = null;
  const getVoice = () => {
    if (!voice) {
      voice = makeVoice();
      log('voice: ' + voice.name);
      voice.ready.then(null, (e) => log(RED + 'voice failed to start: ' + e.message + RESET));
    }
    return voice;
  };
  const speaker = createSpeaker(getVoice, player, (e) => log(RED + 'voice failed: ' + e.message + RESET), () => cues.stop());
  const conversations = new Map(); // sessionId → conversation

  function conversationFor(reg) {
    let conv = conversations.get(reg.sessionId);
    if (conv && !conv.closed) return conv;
    conv = createConversation({ reg, home, claudeBin, model, speaker, cues, log });
    conv.onClosed = () => conversations.delete(reg.sessionId);
    conversations.set(reg.sessionId, conv);
    log(conv.app + ' · conversation started → ' + conv.relFile);
    return conv;
  }

  /** Answer one /say. Returns [status, body]. */
  async function say(text) {
    cues.set('thinking'); // from the moment you release the keys until it speaks
    const pane = focus();
    const reg = sessionForPane(home, pane);
    if (!reg) {
      cues.stop();
      speaker.say('No Claude session is running in this window.');
      return [409, { ok: false, reason: 'no Claude session is running in the focused tmux pane (' + pane + ')' }];
    }
    const open = conversations.get(reg.sessionId);
    const isOpen = Boolean(open) && !open.closed;
    let intent = endIntent(text);
    if (intent === null && isOpen && mightEnd(text)) {
      intent = parseEnd(await judgeEnd(endPrompt(text, open.lastReply)));
    }
    if (intent) {
      if (!isOpen) {
        cues.stop();
        speaker.say('Okay.');
        return [200, { ok: true, ended: 'none' }];
      }
      // "Okay" and nothing else; the thinking tone runs while the summary is written.
      speaker.say('Okay.', { keepCue: true });
      const summary = await open.end(intent);
      conversations.delete(reg.sessionId);
      log(open.app + ' · conversation ended (' + intent + ') → ' + open.relFile);
      cues.stop();
      if (intent === 'ignore') return [200, { ok: true, ended: 'ignore' }];
      const paste = 'Claude Voice Session: ' + summary.replace(/\s+/g, ' ').trim() + ' Full transcript: ' + open.relFile;
      return [200, { ok: true, ended: 'pass', paste }];
    }
    const conv = conversationFor(reg);
    return [200, { ok: true, queued: conv.ask(text) }];
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expected = Buffer.from('Bearer ' + token);
  const server = http.createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const given = Buffer.from(String(req.headers.authorization));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return reply(401, { ok: false, reason: 'bad key' });
    }
    if (req.method !== 'POST') return reply(405, { ok: false, reason: 'POST only' });
    if (req.url === '/hush') {
      for (const c of conversations.values()) c.dropping = true;
      speaker.hush();
      cues.stop();
      getVoice(); // warm the voice while you speak
      return reply(200, { ok: true });
    }
    if (req.url !== '/say') return reply(404, { ok: false, reason: 'unknown path' });
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const text = sayText(body);
      if (text === null) return reply(400, { ok: false, reason: 'expected JSON { "text": "<words>" } with words in it' });
      // A failure is answered to the dictation app (it shows it red) and logged.
      say(text).then(([status, out]) => reply(status, out), (e) => {
        log(RED + 'say failed: ' + e.message + RESET);
        reply(500, { ok: false, reason: e.message });
      });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ port, token, pid: process.pid, version: VERSION, startedAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);

  function close() {
    server.close();
    for (const c of conversations.values()) c.close();
    speaker.hush();
    if (voice) voice.close();
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid) fs.unlinkSync(file);
  }
  return { port, token, close };
}

// ── Supervisor: restart after a crash; give up when two restarts fail ──────
// Approved fallback (.gsd-t/fallbacks.json → talk-supervisor-restart).
// [RULE] talk-restarts-twice-then-halts
const MAX_RESTARTS = 2;
// A restart has failed only when the restarted worker crashes within a minute.
// A worker that ran longer and then crashed is a fresh crash: the count starts over.
const HEALTHY_MS = 60 * 1000;

/**
 * Run the talk worker; restart it after a crash at most MAX_RESTARTS times.
 * startWorker() → { exited: Promise<{ code, signal, stderrTail }>, kill() }.
 * Resolves when talk stops on purpose or gives up.
 */
function runSupervisor({ startWorker, log, onCrash, onGiveUp, now = Date.now }) {
  let restarts = 0;
  let stopping = false;
  let worker = null;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  function launch() {
    const started = now();
    worker = startWorker();
    worker.exited.then(({ code, signal, stderrTail }) => {
      if (stopping || code === 0) {
        log('talk stopped');
        return resolveDone('stopped');
      }
      if (now() - started >= HEALTHY_MS) restarts = 0;
      const reason = signal ? 'killed by ' + signal : 'exit ' + code;
      onCrash({ reason, stderrTail, attempt: restarts + 1 });
      if (restarts < MAX_RESTARTS) {
        restarts += 1;
        log('restarting talk (' + restarts + ' of ' + MAX_RESTARTS + ')');
        return launch();
      }
      onGiveUp({ reason, stderrTail });
      return resolveDone('gave-up');
    });
  }
  launch();
  return {
    done,
    stop() {
      stopping = true;
      worker.kill();
    },
  };
}

/** The words in a /say body, or null when the body is not { "text": "<words>" }. */
function sayText(body) {
  if (!/^\s*\{[\s\S]*\}\s*$/.test(body)) return null;
  const parsed = JSON.parse(body);
  if (typeof parsed.text !== 'string' || !parsed.text.trim()) return null;
  return parsed.text.trim();
}

const USAGE = 'usage: gsd-t talk [status | stop] [--supervise] [--voice kokoro|google] [--speaker <name>] [--model <name>]';

function parseArgs(argv) {
  const opts = { action: 'run', supervise: false, voice: 'kokoro', speaker: null, model: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'status' || a === 'stop') opts.action = a;
    else if (a === '--supervise') opts.supervise = true;
    else if (a === '--voice') opts.voice = argv[++i];
    else if (a === '--speaker') opts.speaker = argv[++i];
    else if (a === '--model') opts.model = argv[++i];
    else throw new Error('unknown option ' + a + ' — ' + USAGE);
  }
  if (opts.voice !== 'kokoro' && opts.voice !== 'google') throw new Error('--voice must be kokoro or google — ' + USAGE);
  if (!opts.speaker) opts.speaker = opts.voice === 'kokoro' ? 'af_heart' : 'en-US-Chirp3-HD-Algieba';
  return opts;
}

function status(home) {
  const file = handoffPath(home);
  const pid = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).pid : null;
  const ver = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).version : undefined;
  console.log(pid !== null && pidAlive(pid) ? 'talk v' + (ver === undefined ? '(unknown)' : ver) + ' is running (pid ' + pid + ')' : 'talk is not running');
  const st = path.join(talkDir(home), 'status.json');
  if (fs.existsSync(st)) {
    const j = JSON.parse(fs.readFileSync(st, 'utf8'));
    if (j.state === 'crashed') console.log(RED + 'talk crashed and could not restart (' + j.at + '): ' + j.reason + RESET + '\n  details: ' + j.crashLog);
  }
  for (const s of liveSessions(home)) console.log('  pane ' + s.pane + '  ' + s.cwd + (s.configDir.endsWith('.claude') ? '' : '  (' + path.basename(s.configDir) + ')'));
  console.log('log: ' + path.join(talkDir(home), 'talk.log'));
}

function supervisorFile(home) {
  return path.join(talkDir(home), 'supervisor.json');
}

/** Is talk up — its supervisor or its worker? (The start hook asks this.) */
function talkRunning(home) {
  for (const f of [supervisorFile(home), handoffPath(home)]) {
    if (fs.existsSync(f) && pidAlive(JSON.parse(fs.readFileSync(f, 'utf8')).pid)) return true;
  }
  return false;
}

function stop(home) {
  // The supervisor first, so it does not restart the worker it sees exit.
  let stopped = false;
  for (const f of [supervisorFile(home), handoffPath(home)]) {
    if (!fs.existsSync(f)) continue;
    const pid = JSON.parse(fs.readFileSync(f, 'utf8')).pid;
    if (pidAlive(pid)) {
      process.kill(pid, 'SIGTERM');
      stopped = true;
    }
  }
  console.log(stopped ? 'talk stopped' : 'talk is not running');
}

/** Every crash is appended here with its full error, for debugging. */
function recordCrash(home, { reason, stderrTail, attempt }) {
  const entry = '=== ' + new Date().toISOString() + ' — talk crashed (' + reason + '), attempt ' + attempt + ', GSD-T v' + VERSION + '\n' + stderrTail.trim() + '\n\n';
  fs.appendFileSync(path.join(talkDir(home), 'crashes.log'), entry);
}

function supervise(home, workerArgs) {
  fs.mkdirSync(talkDir(home), { recursive: true });
  const log = (msg) => process.stdout.write(new Date().toISOString() + ' ' + msg + '\n');
  const statusFile = path.join(talkDir(home), 'status.json');
  const crashLog = path.join(talkDir(home), 'crashes.log');
  if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile);
  fs.writeFileSync(supervisorFile(home), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');

  const sup = runSupervisor({
    log,
    startWorker() {
      const child = spawn(process.execPath, [__filename, ...workerArgs], { stdio: ['ignore', 'inherit', 'pipe'] });
      let tail = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d) => {
        process.stderr.write(d);
        tail = (tail + d).slice(-6000);
      });
      const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal, stderrTail: tail })));
      return { exited, kill: () => child.kill('SIGTERM') };
    },
    onCrash(c) {
      log(RED + 'talk crashed (' + c.reason + ') — details in ' + crashLog + RESET);
      recordCrash(home, c);
    },
    onGiveUp({ reason }) {
      const msg = 'GSD-T talk crashed and could not restart (' + reason + ').';
      log(RED + msg + ' Details: ' + crashLog + RESET);
      fs.writeFileSync(statusFile, JSON.stringify({ state: 'crashed', at: new Date().toISOString(), reason, crashLog }) + '\n');
      const r = spawnSync('osascript', ['-e', 'display notification "Details: ~/.claude/gsd-t-talk/crashes.log" with title "GSD-T talk crashed" subtitle "It could not restart"']);
      if (r.status !== 0) log(RED + 'could not show the crash notification: ' + String(r.stderr).trim() + RESET);
    },
  });
  const end = () => sup.stop();
  process.on('SIGINT', end);
  process.on('SIGTERM', end);
  return sup.done.then(() => {
    if (fs.existsSync(supervisorFile(home)) && JSON.parse(fs.readFileSync(supervisorFile(home), 'utf8')).pid === process.pid) fs.unlinkSync(supervisorFile(home));
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const home = os.homedir();
  if (opts.action === 'status') return status(home);
  if (opts.action === 'stop') return stop(home);
  if (opts.supervise) return supervise(home, process.argv.slice(2).filter((a) => a !== '--supervise'));
  const log = (msg) => process.stdout.write(new Date().toISOString() + ' ' + msg + '\n');
  const session = await startTalk({
    home, claudeBin: 'claude', model: opts.model,
    makeVoice: () => (opts.voice === 'kokoro' ? kokoroVoice(opts.speaker) : googleVoice(opts.speaker)),
    player: afplayPlayer(), cues: afplayCues(path.join(talkDir(home), 'cues')), focus: tmuxFocusedPane, log,
  });
  log('talk v' + VERSION + ' ready on 127.0.0.1:' + session.port + ' — idle until Ctrl+Option+Space');
  const end = () => {
    session.close();
    process.exit(0);
  };
  process.on('SIGINT', end);
  process.on('SIGTERM', end);
}

if (require.main === module) {
  main().then(null, (e) => {
    process.stderr.write(RED + '🔴 talk: ' + e.message + RESET + '\n');
    process.exit(1);
  });
}

module.exports = {
  createSpeechFilter, createSpeaker, startTalk, parseArgs, handoffPath, pidAlive,
  sayText, endIntent, mightEnd, endPrompt, parseEnd, stripHeader, recentSummaries, sessionForPane, liveSessions,
  runSupervisor, talkRunning, MAX_RESTARTS, HEALTHY_MS, ensureCues, READ_ONLY_TOOLS, VERSION,
};
