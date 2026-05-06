/**
 * Tests for scripts/gsd-t-dashboard-server.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");

const {
  parseEventLine,
  findEventsDir,
  readExistingEvents,
  startServer,
  tailEventsFile,
  readMetricsData,
  listInSessionTranscripts,
  handleMainSession,
  handleTranscriptsList,
} = require("../scripts/gsd-t-dashboard-server.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-dash-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── parseEventLine ───────────────────────────────────────────────────────────

describe("parseEventLine", () => {
  it("parses a valid JSON line", () => {
    const obj = { ts: "2026-03-04T00:00:00.000Z", event_type: "command_invoked" };
    const result = parseEventLine(JSON.stringify(obj));
    assert.deepEqual(result, obj);
  });

  it("returns null for invalid JSON", () => {
    assert.equal(parseEventLine("{not valid json"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseEventLine(""), null);
  });

  it("returns null for whitespace-only line", () => {
    assert.equal(parseEventLine("   \t  "), null);
  });

  it("returns null for null input", () => {
    assert.equal(parseEventLine(null), null);
  });

  it("trims surrounding whitespace before parsing", () => {
    const obj = { event_type: "tool_call" };
    const result = parseEventLine("  " + JSON.stringify(obj) + "\n");
    assert.deepEqual(result, obj);
  });
});

// ─── findEventsDir ────────────────────────────────────────────────────────────

describe("findEventsDir", () => {
  it("resolves .gsd-t/events relative to provided projectDir", () => {
    const dir = findEventsDir(tmpDir);
    const normalized = dir.replace(/\\/g, "/");
    assert.ok(normalized.includes(".gsd-t"), "should contain .gsd-t");
    assert.ok(normalized.endsWith("events"), "should end with events");
    assert.ok(normalized.includes(tmpDir.replace(/\\/g, "/")), "should be under projectDir");
  });

  it("falls back to process.cwd() when no argument given", () => {
    const dir = findEventsDir();
    const normalized = dir.replace(/\\/g, "/");
    const cwd = process.cwd().replace(/\\/g, "/");
    assert.ok(normalized.includes(cwd), "should be under cwd");
    assert.ok(normalized.includes("events"), "should contain events");
  });

  it("produces a path containing .gsd-t and events segments", () => {
    const dir = findEventsDir(tmpDir);
    const normalized = dir.replace(/\\/g, "/");
    assert.ok(normalized.includes(".gsd-t"), `Expected .gsd-t in: ${normalized}`);
    assert.ok(normalized.includes("events"), `Expected events in: ${normalized}`);
  });
});

// ─── readExistingEvents ───────────────────────────────────────────────────────

describe("readExistingEvents", () => {
  it("returns empty array when eventsDir does not exist", () => {
    const result = readExistingEvents(path.join(tmpDir, "no-such-dir"), 500);
    assert.deepEqual(result, []);
  });

  it("returns empty array when eventsDir is empty", () => {
    const dir = path.join(tmpDir, "empty-events");
    fs.mkdirSync(dir, { recursive: true });
    const result = readExistingEvents(dir, 500);
    assert.deepEqual(result, []);
  });

  it("reads events from a single JSONL file", () => {
    const dir = path.join(tmpDir, "single-file-events");
    fs.mkdirSync(dir, { recursive: true });
    const e1 = { ts: "2026-03-04T00:00:00.000Z", event_type: "command_invoked" };
    const e2 = { ts: "2026-03-04T00:01:00.000Z", event_type: "tool_call" };
    fs.writeFileSync(path.join(dir, "2026-03-04.jsonl"), JSON.stringify(e1) + "\n" + JSON.stringify(e2) + "\n");
    const result = readExistingEvents(dir, 500);
    assert.equal(result.length, 2);
    assert.equal(result[0].event_type, "command_invoked");
  });

  it("reads from multiple JSONL files, newest file first", () => {
    const dir = path.join(tmpDir, "multi-file-events");
    fs.mkdirSync(dir, { recursive: true });
    const eOld = { ts: "2026-03-03T00:00:00.000Z", event_type: "tool_call" };
    const eNew = { ts: "2026-03-04T00:00:00.000Z", event_type: "command_invoked" };
    fs.writeFileSync(path.join(dir, "2026-03-03.jsonl"), JSON.stringify(eOld) + "\n");
    fs.writeFileSync(path.join(dir, "2026-03-04.jsonl"), JSON.stringify(eNew) + "\n");
    const result = readExistingEvents(dir, 500);
    assert.equal(result.length, 2);
    // Newest file first: 2026-03-04 events should come first
    assert.equal(result[0].event_type, "command_invoked");
  });

  it("respects maxEvents limit", () => {
    const dir = path.join(tmpDir, "limit-events");
    fs.mkdirSync(dir, { recursive: true });
    const lines = [];
    for (let i = 0; i < 10; i++) lines.push(JSON.stringify({ ts: new Date().toISOString(), event_type: "tool_call", i }));
    fs.writeFileSync(path.join(dir, "2026-03-04.jsonl"), lines.join("\n") + "\n");
    const result = readExistingEvents(dir, 3);
    assert.equal(result.length, 3);
  });

  it("skips invalid (non-JSON) lines silently", () => {
    const dir = path.join(tmpDir, "invalid-lines-events");
    fs.mkdirSync(dir, { recursive: true });
    const content = JSON.stringify({ event_type: "tool_call" }) + "\nnot-json\n" + JSON.stringify({ event_type: "command_invoked" }) + "\n";
    fs.writeFileSync(path.join(dir, "2026-03-04.jsonl"), content);
    const result = readExistingEvents(dir, 500);
    assert.equal(result.length, 2);
  });

  it("returns empty array when eventsDir is null", () => {
    assert.deepEqual(readExistingEvents(null, 500), []);
  });
});

// ─── startServer ──────────────────────────────────────────────────────────────

describe("startServer", () => {
  it("returns an object with server and url properties", (t, done) => {
    const port = 47200;
    const eventsDir = path.join(tmpDir, "srv-test-events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const htmlPath = path.join(tmpDir, "test.html");
    fs.writeFileSync(htmlPath, "<html><body>test</body></html>");
    const { server, url } = startServer(port, eventsDir, htmlPath);
    assert.ok(server, "server should be defined");
    assert.equal(typeof url, "string", "url should be a string");
    assert.ok(url.includes(String(port)), "url should contain port");
    server.close(done);
  });

  it("server responds to GET /ping with status ok and correct port", (t, done) => {
    const port = 47201;
    const eventsDir = path.join(tmpDir, "srv-ping-events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const htmlPath = path.join(tmpDir, "test2.html");
    fs.writeFileSync(htmlPath, "<html></html>");
    const { server } = startServer(port, eventsDir, htmlPath);
    http.get(`http://localhost:${port}/ping`, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        const parsed = JSON.parse(body);
        assert.equal(parsed.status, "ok");
        assert.equal(parsed.port, port);
        server.close(done);
      });
    }).on("error", (err) => { server.close(); done(err); });
  });

  it("GET / returns 404 when html file does not exist", (t, done) => {
    const port = 47202;
    const eventsDir = path.join(tmpDir, "srv-404-events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const { server } = startServer(port, eventsDir, "/no/such/file.html");
    http.get(`http://localhost:${port}/`, (res) => {
      assert.equal(res.statusCode, 404);
      res.resume();
      res.on("end", () => server.close(done));
    }).on("error", (err) => { server.close(); done(err); });
  });

  it("GET /events responds with SSE content-type", (t, done) => {
    const port = 47203;
    const eventsDir = path.join(tmpDir, "srv-sse-events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const { server } = startServer(port, eventsDir, "/no/such/file.html");
    server.on("listening", () => {
      const req = http.get(`http://localhost:${port}/events`, (res) => {
        assert.equal(res.headers["content-type"], "text/event-stream");
        res.destroy();
        if (server.closeAllConnections) server.closeAllConnections();
        server.close(done);
      });
      req.on("error", () => { /* expected on destroy */ });
    });
  });

  it("GET / on the shipped dashboard.html exposes the Live Stream button wired to /transcripts", (t, done) => {
    const port = 47204;
    const eventsDir = path.join(tmpDir, "srv-livestream-events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const realHtml = path.join(__dirname, "..", "scripts", "gsd-t-dashboard.html");
    const { server } = startServer(port, eventsDir, realHtml);
    http.get(`http://localhost:${port}/`, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        assert.equal(res.statusCode, 200, "GET / should return 200 when html exists");
        assert.match(body, /id="livestream-btn"/, "button anchor must be present");
        assert.doesNotMatch(body, /<a[^>]*id="livestream-btn"[^>]*class="[^"]*\bdisabled\b[^"]*"/,
          "Live Stream button must NOT ship in disabled state — user contract: always enabled (2026-04-23)");
        assert.match(body, /\/transcripts/, "button JS must reference the /transcripts endpoint");
        assert.match(body, /\/transcript\/\$\{encodeURIComponent\(latest\.spawnId\)\}/, "button must navigate to /transcript/:spawnId");
        assert.match(body, /params\.get\('port'\)\s*\|\|\s*location\.port/, "PORT must default to location.port so SSE works on project-hashed ports, not hardcoded 7433");
        server.close(done);
      });
    }).on("error", (err) => { server.close(); done(err); });
  });
});

