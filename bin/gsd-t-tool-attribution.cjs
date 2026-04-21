'use strict';
/**
 * GSD-T Per-Tool Attribution Library (M43 D2)
 *
 * Joins per-turn usage rows (`.gsd-t/metrics/token-usage.jsonl`) with tool_call
 * events (`.gsd-t/events/YYYY-MM-DD.jsonl`) and attributes each turn's tokens
 * to the tools called during that turn via the output-byte ratio algorithm.
 *
 * Contract: `.gsd-t/contracts/tool-attribution-contract.md` v1.0.0.
 *
 * Zero external deps. `.cjs` for ESM/CJS compat.
 *
 * Exports:
 *   - joinTurnsAndEvents({ turnsPath, eventsGlob, since?, milestone? })
 *   - attributeTurn(turn)
 *   - aggregateByTool(rows)
 *   - aggregateByCommand(rows)
 *   - aggregateByDomain(rows)
 */

const fs = require('fs');
const path = require('path');

// ── JSONL helpers ────────────────────────────────────────────────────

function _safeParse(line) {
  const s = (line || '').trim();
  if (!s || s[0] !== '{') return null;
  try { return JSON.parse(s); } catch (_) { return null; }
}

function _readJsonl(p) {
  if (!p || !fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  const out = [];
  for (const line of text.split('\n')) {
    const j = _safeParse(line);
    if (j) out.push(j);
  }
  return out;
}

// ── Event-glob resolution ────────────────────────────────────────────

function _resolveEventFiles(eventsGlob, since) {
  if (Array.isArray(eventsGlob)) return eventsGlob.filter((p) => p && fs.existsSync(p));
  if (!eventsGlob) return [];
  let stat;
  try { stat = fs.statSync(eventsGlob); } catch (_) { return []; }
  if (stat.isFile()) return [eventsGlob];
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(eventsGlob).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f));
    const sinceDay = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : null;
    const filtered = sinceDay ? entries.filter((f) => f.slice(0, 10) >= sinceDay) : entries;
    return filtered.sort().map((f) => path.join(eventsGlob, f));
  }
  return [];
}

// ── Turn-row normalization ───────────────────────────────────────────

function _normalizeTurn(row) {
  const usage = {
    input_tokens:   Number(row.inputTokens || 0),
    output_tokens:  Number(row.outputTokens || 0),
    cache_read:     Number(row.cacheReadInputTokens || 0),
    cache_creation: Number(row.cacheCreationInputTokens || 0),
    cost_usd: (typeof row.costUSD === 'number' && Number.isFinite(row.costUSD)) ? row.costUSD : null,
  };
  const hasUsage = !!row.hasUsage;
  const anyTokens = usage.input_tokens > 0 || usage.output_tokens > 0 ||
                    usage.cache_read > 0  || usage.cache_creation > 0;
  if (!hasUsage && !anyTokens) return null;
  return {
    turn_id:    row.turn_id != null ? String(row.turn_id) : null,
    session_id: row.session_id != null ? String(row.session_id) : null,
    ts:         row.ts || row.startedAt || null,
    startedAt:  row.startedAt || null,
    command:    row.command || null,
    domain:     row.domain || null,
    milestone:  row.milestone || null,
    usage,
  };
}

// ── Turn-window matching ─────────────────────────────────────────────

function _assignToolCallsToTurns(turnsBySession, eventsBySession) {
  const assignments = new Map();
  for (const [sid, turns] of turnsBySession.entries()) {
    if (!turns.length) continue;
    const events = eventsBySession.get(sid) || [];
    events.sort((a, b) => (a._ms - b._ms));
    let ti = 0;
    for (const ev of events) {
      while (ti + 1 < turns.length && turns[ti + 1]._ms <= ev._ms) ti += 1;
      const currentTurn = turns[ti];
      if (ti === 0 && currentTurn._ms > ev._ms) continue;
      const key = `${sid} ${currentTurn.turn_id}`;
      if (!assignments.has(key)) assignments.set(key, []);
      assignments.get(key).push({
        tool_name: ev.tool_name || null,
        ts: ev.ts,
        bytes: Number.isFinite(ev.bytes) ? Math.max(0, Number(ev.bytes)) : 0,
      });
    }
  }
  return assignments;
}

