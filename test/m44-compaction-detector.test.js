/**
 * M44 pre-req — compaction detector hook tests.
 *
 * Hook lives at scripts/gsd-t-compact-detector.js. It's wired as a
 * SessionStart hook; Claude Code fires SessionStart with `source:"compact"`
 * after an auto-compaction. The hook records one NDJSON row to
 * <cwd>/.gsd-t/metrics/compactions.jsonl.
 *
 * Invariants under test:
 *   - Only `source:"compact"` produces a row. startup/resume are no-ops.
 *   - Malformed stdin does not throw.
 *   - Exit code is 0 in every test (fail-open contract).
 *   - 1 MiB stdin cap holds.
 *   - Path traversal in `cwd` cannot escape `<cwd>/.gsd-t/metrics/`.
 *   - Missing .gsd-t/ acts as an off-switch.
 *
 * Contract: .gsd-t/contracts/compaction-events-contract.md
 */
"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const HOOK = path.join(__dirname, "..", "scripts", "gsd-t-compact-detector.js");

let baseTmp;

before(() => {
  baseTmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-compact-detector-"));
});

after(() => {
  fs.rmSync(baseTmp, { recursive: true, force: true });
});

function mkProject(name) {
  const root = path.join(baseTmp, name);
  fs.mkdirSync(path.join(root, ".gsd-t"), { recursive: true });
  return root;
}

function runHook(payload, { rawInput } = {}) {
  const input = rawInput !== undefined
    ? rawInput
    : (payload === undefined ? "" : JSON.stringify(payload));
  return spawnSync("node", [HOOK], { input, encoding: "utf8" });
}

function readRows(project) {
  const p = path.join(project, ".gsd-t", "metrics", "compactions.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

describe("M44 compaction detector hook", () => {
  it("records a row when source=compact", () => {
    const proj = mkProject("compact-yes");
    const result = runHook({
      hook_event_name: "SessionStart",
      source: "compact",
      session_id: "sess-new-111",
      prior_session_id: "sess-old-000",
      cwd: proj,
    });
    assert.equal(result.status, 0);
    const rows = readRows(proj);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "compact");
    assert.equal(rows[0].session_id, "sess-new-111");
    assert.equal(rows[0].prior_session_id, "sess-old-000");
    assert.equal(rows[0].cwd, proj);
    assert.equal(rows[0].hook, "SessionStart");
    assert.equal(rows[0].schemaVersion, 1);
    assert.ok(typeof rows[0].ts === "string" && rows[0].ts.length > 0);
  });

  it("no-op when source=startup", () => {
    const proj = mkProject("startup-noop");
    const result = runHook({
      hook_event_name: "SessionStart",
      source: "startup",
      session_id: "sess-start",
      cwd: proj,
    });
    assert.equal(result.status, 0);
    assert.equal(readRows(proj).length, 0);
  });

  it("no-op when source=resume", () => {
    const proj = mkProject("resume-noop");
    const result = runHook({
      hook_event_name: "SessionStart",
      source: "resume",
      session_id: "sess-resume",
      cwd: proj,
    });
    assert.equal(result.status, 0);
    assert.equal(readRows(proj).length, 0);
  });

  it("ignores malformed stdin without throwing", () => {
    const proj = mkProject("malformed");
    const result = runHook(undefined, { rawInput: "not-json-{{{" });
    assert.equal(result.status, 0);
    assert.equal(readRows(proj).length, 0);
  });

  it("1 MiB stdin cap: oversize input triggers abort, no write", () => {
    const proj = mkProject("oversize");
    // Build a payload slightly over 1 MiB.
    const big = "x".repeat(1024 * 1024 + 128);
    const payload = JSON.stringify({
      hook_event_name: "SessionStart",
      source: "compact",
      session_id: "sess-huge",
      cwd: proj,
      // Stuff the extra bytes into a benign field.
      pad: big,
    });
    const result = spawnSync("node", [HOOK], { input: payload, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(readRows(proj).length, 0, "oversized stdin must abort without writing");
  });

  it("blocks path traversal in cwd — never writes outside .gsd-t/metrics/", () => {
    const proj = mkProject("traversal");
    // Relative path in payload.cwd — the detector must reject (requires
    // absolute path) and fall back to process.cwd(), which at test time is
    // the spawned node process and has no .gsd-t/ — so no write.
    const result = runHook({
      hook_event_name: "SessionStart",
      source: "compact",
      session_id: "sess-trav-rel",
      cwd: "../../../etc",
    });
    assert.equal(result.status, 0);
    // Nothing should have been written under /etc, obviously.
    assert.equal(fs.existsSync("/etc/.gsd-t/metrics/compactions.jsonl"), false);
    // And the real project must still be untouched.
    assert.equal(readRows(proj).length, 0);

    // Also: a cwd with embedded traversal tokens that resolves outside
    // .gsd-t/metrics/ is rejected. We construct a payload where the detector
    // would have to climb out of its own gsd-t tree to write.
    const evilProj = mkProject("traversal-abs");
    // Point cwd at something absolute that has a .gsd-t/ — but then include
    // traversal in the session_id? The detector doesn't interpolate
    // session_id into the path, so the only traversal vector is cwd itself.
    // Covered above via relative-path rejection.
    const r2 = runHook({
      hook_event_name: "SessionStart",
      source: "compact",
      session_id: "normal",
      cwd: evilProj,
    });
    assert.equal(r2.status, 0);
    const rows = readRows(evilProj);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].cwd, evilProj);
  });

  it("off-switch: no write when <cwd>/.gsd-t/ does not exist", () => {
    const bare = fs.mkdtempSync(path.join(baseTmp, "bare-"));
    // No .gsd-t/ dir.
    const result = runHook({
      hook_event_name: "SessionStart",
      source: "compact",
      session_id: "sess-bare",
      cwd: bare,
    });
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(path.join(bare, ".gsd-t")), false,
      "hook must NOT create .gsd-t/ — that's the opt-in switch");
  });

  it("always exits 0 even on empty stdin", () => {
    const result = runHook(undefined, { rawInput: "" });
    assert.equal(result.status, 0);
  });

  it("multiple compaction events append, never overwrite", () => {
    const proj = mkProject("append");
    for (let i = 0; i < 3; i++) {
      const r = runHook({
        hook_event_name: "SessionStart",
        source: "compact",
        session_id: `sess-${i}`,
        cwd: proj,
      });
      assert.equal(r.status, 0);
    }
    const rows = readRows(proj);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.session_id), ["sess-0", "sess-1", "sess-2"]);
  });
});
