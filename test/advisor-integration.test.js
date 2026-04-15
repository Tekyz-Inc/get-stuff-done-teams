/**
 * Tests for bin/advisor-integration.js
 * Uses Node.js built-in test runner (node --test)
 *
 * v1.0.0 (M35 T3): convention-based /advisor fallback. There is no programmable
 * API path to test yet (see .gsd-t/M35-advisor-findings.md) — all tests exercise
 * the fallback path and its graceful degradation behavior.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  invokeAdvisor,
  logMissedEscalation,
  TOKEN_LOG_RELATIVE,
} = require("../bin/advisor-integration.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-advisor-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function freshProject() {
  const dir = fs.mkdtempSync(path.join(tmpDir, "proj-"));
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".gsd-t", "token-log.md"), "# Token Log\n", "utf8");
  return dir;
}

describe("invokeAdvisor — fallback path (no programmable API)", () => {
  it("returns available: false always", () => {
    const dir = freshProject();
    const r = invokeAdvisor({ question: "Should I use opus here?", projectDir: dir });
    assert.equal(r.available, false);
  });

  it("returns guidance: null always", () => {
    const dir = freshProject();
    const r = invokeAdvisor({ question: "Should I use opus here?", projectDir: dir });
    assert.equal(r.guidance, null);
  });

  it("returns loggedMiss: true when the log is writable", () => {
    const dir = freshProject();
    const r = invokeAdvisor({ question: "test", projectDir: dir });
    assert.equal(r.loggedMiss, true);
  });

  it("actually appends a missed_escalation comment line", () => {
    const dir = freshProject();
    invokeAdvisor({ question: "Should we escalate?", projectDir: dir });
    const contents = fs.readFileSync(path.join(dir, TOKEN_LOG_RELATIVE), "utf8");
    assert.match(contents, /missed_escalation/);
    assert.match(contents, /q="Should we escalate\?"/);
  });

  it("includes phase/domain/task from context when provided", () => {
    const dir = freshProject();
    invokeAdvisor({
      question: "test",
      context: { phase: "execute", domain: "token-telemetry", task: "T3" },
      projectDir: dir,
    });
    const contents = fs.readFileSync(path.join(dir, TOKEN_LOG_RELATIVE), "utf8");
    assert.match(contents, /phase=execute/);
    assert.match(contents, /domain=token-telemetry/);
    assert.match(contents, /task=T3/);
  });

  it("handles missing question gracefully", () => {
    const dir = freshProject();
    const r = invokeAdvisor({ projectDir: dir });
    assert.equal(r.available, false);
    assert.equal(r.loggedMiss, true);
    const contents = fs.readFileSync(path.join(dir, TOKEN_LOG_RELATIVE), "utf8");
    assert.match(contents, /no question provided/);
  });

  it("handles missing .gsd-t directory by returning loggedMiss: false (no throw)", () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, "barren-"));
    const r = invokeAdvisor({ question: "test", projectDir: dir });
    assert.equal(r.available, false);
    assert.equal(r.loggedMiss, false);
  });

  it("handles undefined projectDir by falling back to cwd without throwing", () => {
    const r = invokeAdvisor({ question: "test" });
    assert.equal(r.available, false);
    // loggedMiss depends on whether cwd has .gsd-t — don't assert either way.
    assert.ok(typeof r.loggedMiss === "boolean");
  });

  it("handles missing args entirely without throwing", () => {
    const r = invokeAdvisor();
    assert.equal(r.available, false);
    assert.equal(r.guidance, null);
  });

  it("sanitizes multi-line questions into one line", () => {
    const dir = freshProject();
    invokeAdvisor({
      question: "Line one\nLine two\nLine three",
      projectDir: dir,
    });
    const contents = fs.readFileSync(path.join(dir, TOKEN_LOG_RELATIVE), "utf8");
    // The record must be a single line (no embedded newlines in the question)
    const lines = contents.split("\n").filter(l => l.includes("missed_escalation"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /Line one Line two Line three/);
  });

  it("truncates absurdly long questions to stay within the log budget", () => {
    const dir = freshProject();
    const longQ = "x".repeat(2000);
    invokeAdvisor({ question: longQ, projectDir: dir });
    const contents = fs.readFileSync(path.join(dir, TOKEN_LOG_RELATIVE), "utf8");
    const record = contents.split("\n").find(l => l.includes("missed_escalation"));
    assert.ok(record);
    // Extract the q="..." portion and check length
    const m = record.match(/q="([^"]*)"/);
    assert.ok(m);
    assert.ok(m[1].length <= 500, `expected q length ≤ 500, got ${m[1].length}`);
  });

  it("multiple invocations append multiple records (append-only)", () => {
    const dir = freshProject();
    invokeAdvisor({ question: "first", projectDir: dir });
    invokeAdvisor({ question: "second", projectDir: dir });
    invokeAdvisor({ question: "third", projectDir: dir });
    const contents = fs.readFileSync(path.join(dir, TOKEN_LOG_RELATIVE), "utf8");
    const records = contents.split("\n").filter(l => l.includes("missed_escalation"));
    assert.equal(records.length, 3);
  });
});

describe("logMissedEscalation — direct API", () => {
  it("returns false when .gsd-t directory does not exist", () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, "nogsdt-"));
    const result = logMissedEscalation(dir, "test", {});
    assert.equal(result, false);
  });

  it("returns true and writes record when directory exists", () => {
    const dir = freshProject();
    const result = logMissedEscalation(dir, "test question", { phase: "qa" });
    assert.equal(result, true);
    const contents = fs.readFileSync(path.join(dir, TOKEN_LOG_RELATIVE), "utf8");
    assert.match(contents, /phase=qa/);
  });
});
