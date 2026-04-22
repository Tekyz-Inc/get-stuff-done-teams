'use strict';
/**
 * GSD-T Token-Usage Optimization Report Generator (M44)
 *
 * Emits a markdown report at `.gsd-t/reports/token-usage-{YYYY-MM-DD}.md`,
 * organized per the canonical 5-level hierarchy:
 *
 *   Run → Iter → Context Window (CW) → Turn → Tool
 *
 * CW is the primary optimization unit (peer of Iter, not a partition of it).
 * The goal is to answer: "where am I burning tokens, and which CWs am I
 * getting full value out of vs. wasting?"
 *
 * Data sources (all read-only):
 *   - `.gsd-t/metrics/token-usage.jsonl`   — per-turn token rows (schema v2)
 *   - `.gsd-t/metrics/compactions.jsonl`   — compaction events (live + backfill)
 *   - `.gsd-t/events/YYYY-MM-DD.jsonl`     — tool_call events (for Section B)
 *
 * No cost columns (user is on Max subscription; tokens are the budget proxy).
 * V1 markdown only — no HTML, no JSON dump, no dashboard widget.
 *
 * Zero external deps. `.cjs` for ESM/CJS compat.
 *
 * Exports:
 *   - generateReport({ projectDir, outPath?, date? }) → { path, summary }
 *   - groupIntoCWs({ turnRows, compactionRows, sessionIds? }) → Array<CW>
 *   - rollupCW(cw)                                  → CW rollup
 *   - topNExpensiveTurns(turnRows, n = 20)          → Array<Turn>
 *   - groupCompactionEvents(compactionRows, turnRows) → Array<CompactionRow>
 *   - renderMarkdown({ cws, toolRollup, topTurns, compactions, meta }) → string
 */

const fs = require('fs');
const path = require('path');

const attribution = require('./gsd-t-tool-attribution.cjs');

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

function _parseMs(s) {
  if (!s) return NaN;
  if (/\dT\d/.test(s)) return Date.parse(s);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return Date.parse(s.replace(' ', 'T') + ':00');
  const p = Date.parse(s);
  return Number.isFinite(p) ? p : NaN;
}

function _shortSid(sid) {
  return String(sid || '').slice(0, 8);
}

function _fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Math.round(Number(n));
  return v.toLocaleString('en-US');
}

function _fmtFloat(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(digits);
}

// ── CW grouping ──────────────────────────────────────────────────────
//
// Rule (V1):
//   - Each distinct session_id with ≥1 turn row = 1 CW.
//   - A compaction row `{session_id: Y, prior_session_id: X}` means CW X
//     ended (got compacted) and CW Y began. If X has turn rows, we mark
//     X's endedBy as 'compaction (auto|manual)'. Otherwise ignored.
//   - A CW with no matching compaction on `prior_session_id = CW.sid`
//     ended by 'iter end' (if a later CW exists by sort order) or
//     'run end' (if it's the last CW in the data).
//   - Dedup compactions by (ts, session_id, prior_session_id) to collapse
//     any overlap between live `source=compact` and historical `compact-backfill`.

