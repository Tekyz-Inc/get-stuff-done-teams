/**
 * transcript-parser.js
 *
 * Parses a Claude Code transcript JSONL file and reconstructs it into the
 * `{ system, messages }` shape expected by Anthropic's `count_tokens` endpoint.
 *
 * ------------------------------------------------------------------------
 * Claude Code transcript JSONL format (UNDOCUMENTED — observed empirically
 * from real session files under ~/.claude/projects/<slug>/*.jsonl).
 *
 * Each line is a single JSON object. Observed top-level `type` values:
 *
 *   - "user"         — user turn. `message` = { role: "user", content: STRING|ARRAY }.
 *                      When `content` is an array, it contains blocks like
 *                      { type: "tool_result", tool_use_id, content, is_error? }.
 *                      `content` on the tool_result block can itself be a string
 *                      or an array of text/image blocks.
 *
 *   - "assistant"    — assistant turn. `message` = { role, content: ARRAY, model,
 *                      id, stop_reason, usage, ... }. `content` blocks observed:
 *                        { type: "text", text }
 *                        { type: "thinking", thinking, signature }
 *                        { type: "tool_use", id, name, input, caller? }
 *
 *   - "system"       — system/tool hook metadata (subtype, hookInfos, etc.).
 *                      No message payload; SKIPPED.
 *
 *   - "summary"      — session metadata; SKIPPED.
 *   - "attachment"   — file/image attachment metadata; SKIPPED for count purposes
 *                      (count_tokens only needs role/content message blocks).
 *   - "file-history-snapshot"  — editor file state; SKIPPED.
 *   - "permission-mode"        — session flag; SKIPPED.
 *   - "queue-operation"        — internal; SKIPPED.
 *   - "last-prompt"            — internal; SKIPPED.
 *   - (any other / unknown)    — SKIPPED with a no-op (forward-compatible).
 *
 * Example scrubbed shapes (content replaced with "..."):
 *
 *   {"type":"user","message":{"role":"user","content":"..."},"uuid":"...","sessionId":"..."}
 *
 *   {"type":"user","message":{"role":"user","content":[
 *      {"type":"tool_result","tool_use_id":"toolu_01...","content":"...","is_error":false}
 *   ]},"uuid":"..."}
 *
 *   {"type":"assistant","message":{"role":"assistant","content":[
 *      {"type":"text","text":"..."},
 *      {"type":"tool_use","id":"toolu_01...","name":"Read","input":{"file_path":"..."}}
 *   ],"model":"claude-...","usage":{...}}}
 *
 * ------------------------------------------------------------------------
 * count_tokens request body shape:
 *
 *   {
 *     "system":   "",
 *     "messages": [
 *        { "role": "user"|"assistant", "content": [ {type, ...}, ... ] },
 *        ...
 *     ]
 *   }
 *
 * The parser:
 *   - Streams the file line-by-line via readline (transcripts can be large).
 *   - Keeps only user/assistant message content in insertion order.
 *   - Filters out assistant `thinking` blocks (not accepted by count_tokens).
 *   - Preserves the natural pairing of assistant `tool_use` blocks with their
 *     later user `tool_result` blocks — they already appear in chronological
 *     order in the JSONL, so pairing is implicit (same tool_use_id).
 *   - On unreadable file or a JSON.parse throw at the top-level: returns null.
 *     Malformed INDIVIDUAL lines inside an otherwise valid file are skipped.
 *
 * Zero external deps — built-in `fs`, `readline` only.
 *
 * @module scripts/context-meter/transcript-parser
 */

"use strict";

const fs = require("fs");
const readline = require("readline");

/**
 * Parse a Claude Code transcript JSONL file.
 *
 * @param {string} transcriptPath - absolute path to a Claude Code transcript .jsonl
 * @returns {Promise<{system: string, messages: Array<{role: string, content: Array}>} | null>}
 *          Resolves to the reconstructed body, or `null` on unreadable file /
 *          catastrophic parse failure. Caller treats `null` as "bail out, fail open".
 */
async function parseTranscript(transcriptPath) {
  if (typeof transcriptPath !== "string" || transcriptPath.length === 0) {
    return null;
  }

  // Existence/readability check before opening a stream — readline errors on
  // ENOENT are awkward to catch cleanly.
  try {
    fs.accessSync(transcriptPath, fs.constants.R_OK);
  } catch (_) {
    return null;
  }

  const messages = [];
  let system = "";

  let stream;
  try {
    stream = fs.createReadStream(transcriptPath, { encoding: "utf8" });
  } catch (_) {
    return null;
  }

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      let evt;
      try {
        evt = JSON.parse(line);
      } catch (_) {
        // Malformed line in the middle — skip, keep going.
        continue;
      }

      if (!evt || typeof evt !== "object") continue;

      const type = evt.type;

      if (type === "user" || type === "assistant") {
        const msg = evt.message;
        if (!msg || typeof msg !== "object") continue;

        const role = msg.role || type;
        const content = normalizeContent(msg.content, role);
        if (content === null) continue;

        messages.push({ role, content });
        continue;
      }

      // All other event types are skipped (summary, system, attachment,
      // file-history-snapshot, permission-mode, queue-operation, last-prompt,
      // and any unknown future type).
    }
  } catch (_) {
    // Stream read error mid-flight — bail out fail-open.
    return null;
  }

  return { system, messages };
}

/**
 * Normalize a message.content value into the array-of-blocks shape expected
 * by count_tokens. Returns null if the content is unusable.
 *
 * - String content → [{ type: "text", text: content }]
 * - Array content  → filtered copy retaining only supported block types
 * - Anything else  → null
 *
 * Blocks dropped:
 *   - assistant "thinking" blocks (not part of count_tokens message schema)
 *   - blocks missing their own `type` field
 *
 * Blocks kept:
 *   - text       → { type, text }
 *   - tool_use   → { type, id, name, input }
 *   - tool_result→ { type, tool_use_id, content, (is_error) }
 *   - image      → { type, source } (pass-through)
 *   - anything else with a type string → passed through untouched (forward-compat)
 */
function normalizeContent(content, _role) {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  if (!Array.isArray(content)) return null;

  const out = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const t = block.type;
    if (typeof t !== "string") continue;

    if (t === "thinking") continue;

    if (t === "text") {
      if (typeof block.text === "string") {
        out.push({ type: "text", text: block.text });
      }
      continue;
    }

    if (t === "tool_use") {
      // Must have id, name, input to be meaningful.
      if (typeof block.id !== "string" || typeof block.name !== "string") continue;
      out.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input != null ? block.input : {},
      });
      continue;
    }

    if (t === "tool_result") {
      if (typeof block.tool_use_id !== "string") continue;
      const resultBlock = {
        type: "tool_result",
        tool_use_id: block.tool_use_id,
        content: normalizeToolResultContent(block.content),
      };
      if (block.is_error === true) resultBlock.is_error = true;
      out.push(resultBlock);
      continue;
    }

    // Unknown but typed block — pass through minimally (forward-compat).
    out.push({ ...block });
  }

  if (out.length === 0) return null;
  return out;
}

/**
 * Normalize the `content` field of a tool_result block. It may itself be a
 * string or an array of blocks (text / image). count_tokens accepts either
 * form, but we normalize string to array for consistency.
 */
function normalizeToolResultContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const out = [];
  for (const b of content) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && typeof b.text === "string") {
      out.push({ type: "text", text: b.text });
    } else if (b.type === "image" && b.source) {
      out.push({ type: "image", source: b.source });
    }
    // other inner types dropped
  }
  return out.length > 0 ? out : "";
}

module.exports = { parseTranscript };
