#!/usr/bin/env node
/**
 * GSD-T Dashboard Server — Zero-dep SSE server for .gsd-t/events/*.jsonl
 * Serves gsd-t-dashboard.html and streams events to browser clients.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Base port — the effective default is project-hashed (see
// projectScopedDefaultPort). Explicit --port N always overrides.
const DEFAULT_PORT = 7433;
const MAX_EVENTS = 500;

/**
 * Deterministic project-scoped default port so two projects running
 * `gsd-t visualize` simultaneously don't collide on 7433. Hashes the
 * resolved project directory (djb2) and maps into [7433, 7532].
 *
 * @param {string} projectDir — any path-like string; resolved internally.
 * @returns {number} port in [DEFAULT_PORT, DEFAULT_PORT + 99].
 */
function projectScopedDefaultPort(projectDir) {
  const resolved = path.resolve(projectDir || ".");
  let hash = 5381;
  for (let i = 0; i < resolved.length; i++) {
    hash = ((hash * 33) ^ resolved.charCodeAt(i)) >>> 0;
  }
  return DEFAULT_PORT + (hash % 100);
}

/**
 * Pure helper so callers (and tests) can resolve the effective port from a
 * parsed --port argument + projectDir. Explicit argPort always wins.
 */
function resolvePort({ argPort, projectDir }) {
  if (argPort != null && argPort !== "" && !Number.isNaN(parseInt(argPort, 10))) {
    return parseInt(argPort, 10);
  }
  return projectScopedDefaultPort(projectDir);
}
const KEEPALIVE_MS = 15000;
const SSE_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" };

function parseEventLine(line) {
  if (!line || !line.trim()) return null;
  try { return JSON.parse(line.trim()); } catch { return null; }
}

function findEventsDir(projectDir) {
  return path.join(projectDir || process.cwd(), ".gsd-t", "events");
}

function safeReadJsonl(filePath) {
  try { if (fs.lstatSync(filePath).isSymbolicLink()) return []; } catch { /* safe */ }
  try { return fs.readFileSync(filePath, "utf8").split("\n").map(parseEventLine).filter(Boolean); } catch { return []; }
}

function readExistingEvents(eventsDir, maxEvents) {
  const limit = maxEvents || MAX_EVENTS;
  if (!eventsDir) return [];
  try { fs.accessSync(eventsDir); } catch { return []; }
  let files;
  try { files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".jsonl")).sort().reverse(); } catch { return []; }
  const results = [];
  for (const f of files) {
    if (results.length >= limit) break;
    safeReadJsonl(path.join(eventsDir, f)).forEach((e) => { if (results.length < limit) results.push(e); });
  }
  return results;
}

function tailEventsFile(filePath, callback) {
  let offset = 0;
  try { offset = fs.statSync(filePath).size; } catch { /* new file */ }
  function processNewData() {
    try { if (fs.lstatSync(filePath).isSymbolicLink()) return; } catch { return; }
    let stat;
    try { stat = fs.statSync(filePath); } catch { return; }
    if (stat.size <= offset) return;
    const fd = fs.openSync(filePath, "r");
    let chunk;
    try {
      const buf = Buffer.alloc(stat.size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      chunk = buf.toString("utf8");
      offset = stat.size;
    } finally { fs.closeSync(fd); }
    chunk.split("\n").forEach((line) => { const obj = parseEventLine(line); if (obj) callback(obj); });
  }
  fs.watchFile(filePath, { interval: 500, persistent: true }, processNewData);
  return () => fs.unwatchFile(filePath, processNewData);
}

function handleRoot(req, res, htmlPath) {
  fs.readFile(htmlPath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data);
  });
}

function handlePing(req, res, port) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", port }));
}

function handleStop(req, res, server) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "stopping" }));
  setImmediate(() => server.close());
}

function getNewestJsonl(eventsDir) {
  try { const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".jsonl")).sort(); return files.length ? path.join(eventsDir, files[files.length - 1]) : null; } catch { return null; }
}

function handleEvents(req, res, eventsDir) {
  res.writeHead(200, SSE_HEADERS);
  readExistingEvents(eventsDir, MAX_EVENTS).forEach((e) => { try { res.write("data: " + JSON.stringify(e) + "\n\n"); } catch { /* gone */ } });
  const sendEvent = (obj) => { try { res.write("data: " + JSON.stringify(obj) + "\n\n"); } catch { /* gone */ } };
  let watchedFile = getNewestJsonl(eventsDir);
  let unwatchFile = watchedFile ? tailEventsFile(watchedFile, sendEvent) : null;
  // Watch events directory for new JSONL files (e.g., after midnight date rollover)
  let dirWatcher = null;
  try {
    dirWatcher = fs.watch(eventsDir, (eventType, filename) => {
      if (!filename || !filename.endsWith(".jsonl")) return;
      const newFile = getNewestJsonl(eventsDir);
      if (newFile && newFile !== watchedFile) {
        if (unwatchFile) unwatchFile();
        watchedFile = newFile;
        unwatchFile = tailEventsFile(watchedFile, sendEvent);
      }
    });
  } catch { /* eventsDir may not exist yet */ }
  const timer = setInterval(() => { try { res.write(": keepalive\n\n"); } catch { clearInterval(timer); } }, KEEPALIVE_MS);
  req.on("close", () => { clearInterval(timer); if (unwatchFile) unwatchFile(); if (dirWatcher) dirWatcher.close(); });
}

