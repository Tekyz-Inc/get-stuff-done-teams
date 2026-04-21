#!/usr/bin/env node
'use strict';
/**
 * GSD-T In-Session Usage Hook (M43 D1-T2)
 *
 * Installed into `~/.claude/settings.json` (Stop + SessionEnd) to capture
 * per-turn token usage for the dialog channel. Reads the hook payload from
 * stdin, resolves the project directory from `payload.cwd`, then delegates to
 * `bin/gsd-t-in-session-usage.cjs::processHookPayload` which reads the
 * transcript at `payload.transcript_path` and appends schema-v2 rows to
 * `.gsd-t/metrics/token-usage.jsonl`.
 *
 * Silent on success (hooks run async in Claude Code — stdout is ignored).
 * Swallows every error: a flaky capture must never break the user's session.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SCRIPT_GUARD_MS = 5000;
const started = Date.now();

function _readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { buf += chunk; });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', () => resolve(buf));
    setTimeout(() => resolve(buf), DEFAULT_SCRIPT_GUARD_MS).unref();
  });
}

function _parsePayload(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch (_) {
    return null;
  }
}

function _resolveProjectDir(payload) {
  if (payload && payload.cwd && fs.existsSync(payload.cwd)) return payload.cwd;
  if (process.cwd) return process.cwd();
  return '.';
}

function _resolveInSessionModule(projectDir) {
  const candidates = [
    path.join(projectDir, 'bin', 'gsd-t-in-session-usage.cjs'),
    path.join(process.env.HOME || '', '.claude', 'gsd-t', 'bin', 'gsd-t-in-session-usage.cjs'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  try {
    const raw = await _readStdin();
    const payload = _parsePayload(raw);
    if (!payload) return;
    if (payload.hook_event_name !== 'Stop' && payload.hook_event_name !== 'SessionEnd') return;

    const projectDir = _resolveProjectDir(payload);
    const modulePath = _resolveInSessionModule(projectDir);
    if (!modulePath) return;

    const mod = require(modulePath);
    mod.processHookPayload({ projectDir, payload });
  } catch (_) {
    // Intentionally swallow — hook must never interrupt the user session.
  } finally {
    const elapsed = Date.now() - started;
    if (elapsed > DEFAULT_SCRIPT_GUARD_MS) process.exitCode = 0;
  }
}

if (require.main === module) {
  main();
}

module.exports = { _internal: { _parsePayload, _resolveProjectDir } };