function _parseMs(s) {
  if (!s) return NaN;
  if (/\dT\d/.test(s)) return Date.parse(s);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return Date.parse(s.replace(' ', 'T') + ':00');
  const p = Date.parse(s);
  return Number.isFinite(p) ? p : NaN;
}

// ── Public API: joinTurnsAndEvents ───────────────────────────────────

function joinTurnsAndEvents(opts) {
  opts = opts || {};
  const turnsPath = opts.turnsPath;
  if (!turnsPath) throw new Error('joinTurnsAndEvents: turnsPath required');

  const rawTurns = _readJsonl(turnsPath);
  const turns = [];
  for (const row of rawTurns) {
    if (!row.session_id || !row.turn_id) continue;
    const n = _normalizeTurn(row);
    if (!n) continue;
    if (opts.since) {
      const day = String(n.startedAt || '').slice(0, 10);
      if (day && day < opts.since) continue;
    }
    if (opts.milestone) {
      if (!n.milestone || n.milestone !== opts.milestone) continue;
    }
    // Prefer ts (ISO UTC — exact write time of the row) over startedAt
    // ('YYYY-MM-DD HH:MM' local minute-precision). Events carry ISO UTC, so
    // ts → ts comparison is timezone-safe. startedAt remains the display
    // field but isn't the join key.
    n._ms = _parseMs(n.ts || n.startedAt);
    turns.push(n);
  }

  // Dedup by (session_id, turn_id).
  const seen = new Set();
  const turnsDedup = [];
  for (const t of turns) {
    const k = `${t.session_id} ${t.turn_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    turnsDedup.push(t);
  }

  const turnsBySession = new Map();
  for (const t of turnsDedup) {
    if (!turnsBySession.has(t.session_id)) turnsBySession.set(t.session_id, []);
    turnsBySession.get(t.session_id).push(t);
  }
  for (const arr of turnsBySession.values()) {
    arr.sort((a, b) => (a._ms || 0) - (b._ms || 0));
  }

  const eventFiles = _resolveEventFiles(opts.eventsGlob, opts.since);
  const eventsBySession = new Map();
  for (const f of eventFiles) {
    const rows = _readJsonl(f);
    for (const e of rows) {
      if (e.event_type !== 'tool_call') continue;
      const sid = e.agent_id;
      if (!sid || !turnsBySession.has(sid)) continue;
      if (!eventsBySession.has(sid)) eventsBySession.set(sid, []);
      eventsBySession.get(sid).push({
        tool_name: e.reasoning || null,
        ts: e.ts,
        bytes: Number.isFinite(e.bytes) ? e.bytes :
               Number.isFinite(e.result_bytes) ? e.result_bytes : 0,
        _ms: _parseMs(e.ts),
      });
    }
  }

  const assignments = _assignToolCallsToTurns(turnsBySession, eventsBySession);

  const out = [];
  for (const [sid, arr] of turnsBySession.entries()) {
    for (const t of arr) {
      const key = `${sid} ${t.turn_id}`;
      const calls = assignments.get(key) || [];
      out.push({
        turn_id:    t.turn_id,
        session_id: t.session_id,
        ts:         t.startedAt || t.ts,
        command:    t.command,
        domain:     t.domain,
        milestone:  t.milestone,
        usage:      t.usage,
        tool_calls: calls,
      });
    }
  }
  return out;
}

// ── Public API: attributeTurn ────────────────────────────────────────

function attributeTurn(turn) {
  if (!turn || typeof turn !== 'object') {
    throw new Error('attributeTurn: turn object required');
  }
  const calls = Array.isArray(turn.tool_calls) ? turn.tool_calls : [];
  const usage = turn.usage || {};
  const inT  = Number(usage.input_tokens || 0);
  const outT = Number(usage.output_tokens || 0);
  const crT  = Number(usage.cache_read || 0);
  const ccT  = Number(usage.cache_creation || 0);
  const cost = (typeof usage.cost_usd === 'number' && Number.isFinite(usage.cost_usd)) ? usage.cost_usd : null;

  const base = {
    turn_id:    turn.turn_id || null,
    session_id: turn.session_id || null,
    command:    turn.command || null,
    domain:     turn.domain || null,
    milestone:  turn.milestone || null,
    attributions: [],
  };

  if (calls.length === 0) {
    base.attributions.push(_mkAttr('no-tool', 0, 1.0, inT, outT, crT, ccT, cost, false));
    return base;
  }

  let totalBytes = 0;
  const calls2 = calls.map((c) => {
    const b = Number.isFinite(c.bytes) ? Math.max(0, Number(c.bytes)) : 0;
    totalBytes += b;
    return { ...c, bytes: b };
  });

  if (totalBytes === 0) {
    const share = 1 / calls2.length;
    for (const c of calls2) {
      base.attributions.push(_mkAttr(
        c.tool_name || 'unknown',
        c.bytes,
        share,
        share * inT, share * outT, share * crT, share * ccT,
        cost == null ? null : share * cost,
        !!c.missing_tool_result,
      ));
    }
    return base;
  }

  for (const c of calls2) {
    const share = c.bytes / totalBytes;
    const missingTR = c.bytes === 0;
    base.attributions.push(_mkAttr(
      c.tool_name || 'unknown',
      c.bytes,
      share,
      share * inT, share * outT, share * crT, share * ccT,
      cost == null ? null : share * cost,
      missingTR,
    ));
  }
  return base;
}

function _mkAttr(name, bytes, share, inShare, outShare, crShare, ccShare, costShare, missing) {
  return {
    tool_name:             name,
    bytes_attributed:      bytes,
    share,
    input_tokens_share:    inShare,
    output_tokens_share:   outShare,
    cache_read_share:      crShare,
    cache_creation_share:  ccShare,
    cost_usd_share:        costShare,
    missing_tool_result:   !!missing,
  };
}

// ── Public API: aggregators ──────────────────────────────────────────

function _aggregateBy(keyFn, joinedRows) {
  const rows = Array.isArray(joinedRows) ? joinedRows : [];
  const acc = new Map();
  for (const turn of rows) {
    const attr = attributeTurn(turn);
    for (const a of attr.attributions) {
      const k = keyFn(attr, a);
      if (k == null) continue;
      if (!acc.has(k)) {
        acc.set(k, {
          key: k,
          total_input: 0,
          total_output: 0,
          total_cache_read: 0,
          total_cache_creation: 0,
          total_cost_usd: 0,
          turn_count: 0,
          _turnIds: new Set(),
        });
      }
      const a2 = acc.get(k);
      a2.total_input          += Number(a.input_tokens_share || 0);
      a2.total_output         += Number(a.output_tokens_share || 0);
      a2.total_cache_read     += Number(a.cache_read_share || 0);
      a2.total_cache_creation += Number(a.cache_creation_share || 0);
      a2.total_cost_usd       += Number(a.cost_usd_share || 0);
      a2._turnIds.add(`${attr.session_id} ${attr.turn_id}`);
    }
  }
  const out = [];
  for (const v of acc.values()) {
    v.turn_count = v._turnIds.size;
    delete v._turnIds;
    out.push(v);
  }
  out.sort((a, b) => {
    if (b.total_cost_usd !== a.total_cost_usd) return b.total_cost_usd - a.total_cost_usd;
    if (b.total_output   !== a.total_output)   return b.total_output   - a.total_output;
    if (a.key < b.key) return -1;
    if (a.key > b.key) return 1;
    return 0;
  });
  return out;
}

function aggregateByTool(joinedRows)    { return _aggregateBy((_attr, a) => a.tool_name || 'unknown', joinedRows); }
function aggregateByCommand(joinedRows) { return _aggregateBy((attr) => attr.command || 'unknown', joinedRows); }
function aggregateByDomain(joinedRows)  { return _aggregateBy((attr) => attr.domain || 'unknown', joinedRows); }

module.exports = {
  joinTurnsAndEvents,
  attributeTurn,
  aggregateByTool,
  aggregateByCommand,
  aggregateByDomain,
  _readJsonl,
  _normalizeTurn,
  _resolveEventFiles,
  _parseMs,
};
