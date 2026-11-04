#!/usr/bin/env node
/**
 * gsd-t-helper-decision-check.js — SubagentStop hook.
 *
 * The citation check on a helper's report. A separate file because the
 * installer ties each hook script to one event.
 * Logic lives in gsd-t-never-wait.js. [RULE] no-inventions
 */
"use strict";
require("./gsd-t-never-wait.js").decisionHook();
