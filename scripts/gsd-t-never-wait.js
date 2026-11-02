#!/usr/bin/env node
/**
 * gsd-t-never-wait.js — PermissionRequest hook. Nothing waits on David.
 *
 * Claude Code shows a permission prompt in bypass mode for a few built-in
 * safety checks (a removal it cannot rule out as dangerous, for one). Unwatched,
 * that prompt stalls the session and every helper behind it — 2026-11-02,
 * ATOS-V2: one `for … done && rm -f dir/*` line waited 314 minutes overnight.
 *
 * While questions are off (the default) this hook answers every prompt NO for
 * him, with a reason Claude reads: the command does not run, nothing waits, and
 * Claude leaves that step for him and carries on. It never answers YES, so a
 * dangerous command is never let through. [RULE] prompts-answered-no
 *
 * Questions are on for a session after `gsd-t questions on` inside it (12 hours,
 * or until `gsd-t questions off`); then the hooks stay silent. Keyed by the
 * session id, which hooks receive and the Bash tool sees as
 * CLAUDE_CODE_SESSION_ID — a folder would change under Claude's `cd`.
 * [RULE] questions-off-unless-turned-on
 *
 * Also the module the other hooks share: gsd-t-no-questions.js (PreToolUse
 * AskUserQuestion), gsd-t-helper-brief.js (SubagentStart),
 * gsd-t-mcp-input-decline.js (Elicitation), gsd-t-question-stop.js (Stop).
 *
 * Plan: .gsd-t/pseudocode/PseudoCode-NeverWait.md
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const QUESTIONS_ON_HOURS = 12;

// Leaving plan mode asks David to approve the plan. He entered plan mode
// himself, which is an explicit "stop for this" — never answered for him.
// [RULE] his-own-stops-kept
const HIS_OWN_STOPS = ["ExitPlanMode"];

function switchDir() {
  return path.join(os.homedir(), ".claude", "gsd-t-questions-on");
}

// One marker file per session; its age is the clock. Nothing to parse.
function markerFor(sessionId) {
  return path.join(switchDir(), crypto.createHash("sha1").update(sessionId).digest("hex").slice(0, 16));
}

// No session id → no switch was ever set for it → off.
function questionsOn(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return false;
  const m = markerFor(sessionId);
  if (!fs.existsSync(m)) return false;
  return Date.now() - fs.statSync(m).mtimeMs < QUESTIONS_ON_HOURS * 3600 * 1000;
}

function setQuestions(sessionId, on) {
  const m = markerFor(sessionId);
  if (on) {
    fs.mkdirSync(switchDir(), { recursive: true });
    fs.writeFileSync(m, `${sessionId}\n`);
  } else if (fs.existsSync(m)) {
    fs.unlinkSync(m);
  }
}

// Claude Code sends one JSON object. Empty input or a non-object carries no
// session id, which reads as questions off: the answer is still NO, not a crash
// that would show the prompt.
function readPayload() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) return {};
  const p = JSON.parse(raw);
  if (p === null || typeof p !== "object") return {};
  return p;
}

const TURN_ON = "David turns this back on with `gsd-t questions on`.";

const PROMPT_ANSWER =
  "Auto-answered NO: questions and prompts are off, so nothing may wait on David. " +
  "This command needs a person's approval, so it did NOT run. Do not retry it or reword it to get past the check. " +
  "Leave this step undone, put the exact command under \"Decisions made\" in your report so David can run it himself, " +
  "and carry on with everything that does not depend on it. " + TURN_ON;

const QUESTION_ANSWER =
  "Questions are off: David is not here to answer. Make the call yourself: pick the safest " +
  "reasonable option, list it under \"Decisions made\" in your reply, and keep going. A destructive " +
  "or irreversible step nobody asked for: skip it and list it instead. " + TURN_ON;

const QUESTION_STOP =
  "Questions are off: David is not here to answer, so don't end on a question. Make the call yourself " +
  "(the safest reasonable option), list it under \"Decisions made\", and continue the work. If nothing is " +
  "left to do, end with what you decided instead of asking. " + TURN_ON;

const HELPER_BRIEF =
  "Standing rule from David: nothing may wait on him. Do not ask questions (AskUserQuestion is " +
  "blocked); make the safest reasonable call, keep going, and end your report with a \"Decisions " +
  "made\" list. Keep deletes simple so they never need approval: rm on literal file paths, in a " +
  "command of its own — never mixed with a loop, a $VAR or a glob, never the working folder or a " +
  "parent of it. A command that is refused for approval: leave it undone and list it. A destructive " +
  "or irreversible step you were not explicitly told to do: skip it and list it.";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

// A reply that ends by asking David something: its last line (outside code
// and quoted text) ends on "?", on "? (y/n)", or asks him to "let me know".
// A guess from the text; a miss lets the turn end, a false hit costs one turn.
function endsOnQuestion(text) {
  if (typeof text !== "string") return false;
  const lines = text.replace(/```[\s\S]*?(```|$)/g, "").split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith(">"));
  if (!lines.length) return false;
  const last = lines[lines.length - 1].replace(/\s*\((y\/n|yes\/no)\)[.\s]*$/i, "");
  if (/\?[*_)"'\s]*$/.test(last)) return true;
  return /\blet me know\b/i.test(last);
}

function main() {
  const p = readPayload();
  if (HIS_OWN_STOPS.includes(p.tool_name)) return;
  if (questionsOn(p.session_id)) return;
  emit({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: PROMPT_ANSWER, interrupt: false } } });
}

module.exports = {
  QUESTIONS_ON_HOURS, PROMPT_ANSWER, QUESTION_ANSWER, QUESTION_STOP, HELPER_BRIEF,
  switchDir, markerFor, questionsOn, setQuestions, readPayload, emit, endsOnQuestion,
};

if (require.main === module) main();
