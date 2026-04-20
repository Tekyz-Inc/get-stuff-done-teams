#!/usr/bin/env node
/**
 * GSD-T Token Aggregator (M40 D4-T6)
 *
 * Reads stream-feed JSONL (one file per UTC day), parses `usage` fields from
 * `{type:"assistant"}` and `{type:"result"}` frames, groups by workerPid /
 * taskId / wave / domain / milestone (inferred from orchestrator state.json),
 * and:
 *   1. Appends per-task rows to .gsd-t/metrics/token-usage.jsonl (schema v1)
 *   2. Updates the matching row in .gsd-t/token-log.md (Tokens column rewrite)
 *
 * Modes: --once (one-shot scan) | --tail (follow JSONL live)
 * Zero external deps — node fs + readline only.
 *
 * Contract: .gsd-t/contracts/stream-json-sink-contract.md §"Usage field propagation"
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

function parseArgs(argv) {
  const opts = {
    mode: 'once',
    feedLog: null,
    projectDir: process.cwd(),
    outputPath: null,
    tokenLogPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tail') opts.mode = 'tail';
    else if (a === '--once') opts.mode = 'once';
    else if (a === '--feed-log') opts.feedLog = argv[++i];
    else if (a === '--project-dir') opts.projectDir = argv[++i];
    else if (a === '--output') opts.outputPath = argv[++i];
    else if (a === '--token-log') opts.tokenLogPath = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  if (!opts.outputPath) opts.outputPath = path.join(opts.projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  if (!opts.tokenLogPath) opts.tokenLogPath = path.join(opts.projectDir, '.gsd-t', 'token-log.md');
  if (!opts.feedLog) {
    const today = new Date().toISOString().slice(0, 10);
    opts.feedLog = path.join(opts.projectDir, '.gsd-t', 'stream-feed', `${today}.jsonl`);
  }
  return opts;
}

function showHelp() {
  process.stdout.write(`
gsd-t-token-aggregator — Per-task token + cost rollup from stream-feed JSONL

Usage:
  node scripts/gsd-t-token-aggregator.js --once [--feed-log PATH]
  node scripts/gsd-t-token-aggregator.js --tail [--feed-log PATH]

Options:
  --once              One-shot scan, exit (default).
  --tail              Follow JSONL live; update as frames arrive.
  --feed-log PATH     JSONL to read. Default: .gsd-t/stream-feed/<today>.jsonl
  --project-dir PATH  Project root (default: cwd).
  --output PATH       Aggregate output path. Default: .gsd-t/metrics/token-usage.jsonl
  --token-log PATH    Markdown log to update. Default: .gsd-t/token-log.md
  --help, -h          Show this help.
`);
}

// ── Core aggregation ─────────────────────────────────────────────────────

/**
 * Parse a single JSON frame. Updates `groups` map keyed by (workerPid, taskId).
 * Each group holds: workerPid, taskId, wave, domain, lastTs, startTs,
 * inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens,
 * costUSD, numTurns, hasResult, assistantFrames, partial.
 */
function processFrame(frame, groups, ctx) {
  if (!frame || typeof frame !== 'object') return;

  // Track current worker/task context from task-boundary frames.
  if (frame.type === 'task-boundary') {
    const key = `${frame.workerPid}::${frame.taskId}`;
    let g = groups.get(key);
    if (!g) {
      g = initGroup(frame.workerPid, frame.taskId, frame.domain, frame.wave);
      groups.set(key, g);
    } else {
      if (frame.domain) g.domain = frame.domain;
      if (typeof frame.wave === 'number') g.wave = frame.wave;
    }
    if (frame.state === 'start') g.startTs = frame.ts || null;
    if (frame.state === 'done' || frame.state === 'failed') {
      g.endTs = frame.ts || null;
      g.state = frame.state;
    }
    ctx.current = { workerPid: frame.workerPid, taskId: frame.taskId };
    return;
  }

  // Need context to attribute a frame to a task.
  const attributeKey = pickAttribution(frame, ctx);
  if (!attributeKey) return;
  let g = groups.get(attributeKey);
  if (!g) {
    const [pid, tid] = attributeKey.split('::');
    g = initGroup(Number(pid) || null, tid || null, null, null);
    groups.set(attributeKey, g);
  }

  if (frame.type === 'assistant' && frame.message && frame.message.usage) {
    const u = frame.message.usage;
    g.inputTokens += u.input_tokens || 0;
    g.outputTokens += u.output_tokens || 0;
    g.cacheReadInputTokens += u.cache_read_input_tokens || 0;
    g.cacheCreationInputTokens += u.cache_creation_input_tokens || 0;
    g.assistantFrames += 1;
  } else if (frame.type === 'assistant' && frame.usage) {
    // Some stream formats inline usage at top level.
    const u = frame.usage;
    g.inputTokens += u.input_tokens || 0;
    g.outputTokens += u.output_tokens || 0;
    g.cacheReadInputTokens += u.cache_read_input_tokens || 0;
    g.cacheCreationInputTokens += u.cache_creation_input_tokens || 0;
    g.assistantFrames += 1;
  } else if (frame.type === 'result') {
    if (frame.usage) {
      // Result carries the aggregate — prefer this when present (overwrites per-assistant sum to match official count).
      const u = frame.usage;
      g.inputTokens = u.input_tokens != null ? u.input_tokens : g.inputTokens;
      g.outputTokens = u.output_tokens != null ? u.output_tokens : g.outputTokens;
      g.cacheReadInputTokens = u.cache_read_input_tokens != null ? u.cache_read_input_tokens : g.cacheReadInputTokens;
      g.cacheCreationInputTokens = u.cache_creation_input_tokens != null ? u.cache_creation_input_tokens : g.cacheCreationInputTokens;
    }
    if (typeof frame.total_cost_usd === 'number') g.costUSD = frame.total_cost_usd;
    else if (typeof frame.cost_usd === 'number') g.costUSD = frame.cost_usd;
    else if (typeof frame.costUSD === 'number') g.costUSD = frame.costUSD;
    if (typeof frame.num_turns === 'number') g.numTurns = frame.num_turns;
    if (typeof frame.duration_ms === 'number') g.durationMs = frame.duration_ms;
    g.hasResult = true;
  }
}