// ─── tailEventsFile ───────────────────────────────────────────────────────────

describe("tailEventsFile", () => {
  it("invokes callback for each new line appended to file", () => {
    return new Promise((resolve, reject) => {
      const filePath = path.join(tmpDir, "tail-test.jsonl");
      fs.writeFileSync(filePath, "");
      const received = [];
      const unwatch = tailEventsFile(filePath, (obj) => {
        received.push(obj);
        if (received.length >= 2) {
          unwatch();
          try {
            assert.equal(received[0].event_type, "command_invoked");
            assert.equal(received[1].event_type, "tool_call");
            resolve();
          } catch (err) { reject(err); }
        }
      });
      setTimeout(() => {
        const e1 = { ts: new Date().toISOString(), event_type: "command_invoked" };
        const e2 = { ts: new Date().toISOString(), event_type: "tool_call" };
        fs.appendFileSync(filePath, JSON.stringify(e1) + "\n" + JSON.stringify(e2) + "\n");
      }, 100);
    });
  });

  it("does not invoke callback for invalid JSON lines", () => {
    return new Promise((resolve, reject) => {
      const filePath = path.join(tmpDir, "tail-invalid.jsonl");
      fs.writeFileSync(filePath, "");
      const received = [];
      const unwatch = tailEventsFile(filePath, (obj) => { received.push(obj); });
      setTimeout(() => {
        fs.appendFileSync(filePath, "not-valid-json\n");
        setTimeout(() => {
          unwatch();
          try { assert.equal(received.length, 0); resolve(); } catch (err) { reject(err); }
        }, 700);
      }, 100);
    });
  });

  it("returns an unwatch function that stops watching", () => {
    return new Promise((resolve, reject) => {
      const filePath = path.join(tmpDir, "tail-unwatch.jsonl");
      fs.writeFileSync(filePath, "");
      const received = [];
      const unwatch = tailEventsFile(filePath, (obj) => { received.push(obj); });
      unwatch();
      setTimeout(() => {
        fs.appendFileSync(filePath, JSON.stringify({ event_type: "tool_call" }) + "\n");
        setTimeout(() => {
          try { assert.equal(received.length, 0); resolve(); } catch (err) { reject(err); }
        }, 700);
      }, 50);
    });
  });
});

