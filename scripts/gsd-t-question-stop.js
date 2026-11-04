#!/usr/bin/env node
/**
 * gsd-t-question-stop.js — Stop hook.
 *
 * A reply that ends on a question ("…which one?") leaves the session waiting
 * for David. While questions are off, the first such stop is turned back once
 * with "use a source or park it, never invent, continue"; a stop that is already a continuation
 * (stop_hook_active) is let through, so it never loops.
 * Logic lives in gsd-t-never-wait.js. [RULE] questions-off-unless-turned-on
 */
"use strict";
const nw = require("./gsd-t-never-wait.js");
const payload = nw.readPayload();
if (payload.stop_hook_active !== true && !nw.questionsOn(payload.session_id) && nw.endsOnQuestion(payload.last_assistant_message)) {
  nw.emit({ decision: "block", reason: nw.QUESTION_STOP });
}
