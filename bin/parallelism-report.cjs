'use strict';

/**
 * GSD-T Parallelism Report (M44 D9 T1)
 *
 * Pure read-only observer that answers two questions:
 *
 *   "Is the orchestrator actually fanning out, or serializing despite
 *    parallelism being available?"
 *
 *   "When this wave finishes, did it hit the parallelism factor D6 estimated?"
 *
 * Contract: .gsd-t/contracts/parallelism-report-contract.md v1.0.0
 *
 * Hard rules:
 *   1. NEVER writes a file.
 *   2. NEVER calls an LLM or spawns a subprocess.
 *   3. Silent-fail on malformed inputs — skip the bad file, note it, continue.
 *   4. Zero external deps. `.cjs` so it loads in both ESM and CJS projects.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {string} [opts.projectDir='.']
 * @param {string} [opts.wave]
 * @param {Date}   [opts.now]  injection for tests
 * @returns {object} Metrics (see contract §Metrics shape)
 */
function computeParallelismMetrics(opts) {
  opts = opts || {};
  const projectDir = opts.projectDir || '.';
  const wave = opts.wave || null;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const notes = [];

  const spawnPlans = _readSpawnPlans(projectDir, notes);
  const active = spawnPlans.filter((p) => p && p.endedAt === null);
  const lastSpawnAt = _computeLastSpawnAt(spawnPlans);

  const activeSpawnAges_s = active
    .map((p) => {
      const started = _safeDate(p.startedAt);
      if (!started) return null;
      return Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
    })
    .filter((x) => x !== null)
    .sort((a, b) => b - a);

  const readyTasks = _countReadyTasks(projectDir, notes);

  const gate = _computeGateDecisions(projectDir, now, notes);

  const factor = _computeParallelismFactor({ active, spawnPlans, wave, now });

  const colorState = _computeColorState({
    activeWorkers: active.length,
    readyTasks,
    gate,
    factor,
    activeSpawnAges_s,
    lastSpawnAt,
    now,
    noSpawns: spawnPlans.length === 0,
  });

  const out = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    wave,
    activeWorkers: active.length,
    readyTasks,
    parallelism_factor: factor.value,
    parallelism_factor_mode: factor.mode,
    gate_decisions: gate,
    color_state: colorState,
    lastSpawnAt,
    activeSpawnAges_s,
  };
  if (notes.length) out.notes = notes;
  return out;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.projectDir='.']
 * @param {string} [opts.wave]
 * @param {Date}   [opts.now]
 * @returns {string} markdown post-mortem
 */
