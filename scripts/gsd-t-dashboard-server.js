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

function handleTranscriptsList(req, res, projectDir) {
  const idx = readTranscriptsIndex(projectDir);
  const sorted = idx.spawns
    .slice()
    .sort((a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0));

  // Content negotiation: browser navigations send Accept: text/html, fetch()
  // defaults to */*. We serve HTML only when the client explicitly asks for it,
  // so the existing dashboard fetch (which expects JSON) stays unaffected.
  const accept = String(req.headers["accept"] || "");
  if (accept.includes("text/html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderTranscriptsHtml(sorted));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ spawns: sorted }));
}

function renderTranscriptsHtml(spawns) {
  const escape = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const fmtDuration = (a, b) => {
    const start = Date.parse(a); const end = Date.parse(b || "") || Date.now();
    if (!Number.isFinite(start)) return "—";
    const ms = Math.max(0, end - start);
    const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
  };
  const fmtTime = (s) => { const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—"; };
  const liveStatuses = new Set(["initializing", "running"]);
  const isLive = (s) => liveStatuses.has(s);

  const rows = spawns.map((s) => {
    const live = isLive(s.status);
    const statusBadge = `<span class="status status-${escape(s.status || 'unknown')}">${escape(s.status || 'unknown')}</span>`;
    return `<tr class="${live ? 'row-live' : ''}">
      <td><a href="/transcript/${encodeURIComponent(s.spawnId)}">${escape(s.spawnId)}</a></td>
      <td>${escape(s.command || '—')}</td>
      <td>${escape(s.description || '—')}</td>
      <td>${statusBadge}</td>
      <td>${escape(fmtTime(s.startedAt))}</td>
      <td>${escape(fmtDuration(s.startedAt, s.endedAt))}</td>
    </tr>`;
  }).join("");

  const empty = `<div class="empty">
    <h2>No spawn transcripts yet</h2>
    <p>Transcripts appear here as soon as the first agent spawns. Run any GSD-T command (for example <code>/gsd-t-quick</code>) to generate one.</p>
    <p><a href="/">← Back to dashboard</a></p>
  </div>`;

  const table = spawns.length ? `<table>
    <thead><tr><th>Spawn ID</th><th>Command</th><th>Description</th><th>Status</th><th>Started</th><th>Duration</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>` : empty;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>GSD-T Transcripts</title>
<style>
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--muted:#7d8590;
  --green:#3fb950;--green-bg:#1a3a1e;--blue:#388bfd;--blue-bg:#1f3a5f;--yellow:#d29922;--red:#f85149;
  --font:'SF Mono','Fira Code',Menlo,monospace;}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:13px;padding:20px;line-height:1.5}
.hdr{display:flex;align-items:center;gap:12px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.logo{color:var(--blue);font-weight:bold;font-size:14px}
.hright{margin-left:auto;color:var(--muted);font-size:11px}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--border);font-size:12px}
th{background:#1c2128;color:var(--muted);text-transform:uppercase;font-size:10px;letter-spacing:0.5px}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:#1c2128}
tr.row-live{background:var(--green-bg)}
.status{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border:1px solid}
.status-running,.status-initializing{background:var(--green-bg);color:var(--green);border-color:var(--green)}
.status-done{background:var(--blue-bg);color:var(--blue);border-color:var(--blue)}
.status-stopped{background:#2a2a2a;color:var(--muted);border-color:var(--border)}
.status-failed,.status-crashed{background:#3a1a1a;color:var(--red);border-color:var(--red)}
.status-unknown{color:var(--muted);border-color:var(--border)}
.empty{text-align:center;padding:60px 20px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:6px}
.empty h2{color:var(--text);margin-bottom:12px;font-size:16px}
.empty p{margin-bottom:8px}
.empty code{background:#1c2128;padding:2px 6px;border-radius:3px;color:var(--green)}
</style></head><body>
<div class="hdr">
  <span class="logo">GSD-T Transcripts</span>
  <a href="/" style="font-size:11px">← Dashboard</a>
  <span class="hright">${spawns.length} spawn${spawns.length === 1 ? '' : 's'}</span>
</div>
${table}
</body></html>`;
}

function handleTranscriptPage(req, res, spawnId, transcriptHtmlPath) {
  if (!isValidSpawnId(spawnId)) { res.writeHead(400); res.end("Invalid spawn id"); return; }
  fs.readFile(transcriptHtmlPath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Transcript UI not found"); return; }
    // Inject the spawn-id as a data attribute on <body> by string replacement;
    // the HTML ships with a placeholder `data-spawn-id="__SPAWN_ID__"`.
    const html = data.toString("utf8").replace(/__SPAWN_ID__/g, spawnId);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
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

function startServer(port, eventsDir, htmlPath, projectDir, transcriptHtmlPath) {
  const projDir = projectDir || path.resolve(eventsDir, "..", "..");
  const tHtmlPath = transcriptHtmlPath || path.join(path.dirname(htmlPath), "gsd-t-transcript.html");
  const server = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    if (url === "/" || url === "") return handleRoot(req, res, htmlPath);
    if (url === "/events") return handleEvents(req, res, eventsDir);
    if (url === "/metrics") return handleMetrics(req, res, projDir);
    if (url === "/ping") return handlePing(req, res, port);
    if (url === "/stop") return handleStop(req, res, server);
    if (url === "/transcripts") return handleTranscriptsList(req, res, projDir);
    // M44 D8 — spawn plans: GET list + SSE change stream
    if (url === "/api/spawn-plans") return handleSpawnPlans(req, res, projDir);
    if (url === "/api/spawn-plans/stream") return handleSpawnPlanUpdates(req, res, projDir);
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
    if (streamMatch) return handleTranscriptStream(req, res, decodeURIComponent(streamMatch[1]), projDir);
    // /transcript/:spawnId — HTML viewer page
    const pageMatch = url.match(/^\/transcript\/([^/]+)$/);
    if (pageMatch) return handleTranscriptPage(req, res, decodeURIComponent(pageMatch[1]), tHtmlPath);
    res.writeHead(404); res.end("Not found");
  });
  server.listen(port);
  return { server, url: `http://localhost:${port}` };
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
  handleTranscriptsList,
  renderTranscriptsHtml,
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
  const { server, url } = startServer(port, eventsDir, htmlPath, projectDir, transcriptHtmlPath);
  process.stdout.write("GSD-T Dashboard: " + url + "\n");
  function cleanup() { try { fs.unlinkSync(pidFile); } catch { /* ok */ } server.close(() => process.exit(0)); }
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}