function groupIntoCWs({ turnRows, compactionRows, sessionIds }) {
  const turns = Array.isArray(turnRows) ? turnRows : [];
  const comps = Array.isArray(compactionRows) ? compactionRows : [];

  // Bucket turns by session_id. Skip rows with no session_id.
  const bySid = new Map();
  for (const r of turns) {
    const sid = r.session_id;
    if (!sid) continue;
    if (!bySid.has(sid)) bySid.set(sid, []);
    bySid.get(sid).push({ ...r, _ms: _parseMs(r.ts || r.startedAt) });
  }

  // Optional filter: narrow to a specified sessionIds set.
  let sids = [...bySid.keys()];
  if (Array.isArray(sessionIds) && sessionIds.length) {
    const allow = new Set(sessionIds);
    sids = sids.filter((s) => allow.has(s));
  }

  // Dedup compactions by (ts|session_id|prior_session_id). Live wins over
  // backfill if both present for the same tuple.
  const compMap = new Map();
  for (const c of comps) {
    const key = `${c.ts || ''}|${c.session_id || ''}|${c.prior_session_id || ''}`;
    const prev = compMap.get(key);
    if (!prev) { compMap.set(key, c); continue; }
    // Prefer live (source=compact) over backfill.
    if (prev.source === 'compact-backfill' && c.source === 'compact') compMap.set(key, c);
  }
  const compsDedup = [...compMap.values()];

  // Index compactions by prior_session_id — that's "the CW this compaction ended."
  const compByPrior = new Map();
  for (const c of compsDedup) {
    const pid = c.prior_session_id;
    if (!pid) continue;
    if (!compByPrior.has(pid)) compByPrior.set(pid, []);
    compByPrior.get(pid).push(c);
  }

  // Sort each session's turns chronologically, then order CWs by their
  // earliest-turn timestamp.
  const cws = [];
  for (const sid of sids) {
    const trns = bySid.get(sid) || [];
    if (!trns.length) continue;
    trns.sort((a, b) => (a._ms || 0) - (b._ms || 0));
    const start = trns[0]._ms;
    const end   = trns[trns.length - 1]._ms;
    cws.push({ sid, turns: trns, start, end });
  }
  cws.sort((a, b) => (a.start || 0) - (b.start || 0));

  // Assign endedBy per CW.
  for (let i = 0; i < cws.length; i++) {
    const cw = cws[i];
    const matches = compByPrior.get(cw.sid) || [];
    if (matches.length) {
      // Pick the earliest compaction following this CW's last turn.
      const afterLast = matches
        .map((c) => ({ ...c, _ms: _parseMs(c.ts) }))
        .filter((c) => !Number.isFinite(cw.end) || !Number.isFinite(c._ms) || c._ms >= cw.end)
        .sort((a, b) => (a._ms || 0) - (b._ms || 0));
      const chosen = afterLast[0] || matches[0];
      const trig = chosen.trigger || 'auto';
      cw.endedBy = trig === 'manual' ? 'compaction (manual)' : 'compaction (auto)';
      cw.endedByCompaction = chosen;
      cw.missingTrigger = !chosen.trigger;
    } else if (i < cws.length - 1) {
      cw.endedBy = 'iter end';
    } else {
      cw.endedBy = 'run end';
    }
  }

  return cws;
}

// ── Per-CW rollup ────────────────────────────────────────────────────

function rollupCW(cw) {
  if (!cw) return null;
  const trns = Array.isArray(cw.turns) ? cw.turns : [];
  let input = 0, output = 0, cr = 0, cc = 0, peakCtxPct = null;
  for (const t of trns) {
    input  += Number(t.inputTokens || 0);
    output += Number(t.outputTokens || 0);
    cr     += Number(t.cacheReadInputTokens || 0);
    cc     += Number(t.cacheCreationInputTokens || 0);
    const px = (typeof t.ctxPct === 'number' && Number.isFinite(t.ctxPct)) ? t.ctxPct : null;
    if (px != null) {
      if (peakCtxPct == null || px > peakCtxPct) peakCtxPct = px;
    }
  }
  const avgOutPerTurn = trns.length ? (output / trns.length) : 0;
  return {
    cwId:     null, // caller assigns monotonic CW# in report-time numbering
    sid:      cw.sid,
    iter:     cw.sid, // in V1 each session_id is its own iter
    start:    cw.start,
    end:      cw.end,
    turns:    trns.length,
    input, output, cacheRead: cr, cacheCreation: cc,
    avgOutPerTurn,
    peakCtxPct,
    endedBy:  cw.endedBy || 'run end',
    endedByCompaction: cw.endedByCompaction || null,
    missingTrigger:    !!cw.missingTrigger,
  };
}

// ── Top-N expensive turns ─────────────────────────────────────────────