function buildFullReport(opts) {
  opts = opts || {};
  const projectDir = opts.projectDir || '.';
  const wave = opts.wave || null;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const notes = [];

  const m = computeParallelismMetrics({ projectDir, wave, now });
  const spawnPlans = _readSpawnPlans(projectDir, notes);

  const parts = [];
  parts.push('# Parallelism Report — ' + (wave || 'all'));
  parts.push('');

  // §Summary
  parts.push('## Summary');
  parts.push('');
  parts.push('| Field | Value |');
  parts.push('|-------|-------|');
  parts.push('| wave | ' + (wave || '—') + ' |');
  parts.push('| generatedAt | ' + m.generatedAt + ' |');
  parts.push('| activeWorkers | ' + m.activeWorkers + ' |');
  parts.push('| readyTasks | ' + m.readyTasks + ' |');
  parts.push('| parallelism_factor | ' + m.parallelism_factor.toFixed(2) + ' (' + m.parallelism_factor_mode + ') |');
  parts.push('| color_state | ' + m.color_state + ' |');
  parts.push('| lastSpawnAt | ' + (m.lastSpawnAt || '—') + ' |');
  parts.push('');

  // §Per-spawn timeline
  parts.push('## Per-spawn timeline');
  parts.push('');
  parts.push('| spawnId | kind | startedAt | endedAt | duration_s | tasks | status |');
  parts.push('|---------|------|-----------|---------|------------|-------|--------|');
  const filteredSpawns = spawnPlans
    .filter((p) => p && (!wave || p.wave === wave))
    .sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')));
  if (filteredSpawns.length === 0) {
    parts.push('| _no spawn-plan files_ | — | — | — | — | — | — |');
  } else {
    for (const p of filteredSpawns) {
      const dur = _durationSeconds(p, now);
      const ntasks = Array.isArray(p.tasks) ? p.tasks.length : 0;
      const status = p.endedAt ? 'ended' : 'active';
      parts.push(
        '| ' + (p.spawnId || '—') +
        ' | ' + (p.kind || '—') +
        ' | ' + (p.startedAt || '—') +
        ' | ' + (p.endedAt || '—') +
        ' | ' + (dur == null ? '—' : dur) +
        ' | ' + ntasks +
        ' | ' + status + ' |'
      );
    }
  }
  parts.push('');

  // §Per-gate decisions
  parts.push('## Per-gate decisions');
  parts.push('');
  const dg = m.gate_decisions;
  parts.push('### Depgraph gate (dep_gate_veto)');
  parts.push('- count: ' + dg.dep_gate_veto.count);
  parts.push('- last reasons: ' + (dg.dep_gate_veto.last_reasons.length ? dg.dep_gate_veto.last_reasons.join('; ') : '—'));
  parts.push('');
  parts.push('### Disjointness gate (disjointness_fallback)');
  parts.push('- count: ' + dg.disjointness_fallback.count);
  parts.push('- last reasons: ' + (dg.disjointness_fallback.last_reasons.length ? dg.disjointness_fallback.last_reasons.join('; ') : '—'));
  parts.push('');
  parts.push('### Economics gate (economics_decision)');
  parts.push('- count: ' + dg.economics_decision.count);
  const cd = dg.economics_decision.confidence_distribution;
  parts.push('- confidence distribution: HIGH=' + cd.HIGH + ' MEDIUM=' + cd.MEDIUM + ' LOW=' + cd.LOW + ' FALLBACK=' + cd.FALLBACK);
  parts.push('');

  // §Per-worker Gantt (ASCII)
  parts.push('## Per-worker Gantt (ASCII)');
  parts.push('');
  const gantt = _renderAsciiGantt(filteredSpawns, now);
  parts.push('```');
  parts.push(gantt);
  parts.push('```');
  parts.push('');

  // §Token cost vs. D6 estimate
  parts.push('## Token cost vs. D6 estimate');
  parts.push('');
  const tokenRows = _collectTokenRowsForWave(projectDir, filteredSpawns, notes);
  if (!tokenRows.length) {
    parts.push('_no token-log rows found for this wave_');
  } else {
    parts.push('| spawnId | taskId | in | out | cr | cc | cost_usd |');
    parts.push('|---------|--------|----|----|----|----|---------|');
    for (const r of tokenRows) {
      parts.push(
        '| ' + r.spawnId +
        ' | ' + (r.taskId || '—') +
        ' | ' + (r.in == null ? '—' : r.in) +
        ' | ' + (r.out == null ? '—' : r.out) +
        ' | ' + (r.cr == null ? '—' : r.cr) +
        ' | ' + (r.cc == null ? '—' : r.cc) +
        ' | ' + (r.cost_usd == null ? '—' : r.cost_usd) + ' |'
      );
    }
  }
  parts.push('');

  // §Notes
  parts.push('## Notes');
  parts.push('');
  const allNotes = (m.notes || []).concat(notes);
  if (!allNotes.length) parts.push('_none_');
  else for (const n of allNotes) parts.push('- ' + n);
  parts.push('');

  return parts.join('\n');
}

// ── Internal helpers ────────────────────────────────────────────────────────