function readMetricsData(metricsDir) {
  const taskFile = path.join(metricsDir, "task-metrics.jsonl");
  const rollupFile = path.join(metricsDir, "rollup.jsonl");
  const taskMetrics = fs.existsSync(taskFile) ? safeReadJsonl(taskFile) : [];
  const rollups = fs.existsSync(rollupFile) ? safeReadJsonl(rollupFile) : [];
  return { taskMetrics, rollups };
}

function handleMetrics(req, res, projectDir) {
  const metricsDir = path.join(projectDir, ".gsd-t", "metrics");
  const data = readMetricsData(metricsDir);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ── M42 D2 — per-spawn transcript routes ──────────────────────────────────────

const TRANSCRIPTS_SUBDIR = path.join(".gsd-t", "transcripts");

function transcriptsDir(projectDir) {
  return path.join(projectDir, TRANSCRIPTS_SUBDIR);
}

function readTranscriptsIndex(projectDir) {
  const p = path.join(transcriptsDir(projectDir), ".index.json");
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.spawns)) return parsed;
  } catch { /* no index yet */ }
  return { spawns: [] };
}

function isValidSpawnId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9._-]+$/.test(id) && id.length <= 200;
}

// M45 D2 follow-up: filesystem-walk fallback for in-session conversation NDJSONs.
// The conversation-capture hook writes `in-session-{sessionId}.ndjson` directly
// to `transcripts/`, but does NOT update `.index.json` (the index is owned by
// the spawn lifecycle, not by the in-session hook). Without this scan, the
// dashboard's left rail never shows in-session conversations even though the
// NDJSONs are on disk. Synthesizes a spawn-shaped entry per in-session file
// using filesystem timestamps; the viewer's `in-session-` prefix detection
// then labels it as `💬 conversation`.
//
// M47 D2: `status` is derived per-entry from mtime. A file modified within the
// last 30 seconds is `active` (the conversation hook is still appending);
// otherwise `completed`. The viewer (M47 D1) buckets entries by this field
// into Live vs Completed rail sections. The `success | failed | killed`
// taxonomy is intentionally out of scope here — see contract v1.3.0.
const IN_SESSION_ACTIVE_WINDOW_MS = 30_000;
function listInSessionTranscripts(projectDir) {
  const dir = transcriptsDir(projectDir);
  let files;
  try { files = fs.readdirSync(dir); } catch { return []; }
  const now = Date.now();
  const out = [];
  for (const f of files) {
    if (!f.startsWith("in-session-") || !f.endsWith(".ndjson")) continue;
    const spawnId = f.slice(0, -".ndjson".length); // "in-session-{sessionId}"
    if (!isValidSpawnId(spawnId)) continue;
    let stat;
    try { stat = fs.statSync(path.join(dir, f)); } catch { continue; }
    const status = (now - stat.mtimeMs) < IN_SESSION_ACTIVE_WINDOW_MS ? "active" : "completed";
    out.push({
      spawnId,
      command: "in-session conversation",
      startedAt: stat.birthtime ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
      lastUpdatedAt: stat.mtime.toISOString(),
      status,
      kind: "in-session",
    });
  }
  return out;
}

// M47 D2: Resolve the most-recently-modified `in-session-*.ndjson` file. Used
// by the viewer's top-pane default load (zero-click main-conversation stream).
// Reuses `isValidSpawnId` for path-traversal safety.
function handleMainSession(req, res, projectDir) {
  const dir = transcriptsDir(projectDir);
  let files;
  try { files = fs.readdirSync(dir); } catch { files = []; }
  let best = null;
  for (const f of files) {
    if (!f.startsWith("in-session-") || !f.endsWith(".ndjson")) continue;
    const spawnId = f.slice(0, -".ndjson".length);
    if (!isValidSpawnId(spawnId)) continue;
    let stat;
    try { stat = fs.statSync(path.join(dir, f)); } catch { continue; }
    if (!best || stat.mtimeMs > best.mtimeMs) {
      best = { filename: f, sessionId: f.slice("in-session-".length, -".ndjson".length), mtimeMs: stat.mtimeMs };
    }
  }
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  if (!best) {
    res.end(JSON.stringify({ filename: null, sessionId: null, mtimeMs: null }));
    return;
  }
  res.end(JSON.stringify(best));
}

