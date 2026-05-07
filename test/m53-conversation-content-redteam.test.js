/**
 * M53 Adversarial Red Team — Journey Edition
 *
 * The conversation-content journey spec at e2e/journeys/conversation-content.spec.ts
 * codifies three invariants the post-fix capture hook MUST honor:
 *
 *   I1. Bubble is non-empty (rules out bodyless frames — the original M53 bug).
 *   I2. Bubble carries the assistant message marker (rules out picking user prompt).
 *   I3. Bubble carries the multi-block tail marker (rules out first-block-only
 *       extraction).
 *
 * This file proves the spec catches each of three deliberately-broken hook
 * implementations. Each adversary is a self-contained extractor function that
 * mimics a regression. We feed each adversary the SAME real-shaped transcript
 * JSONL fixture the unit tests use, capture the resulting `assistant_turn`
 * frame body, and assert the spec invariants (would) fail.
 *
 * NOTE: this test runs the assertions in *Node*, not Playwright — it proves
 * the assertion logic detects the regression, without needing to invoke the
 * dashboard server three more times. The journey spec itself is the live
 * end-to-end net.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Real-shaped transcript fixture: 3 assistant turns, each multi-block, each
// preceded by a user prompt with a marker the hook MUST NOT confuse with the
// assistant body.
const FIXTURE_TRANSCRIPT = [
  { type: "user", isSidechain: false, message: { role: "user", content: "USER-PROMPT-marker-do-not-mirror-into-assistant — first prompt" } },
  {
    type: "assistant",
    isSidechain: false,
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "ASSISTANT-BODY-2-marker-9b1e — opening paragraph of a longer reply with details." },
        { type: "tool_use", id: "tu_1", name: "Bash", input: { cmd: "ls" } },
        { type: "text", text: "\n\nASSISTANT-BODY-2-tail-marker-q4k3 — closing paragraph that proves multi-block concatenation works." },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Adversaries
// ---------------------------------------------------------------------------

// Adversary A — "regress to old code": no transcript reading, fall through to
// the legacy fallback shapes. Stop hook payload doesn't carry any of those
// shapes (Claude Code only sends transcript_path), so the body is null.
function adversaryA_noTranscriptRead(/* transcript */) {
  return null; // hook returns null → frame is bodyless (original M53 bug)
}

// Adversary B — "wrong message": picks the user message instead of assistant.
function adversaryB_picksUserMessage(transcript) {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const row = transcript[i];
    if (row.type === "user" && row.message) {
      const c = row.message.content;
      if (typeof c === "string") return c;
    }
  }
  return null;
}

// Adversary C — "first text block only": picks the FIRST text block of the
// assistant message instead of concatenating ALL text blocks. Long replies
// get silently truncated.
function adversaryC_firstBlockOnly(transcript) {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const row = transcript[i];
    if (row.type !== "assistant" || row.isSidechain === true) continue;
    const blocks = row.message && row.message.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (b && b.type === "text" && typeof b.text === "string") return b.text; // BUG: returns first, never sees second
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Spec invariants — mirrored from e2e/journeys/conversation-content.spec.ts
// ---------------------------------------------------------------------------

function assertI1_nonEmpty(body) {
  assert.ok(body != null, "I1 (non-empty): body must be non-null");
  assert.ok(typeof body === "string" && body.trim().length > 0,
    "I1 (non-empty): body must be a non-empty string");
}
function assertI2_carriesAssistantMarker(body) {
  assert.ok(body && body.includes("ASSISTANT-BODY-2-marker-9b1e"),
    "I2 (assistant marker): body must contain the assistant marker");
  assert.ok(body && !body.includes("USER-PROMPT-marker-do-not-mirror-into-assistant"),
    "I2 (assistant marker): body must NOT include the user prompt marker");
}
function assertI3_carriesTailMarker(body) {
  assert.ok(body && body.includes("ASSISTANT-BODY-2-tail-marker-q4k3"),
    "I3 (tail marker): body must contain the multi-block tail marker");
}

function runAllInvariants(body) {
  assertI1_nonEmpty(body);
  assertI2_carriesAssistantMarker(body);
  assertI3_carriesTailMarker(body);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("M53 Red Team — adversary A (regress to old code, no transcript read)", () => {
  it("violates I1: produces a null/empty body — spec invariant I1 fails", () => {
    const body = adversaryA_noTranscriptRead(FIXTURE_TRANSCRIPT);
    assert.throws(() => runAllInvariants(body), /I1/);
  });
});

describe("M53 Red Team — adversary B (picks user message instead of assistant)", () => {
  it("violates I2: body contains user-prompt marker, not assistant marker — spec invariant I2 fails", () => {
    const body = adversaryB_picksUserMessage(FIXTURE_TRANSCRIPT);
    assert.throws(() => runAllInvariants(body), /I2/);
  });
});

describe("M53 Red Team — adversary C (first text block only, ignores rest)", () => {
  it("violates I3: body lacks the multi-block tail marker — spec invariant I3 fails", () => {
    const body = adversaryC_firstBlockOnly(FIXTURE_TRANSCRIPT);
    // I1 passes (head text is non-empty), I2 passes (head has assistant marker),
    // but I3 fails (tail marker missing — the fingerprint of first-block-only).
    assertI1_nonEmpty(body);
    assertI2_carriesAssistantMarker(body);
    assert.throws(() => assertI3_carriesTailMarker(body), /I3/);
  });
});

// ---------------------------------------------------------------------------
// Positive control: the real implementation must pass ALL invariants on the
// SAME fixture. This proves the harness isn't trivially broken.
// ---------------------------------------------------------------------------

describe("M53 Red Team — positive control (real fix passes all invariants)", () => {
  it("real _readAssistantFromTranscript-style extractor passes I1+I2+I3", () => {
    // Mirror of the real extraction logic so this test stays self-contained.
    function realExtractor(transcript) {
      for (let i = transcript.length - 1; i >= 0; i--) {
        const row = transcript[i];
        if (row.type !== "assistant" || row.isSidechain === true) continue;
        const blocks = row.message && row.message.content;
        if (typeof blocks === "string") return blocks;
        if (!Array.isArray(blocks)) continue;
        const texts = [];
        for (const b of blocks) {
          if (b && b.type === "text" && typeof b.text === "string") texts.push(b.text);
        }
        if (texts.length === 0) continue;
        return texts.join("");
      }
      return null;
    }
    const body = realExtractor(FIXTURE_TRANSCRIPT);
    runAllInvariants(body); // does not throw
  });
});
