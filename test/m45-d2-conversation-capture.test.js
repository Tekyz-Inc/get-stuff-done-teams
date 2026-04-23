/**
 * M45 D2 — conversation capture hook: content-frame writer.
 *
 * Tests:
 *   1. SessionStart writes a session_start frame to in-session-{sessionId}.ndjson
 *   2. UserPromptSubmit writes a user_turn frame with content
 *   3. Stop writes an assistant_turn frame (stub if no content in payload)
 *   4. PostToolUse is a no-op by default, writes a tool_use frame when GSD_T_CAPTURE_TOOL_USES=1
 *   5. content > 16 KB is truncated with `truncated: true`
 *   6. non-GSD-T project dir: silent no-op (no file created)
 *   7. session_id fallback when payload omits it
 */
"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const HOOK = path.join(__dirname, "..", "scripts", "hooks", "gsd-t-conversation-capture.js");

let baseTmp;

before(() => {
  baseTmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m45-d2-capture-"));
});

after(() => {
  fs.rmSync(baseTmp, { recursive: true, force: true });
});

function mkProject(name) {
  const root = path.join(baseTmp, name);
  fs.mkdirSync(path.join(root, ".gsd-t"), { recursive: true });
  // progress.md marker needed for walk-up discovery, though GSD_T_PROJECT_DIR short-circuits.
  fs.writeFileSync(path.join(root, ".gsd-t", "progress.md"), "# progress\n", "utf8");
  return root;
}

function runHook(payload, { projectDir, env = {} } = {}) {
  const mergedEnv = { ...process.env, ...env };
  if (projectDir) mergedEnv.GSD_T_PROJECT_DIR = projectDir;
  return spawnSync("node", [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: mergedEnv,
  });
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

function ndjsonPath(projectDir, sessionId) {
  return path.join(projectDir, ".gsd-t", "transcripts", "in-session-" + sessionId + ".ndjson");
}

describe("M45 D2 conversation-capture: SessionStart", () => {
  it("writes a session_start frame for a valid SessionStart payload", () => {
    const proj = mkProject("session-start");
    const sid = "sess-abc-111";
    const result = runHook(
      { hook_event_name: "SessionStart", session_id: sid },
      { projectDir: proj }
    );
    assert.equal(result.status, 0);
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, "session_start");
    assert.equal(frames[0].session_id, sid);
    assert.ok(typeof frames[0].ts === "string" && frames[0].ts.length > 0);
  });
});

