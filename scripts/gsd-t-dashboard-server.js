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

function startServer(port, eventsDir, htmlPath, projectDir) {
  const projDir = projectDir || path.resolve(eventsDir, "..", "..");
  const server = http.createServer((req, res) => {
    const url = req.url.split("?")[0];
    if (url === "/" || url === "") return handleRoot(req, res, htmlPath);
    if (url === "/events") return handleEvents(req, res, eventsDir);
    if (url === "/metrics") return handleMetrics(req, res, projDir);
    if (url === "/ping") return handlePing(req, res, port);
    if (url === "/stop") return handleStop(req, res, server);
    res.writeHead(404); res.end("Not found");
  });
  server.listen(port);
  return { server, url: `http://localhost:${port}` };
}

module.exports = { startServer, tailEventsFile, readExistingEvents, parseEventLine, findEventsDir, readMetricsData };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const getArg = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const hasFlag = (f) => argv.includes(f);
  const port = parseInt(getArg("--port") || DEFAULT_PORT, 10);
  const projectDir = process.env.GSD_T_PROJECT_DIR || process.cwd();
  const eventsDir = getArg("--events") || findEventsDir(projectDir);
  const pidFile = path.join(projectDir, ".gsd-t", "dashboard.pid");
  const htmlPath = path.join(__dirname, "gsd-t-dashboard.html");

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
  const { server, url } = startServer(port, eventsDir, htmlPath);
  process.stdout.write("GSD-T Dashboard: " + url + "\n");
  function cleanup() { try { fs.unlinkSync(pidFile); } catch { /* ok */ } server.close(() => process.exit(0)); }
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}
