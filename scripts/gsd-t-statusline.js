#!/usr/bin/env node
'use strict';
// gsd-t-statusline.js — GSD-T status line for Claude Code
// Outputs compact project status for display in Claude Code's statusLine setting.
//
// Configure in ~/.claude/settings.json:
//   "statusLine": "node ~/.claude/scripts/gsd-t-statusline.js"
//
// Context usage is read from .gsd-t/.context-meter-state.json (produced by
// the Context Meter PostToolUse hook). v2.0.0 (M34) — the legacy
// environment-variable-based context check is retired because Claude Code
// never populated those env vars. When the state file is absent or stale
// (>5min), the context segment is omitted.
//
// Zero external dependencies.

const fs = require('fs');
const path = require('path');

// ─── ANSI colors ─────────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const RESET  = '\x1b[0m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const ORANGE = '\x1b[38;5;208m'; // 256-color orange

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.gsd-t'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function readProgress(root) {
  const p = path.join(root, '.gsd-t', 'progress.md');
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function extract(content, key) {
  const m = content.match(new RegExp(`^## ${key}:\\s*(.+)`, 'm'));
  return m ? m[1].trim() : null;
}

function contextBar(pct) {
  // pct: 0-100
  const barLen = 10;
  const filled = Math.round((pct / 100) * barLen);
  const empty  = barLen - filled;
  let color;
  if (pct < 50)      color = GREEN;
  else if (pct < 70) color = YELLOW;
  else if (pct < 85) color = ORANGE;
  else               color = RED;
  return `${color}${'█'.repeat(filled)}${DIM}${'░'.repeat(empty)}${RESET} ${color}${pct}%${RESET}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const root = findProjectRoot();

// Context usage from the Context Meter state file.
// Stale-window check mirrors bin/token-budget.js (5 minutes).
function readContextPct(projectRoot) {
  if (!projectRoot) return null;
  try {
    const fp = path.join(projectRoot, '.gsd-t', '.context-meter-state.json');
    const raw = fs.readFileSync(fp, 'utf8');
    const s = JSON.parse(raw);
    if (!s || typeof s.pct !== 'number' || !s.timestamp) return null;
    const age = Date.now() - Date.parse(s.timestamp);
    if (isNaN(age) || age > 5 * 60 * 1000 || age < 0) return null;
    return Math.min(100, Math.round(s.pct));
  } catch {
    return null;
  }
}

const ctxPct = readContextPct(root);

// GSD-T project state
let projectPart = '';
if (root) {
  const content = readProgress(root);
  if (content) {
    const milestone = extract(content, 'Milestone') || extract(content, 'Current Milestone') || '—';
    const status    = extract(content, 'Status') || '—';
    const version   = extract(content, 'Version') || '';
    const vStr      = version ? ` ${DIM}v${version}${RESET}` : '';
    projectPart = `${BOLD}${milestone}${RESET} ${DIM}${status}${RESET}${vStr}`;
  }
} else {
  projectPart = `${DIM}(no gsd-t project)${RESET}`;
}

// Context bar
let contextPart = '';
if (ctxPct !== null) {
  contextPart = ` │ ctx ${contextBar(ctxPct)}`;
}

const line = `gsd-t │ ${projectPart}${contextPart}`;
process.stdout.write(line + '\n');