function _readSpawnPlans(projectDir, notes) {
  const dir = path.join(projectDir, '.gsd-t', 'spawns');
  let files;
  try {
    if (!fs.existsSync(dir)) return [];
    files = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch (err) {
    notes.push('spawns dir unreadable: ' + (err && err.message || err));
    return [];
  }
  const plans = [];
  for (const f of files) {
    const full = path.join(dir, f);
    let raw;
    try {
      raw = fs.readFileSync(full, 'utf8');
    } catch (err) {
      notes.push('spawn-plan read failed: ' + full);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      notes.push('spawn-plan malformed JSON: ' + f);
      continue;
    }
    if (!parsed || typeof parsed !== 'object') {
      notes.push('spawn-plan not an object: ' + f);
      continue;
    }
    plans.push(parsed);
  }
  return plans;
}

function _computeLastSpawnAt(spawnPlans) {
  let best = null;
  for (const p of spawnPlans) {
    const s = _safeDate(p && p.startedAt);
    if (!s) continue;
    if (!best || s.getTime() > best.getTime()) best = s;
  }
  return best ? best.toISOString() : null;
}

function _safeDate(v) {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

function _durationSeconds(p, now) {
  const start = _safeDate(p.startedAt);
  if (!start) return null;
  const end = p.endedAt ? _safeDate(p.endedAt) : now;
  if (!end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function _countReadyTasks(projectDir, notes) {
  const domainsDir = path.join(projectDir, '.gsd-t', 'domains');
  let domainNames;
  try {
    if (!fs.existsSync(domainsDir)) return 0;
    domainNames = fs.readdirSync(domainsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (err) {
    notes.push('domains dir unreadable: ' + (err && err.message || err));
    return 0;
  }

  let total = 0;
  for (const name of domainNames) {
    const tasksFile = path.join(domainsDir, name, 'tasks.md');
    if (!fs.existsSync(tasksFile)) continue;
    let content;
    try {
      content = fs.readFileSync(tasksFile, 'utf8');
    } catch (err) {
      notes.push('tasks.md read failed: ' + tasksFile);
      continue;
    }
    // Count pending tasks: bullets starting with `- [ ]` (Shape A/C) OR `### Mxx-Dx-Tx` with no `[x]`.
    // For D9's purposes we count `- [ ]` markers — matches the existing task-graph parser.
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      // Shape C: `- [ ] **M44-D9-T1** — ...`
      if (/^\s*-\s*\[\s\]\s+\*\*[A-Z]+\d+-D\d+-T\d+\*\*/.test(line)) total++;
      // Shape A: `- [ ] D1-T1` (legacy) or `- [ ] T-1:`
      else if (/^\s*-\s*\[\s\]\s+(?:\*\*)?[A-Z]?\d?-?[DT]-?\d+/.test(line)) total++;
    }
  }
  return total;
}

function _computeGateDecisions(projectDir, now, notes) {
  const eventsDir = path.join(projectDir, '.gsd-t', 'events');
  const out = {
    dep_gate_veto: { count: 0, last_reasons: [] },
    disjointness_fallback: { count: 0, last_reasons: [] },
    economics_decision: { count: 0, confidence_distribution: { HIGH: 0, MEDIUM: 0, LOW: 0, FALLBACK: 0 } },
  };
  if (!fs.existsSync(eventsDir)) return out;

  // Read last 14 days of events.
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    days.push(iso);
  }

  const rows = [];
  for (const day of days) {
    const f = path.join(eventsDir, day + '.jsonl');
    if (!fs.existsSync(f)) continue;
    let content;
    try {
      content = fs.readFileSync(f, 'utf8');
    } catch (err) {
      notes.push('events file unreadable: ' + f);
      continue;
    }
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); }
      catch (_) { continue; }
      if (!obj || typeof obj !== 'object') continue;
      rows.push(obj);
    }
  }

  // Sort by ts ascending; take last 10 of each type.
  rows.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));

  const depRows = rows.filter((r) => r.type === 'dep_gate_veto').slice(-10);
  const disRows = rows.filter((r) => r.type === 'disjointness_fallback').slice(-10);
  const ecoRows = rows.filter((r) => r.type === 'economics_decision').slice(-10);

  out.dep_gate_veto.count = depRows.length;
  out.dep_gate_veto.last_reasons = depRows.map((r) => r.reason || r.task_id || '—').slice(-5);

  out.disjointness_fallback.count = disRows.length;
  out.disjointness_fallback.last_reasons = disRows.map((r) => r.reason || r.task_id || '—').slice(-5);

  out.economics_decision.count = ecoRows.length;
  for (const r of ecoRows) {
    const c = String(r.confidence || 'FALLBACK').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(out.economics_decision.confidence_distribution, c)) {
      out.economics_decision.confidence_distribution[c]++;
    } else {
      out.economics_decision.confidence_distribution.FALLBACK++;
    }
  }

  return out;
}

