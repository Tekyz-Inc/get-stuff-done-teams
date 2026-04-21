#!/usr/bin/env node
/**
 * GSD-T Dashboard Server — Zero-dep SSE server for .gsd-t/events/*.jsonl
 * Serves gsd-t-dashboard.html and streams events to browser clients.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_PORT = 7433;
const MAX_EVENTS = 500;
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
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ spawns: sorted }));
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
    // POST /transcript/:spawnId/kill — SIGTERM the recorded workerPid
    const killMatch = url.match(/^\/transcript\/([^/]+)\/kill$/);
    if (killMatch && req.method === "POST") return handleTranscriptKill(req, res, decodeURIComponent(killMatch[1]), projDir);
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
  handleTranscriptStream,
  handleTranscriptPage,
  handleTranscriptKill,
  transcriptsDir,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const getArg = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const hasFlag = (f) => argv.includes(f);
  const port = parseInt(getArg("--port") || DEFAULT_PORT, 10);
  const projectDir = process.env.GSD_T_PROJECT_DIR || process.cwd();
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
