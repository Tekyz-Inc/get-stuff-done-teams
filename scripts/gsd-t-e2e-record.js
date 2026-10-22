#!/usr/bin/env node
/**
 * gsd-t-e2e-record.js — PostToolUse hook on Bash.
 *
 * Records a finished Playwright run's outcome ("failed" / "passed", from its
 * own summary line) for the build-speed guard. Most failed runs arrive here,
 * not at PostToolUseFailure: piped through `tail`, the command exits 0.
 * Logic lives in gsd-t-build-speed-guard.js. [RULE] guards-decide-from-recorded-facts
 */
"use strict";
const guard = require("./gsd-t-build-speed-guard.js");
const payload = guard.readPayload();
const r = payload.tool_response || {};
guard.record(payload, [r.stdout, r.stderr].filter((x) => typeof x === "string").join("\n"));
