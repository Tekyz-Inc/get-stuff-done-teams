/**
 * Tests for pure helper functions in bin/gsd-t.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  validateProjectName,
  applyTokens,
  normalizeEol,
  validateVersion,
  isNewerVersion,
  PKG_VERSION,
  PKG_ROOT,
} = require("../bin/gsd-t.js");

// ─── validateProjectName ────────────────────────────────────────────────────

describe("validateProjectName", () => {
  it("accepts simple alphanumeric names", () => {
    assert.equal(validateProjectName("myproject"), true);
    assert.equal(validateProjectName("MyProject123"), true);
  });

  it("accepts names with dots, dashes, underscores, spaces", () => {
    assert.equal(validateProjectName("my-project"), true);
    assert.equal(validateProjectName("my_project"), true);
    assert.equal(validateProjectName("my.project"), true);
    assert.equal(validateProjectName("My Project"), true);
  });

  it("rejects empty string", () => {
    assert.equal(validateProjectName(""), false);
  });

  it("rejects names starting with special characters", () => {
    assert.equal(validateProjectName("-project"), false);
    assert.equal(validateProjectName(".project"), false);
    assert.equal(validateProjectName("_project"), false);
    assert.equal(validateProjectName(" project"), false);
  });

  it("rejects names with path traversal characters", () => {
    assert.equal(validateProjectName("../evil"), false);
    assert.equal(validateProjectName("foo/bar"), false);
    assert.equal(validateProjectName("foo\\bar"), false);
  });

  it("rejects names over 101 characters", () => {
    const longName = "a" + "b".repeat(101);
    assert.equal(validateProjectName(longName), false);
  });

  it("accepts names up to 101 characters", () => {
    const maxName = "a" + "b".repeat(100);
    assert.equal(validateProjectName(maxName), true);
  });
});

// ─── applyTokens ────────────────────────────────────────────────────────────

describe("applyTokens", () => {
  it("replaces {Project Name} token", () => {
    const result = applyTokens("Hello {Project Name}!", "MyApp", "2026-01-01");
    assert.equal(result, "Hello MyApp!");
  });

  it("replaces {Date} token", () => {
    const result = applyTokens("Created: {Date}", "MyApp", "2026-02-18");
    assert.equal(result, "Created: 2026-02-18");
  });

  it("replaces multiple occurrences of both tokens", () => {
    const input = "{Project Name} - {Date} - {Project Name} - {Date}";
    const result = applyTokens(input, "Foo", "today");
    assert.equal(result, "Foo - today - Foo - today");
  });

  it("returns unchanged string when no tokens present", () => {
    const result = applyTokens("no tokens here", "MyApp", "2026-01-01");
    assert.equal(result, "no tokens here");
  });
});

// ─── normalizeEol ───────────────────────────────────────────────────────────

describe("normalizeEol", () => {
  it("converts CRLF to LF", () => {
    assert.equal(normalizeEol("line1\r\nline2\r\n"), "line1\nline2\n");
  });

  it("leaves LF-only strings unchanged", () => {
    assert.equal(normalizeEol("line1\nline2\n"), "line1\nline2\n");
  });

  it("handles mixed line endings", () => {
    assert.equal(normalizeEol("a\r\nb\nc\r\n"), "a\nb\nc\n");
  });

  it("handles empty string", () => {
    assert.equal(normalizeEol(""), "");
  });
});

// ─── validateVersion ────────────────────────────────────────────────────────

describe("validateVersion", () => {
  it("accepts standard semver", () => {
    assert.equal(validateVersion("1.0.0"), true);
    assert.equal(validateVersion("0.1.0"), true);
    assert.equal(validateVersion("12.34.56"), true);
  });

  it("accepts semver with prerelease tag", () => {
    assert.equal(validateVersion("1.0.0-beta"), true);
    assert.equal(validateVersion("2.0.0-rc.1"), true);
    assert.equal(validateVersion("1.0.0-alpha.2.3"), true);
  });

  it("rejects incomplete versions", () => {
    assert.equal(validateVersion("1.0"), false);
    assert.equal(validateVersion("1"), false);
    assert.equal(validateVersion(""), false);
  });

  it("rejects non-numeric versions", () => {
    assert.equal(validateVersion("a.b.c"), false);
    assert.equal(validateVersion("v1.0.0"), false);
  });
});

// ─── isNewerVersion ─────────────────────────────────────────────────────────

describe("isNewerVersion", () => {
  it("detects newer major version", () => {
    assert.equal(isNewerVersion("2.0.0", "1.0.0"), true);
  });

  it("detects newer minor version", () => {
    assert.equal(isNewerVersion("1.2.0", "1.1.0"), true);
  });

  it("detects newer patch version", () => {
    assert.equal(isNewerVersion("1.0.2", "1.0.1"), true);
  });

  it("returns false for same version", () => {
    assert.equal(isNewerVersion("1.0.0", "1.0.0"), false);
  });

  it("returns false for older version", () => {
    assert.equal(isNewerVersion("1.0.0", "2.0.0"), false);
    assert.equal(isNewerVersion("1.1.0", "1.2.0"), false);
    assert.equal(isNewerVersion("1.0.1", "1.0.2"), false);
  });

  it("handles version with missing segments gracefully", () => {
    // isNewerVersion uses || 0 for missing segments
    assert.equal(isNewerVersion("1.0.1", "1.0.0"), true);
  });
});

// ─── PKG_VERSION / PKG_ROOT ─────────────────────────────────────────────────

describe("package exports", () => {
  it("PKG_VERSION matches package.json", () => {
    const pkg = require(path.join(PKG_ROOT, "package.json"));
    assert.equal(PKG_VERSION, pkg.version);
  });

  it("PKG_ROOT points to the repository root", () => {
    assert.ok(fs.existsSync(path.join(PKG_ROOT, "package.json")));
    assert.ok(fs.existsSync(path.join(PKG_ROOT, "bin", "gsd-t.js")));
  });
});
