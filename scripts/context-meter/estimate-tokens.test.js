/**
 * estimate-tokens.test.js — unit tests for the local token estimator.
 *
 * @module scripts/context-meter/estimate-tokens.test
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { estimateTokens, CHARS_PER_TOKEN } = require("./estimate-tokens");

test("null/undefined opts returns null", () => {
  assert.equal(estimateTokens(null), null);
  assert.equal(estimateTokens(undefined), null);
});

test("missing messages returns null", () => {
  assert.equal(estimateTokens({ system: "hi" }), null);
  assert.equal(estimateTokens({ system: "hi", messages: "not-array" }), null);
});

test("empty messages returns 0 tokens (system empty)", () => {
  const r = estimateTokens({ system: "", messages: [] });
  assert.ok(r);
  assert.equal(r.inputTokens, 0);
});

test("system-only content counted", () => {
  const sys = "a".repeat(350);
  const r = estimateTokens({ system: sys, messages: [] });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil(350 / CHARS_PER_TOKEN));
});

test("text message content counted", () => {
  const r = estimateTokens({
    system: "",
    messages: [
      { role: "user", content: [{ type: "text", text: "a".repeat(700) }] },
    ],
  });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil(700 / CHARS_PER_TOKEN));
});

test("string content (user shorthand) counted", () => {
  const r = estimateTokens({
    system: "",
    messages: [{ role: "user", content: "hello world" }],
  });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil(11 / CHARS_PER_TOKEN));
});

test("tool_use input JSON counted", () => {
  const input = { file_path: "/some/long/path/to/file.js" };
  const inputJson = JSON.stringify(input);
  const toolName = "Read";
  const r = estimateTokens({
    system: "",
    messages: [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: toolName, input }],
      },
    ],
  });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil((toolName.length + inputJson.length) / CHARS_PER_TOKEN));
});

test("tool_result content counted (string)", () => {
  const resultText = "file contents here".repeat(10);
  const r = estimateTokens({
    system: "",
    messages: [
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: resultText },
        ],
      },
    ],
  });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil(resultText.length / CHARS_PER_TOKEN));
});

test("tool_result content counted (array of text blocks)", () => {
  const r = estimateTokens({
    system: "",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: [
              { type: "text", text: "abc" },
              { type: "text", text: "defgh" },
            ],
          },
        ],
      },
    ],
  });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil(8 / CHARS_PER_TOKEN));
});

test("multiple messages accumulate", () => {
  const r = estimateTokens({
    system: "sys".repeat(100),
    messages: [
      { role: "user", content: [{ type: "text", text: "a".repeat(200) }] },
      { role: "assistant", content: [{ type: "text", text: "b".repeat(300) }] },
    ],
  });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil((300 + 200 + 300) / CHARS_PER_TOKEN));
});

test("skips blocks with missing type", () => {
  const r = estimateTokens({
    system: "",
    messages: [
      { role: "user", content: [{ text: "no type field" }, { type: "text", text: "ok" }] },
    ],
  });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil(2 / CHARS_PER_TOKEN));
});

test("handles null/non-object messages gracefully", () => {
  const r = estimateTokens({
    system: "",
    messages: [null, undefined, 42, { role: "user", content: [{ type: "text", text: "ok" }] }],
  });
  assert.ok(r);
  assert.equal(r.inputTokens, Math.ceil(2 / CHARS_PER_TOKEN));
});

test("realistic conversation produces reasonable estimate", () => {
  const msgs = [];
  for (let i = 0; i < 20; i++) {
    msgs.push({ role: "user", content: [{ type: "text", text: "Tell me about X. ".repeat(5) }] });
    msgs.push({
      role: "assistant",
      content: [{ type: "text", text: "Here is info about X. ".repeat(20) }],
    });
  }
  const r = estimateTokens({ system: "You are a helpful assistant.", messages: msgs });
  assert.ok(r);
  assert.ok(r.inputTokens > 500, `expected >500 tokens, got ${r.inputTokens}`);
  assert.ok(r.inputTokens < 10000, `expected <10000 tokens, got ${r.inputTokens}`);
});