function _computeParallelismFactor({ active, spawnPlans, wave, now }) {
  // Live mode: any active spawn.
  if (active.length > 0) {
    const ages = active
      .map((p) => {
        const s = _safeDate(p.startedAt);
        if (!s) return 0;
        return Math.max(1, (now.getTime() - s.getTime()) / 1000);
      });
    const sum = ages.reduce((a, b) => a + b, 0);
    const max = Math.max(...ages);
    if (max <= 0) return { value: 0, mode: 'live' };
    return { value: sum / max, mode: 'live' };
  }

  // Post-wave mode: wave supplied, compute across all ended spawns in that wave.
  if (wave) {
    const inWave = spawnPlans.filter((p) => p && p.wave === wave);
    if (inWave.length === 0) return { value: 0, mode: 'post-wave' };
    const durations = inWave
      .map((p) => _durationSeconds(p, now))
      .filter((x) => x !== null);
    if (durations.length === 0) return { value: 0, mode: 'post-wave' };
    const starts = inWave.map((p) => _safeDate(p.startedAt)).filter(Boolean).map((d) => d.getTime());
    const ends = inWave.map((p) => _safeDate(p.endedAt) || now).map((d) => d.getTime());
    if (starts.length === 0 || ends.length === 0) return { value: 0, mode: 'post-wave' };
    const span_s = (Math.max(...ends) - Math.min(...starts)) / 1000;
    const sumDur = durations.reduce((a, b) => a + b, 0);
    if (span_s <= 0) return { value: 0, mode: 'post-wave' };
    return { value: sumDur / span_s, mode: 'post-wave' };
  }

  return { value: 0, mode: 'idle' };
}

