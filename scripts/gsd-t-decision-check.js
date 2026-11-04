#!/usr/bin/env node
/**
 * gsd-t-decision-check.js — Stop hook.
 *
 * An invention is a fallback. While questions are off, every item under
 * "Decisions made" must quote a real source; the hook checks the words are in
 * that file, or in what David typed. A failing reply is sent back once. If it
 * still fails, David is warned; it never loops and never stays silent.
 * Logic lives in gsd-t-never-wait.js. [RULE] no-inventions
 */
"use strict";
require("./gsd-t-never-wait.js").decisionHook();
