/**
 * Tests for the headless-default spawn primitive extension (M38 Domain 1).
 * Exercises the `--watch` flag + `spawnType` propagation rules on the
 * `autoSpawnHeadless()` primitive AND the `--watch` rejection at the
 * `gsd-t-unattended` CLI surface.
 *
 * Contract: .gsd-t/contracts/headless-default-contract.md v1.0.0 §2, §3
 *
 * Propagation matrix (§2):
 *   | watch | spawnType   | behavior                                   |
 *   |-------|-------------|--------------------------------------------|
 *   | false | primary     | headless (default)                         |
 *   | false | validation  | headless (always)                          |
 *   | true  | primary     | signal in-context fallback ({mode})        |
 *   | true  | validation  | stderr warning; proceed headless           |
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const has = require("../bin/headless-auto-spawn.cjs");

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-hd-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  const gsd = path.join(tmpDir, ".gsd-t");
  if (fs.existsSync(gsd)) fs.rmSync(gsd, { recursive: true, force: true });
  fs.mkdirSync(gsd, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "bin"), { recursive: true });
  // Fake gsd-t.js shim — the spawn path invokes
  //   `node bin/gsd-t.js headless <cmd> --log`
  // so any quick-exit shim is sufficient.
  fs.writeFileSync(
    path.join(tmpDir, "bin", "gsd-t.js"),
    "#!/usr/bin/env node\nconsole.log('hd-shim done');\nprocess.exit(0);\n",
  );
});

// ── 1. Propagation matrix: watch=false / primary ─────────────────────────────

describe("HD-T2: propagation — watch=false + primary (default)", () => {
  it("returns {mode:'headless', id, pid, logPath} and writes session file", () => {
    const result = has.autoSpawnHeadless({
      command: "gsd-t-execute",
      projectDir: tmpDir,
      watch: false,
      spawnType: "primary",
    });
    assert.equal(result.mode, "headless");
    assert.ok(result.id && typeof result.id === "string");
    assert.ok(result.pid > 0);
    assert.ok(result.logPath);
    const sessionFp = path.join(
      tmpDir,
      ".gsd-t",
      "headless-sessions",
      `${result.id}.json`,
    );
    assert.ok(fs.existsSync(sessionFp));
  });

  it("defaults (no watch, no spawnType) behave exactly like watch=false+primary", () => {
    const result = has.autoSpawnHeadless({
      command: "gsd-t-quick",
      projectDir: tmpDir,
    });
    assert.equal(result.mode, "headless");
    assert.ok(result.id);
  });
});

// ── 2. Propagation matrix: watch=false / validation ──────────────────────────

describe("HD-T2: propagation — watch=false + validation (always headless)", () => {
  it("returns {mode:'headless'} and writes session file", () => {
    const result = has.autoSpawnHeadless({
      command: "gsd-t-verify",
      projectDir: tmpDir,
      watch: false,
      spawnType: "validation",
    });
    assert.equal(result.mode, "headless");
    assert.ok(result.id);
    assert.ok(result.pid > 0);
  });
});

// ── 3. Propagation matrix: watch=true / primary (in-context fallback) ────────

describe("HD-T2: propagation — watch=true + primary (in-context fallback)", () => {
  it("returns {mode:'in-context'} sentinel and writes NO session file", () => {
    const before = listSessionFiles(tmpDir);
    const result = has.autoSpawnHeadless({
      command: "gsd-t-execute",
      projectDir: tmpDir,
      watch: true,
      spawnType: "primary",
    });
    assert.equal(result.mode, "in-context");
    assert.equal(result.id, null);
    assert.equal(result.pid, null);
    assert.equal(result.logPath, null);
    assert.ok(result.timestamp);
    const after = listSessionFiles(tmpDir);
    assert.equal(
      after.length,
      before.length,
      "in-context mode must not write session files",
    );
  });

  it("does not spawn a child process (no .gsd-t/headless-*.log appears)", () => {
    const logsBefore = listHeadlessLogs(tmpDir);
    has.autoSpawnHeadless({
      command: "gsd-t-quick",
      projectDir: tmpDir,
      watch: true,
      spawnType: "primary",
    });
    const logsAfter = listHeadlessLogs(tmpDir);
    assert.equal(
      logsAfter.length,
      logsBefore.length,
      "in-context mode must not open a log fd",
    );
  });
});

// ── 4. Propagation matrix: watch=true / validation (warn + headless) ─────────

describe("HD-T2: propagation — watch=true + validation (warn + proceed headless)", () => {
  it("returns {mode:'headless'} and still spawns detached child", () => {
    const result = has.autoSpawnHeadless({
      command: "gsd-t-verify",
      projectDir: tmpDir,
      watch: true,
      spawnType: "validation",
    });
    assert.equal(result.mode, "headless");
    assert.ok(result.id);
    assert.ok(result.pid > 0);
  });
});

// ── 5. Spawn-type enum validation ────────────────────────────────────────────

describe("HD-T2: spawnType enum validation", () => {
  it("throws when spawnType is an unknown string", () => {
    assert.throws(
      () =>
        has.autoSpawnHeadless({
          command: "gsd-t-execute",
          projectDir: tmpDir,
          spawnType: "bogus",
        }),
      /spawnType.*primary.*validation/,
    );
  });

  it("accepts spawnType='primary'", () => {
    assert.doesNotThrow(() =>
      has.autoSpawnHeadless({
        command: "gsd-t-execute",
        projectDir: tmpDir,
        spawnType: "primary",
      }),
    );
  });

  it("accepts spawnType='validation'", () => {
    assert.doesNotThrow(() =>
      has.autoSpawnHeadless({
        command: "gsd-t-execute",
        projectDir: tmpDir,
        spawnType: "validation",
      }),
    );
  });
});

// ── 6. sessionContext alias ──────────────────────────────────────────────────

describe("HD-T2: sessionContext alias for context", () => {
  it("writes sessionContext into the -context.json file when context is absent", () => {
    const payload = { note: "from-sessionContext", step: 42 };
    const result = has.autoSpawnHeadless({
      command: "gsd-t-execute",
      projectDir: tmpDir,
      sessionContext: payload,
    });
    const ctxFp = path.join(
      tmpDir,
      ".gsd-t",
      "headless-sessions",
      `${result.id}-context.json`,
    );
    assert.ok(fs.existsSync(ctxFp));
    const readBack = JSON.parse(fs.readFileSync(ctxFp, "utf8"));
    assert.deepEqual(readBack, payload);
  });
});

// ── 7. Unattended CLI rejects --watch (defense-in-depth) ─────────────────────

describe("HD-T6: gsd-t unattended CLI rejects --watch", () => {
  it("exits non-zero with a rejection message when --watch is passed", () => {
    const cliPath = path.join(__dirname, "..", "bin", "gsd-t.js");
    // `bin/gsd-t.js unattended --watch` — we expect non-zero exit with a
    // message matching the contract text.
    const res = spawnSync("node", [cliPath, "unattended", "--watch"], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      timeout: 15000,
    });
    assert.notEqual(res.status, 0, "unattended --watch must exit non-zero");
    const combined = (res.stdout || "") + (res.stderr || "");
    assert.match(
      combined,
      /--watch.*incompatible|Unattended.*detached|gsd-t-unattended-watch/i,
      "rejection message must explain why and redirect to unattended-watch",
    );
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function listSessionFiles(dir) {
  const d = path.join(dir, ".gsd-t", "headless-sessions");
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".json") && !f.endsWith("-context.json"));
}

function listHeadlessLogs(dir) {
  const d = path.join(dir, ".gsd-t");
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => /^headless-.*\.log$/.test(f));
}