function handleTranscriptsList(req, res, projectDir, transcriptHtmlPath) {
  const idx = readTranscriptsIndex(projectDir);

  // Merge index entries with in-session NDJSONs from the filesystem.
  // De-dupe by spawnId — index entries take precedence (richer metadata).
  const known = new Set(idx.spawns.map((s) => s.spawnId));
  const inSession = listInSessionTranscripts(projectDir).filter((s) => !known.has(s.spawnId));
  const merged = idx.spawns.concat(inSession);

  const sorted = merged
    .slice()
    .sort((a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0));

  // Content negotiation: browser navigations send Accept: text/html, fetch()
  // defaults to */*. For text/html we serve the viewer (same HTML as
  // /transcript/:id) with an empty spawn-id placeholder — the viewer's left
  // rail populates from /api/spawns-index and the main pane defers until the
  // user clicks a spawn. Programmatic clients (fetch's default */* or explicit
  // application/json) continue to get the JSON shape the dashboard JS already
  // consumes.
  const accept = String(req.headers["accept"] || "");
  if (accept.includes("text/html") && transcriptHtmlPath) {
    fs.readFile(transcriptHtmlPath, (err, data) => {
      if (err) { res.writeHead(404); res.end("Transcript UI not found"); return; }
      // Substitute the __SPAWN_ID__ placeholder with an empty string; the
      // viewer's initialId logic falls through to location.hash (also empty)
      // and connect('') is a no-op beyond a 404 SSE attempt — harmless, since
      // the left rail polls /api/spawns-index independently.
      const projectName = path.basename(path.resolve(projectDir || "."));
      // Function-form replacement: a string replacement would interpret
      // `$&`, `$1`, `$$`, etc. in the project basename as backreferences,
      // re-injecting the placeholder or fragments of it (Red Team BUG-1).
      const escapedName = _escapeHtml(projectName);
      const html = data.toString("utf8")
        .replace(/__SPAWN_ID__/g, () => "")
        .replace(/__PROJECT_NAME__/g, () => escapedName);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ spawns: sorted }));
}

function handleTranscriptPage(req, res, spawnId, transcriptHtmlPath, projectDir) {
  if (!isValidSpawnId(spawnId)) { res.writeHead(400); res.end("Invalid spawn id"); return; }
  fs.readFile(transcriptHtmlPath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Transcript UI not found"); return; }
    // Inject the spawn-id as a data attribute on <body> by string replacement;
    // the HTML ships with a placeholder `data-spawn-id="__SPAWN_ID__"`.
    const projectName = path.basename(path.resolve(projectDir || "."));
    // Function-form replacement: see comment in handleTranscriptsList. Even
    // though isValidSpawnId guards spawnId against `$`, defence in depth.
    const escapedName = _escapeHtml(projectName);
    const html = data.toString("utf8")
      .replace(/__SPAWN_ID__/g, () => spawnId)
      .replace(/__PROJECT_NAME__/g, () => escapedName);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
}

// HTML-escape just enough to make a directory basename safe in <title> and
// <div class="title">. Project basenames effectively never contain quotes or
// angle brackets, but we still escape to keep the surface tight.
function _escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tailTranscriptFile(filePath, callback) {
  let offset = 0;
  let buf = "";
  function processNewData() {
    let stat;
    try { stat = fs.statSync(filePath); } catch { return; }
    if (stat.size <= offset) return;
    const fd = fs.openSync(filePath, "r");
    try {
      const b = Buffer.alloc(stat.size - offset);
      fs.readSync(fd, b, 0, b.length, offset);
      buf += b.toString("utf8");
      offset = stat.size;
    } finally { fs.closeSync(fd); }
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.length > 0) callback(line);
    }
  }
  fs.watchFile(filePath, { interval: 500, persistent: true }, processNewData);
  return () => fs.unwatchFile(filePath, processNewData);
}

// ── M43 D6 — per-spawn tool-cost + usage routes ────────────────────────────

/**
 * Load per-turn usage rows for a given spawn-id from
 * `.gsd-t/metrics/token-usage.jsonl`.
 *
 * Rows emitted by M41/M43 include either `spawn_id` OR `session_id`. We match
 * against both so the route works both for headless spawns (which tag rows
 * with `spawn_id` at emit time) and in-session D1 captures (which tag with
 * the session's `session_id`).
 *
 * @param {string} projectDir
 * @param {string} spawnId
 * @returns {Array<object>}
 */
function readSpawnUsageRows(projectDir, spawnId) {
  const fp = path.join(projectDir, ".gsd-t", "metrics", "token-usage.jsonl");
  if (!fs.existsSync(fp)) return [];
  const lines = safeReadJsonl(fp);
  return lines.filter((row) => {
    if (!row || typeof row !== "object") return false;
    return row.spawn_id === spawnId || row.session_id === spawnId;
  });
}

function handleTranscriptUsage(req, res, spawnId, projectDir) {
  if (!isValidSpawnId(spawnId)) { res.writeHead(400); res.end("Invalid spawn id"); return; }
  const rows = readSpawnUsageRows(projectDir, spawnId);
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ spawn_id: spawnId, rows, generated_at: new Date().toISOString() }));
}

/**
 * Proxy to D2's `aggregateByTool`. D2 is co-deployed in Wave 2 — if the
 * library isn't on disk yet, we return HTTP 503 with a machine-readable
 * body so the viewer panel can display "Tool attribution not yet available"
 * without breaking.
 */
