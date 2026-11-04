#!/usr/bin/env node
/**
 * gsd-t-invention-guard.js — PreToolUse hook on Write|Edit.
 *
 * Denies a write that adds a line marked as Claude's recommendation unless that
 * line quotes a real source, or David approved the item in .gsd-t/inventions.json.
 * On all the time, like the fallback guard; it denies on any error.
 * Logic lives in gsd-t-never-wait.js. [RULE] no-inventions
 */
"use strict";
require("./gsd-t-never-wait.js").inventionGuard();