// ─── readMetricsData ─────────────────────────────────────────────────────────

describe("readMetricsData", () => {
  it("returns empty arrays when metrics directory does not exist", () => {
    const result = readMetricsData(path.join(tmpDir, "no-such-metrics"));
    assert.deepEqual(result, { taskMetrics: [], rollups: [] });
  });

  it("returns empty arrays when metrics files do not exist", () => {
    const metricsDir = path.join(tmpDir, "empty-metrics");
    fs.mkdirSync(metricsDir, { recursive: true });
    const result = readMetricsData(metricsDir);
    assert.deepEqual(result, { taskMetrics: [], rollups: [] });
  });

  it("reads task-metrics.jsonl into taskMetrics array", () => {
    const metricsDir = path.join(tmpDir, "has-task-metrics");
    fs.mkdirSync(metricsDir, { recursive: true });
    const record = { ts: "2026-03-23T00:00:00.000Z", milestone: "M25", domain: "d1", task: "t1", signal_type: "pass-through" };
    fs.writeFileSync(path.join(metricsDir, "task-metrics.jsonl"), JSON.stringify(record) + "\n");
    const result = readMetricsData(metricsDir);
    assert.equal(result.taskMetrics.length, 1);
    assert.equal(result.taskMetrics[0].milestone, "M25");
    assert.deepEqual(result.rollups, []);
  });

  it("reads rollup.jsonl into rollups array", () => {
    const metricsDir = path.join(tmpDir, "has-rollups");
    fs.mkdirSync(metricsDir, { recursive: true });
    const rollup = { ts: "2026-03-23T00:00:00.000Z", milestone: "M25", elo_after: 1016 };
    fs.writeFileSync(path.join(metricsDir, "rollup.jsonl"), JSON.stringify(rollup) + "\n");
    const result = readMetricsData(metricsDir);
    assert.deepEqual(result.taskMetrics, []);
    assert.equal(result.rollups.length, 1);
    assert.equal(result.rollups[0].elo_after, 1016);
  });

  it("reads both files when both exist", () => {
    const metricsDir = path.join(tmpDir, "has-both");
    fs.mkdirSync(metricsDir, { recursive: true });
    const task = { ts: "2026-03-23T00:00:00.000Z", milestone: "M25", signal_type: "pass-through" };
    const rollup = { ts: "2026-03-23T00:00:00.000Z", milestone: "M25", elo_after: 1016 };
    fs.writeFileSync(path.join(metricsDir, "task-metrics.jsonl"), JSON.stringify(task) + "\n");
    fs.writeFileSync(path.join(metricsDir, "rollup.jsonl"), JSON.stringify(rollup) + "\n");
    const result = readMetricsData(metricsDir);
    assert.equal(result.taskMetrics.length, 1);
    assert.equal(result.rollups.length, 1);
  });

  it("skips invalid JSON lines in metrics files", () => {
    const metricsDir = path.join(tmpDir, "invalid-metrics");
    fs.mkdirSync(metricsDir, { recursive: true });
    const valid = { ts: "2026-03-23T00:00:00.000Z", milestone: "M25" };
    fs.writeFileSync(path.join(metricsDir, "task-metrics.jsonl"), JSON.stringify(valid) + "\nnot-json\n");
    const result = readMetricsData(metricsDir);
    assert.equal(result.taskMetrics.length, 1);
  });
});