function handleTranscriptToolCost(req, res, spawnId, projectDir) {
  if (!isValidSpawnId(spawnId)) { res.writeHead(400); res.end("Invalid spawn id"); return; }
  let attribution;
  try {
    // TODO(D6→D2): remove the try/catch once D2 lands. Keep the call shape.
    // eslint-disable-next-line global-require
    attribution = require("../bin/gsd-t-tool-attribution.cjs");
  } catch (_) {
    res.writeHead(503, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "tool-attribution library not yet available" }));
    return;
  }
  const rows = readSpawnUsageRows(projectDir, spawnId);
  let tools = [];
  try {
    if (typeof attribution.aggregateByTool !== "function") {
      res.writeHead(503, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "aggregateByTool not exported by tool-attribution library" }));
      return;
    }
    tools = attribution.aggregateByTool(rows) || [];
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({
    spawn_id: spawnId,
    tools,
    generated_at: new Date().toISOString(),
  }));
}

// ── M42 D3 — kill per-spawn ────────────────────────────────────────────────

function writeTranscriptsIndex(projectDir, idx) {
  const p = path.join(transcriptsDir(projectDir), ".index.json");
  const tmp = p + ".tmp";
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch { /* exists */ }
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2));
  fs.renameSync(tmp, p);
}

function handleTranscriptKill(req, res, spawnId, projectDir) {
  if (!isValidSpawnId(spawnId)) { res.writeHead(400); res.end("Invalid spawn id"); return; }
  const idx = readTranscriptsIndex(projectDir);
  const i = idx.spawns.findIndex((s) => s.spawnId === spawnId);
  if (i < 0) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "unknown_spawn" })); return; }
  const entry = idx.spawns[i];
  const pid = entry.workerPid;
  if (!pid || typeof pid !== "number") {
    res.writeHead(409, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "no_pid_recorded" }));
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    idx.spawns[i].status = "stopped";
    idx.spawns[i].endedAt = idx.spawns[i].endedAt || new Date().toISOString();
    writeTranscriptsIndex(projectDir, idx);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "stopped", pid }));
  } catch (err) {
    if (err.code === "ESRCH") {
      // Process already gone — treat as success and mark ended
      idx.spawns[i].status = idx.spawns[i].status === "running" ? "stopped" : idx.spawns[i].status;
      idx.spawns[i].endedAt = idx.spawns[i].endedAt || new Date().toISOString();
      writeTranscriptsIndex(projectDir, idx);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "already_stopped", pid }));
      return;
    }
    if (err.code === "EPERM") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "permission_denied", pid }));
      return;
    }
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
}

/**
 * Find the transcripts-index entry for a spawn-id, or null when the index
 * is missing / the id isn't recorded. Used by handleTranscriptStream to
 * detect already-finished spawns so the SSE stream can emit `event: end`
 * and close instead of tailing indefinitely.
 */
function readIndexEntry(projectDir, spawnId) {
  const idx = readTranscriptsIndex(projectDir);
  if (!idx || !Array.isArray(idx.spawns)) return null;
  return idx.spawns.find((s) => s && s.spawnId === spawnId) || null;
}

