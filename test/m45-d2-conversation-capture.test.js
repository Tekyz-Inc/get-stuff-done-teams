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
  it("writes an assistant_turn frame with content when payload carries it (legacy fallback shape)", () => {
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

  it("writes a stub assistant_turn frame (no content) when payload omits content AND transcript_path", () => {
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

describe("M45 D2 conversation-capture: Stop reads transcript_path (M53 D? regression)", () => {
  // The Claude Code Stop hook payload is {session_id, transcript_path, ...}
  // — the message body is in the transcript JSONL, not the payload itself.
  // These tests pin the new behavior: hook reads the assistant row from the
  // transcript tail and extracts the body.

  function mkFakeTranscriptHome() {
    // Mirror the real layout: ~/.claude/projects/<dir>/<sid>.jsonl. Tests
    // override $HOME so _safeTranscriptPath's allow-root check passes
    // against the temp tree.
    const home = fs.mkdtempSync(path.join(baseTmp, "fake-home-"));
    const projects = path.join(home, ".claude", "projects", "fake-proj");
    fs.mkdirSync(projects, { recursive: true });
    return { home, projectsDir: projects };
  }

  function writeTranscript(projectsDir, name, lines) {
    const p = path.join(projectsDir, name);
    fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
    return p;
  }

  it("extracts assistant content from a real-shaped transcript JSONL", () => {
    const proj = mkProject("stop-transcript-happy");
    const sid = "sess-stop-tr-001";
    const { home, projectsDir } = mkFakeTranscriptHome();
    const tp = writeTranscript(projectsDir, sid + ".jsonl", [
      { type: "user", message: { role: "user", content: "hi" } },
      {
        type: "assistant",
        isSidechain: false,
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Hello from the orchestrator." },
          ],
        },
      },
    ]);
    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, "assistant_turn");
    assert.equal(frames[0].content, "Hello from the orchestrator.");
  });

  it("concatenates multiple text blocks; ignores tool_use blocks", () => {
    const proj = mkProject("stop-transcript-mixed");
    const sid = "sess-stop-tr-002";
    const { home, projectsDir } = mkFakeTranscriptHome();
    const tp = writeTranscript(projectsDir, sid + ".jsonl", [
      {
        type: "assistant",
        isSidechain: false,
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "First. " },
            { type: "tool_use", id: "tu_1", name: "Bash", input: { cmd: "ls" } },
            { type: "text", text: "Second." },
          ],
        },
      },
    ]);
    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames[0].content, "First. Second.");
    assert.ok(!frames[0].content.includes("Bash"), "tool_use blocks must not bleed into content");
    assert.ok(!frames[0].content.includes("tu_1"), "tool_use ids must not bleed into content");
  });

  it("picks the LAST orchestrator assistant row when transcript has many", () => {
    const proj = mkProject("stop-transcript-latest");
    const sid = "sess-stop-tr-003";
    const { home, projectsDir } = mkFakeTranscriptHome();
    const tp = writeTranscript(projectsDir, sid + ".jsonl", [
      { type: "assistant", isSidechain: false, message: { role: "assistant", content: [{ type: "text", text: "earlier turn" }] } },
      { type: "user", message: { role: "user", content: "follow-up" } },
      { type: "assistant", isSidechain: false, message: { role: "assistant", content: [{ type: "text", text: "LATEST TURN" }] } },
    ]);
    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames[0].content, "LATEST TURN");
  });

  it("skips sidechain (subagent) assistant rows", () => {
    const proj = mkProject("stop-transcript-sidechain");
    const sid = "sess-stop-tr-004";
    const { home, projectsDir } = mkFakeTranscriptHome();
    const tp = writeTranscript(projectsDir, sid + ".jsonl", [
      { type: "assistant", isSidechain: false, message: { role: "assistant", content: [{ type: "text", text: "ORCHESTRATOR REPLY" }] } },
      // Newer-but-sidechain row: must be skipped.
      { type: "assistant", isSidechain: true, message: { role: "assistant", content: [{ type: "text", text: "subagent reply" }] } },
    ]);
    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames[0].content, "ORCHESTRATOR REPLY");
  });

  it("skips tool_use-only assistant rows and falls back to an earlier text-bearing row", () => {
    const proj = mkProject("stop-transcript-tool-only");
    const sid = "sess-stop-tr-005";
    const { home, projectsDir } = mkFakeTranscriptHome();
    const tp = writeTranscript(projectsDir, sid + ".jsonl", [
      { type: "assistant", isSidechain: false, message: { role: "assistant", content: [{ type: "text", text: "the real answer" }] } },
      // Newer assistant row but tool_use-only — should be skipped.
      { type: "assistant", isSidechain: false, message: { role: "assistant", content: [{ type: "tool_use", id: "t", name: "Read", input: {} }] } },
    ]);
    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames[0].content, "the real answer");
  });

  it("rejects path-traversal transcript_path (e.g. /etc/passwd) and returns stub", () => {
    const proj = mkProject("stop-transcript-attack");
    const sid = "sess-stop-tr-006";
    const { home } = mkFakeTranscriptHome();
    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: "/etc/passwd" },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, "assistant_turn");
    assert.ok(!("content" in frames[0]),
      "outside-allowed-root paths must be rejected — frame should be a stub, not /etc/passwd contents");
  });

  it("rejects relative transcript_path and returns stub", () => {
    const proj = mkProject("stop-transcript-relative");
    const sid = "sess-stop-tr-007";
    const { home } = mkFakeTranscriptHome();
    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: "../../etc/passwd" },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.ok(!("content" in frames[0]));
  });

  it("transcript_path missing → falls through to legacy assistant_message shape", () => {
    const proj = mkProject("stop-transcript-fallback");
    const sid = "sess-stop-tr-008";
    runHook(
      { hook_event_name: "Stop", session_id: sid, assistant_message: "fallback wins" },
      { projectDir: proj }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames[0].content, "fallback wins");
  });

  it("transcript file unreadable → returns stub, doesn't crash", () => {
    const proj = mkProject("stop-transcript-unreadable");
    const sid = "sess-stop-tr-009";
    const { home, projectsDir } = mkFakeTranscriptHome();
    // Path is under the allowed root but the file does not exist.
    const tp = path.join(projectsDir, "does-not-exist.jsonl");
    const result = runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { projectDir: proj, env: { HOME: home } }
    );
    assert.equal(result.status, 0, "hook must not crash on missing transcript file");
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    assert.ok(!("content" in frames[0]));
  });

  it("very large transcript: only the tail is read (no full-file load)", () => {
    const proj = mkProject("stop-transcript-large");
    const sid = "sess-stop-tr-010";
    const { home, projectsDir } = mkFakeTranscriptHome();
    const tp = path.join(projectsDir, sid + ".jsonl");

    // Build a >1 MB file. Most lines are large user/text payloads; the LAST
    // line is the only assistant row. The hook caps tail-read at 64 KB, so
    // reading must not require seeing earlier lines.
    const filler = "x".repeat(2048); // 2 KB per line
    const stream = fs.openSync(tp, "w");
    try {
      // ~1.2 MB of filler.
      for (let i = 0; i < 600; i++) {
        const line = JSON.stringify({ type: "user", message: { role: "user", content: filler + ":" + i } }) + "\n";
        fs.writeSync(stream, line);
      }
      const last = JSON.stringify({
        type: "assistant",
        isSidechain: false,
        message: { role: "assistant", content: [{ type: "text", text: "TAIL-ONLY MARKER" }] },
      }) + "\n";
      fs.writeSync(stream, last);
    } finally {
      fs.closeSync(stream);
    }

    const { size } = fs.statSync(tp);
    assert.ok(size > 1024 * 1024, "fixture transcript must exceed 1 MB to exercise tail-only read; got " + size);

    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames[0].content, "TAIL-ONLY MARKER");
  });

  it("transcript_path with corrupt JSON lines: skip them, find the next valid assistant row", () => {
    const proj = mkProject("stop-transcript-corrupt");
    const sid = "sess-stop-tr-011";
    const { home, projectsDir } = mkFakeTranscriptHome();
    const tp = path.join(projectsDir, sid + ".jsonl");
    const goodLine = JSON.stringify({
      type: "assistant",
      isSidechain: false,
      message: { role: "assistant", content: [{ type: "text", text: "survived corruption" }] },
    });
    fs.writeFileSync(tp, goodLine + "\n" + "{not valid json,," + "\n", "utf8");

    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { projectDir: proj, env: { HOME: home } }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames[0].content, "survived corruption");
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
