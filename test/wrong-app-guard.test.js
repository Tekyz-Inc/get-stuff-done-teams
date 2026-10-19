'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isOverride, findCurrentApp, appDescription, parseVerdict, wrongAppCheck,
} = require('../scripts/gsd-t-auto-route.js');

const HOOK = path.join(__dirname, '..', 'scripts', 'gsd-t-auto-route.js');
const noGit = () => null;

// A temp HOME with a two-app registry; apps are real folders.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-wrong-app-'));
  const home = path.join(root, 'home');
  const appA = path.join(root, 'newman');
  const appB = path.join(root, 'newman-avtar-be');
  for (const d of [path.join(home, '.claude'), appA, appB]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', '.gsd-t-projects'), `${appA}\n${appB}\n`);
  return { root, home, appA, appB };
}

test('override prefix is matched without regard to capitals or dash style', () => {
  for (const p of ['This App - This Session fix it', 'this app - this session', '  THIS APP — THIS SESSION do x', 'This App-This Session'])
    assert.ok(isOverride(p), p);
  for (const p of ['fix this app', 'This App fix it', 'please: This App - This Session'])
    assert.ok(!isOverride(p), p);
});

test('current app is the longest registered folder above cwd; siblings do not match', () => {
  const apps = ['/p/newman', '/p/newman-avtar-be', '/p/Hilo', '/p/Hilo/ATOS-V2'];
  assert.strictEqual(findCurrentApp('/p/newman/src', apps, noGit), '/p/newman');
  assert.strictEqual(findCurrentApp('/p/newman-avtar-be', apps, noGit), '/p/newman-avtar-be');
  assert.strictEqual(findCurrentApp('/p/Hilo/ATOS-V2/web', apps, noGit), '/p/Hilo/ATOS-V2');
  assert.strictEqual(findCurrentApp('/elsewhere', apps, noGit), null);
});

test('a worktree outside the app folder maps to its main repo', () => {
  const apps = ['/p/binvoice', '/p/TimeTracking'];
  assert.strictEqual(findCurrentApp('/w/binvoice/feat-x', apps, () => '/p/binvoice'), '/p/binvoice');
});

test('description: CLAUDE.md Overview, then README paragraph, then package.json, else empty', () => {
  const { root } = fixture();
  const d = (n) => { const p = path.join(root, n); fs.mkdirSync(p); return p; };
  const a = d('a'); fs.writeFileSync(path.join(a, 'CLAUDE.md'), '# A\n\n## Overview\n\nInvoices for **small** shops.\n\n## Tech\nx');
  const b = d('b'); fs.writeFileSync(path.join(b, 'README.md'), '# B\n\n[![badge](x)](y)\n\nTracks audiobook series.\n');
  const c = d('c'); fs.writeFileSync(path.join(c, 'package.json'), '{"name":"c","description":"Gmail spam filter"}');
  const e = d('e');
  assert.strictEqual(appDescription(a), 'Invoices for small shops.');
  assert.strictEqual(appDescription(b), 'Tracks audiobook series.');
  assert.strictEqual(appDescription(c), 'Gmail spam filter');
  assert.strictEqual(appDescription(e), '');
});

test('verdict: current / unclear / own folder pass; another app is returned; junk throws', () => {
  const apps = ['/p/a', '/p/b'];
  for (const t of ['{"app":"current"}', '{"app":"UNCLEAR"}', 'Sure: {"app": "/p/a"}'])
    assert.strictEqual(parseVerdict(t, apps, '/p/a'), null, t);
  assert.strictEqual(parseVerdict('{"app":"/p/b"}', apps, '/p/a'), '/p/b');
  assert.throws(() => parseVerdict('binvoice', apps, '/p/a'), /not JSON/);
  assert.throws(() => parseVerdict('{"app":"/p/zzz"}', apps, '/p/a'), /not registered/);
  assert.throws(() => parseVerdict('{"x":1}', apps, '/p/a'), /no app/);
});

test('check: another app blocks with the target folder and the prompt to paste', () => {
  const { home, appA, appB } = fixture();
  const r = wrongAppCheck({ prompt: 'add a refresh-token endpoint', cwd: appA }, { home, ask: () => `{"app":"${appB}"}`, mainRepoRoot: noGit });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /WRONG APP — this prompt is for newman-avtar-be, not newman/);
  assert.ok(r.reason.includes(appB));
  assert.ok(r.reason.includes('add a refresh-token endpoint'));
  assert.match(r.reason, /This App - This Session/);
});

test('check: a failed model call blocks and names the failure', () => {
  const { home, appA } = fixture();
  const r = wrongAppCheck({ prompt: 'x', cwd: appA }, { home, ask: () => { throw new Error('model call timed out after 20s'); }, mainRepoRoot: noGit });
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /APP CHECK FAILED[\s\S]*timed out/);
});

test('check: never asks the model for override, empty prompt, unregistered folder, or one-app registry', () => {
  const { root, home, appA } = fixture();
  const ask = () => { throw new Error('should not be called'); };
  const opts = { home, ask, mainRepoRoot: noGit };
  assert.strictEqual(wrongAppCheck({ prompt: 'This App - This Session do it', cwd: appA }, opts), null);
  assert.strictEqual(wrongAppCheck({ prompt: '   ', cwd: appA }, opts), null);
  assert.strictEqual(wrongAppCheck({ prompt: 'x', cwd: path.join(root, 'other') }, opts), null);
  assert.strictEqual(wrongAppCheck({ prompt: 'x' }, opts), null);
  fs.writeFileSync(path.join(home, '.claude', '.gsd-t-projects'), `${appA}\n`);
  assert.strictEqual(wrongAppCheck({ prompt: 'x', cwd: appA }, opts), null);
});

// End to end: the real hook process with a stand-in `claude` on PATH.
function runHook(input, reply, exitCode = 0) {
  const { root, home } = input;
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'claude'),
    '#!/usr/bin/env node\n' +
    'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{' +
    `if(!process.env.GSDT_APP_GUARD_CHILD)process.exit(9);` +
    `process.stdout.write(JSON.stringify({type:"result",is_error:false,result:${JSON.stringify(reply)}})+"\\n");process.exit(${exitCode});});\n`,
    { mode: 0o755 });
  return execFileSync('node', [HOOK], {
    input: JSON.stringify({ prompt: input.prompt, cwd: input.cwd }), encoding: 'utf8',
    env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GSDT_APP_GUARD_CHILD: '' },
  });
}

test('hook: wrong app → only a block decision is printed', () => {
  const f = fixture();
  const out = runHook({ ...f, prompt: 'fix the login screen', cwd: f.appA }, `{"app":"${f.appB}"}`);
  const j = JSON.parse(out);
  assert.strictEqual(j.decision, 'block');
  assert.strictEqual(j.suppressOriginalPrompt, true);
  assert.ok(j.reason.includes('fix the login screen'));
});

test('hook: this app → clock and Reader Contract as before', () => {
  const f = fixture();
  const out = runHook({ ...f, prompt: 'fix the login screen', cwd: f.appA }, '{"app":"current"}');
  assert.match(out, /^\[GSD-T NOW\]/);
  assert.match(out, /\[GSD-T READER CONTRACT\]/);
});

test('hook: the model call failing blocks with the error', () => {
  const f = fixture();
  const j = JSON.parse(runHook({ ...f, prompt: 'x', cwd: f.appA }, 'boom', 1));
  assert.strictEqual(j.decision, 'block');
  assert.match(j.reason, /APP CHECK FAILED[\s\S]*exited 1/);
});
