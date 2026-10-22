#!/usr/bin/env node
/**
 * gsd-t-e2e-failure-record.js — PostToolUseFailure hook on Bash.
 *
 * Records a Playwright run that exited non-zero; its output arrives in the
 * `error` string ("Exit code N" then the output). A separate file because the
 * installer ties each hook script to one event.
 * Logic lives in gsd-t-build-speed-guard.js. [RULE] guards-decide-from-recorded-facts
 */
"use strict";
const guard = require("./gsd-t-build-speed-guard.js");
const payload = guard.readPayload();
guard.record(payload, typeof payload.error === "string" ? payload.error : "");
