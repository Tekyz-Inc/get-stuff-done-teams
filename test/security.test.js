/**
 * Tests for security hardening functions (Milestone 5)
 * Covers: scrubSecrets, scrubUrl from gsd-t-heartbeat.js
 *         hasSymlinkInPath from bin/gsd-t.js
 * Uses Node.js built-in test runner (node --test)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { scrubSecrets, scrubUrl, summarize, shortPath } = require("../scripts/gsd-t-heartbeat.js");
const os = require("node:os");
const path = require("node:path");
const { hasSymlinkInPath } = require("../bin/gsd-t.js");

// ─── shortPath ──────────────────────────────────────────────────────────────

describe("shortPath", () => {
  it("returns null for null input", () => {
    assert.equal(shortPath(null), null);
  });

  it("returns null for undefined input", () => {
    assert.equal(shortPath(undefined), null);
  });

  it("converts cwd-relative paths", () => {
    const cwd = process.cwd();
    const result = shortPath(path.join(cwd, "src", "file.js"));
    assert.equal(result, "src/file.js");
  });

  it("converts home-relative paths to ~ prefix", () => {
    const home = os.homedir();
    const result = shortPath(path.join(home, ".claude", "settings.json"));
    assert.equal(result, "~/.claude/settings.json");
  });

  it("returns absolute path with forward slashes for other paths", () => {
    const result = shortPath("/some/other/path/file.js");
    assert.equal(result, "/some/other/path/file.js");
  });

  it("converts backslashes to forward slashes", () => {
    const cwd = process.cwd();
    // On Windows, path.join uses backslashes
    const result = shortPath(path.join(cwd, "test", "file.js"));
    assert.ok(!result.includes("\\"));
    assert.equal(result, "test/file.js");
  });
});

// ─── scrubSecrets ────────────────────────────────────────────────────────────

describe("scrubSecrets", () => {
  it("scrubs --token flag value", () => {
    assert.equal(scrubSecrets("curl --token abc123 https://api.com"), "curl --token *** https://api.com");
  });

  it("scrubs --password flag value", () => {
    assert.equal(scrubSecrets("mysql --password=mysecret"), "mysql --password=***");
  });

  it("scrubs --secret flag value", () => {
    assert.equal(scrubSecrets("app --secret s3cr3t"), "app --secret ***");
  });

  it("scrubs --api-key flag value", () => {
    assert.equal(scrubSecrets("cli --api-key sk_live_xyz"), "cli --api-key ***");
  });

  it("scrubs --api_key flag value (underscore variant)", () => {
    assert.equal(scrubSecrets("cli --api_key sk_live_xyz"), "cli --api_key ***");
  });

  it("scrubs --auth flag value", () => {
    assert.equal(scrubSecrets("curl --auth user:pass"), "curl --auth ***");
  });

  it("scrubs --credential flag value", () => {
    assert.equal(scrubSecrets("tool --credential abc"), "tool --credential ***");
  });

  it("scrubs --private-key flag value", () => {
    assert.equal(scrubSecrets("ssh --private-key /path/to/key"), "ssh --private-key ***");
  });

  it("scrubs short -p password flag", () => {
    assert.equal(scrubSecrets("mysql -p mypass123 -u root"), "mysql -p *** -u root");
  });

  it("scrubs API_KEY= environment variable", () => {
    assert.equal(scrubSecrets("API_KEY=sk_live_xyz node server.js"), "API_KEY=*** node server.js");
  });

  it("scrubs SECRET= environment variable", () => {
    assert.equal(scrubSecrets("SECRET=abc123 node app.js"), "SECRET=*** node app.js");
  });

  it("scrubs TOKEN= environment variable", () => {
    assert.equal(scrubSecrets("TOKEN=t0k3n cmd"), "TOKEN=*** cmd");
  });

  it("scrubs PASSWORD= environment variable", () => {
    assert.equal(scrubSecrets("PASSWORD=p@ss cmd"), "PASSWORD=*** cmd");
  });

  it("scrubs BEARER= environment variable", () => {
    assert.equal(scrubSecrets("BEARER=xyz cmd"), "BEARER=*** cmd");
  });

  it("scrubs bearer token header pattern", () => {
    assert.equal(scrubSecrets("bearer eyJhbGciOiJIUz"), "bearer ***");
  });

  it("scrubs multiple secrets in one command", () => {
    const result = scrubSecrets("--secret abc --auth def");
    assert.equal(result, "--secret *** --auth ***");
  });

  it("leaves non-sensitive commands unchanged", () => {
    assert.equal(scrubSecrets("git status"), "git status");
    assert.equal(scrubSecrets("npm install express"), "npm install express");
    assert.equal(scrubSecrets("ls -la /home/user"), "ls -la /home/user");
  });

  it("handles null/undefined gracefully", () => {
    assert.equal(scrubSecrets(null), null);
    assert.equal(scrubSecrets(undefined), undefined);
    assert.equal(scrubSecrets(""), "");
  });
});

// ─── scrubUrl ────────────────────────────────────────────────────────────────

describe("scrubUrl", () => {
  it("masks query parameter values", () => {
    const result = scrubUrl("https://example.com/api?token=abc&key=xyz");
    assert.ok(result.includes("token=***"));
    assert.ok(result.includes("key=***"));
    assert.ok(!result.includes("abc"));
    assert.ok(!result.includes("xyz"));
  });

  it("leaves URLs without query params unchanged", () => {
    assert.equal(scrubUrl("https://example.com/api"), "https://example.com/api");
  });

  it("handles single query parameter", () => {
    const result = scrubUrl("https://api.com/v1?apikey=secret123");
    assert.ok(result.includes("apikey=***"));
    assert.ok(!result.includes("secret123"));
  });

  it("handles null/undefined gracefully", () => {
    assert.equal(scrubUrl(null), null);
    assert.equal(scrubUrl(undefined), undefined);
  });

  it("returns invalid URLs unchanged", () => {
    assert.equal(scrubUrl("not-a-url"), "not-a-url");
  });
});

// ─── summarize (integration) ─────────────────────────────────────────────────

describe("summarize security integration", () => {
  it("scrubs Bash commands via summarize", () => {
    const result = summarize("Bash", { command: "curl --token secret123 https://api.com" });
    assert.ok(!result.cmd.includes("secret123"));
    assert.ok(result.cmd.includes("--token ***"));
  });

  it("scrubs WebFetch URLs via summarize", () => {
    const result = summarize("WebFetch", { url: "https://api.com/v1?key=secret" });
    assert.ok(!result.url.includes("secret"));
    assert.ok(result.url.includes("key=***"));
  });

  it("does not scrub non-sensitive tools", () => {
    const result = summarize("Read", { file_path: "/path/to/file.js" });
    assert.ok(result.file);
  });

  it("handles null input gracefully", () => {
    assert.deepEqual(summarize(null, null), {});
    assert.deepEqual(summarize("Bash", null), {});
  });
});