describe("M45 D2 conversation-capture: UserPromptSubmit", () => {
  it("writes a user_turn frame carrying the prompt text", () => {
    const proj = mkProject("user-turn");
    const sid = "sess-user-222";
    runHook(
      {
        hook_event_name: "UserPromptSubmit",
        session_id: sid,
        prompt: "hello from the test harness",
      },
      { projectDir: proj }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    const f = frames[0];
    assert.equal(f.type, "user_turn");
    assert.equal(f.session_id, sid);
    assert.equal(f.content, "hello from the test harness");
    assert.ok(!("truncated" in f), "short content should not be truncated");
  });

  it("propagates message_id when present", () => {
    const proj = mkProject("user-msg-id");
    const sid = "sess-user-333";
    runHook(
      {
        hook_event_name: "UserPromptSubmit",
        session_id: sid,
        prompt: "x",
        message_id: "msg-0001",
      },
      { projectDir: proj }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames[0].message_id, "msg-0001");
  });
});

describe("M45 D2 conversation-capture: Stop", () => {
  it("writes an assistant_turn frame with content when payload carries it", () => {
    const proj = mkProject("stop-with-content");
    const sid = "sess-stop-444";
    runHook(
      {
        hook_event_name: "Stop",
        session_id: sid,
        assistant_message: "done.",
      },
      { projectDir: proj }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, "assistant_turn");
    assert.equal(frames[0].content, "done.");
  });

  it("writes a stub assistant_turn frame (no content) when payload omits content", () => {
    const proj = mkProject("stop-stub");
    const sid = "sess-stop-555";
    runHook(
      { hook_event_name: "Stop", session_id: sid },
      { projectDir: proj }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, "assistant_turn");
    assert.ok(!("content" in frames[0]), "stub frame must omit content");
    assert.ok(typeof frames[0].ts === "string" && frames[0].ts.length > 0);
  });
});

describe("M45 D2 conversation-capture: PostToolUse", () => {
  it("is a no-op by default (GSD_T_CAPTURE_TOOL_USES unset)", () => {
    const proj = mkProject("ptu-default");
    const sid = "sess-ptu-666";
    runHook(
      {
        hook_event_name: "PostToolUse",
        session_id: sid,
        tool_name: "Bash",
        tool_use_id: "tu_001",
        duration_ms: 42,
      },
      { projectDir: proj }
    );
    assert.equal(fs.existsSync(ndjsonPath(proj, sid)), false,
      "no NDJSON should be written by default");
  });

  it("writes a tool_use frame when GSD_T_CAPTURE_TOOL_USES=1", () => {
    const proj = mkProject("ptu-opt-in");
    const sid = "sess-ptu-777";
    runHook(
      {
        hook_event_name: "PostToolUse",
        session_id: sid,
        tool_name: "Bash",
        tool_use_id: "tu_777",
        duration_ms: 123,
      },
      { projectDir: proj, env: { GSD_T_CAPTURE_TOOL_USES: "1" } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    const f = frames[0];
    assert.equal(f.type, "tool_use");
    assert.equal(f.name, "Bash");
    assert.equal(f.tool_use_id, "tu_777");
    assert.equal(f.duration_ms, 123);
  });
});

describe("M45 D2 conversation-capture: content cap", () => {
  it("truncates content > 16 KB and sets truncated: true", () => {
    const proj = mkProject("cap");
    const sid = "sess-cap-888";
    const big = "x".repeat(20 * 1024); // 20 KB
    runHook(
      {
        hook_event_name: "UserPromptSubmit",
        session_id: sid,
        prompt: big,
      },
      { projectDir: proj }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    const f = frames[0];
    assert.equal(f.truncated, true);
    assert.ok(Buffer.byteLength(f.content, "utf8") <= 16 * 1024,
      "content must fit within 16 KB cap");
  });
});

describe("M45 D2 conversation-capture: silent no-op outside GSD-T project", () => {
  it("writes nothing when no .gsd-t/progress.md is discoverable", () => {
    // bareTmp has no .gsd-t/ in the walk-up path.
    const bareTmp = fs.mkdtempSync(path.join(baseTmp, "bare-"));
    const sid = "sess-bare";
    // Explicitly empty GSD_T_PROJECT_DIR and set cwd to a non-GSD-T dir.
    const result = spawnSync("node", [HOOK], {
      input: JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: sid,
        prompt: "won't-land",
      }),
      encoding: "utf8",
      cwd: bareTmp,
      env: { ...process.env, GSD_T_PROJECT_DIR: "" },
    });
    assert.equal(result.status, 0);
    // No in-session ndjson should land anywhere in bareTmp.
    const transcriptsDir = path.join(bareTmp, ".gsd-t", "transcripts");
    assert.equal(fs.existsSync(transcriptsDir), false);
  });
});

describe("M45 D2 conversation-capture: session-id fallback", () => {
  it("uses a pid-based fallback session id when payload omits session_id", () => {
    const proj = mkProject("sid-fallback");
    runHook(
      { hook_event_name: "UserPromptSubmit", prompt: "no-sid" },
      { projectDir: proj }
    );
    // Expect exactly one in-session-*.ndjson, with a pid- prefix.
    const tdir = path.join(proj, ".gsd-t", "transcripts");
    const files = fs.readdirSync(tdir).filter((f) => f.startsWith("in-session-"));
    assert.equal(files.length, 1);
    assert.ok(
      files[0].startsWith("in-session-pid-"),
      "fallback session id must use pid- prefix: got " + files[0]
    );
  });

  it("falls through to pid- fallback when session_id contains path separators or '..' (Red Team BUG-1)", () => {
    // Attack: session_id="a/../b" used to lexically collapse in path.join
    // and produce transcripts/b.ndjson (no `in-session-` prefix), breaking
    // the filename-prefix discriminator contract with the viewer + compact-detector.
    const proj = mkProject("sid-attack");
    for (const malformed of ["a/../b", "..", "foo/bar", "a\\b", "a\0b"]) {
      runHook(
        { hook_event_name: "UserPromptSubmit", session_id: malformed, prompt: "x" },
        { projectDir: proj }
      );
    }
    const tdir = path.join(proj, ".gsd-t", "transcripts");
    const files = fs.readdirSync(tdir);
    // Every file must carry the `in-session-` prefix (no bare `b.ndjson` escapees).
    for (const f of files) {
      assert.ok(f.startsWith("in-session-"),
        "every transcript must keep the in-session- prefix; got " + f);
    }
    // And no file is named with the attacker-chosen suffix.
    assert.ok(!files.includes("b.ndjson"),
      "bare b.ndjson must never be produced from a malformed session_id");
  });
});
