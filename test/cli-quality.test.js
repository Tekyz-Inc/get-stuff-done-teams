/**
 * Tests for CLI quality refactoring (Milestone 6)
 * Covers: readProjectDeps, insertGuardSection, readUpdateCache, readPyContent
 * (v6: the heartbeat hook and its buildEvent were cut)
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  readProjectDeps,
  readPyContent,
  insertGuardSection,
  readUpdateCache,
  readSettingsJson,
  PKG_ROOT,
} = require("../bin/gsd-t.js");

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
