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
 * David, with a reason Claude reads: the command does not run, nothing waits, and
 * Claude leaves that step for David and carries on. It never answers YES, so a
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
 * gsd-t-mcp-input-decline.js (Elicitation), gsd-t-question-stop.js (Stop),
 * gsd-t-decision-check.js (Stop), gsd-t-helper-decision-check.js (SubagentStop),
 * gsd-t-invention-guard.js (PreToolUse Write|Edit).
 *
 * Plan: .gsd-t/pseudocode/PseudoCode-NeverWait.md
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const QUESTIONS_ON_HOURS = 12;
const MIN_QUOTE_WORDS = 3;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_LINES_SHOWN = 10;

// Leaving plan mode asks David to approve the plan. David entered plan mode,
// which is an explicit "stop for this" — never answered automatically.
// [RULE] davids-own-stops-kept
const DAVIDS_OWN_STOPS = ["ExitPlanMode"];

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

// An invention is a fallback: a missing answer filled with made-up behaviour
// instead of a stop. 2026-11, ATOS-V2: an overnight "best recommendation, move
// forward" run built student self sign-up, which no source asked for, and David
// approved it unseen inside a batch. [RULE] no-inventions
const NO_INVENTIONS =
  "Never invent. Does a source (David's docs or words, the existing system, a design David supplied, the law) call for this at all? " +
  "No: there is no hole, so leave it out and ask nothing. " +
  "Yes, and a source answers it or gives the options: pick one and cite it. " +
  "Yes, but no source answers it: build nothing behind it, put one question under \"Left for you\", and carry on with the rest.";

const CITE_FORMAT =
  "Each bullet under the exact heading \"Decisions made\" carries its proof: Source: path/to/file \"exact words from that file\", " +
  "or Source: you \"exact words David typed\". At least " + MIN_QUOTE_WORDS + " words, copied exactly. " +
  "Put \"Decisions made\" last, followed only by \"Left for you\": everything between them is checked. " +
  "Your own plans, logs and memory don't count, nor does a file you wrote this session.";

const PROMPT_ANSWER =
  "Auto-answered NO: questions and prompts are off, so nothing may wait on David. " +
  "This command needs a person's approval, so it did NOT run. Do not retry it or reword it to get past the check. " +
  "Leave this step undone, put the exact command under \"Left for you\" in your report so David can run it himself, " +
  "and carry on with everything that does not depend on it. " + TURN_ON;

const QUESTION_ANSWER =
  "Questions are off: David is not here to answer. " + NO_INVENTIONS + " " + CITE_FORMAT + " " +
  "A destructive or irreversible step nobody asked for: skip it and put it under \"Left for you\". " + TURN_ON;

const QUESTION_STOP =
  "Questions are off: David is not here to answer, so don't end on a question. " + NO_INVENTIONS + " " + CITE_FORMAT + " " +
  "Continue the work; if nothing is left, end by stating what is done and what is left. " + TURN_ON;

const HELPER_BRIEF =
  "Standing rule from David: nothing may wait on David. Do not ask questions (AskUserQuestion is blocked). " +
  NO_INVENTIONS + " " + CITE_FORMAT + " " +
  "Keep deletes simple so they never need approval: rm on literal file paths, in a " +
  "command of its own — never mixed with a loop, a $VAR or a glob, never the working folder or a " +
  "parent of it. A command that is refused for approval, or a destructive or irreversible step you " +
  "were not explicitly told to do: leave it undone and list it under \"Left for you\".";

const DECISION_STOP =
  "These lines under \"Decisions made\" have no checkable source. For each one: cite a real source in the exact format; or, if it is new behaviour no source calls for, " +
  "build nothing further on it and move it to \"Left for you\" as one question, saying what already exists so David can decide; delete nothing. If it is not a decision (a status line, a report section), move it above the \"Decisions made\" heading and change nothing else. " +
  "A how-to choice that changes nothing David would see is not a decision; don't list it. " + NO_INVENTIONS + " " + CITE_FORMAT + " " + TURN_ON;

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