function pickAttribution(frame, ctx) {
  if (frame.workerPid && frame.taskId) return `${frame.workerPid}::${frame.taskId}`;
  if (frame.session_id && ctx.sessionMap && ctx.sessionMap.has(frame.session_id)) {
    return ctx.sessionMap.get(frame.session_id);
  }
  if (ctx.current && ctx.current.workerPid != null && ctx.current.taskId) {
    return `${ctx.current.workerPid}::${ctx.current.taskId}`;
  }
  return null;
}

function initGroup(workerPid, taskId, domain, wave) {
  return {
    workerPid, taskId, domain: domain || null, wave: wave == null ? null : wave,
    startTs: null, endTs: null, state: null,
    inputTokens: 0, outputTokens: 0,
    cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
    costUSD: null, numTurns: null, durationMs: null,
    hasResult: false, assistantFrames: 0, partial: false,
  };
}

// ── File I/O ────────────────────────────────────────────────────────────

function readFrames(filePath) {
  const frames = [];
  if (!fs.existsSync(filePath)) return frames;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { frames.push(JSON.parse(t)); }
    catch { /* malformed — logged elsewhere */ }
  }
  return frames;
}

function inferMilestone(projectDir) {
  const statePath = path.join(projectDir, '.gsd-t', 'orchestrator', 'state.json');
  try {
    const obj = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return obj.milestone || null;
  } catch { return null; }
}

