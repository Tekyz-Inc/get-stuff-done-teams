'use strict';

/**
 * GSD-T Live Activity Report (M54 D1 T1)
 *
 * Pure read-only observer that answers:
 *
 *   "What subprocesses, tool calls, and watches is the orchestrator
 *    currently running RIGHT NOW?"
 *
 * Contract: .gsd-t/contracts/live-activity-contract.md v1.0.0
 *
 * Hard rules:
 *   1. NEVER writes a file.
 *   2. NEVER calls an LLM or spawns a subprocess.
 *   3. Silent-fail on malformed inputs — skip the bad line, note it, continue.
 *   4. Zero external deps. `.cjs` so it loads in both ESM and CJS projects.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;

// Tool-use threshold for `tool` kind detection (30 seconds)
const TOOL_THRESHOLD_MS = 30_000;

// Source-file mtime threshold — files older than this are considered stale (60 seconds)
const MTIME_STALE_MS = 60_000;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute live activities for the given project directory.
 *
 * @param {object} [opts]
 * @param {string} [opts.projectDir='.']
 * @param {Date}   [opts.now]  injection for tests
 * @returns {{ schemaVersion: number, generatedAt: string, activities: object[], notes: string[] }}
 */
function computeLiveActivities(opts) {
  opts = opts || {};
  const projectDir = opts.projectDir || '.';
  const now = opts.now instanceof Date ? opts.now : new Date();
  const notes = [];

  // Source 1: events JSONL (today only)
  const today = now.toISOString().slice(0, 10);
  const eventsFile = path.join(projectDir, '.gsd-t', 'events', today + '.jsonl');
  const eventsActivities = _readEventsActivities(eventsFile, now, notes);
  const eventsMtime = _safeFileMtime(eventsFile);

  // Source 2: orchestrator JSONL (~/.claude/projects/<slug>/<sid>.jsonl)
  const orchestratorActivities = _readOrchestratorActivities(projectDir, now, notes);

  // UNION + dedup
  const allActivities = _dedup([...eventsActivities, ...orchestratorActivities]);

  // Source 3: spawn plan files (.gsd-t/spawns/*.json)
  const spawnActivities = _readSpawnActivities(projectDir, now, notes);
  const allWithSpawns = _dedup([...allActivities, ...spawnActivities]);

  // Apply liveness falsifiers
  const live = allWithSpawns.filter((a) => _isLive(a, eventsFile, eventsMtime, now, notes));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    activities: live,
    notes,
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Read activities from .gsd-t/events/<today>.jsonl.
 * Detects bash (run_in_background) and monitor (Monitor tool_use without stop).
 * Also detects tool kind (any tool_use > 30s without tool_result).
 */
function _readEventsActivities(eventsFile, now, notes) {
  const activities = [];
  let content;
  try {
    if (!fs.existsSync(eventsFile)) {
      notes.push('no events file for today');
      return activities;
    }
    content = fs.readFileSync(eventsFile, 'utf8');
  } catch (err) {
    notes.push('could not read events file: ' + (err && err.message || String(err)));
    return activities;
  }

  const lines = content.split(/\r?\n/);
  const toolUseById = new Map(); // tool_use_id -> event object
  const terminatedIds = new Set(); // tool_use_ids with tool_result or monitor_stopped
  const monitorStoppedIds = new Set();

  // First pass: collect all events
  const allEvents = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (_) {
      notes.push('skipped malformed JSONL line at ' + eventsFile + ':' + (i + 1));
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;
    allEvents.push({ obj, lineno: i + 1 });
  }

  // Second pass: build lookup maps
  for (const { obj } of allEvents) {
    const type = obj.type || obj.event_type;

    // tool_result terminates a tool_use
    if (type === 'tool_result' && obj.tool_use_id) {
      terminatedIds.add(obj.tool_use_id);
    }
    // monitor_stopped terminates a monitor
    if (type === 'monitor_stopped' && obj.tool_use_id) {
      terminatedIds.add(obj.tool_use_id);
      monitorStoppedIds.add(obj.tool_use_id);
    }
    // spawn_completed terminates a spawn
    if (type === 'spawn_completed' && obj.tool_use_id) {
      terminatedIds.add(obj.tool_use_id);
    }
  }

  // Third pass: detect activities
  for (const { obj } of allEvents) {
    const type = obj.type || obj.event_type;

    // bash: run_in_background sentinel
    if (obj.run_in_background === true) {
      const id = obj.tool_use_id || _makeId('bash', obj.command || obj.label || '', obj.startedAt || obj.ts || now.toISOString());
      if (!terminatedIds.has(id)) {
        activities.push(_makeActivity({
          id,
          kind: 'bash',
          label: obj.command || obj.label || 'bash',
          startedAt: obj.startedAt || obj.ts || now.toISOString(),
          now,
          pid: obj.pid,
          toolUseId: obj.tool_use_id,
        }));
      }
      continue;
    }

    // Monitor and tool: tool_use events
    const toolName = obj.name || (obj.type === 'tool_use' && obj.name) || (obj.event_type === 'tool_use_started' && obj.name);
    if (type === 'tool_use' || type === 'tool_use_started') {
      const toolUseId = obj.tool_use_id || obj.id;
      if (!toolUseId) continue;
      if (terminatedIds.has(toolUseId)) continue;

      const name = obj.name || toolName || '';
      const startedAt = obj.startedAt || obj.start_time || obj.ts || now.toISOString();
      const startMs = _safeDate(startedAt);
      const ageMs = startMs ? now.getTime() - startMs.getTime() : 0;

      if (name === 'Monitor') {
        // Monitor kind
        activities.push(_makeActivity({
          id: toolUseId,
          kind: 'monitor',
          label: (obj.input && (obj.input.command || obj.input.path)) || name,
          startedAt,
          now,
          pid: obj.pid,
          toolUseId,
        }));
      } else if (ageMs > TOOL_THRESHOLD_MS) {
        // Tool kind: any tool_use > 30s without result
        activities.push(_makeActivity({
          id: toolUseId,
          kind: 'tool',
          label: name || 'tool',
          startedAt,
          now,
          pid: obj.pid,
          toolUseId,
        }));
      }
    }
  }

  return activities;
}

/**
 * Read activities from the orchestrator JSONL (~/.claude/projects/<slug>/<sid>.jsonl).
 * Uses slug discovery via _slugFromTranscriptPath / _slugToProjectDir from
 * scripts/hooks/gsd-t-conversation-capture.js.
 */
function _readOrchestratorActivities(projectDir, now, notes) {
  const activities = [];

  // Lazy-load the slug helpers from conversation-capture.js
  let slugHelpers;
  try {
    slugHelpers = require(path.join(__dirname, '..', 'scripts', 'hooks', 'gsd-t-conversation-capture.js'));
  } catch (err) {
    notes.push('could not load slug helpers: ' + (err && err.message || String(err)));
    return activities;
  }

  const { _slugFromTranscriptPath, _slugToProjectDir } = slugHelpers._internal || slugHelpers;

  // Derive slug from project dir: reverse the _slugToProjectDir logic
  // by looking for a slug in ~/.claude/projects/ that decodes to projectDir
  const home = process.env.HOME || os.homedir();
  if (!home) {
    notes.push('could not determine HOME directory for slug discovery');
    return activities;
  }

  const projectsDir = path.join(home, '.claude', 'projects');
  let slugDir;
  try {
    if (!fs.existsSync(projectsDir)) {
      notes.push('no ~/.claude/projects/ directory found');
      return activities;
    }
    // Enumerate slugs and find one that maps to projectDir
    const slugs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    const resolvedProject = path.resolve(projectDir);
    for (const slug of slugs) {
      const decoded = _slugToProjectDir(slug);
      if (decoded && path.resolve(decoded) === resolvedProject) {
        slugDir = path.join(projectsDir, slug);
        break;
      }
    }
  } catch (err) {
    notes.push('slug discovery error: ' + (err && err.message || String(err)));
    return activities;
  }

  if (!slugDir) {
    notes.push('orchestrator slug unresolvable for cwd=' + projectDir);
    return activities;
  }

  // Find most recent JSONL file in the slug directory
  let jsonlFile;
  try {
    const files = fs.readdirSync(slugDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const full = path.join(slugDir, f);
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch (_) { /* noop */ }
        return { f, full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0) jsonlFile = files[0].full;
  } catch (err) {
    notes.push('could not list slug dir ' + slugDir + ': ' + (err && err.message || String(err)));
    return activities;
  }

  if (!jsonlFile) {
    notes.push('no JSONL files in slug dir ' + slugDir);
    return activities;
  }

  // Parse orchestrator JSONL
  let content;
  try {
    content = fs.readFileSync(jsonlFile, 'utf8');
  } catch (err) {
    notes.push('could not read orchestrator JSONL ' + jsonlFile + ': ' + (err && err.message || String(err)));
    return activities;
  }

  const lines = content.split(/\r?\n/);
  const terminatedIds = new Set();
  const allEvents = [];

  // First pass: collect
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (_) {
      // Orchestrator JSONL lines can be complex; skip silently
      continue;
    }
    if (!obj || typeof obj !== 'object') continue;
    allEvents.push(obj);
  }

  // The orchestrator JSONL stores conversation turns. Each line is an object with
  // a `message` field containing a Claude API message (role: "assistant" | "user").
  // Tool uses are in assistant messages: message.content[].type === "tool_use".
  // Tool results are in user messages: message.content[].type === "tool_result".

  // First pass: collect all termination signals from tool_result blocks
  for (const obj of allEvents) {
    // Direct termination events (from GSD-T event hooks)
    if (obj.type === 'monitor_stopped' && obj.tool_use_id) {
      terminatedIds.add(obj.tool_use_id);
    }
    if (obj.type === 'spawn_completed' && obj.tool_use_id) {
      terminatedIds.add(obj.tool_use_id);
    }

    // Claude API user turns: message.content[].type === "tool_result"
    const msg = obj.message;
    if (msg && msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && block.type === 'tool_result' && block.tool_use_id) {
          terminatedIds.add(block.tool_use_id);
        }
      }
    }
  }

  // Second pass: collect tool_use blocks from assistant messages
  const toolUseBlocks = []; // { block, timestamp }
  for (const obj of allEvents) {
    const msg = obj.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    // Timestamp: prefer the message-level timestamp if available
    const timestamp = obj.timestamp || (msg && msg.created_at) || null;
    for (const block of msg.content) {
      if (block && block.type === 'tool_use' && block.id) {
        toolUseBlocks.push({ block, timestamp });
      }
    }
  }

  // Third pass: emit activities for non-terminated tool uses
  for (const { block, timestamp } of toolUseBlocks) {
    const toolUseId = block.id;
    if (terminatedIds.has(toolUseId)) continue;

    const name = block.name || '';
    const startedAt = timestamp || now.toISOString();
    const startMs = _safeDate(startedAt);
    const ageMs = startMs ? now.getTime() - startMs.getTime() : 0;

    if (name === 'Bash') {
      const isBg = block.input && block.input.run_in_background === true;
      if (isBg) {
        const cmd = (block.input && block.input.command) || name;
        activities.push(_makeActivity({
          id: toolUseId,
          kind: 'bash',
          label: cmd,
          startedAt,
          now,
          toolUseId,
        }));
      }
    } else if (name === 'Monitor') {
      activities.push(_makeActivity({
        id: toolUseId,
        kind: 'monitor',
        label: (block.input && (block.input.command || block.input.path)) || name,
        startedAt,
        now,
        toolUseId,
      }));
    } else if (ageMs > TOOL_THRESHOLD_MS) {
      activities.push(_makeActivity({
        id: toolUseId,
        kind: 'tool',
        label: name || 'tool',
        startedAt,
        now,
        toolUseId,
      }));
    }
  }

  return activities;
}

