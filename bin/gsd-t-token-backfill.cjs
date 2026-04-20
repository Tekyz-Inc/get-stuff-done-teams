'use strict';
/**
 * GSD-T Historical Token Backfill (M41 D3)
 *
 * Walks past headless stream-json logs + event-stream JSONL and recovers
 * `usage` envelopes for spawns that ran before M41 (when pre-M41 rows
 * wrote `N/A` or `0` because no caller parsed `usage`).
 *
 * Idempotent: re-running produces the same JSONL line count as running
 * once; backfill records are tagged `source: "backfill"` per schema v1.
 *
 * Zero external deps. `.cjs` for ESM/CJS compat.
 */

const fs = require('fs');
const path = require('path');

const capture = require('./gsd-t-token-capture.cjs');

// ── Envelope parsing (assistant-vs-result precedence; inline fallback) ──

function _parseJsonLine(line) {
  const s = String(line || '').trim();
  if (!s || s[0] !== '{') return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

function _pickUsageFromFrame(frame) {
  if (!frame || typeof frame !== 'object') return undefined;
  if (frame.usage && typeof frame.usage === 'object') return frame.usage;
  if (frame.message && typeof frame.message === 'object' && frame.message.usage && typeof frame.message.usage === 'object') {
    return frame.message.usage;
  }
  if (frame.result && typeof frame.result === 'object' && frame.result.usage && typeof frame.result.usage === 'object') {
    return frame.result.usage;
  }
  return undefined;
}

// ── Async log walker ──────────────────────────────────────────────────

function* _walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile()) yield p;
  }
}

function _listCandidateFiles(projectDir) {
  const files = [];
  const eventsDir = path.join(projectDir, '.gsd-t', 'events');
  for (const f of _walkDir(eventsDir)) if (f.endsWith('.jsonl')) files.push(f);
  const streamFeedDir = path.join(projectDir, '.gsd-t', 'stream-feed');
  for (const f of _walkDir(streamFeedDir)) if (f.endsWith('.jsonl')) files.push(f);
  const gsdDir = path.join(projectDir, '.gsd-t');
  for (const f of _walkDir(gsdDir)) {
    const base = path.basename(f);
    if (base.startsWith('headless-') && (base.endsWith('.log') || base.endsWith('.jsonl'))) files.push(f);
  }
  return files;
}

function _mtime(filePath) {
  try { return fs.statSync(filePath).mtimeMs; } catch (_) { return 0; }
}