function handleTranscriptStream(req, res, spawnId, projectDir) {
  if (!isValidSpawnId(spawnId)) { res.writeHead(400); res.end("Invalid spawn id"); return; }
  const filePath = path.join(transcriptsDir(projectDir), `${spawnId}.ndjson`);
  let exists = true;
  let fileSize = 0;
  try { fileSize = fs.statSync(filePath).size; } catch { exists = false; }

  res.writeHead(200, SSE_HEADERS);

  // Consult the transcripts index — if the spawn is already finished we
  // replay and close instead of attaching a live tail.
  const entry = readIndexEntry(projectDir, spawnId);
  const finishedStatuses = ["done", "failed", "stopped"];
  const isFinished = !!(entry && entry.status && finishedStatuses.includes(entry.status));

  // Replay: read the full file from byte 0 and send each line.
  let replayedBytes = 0;
  if (exists) {
    try {
      const full = fs.readFileSync(filePath, "utf8");
      replayedBytes = Buffer.byteLength(full, "utf8");
      full.split("\n").forEach((line) => {
        if (line.length > 0) {
          try { res.write("data: " + line + "\n\n"); } catch { /* gone */ }
        }
      });
    } catch { /* empty transcript */ }
  }

  // Finished spawn → emit end event and close the stream. No tail, no keepalive.
  if (isFinished) {
    const endPayload = JSON.stringify({
      status: entry.status,
      endedAt: entry.endedAt || null,
    });
    try { res.write("event: end\ndata: " + endPayload + "\n\n"); } catch { /* gone */ }
    try { res.end(); } catch { /* gone */ }
    return;
  }

  // Missing file — tell the viewer the stream is live but empty. fs.watchFile
  // needs the file to exist, so we skip the tail here. A running producer
  // will have created the file already (the finished-spawn branch above
  // catches the post-hoc teed case via index status).
  if (!exists) {
    const waitingPayload = JSON.stringify({
      status: "waiting",
      reason: "no transcript file yet",
    });
    try { res.write("event: status\ndata: " + waitingPayload + "\n\n"); } catch { /* gone */ }
    const timer = setInterval(() => { try { res.write(": keepalive\n\n"); } catch { clearInterval(timer); } }, KEEPALIVE_MS);
    req.on("close", () => { clearInterval(timer); });
    return;
  }

  // Empty file — producer hasn't written anything yet. Emit a status frame
  // so the viewer knows the stream is live but the file is 0 bytes, then
  // attach the live tail so we pick up writes as they arrive.
  if (fileSize === 0) {
    const emptyPayload = JSON.stringify({
      status: "empty",
      reason: "transcript file exists but is empty",
    });
    try { res.write("event: status\ndata: " + emptyPayload + "\n\n"); } catch { /* gone */ }
  }

  // Tail: from replayedBytes onward. We reuse the tailer, but seed offset
  // with what we already replayed so we don't double-send.
  let offset = replayedBytes;
  let buf = "";
  const processNewData = () => {
    let stat;
    try { stat = fs.statSync(filePath); } catch { return; }
    if (stat.size <= offset) return;
    const fd = fs.openSync(filePath, "r");
    try {
      const b = Buffer.alloc(stat.size - offset);
      fs.readSync(fd, b, 0, b.length, offset);
      buf += b.toString("utf8");
      offset = stat.size;
    } finally { fs.closeSync(fd); }
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.length > 0) {
        try { res.write("data: " + line + "\n\n"); } catch { /* gone */ }
      }
    }
  };
  fs.watchFile(filePath, { interval: 500, persistent: true }, processNewData);
  const unwatchFile = () => fs.unwatchFile(filePath, processNewData);

  const timer = setInterval(() => { try { res.write(": keepalive\n\n"); } catch { clearInterval(timer); } }, KEEPALIVE_MS);
  req.on("close", () => { clearInterval(timer); if (unwatchFile) unwatchFile(); });
}

// ── M44 D8 — spawn-plan endpoint + SSE channel ─────────────────────────────
//
// Additive; does not change existing endpoints or SSE streams. Reads plan
// files atomically written by `bin/spawn-plan-writer.cjs` under
// `.gsd-t/spawns/{spawnId}.json`. A plan is "active" when `endedAt === null`.
// Contract: .gsd-t/contracts/spawn-plan-contract.md v1.0.0

const SPAWNS_SUBDIR = path.join(".gsd-t", "spawns");

function spawnsDir(projectDir) {
  return path.join(projectDir, SPAWNS_SUBDIR);
}

function readSpawnPlanFile(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch { return null; }
}

function listAllSpawnPlans(projectDir) {
  const dir = spawnsDir(projectDir);
  if (!fs.existsSync(dir)) return [];
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const f of files) {
    const plan = readSpawnPlanFile(path.join(dir, f));
    if (plan) out.push(plan);
  }
  return out;
}

function listActiveSpawnPlans(projectDir) {
  return listAllSpawnPlans(projectDir).filter((p) => p && p.endedAt == null);
}

// ── M44 D9 — Parallelism observability ──────────────────────────────────────
// Additive endpoints powered by bin/parallelism-report.cjs (v1.0.0 contract).
// Pure read-only observer; never writes, never spawns. 5-second per-response
// cache so rapid panel polls don't hammer the filesystem.

const PARALLELISM_CACHE_MS = 5000;
const _parallelismCache = { metrics: { at: 0, body: null, wave: null }, report: new Map() };

function _loadParallelismReporter() {
  try {
    // Resolve at call-time so tests that don't install the module don't break
    // unrelated endpoints. Require is cached by Node after first success.
    return require(path.join(__dirname, "..", "bin", "parallelism-report.cjs"));
  } catch (err) {
    return { _loadError: err && err.message || String(err) };
  }
}

function handleParallelism(req, res, projectDir) {
  const urlObj = req.url ? req.url.split("?") : ["", ""];
  const qs = urlObj[1] || "";
  const params = new URLSearchParams(qs);
  const wave = params.get("wave") || null;
  const now = Date.now();
  const cache = _parallelismCache.metrics;
  if (cache.body && cache.wave === wave && (now - cache.at) < PARALLELISM_CACHE_MS) {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "X-Cache": "hit" });
    res.end(cache.body);
    return;
  }
  const reporter = _loadParallelismReporter();
  if (reporter._loadError) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "parallelism-report module unavailable", detail: reporter._loadError }));
    return;
  }
  let metrics;
  try {
    metrics = reporter.computeParallelismMetrics({ projectDir, wave: wave || undefined });
  } catch (err) {
    // Contract says silent-fail; a thrown error here means contract regression.
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "computeParallelismMetrics threw", detail: err && err.message || String(err) }));
    return;
  }
  const body = JSON.stringify(metrics);
  cache.at = now;
  cache.wave = wave;
  cache.body = body;
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "X-Cache": "miss" });
  res.end(body);
}

