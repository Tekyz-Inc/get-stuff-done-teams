/**
 * Tests for supervisor.pid fingerprint helper.
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md §2 (PID file lifecycle)
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  writePidFile,
  readPidFile,
  verifyFingerprint,
  pidPathFor,
} = require("../bin/supervisor-pid-fingerprint.cjs");

function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pid-fp-"));
}

describe("supervisor-pid-fingerprint", () => {
  it("writes JSON form and reads it back with correct shape", () => {
    const dir = mkTmpProject();
    const entry = writePidFile(dir, 12345);
    assert.strictEqual(entry.pid, 12345);
    assert.strictEqual(entry.projectDir, path.resolve(dir));
    assert.ok(entry.startedAt);

    const round = readPidFile(dir);
    assert.strictEqual(round.pid, 12345);
    assert.strictEqual(round.projectDir, path.resolve(dir));
    assert.strictEqual(round.form, "json");
    assert.ok(round.startedAt);
  });

  it("reads legacy bare-integer form with form=legacy and null fingerprint", () => {
    const dir = mkTmpProject();
    const p = pidPathFor(dir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "54321\n", "utf8");

    const r = readPidFile(dir);
    assert.strictEqual(r.pid, 54321);
    assert.strictEqual(r.projectDir, null);
    assert.strictEqual(r.startedAt, null);
    assert.strictEqual(r.form, "legacy");
  });

  it("readPidFile returns null when file absent or empty", () => {
    const dir = mkTmpProject();
    assert.strictEqual(readPidFile(dir), null);

    const p = pidPathFor(dir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "", "utf8");
    assert.strictEqual(readPidFile(dir), null);
  });

  it("verifyFingerprint returns ok=null on legacy entry", () => {
    const entry = { pid: 111, projectDir: null, startedAt: null, form: "legacy" };
    const r = verifyFingerprint(entry, "/tmp/anywhere");
    assert.strictEqual(r.ok, null);
    assert.match(r.reason, /legacy/);
  });

  it("verifyFingerprint returns ok=false with project_mismatch on different projectDir", () => {
    const dir = mkTmpProject();
    const entry = { pid: 9999, projectDir: path.resolve(dir), startedAt: new Date().toISOString(), form: "json" };
    const r = verifyFingerprint(entry, "/tmp/different-project", {
      _execSync: () => "node /usr/bin/gsd-t unattended\n",
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "project_mismatch");
  });

  it("verifyFingerprint returns ok=true when project matches AND command matches gsd-t", () => {
    const dir = mkTmpProject();
    const entry = { pid: 9999, projectDir: path.resolve(dir), startedAt: new Date().toISOString(), form: "json" };
    const r = verifyFingerprint(entry, dir, {
      _execSync: () => "node /Users/x/bin/gsd-t-unattended.cjs\n",
    });
    assert.strictEqual(r.ok, true);
    assert.match(r.reason, /verified/);
  });

  it("verifyFingerprint returns ok=false command_not_gsd_t when ps output doesn't match", () => {
    const dir = mkTmpProject();
    const entry = { pid: 9999, projectDir: path.resolve(dir), startedAt: new Date().toISOString(), form: "json" };
    const r = verifyFingerprint(entry, dir, {
      _execSync: () => "/Applications/Spotify.app/Contents/MacOS/Spotify\n",
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "command_not_gsd_t");
    assert.match(r.command, /Spotify/);
  });

  it("verifyFingerprint returns ok=false ps_failed when execSync throws", () => {
    const dir = mkTmpProject();
    const entry = { pid: 9999, projectDir: path.resolve(dir), startedAt: new Date().toISOString(), form: "json" };
    const r = verifyFingerprint(entry, dir, {
      _execSync: () => { throw new Error("ps: not found"); },
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "ps_failed");
  });
});
