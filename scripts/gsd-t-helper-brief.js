#!/usr/bin/env node
/**
 * gsd-t-helper-brief.js — SubagentStart hook.
 *
 * Every helper starts with David's standing rule (never wait on David; never invent;
 * cite each decision; keep deletes simple; leave a refused command for David). A rule kept only in
 * the main session's memory never reaches a helper's brief.
 * Silent while questions are on. Logic lives in gsd-t-never-wait.js.
 * [RULE] helpers-get-the-rule
 */
"use strict";
const nw = require("./gsd-t-never-wait.js");
const payload = nw.readPayload();
if (!nw.questionsOn(payload.session_id)) {
  nw.emit({ hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: nw.HELPER_BRIEF } });
}