// A reply that ends by asking David something: its last line (outside code
// and quoted text) ends on "?", on "? (y/n)", or asks him to "let me know".
// A guess from the text; a miss lets the turn end, a false hit costs one turn.
function endsOnQuestion(text) {
  if (typeof text !== "string") return false;
  if (text.split("\n").some((l) => isLeftForYou(l.trim()))) return false; // parked as asked; the run has finished
  const lines = text.replace(/```[\s\S]*?(```|$)/g, "").split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith(">"));
  if (!lines.length) return false;
  const last = lines[lines.length - 1].replace(/\s*\((y\/n|yes\/no)\)[.\s]*$/i, "");
  if (/\?[*_)"'\s]*$/.test(last)) return true;
  return /\blet me know\b/i.test(last);
}

// --- Citation check: every listed decision proves its source. ---
// One fixed format, because guessing at free-form sections failed two red teams:
//   Decisions made               (alone on its line; #, ** and a trailing : are fine)
//   - What was chosen. Source: path/to/file "exact words"
//   Left for you
// A near-miss heading is sent back; anything else named differently is not read.

function plainWords(text) {
  return text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/\[([^\[\]\n]{0,300})\]\([^()\n]{0,500}\)/g, "$1").replace(/^[ \t]*>[ \t]?/gm, "").replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

// Lines outside code fences. An unclosed fence hides nothing.
function linesOutsideFences(text) {
  const lines = text.split("\n");
  const drop = new Set();
  let open = -1;
  let fence = "";
  lines.forEach((line, i) => {
    const m = line.match(/^\s{0,3}(`{3,}(?=[^`]*$)|~{3,})/);
    if (!m) return;
    if (open < 0) { open = i; fence = m[1]; return; }
    if (m[1][0] === fence[0] && m[1].length >= fence.length) {
      for (let j = open; j <= i; j++) drop.add(j);
      open = -1;
    }
  });
  return lines.filter((_, i) => !drop.has(i));
}