/**
 * Read spawn kind activities from .gsd-t/spawns/*.json plan files.
 * Delegates to the same plan-file reader shape as parallelism-report.cjs.
 */
function _readSpawnActivities(projectDir, now, notes) {
  const activities = [];
  const spawnPlans = _readSpawnPlans(projectDir, notes);

  for (const plan of spawnPlans) {
    // Only include active (not ended) plans
    if (plan.endedAt !== null && plan.endedAt !== undefined) continue;

    const startedAt = plan.startedAt || now.toISOString();
    const label = (plan.spawnId || plan.kind || 'spawn') + (plan.command ? ' ' + String(plan.command).slice(0, 30) : '');
    const id = plan.spawnId || _makeId('spawn', label, startedAt);

    activities.push(_makeActivity({
      id,
      kind: 'spawn',
      label,
      startedAt,
      now,
      pid: plan.pid || plan.workerPid,
      toolUseId: plan.tool_use_id,
    }));
  }

  return activities;
}

/**
 * Read .gsd-t/spawns/*.json plan files. Mirrors parallelism-report.cjs's _readSpawnPlans.
 */
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
      notes.push('could not read spawn plan ' + full + ': ' + (err && err.message || err));
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
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

/**
 * Deduplicate activities by tool_use_id (priority 1) then (kind, label, startedAt) tuple (priority 2).
 */