function handleParallelismReport(req, res, projectDir) {
  const urlObj = req.url ? req.url.split("?") : ["", ""];
  const qs = urlObj[1] || "";
  const params = new URLSearchParams(qs);
  const wave = params.get("wave") || null;
  const cacheKey = wave || "__all__";
  const now = Date.now();
  const cached = _parallelismCache.report.get(cacheKey);
  if (cached && (now - cached.at) < PARALLELISM_CACHE_MS) {
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Access-Control-Allow-Origin": "*", "X-Cache": "hit" });
    res.end(cached.body);
    return;
  }
  const reporter = _loadParallelismReporter();
  if (reporter._loadError) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("parallelism-report module unavailable: " + reporter._loadError);
    return;
  }
  let md;
  try {
    md = reporter.buildFullReport({ projectDir, wave: wave || undefined });
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("buildFullReport threw: " + (err && err.message || String(err)));
    return;
  }
  _parallelismCache.report.set(cacheKey, { at: now, body: md });
  res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Access-Control-Allow-Origin": "*", "X-Cache": "miss" });
  res.end(md);
}

// POST /api/unattended-stop — proxies to the existing stop-sentinel flow so
// the transcript panel's "Stop Supervisor" button reuses the canonical
// kill path. Writes `.gsd-t/.unattended/stop` sentinel; supervisor polls
// it and self-exits. Contract reminder: D9 does NOT implement its own
// stop logic, does NOT PID-kill.
function handleUnattendedStop(req, res, projectDir) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json", "Allow": "POST" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }
  const stopDir = path.join(projectDir, ".gsd-t", ".unattended");
  const stopFile = path.join(stopDir, "stop");
  try {
    fs.mkdirSync(stopDir, { recursive: true });
    fs.writeFileSync(stopFile, new Date().toISOString() + "\n");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "failed to write stop sentinel", detail: err && err.message || String(err) }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, sentinel: stopFile }));
}

function handleSpawnPlans(req, res, projectDir) {
  const plans = listActiveSpawnPlans(projectDir).sort((a, b) => {
    const ta = Date.parse(a.startedAt) || 0;
    const tb = Date.parse(b.startedAt) || 0;
    return tb - ta;
  });
  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ plans, generated_at: new Date().toISOString() }));
}

function handleSpawnPlanUpdates(req, res, projectDir) {
  res.writeHead(200, SSE_HEADERS);
  // Initial snapshot: every current active plan.
  const initial = listActiveSpawnPlans(projectDir);
  for (const plan of initial) {
    try { res.write("data: " + JSON.stringify({ spawnId: plan.spawnId, plan }) + "\n\n"); } catch { /* gone */ }
  }

  const dir = spawnsDir(projectDir);
  let dirWatcher = null;
  const emittedCache = new Map(); // spawnId → last-mtime-ms, dedup rapid rename events

  function pushChange(spawnId) {
    if (!spawnId) return;
    const fp = path.join(dir, spawnId + ".json");
    let mtime = 0;
    try { mtime = fs.statSync(fp).mtimeMs || 0; } catch { /* missing */ }
    // Dedup rapid-fire rename events — only emit when mtime advances.
    if (emittedCache.get(spawnId) === mtime && mtime > 0) return;
    emittedCache.set(spawnId, mtime);
    const plan = readSpawnPlanFile(fp);
    if (!plan) return;
    try { res.write("data: " + JSON.stringify({ spawnId, plan }) + "\n\n"); } catch { /* gone */ }
  }

  try {
    if (fs.existsSync(dir)) {
      dirWatcher = fs.watch(dir, (eventType, filename) => {
        if (!filename || !filename.endsWith(".json")) return;
        const spawnId = filename.slice(0, -5);
        pushChange(spawnId);
      });
    }
  } catch { /* dir may not exist yet; skip watch */ }

  const timer = setInterval(() => { try { res.write(": keepalive\n\n"); } catch { clearInterval(timer); } }, KEEPALIVE_MS);
  req.on("close", () => { clearInterval(timer); if (dirWatcher) { try { dirWatcher.close(); } catch { /* ok */ } } });
}

// ── M49 — Idle-TTL self-shutdown ────────────────────────────────────────────
//
// A dashboard with zero HTTP requests AND zero active SSE connections for the
// full TTL window self-exits cleanly. Safety net for any dashboard that
// somehow gets started and then walks away — even if a future bug lets one
// be auto-started, it dies on its own. Configurable via env
// `GSD_T_DASHBOARD_IDLE_TTL_MS` or `--idle-ttl-ms` flag.
//
// "Idle" means: zero HTTP requests AND zero active SSE connections for the
// full TTL window. `lastActivity` is bumped on every HTTP request handler
// entry and on SSE connect/disconnect. SSE-active dashboards never exit.
//
// On shutdown, removes `.gsd-t/.dashboard.pid` so the lazy probe (M49 in
// `bin/headless-auto-spawn.cjs`) sees a clean state.

const DEFAULT_IDLE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const IDLE_CHECK_INTERVAL_MS = 60 * 1000;        // 60s