function topNExpensiveTurns(turnRows, n = 20) {
  const rows = Array.isArray(turnRows) ? turnRows : [];
  const ranked = rows.map((t) => {
    const i = Number(t.inputTokens || 0);
    const o = Number(t.outputTokens || 0);
    return {
      ts:       t.ts || t.startedAt || null,
      command:  t.command || '—',
      step:     t.step || '—',
      domain:   t.domain || '—',
      task:     t.task || '—',
      input:    i,
      output:   o,
      cacheRead:     Number(t.cacheReadInputTokens || 0),
      cacheCreation: Number(t.cacheCreationInputTokens || 0),
      total:    i + o,
      ctxPct:   (typeof t.ctxPct === 'number' && Number.isFinite(t.ctxPct)) ? t.ctxPct : null,
    };
  });
  ranked.sort((a, b) => b.total - a.total);
  return ranked.slice(0, Math.max(0, n | 0));
}

// ── Compaction event enrichment ──────────────────────────────────────

function groupCompactionEvents(compactionRows, turnRows) {
  const comps = Array.isArray(compactionRows) ? compactionRows : [];
  const turns = Array.isArray(turnRows) ? turnRows : [];

  // Precompute turns sorted by ts (ascending) — used for "what was active"
  // lookup (the last turn's command/domain/task before the compaction ts).
  const sortedTurns = turns
    .map((t) => ({ ...t, _ms: _parseMs(t.ts || t.startedAt) }))
    .filter((t) => Number.isFinite(t._ms))
    .sort((a, b) => a._ms - b._ms);

  // Dedup (same key as groupIntoCWs) — report Section D shows each event once.
  const compMap = new Map();
  for (const c of comps) {
    const key = `${c.ts || ''}|${c.session_id || ''}|${c.prior_session_id || ''}`;
    const prev = compMap.get(key);
    if (!prev) { compMap.set(key, c); continue; }
    if (prev.source === 'compact-backfill' && c.source === 'compact') compMap.set(key, c);
  }
  const dedup = [...compMap.values()];

  const out = dedup.map((c) => {
    const cms = _parseMs(c.ts);
    // Find the last turn with _ms <= cms. Because sortedTurns is ordered,
    // a small linear scan is fine (V1 dataset is tiny).
    let active = null;
    if (Number.isFinite(cms)) {
      for (let i = sortedTurns.length - 1; i >= 0; i--) {
        if (sortedTurns[i]._ms <= cms) { active = sortedTurns[i]; break; }
      }
    }
    return {
      ts:            c.ts || null,
      source:        c.source || null,
      iter:          _shortSid(c.prior_session_id || c.session_id),
      priorSid:      c.prior_session_id || null,
      sid:           c.session_id || null,
      trigger:       c.trigger || null,
      preTokens:     (typeof c.preTokens === 'number') ? c.preTokens : null,
      postTokens:    (typeof c.postTokens === 'number') ? c.postTokens : null,
      durationMs:    (typeof c.durationMs === 'number') ? c.durationMs : null,
      activeCommand: active ? (active.command || '—') : '—',
      activeDomain:  active ? (active.domain || '—') : '—',
      activeTask:    active ? (active.task || '—') : '—',
    };
  });
  out.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
  return out;
}

// ── Markdown rendering ────────────────────────────────────────────────

function _section(title) { return `\n## ${title}\n\n`; }

