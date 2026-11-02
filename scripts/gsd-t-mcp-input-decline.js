#!/usr/bin/env node
/**
 * gsd-t-mcp-input-decline.js — Elicitation hook.
 *
 * An MCP server asking the user for input mid-task opens a dialog with no
 * timeout. While questions are off it is declined, so no dialog appears and the
 * server gets "decline". Logic lives in gsd-t-never-wait.js.
 * [RULE] questions-off-unless-turned-on
 */
"use strict";
const nw = require("./gsd-t-never-wait.js");
const payload = nw.readPayload();
if (!nw.questionsOn(payload.session_id)) {
  nw.emit({ hookSpecificOutput: { hookEventName: "Elicitation", action: "decline" } });
}
