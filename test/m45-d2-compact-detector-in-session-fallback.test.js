/**
 * M45 D2 — compact-detector fallback target selection.
 *
 * Tests:
 *   1. No spawn NDJSON, only in-session-*.ndjson → compact_marker lands in in-session.
 *   2. Fresh spawn NDJSON + stale in-session → compact_marker lands in spawn (default path).
 *   3. Stale spawn NDJSON (> 30s old) + fresh in-session → compact_marker lands in in-session.
 *   4. No transcripts at all → no-op (writes compactions.jsonl but no frame).
 *   5. Fallback decision is logged to stderr.
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
  baseTmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m45-d2-fallback-"));
});

after(() => {
  fs.rmSync(baseTmp, { recursive: true, force: true });
});

function mkProject(name) {
  const root = path.join(baseTmp, name);
  fs.mkdirSync(path.join(root, ".gsd-t", "transcripts"), { recursive: true });
  return root;
}

function writeNdjson(dir, name, content = "") {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, "utf8");
  return p;
}

function ageFile(p, secondsOld) {
  const t = new Date(Date.now() - secondsOld * 1000);
  fs.utimesSync(p, t, t);
}

function runHook(payload) {
  return spawnSync("node", [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

function readNdjson(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

describe("M45 D2 compact-detector: in-session fallback target selection", () => {
  it("targets in-session NDJSON when no spawn NDJSON exists", () => {
    const proj = mkProject("only-in-session");
    const tdir = path.join(proj, ".gsd-t", "transcripts");
    const inSession = writeNdjson(tdir, "in-session-sess-aaa.ndjson", "");

    const result = runHook({ source: "compact", session_id: "new-sess", cwd: proj });
    assert.equal(result.status, 0);

    const frames = readNdjson(inSession);
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, "compact_marker");
  });

  it("targets the spawn NDJSON when a fresh spawn NDJSON exists (default path)", () => {
    const proj = mkProject("fresh-spawn-wins");
    const tdir = path.join(proj, ".gsd-t", "transcripts");
    const spawnFile = writeNdjson(tdir, "s-spawn1.ndjson", "");
    const inSession = writeNdjson(tdir, "in-session-sess-bbb.ndjson", "");
    // Age the in-session file slightly older so spawn is newer.
    ageFile(inSession, 1);

    runHook({ source: "compact", session_id: "sess-fresh", cwd: proj });

    const spawnFrames = readNdjson(spawnFile);
    const inSessionFrames = readNdjson(inSession);
    assert.equal(spawnFrames.length, 1, "spawn NDJSON should receive compact_marker");
    assert.equal(spawnFrames[0].type, "compact_marker");
    assert.equal(inSessionFrames.length, 0, "in-session NDJSON should remain untouched");
  });

  it("falls back to in-session NDJSON when spawn is stale (> 30s old)", () => {
    const proj = mkProject("stale-spawn-fallback");
    const tdir = path.join(proj, ".gsd-t", "transcripts");
    const spawnFile = writeNdjson(tdir, "s-spawn-old.ndjson", "");
    const inSession = writeNdjson(tdir, "in-session-sess-ccc.ndjson", "");
    // Age the spawn NDJSON beyond the 30s fallback threshold.
    ageFile(spawnFile, 120);
    // Keep in-session fresh (writeNdjson call above set current mtime).

    const result = runHook({ source: "compact", session_id: "sess-stale", cwd: proj });
    assert.equal(result.status, 0);

    const spawnFrames = readNdjson(spawnFile);
    const inSessionFrames = readNdjson(inSession);
    assert.equal(
      inSessionFrames.length, 1,
      "in-session NDJSON should receive compact_marker via fallback"
    );
    assert.equal(inSessionFrames[0].type, "compact_marker");
    assert.equal(spawnFrames.length, 0, "stale spawn NDJSON should not be targeted");
  });

  it("logs the fallback decision to stderr", () => {
    const proj = mkProject("stderr-log");
    const tdir = path.join(proj, ".gsd-t", "transcripts");
    writeNdjson(tdir, "in-session-sess-log.ndjson", "");

    const result = runHook({ source: "compact", session_id: "sess-log", cwd: proj });
    assert.equal(result.status, 0);
    assert.match(
      result.stderr,
      /compact-detector: targeting in-session-.*\.ndjson \(fallback\)/,
      "stderr should announce the in-session fallback decision"
    );
  });

  it("writes compactions.jsonl row even when no transcript file exists", () => {
    const proj = mkProject("no-transcripts");
    // transcripts dir exists but is empty
    const result = runHook({ source: "compact", session_id: "sess-empty", cwd: proj });
    assert.equal(result.status, 0);
    const rows = readNdjson(path.join(proj, ".gsd-t", "metrics", "compactions.jsonl"));
    assert.equal(rows.length, 1, "compactions.jsonl should still get a row");
  });
});
