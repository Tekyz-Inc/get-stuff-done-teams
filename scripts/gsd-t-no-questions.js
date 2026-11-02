#!/usr/bin/env node
/**
 * gsd-t-no-questions.js — PreToolUse hook on AskUserQuestion.
 *
 * While questions are off (the default), a question is denied with a reason
 * telling Claude to decide, list the choice under "Decisions made", and keep
 * going. A separate file because the installer ties each hook script to one event.
 * Logic lives in gsd-t-never-wait.js. [RULE] questions-off-unless-turned-on
 */
"use strict";
const nw = require("./gsd-t-never-wait.js");
const payload = nw.readPayload();
if (!nw.questionsOn(payload.session_id)) {
  nw.emit({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: nw.QUESTION_ANSWER } });
}
