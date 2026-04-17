/**
 * test/router-intent.test.js
 *
 * Structural tests for the Smart Router intent classifier (M38 RC).
 * The router lives in `commands/gsd.md` as a prose skill consumed by
 * Claude Code. There is no JS to invoke, so these tests assert the
 * file's structural contract:
 *   - Step 2a (continuation) exists and routes into Step 2.5
 *   - Step 2.5 (intent classification) exists with conversational + workflow categories
 *   - Step 3 documents the conversational output header
 *   - Valid command slugs list no longer names the deleted commands
 *   - Step 4 help text mentions conversational mode
 */

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const GSD = fs.readFileSync(path.join(__dirname, "..", "commands", "gsd.md"), "utf8");

test("router — Step 2a continuation check exists and forwards to Step 2.5", () => {
  assert.match(GSD, /## Step 2a: Continuation Check/);
  assert.match(GSD, /proceed to Step 2\.5 \(intent classification\)/);
});

test("router — Step 2.5 intent classification section exists with all three category headers", () => {
  assert.match(GSD, /## Step 2\.5: Intent Classification/);
  assert.match(GSD, /### Conversational triggers/);
  assert.match(GSD, /### Workflow triggers/);
  assert.match(GSD, /### Default/);
});

test("router — conversational triggers include the three deleted-command use cases", () => {
  const section = GSD.split("## Step 2.5")[1].split("## Step 2:")[0];
  assert.match(section, /think through/i, "gsd-t-prompt use case");
  assert.match(section, /brainstorm|stuck|rethink/i, "gsd-t-brainstorm use case");
  assert.match(section, /trade-offs|explore|options/i, "gsd-t-discuss use case");
});

test("router — ambiguous requests default to conversational", () => {
  assert.match(GSD, /default to \*\*conversational\*\*/i);
});

test("router — Step 3 documents the conversational output header", () => {
  assert.match(GSD, /→ Conversational mode \(no command spawn\)/);
  assert.match(GSD, /### Conversational \(from Step 2\.5\)/);
});

test("router — valid slugs list no longer names the deleted conversational commands", () => {
  const slugsLine = GSD.match(/Valid command slugs:[^\n]*/);
  assert.ok(slugsLine, "valid slugs line must exist");
  const text = slugsLine[0];
  assert.ok(!/\bdiscuss\b/.test(text), "`discuss` slug must be removed");
  assert.ok(!/\bbrainstorm\b/.test(text), "`brainstorm` slug must be removed");
  assert.ok(!/\bprompt\b/.test(text), "`prompt` slug must be removed");
  assert.match(text, /\bquick\b/);
  assert.match(text, /\bexecute\b/);
});

test("router — no Phase→command table row points to a retired slug", () => {
  const phaseTable = GSD.split("| Phase in progress.md |")[1].split("**CRITICAL")[0];
  assert.ok(!/\bdiscuss\b/i.test(phaseTable));
  assert.ok(!/\bbrainstorm\b/i.test(phaseTable));
});

test("router — Step 4 help text mentions conversational mode", () => {
  const step4 = GSD.split("## Step 4:")[1] || "";
  assert.match(step4, /conversational|think/i);
});