function _dedup(activities) {
  const byToolUseId = new Map();
  const byTuple = new Map();
  const result = [];

  for (const a of activities) {
    // Priority 1: deduplicate by tool_use_id
    if (a.toolUseId) {
      if (byToolUseId.has(a.toolUseId)) {
        // Merge: prefer orchestrator pid when present
        const existing = byToolUseId.get(a.toolUseId);
        if (a.pid && !existing.pid) existing.pid = a.pid;
        continue;
      }
      byToolUseId.set(a.toolUseId, a);
      result.push(a);
      continue;
    }

    // Priority 2: deduplicate by (kind, label, startedAt) tuple
    const tupleKey = a.kind + '|' + a.label + '|' + a.startedAt;
    if (byTuple.has(tupleKey)) {
      const existing = byTuple.get(tupleKey);
      if (a.pid && !existing.pid) existing.pid = a.pid;
      continue;
    }
    byTuple.set(tupleKey, a);
    result.push(a);
  }

  return result;
}

/**
 * Apply all 3 liveness falsifiers to an activity.
 * Returns true if the activity should remain in activities[].
 * Returns false if any falsifier fires.
 */
function _isLive(activity, eventsFile, eventsMtime, now, notes) {
  // F1: explicit terminating event (already handled during parsing — entries with
  // matching tool_result/monitor_stopped/spawn_completed were never added)
  // This is a double-check for spawn kind which reads from a different source.
  if (activity.kind === 'spawn') {
    // For spawn kind, F1 is already handled in _readSpawnActivities (endedAt check).
    // No additional F1 check needed here for spawns.
  }

  // F2: PID check — process.kill(pid, 0) throws ESRCH
  if (activity.pid) {
    try {
      process.kill(activity.pid, 0);
      // Process is alive (no error thrown)
    } catch (err) {
      if (err && err.code === 'ESRCH') {
        // Process not found — remove entry
        return false;
      }
      // EPERM or other: conservative, treat as dead
      notes.push('PID check error for pid ' + activity.pid + ': ' + (err && err.code || String(err)));
      return false;
    }
  }

  // F3: Source-file mtime > 60s old
  if (activity.kind === 'spawn') {
    // Spawn activities use spawn plan file mtime, not events file
    // Spawn plan mtime > 60s → stale
    const spawnMtime = activity._spawnPlanMtime;
    if (spawnMtime) {
      const ageMs = now.getTime() - spawnMtime;
      if (ageMs > MTIME_STALE_MS) return false;
    }
  } else {
    // Events-sourced activities: check events file mtime
    if (eventsMtime) {
      const ageMs = now.getTime() - eventsMtime;
      if (ageMs > MTIME_STALE_MS) return false;
    }
  }

  return true;
}