// ─── GET /metrics endpoint ───────────────────────────────────────────────────

describe("GET /metrics endpoint", () => {
  it("returns JSON with taskMetrics and rollups arrays", (t, done) => {
    const port = 47210;
    // Build a self-contained project structure so startServer resolves metricsDir correctly
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-metricsep-"));
    const eventsDir = path.join(projRoot, ".gsd-t", "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const metricsDir = path.join(projRoot, ".gsd-t", "metrics");
    fs.mkdirSync(metricsDir, { recursive: true });
    const task = { ts: "2026-03-23T00:00:00.000Z", milestone: "M25", signal_type: "pass-through" };
    fs.writeFileSync(path.join(metricsDir, "task-metrics.jsonl"), JSON.stringify(task) + "\n");
    const htmlPath = path.join(projRoot, "test.html");
    fs.writeFileSync(htmlPath, "<html></html>");
    const { server } = startServer(port, eventsDir, htmlPath);
    http.get(`http://localhost:${port}/metrics`, (res) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-type"], "application/json");
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        const parsed = JSON.parse(body);
        assert.ok(Array.isArray(parsed.taskMetrics), "taskMetrics should be an array");
        assert.ok(Array.isArray(parsed.rollups), "rollups should be an array");
        assert.ok(parsed.taskMetrics.length >= 1, "should have at least 1 task metric");
        server.close(() => { fs.rmSync(projRoot, { recursive: true, force: true }); done(); });
      });
    }).on("error", (err) => { server.close(); done(err); });
  });

  it("returns empty arrays when no metrics files exist", (t, done) => {
    const port = 47215;
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-nometricsep-"));
    const eventsDir = path.join(projRoot, ".gsd-t", "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const htmlPath = path.join(projRoot, "test.html");
    fs.writeFileSync(htmlPath, "<html></html>");
    const { server } = startServer(port, eventsDir, htmlPath);
    http.get(`http://localhost:${port}/metrics`, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        const parsed = JSON.parse(body);
        assert.deepEqual(parsed.taskMetrics, []);
        assert.deepEqual(parsed.rollups, []);
        server.close(() => { fs.rmSync(projRoot, { recursive: true, force: true }); done(); });
      });
    }).on("error", (err) => { server.close(); done(err); });
  });
});

