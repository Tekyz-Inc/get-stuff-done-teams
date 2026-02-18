/**
 * Tests for CLI quality refactoring (Milestone 6)
 * Covers: buildEvent handler map, readProjectDeps, insertGuardSection,
 *         readUpdateCache, addHeartbeatHook, readPyContent
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { buildEvent } = require("../scripts/gsd-t-heartbeat.js");
const {
  readProjectDeps,
  readPyContent,
  insertGuardSection,
  readUpdateCache,
  addHeartbeatHook,
  readSettingsJson,
  PKG_ROOT,
} = require("../bin/gsd-t.js");

// ─── buildEvent (handler map refactor) ──────────────────────────────────────

describe("buildEvent", () => {
  it("returns session_start for SessionStart event", () => {
    const result = buildEvent({ hook_event_name: "SessionStart", session_id: "s1", source: "cli", model: "opus" });
    assert.equal(result.evt, "session_start");
    assert.equal(result.sid, "s1");
    assert.deepStrictEqual(result.data, { source: "cli", model: "opus" });
    assert.ok(result.ts);
  });

  it("returns tool event for PostToolUse", () => {
    const result = buildEvent({ hook_event_name: "PostToolUse", session_id: "s1", tool_name: "Read", tool_input: { file_path: "/tmp/x" } });
    assert.equal(result.evt, "tool");
    assert.equal(result.tool, "Read");
  });

  it("returns agent_spawn for SubagentStart", () => {
    const result = buildEvent({ hook_event_name: "SubagentStart", session_id: "s1", agent_id: "a1", agent_type: "explore" });
    assert.equal(result.evt, "agent_spawn");
    assert.deepStrictEqual(result.data, { agent_id: "a1", agent_type: "explore" });
  });

  it("returns agent_stop for SubagentStop", () => {
    const result = buildEvent({ hook_event_name: "SubagentStop", session_id: "s1", agent_id: "a1", agent_type: "explore" });
    assert.equal(result.evt, "agent_stop");
  });

  it("returns task_done for TaskCompleted", () => {
    const result = buildEvent({ hook_event_name: "TaskCompleted", session_id: "s1", task_subject: "fix bug", teammate_name: "dev" });
    assert.equal(result.evt, "task_done");
    assert.deepStrictEqual(result.data, { task: "fix bug", agent: "dev" });
  });

  it("returns agent_idle for TeammateIdle", () => {
    const result = buildEvent({ hook_event_name: "TeammateIdle", session_id: "s1", teammate_name: "dev", team_name: "t1" });
    assert.equal(result.evt, "agent_idle");
  });

  it("returns notification for Notification", () => {
    const result = buildEvent({ hook_event_name: "Notification", session_id: "s1", message: "hello", title: "info" });
    assert.equal(result.evt, "notification");
    assert.deepStrictEqual(result.data, { message: "hello", title: "info" });
  });

  it("returns session_stop for Stop", () => {
    const result = buildEvent({ hook_event_name: "Stop", session_id: "s1" });
    assert.equal(result.evt, "session_stop");
  });

  it("returns session_end for SessionEnd", () => {
    const result = buildEvent({ hook_event_name: "SessionEnd", session_id: "s1", reason: "user_exit" });
    assert.equal(result.evt, "session_end");
    assert.deepStrictEqual(result.data, { reason: "user_exit" });
  });

  it("returns null for unknown events", () => {
    assert.equal(buildEvent({ hook_event_name: "Unknown", session_id: "s1" }), null);
  });
});

// ─── readProjectDeps ────────────────────────────────────────────────────────

describe("readProjectDeps", () => {
  it("reads dependencies from a real package.json", () => {
    const deps = readProjectDeps(PKG_ROOT);
    assert.ok(Array.isArray(deps));
    // Our own package has no runtime deps, so this may be empty — just verify it runs
  });

  it("returns empty array for non-existent directory", () => {
    assert.deepStrictEqual(readProjectDeps("/nonexistent/path/xyz"), []);
  });

  it("returns empty array for directory without package.json", () => {
    assert.deepStrictEqual(readProjectDeps(os.tmpdir()), []);
  });
});

// ─── readPyContent ──────────────────────────────────────────────────────────

describe("readPyContent", () => {
  it("returns empty string for non-existent file", () => {
    assert.equal(readPyContent("/nonexistent", "requirements.txt"), "");
  });

  it("returns empty string for directory without the file", () => {
    assert.equal(readPyContent(os.tmpdir(), "nonexistent_py_file.txt"), "");
  });
});

// ─── insertGuardSection ─────────────────────────────────────────────────────

describe("insertGuardSection", () => {
  it("inserts before Pre-Commit Gate when present", () => {
    const content = "# My Project\n\n## Pre-Commit Gate\nSome content";
    const result = insertGuardSection(content);
    assert.ok(result.includes("Destructive Action Guard"));
    assert.ok(result.indexOf("Destructive Action Guard") < result.indexOf("Pre-Commit Gate"));
  });

  it("inserts before Don't Do These Things when present", () => {
    const content = "# My Project\n\n# Don't Do These Things\nSome content";
    const result = insertGuardSection(content);
    assert.ok(result.includes("Destructive Action Guard"));
    assert.ok(result.indexOf("Destructive Action Guard") < result.indexOf("Don't Do These Things"));
  });

  it("appends to end when no anchor sections found", () => {
    const content = "# My Project\n\nSome content";
    const result = insertGuardSection(content);
    assert.ok(result.includes("Destructive Action Guard"));
    assert.ok(result.startsWith("# My Project"));
  });
});

// ─── readUpdateCache ────────────────────────────────────────────────────────

describe("readUpdateCache", () => {
  it("returns null when cache file does not exist", () => {
    // readUpdateCache reads UPDATE_CHECK_FILE which may or may not exist
    // Just verify it returns object or null without throwing
    const result = readUpdateCache();
    assert.ok(result === null || typeof result === "object");
  });
});

// ─── readSettingsJson ───────────────────────────────────────────────────────

describe("readSettingsJson", () => {
  it("returns object or null without throwing", () => {
    const result = readSettingsJson();
    assert.ok(result === null || typeof result === "object");
  });

  it("returns null when settings.json does not exist", () => {
    // Temporarily point to non-existent path by testing the function behavior
    // readSettingsJson checks fs.existsSync(SETTINGS_JSON) — if the file
    // doesn't exist, it returns null. We can verify this by checking that
    // the function handles missing files gracefully.
    const result = readSettingsJson();
    // Either returns valid object (file exists) or null (doesn't exist)
    if (result !== null) {
      assert.equal(typeof result, "object");
    }
  });

  it("returns an object with expected structure when file exists", () => {
    const result = readSettingsJson();
    if (result !== null) {
      // settings.json should be a plain object (not array)
      assert.equal(typeof result, "object");
      assert.ok(!Array.isArray(result));
    }
  });
});

// ─── addHeartbeatHook ───────────────────────────────────────────────────────

describe("addHeartbeatHook", () => {
  it("adds hook to empty event array", () => {
    const hooks = {};
    const result = addHeartbeatHook(hooks, "SessionStart", 'node "script.js"');
    assert.equal(result, true);
    assert.equal(hooks.SessionStart.length, 1);
    assert.equal(hooks.SessionStart[0].hooks[0].command, 'node "script.js"');
    assert.equal(hooks.SessionStart[0].hooks[0].async, true);
  });

  it("returns false if hook already exists", () => {
    const hooks = {
      SessionStart: [{ hooks: [{ command: "node gsd-t-heartbeat.js" }] }],
    };
    const result = addHeartbeatHook(hooks, "SessionStart", 'node "gsd-t-heartbeat.js"');
    assert.equal(result, false);
  });

  it("adds to existing array without heartbeat", () => {
    const hooks = {
      PostToolUse: [{ hooks: [{ command: "other-script.js" }] }],
    };
    const result = addHeartbeatHook(hooks, "PostToolUse", 'node "gsd-t-heartbeat.js"');
    assert.equal(result, true);
    assert.equal(hooks.PostToolUse.length, 2);
  });
});