function isLeftForYou(trimmed) {
  return trimmed.replace(/[#*_:]/g, "").trim().toLowerCase() === "left for you";
}
const NOTHING_LISTED = /^[-*+\u2022\s(]*(none|nothing|n\/a)\b[\s.)]*$/i;
const BULLET = /^([-*+\u2022]|\d+[.)])\s/;
const SOURCE_LINE = /^[-*+\u2022\s]{0,8}[*_]{0,2}source:/i;

// "open" for the exact heading, "empty" for "Decisions made: none", "near" for
// a line that plainly meant to be the heading, else null.
function headingKind(trimmed) {
  const inner = trimmed.replace(/^#{1,6}\s+/, "").replace(/^(\*\*|__)/, "").replace(/(\*\*|__)$/, "")
    .replace(/:$/, "").replace(/(\*\*|__)$/, "").trim();
  if (inner.toLowerCase() === "decisions made") return "open";
  if (/^decisions made:\s*\(?(none|nothing|n\/a)\)?\.?$/i.test(inner.replace(/[*_]/g, ""))) return "empty";
  const loose = trimmed.replace(/^([-*+\u2022]\s+)/, "").replace(/^#{1,6}\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/[*_]/g, "").trim();
  if (/^decision made:|^decisions made:\s*\d/i.test(loose)) return null; // a status line
  if (/^decisions? made\b/i.test(loose) && loose.split(/\s+/).length <= 8) return "near";
  return null;
}

// Headings that missed the exact form.
function nearMissHeadings(text) {
  if (typeof text !== "string") return [];
  return linesOutsideFences(text).map((l) => l.trim()).filter((l) => headingKind(l) === "near");
}

// Everything after the heading, up to "Left for you" or a heading as high as
// its own, is a decision: nothing below it can hide in prose, under a
// sub-heading or in a nested bullet. Indented text and "Source:" lines belong
// to the item above.
function decisionItems(text) {
  if (typeof text !== "string") return [];
  const lines = linesOutsideFences(text);
  const items = [];
  let level = 0; // 0: outside a section; else the heading's depth (7 = not a # heading)
  let current = null;
  const flush = () => { if (current !== null) items.push(current); current = null; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const kind = headingKind(trimmed);
    const hashes = trimmed.match(/^(#{1,6})\s/);
    if (kind === "open" || kind === "empty") {
      flush();
      level = hashes ? hashes[1].length : 7;
      continue;
    }
    if (!level) continue;
    if (isLeftForYou(trimmed) || (hashes && hashes[1].length <= level)) { flush(); level = 0; continue; }
    if (NOTHING_LISTED.test(trimmed) || kind === "near" || /^([-*_])\1{2,}$/.test(trimmed)) continue;
    const nextText = lines.slice(i + 1).find((l) => l.trim());
    const headsBullets = nextText !== undefined && BULLET.test(nextText.trim());
    if (hashes || (headsBullets && (/^(\*\*|__)[^*_]{1,200}(\*\*|__):?$/.test(trimmed) || (trimmed.endsWith(":") && trimmed.split(/\s+/).length <= 4)))) continue; // a sub-heading
    if (trimmed.startsWith("|")) {
      flush();
      const isRule = /^\|[\s:|-]+\|?$/.test(trimmed);
      const nextIsRule = /^\|[\s:|-]+\|?$/.test((lines[i + 1] || "").trim());
      if (!isRule && !nextIsRule) items.push(trimmed);
      continue;
    }
    const indented = /^\s/.test(line);
    if (current !== null && (SOURCE_LINE.test(trimmed) || (indented && !BULLET.test(trimmed)))) { current += " " + trimmed; continue; }
    flush();
    current = trimmed;
  }
  flush();
  return items;
}

function transcriptLines(file) {
  const out = [];
  // Only finished lines: Claude Code may still be writing the last one.
  for (const line of fs.readFileSync(file, "utf8").split("\n").slice(0, -1)) {
    if (line.trim().startsWith("{")) out.push(JSON.parse(line));
  }
  return out;
}

// What David actually typed or pasted, at the prompt or mid-turn. The transcript
// stores hook text, helper notices, teammates and Claude's compaction summary as
// "user" lines too; only origin.kind "human" is a person. If that field ever
// changes, every "you" citation fails loudly rather than accepting words nobody typed.
function davidsWords(transcriptPath) {
  const said = [];
  for (const o of transcriptLines(transcriptPath)) {
    const a = o.attachment;
    if (o.type === "attachment" && a && a.type === "queued_command" && a.origin && a.origin.kind === "human" && typeof a.prompt === "string") {
      said.push(a.prompt);
      continue;
    }
    if (o.type !== "user" || !o.origin || o.origin.kind !== "human") continue;
    const c = o.message && o.message.content;
    if (typeof c === "string") said.push(c);
    else if (Array.isArray(c)) for (const b of c) if (b.type === "text") said.push(b.text);
  }
  return plainWords(said.join("\n"));
}

// The disk's own spelling, so docs/MINE.md and docs/mine.md compare equal on macOS.
function realPath(p) {
  return fs.existsSync(p) ? fs.realpathSync.native(p) : path.resolve(p);
}

function jsonlFilesUnder(dir, found) {
  if (!fs.existsSync(dir)) return found;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) jsonlFilesUnder(p, found);
    else if (e.name.endsWith(".jsonl")) found.push(p);
  }
  return found;
}

// Files Claude or any helper wrote this session with the file tools.
function writtenThisSession(transcriptPath, agentTranscriptPath) {
  const files = jsonlFilesUnder(path.join(transcriptPath.replace(/\.jsonl$/, ""), "subagents"), [transcriptPath]);
  if (typeof agentTranscriptPath === "string" && fs.existsSync(agentTranscriptPath)) files.push(agentTranscriptPath);
  const written = new Set();
  for (const f of files) {
    for (const o of transcriptLines(f)) {
      const c = o.type === "assistant" && o.message && o.message.content;
      if (!Array.isArray(c)) continue;
      for (const b of c) {
        if (b.type === "tool_use" && ["Write", "Edit", "NotebookEdit"].includes(b.name) && b.input) {
          const target = b.input.file_path || b.input.notebook_path;
          if (typeof target === "string") written.add(realPath(path.resolve(o.cwd || "/", target)));
        }
      }
    }
  }
  return written;
}

// Claude's own working papers: plans, the progress log, memory.
function isOwnPaper(resolved) {
  const parts = resolved.toLowerCase().split(path.sep);
  if (parts.includes(".gsd-t")) return true;
  const i = parts.indexOf(".claude");
  return i >= 0 && parts[i + 1] === "projects";
}

const TRAILING_JUNK = " \t,:\u2014\u2013-";

// The source named before the quote: a path, backticked or not, with :12 or #L12.
function cleanWhere(raw) {
  let end = raw.length;
  while (end > 0 && TRAILING_JUNK.includes(raw[end - 1])) end--;
  let w = raw.slice(0, end).replace(/^[*_\s]+/, "").trim().split("`").join("");
  w = w.replace(/:\d{1,7}(-\d{1,7})?$/, "").replace(/#L\d{1,7}(-L?\d{1,7})?$/, "");
  return w.startsWith("~/") ? path.join(os.homedir(), w.slice(2)) : w;
}

// Why one "Source:" segment fails, or null when it holds.
function segmentProblem(segment, ctx) {
  const rest = segment.replace(/[\u201c\u201d]/g, '"');
  const open = rest.indexOf('"');
  const close = rest.lastIndexOf('"');
  if (open < 0 || close <= open) return "no Source with a quote";
  const where = cleanWhere(rest.slice(0, open));
  const quote = plainWords(rest.slice(open + 1, close));
  if (!where) return "no Source with a quote";
  if (quote.split(" ").length < MIN_QUOTE_WORDS) return `quote under ${MIN_QUOTE_WORDS} words`;
  if (/^https?:\/\//i.test(where)) return "a web page can't be checked here; keep this only if it is true, David will be shown it";
  if (typeof ctx.transcriptPath !== "string" || !fs.existsSync(ctx.transcriptPath)) return "no session record to check it against";
  if (where.toLowerCase() === "you") {
    if (ctx.said === undefined) ctx.said = davidsWords(ctx.transcriptPath);
    return ctx.said.includes(quote) ? null : "David never typed those words";
  }
  let resolved = realPath(path.resolve(ctx.cwd, where));
  // Claude's cd moves cwd; a path can also be written from the project root.
  if (!fs.existsSync(resolved) && process.env.CLAUDE_PROJECT_DIR) resolved = realPath(path.resolve(process.env.CLAUDE_PROJECT_DIR, where));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return `no such file: ${where}`;
  if (isOwnPaper(resolved)) return `${where} is Claude's own working paper`;
  if (ctx.written === undefined) ctx.written = writtenThisSession(ctx.transcriptPath, ctx.agentTranscriptPath);
  if (ctx.written.has(resolved)) return `${where} was written this session`;
  if (fs.statSync(resolved).size > MAX_SOURCE_BYTES) return `${where} is too large to check; keep this only if it is true, David will be shown it`;
  if (!ctx.sources) ctx.sources = new Map();
  if (ctx.sources.has(resolved)) return ctx.sources.get(resolved).includes(quote) ? null : `those words are not in ${where}`;
  const content = fs.readFileSync(resolved);
  if (content.includes(0)) return `${where} is not a text file, so it can't be checked; keep this only if it is true, David will be shown it`;
  ctx.sources.set(resolved, plainWords(content.toString("utf8")));
  return ctx.sources.get(resolved).includes(quote) ? null : `those words are not in ${where}`;
}

// Why this item's citation fails, or null. One sound source is enough.
function citationProblem(item, ctx) {
  const segments = item.split(/source:/i).slice(1);
  if (!segments.length) return "no Source with a quote";
  let first = null;
  for (const s of segments) {
    const why = segmentProblem(s, ctx);
    if (!why) return null;
    if (!first) first = why;
  }
  return first;
}

function contextFrom(payload) {
  return { cwd: typeof payload.cwd === "string" ? payload.cwd : process.cwd(), transcriptPath: payload.transcript_path, agentTranscriptPath: payload.agent_transcript_path };
}

// One line per decision whose citation fails. A citation that can't be checked
// is reported as failing, never waved through.
function checkDecisions(payload) {
  const ctx = contextFrom(payload);
  const problems = nearMissHeadings(payload.last_assistant_message)
    .map((h) => `- ${h.slice(0, 80)} (use the exact heading, alone on its line: Decisions made)`);
  for (const item of decisionItems(payload.last_assistant_message)) {
    let why;
    try {
      why = citationProblem(item, ctx);
    } catch (e) {
      why = `could not check it: ${e.message}`;
    }
    if (why) problems.push(`- ${item.replace(/^([-*+\u2022]|\d+[.)])\s+/, "").slice(0, 160)} (${why})`);
  }
  return problems;
}

// While questions are off: a failing reply goes back once, then David is warned.
// A crash here would waive the check silently, so it becomes the warning.
function decisionHook() {
  let problems;
  let payload = {};
  try {
    payload = readPayload();
    if (questionsOn(payload.session_id)) return;
    if (typeof payload.last_assistant_message !== "string") throw new Error("Claude Code sent no reply text to check");
    problems = checkDecisions(payload);
  } catch (e) {
    emit({ systemMessage: "GSD-T: the decision check could not run, so this reply's decisions are unchecked: " + e.message });
    return;
  }
  if (!problems.length) return;
  if (payload.stop_hook_active === true) {
    emit({ systemMessage: "GSD-T: decisions with no checkable source, possible inventions:\n" + problems.join("\n") });
  } else {
    emit({ decision: "block", reason: DECISION_STOP + "\n" + problems.join("\n") });
  }
}

// --- File-write guard: the marker never goes on disk without its source. ---

const INVENTION_MARKER = /recommended by claude/i;
const NEVER_GUARDED = /(?:^|[\\/])(?:test|tests|__tests__|spec|e2e|fixtures?|\.gsd-t)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/i;
// A doc talking about the marker puts it in backticks.
const MENTION = /`recommended by claude`/i;

// Approved by name in .gsd-t/inventions.json, as fallbacks are in fallbacks.json.
// Each entry names one item, so a short or marker-only text can't approve them
// all. A file that can't be read or fails this throws, and the guard denies.
function approvedInventions(cwd) {
  const p = path.join(cwd, ".gsd-t", "inventions.json");
  if (!fs.existsSync(p)) return [];
  const list = JSON.parse(fs.readFileSync(p, "utf8")).approved;
  if (!Array.isArray(list)) throw new Error(p + " needs an \"approved\" list");
  return list.map((e) => {
    const text = e && typeof e.text === "string" ? plainWords(e.text).split(INVENTION_MARKER).join(" ").trim() : "";
    if (text.split(/\s+/).filter((w) => /\w/.test(w)).length < MIN_QUOTE_WORDS) {
      throw new Error(p + " entry needs \"text\" of at least " + MIN_QUOTE_WORDS + " words naming that one item, besides the marker");
    }
    return text;
  });
}

function counts(lines) {
  const n = new Map();
  for (const raw of lines) { const l = raw.trim(); n.set(l, (n.get(l) || 0) + 1); }
  return n;
}

// New lines that carry the marker with no sound source. A line counts as new
// by number of copies: an identical line elsewhere in the file doesn't excuse
// another one. An old marker is cleared by the audit, not by the next edit.
function inventionProblems(payload) {
  const ti = payload.tool_input;
  if (!ti || typeof ti !== "object" || typeof ti.file_path !== "string") return [];
  const ctx = contextFrom(payload);
  const target = path.resolve(ctx.cwd, ti.file_path);
  // An unattended run can't approve its own invention through the file tools.
  if (/(^|[\\/])\.gsd-t[\\/]inventions\.json$/i.test(target) && !questionsOn(payload.session_id)) {
    return ["- .gsd-t/inventions.json records what David approved, one item at a time; only David's session can change it (questions on)"];
  }
  const text = payload.tool_name === "Write" ? ti.content : payload.tool_name === "Edit" ? ti.new_string : null;
  if (typeof text !== "string" || !INVENTION_MARKER.test(text) || NEVER_GUARDED.test(path.relative(ctx.cwd, target))) return [];
  const before = payload.tool_name === "Edit"
    ? counts(typeof ti.old_string === "string" ? ti.old_string.split("\n") : [])
    : counts(fs.existsSync(target) ? fs.readFileSync(target, "utf8").split("\n") : []);
  const approved = approvedInventions(ctx.cwd);
  const problems = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!INVENTION_MARKER.test(line)) continue;
    const left = before.get(line) || 0;
    if (left > 0) { before.set(line, left - 1); continue; }
    if (MENTION.test(line)) continue;
    const plain = plainWords(line);
    if (approved.some((x) => plain.includes(x))) continue;
    // Inside a string literal the quote marks are escaped; the bare ones are the literal's own.
    const cited = line.includes('\\"') ? line.replace(/(?<!\\)"/g, "").split('\\"').join('"').split("\\'").join("'") : line;
    const why = citationProblem(cited, ctx);
    if (why) problems.push("- " + line.slice(0, 160) + " (" + why + ")");
  }
  return problems;
}

function inventionGuard() {
  let payload;
  try {
    payload = readPayload();
  } catch (_) {
    return; // Not a write the guard can read: not applicable, as with the fallback guard.
  }
  let problems;
  try {
    problems = inventionProblems(payload);
  } catch (e) {
    // This guard governs the invention rule, so it must not allow on error.
    problems = [`- the check could not run: ${e.message}`];
  }
  if (problems.length) {
    const shown = problems.slice(0, MAX_LINES_SHOWN);
    if (problems.length > shown.length) shown.push(`- and ${problems.length - shown.length} more`);
    emit({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: INVENTION_GUARD_REASON + "\n" + shown.join("\n") } });
  }
}

const INVENTION_GUARD_REASON =
  "This write records a Claude recommendation with no checkable source, on the same line as the marker. " + NO_INVENTIONS + " " +
  "Add the proof to that line: Source: path/to/file \"exact words\", or Source: you \"exact words\". " +
  "If no source exists, don't record or build it; list one question under \"Left for you\". Never drop the marker to get past this: that hides the same invention. " +
  "An old marked line you change needs its source too. A doc that only talks about the marker puts it in backticks. " +
  "David alone approves an exception, one item at a time, in .gsd-t/inventions.json: {\"approved\":[{\"text\":\"at least three words naming the item\",\"why\":\"...\"}]}.";

function main() {
  const p = readPayload();
  if (DAVIDS_OWN_STOPS.includes(p.tool_name)) return;
  if (questionsOn(p.session_id)) return;
  emit({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: PROMPT_ANSWER, interrupt: false } } });
}

module.exports = {
  QUESTIONS_ON_HOURS, PROMPT_ANSWER, QUESTION_ANSWER, QUESTION_STOP, HELPER_BRIEF, DECISION_STOP,
  switchDir, markerFor, questionsOn, setQuestions, readPayload, emit, endsOnQuestion, decisionItems, nearMissHeadings, checkDecisions, decisionHook, inventionProblems, inventionGuard,
};

if (require.main === module) main();