function _activityTracker() {
  let lastActivity = Date.now();
  let activeSseConnections = 0;
  return {
    bump() { lastActivity = Date.now(); },
    sseConnect() { activeSseConnections++; lastActivity = Date.now(); },
    sseDisconnect() {
      if (activeSseConnections > 0) activeSseConnections--;
      lastActivity = Date.now();
    },
    snapshot() { return { lastActivity, activeSseConnections }; },
  };
}

/**
 * Wrap an SSE handler so it bumps the connect/disconnect counters.
 */
function _wrapSseHandler(handler, tracker) {
  return function (req, res, ...rest) {
    tracker.sseConnect();
    let closed = false;
    const onClose = () => {
      if (closed) return;
      closed = true;
      tracker.sseDisconnect();
    };
    req.on("close", onClose);
    res.on("close", onClose);
    res.on("finish", onClose);
    return handler(req, res, ...rest);
  };
}

/**
 * @param {object} opts { ttlMs, intervalMs, projectDir, server }
 * @returns timer handle (so callers can clearInterval in tests).
 */
function _startIdleTtlTimer({ ttlMs, intervalMs, projectDir, server, tracker, onShutdown }) {
  const interval = setInterval(() => {
    const { lastActivity, activeSseConnections } = tracker.snapshot();
    const idle = Date.now() - lastActivity;
    if (activeSseConnections === 0 && idle >= ttlMs) {
      clearInterval(interval);
      try {
        // Remove pid file so the lazy probe in headless-auto-spawn sees clean state.
        if (projectDir) {
          const pidFile = path.join(projectDir, ".gsd-t", ".dashboard.pid");
          try { fs.unlinkSync(pidFile); } catch { /* may not exist */ }
        }
      } catch { /* best-effort */ }
      try { if (typeof onShutdown === "function") onShutdown(); } catch { /* best-effort */ }
      try {
        if (server) server.close(() => process.exit(0));
        else process.exit(0);
      } catch { process.exit(0); }
    }
  }, intervalMs);
  if (typeof interval.unref === "function") interval.unref();
  return interval;
}

function startServer(port, eventsDir, htmlPath, projectDir, transcriptHtmlPath, opts) {
  const projDir = projectDir || path.resolve(eventsDir, "..", "..");
  const tHtmlPath = transcriptHtmlPath || path.join(path.dirname(htmlPath), "gsd-t-transcript.html");
  const tracker = _activityTracker();
  const ttlMs = (opts && Number.isFinite(opts.idleTtlMs))
    ? opts.idleTtlMs
    : (Number.parseInt(process.env.GSD_T_DASHBOARD_IDLE_TTL_MS || "", 10) || DEFAULT_IDLE_TTL_MS);
  const intervalMs = (opts && Number.isFinite(opts.idleCheckIntervalMs))
    ? opts.idleCheckIntervalMs
    : IDLE_CHECK_INTERVAL_MS;

  // Wrap the three SSE handlers with the connect/disconnect tracker.
  const handleEventsSse = _wrapSseHandler(handleEvents, tracker);
  const handleTranscriptStreamSse = _wrapSseHandler(handleTranscriptStream, tracker);
  const handleSpawnPlanUpdatesSse = _wrapSseHandler(handleSpawnPlanUpdates, tracker);

  const server = http.createServer((req, res) => {
    tracker.bump(); // bump on every HTTP request handler entry
    const url = req.url.split("?")[0];
    if (url === "/" || url === "") return handleRoot(req, res, htmlPath);
    if (url === "/events") return handleEventsSse(req, res, eventsDir);
    if (url === "/metrics") return handleMetrics(req, res, projDir);
    if (url === "/ping") return handlePing(req, res, port);
    if (url === "/stop") return handleStop(req, res, server);
    if (url === "/transcripts") return handleTranscriptsList(req, res, projDir, tHtmlPath);
    // M47 D2 — most-recent in-session NDJSON for the viewer top-pane default load
    if (url === "/api/main-session") return handleMainSession(req, res, projDir);
    // M44 D8 — spawn plans: GET list + SSE change stream
    if (url === "/api/spawn-plans") return handleSpawnPlans(req, res, projDir);
    if (url === "/api/spawn-plans/stream") return handleSpawnPlanUpdatesSse(req, res, projDir);
    // M44 D9 — parallelism observability (additive, read-only)
    if (url === "/api/parallelism") return handleParallelism(req, res, projDir);
    if (url === "/api/parallelism/report") return handleParallelismReport(req, res, projDir);
    // M44 D9 — stop-supervisor proxy (POST only; reuses existing sentinel flow)
    if (url === "/api/unattended-stop") return handleUnattendedStop(req, res, projDir);
    // POST /transcript/:spawnId/kill — SIGTERM the recorded workerPid
    const killMatch = url.match(/^\/transcript\/([^/]+)\/kill$/);
    if (killMatch && req.method === "POST") return handleTranscriptKill(req, res, decodeURIComponent(killMatch[1]), projDir);
    // M43 D6 — /transcript/:spawnId/tool-cost — D2 attribution proxy
    const toolCostMatch = url.match(/^\/transcript\/([^/]+)\/tool-cost$/);
    if (toolCostMatch) return handleTranscriptToolCost(req, res, decodeURIComponent(toolCostMatch[1]), projDir);
    // M43 D6 — /transcript/:spawnId/usage — per-turn rows for this spawn
    const usageMatch = url.match(/^\/transcript\/([^/]+)\/usage$/);
    if (usageMatch) return handleTranscriptUsage(req, res, decodeURIComponent(usageMatch[1]), projDir);
    // /transcript/:spawnId/stream — SSE tail of per-spawn ndjson
    const streamMatch = url.match(/^\/transcript\/([^/]+)\/stream$/);
    if (streamMatch) return handleTranscriptStreamSse(req, res, decodeURIComponent(streamMatch[1]), projDir);
    // /transcript/:spawnId — HTML viewer page
    const pageMatch = url.match(/^\/transcript\/([^/]+)$/);
    if (pageMatch) return handleTranscriptPage(req, res, decodeURIComponent(pageMatch[1]), tHtmlPath, projDir);
    res.writeHead(404); res.end("Not found");
  });
  server.listen(port);

  // M49 — install idle-TTL self-shutdown timer. Skipped only when caller
  // explicitly passes `idleTtlMs: 0` (used by tests that don't want the
  // server to self-exit mid-test).
  let idleTimer = null;
  if (ttlMs > 0) {
    idleTimer = _startIdleTtlTimer({
      ttlMs,
      intervalMs,
      projectDir: projDir,
      server,
      tracker,
      onShutdown: opts && opts.onShutdown,
    });
  }

  return { server, url: `http://localhost:${port}`, tracker, idleTimer };
}

