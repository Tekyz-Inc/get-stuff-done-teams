/**
 * Tests for project-scoped dashboard port (multi-project isolation).
 *
 * Two projects running `gsd-t visualize` simultaneously must not collide
 * on the same default port. The default is now derived from a djb2 hash
 * of the resolved project directory, mapped into [7433, 7532].
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_PORT,
  projectScopedDefaultPort,
  resolvePort,
} = require("../scripts/gsd-t-dashboard-server.js");

describe("projectScopedDefaultPort", () => {
  it("yields different ports for /project/a vs /project/b (sanity sampled)", () => {
    // Sanity: among three distinct paths, at least two ports differ. This
    // guards against the unlikely case where two specific inputs hash into
    // the same bucket (1/100 chance per pair).
    const ports = [
      projectScopedDefaultPort("/project/a"),
      projectScopedDefaultPort("/project/b"),
      projectScopedDefaultPort("/project/c"),
    ];
    const distinct = new Set(ports);
    assert.ok(
      distinct.size >= 2,
      `expected at least 2 distinct ports across 3 paths, got ${[...distinct].join(",")}`,
    );
  });

  it("is deterministic — same input yields same port across calls", () => {
    const p1 = projectScopedDefaultPort("/project/a");
    const p2 = projectScopedDefaultPort("/project/a");
    assert.equal(p1, p2);
  });

  it("always returns a port in [DEFAULT_PORT, DEFAULT_PORT + 99] inclusive", () => {
    const samples = [
      "/a",
      "/b/c",
      "/Users/x/projects/one",
      "/Users/x/projects/two",
      "/tmp/foo",
      "/very/deeply/nested/path/to/something",
      "/single",
      "/with-dashes/and_underscores",
      "/",
      "relative/path/handled-by-resolve",
    ];
    for (const s of samples) {
      const p = projectScopedDefaultPort(s);
      assert.ok(
        p >= DEFAULT_PORT && p <= DEFAULT_PORT + 99,
        `port ${p} for "${s}" out of range [${DEFAULT_PORT}, ${DEFAULT_PORT + 99}]`,
      );
    }
  });
});

describe("resolvePort", () => {
  it("explicit --port wins over project-hashed default", () => {
    const port = resolvePort({ argPort: "9999", projectDir: "/project/a" });
    assert.equal(port, 9999);
  });

  it("explicit --port also accepts a number (not string)", () => {
    const port = resolvePort({ argPort: 8000, projectDir: "/project/a" });
    assert.equal(port, 8000);
  });

  it("falls back to project-hashed default when --port is null/missing", () => {
    const expected = projectScopedDefaultPort("/project/a");
    assert.equal(resolvePort({ argPort: null, projectDir: "/project/a" }), expected);
    assert.equal(resolvePort({ argPort: undefined, projectDir: "/project/a" }), expected);
    assert.equal(resolvePort({ argPort: "", projectDir: "/project/a" }), expected);
  });
});