function _parseSinceFilter(since) {
  if (!since) return 0;
  if (since instanceof Date) return since.getTime();
  const ms = Date.parse(since);
  return Number.isFinite(ms) ? ms : 0;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function _fmtDateTime(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Scan log files for spawn envelopes.
 *
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {string|Date} [opts.since]
 * @returns {AsyncIterable<{envelope, sourceFile, startedAt, endedAt, command, step, model, raw}>}
 */
async function* scanLogs(opts) {
  const projectDir = opts.projectDir || '.';
  const sinceMs = _parseSinceFilter(opts.since);
  const files = _listCandidateFiles(projectDir).filter((f) => _mtime(f) >= sinceMs);

  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
    const lines = text.split('\n');

    // Per-file scan state: track the most recent `init` frame so `result`
    // frames inherit command/step/model/session context.
    let ctx = { command: null, step: null, model: null, startedAt: null };
    let firstSeenMs = null;

    for (const line of lines) {
      const frame = _parseJsonLine(line);
      if (!frame) continue;

      const frameTsMs = (typeof frame.ts === 'string' && Date.parse(frame.ts)) || null;
      if (frameTsMs && firstSeenMs == null) firstSeenMs = frameTsMs;

      // Event-stream frames (UserPromptSubmit, command_invoked, etc.)
      if (frame.type === 'command_invoked' && frame.command) {
        ctx.command = frame.command;
        if (frameTsMs) ctx.startedAt = _fmtDateTime(frameTsMs);
      }
      if (frame.type === 'spawn' && typeof frame.data === 'object' && frame.data) {
        ctx.command = frame.data.command || ctx.command;
        ctx.step    = frame.data.step    || ctx.step;
        ctx.model   = frame.data.model   || ctx.model;
        if (frameTsMs) ctx.startedAt = _fmtDateTime(frameTsMs);
      }

      // Stream-json init (headless)
      if (frame.type === 'system' && frame.subtype === 'init') {
        if (frame.model) ctx.model = frame.model;
        if (frame.session_id && !ctx.step) ctx.step = '-';
        if (frameTsMs && !ctx.startedAt) ctx.startedAt = _fmtDateTime(frameTsMs);
      }

      // Result frame with usage → yield envelope
      if (frame.type === 'result') {
        const usage = _pickUsageFromFrame(frame);
        if (!usage) continue;
        const endedAtMs = frameTsMs || _mtime(file);
        const startedAtFinal = ctx.startedAt || _fmtDateTime(firstSeenMs || endedAtMs) || '';
        const endedAt = _fmtDateTime(endedAtMs) || startedAtFinal;
        yield {
          envelope: usage,
          sourceFile: file,
          startedAt: startedAtFinal,
          endedAt,
          command: ctx.command || _inferCommandFromPath(file),
          step: ctx.step || '-',
          model: ctx.model || frame.model || 'sonnet',
          raw: frame,
        };
        // Reset per-result context so multi-spawn logs don't cross-contaminate
        ctx = { command: ctx.command, step: null, model: ctx.model, startedAt: null };
        firstSeenMs = null;
      }

      // Spawn-result event-stream frames carry the envelope directly
      if (frame.type === 'spawn_result' && frame.data && frame.data.usage) {
        const endedAtMs = frameTsMs || _mtime(file);
        const startedAtFinal = (frame.data.startedAt) || _fmtDateTime(endedAtMs) || '';
        const endedAt = (frame.data.endedAt) || _fmtDateTime(endedAtMs) || startedAtFinal;
        yield {
          envelope: frame.data.usage,
          sourceFile: file,
          startedAt: startedAtFinal,
          endedAt,
          command: frame.data.command || ctx.command || _inferCommandFromPath(file),
          step: frame.data.step || ctx.step || '-',
          model: frame.data.model || ctx.model || 'sonnet',
          raw: frame,
        };
      }
    }
  }
}

function _inferCommandFromPath(file) {
  const base = path.basename(file);
  const m = /^headless-(gsd-t-[a-z-]+)-/.exec(base);
  return m ? m[1] : 'gsd-t-unknown';
}

// ── Matcher + writer ─────────────────────────────────────────────────

function _loadExistingJsonl(jsonlPath) {
  if (!fs.existsSync(jsonlPath)) return [];
  const text = fs.readFileSync(jsonlPath, 'utf8');
  return text.split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch (_) { return null; }
  }).filter(Boolean);
}

function _indexKey(startedAt, command, step, model) {
  return `${startedAt}|${command}|${step}|${model}`;
}

function _parseTokenLogRows(text) {
  // Returns array of {line, idx, startedAt, endedAt, command, step, model, tokensCell}
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('| ')) continue;
    if (/^\|\s*Datetime-start\s*\|/.test(l)) continue;
    if (/^\|[\s\-|]+\|\s*$/.test(l)) continue;
    const cols = l.split('|').slice(1, -1).map((c) => c.trim());
    if (cols.length < 7) continue;
    out.push({
      line: l,
      idx: i,
      startedAt: cols[0],
      endedAt:   cols[1],
      command:   cols[2],
      step:      cols[3],
      model:     cols[4],
      duration:  cols[5],
      tokensCell: cols[6],
      notes: cols[7] || '-',
      domain: cols[8] || '-',
      task: cols[9] || '-',
      ctxPct: cols[10] || 'N/A',
    });
  }
  return { lines, rows: out };
}

function _writeAtomic(filePath, content) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

/**
 * Match envelopes against token-log.md + token-usage.jsonl.
 *
 * @param {object} opts
 * @param {string} opts.projectDir
 * @param {AsyncIterable|Array} opts.envelopes
 * @param {boolean} [opts.patchLog]
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{scanned, parsed, matched, patched, new: number, unmatched}>}
 */