function _fmtDate(ms) {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function renderMarkdown({ cws, toolRollup, topTurns, compactions, meta }) {
  const m = meta || {};
  const lines = [];

  // ── Header ────────────────────────────────────────────────────────
  lines.push(`# Token Usage Optimization Report — ${m.date || 'unknown'}`);
  lines.push('');
  lines.push('Run → Iter → **CW** → Turn → Tool (CW is the primary optimization unit)');
  lines.push('');
  lines.push(`Generated: ${m.generatedAt || new Date().toISOString()}`);
  lines.push(`Source: ${m.turnCount || 0} turn rows, ${m.compactionCount || 0} compaction events, ${m.toolEventCount || 0} tool-call events`);
  lines.push(`Sessions covered: ${m.sessionCount || 0}`);
  lines.push('');

  // ── Section A — Per-CW Rollup ─────────────────────────────────────
  lines.push('## A — Per-CW Rollup (PRIMARY)');
  lines.push('');
  if (!cws || !cws.length) {
    lines.push('_No context windows found — `.gsd-t/metrics/token-usage.jsonl` has no rows with a `session_id`._');
  } else {
    lines.push('| CW# | Iter | Start | Turns | In | Out | CacheR | CacheC | Avg Out/turn | Peak Ctx% | Ended-by |');
    lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|');
    let hasMissingTrig = false;
    let totalIn = 0, totalOut = 0, totalCr = 0, totalCc = 0, totalTurns = 0;
    let autoCount = 0;
    cws.forEach((raw, i) => {
      const r = rollupCW(raw);
      if (!r) return;
      const num = i + 1;
      const ended = r.endedBy + (r.missingTrigger && r.endedBy.startsWith('compaction') ? ' †' : '');
      if (r.missingTrigger && r.endedBy.startsWith('compaction')) hasMissingTrig = true;
      if (r.endedBy === 'compaction (auto)') autoCount += 1;
      lines.push(`| CW-${num} | ${_shortSid(r.iter)} | ${_fmtDate(r.start)} | ${r.turns} | ${_fmtNum(r.input)} | ${_fmtNum(r.output)} | ${_fmtNum(r.cacheRead)} | ${_fmtNum(r.cacheCreation)} | ${_fmtFloat(r.avgOutPerTurn, 0)} | ${r.peakCtxPct == null ? '—' : _fmtFloat(r.peakCtxPct, 1)} | ${ended} |`);
      totalIn += r.input; totalOut += r.output; totalCr += r.cacheRead; totalCc += r.cacheCreation; totalTurns += r.turns;
    });
    lines.push('');
    lines.push(`**Total across ${cws.length} CW${cws.length === 1 ? '' : 's'}**: in=${_fmtNum(totalIn)} out=${_fmtNum(totalOut)} cacheR=${_fmtNum(totalCr)} cacheC=${_fmtNum(totalCc)} turns=${totalTurns}`);
    lines.push(`**Average turns per CW**: ${_fmtFloat(totalTurns / cws.length, 1)}`);
    lines.push(`**Compaction rate**: ${autoCount}/${cws.length} CW${cws.length === 1 ? '' : 's'} ended by auto-compaction`);
    if (hasMissingTrig) {
      lines.push('');
      lines.push('† Compaction had no `trigger` field in the source row — mapped to `compaction (auto)` as the safe default.');
    }
  }
  lines.push('');

  // ── Section B — Tool-Tokens Rollup ────────────────────────────────
  lines.push('## B — Tool-Tokens Rollup');
  lines.push('');
  if (!toolRollup || toolRollup.unavailable) {
    lines.push(`_Tool attribution unavailable: ${toolRollup && toolRollup.reason ? toolRollup.reason : 'no joined rows'}._`);
  } else {
    // B.1 — By tool
    lines.push('### B.1 — By tool');
    lines.push('');
    lines.push('| Tool | Calls | In | Out | CacheR | CacheC | Avg tokens/call |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const row of toolRollup.byTool) {
      const total = row.total_input + row.total_output + row.total_cache_read + row.total_cache_creation;
      const avg = row.turn_count ? total / row.turn_count : 0;
      lines.push(`| ${row.key} | ${row.turn_count} | ${_fmtNum(row.total_input)} | ${_fmtNum(row.total_output)} | ${_fmtNum(row.total_cache_read)} | ${_fmtNum(row.total_cache_creation)} | ${_fmtNum(avg)} |`);
    }
    lines.push('');

    // B.2 — Tool × Command cross-tab
    lines.push('### B.2 — Tool × Command (top 10 tools × top 5 commands, total tokens)');
    lines.push('');
    const grid = toolRollup.toolByCommand || {};
    const topTools = (toolRollup.topTools || []).slice(0, 10);
    const topCmds = (toolRollup.topCommands || []).slice(0, 5);
    if (!topTools.length || !topCmds.length) {
      lines.push('_Not enough data for a cross-tab (need ≥1 tool and ≥1 command)._');
    } else {
      lines.push(`| Tool ╲ Command | ${topCmds.join(' | ')} |`);
      lines.push(`|---|${topCmds.map(() => '---:').join('|')}|`);
      for (const tool of topTools) {
        const cells = topCmds.map((cmd) => {
          const v = grid[tool] && grid[tool][cmd];
          return v ? _fmtNum(v) : '—';
        });
        lines.push(`| ${tool} | ${cells.join(' | ')} |`);
      }
    }
  }
  lines.push('');

  // ── Section C — Top 20 Expensive Turns ────────────────────────────
  lines.push('## C — Top 20 Expensive Turns');
  lines.push('');
  lines.push('Ranked by `input + output` tokens descending. _Input-heavy_ rows signal context bloat; _output-heavy_ rows signal generation cost. Both columns visible so the reader can re-sort mentally.');
  lines.push('');
  if (!topTurns || !topTurns.length) {
    lines.push('_No turn rows to rank._');
  } else {
    lines.push('| # | ts | Command | Step | Domain | Task | In | Out | CacheR | CacheC | Total | Ctx% |');
    lines.push('|---:|---|---|---|---|---|---:|---:|---:|---:|---:|---:|');
    topTurns.forEach((t, i) => {
      lines.push(`| ${i+1} | ${t.ts || '—'} | ${t.command} | ${t.step} | ${t.domain} | ${t.task} | ${_fmtNum(t.input)} | ${_fmtNum(t.output)} | ${_fmtNum(t.cacheRead)} | ${_fmtNum(t.cacheCreation)} | ${_fmtNum(t.total)} | ${t.ctxPct == null ? '—' : _fmtFloat(t.ctxPct, 1)} |`);
    });
  }
  lines.push('');

  // ── Section D — Compaction Events ─────────────────────────────────
  lines.push('## D — Compaction Events');
  lines.push('');
  if (!compactions || !compactions.length) {
    lines.push('_No compaction events recorded (hook not yet capturing, or no compactions during window)._');
  } else {
    lines.push('| ts | Source | Iter (prior) | Trigger | Pre-tokens | Post-tokens | Duration (ms) | Active Command | Active Domain/Task |');
    lines.push('|---|---|---|---|---:|---:|---:|---|---|');
    let autoC = 0, manC = 0, bfC = 0;
    for (const c of compactions) {
      if (c.source === 'compact-backfill') bfC += 1;
      if (c.trigger === 'manual') manC += 1; else autoC += 1;
      const dt = `${c.activeDomain}/${c.activeTask}`;
      lines.push(`| ${c.ts || '—'} | ${c.source || '—'} | ${c.iter || '—'} | ${c.trigger || '—'} | ${_fmtNum(c.preTokens)} | ${_fmtNum(c.postTokens)} | ${_fmtNum(c.durationMs)} | ${c.activeCommand} | ${dt} |`);
    }
    lines.push('');
    lines.push(`**Summary**: ${autoC} auto, ${manC} manual, ${bfC} backfilled.`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── Tool rollup preparation ───────────────────────────────────────────

function _prepareToolRollup({ projectDir }) {
  const turnsPath  = path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  const eventsDir  = path.join(projectDir, '.gsd-t', 'events');
  if (!fs.existsSync(turnsPath)) {
    return { unavailable: true, reason: 'token-usage.jsonl not found' };
  }
  let joined;
  try {
    joined = attribution.joinTurnsAndEvents({ turnsPath, eventsGlob: eventsDir });
  } catch (e) {
    return { unavailable: true, reason: e.message || String(e) };
  }
  if (!joined || !joined.length) {
    return { unavailable: true, reason: 'no joined turn/event rows' };
  }

  const byTool = attribution.aggregateByTool(joined);
  if (!byTool.length) return { unavailable: true, reason: 'aggregateByTool returned 0 rows' };

  // Build tool × command cross-tab.
  const toolByCommand = {};
  const toolTotals = new Map();
  const cmdTotals = new Map();
  for (const turn of joined) {
    const attr = attribution.attributeTurn(turn);
    const cmd = (turn.command || 'unknown');
    for (const a of attr.attributions) {
      const tool = a.tool_name || 'unknown';
      const total = Number(a.input_tokens_share || 0)
                  + Number(a.output_tokens_share || 0)
                  + Number(a.cache_read_share || 0)
                  + Number(a.cache_creation_share || 0);
      if (!toolByCommand[tool]) toolByCommand[tool] = {};
      toolByCommand[tool][cmd] = (toolByCommand[tool][cmd] || 0) + total;
      toolTotals.set(tool, (toolTotals.get(tool) || 0) + total);
      cmdTotals.set(cmd, (cmdTotals.get(cmd) || 0) + total);
    }
  }
  const topTools = [...toolTotals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const topCommands = [...cmdTotals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  return {
    unavailable: false,
    byTool,
    toolByCommand,
    topTools,
    topCommands,
    joinedCount: joined.length,
  };
}

// ── Main entry ────────────────────────────────────────────────────────

function generateReport({ projectDir, outPath, date }) {
  if (!projectDir) projectDir = process.cwd();
  const today = date || new Date().toISOString().slice(0, 10);

  const turnsPath = path.join(projectDir, '.gsd-t', 'metrics', 'token-usage.jsonl');
  const compPath  = path.join(projectDir, '.gsd-t', 'metrics', 'compactions.jsonl');
  const eventsDir = path.join(projectDir, '.gsd-t', 'events');

  const turnRows = _readJsonl(turnsPath);
  const compRows = _readJsonl(compPath);

  // Count tool-call events across all per-day files (approximation — informational).
  let toolEventCount = 0;
  if (fs.existsSync(eventsDir) && fs.statSync(eventsDir).isDirectory()) {
    for (const f of fs.readdirSync(eventsDir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) continue;
      try {
        const txt = fs.readFileSync(path.join(eventsDir, f), 'utf8');
        for (const line of txt.split('\n')) {
          const j = _safeParse(line);
          if (j && j.event_type === 'tool_call') toolEventCount += 1;
        }
      } catch (_) { /* best effort */ }
    }
  }

  const cws = groupIntoCWs({ turnRows, compactionRows: compRows });
  const topTurns = topNExpensiveTurns(turnRows, 20);
  const compactions = groupCompactionEvents(compRows, turnRows);
  const toolRollup = _prepareToolRollup({ projectDir });

  const sessionIds = new Set();
  for (const r of turnRows) if (r.session_id) sessionIds.add(r.session_id);

  const md = renderMarkdown({
    cws, toolRollup, topTurns, compactions,
    meta: {
      date: today,
      generatedAt: new Date().toISOString(),
      turnCount: turnRows.length,
      compactionCount: compRows.length,
      toolEventCount,
      sessionCount: sessionIds.size,
    },
  });

  const reportsDir = path.join(projectDir, '.gsd-t', 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const finalPath = outPath || path.join(reportsDir, `token-usage-${today}.md`);
  fs.writeFileSync(finalPath, md, 'utf8');

  return {
    path: finalPath,
    summary: {
      date: today,
      turns: turnRows.length,
      compactions: compRows.length,
      toolEvents: toolEventCount,
      sessions: sessionIds.size,
      cws: cws.length,
      compactionEndedCWs: cws.filter((c) => (c.endedBy || '').startsWith('compaction')).length,
      topTool: (toolRollup && !toolRollup.unavailable && toolRollup.byTool[0]) ? toolRollup.byTool[0].key : null,
    },
  };
}

module.exports = {
  generateReport,
  groupIntoCWs,
  rollupCW,
  topNExpensiveTurns,
  groupCompactionEvents,
  renderMarkdown,
  // exposed for tests
  _readJsonl,
  _parseMs,
};