// ─── In-Session Transcripts Filesystem Fallback (v3.20.13) ──────────────────

describe("listInSessionTranscripts — filesystem fallback for in-session NDJSONs", () => {
  it("returns empty array when transcripts dir doesn't exist", () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-insess-empty-"));
    try {
      const found = listInSessionTranscripts(projRoot);
      assert.deepEqual(found, []);
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("returns empty array when transcripts dir is empty", () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-insess-emptydir-"));
    try {
      fs.mkdirSync(path.join(projRoot, ".gsd-t", "transcripts"), { recursive: true });
      const found = listInSessionTranscripts(projRoot);
      assert.deepEqual(found, []);
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("finds in-session-*.ndjson files and returns spawn-shaped entries", () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-insess-find-"));
    try {
      const tdir = path.join(projRoot, ".gsd-t", "transcripts");
      fs.mkdirSync(tdir, { recursive: true });
      fs.writeFileSync(path.join(tdir, "in-session-abc-123.ndjson"), '{"type":"user_turn"}\n');
      fs.writeFileSync(path.join(tdir, "in-session-def-456.ndjson"), '{"type":"assistant_turn"}\n');
      const found = listInSessionTranscripts(projRoot);
      assert.equal(found.length, 2);
      const ids = found.map((e) => e.spawnId).sort();
      assert.deepEqual(ids, ["in-session-abc-123", "in-session-def-456"]);
      // Each entry must have the in-session-prefixed spawnId so the viewer's
      // left-rail isInSession check applies the `💬 conversation` label.
      for (const e of found) {
        assert.ok(e.spawnId.startsWith("in-session-"));
        assert.equal(e.kind, "in-session");
        assert.ok(e.startedAt);
        assert.ok(e.lastUpdatedAt);
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("ignores non-in-session files in transcripts dir", () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-insess-mixed-"));
    try {
      const tdir = path.join(projRoot, ".gsd-t", "transcripts");
      fs.mkdirSync(tdir, { recursive: true });
      fs.writeFileSync(path.join(tdir, "in-session-real.ndjson"), "{}\n");
      fs.writeFileSync(path.join(tdir, "other-spawn.ndjson"), "{}\n"); // detached spawn — owned by index
      fs.writeFileSync(path.join(tdir, ".index.json"), '{"spawns":[]}');
      fs.writeFileSync(path.join(tdir, "readme.md"), "");
      const found = listInSessionTranscripts(projRoot);
      assert.equal(found.length, 1);
      assert.equal(found[0].spawnId, "in-session-real");
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("rejects malformed in-session-*.ndjson filenames (path-traversal guard)", () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-insess-malformed-"));
    try {
      const tdir = path.join(projRoot, ".gsd-t", "transcripts");
      fs.mkdirSync(tdir, { recursive: true });
      // Valid id chars are [a-zA-Z0-9._-] per isValidSpawnId.
      // Filenames with other chars must be skipped.
      fs.writeFileSync(path.join(tdir, "in-session-ok.ndjson"), "{}\n");
      // Files containing a space won't pass isValidSpawnId after filename slice.
      // Note: writing a literal "/" in the name would create a subdir, so we
      // can't test that here — but isValidSpawnId rejects "/" as well.
      fs.writeFileSync(path.join(tdir, "in-session-bad name.ndjson"), "{}\n");
      const found = listInSessionTranscripts(projRoot);
      assert.equal(found.length, 1);
      assert.equal(found[0].spawnId, "in-session-ok");
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });
});

// ─── M47 D2 — listInSessionTranscripts status field (T4) ──────────────────────

describe("listInSessionTranscripts — status field (M47 D2)", () => {
  function mkProject() {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-status-"));
    const tdir = path.join(projRoot, ".gsd-t", "transcripts");
    fs.mkdirSync(tdir, { recursive: true });
    return { projRoot, tdir };
  }

  it("file with mtime now → status 'active'", () => {
    const { projRoot, tdir } = mkProject();
    try {
      fs.writeFileSync(path.join(tdir, "in-session-fresh.ndjson"), "{}\n");
      const out = listInSessionTranscripts(projRoot);
      assert.equal(out.length, 1);
      assert.equal(out[0].status, "active");
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("file with mtime older than 30s → status 'completed'", () => {
    const { projRoot, tdir } = mkProject();
    try {
      const fp = path.join(tdir, "in-session-old.ndjson");
      fs.writeFileSync(fp, "{}\n");
      // Backdate to 60s ago — well outside the 30s active window.
      const past = (Date.now() - 60_000) / 1000;
      fs.utimesSync(fp, past, past);
      const out = listInSessionTranscripts(projRoot);
      assert.equal(out.length, 1);
      assert.equal(out[0].status, "completed");
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("boundary at exactly 30s — accepts either active or completed", () => {
    const { projRoot, tdir } = mkProject();
    try {
      const fp = path.join(tdir, "in-session-boundary.ndjson");
      fs.writeFileSync(fp, "{}\n");
      // mtime exactly 30s ago — boundary semantics intentionally fuzzy.
      const at = (Date.now() - 30_000) / 1000;
      fs.utimesSync(fp, at, at);
      const out = listInSessionTranscripts(projRoot);
      assert.equal(out.length, 1);
      assert.ok(out[0].status === "active" || out[0].status === "completed",
        `boundary status must be 'active' or 'completed', got: ${out[0].status}`);
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("handleTranscriptsList JSON response includes status on in-session entries", async () => {
    const { projRoot, tdir } = mkProject();
    try {
      fs.writeFileSync(path.join(tdir, "in-session-active.ndjson"), "{}\n");
      const oldfp = path.join(tdir, "in-session-stale.ndjson");
      fs.writeFileSync(oldfp, "{}\n");
      const past = (Date.now() - 60_000) / 1000;
      fs.utimesSync(oldfp, past, past);
      const eventsDir = path.join(projRoot, ".gsd-t", "events");
      fs.mkdirSync(eventsDir, { recursive: true });
      const htmlPath = path.join(projRoot, "dashboard.html");
      const tHtmlPath = path.join(projRoot, "transcript.html");
      fs.writeFileSync(htmlPath, "<html></html>");
      fs.writeFileSync(tHtmlPath, '<html data-spawn-id="__SPAWN_ID__"></html>');
      const { server } = startServer(0, eventsDir, htmlPath, projRoot, tHtmlPath);
      try {
        const port = server.address().port;
        const data = await new Promise((resolve, reject) => {
          http.get(`http://localhost:${port}/transcripts`, (res) => {
            let body = ""; res.on("data", (c) => body += c);
            res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
          }).on("error", reject);
        });
        assert.ok(Array.isArray(data.spawns));
        const active = data.spawns.find((s) => s.spawnId === "in-session-active");
        const stale = data.spawns.find((s) => s.spawnId === "in-session-stale");
        assert.ok(active, "active entry present");
        assert.ok(stale, "stale entry present");
        assert.equal(active.status, "active");
        assert.equal(stale.status, "completed");
      } finally {
        await new Promise((r) => server.close(r));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });
});

// ─── M47 D2 — GET /api/main-session (T5) ──────────────────────────────────────

describe("GET /api/main-session (M47 D2)", () => {
  function startTestServer(projRoot) {
    const eventsDir = path.join(projRoot, ".gsd-t", "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    fs.mkdirSync(path.join(projRoot, ".gsd-t", "transcripts"), { recursive: true });
    const htmlPath = path.join(projRoot, "dashboard.html");
    const tHtmlPath = path.join(projRoot, "transcript.html");
    fs.writeFileSync(htmlPath, "<html></html>");
    fs.writeFileSync(tHtmlPath, '<html data-spawn-id="__SPAWN_ID__"></html>');
    return startServer(0, eventsDir, htmlPath, projRoot, tHtmlPath);
  }

  function getJSON(port, path) {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}${path}`, (res) => {
        let body = ""; res.on("data", (c) => body += c);
        res.on("end", () => {
          try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) }); }
          catch (e) { reject(e); }
        });
      }).on("error", reject);
    });
  }

  it("empty transcripts dir → { filename: null, sessionId: null, mtimeMs: null } HTTP 200", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-mainses-empty-"));
    try {
      const { server } = startTestServer(projRoot);
      try {
        const port = server.address().port;
        const r = await getJSON(port, "/api/main-session");
        assert.equal(r.status, 200);
        assert.equal(r.body.filename, null);
        assert.equal(r.body.sessionId, null);
        assert.equal(r.body.mtimeMs, null);
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("single in-session-abc.ndjson → returns that file with sessionId 'abc'", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-mainses-one-"));
    try {
      const { server } = startTestServer(projRoot);
      try {
        const port = server.address().port;
        const fp = path.join(projRoot, ".gsd-t", "transcripts", "in-session-abc.ndjson");
        fs.writeFileSync(fp, "{}\n");
        const expectedMtime = fs.statSync(fp).mtimeMs;
        const r = await getJSON(port, "/api/main-session");
        assert.equal(r.status, 200);
        assert.equal(r.body.filename, "in-session-abc.ndjson");
        assert.equal(r.body.sessionId, "abc");
        assert.equal(r.body.mtimeMs, expectedMtime);
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("two files, second written later → returns the newer file", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-mainses-two-"));
    try {
      const { server } = startTestServer(projRoot);
      try {
        const port = server.address().port;
        const tdir = path.join(projRoot, ".gsd-t", "transcripts");
        const oldFp = path.join(tdir, "in-session-old.ndjson");
        const newFp = path.join(tdir, "in-session-new.ndjson");
        fs.writeFileSync(oldFp, "{}\n");
        fs.writeFileSync(newFp, "{}\n");
        // Bump newFp to a clearly-later mtime.
        const past = (Date.now() - 60_000) / 1000;
        const future = (Date.now() + 1_000) / 1000;
        fs.utimesSync(oldFp, past, past);
        fs.utimesSync(newFp, future, future);
        const r = await getJSON(port, "/api/main-session");
        assert.equal(r.body.filename, "in-session-new.ndjson");
        assert.equal(r.body.sessionId, "new");
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("malformed filename (space) is filtered out by isValidSpawnId", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-mainses-bad-"));
    try {
      const { server } = startTestServer(projRoot);
      try {
        const port = server.address().port;
        const tdir = path.join(projRoot, ".gsd-t", "transcripts");
        // Filename with a space — fails isValidSpawnId after slice.
        fs.writeFileSync(path.join(tdir, "in-session-bad name.ndjson"), "{}\n");
        const r = await getJSON(port, "/api/main-session");
        assert.equal(r.body.filename, null);
        assert.equal(r.body.sessionId, null);
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("response includes Cache-Control: no-store header", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-mainses-cache-"));
    try {
      const { server } = startTestServer(projRoot);
      try {
        const port = server.address().port;
        const r = await getJSON(port, "/api/main-session");
        assert.equal(r.headers["cache-control"], "no-store");
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });
});

// ─── M47 D1 — viewer HTML structural markers (T7) ─────────────────────────────

describe("M47 D1 viewer HTML structural markers", () => {
  function startWithRealHtml(projRoot) {
    const eventsDir = path.join(projRoot, ".gsd-t", "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    fs.mkdirSync(path.join(projRoot, ".gsd-t", "transcripts"), { recursive: true });
    const htmlPath = path.join(projRoot, "dashboard.html");
    fs.writeFileSync(htmlPath, "<html></html>");
    // Use the real shipped viewer HTML so structural markers are exercised.
    const tHtmlPath = path.join(__dirname, "..", "scripts", "gsd-t-transcript.html");
    return startServer(0, eventsDir, htmlPath, projRoot, tHtmlPath);
  }

  function getText(port, urlPath, headers) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "localhost", port, path: urlPath, method: "GET", headers: headers || {} }, (res) => {
        let body = ""; res.on("data", (c) => body += c);
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on("error", reject);
      req.end();
    });
  }

  it("GET /transcript/:spawnId returns HTML with all M47 structural markers", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-t7-page-"));
    try {
      const { server } = startWithRealHtml(projRoot);
      try {
        const port = server.address().port;
        const r = await getText(port, "/transcript/some-spawn");
        assert.equal(r.status, 200);
        // Required structural markers per M47 acceptance criteria.
        assert.match(r.body, /data-rail-section="main"/, "missing main rail section marker");
        assert.match(r.body, /data-rail-section="live"/, "missing live rail section marker");
        assert.match(r.body, /data-rail-section="completed"/, "missing completed rail section marker");
        assert.match(r.body, /role="separator"/, "missing splitter role=separator");
        assert.match(r.body, /id="main-stream"/, "missing main-stream id");
        assert.match(r.body, /id="spawn-stream"/, "missing spawn-stream id");
        assert.match(r.body, /id="splitter"/, "missing splitter id");
        // Server-side spawn-id substitution still works.
        assert.match(r.body, /data-spawn-id="some-spawn"/, "missing data-spawn-id substitution");
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("GET /transcripts (Accept: text/html) returns viewer with empty data-spawn-id", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-t7-list-"));
    try {
      const { server } = startWithRealHtml(projRoot);
      try {
        const port = server.address().port;
        const r = await getText(port, "/transcripts", { Accept: "text/html" });
        assert.equal(r.status, 200);
        assert.match(r.body, /data-spawn-id=""/, "back-compat shim should emit empty data-spawn-id for /transcripts HTML branch");
        // M47 markers also present in this HTML branch.
        assert.match(r.body, /data-rail-section="main"/);
        assert.match(r.body, /id="main-stream"/);
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("HTML source contains all four sessionStorage keys", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-t7-keys-"));
    try {
      const { server } = startWithRealHtml(projRoot);
      try {
        const port = server.address().port;
        const r = await getText(port, "/transcript/x");
        assert.match(r.body, /gsd-t\.viewer\.selectedSpawnId/);
        assert.match(r.body, /gsd-t\.viewer\.splitterPct/);
        assert.match(r.body, /gsd-t\.viewer\.completedExpanded/);
        assert.match(r.body, /gsd-t\.viewer\.rightRailCollapsed/);
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });

  it("CSS rule for collapsed completed section is present in the source", async () => {
    const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m47-t7-css-"));
    try {
      const { server } = startWithRealHtml(projRoot);
      try {
        const port = server.address().port;
        const r = await getText(port, "/transcript/x");
        // Either form of the toggle CSS rule satisfies the contract — the
        // declaration must hide .rail-body when [data-expanded="false"].
        assert.match(r.body,
          /rail-completed\[data-expanded="false"\]\s+\.rail-body\s*\{[^}]*display:\s*none/i,
          "missing CSS rule that hides .rail-body when completed section is collapsed");
      } finally {
        await new Promise((res) => server.close(res));
      }
    } finally {
      fs.rmSync(projRoot, { recursive: true, force: true });
    }
  });
});
