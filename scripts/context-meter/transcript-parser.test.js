"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { parseTranscript } = require("./transcript-parser");

/* ----------------------------- fixture helpers ---------------------------- */

function mkTmpFile(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tp-"));
  const file = path.join(dir, "transcript.jsonl");
  const body = (lines || []).map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n");
  fs.writeFileSync(file, body);
  return { dir, file };
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
}

/* --------------------------------- tests ---------------------------------- */

test("nonexistent file → returns null", async () => {
  const got = await parseTranscript("/definitely/not/a/real/path/xyz-9999.jsonl");
  assert.equal(got, null);
});

test("empty path / non-string → returns null", async () => {
  assert.equal(await parseTranscript(""), null);
  assert.equal(await parseTranscript(null), null);
  assert.equal(await parseTranscript(undefined), null);
});

test("empty file → returns { system:'', messages:[] }", async () => {
  const { dir, file } = mkTmpFile([]);
  try {
    const got = await parseTranscript(file);
    assert.deepEqual(got, { system: "", messages: [] });
  } finally {
    cleanup(dir);
  }
});

test("file with only unknown event types → { system:'', messages:[] }", async () => {
  const { dir, file } = mkTmpFile([
    { type: "summary", foo: "bar" },
    { type: "system", subtype: "hook", hookInfos: [] },
    { type: "attachment", attachment: { name: "x.png" } },
    { type: "permission-mode", permissionMode: "default" },
    { type: "queue-operation", operation: "push" },
    { type: "some-future-type", foo: 1 },
  ]);
  try {
    const got = await parseTranscript(file);
    assert.deepEqual(got, { system: "", messages: [] });
  } finally {
    cleanup(dir);
  }
});

test("normal conversation — string-content user + text assistant", async () => {
  const { dir, file } = mkTmpFile([
    { type: "summary", foo: "bar" },
    {
      type: "user",
      message: { role: "user", content: "Hello, Claude." },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "secret reasoning", signature: "abc" },
          { type: "text", text: "Hi there!" },
        ],
      },
    },
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.system, "");
    assert.equal(got.messages.length, 2);

    assert.deepEqual(got.messages[0], {
      role: "user",
      content: [{ type: "text", text: "Hello, Claude." }],
    });

    // thinking block must be stripped
    assert.deepEqual(got.messages[1], {
      role: "assistant",
      content: [{ type: "text", text: "Hi there!" }],
    });
  } finally {
    cleanup(dir);
  }
});

test("tool_use / tool_result pairing by tool_use_id preserved in order", async () => {
  const TOOL_ID = "toolu_01ABC";
  const { dir, file } = mkTmpFile([
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          {
            type: "tool_use",
            id: TOOL_ID,
            name: "Read",
            input: { file_path: "/tmp/x" },
            caller: "ignored",
          },
        ],
      },
    },
    {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: TOOL_ID,
            content: "file contents here",
            is_error: false,
          },
        ],
      },
    },
    {
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "Done." }] },
    },
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.messages.length, 3);

    // assistant turn: text + tool_use (caller stripped, input preserved)
    assert.equal(got.messages[0].role, "assistant");
    assert.equal(got.messages[0].content.length, 2);
    assert.deepEqual(got.messages[0].content[0], { type: "text", text: "Let me check." });
    assert.deepEqual(got.messages[0].content[1], {
      type: "tool_use",
      id: TOOL_ID,
      name: "Read",
      input: { file_path: "/tmp/x" },
    });

    // user turn with tool_result, id matches, content normalized to string
    assert.equal(got.messages[1].role, "user");
    assert.equal(got.messages[1].content.length, 1);
    const tr = got.messages[1].content[0];
    assert.equal(tr.type, "tool_result");
    assert.equal(tr.tool_use_id, TOOL_ID);
    assert.equal(tr.content, "file contents here");
    assert.equal(tr.is_error, undefined); // false is not preserved

    // final assistant
    assert.equal(got.messages[2].role, "assistant");
    assert.deepEqual(got.messages[2].content, [{ type: "text", text: "Done." }]);
  } finally {
    cleanup(dir);
  }
});

test("tool_result with array content (text blocks) is normalized", async () => {
  const { dir, file } = mkTmpFile([
    {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_02",
            content: [
              { type: "text", text: "line 1" },
              { type: "text", text: "line 2" },
              { type: "weird", value: 3 },
            ],
          },
        ],
      },
    },
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.messages.length, 1);
    const tr = got.messages[0].content[0];
    assert.equal(tr.type, "tool_result");
    assert.deepEqual(tr.content, [
      { type: "text", text: "line 1" },
      { type: "text", text: "line 2" },
    ]);
  } finally {
    cleanup(dir);
  }
});

test("tool_result with is_error:true preserved", async () => {
  const { dir, file } = mkTmpFile([
    {
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_03", content: "oops", is_error: true },
        ],
      },
    },
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.messages[0].content[0].is_error, true);
  } finally {
    cleanup(dir);
  }
});

test("malformed line in the middle → skipped, surrounding lines kept", async () => {
  const { dir, file } = mkTmpFile([
    JSON.stringify({ type: "user", message: { role: "user", content: "first" } }),
    "{this is not valid json",
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "second" }] } }),
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.messages.length, 2);
    assert.equal(got.messages[0].content[0].text, "first");
    assert.equal(got.messages[1].content[0].text, "second");
  } finally {
    cleanup(dir);
  }
});

test("user/assistant entry with no message field → skipped", async () => {
  const { dir, file } = mkTmpFile([
    { type: "user" },
    { type: "assistant", message: null },
    { type: "user", message: { role: "user", content: "kept" } },
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.messages.length, 1);
    assert.equal(got.messages[0].content[0].text, "kept");
  } finally {
    cleanup(dir);
  }
});

test("tool_use missing id or name → block dropped", async () => {
  const { dir, file } = mkTmpFile([
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "ok" },
          { type: "tool_use", name: "NoId", input: {} },
          { type: "tool_use", id: "toolu_x" /* no name */ },
        ],
      },
    },
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.messages.length, 1);
    // only text block survives
    assert.equal(got.messages[0].content.length, 1);
    assert.equal(got.messages[0].content[0].type, "text");
  } finally {
    cleanup(dir);
  }
});

test("blank / whitespace-only lines are skipped", async () => {
  const { dir, file } = mkTmpFile([
    "",
    "   ",
    JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    "",
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.messages.length, 1);
  } finally {
    cleanup(dir);
  }
});

test("message with content array but no recognized blocks → message skipped", async () => {
  const { dir, file } = mkTmpFile([
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "thinking", thinking: "x", signature: "y" }],
      },
    },
    { type: "user", message: { role: "user", content: "survivor" } },
  ]);
  try {
    const got = await parseTranscript(file);
    assert.equal(got.messages.length, 1);
    assert.equal(got.messages[0].content[0].text, "survivor");
  } finally {
    cleanup(dir);
  }
});