function _computeColorState({ activeWorkers, readyTasks, gate, factor, activeSpawnAges_s, lastSpawnAt, now, noSpawns }) {
  if (noSpawns) return 'dimmed';

  const signals = [];

  // Signal 1: activeWorkers vs readyTasks
  if (readyTasks > 0) {
    const ratio = activeWorkers / readyTasks;
    const lastSpawn = _safeDate(lastSpawnAt);
    const minutesSinceSpawn = lastSpawn
      ? (now.getTime() - lastSpawn.getTime()) / 60000
      : Infinity;
    if (ratio >= 0.8) signals.push('green');
    else if (ratio >= 0.5) signals.push('yellow');
    else if (minutesSinceSpawn > 10) signals.push('red');
    else signals.push('yellow');
  }

  // Signal 2: gate veto rate (dep_gate_veto count vs. total gate events)
  const totalGate = gate.dep_gate_veto.count + gate.disjointness_fallback.count + gate.economics_decision.count;
  if (totalGate > 0) {
    const vetoRate = gate.dep_gate_veto.count / totalGate;
    if (vetoRate < 0.1) signals.push('green');
    else if (vetoRate <= 0.3) signals.push('yellow');
    else signals.push('red');
  }

  // Signal 3: parallelism_factor vs. ideal (use activeWorkers as ideal — D6 estimate not yet wired)
  if (factor.mode === 'live' && activeWorkers > 1) {
    const ideal = activeWorkers;
    const ratio = factor.value / ideal;
    if (ratio >= 0.8) signals.push('green');
    else if (ratio >= 0.5) signals.push('yellow');
    else signals.push('red');
  }

  // Signal 4: spawn age (any active > 45 min = red, 30-45 yellow)
  if (activeSpawnAges_s.length > 0) {
    const maxAge_m = activeSpawnAges_s[0] / 60;
    if (maxAge_m < 30) signals.push('green');
    else if (maxAge_m <= 45) signals.push('yellow');
    else signals.push('red');
  }

  // Signal 5: time since last spawn_started when ready>0
  if (readyTasks > 0) {
    const lastSpawn = _safeDate(lastSpawnAt);
    const minutesSinceSpawn = lastSpawn
      ? (now.getTime() - lastSpawn.getTime()) / 60000
      : Infinity;
    if (minutesSinceSpawn < 5) signals.push('green');
    else if (minutesSinceSpawn <= 10) signals.push('yellow');
    else signals.push('red');
  }

  if (signals.length === 0) return 'green';
  if (signals.includes('red')) return 'red';
  if (signals.includes('yellow')) return 'yellow';
  return 'green';
}

function _renderAsciiGantt(spawns, now) {
  if (spawns.length === 0) return '(no spawns in this wave)';
  const valid = spawns
    .map((p) => {
      const s = _safeDate(p.startedAt);
      if (!s) return null;
      const e = p.endedAt ? _safeDate(p.endedAt) : now;
      if (!e) return null;
      return { id: p.spawnId || '—', start: s.getTime(), end: e.getTime() };
    })
    .filter(Boolean);
  if (!valid.length) return '(no datable spawns)';

  const minStart = Math.min(...valid.map((v) => v.start));
  const maxEnd = Math.max(...valid.map((v) => v.end));
  const span = Math.max(1, maxEnd - minStart);
  const WIDTH = 60;

  const lines = [];
  lines.push('t=0' + ' '.repeat(WIDTH - 3) + 't=' + Math.floor(span / 1000) + 's');
  for (const v of valid) {
    const startCol = Math.floor(((v.start - minStart) / span) * WIDTH);
    const endCol = Math.floor(((v.end - minStart) / span) * WIDTH);
    const bar = ' '.repeat(startCol) + '#'.repeat(Math.max(1, endCol - startCol)) + ' '.repeat(Math.max(0, WIDTH - endCol));
    const id = (v.id || '—').slice(0, 24).padEnd(24);
    lines.push(id + ' |' + bar + '|');
  }
  return lines.join('\n');
}

function _collectTokenRowsForWave(projectDir, spawnPlans, notes) {
  const rows = [];
  for (const p of spawnPlans) {
    if (!p || !Array.isArray(p.tasks)) continue;
    for (const t of p.tasks) {
      if (!t || !t.tokens || typeof t.tokens !== 'object') continue;
      rows.push({
        spawnId: p.spawnId || '—',
        taskId: t.id || null,
        in: t.tokens.in == null ? null : t.tokens.in,
        out: t.tokens.out == null ? null : t.tokens.out,
        cr: t.tokens.cr == null ? null : t.tokens.cr,
        cc: t.tokens.cc == null ? null : t.tokens.cc,
        cost_usd: t.tokens.cost_usd == null ? null : t.tokens.cost_usd,
      });
    }
  }
  return rows;
}

module.exports = {
  computeParallelismMetrics,
  buildFullReport,
  SCHEMA_VERSION,
  // Exposed for unit tests only; not part of the public contract.
  _computeLastSpawnAt,
  _countReadyTasks,
  _computeGateDecisions,
  _computeParallelismFactor,
  _computeColorState,
  _renderAsciiGantt,
};
