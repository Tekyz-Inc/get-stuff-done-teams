/**
 * Tests for scripts/gsd-t-event-writer.js and heartbeat event stream enrichment
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const {
  validateEvent,
  resolveEventsFile,
  appendEvent,
} = require("../scripts/gsd-t-event-writer.js");

const {
  buildEventStreamEntry,
  appendToEventsFile,
} = require("../scripts/gsd-t-heartbeat.js");

const EVENT_WRITER = path.join(__dirname, "..", "scripts", "gsd-t-event-writer.js");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-events-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── validateEvent ────────────────────────────────────────────────────────────

describe("validateEvent", () => {
  it("returns null for a valid event", () => {
    const event = {
      ts: new Date().toISOString(),
      event_type: "command_invoked",
      command: "gsd-t-execute",
      phase: null,
      agent_id: null,
      parent_agent_id: null,
      trace_id: null,
      reasoning: null,
      outcome: null,
    };
    assert.equal(validateEvent(event), null);
  });

  it("accepts all valid event_type values", () => {
    const types = [
      "command_invoked", "phase_transition", "subagent_spawn",
      "subagent_complete", "tool_call", "experience_retrieval",
      "outcome_tagged", "distillation",
    ];
    for (const t of types) {
      const err = validateEvent({ event_type: t, outcome: null });
      assert.equal(err, null, `Expected null for event_type: ${t}`);
    }
  });

  it("rejects missing event_type", () => {
    const err = validateEvent({ outcome: null });
    assert.ok(err, "Expected an error for missing event_type");
    assert.ok(err.includes("event_type") || err.includes("--type"), err);
  });

  it("rejects invalid event_type", () => {
    const err = validateEvent({ event_type: "bogus_type", outcome: null });
    assert.ok(err, "Expected an error for invalid event_type");
    assert.ok(err.includes("bogus_type"), err);
  });

  it("accepts all valid outcome values", () => {
    const outcomes = ["success", "failure", "learning", "deferred", null];
    for (const o of outcomes) {
      const err = validateEvent({ event_type: "command_invoked", outcome: o });
      assert.equal(err, null, `Expected null for outcome: ${o}`);
    }
  });

  it("rejects invalid outcome value", () => {
    const err = validateEvent({ event_type: "command_invoked", outcome: "unknown" });
    assert.ok(err, "Expected an error for invalid outcome");
    assert.ok(err.includes("outcome") || err.includes("unknown"), err);
  });

  it("returns error for non-object input", () => {
    const err = validateEvent(null);
    assert.ok(err, "Expected an error for null input");
  });
});

// ─── resolveEventsFile ────────────────────────────────────────────────────────

describe("resolveEventsFile", () => {
  it("returns path inside .gsd-t/events/ with YYYY-MM-DD.jsonl filename", () => {
    const result = resolveEventsFile("/some/project");
    assert.ok(result.includes(".gsd-t"), `Expected .gsd-t in path: ${result}`);
    assert.ok(result.includes("events"), `Expected events in path: ${result}`);
    assert.ok(result.endsWith(".jsonl"), `Expected .jsonl extension: ${result}`);
    // Filename matches YYYY-MM-DD.jsonl
    assert.match(path.basename(result), /^\d{4}-\d{2}-\d{2}\.jsonl$/);
  });

  it("uses UTC date for filename", () => {
    const result = resolveEventsFile(tmpDir);
    const dateFromFile = path.basename(result, ".jsonl");
    const utcDate = new Date().toISOString().slice(0, 10);
    assert.equal(dateFromFile, utcDate);
  });
});

// ─── appendEvent ──────────────────────────────────────────────────────────────

describe("appendEvent", () => {
  it("creates events directory if missing and writes event", () => {
    const projectDir = path.join(tmpDir, "proj1");
    fs.mkdirSync(path.join(projectDir, ".gsd-t"), { recursive: true });
    const filePath = resolveEventsFile(projectDir);
    const event = {
      ts: new Date().toISOString(),
      event_type: "command_invoked",
      command: "test",
      phase: null,
      agent_id: null,
      parent_agent_id: null,
      trace_id: null,
      reasoning: null,
      outcome: null,
    };
    const code = appendEvent(filePath, event);
    assert.equal(code, 0);
    assert.ok(fs.existsSync(filePath));
    const line = fs.readFileSync(filePath, "utf8").trim();
    const parsed = JSON.parse(line);
    assert.equal(parsed.event_type, "command_invoked");
  });

  it("appends multiple events as separate JSON lines", () => {
    const projectDir = path.join(tmpDir, "proj2");
    fs.mkdirSync(path.join(projectDir, ".gsd-t"), { recursive: true });
    const filePath = resolveEventsFile(projectDir);
    const event1 = { ts: new Date().toISOString(), event_type: "command_invoked", command: "a", phase: null, agent_id: null, parent_agent_id: null, trace_id: null, reasoning: null, outcome: null };
    const event2 = { ts: new Date().toISOString(), event_type: "tool_call", command: null, phase: null, agent_id: null, parent_agent_id: null, trace_id: null, reasoning: "Read", outcome: null };
    appendEvent(filePath, event1);
    appendEvent(filePath, event2);
    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).event_type, "command_invoked");
    assert.equal(JSON.parse(lines[1]).event_type, "tool_call");
  });

  it("returns 2 when target is a symlink", () => {
    const projectDir = path.join(tmpDir, "proj-symlink");
    const eventsDir = path.join(projectDir, ".gsd-t", "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const filePath = resolveEventsFile(projectDir);
    const realFile = filePath + ".real";
    fs.writeFileSync(realFile, "");
    // On Windows, symlink creation may require elevated privileges; skip if it fails
    try {
      fs.symlinkSync(realFile, filePath);
    } catch {
      return; // Skip symlink test on systems where it's not permitted
    }
    const code = appendEvent(filePath, { event_type: "command_invoked", outcome: null });
    assert.equal(code, 2);
  });
});

// ─── CLI integration ──────────────────────────────────────────────────────────

describe("event-writer CLI", () => {
  it("exits 0 with valid arguments", () => {
    const projectDir = path.join(tmpDir, "cli-test-1");
    fs.mkdirSync(path.join(projectDir, ".gsd-t"), { recursive: true });
    const result = execFileSync(process.execPath, [
      EVENT_WRITER,
      "--type", "command_invoked",
      "--command", "gsd-t-execute",
    ], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, GSD_T_PROJECT_DIR: projectDir },
    });
    assert.equal(typeof result, "string");
  });

  it("exits 1 with invalid event_type", () => {
    assert.throws(
      () => execFileSync(process.execPath, [EVENT_WRITER, "--type", "invalid_type"], {
        encoding: "utf8",
        timeout: 10000,
      }),
      (err) => err.status === 1
    );
  });

  it("exits 1 with missing --type flag", () => {
    assert.throws(
      () => execFileSync(process.execPath, [EVENT_WRITER, "--command", "gsd-t-wave"], {
        encoding: "utf8",
        timeout: 10000,
      }),
      (err) => err.status === 1
    );
  });

  it("writes event file with all provided flags", () => {
    const projectDir = path.join(tmpDir, "cli-test-2");
    fs.mkdirSync(path.join(projectDir, ".gsd-t"), { recursive: true });
    execFileSync(process.execPath, [
      EVENT_WRITER,
      "--type", "phase_transition",
      "--command", "gsd-t-wave",
      "--phase", "execute",
      "--reasoning", "Execute complete",
      "--outcome", "success",
      "--agent-id", "session123",
      "--parent-id", "null",
      "--trace-id", "trace456",
    ], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, GSD_T_PROJECT_DIR: projectDir },
    });
    const eventsDir = path.join(projectDir, ".gsd-t", "events");
    assert.ok(fs.existsSync(eventsDir));
    const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".jsonl"));
    assert.equal(files.length, 1);
    const line = fs.readFileSync(path.join(eventsDir, files[0]), "utf8").trim();
    const parsed = JSON.parse(line);
    assert.equal(parsed.event_type, "phase_transition");
    assert.equal(parsed.command, "gsd-t-wave");
    assert.equal(parsed.phase, "execute");
    assert.equal(parsed.outcome, "success");
    assert.equal(parsed.agent_id, "session123");
    assert.equal(parsed.trace_id, "trace456");
  });
});

// ─── buildEventStreamEntry ────────────────────────────────────────────────────

describe("buildEventStreamEntry", () => {
  it("returns subagent_spawn for SubagentStart", () => {
    const hook = {
      hook_event_name: "SubagentStart",
      agent_id: "child-abc",
      parent_agent_id: "parent-xyz",
      session_id: "session-001",
      agent_type: "general-purpose",
    };
    const entry = buildEventStreamEntry(hook);
    assert.ok(entry, "Expected non-null entry");
    assert.equal(entry.event_type, "subagent_spawn");
    assert.equal(entry.agent_id, "child-abc");
    assert.equal(entry.parent_agent_id, "parent-xyz");
    assert.equal(entry.reasoning, "general-purpose");
    assert.equal(entry.outcome, null);
  });

  it("uses session_id as parent when parent_agent_id absent (SubagentStart)", () => {
    const hook = {
      hook_event_name: "SubagentStart",
      agent_id: "child-abc",
      session_id: "session-001",
    };
    const entry = buildEventStreamEntry(hook);
    assert.equal(entry.parent_agent_id, "session-001");
  });

  it("returns subagent_complete for SubagentStop", () => {
    const hook = {
      hook_event_name: "SubagentStop",
      agent_id: "child-abc",
      parent_agent_id: "parent-xyz",
      session_id: "session-001",
    };
    const entry = buildEventStreamEntry(hook);
    assert.ok(entry, "Expected non-null entry");
    assert.equal(entry.event_type, "subagent_complete");
    assert.equal(entry.agent_id, "child-abc");
    assert.equal(entry.outcome, null);
  });

  it("returns tool_call for PostToolUse", () => {
    const hook = {
      hook_event_name: "PostToolUse",
      agent_id: "agent-abc",
      tool_name: "Bash",
    };
    const entry = buildEventStreamEntry(hook);
    assert.ok(entry, "Expected non-null entry");
    assert.equal(entry.event_type, "tool_call");
    assert.equal(entry.agent_id, "agent-abc");
    assert.equal(entry.reasoning, "Bash");
    assert.equal(entry.outcome, null);
  });

  it("returns session_start for SessionStart", () => {
    const hook = { hook_event_name: "SessionStart", session_id: "s1", model: "claude-sonnet-4-6" };
    const entry = buildEventStreamEntry(hook);
    assert.ok(entry, "Expected non-null entry");
    assert.equal(entry.event_type, "session_start");
    assert.equal(entry.agent_id, "s1");
    assert.equal(entry.parent_agent_id, null);
    assert.equal(entry.reasoning, "claude-sonnet-4-6");
    assert.equal(entry.outcome, null);
  });

  it("returns session_end for SessionEnd", () => {
    const hook = { hook_event_name: "SessionEnd", session_id: "s1", reason: "user_exit" };
    const entry = buildEventStreamEntry(hook);
    assert.ok(entry, "Expected non-null entry");
    assert.equal(entry.event_type, "session_end");
    assert.equal(entry.agent_id, "s1");
    assert.equal(entry.reasoning, "user_exit");
  });

  it("PostToolUse uses session_id as agent_id when agent_id absent", () => {
    const hook = { hook_event_name: "PostToolUse", tool_name: "Bash", session_id: "sess-xyz" };
    const entry = buildEventStreamEntry(hook);
    assert.equal(entry.agent_id, "sess-xyz");
  });

  it("returns null for Stop", () => {
    const hook = { hook_event_name: "Stop" };
    assert.equal(buildEventStreamEntry(hook), null);
  });

  it("returns null for TaskCompleted", () => {
    const hook = { hook_event_name: "TaskCompleted" };
    assert.equal(buildEventStreamEntry(hook), null);
  });

  it("entry has ts, command=null, phase=null, trace_id=null fields", () => {
    const hook = { hook_event_name: "PostToolUse", tool_name: "Read" };
    const entry = buildEventStreamEntry(hook);
    assert.ok(entry.ts, "Expected ts field");
    assert.equal(entry.command, null);
    assert.equal(entry.phase, null);
    assert.equal(entry.trace_id, null);
  });
});

// ─── appendToEventsFile ───────────────────────────────────────────────────────

describe("appendToEventsFile", () => {
  it("creates events/ directory if missing and writes event", () => {
    const gsdtDir = path.join(tmpDir, "heartbeat-append-test", ".gsd-t");
    fs.mkdirSync(gsdtDir, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      event_type: "tool_call",
      command: null, phase: null, agent_id: null,
      parent_agent_id: null, trace_id: null,
      reasoning: "Bash", outcome: null,
    };
    appendToEventsFile(gsdtDir, entry);
    const eventsDir = path.join(gsdtDir, "events");
    assert.ok(fs.existsSync(eventsDir));
    const files = fs.readdirSync(eventsDir).filter((f) => f.endsWith(".jsonl"));
    assert.equal(files.length, 1);
    const line = fs.readFileSync(path.join(eventsDir, files[0]), "utf8").trim();
    const parsed = JSON.parse(line);
    assert.equal(parsed.event_type, "tool_call");
  });

  it("silently does nothing when events/ cannot be created (bad path)", () => {
    // Pass a gsdtDir that is a file — mkdirSync will fail silently
    const fakeDir = path.join(tmpDir, "a-file.txt");
    fs.writeFileSync(fakeDir, "x");
    // Should not throw
    assert.doesNotThrow(() => appendToEventsFile(fakeDir, { event_type: "tool_call" }));
  });
});