async function matchAndWrite(opts) {
  const projectDir = opts.projectDir || '.';
  const tokenLogPath = path.join(projectDir, '.gsd-t', 'token-log.md');
  const jsonlPath = path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  const patchLog = !!opts.patchLog;
  const dryRun = !!opts.dryRun;

  const counters = { scanned: 0, parsed: 0, matched: 0, patched: 0, new: 0, unmatched: 0 };

  const existing = _loadExistingJsonl(jsonlPath);
  const existingKeys = new Set();
  for (const r of existing) {
    if (r && r.source === 'backfill') {
      existingKeys.add(_indexKey(r.startedAt, r.command, r.step, r.model));
    }
  }

  let tokenLogText = '';
  let parsedLog = { lines: [], rows: [] };
  if (fs.existsSync(tokenLogPath)) {
    tokenLogText = fs.readFileSync(tokenLogPath, 'utf8');
    parsedLog = _parseTokenLogRows(tokenLogText);
  }

  // Iterate envelopes
  for await (const env of opts.envelopes) {
    counters.parsed += 1;
    const key = _indexKey(env.startedAt, env.command, env.step, env.model);

    if (existingKeys.has(key)) continue;

    // Try to match against a token-log.md row by (startedAt, command, step, model)
    const matchRow = parsedLog.rows.find((r) =>
      r.startedAt === env.startedAt &&
      r.command === env.command &&
      r.step === env.step &&
      r.model === env.model
    );

    if (matchRow) {
      counters.matched += 1;
      const cellIsEmpty = !matchRow.tokensCell || matchRow.tokensCell === 'N/A' || matchRow.tokensCell === '0' || matchRow.tokensCell === '—';
      if (cellIsEmpty && patchLog && !dryRun) {
        const newCell = capture._formatTokensCell(env.envelope);
        const cols = matchRow.line.split('|');
        // Columns indexing: [empty, startedAt, endedAt, command, step, model, duration, tokens, ...]
        cols[7] = ` ${newCell} `;
        parsedLog.lines[matchRow.idx] = cols.join('|');
        counters.patched += 1;
      }
    } else {
      counters.unmatched += 1;
    }

    // Write JSONL record (backfill source) whether matched or unmatched
    if (!dryRun) {
      const durationMs = Math.max(0, (Date.parse(env.endedAt.replace(' ', 'T') + ':00') || 0) - (Date.parse(env.startedAt.replace(' ', 'T') + ':00') || 0));
      const record = capture._buildJsonlRecord({
        command: env.command,
        step: env.step,
        model: env.model,
        startedAt: env.startedAt,
        endedAt: env.endedAt,
        durationSec: Math.round(durationMs / 1000),
        usage: env.envelope,
        domain: null,
        task: null,
        notes: matchRow ? 'backfill: matched original row' : 'backfill: no original row',
        ctxPct: null,
        milestone: null,
        source: 'backfill',
      });
      if (!fs.existsSync(path.dirname(jsonlPath))) fs.mkdirSync(path.dirname(jsonlPath), { recursive: true });
      fs.appendFileSync(jsonlPath, JSON.stringify(record) + '\n');
      counters.new += 1;
      existingKeys.add(key);
    }
  }

  counters.scanned = _listCandidateFiles(projectDir).length;

  if (patchLog && !dryRun && counters.patched > 0) {
    _writeAtomic(tokenLogPath, parsedLog.lines.join('\n'));
  }

  return counters;
}

function _printSummary(counters) {
  const msg = `Scanned: ${counters.scanned} files | Parsed: ${counters.parsed} envelopes | Matched: ${counters.matched} | Patched: ${counters.patched} | New JSONL: ${counters.new} | Unmatched: ${counters.unmatched}`;
  process.stdout.write(msg + '\n');
}

/**
 * CLI entrypoint.
 *
 * @param {object} opts
 * @returns {Promise<{counters, exitCode}>}
 */
async function main(opts) {
  const projectDir = opts.projectDir || '.';
  if (!fs.existsSync(projectDir)) {
    process.stderr.write(`gsd-t backfill-tokens: project dir not found: ${projectDir}\n`);
    return { counters: null, exitCode: 3 };
  }

  const envelopes = scanLogs({ projectDir, since: opts.since });
  const counters = await matchAndWrite({
    projectDir,
    envelopes,
    patchLog: !!opts.patchLog,
    dryRun: !!opts.dryRun,
  });

  _printSummary(counters);
  return { counters, exitCode: 0 };
}

module.exports = {
  scanLogs,
  matchAndWrite,
  main,
  _parseJsonLine,
  _pickUsageFromFrame,
  _listCandidateFiles,
  _parseTokenLogRows,
};