module.exports = {
  startServer,
  tailEventsFile,
  readExistingEvents,
  parseEventLine,
  findEventsDir,
  readMetricsData,
  readTranscriptsIndex,
  writeTranscriptsIndex,
  readIndexEntry,
  isValidSpawnId,
  listInSessionTranscripts,
  handleMainSession,
  handleTranscriptsList,
  handleTranscriptStream,
  handleTranscriptPage,
  handleTranscriptKill,
  handleTranscriptToolCost,
  handleTranscriptUsage,
  readSpawnUsageRows,
  transcriptsDir,
  DEFAULT_PORT,
  projectScopedDefaultPort,
  resolvePort,
  // M44 D8 — spawn-plan visibility
  listAllSpawnPlans,
  listActiveSpawnPlans,
  handleSpawnPlans,
  handleSpawnPlanUpdates,
  readSpawnPlanFile,
  spawnsDir,
  // M44 D9 — parallelism observability
  handleParallelism,
  handleParallelismReport,
  handleUnattendedStop,
  // M49 — idle-TTL exports for tests
  _activityTracker,
  _wrapSseHandler,
  _startIdleTtlTimer,
  DEFAULT_IDLE_TTL_MS,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const getArg = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const hasFlag = (f) => argv.includes(f);
  const projectDir = process.env.GSD_T_PROJECT_DIR || process.cwd();
  const port = resolvePort({ argPort: getArg("--port"), projectDir });
  const eventsDir = getArg("--events") || findEventsDir(projectDir);
  const pidFile = path.join(projectDir, ".gsd-t", "dashboard.pid");
  const htmlPath = path.join(__dirname, "gsd-t-dashboard.html");
  const transcriptHtmlPath = path.join(__dirname, "gsd-t-transcript.html");

  if (hasFlag("--stop")) {
    try { const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10); process.kill(pid); fs.unlinkSync(pidFile); }
    catch (e) { process.stderr.write("No running server: " + e.message + "\n"); }
    process.exit(0);
  }
  if (hasFlag("--detach")) {
    const child = spawn(process.execPath, [__filename, ...argv.filter((a) => a !== "--detach")], { detached: true, stdio: "ignore" });
    child.unref();
    try { fs.mkdirSync(path.dirname(pidFile), { recursive: true }); } catch { /* exists */ }
    fs.writeFileSync(pidFile, String(child.pid));
    process.exit(0);
  }
  // M49 — idle-TTL flag/env override. Falls through to startServer's default
  // (env var GSD_T_DASHBOARD_IDLE_TTL_MS or 4h).
  const ttlArg = getArg("--idle-ttl-ms");
  const startOpts = {};
  if (ttlArg != null && ttlArg !== "") {
    const n = Number.parseInt(ttlArg, 10);
    if (Number.isFinite(n)) startOpts.idleTtlMs = n;
  }

  const { server, url } = startServer(port, eventsDir, htmlPath, projectDir, transcriptHtmlPath, startOpts);
  process.stdout.write("GSD-T Dashboard: " + url + "\n");
  function cleanup() {
    try { fs.unlinkSync(pidFile); } catch { /* ok */ }
    // M49 — also remove the lazy-probe pidfile so headless-auto-spawn sees clean state.
    try {
      fs.unlinkSync(path.join(projectDir, ".gsd-t", ".dashboard.pid"));
    } catch { /* ok */ }
    server.close(() => process.exit(0));
  }
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}
