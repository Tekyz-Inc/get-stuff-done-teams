#!/usr/bin/env node
'use strict';

/**
 * GSD-T verify-gate judge (M55 D5)
 *
 * Companion to bin/gsd-t-verify-gate.cjs. Takes a verify-gate envelope JSON
 * (object or stringified) and produces a ≤500-token LLM prompt scaffold the
 * orchestrator can hand to the LLM judge.
 *
 * Pure synchronous — no LLM call, no spawn, no I/O beyond reading stdin or
 * the path passed via --in.
 *
 * Contract: .gsd-t/contracts/verify-gate-contract.md v1.0.0 STABLE.
 *
 * Hard rules:
 *   1. Output prompt is ≤MAX_PROMPT_TOKENS regardless of envelope size
 *      (4 chars/token approximation).
 *   2. The judge sees `summary` only — never `track1.checks[]` raw or
 *      Track 2 worker logs.
 *   3. Pure function — same envelope in, same prompt out.
 */

const fs = require('fs');

const MAX_PROMPT_TOKENS = 500;
const TOKENS_PER_CHAR = 0.25;
const SUMMARY_BUDGET_TOKENS = 380; // leave headroom for instruction prefix
const PROMPT_PREFIX_LINES = [
  'GSD-T verify-gate result. Render PASS / FAIL.',
  'Deterministic verdict in `summary.verdict`. Confirm or contradict.',
  'If FAIL, name the failing track in one short line.',
  '',
  '```json',
];

const PROMPT_SUFFIX_LINES = [
  '```',
  '',
  'Verdict (PASS|FAIL) and 1-line reason:',
];

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a judge prompt from a verify-gate envelope.
 * @param {object|string} envelope
 * @returns {string} the prompt scaffold
 */
function buildJudgePrompt(envelope) {
  const env = typeof envelope === 'string' ? _safeParse(envelope) : envelope;
  if (!env || typeof env !== 'object') {
    return _wrap({ verdict: 'FAIL', reason: 'envelope-malformed' });
  }
  let summary = env.summary;
  if (!summary || typeof summary !== 'object') {
    return _wrap({
      verdict: 'FAIL',
      reason: 'summary-missing',
      schemaVersion: env.schemaVersion || null,
    });
  }
  // Shrink the summary if needed to fit within SUMMARY_BUDGET_TOKENS.
  const shrunk = _fitSummary(summary);
  return _wrap(shrunk);
}

/**
 * Estimate token count for a string (4 chars/token approximation).
 * @param {string} s
 * @returns {number}
 */
function estimateTokens(s) {
  return Math.ceil((s || '').length * TOKENS_PER_CHAR);
}

// ── Internal helpers ────────────────────────────────────────────────────────

function _safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

function _wrap(summaryObj) {
  const body = JSON.stringify(summaryObj, null, 2);
  return [
    ...PROMPT_PREFIX_LINES,
    body,
    ...PROMPT_SUFFIX_LINES,
  ].join('\n');
}

function _fitSummary(summary) {
  // Start with a copy. If the JSON exceeds budget, shrink failedChecks /
  // failedWorkers entries iteratively.
  const copy = JSON.parse(JSON.stringify(summary));

  const tokens = (obj) => estimateTokens(JSON.stringify(obj, null, 2));
  if (tokens(copy) <= SUMMARY_BUDGET_TOKENS) return copy;

  // Shrink summarySnippets in failedWorkers first.
  if (Array.isArray(copy.track2 && copy.track2.failedWorkers)) {
    let cap = 100;
    while (tokens(copy) > SUMMARY_BUDGET_TOKENS && cap >= 8) {
      copy.track2.failedWorkers = copy.track2.failedWorkers.map((w) => ({
        ...w,
        summarySnippet: _trim(w.summarySnippet, cap),
      }));
      cap = Math.floor(cap / 2);
    }
  }

  // Truncate failedWorkers list if still over.
  if (Array.isArray(copy.track2 && copy.track2.failedWorkers)) {
    while (tokens(copy) > SUMMARY_BUDGET_TOKENS && copy.track2.failedWorkers.length > 1) {
      const removed = copy.track2.failedWorkers.length - 1;
      copy.track2.failedWorkers = [copy.track2.failedWorkers[0]];
      copy.track2.failedWorkersTruncated = removed;
    }
  }

  // Truncate failedChecks list if still over.
  if (Array.isArray(copy.track1 && copy.track1.failedChecks)) {
    while (tokens(copy) > SUMMARY_BUDGET_TOKENS && copy.track1.failedChecks.length > 1) {
      const removed = copy.track1.failedChecks.length - 1;
      copy.track1.failedChecks = [copy.track1.failedChecks[0]];
      copy.track1.failedChecksTruncated = removed;
    }
  }

  // If still over, last resort — drop msgs.
  if (tokens(copy) > SUMMARY_BUDGET_TOKENS) {
    if (copy.track1 && Array.isArray(copy.track1.failedChecks)) {
      copy.track1.failedChecks = copy.track1.failedChecks.map((c) => ({ id: c.id, severity: c.severity }));
    }
    if (copy.track2 && Array.isArray(copy.track2.failedWorkers)) {
      copy.track2.failedWorkers = copy.track2.failedWorkers.map((w) => ({ id: w.id, exitCode: w.exitCode }));
    }
  }

  return copy;
}

function _trim(s, cap) {
  if (typeof s !== 'string' || s.length <= cap * 2) return s || '';
  return s.slice(0, cap) + '\n…\n' + s.slice(-cap);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function _parseArgv(argv) {
  const out = { in: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i] || null;
    else if (a.startsWith('--in=')) out.in = a.slice(5);
    else if (a === '--help' || a === '-h') out.help = true;
    else { out._badFlag = 'unknown flag: ' + a; }
  }
  return out;
}

function _printHelp() {
  process.stdout.write([
    'Usage: gsd-t verify-gate-judge [--in PATH]',
    '',
    'Reads a verify-gate envelope (JSON) from --in PATH or stdin, prints the',
    'LLM judge prompt scaffold (≤500 tokens) to stdout.',
    '',
    'Exit codes:',
    '  0  prompt emitted',
    '  2  CLI usage error',
  ].join('\n') + '\n');
}

function _readStdin() {
  // Synchronous read — judge is meant to be piped from verify-gate.
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function _runCli(argv) {
  const args = _parseArgv(argv);
  if (args.help) {
    _printHelp();
    return 0;
  }
  if (args._badFlag) {
    process.stderr.write('verify-gate-judge: ' + args._badFlag + '\n');
    return 2;
  }
  let raw = '';
  if (args.in) {
    try {
      raw = fs.readFileSync(args.in, 'utf8');
    } catch (err) {
      process.stderr.write('verify-gate-judge: cannot read ' + args.in + ' (' + err.message + ')\n');
      return 2;
    }
  } else {
    raw = _readStdin();
  }
  const prompt = buildJudgePrompt(raw);
  process.stdout.write(prompt + '\n');
  return 0;
}

if (require.main === module) {
  process.exit(_runCli(process.argv.slice(2)));
}

module.exports = {
  buildJudgePrompt,
  estimateTokens,
  MAX_PROMPT_TOKENS,
  SUMMARY_BUDGET_TOKENS,
  // Test surface:
  _fitSummary,
  _trim,
  _wrap,
  _parseArgv,
};
