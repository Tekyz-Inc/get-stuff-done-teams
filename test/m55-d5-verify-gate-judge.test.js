'use strict';

/**
 * M55 D5 — verify-gate judge prompt size budget tests.
 *
 * Asserts the judge prompt always fits ≤500 tokens regardless of input
 * envelope size.
 *
 * Contract: .gsd-t/contracts/verify-gate-contract.md v1.0.0 STABLE.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const judge = require('../bin/gsd-t-verify-gate-judge.cjs');

// ── Happy path ──────────────────────────────────────────────────────────────

test('buildJudgePrompt: PASS envelope produces a valid prompt ≤500 tokens', () => {
  const env = {
    schemaVersion: '1.0.0',
    summary: {
      verdict: 'PASS',
      track1: { ok: true, failedChecks: [] },
      track2: { ok: true, failedWorkers: [] },
    },
  };
  const prompt = judge.buildJudgePrompt(env);
  assert.ok(prompt.includes('PASS'));
  assert.ok(prompt.includes('Verdict (PASS|FAIL)'));
  assert.ok(judge.estimateTokens(prompt) <= judge.MAX_PROMPT_TOKENS);
});

// ── Hard cap ≤500 tokens ───────────────────────────────────────────────────

test('buildJudgePrompt: cap holds with 100 failed workers, large snippets', () => {
  const big = 'x'.repeat(2000);
  const failedWorkers = Array.from({ length: 100 }, (_, i) => ({
    id: 'cli-' + i,
    exitCode: 1,
    summarySnippet: big,
  }));
  const env = {
    schemaVersion: '1.0.0',
    summary: {
      verdict: 'FAIL',
      track1: { ok: true, failedChecks: [] },
      track2: { ok: false, failedWorkers },
    },
  };
  const prompt = judge.buildJudgePrompt(env);
  const tokens = judge.estimateTokens(prompt);
  assert.ok(tokens <= judge.MAX_PROMPT_TOKENS,
    'prompt should be ≤' + judge.MAX_PROMPT_TOKENS + ' tokens, got ' + tokens);
});

test('buildJudgePrompt: cap holds with 50 failed checks, large msgs', () => {
  const big = 'msg-' + 'y'.repeat(1000);
  const failedChecks = Array.from({ length: 50 }, (_, i) => ({
    id: 'check-' + i,
    severity: 'error',
    msg: big,
  }));
  const env = {
    schemaVersion: '1.0.0',
    summary: {
      verdict: 'FAIL',
      track1: { ok: false, failedChecks },
      track2: { ok: true, failedWorkers: [] },
    },
  };
  const prompt = judge.buildJudgePrompt(env);
  assert.ok(judge.estimateTokens(prompt) <= judge.MAX_PROMPT_TOKENS);
});

test('buildJudgePrompt: cap holds with both track1 and track2 huge', () => {
  const big = 'z'.repeat(1500);
  const env = {
    schemaVersion: '1.0.0',
    summary: {
      verdict: 'FAIL',
      track1: {
        ok: false,
        failedChecks: Array.from({ length: 30 }, (_, i) => ({
          id: 'c-' + i, severity: 'error', msg: big,
        })),
      },
      track2: {
        ok: false,
        failedWorkers: Array.from({ length: 30 }, (_, i) => ({
          id: 'w-' + i, exitCode: 1, summarySnippet: big,
        })),
      },
    },
  };
  const prompt = judge.buildJudgePrompt(env);
  assert.ok(judge.estimateTokens(prompt) <= judge.MAX_PROMPT_TOKENS);
});

// ── Resilience to malformed input ──────────────────────────────────────────

test('buildJudgePrompt: malformed JSON string → FAIL prompt with reason', () => {
  const prompt = judge.buildJudgePrompt('{not-json');
  assert.ok(prompt.includes('FAIL'));
  assert.ok(prompt.includes('envelope-malformed'));
  assert.ok(judge.estimateTokens(prompt) <= judge.MAX_PROMPT_TOKENS);
});

test('buildJudgePrompt: missing summary → FAIL prompt with summary-missing', () => {
  const env = { schemaVersion: '1.0.0' };
  const prompt = judge.buildJudgePrompt(env);
  assert.ok(prompt.includes('FAIL'));
  assert.ok(prompt.includes('summary-missing'));
});

test('buildJudgePrompt: null envelope → FAIL', () => {
  const prompt = judge.buildJudgePrompt(null);
  assert.ok(prompt.includes('FAIL'));
});

// ── String envelope (parsed internally) ────────────────────────────────────

test('buildJudgePrompt: accepts JSON string envelope', () => {
  const env = {
    summary: { verdict: 'PASS', track1: { ok: true, failedChecks: [] }, track2: { ok: true, failedWorkers: [] } },
  };
  const prompt = judge.buildJudgePrompt(JSON.stringify(env));
  assert.ok(prompt.includes('PASS'));
});

// ── Pure / deterministic ───────────────────────────────────────────────────

test('buildJudgePrompt: same input → byte-identical output', () => {
  const env = {
    summary: {
      verdict: 'FAIL',
      track1: { ok: false, failedChecks: [{ id: 'a', severity: 'error', msg: 'x' }] },
      track2: { ok: true, failedWorkers: [] },
    },
  };
  const p1 = judge.buildJudgePrompt(env);
  const p2 = judge.buildJudgePrompt(env);
  assert.equal(p1, p2);
});

// ── _trim helper ───────────────────────────────────────────────────────────

test('_trim: short string passes through', () => {
  assert.equal(judge._trim('hi', 10), 'hi');
});

test('_trim: long string trimmed with separator', () => {
  const out = judge._trim('A'.repeat(200), 5);
  assert.ok(out.includes('…'));
  assert.ok(out.length < 200);
});

// ── _parseArgv ──────────────────────────────────────────────────────────────

test('_parseArgv: --in PATH', () => {
  const out = judge._parseArgv(['--in', '/tmp/foo.json']);
  assert.equal(out.in, '/tmp/foo.json');
});

test('_parseArgv: --in=PATH', () => {
  const out = judge._parseArgv(['--in=/tmp/bar.json']);
  assert.equal(out.in, '/tmp/bar.json');
});

test('_parseArgv: --help', () => {
  const out = judge._parseArgv(['--help']);
  assert.equal(out.help, true);
});

test('_parseArgv: unknown flag flagged', () => {
  const out = judge._parseArgv(['--bogus']);
  assert.ok(out._badFlag);
});
