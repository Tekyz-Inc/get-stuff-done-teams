#!/usr/bin/env node
/**
 * GSD-T Design Review Server — Zero-dep proxy + review coordination
 *
 * Proxies the project dev server (same-origin for iframe DOM access),
 * injects the inspect overlay script, and provides coordination APIs
 * for the builder terminal ↔ human review loop.
 *
 * Usage:
 *   node gsd-t-design-review-server.js [--port 3456] [--target http://localhost:5173] [--project /path/to/project]
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

// ── CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = parseInt(getArg("port", "3456"), 10);
const TARGET = getArg("target", "http://localhost:5173");
const PROJECT_DIR = getArg("project", process.cwd());
const REVIEW_DIR = path.join(PROJECT_DIR, ".gsd-t", "design-review");

// ── Ensure coordination directory ─────────────────────────────────────
function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
}
ensureDir(REVIEW_DIR);
ensureDir(path.join(REVIEW_DIR, "queue"));
ensureDir(path.join(REVIEW_DIR, "feedback"));

// Init status if missing
const STATUS_FILE = path.join(REVIEW_DIR, "status.json");
if (!fs.existsSync(STATUS_FILE)) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify({
    phase: "elements",
    state: "waiting",
    startedAt: new Date().toISOString(),
  }, null, 2));
}

// ── SSE clients ───────────────────────────────────────────────────────
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

// Watch queue directory for changes — auto-reject items with CRITICAL measurement failures
let queueWatcher;
try {
  queueWatcher = fs.watch(path.join(REVIEW_DIR, "queue"), () => {
    autoRejectFailures();
    broadcast("queue-update", readQueue());
  });
} catch { /* dir may not exist yet */ }

function autoRejectFailures() {
  const queueDir = path.join(REVIEW_DIR, "queue");
  const fbDir = path.join(REVIEW_DIR, "feedback");
  ensureDir(fbDir);
  try {
    const files = fs.readdirSync(queueDir).filter(f => f.endsWith(".json"));
    for (const f of files) {
      try {
        const item = JSON.parse(fs.readFileSync(path.join(queueDir, f), "utf8"));
        if (!item.measurements || !Array.isArray(item.measurements)) continue;
        // Check for CRITICAL failures (auto-reject threshold)
        const failures = item.measurements.filter(m => !m.pass);
        const criticalFailures = failures.filter(m =>
          m.severity === "critical" ||
          m.property === "chart type" ||
          m.property === "display" ||
          m.property === "flexDirection"
        );
        if (criticalFailures.length > 0) {
          // Auto-reject: write feedback and remove from queue
          const feedback = {
            id: item.id,
            verdict: "rejected",
            source: "auto-review",
            comment: `Auto-rejected: ${criticalFailures.length} critical measurement failures: ${criticalFailures.map(m => `${m.property} (expected: ${m.expected}, got: ${m.actual})`).join("; ")}`,
            changes: [],
            rejectedAt: new Date().toISOString(),
          };
          fs.writeFileSync(path.join(fbDir, `${item.id}.json`), JSON.stringify(feedback, null, 2));
          // Move item to rejected (don't delete, move to a rejected subfolder)
          ensureDir(path.join(REVIEW_DIR, "rejected"));
          fs.renameSync(path.join(queueDir, f), path.join(REVIEW_DIR, "rejected", f));
          broadcast("auto-reject", { id: item.id, failures: criticalFailures });
          console.log(`  ✗ Auto-rejected: ${item.name} — ${criticalFailures.length} critical failures`);
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* no queue dir yet */ }
}

// ── Coordination API ──────────────────────────────────────────────────

function readQueue() {
  const queueDir = path.join(REVIEW_DIR, "queue");
  try {
    const items = fs.readdirSync(queueDir)
      .filter(f => f.endsWith(".json") && !f.includes(".ai-review"))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(queueDir, f), "utf8")); }
        catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    // Attach AI review annotations if they exist
    for (const item of items) {
      const aiFile = path.join(queueDir, `${item.id}.ai-review.json`);
      try {
        if (fs.existsSync(aiFile)) {
          item.aiReview = JSON.parse(fs.readFileSync(aiFile, "utf8"));
        }
      } catch { /* skip malformed */ }
    }
    return items;
  } catch { return []; }
}

function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8")); }
  catch { return { phase: "elements", state: "waiting" }; }
}

function readFeedback() {
  const fbDir = path.join(REVIEW_DIR, "feedback");
  try {
    return fs.readdirSync(fbDir)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(fbDir, f), "utf8")); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

