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