function writeTokenUsageJsonl(outputPath, rows) {
  try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch { /* exists */ }
  const lines = rows.map(r => JSON.stringify(r));
  fs.appendFileSync(outputPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
}

/**
 * Update .gsd-t/token-log.md rows in place: match by (command, startDatetime, task)
 * and rewrite the Tokens column with `in=N out=N cr=N cc=N $X.XX`.
 * We don't KNOW command from the JSONL; caller supplies it. For auto-mode, best
 * match is by taskId alone.
 */
function updateTokenLog(tokenLogPath, rows) {
  if (!fs.existsSync(tokenLogPath)) return { updated: 0, matched: 0 };
  const content = fs.readFileSync(tokenLogPath, 'utf8');
  const lines = content.split('\n');
  let updated = 0, matched = 0;

  // Build an index by taskId for O(1) lookup.
  const byTask = new Map();
  for (const r of rows) {
    if (r.taskId) byTask.set(r.taskId, r);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|') || line.includes('--------')) continue;
    // Split by | keeping trailing empties.
    const parts = line.split('|').map(s => s.trim());
    // Table shape: | DT-s | DT-e | Command | Step | Model | Duration(s) | Notes | Tokens | Compacted | Domain | Task | Ctx% |
    // parts[0] is leading empty, parts[1] = DT-s, …, parts[11] = Task, parts[12] = Ctx%
    if (parts.length < 13) continue;
    const taskCell = parts[11];
    if (!taskCell) continue;
    matched += 1;
    const r = byTask.get(taskCell);
    if (!r) continue;
    const tokenSummary = formatTokenSummary(r);
    if (parts[8] === tokenSummary) continue;
    parts[8] = tokenSummary;
    lines[i] = parts.join(' | ');
    updated += 1;
  }

  if (updated > 0) {
    fs.writeFileSync(tokenLogPath, lines.join('\n'));
  }
  return { updated, matched };
}

function formatTokenSummary(r) {
  const cost = (typeof r.costUSD === 'number') ? `$${r.costUSD.toFixed(2)}` : '—';
  return `in=${r.inputTokens} out=${r.outputTokens} cr=${r.cacheReadInputTokens} cc=${r.cacheCreationInputTokens} ${cost}`;
}

// ── Run modes ───────────────────────────────────────────────────────────

function runOnce(opts) {
  const frames = readFrames(opts.feedLog);
  const groups = new Map();
  const ctx = { current: null, sessionMap: new Map() };
  for (const f of frames) processFrame(f, groups, ctx);
  const milestone = inferMilestone(opts.projectDir);
  const nowIso = new Date().toISOString();
  const rows = [];
  for (const g of groups.values()) {
    if (!g.hasResult && g.assistantFrames === 0) continue;
    g.partial = !g.hasResult;
    rows.push({
      schemaVersion: SCHEMA_VERSION,
      ts: nowIso,
      workerPid: g.workerPid,
      taskId: g.taskId,
      domain: g.domain,
      wave: g.wave,
      milestone,
      inputTokens: g.inputTokens,
      outputTokens: g.outputTokens,
      cacheReadInputTokens: g.cacheReadInputTokens,
      cacheCreationInputTokens: g.cacheCreationInputTokens,
      costUSD: g.costUSD,
      numTurns: g.numTurns,
      durationMs: g.durationMs,
      startTs: g.startTs,
      endTs: g.endTs,
      state: g.state,
      assistantFrames: g.assistantFrames,
      partial: g.partial,
    });
  }
  writeTokenUsageJsonl(opts.outputPath, rows);
  const logResult = updateTokenLog(opts.tokenLogPath, rows);
  return { rows, logUpdate: logResult };
}

function runTail(opts) {
  // Follow file from end. Simple poll every 500ms.
  let offset = 0;
  try { offset = fs.statSync(opts.feedLog).size; } catch { /* new */ }
  const groups = new Map();
  const ctx = { current: null, sessionMap: new Map() };
  let lastWroteRows = 0;

  const poll = () => {
    try {
      const stat = fs.statSync(opts.feedLog);
      if (stat.size <= offset) return;
      const fd = fs.openSync(opts.feedLog, 'r');
      try {
        const buf = Buffer.alloc(stat.size - offset);
        fs.readSync(fd, buf, 0, buf.length, offset);
        offset = stat.size;
        const chunk = buf.toString('utf8');
        let acc = '';
        for (const line of chunk.split('\n')) {
          const t = line.trim();
          if (!t) continue;
          try { processFrame(JSON.parse(t), groups, ctx); } catch { /* skip */ }
        }
      } finally { fs.closeSync(fd); }
      // Rewrite aggregate on every tick when groups is non-empty — idempotent.
      const milestone = inferMilestone(opts.projectDir);
      const nowIso = new Date().toISOString();
      const rows = [];
      for (const g of groups.values()) {
        if (!g.hasResult && g.assistantFrames === 0) continue;
        g.partial = !g.hasResult;
        rows.push({
          schemaVersion: SCHEMA_VERSION, ts: nowIso,
          workerPid: g.workerPid, taskId: g.taskId,
          domain: g.domain, wave: g.wave, milestone,
          inputTokens: g.inputTokens, outputTokens: g.outputTokens,
          cacheReadInputTokens: g.cacheReadInputTokens,
          cacheCreationInputTokens: g.cacheCreationInputTokens,
          costUSD: g.costUSD, numTurns: g.numTurns, durationMs: g.durationMs,
          startTs: g.startTs, endTs: g.endTs, state: g.state,
          assistantFrames: g.assistantFrames, partial: g.partial,
        });
      }
      if (rows.length !== lastWroteRows) {
        writeTokenUsageJsonl(opts.outputPath, rows);
        updateTokenLog(opts.tokenLogPath, rows);
        lastWroteRows = rows.length;
      }
    } catch { /* file missing or I/O error */ }
  };

  const interval = setInterval(poll, 500);
  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
  }
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
  return { stop };
}

module.exports = {
  processFrame,
  readFrames,
  inferMilestone,
  writeTokenUsageJsonl,
  updateTokenLog,
  formatTokenSummary,
  initGroup,
  runOnce,
  runTail,
  parseArgs,
  SCHEMA_VERSION,
};

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { showHelp(); process.exit(0); }
  if (opts.mode === 'tail') {
    const handle = runTail(opts);
    process.stdout.write(`[token-aggregator] tailing ${opts.feedLog}\n`);
    // Keep process alive.
  } else {
    const { rows, logUpdate } = runOnce(opts);
    process.stdout.write(`[token-aggregator] processed ${rows.length} task groups; ${logUpdate.updated}/${logUpdate.matched} token-log rows updated\n`);
  }
}