function writeFeedback(items) {
  const fbDir = path.join(REVIEW_DIR, "feedback");
  ensureDir(fbDir);
  for (const item of items) {
    const fname = `${item.id}.json`;
    fs.writeFileSync(path.join(fbDir, fname), JSON.stringify(item, null, 2));
  }
  // Write a summary signal file so the builder knows review is done
  fs.writeFileSync(
    path.join(REVIEW_DIR, "review-complete.json"),
    JSON.stringify({
      completedAt: new Date().toISOString(),
      phase: readStatus().phase,
      items: items.map(i => ({ id: i.id, verdict: i.verdict })),
    }, null, 2)
  );
}

// ── Proxy helper ──────────────────────────────────────────────────────
const targetUrl = new URL(TARGET);

function proxyRequest(req, res) {
  const opts = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${targetUrl.hostname}:${targetUrl.port}` },
  };

  const proxyReq = http.request(opts, (proxyRes) => {
    const contentType = proxyRes.headers["content-type"] || "";
    const isHtml = contentType.includes("text/html");

    if (isHtml) {
      // Buffer HTML to inject our overlay script
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        let html = Buffer.concat(chunks).toString("utf8");
        // Inject the review overlay script before </body>
        const injectScript = `<script src="/review/inject.js"></script>`;
        if (html.includes("</body>")) {
          html = html.replace("</body>", `${injectScript}\n</body>`);
        } else {
          html += injectScript;
        }
        // Update content-length
        const buf = Buffer.from(html, "utf8");
        const headers = { ...proxyRes.headers };
        headers["content-length"] = buf.length;
        delete headers["content-encoding"]; // remove gzip if present
        res.writeHead(proxyRes.statusCode, headers);
        res.end(buf);
      });
    } else {
      // Pass through non-HTML responses
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Dev server unreachable", details: err.message }));
  });

  req.pipe(proxyReq);
}

// ── Static files ──────────────────────────────────────────────────────
const SCRIPT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serveFile(filePath, res) {
  try {
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ── HTTP Server ───────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── Review UI routes ────────────────────────────────────────────
  if (pathname === "/review" || pathname === "/review/") {
    serveFile(path.join(SCRIPT_DIR, "gsd-t-design-review.html"), res);
    return;
  }

  if (pathname === "/review/inject.js") {
    serveFile(path.join(SCRIPT_DIR, "gsd-t-design-review-inject.js"), res);
    return;
  }

  // ── Review API ──────────────────────────────────────────────────
  if (pathname === "/review/api/status") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(readStatus()));
    return;
  }

  if (pathname === "/review/api/queue") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(readQueue()));
    return;
  }

  if (pathname === "/review/api/feedback" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(readFeedback()));
    return;
  }

  if (pathname === "/review/api/feedback" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const items = JSON.parse(body);
        writeFeedback(Array.isArray(items) ? items : [items]);
        broadcast("feedback-submitted", { count: Array.isArray(items) ? items.length : 1 });
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (pathname === "/review/api/write-source" && req.method === "POST") {
    // Apply CSS property changes back to source files
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { changes } = JSON.parse(body);
        // Changes are stored for the builder to process
        // (Claude will interpret CSS changes → Tailwind class changes)
        const changesFile = path.join(REVIEW_DIR, "pending-changes.json");
        fs.writeFileSync(changesFile, JSON.stringify(changes, null, 2));
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true, count: changes.length }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // ── SSE stream ──────────────────────────────────────────────────
  if (pathname === "/review/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    // Send initial state
    res.write(`event: init\ndata: ${JSON.stringify({ status: readStatus(), queue: readQueue() })}\n\n`);
    return;
  }

  // ── Proxy everything else to dev server ─────────────────────────
  proxyRequest(req, res);
});

// ── WebSocket upgrade for Vite HMR ───────────────────────────────────
server.on("upgrade", (req, socket, head) => {
  const opts = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(opts);
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
      "\r\n\r\n"
    );
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on("error", () => socket.end());
  proxyReq.end();
});

server.listen(PORT, () => {
  const BOLD = "\x1b[1m";
  const GREEN = "\x1b[32m";
  const CYAN = "\x1b[36m";
  const DIM = "\x1b[2m";
  const RESET = "\x1b[0m";

  console.log(`\n${BOLD}GSD-T Design Review Server${RESET}`);
  console.log(`${GREEN}  ✓${RESET} Review UI:  ${CYAN}http://localhost:${PORT}/review${RESET}`);
  console.log(`${GREEN}  ✓${RESET} Proxying:   ${DIM}${TARGET} → http://localhost:${PORT}/${RESET}`);
  console.log(`${GREEN}  ✓${RESET} Project:    ${DIM}${PROJECT_DIR}${RESET}`);
  console.log(`${DIM}  Coordination: ${REVIEW_DIR}${RESET}\n`);
});