/**
 * Safely stat a file and return its mtime in milliseconds, or null on error.
 */
function _safeFileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (_) {
    return null;
  }
}

/**
 * Construct an Activity object.
 */
function _makeActivity({ id, kind, label, startedAt, now, pid, toolUseId, _spawnPlanMtime }) {
  const startMs = _safeDate(startedAt);
  const durationMs = startMs ? Math.max(0, now.getTime() - startMs.getTime()) : 0;
  const activity = {
    id: String(id),
    kind,
    label: String(label),
    startedAt: startMs ? startMs.toISOString() : new Date(now).toISOString(),
    durationMs,
    tailUrl: '/api/live-activity/' + encodeURIComponent(String(id)) + '/tail',
    alive: true,
  };
  if (pid != null) activity.pid = pid;
  if (toolUseId) activity.toolUseId = toolUseId;
  if (_spawnPlanMtime != null) activity._spawnPlanMtime = _spawnPlanMtime;
  return activity;
}

/**
 * Generate a deterministic ID from kind + label + startedAt when no tool_use_id is available.
 */
function _makeId(kind, label, startedAt) {
  const hash = crypto.createHash('sha1').update(label + startedAt).digest('hex').slice(0, 12);
  return kind + ':' + hash;
}

/**
 * Safely parse a date string. Returns null for invalid inputs.
 */
function _safeDate(v) {
  if (!v || typeof v !== 'string') return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ── Module exports ──────────────────────────────────────────────────────────

module.exports = {
  computeLiveActivities,
  SCHEMA_VERSION,
  // Exposed for unit tests only; not part of the public contract.
  _readEventsActivities,
  _readOrchestratorActivities,
  _readSpawnActivities,
  _readSpawnPlans,
  _dedup,
  _isLive,
  _makeActivity,
  _makeId,
  _safeDate,
  _safeFileMtime,
};
