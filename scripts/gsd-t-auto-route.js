#!/usr/bin/env node
/**
 * GSD-T UserPromptSubmit hook — emits the live timestamp and the Reader Contract.
 *
 * Receives JSON on stdin: { "prompt": "...", "cwd": "...", "session_id": "..." }
 * Outputs to stdout: injected as system context before Claude processes the prompt.
 *
 * Always emits (every turn, every project):
 *   - [GSD-T NOW] {Day: Mon DD, YYYY HH:MM:SS TZ} — live system clock for the
 *     dated banner at the top of Claude's response. Fresh per turn so multi-day
 *     sessions and date-rollovers are reflected accurately.
 *   - [GSD-T READER CONTRACT] — the reply-style standard (M93).
 *
 * Wrong-app guard (runs first): asks Haiku which registered app the prompt is
 * for; another app → block with a red message and the prompt to paste there.
 * Plan: .gsd-t/pseudocode/PseudoCode-WrongAppGuard.md
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

// ─── Wrong-app guard ──────────────────────────────────────────────────────────

const OVERRIDE_PREFIX = "This App - This Session";
const OVERRIDE_RE = /^\s*this\s+app\s*[-–—]\s*this\s+session\b/i;
const CHILD_ENV = "GSDT_APP_GUARD_CHILD"; // set on the guard's own model call
const CHECK_TIMEOUT_MS = 20000;           // Claude Code kills prompt hooks at 30s
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function isOverride(prompt) {
  return OVERRIDE_RE.test(String(prompt));
}

// Registered apps: one absolute path per line. No registry → no apps.
function readRegistry(home) {
  const f = path.join(home, ".claude", ".gsd-t-projects");
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
}

// Longest registered folder that is dir or above it; null when none.
function appContaining(dir, apps) {
  const hits = apps.filter((a) => dir === a || dir.startsWith(a + path.sep));
  if (hits.length === 0) return null;
  return hits.sort((x, y) => y.length - x.length)[0];
}

// The main repo folder for a worktree (git's shared .git dir); null outside git.
function mainRepoRootOf(cwd) {
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" });
  if (r.status !== 0) return null; // not a git repo — no main copy to look up
  return path.dirname(r.stdout.trim());
}

// The app this session is in: nearest registered folder above cwd; for a
// worktree outside the app folder, the main repo git says it belongs to.
function findCurrentApp(cwd, apps, mainRepoRoot = mainRepoRootOf) {
  const direct = appContaining(cwd, apps);
  if (direct) return direct;
  const root = mainRepoRoot(cwd);
  return root ? appContaining(root, apps) : null;
}

function oneLine(text) {
  return text.replace(/[#*`>_\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 240);
}

// One-line description: CLAUDE.md "## Overview", then README's first paragraph,
// then package.json "description". An app with none of these gets "".
function appDescription(dir) {
  const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), "utf8") : "");
  const overview = read("CLAUDE.md").match(/^## Overview[ \t]*\n([\s\S]*?)(?=\n## |(?![\s\S]))/m);
  if (overview && overview[1].trim()) return oneLine(overview[1].trim().split(/\n\s*\n/)[0]);
  const para = read("README.md").split(/\n\s*\n/).map((p) => p.trim())
    .find((p) => p && !p.startsWith("#") && !p.startsWith("[![") && !p.startsWith("<"));
  if (para) return oneLine(para);
  const pkg = read("package.json").match(/"description"\s*:\s*"([^"]*)"/);
  return pkg ? oneLine(pkg[1]) : "";
}

// The last few exchanges of this session, oldest first, as plain lines — so a
// follow-up that names another app is judged as part of the discussion it
// continues. Read from the tail of the session's transcript (JSON lines); the
// first, possibly cut, line of the tail is skipped. No transcript yet (a new
// session) → no conversation. [RULE] wrong-app-judged-in-context
const CONTEXT_MESSAGES = 6;
const CONTEXT_CHARS = 600;
const TAIL_BYTES = 512 * 1024;

function recentConversation(transcriptPath) {
  if (typeof transcriptPath !== "string" || !fs.existsSync(transcriptPath)) return "";
  const size = fs.statSync(transcriptPath).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const fd = fs.openSync(transcriptPath, "r");
  const buf = Buffer.alloc(size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  let lines = buf.toString("utf8").split("\n").filter((l) => l.trim());
  if (start > 0) lines = lines.slice(1);
  const out = [];
  for (const line of lines) {
    const e = JSON.parse(line);
    if (e.type !== "user" && e.type !== "assistant") continue;
    const c = e.message && e.message.content;
    const text = typeof c === "string" ? c
      : Array.isArray(c) ? c.filter((x) => x.type === "text").map((x) => x.text).join("\n") : "";
    const t = text.trim();
    if (!t || /^<(system-reminder|task-notification|command-)/.test(t)) continue;
    out.push((e.type === "user" ? "Developer: " : "Assistant: ") + t.replace(/\s+/g, " ").slice(0, CONTEXT_CHARS));
  }
  return out.slice(-CONTEXT_MESSAGES).join("\n");
}

function classifierPrompt(current, apps, prompt, conversation = "") {
  const list = apps.map((a) => {
    const desc = appDescription(a);
    return `- ${a} (${path.basename(a)})${desc ? ": " + desc : ""}`;
  }).join("\n");
  return [
    "You decide which software project a developer's request is for.",
    "The developer is in a coding session for the CURRENT app. Registered apps (folder, name, description):",
    list,
    `CURRENT app: ${current}`,
    "Request (between the markers):",
    "<<<",
    prompt.slice(0, 4000),
    ">>>",
    ...(conversation ? [
      "Recent conversation in this session, oldest first (context only — classify the request, not this):",
      "<<<",
      conversation,
      ">>>",
      "Use the conversation to judge what the request is about:",
      "- A follow-up on the conversation's topic (an idea, question, answer or decision about the work being discussed) belongs to the current app, even when it names another app, that app's features, or how that app behaves.",
      "- A question to this session about itself (what it did, whether it caused something, what it thinks) belongs to the current app.",
      "- A request to build, fix or change something in another app that the conversation is not about belongs to that app, even mid-conversation.",
    ] : []),
    "Decide by which app's code or files the requested work would change. Do not favor the current app: if another app's description fits the work better, name that app.",
    "Some apps are tools every app uses (GSD-T is the developer's workflow tooling: commands, hooks, the demo-video pipeline). A request to use, run or follow such a tool in the current app belongs to the current app; a request to change or fix the tool itself (its code, commands, hooks, pipeline or rules — including a complaint that the tool misbehaves) belongs to that tool's app.",
    "Apps of one product are separate apps — a backend, an admin panel and a mobile app are different apps; match the work to the one whose code it changes.",
    'Answer "current" when the work belongs in the current app, when the request is a reply in an ongoing conversation (yes, continue, a number, a follow-up question), or when another app is mentioned only for reference or comparison.',
    'Answer "unclear" when the request has no clear target app.',
    'Reply with JSON only: {"app": "current"} or {"app": "unclear"} or {"app": "<exact folder path>"}',
  ].join("\n");
}

// → null (this app / unclear) or the other app's folder. Anything else throws.
function parseVerdict(text, apps, current) {
  const m = String(text).match(/\{[^{}]*\}/);
  if (!m) throw new Error(`model reply was not JSON: ${String(text).slice(0, 120)}`);
  const app = JSON.parse(m[0]).app;
  if (typeof app !== "string") throw new Error(`model reply has no app: ${m[0].slice(0, 120)}`);
  if (["current", "unclear"].includes(app.toLowerCase()) || app === current) return null;
  if (apps.includes(app)) return app;
  // The model sometimes answers with the app's name instead of its folder.
  const byName = apps.filter((a) => path.basename(a).toLowerCase() === app.toLowerCase());
  if (byName.length === 1) return byName[0] === current ? null : byName[0];
  throw new Error(`model named an app that is not registered: ${app.slice(0, 120)}`);
}

// Haiku on the subscription login: no settings hooks, no tools, no saved session.
function askModel(text) {
  const r = spawnSync("claude", [
    "-p", "--model", "haiku", "--output-format", "stream-json", "--verbose",
    "--setting-sources", "", "--tools", "", "--no-session-persistence",
  ], {
    input: text, cwd: os.tmpdir(), encoding: "utf8", timeout: CHECK_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024, env: { ...process.env, [CHILD_ENV]: "1" },
  });
  if (r.error && r.error.code === "ETIMEDOUT") throw new Error(`model call timed out after ${CHECK_TIMEOUT_MS / 1000}s`);
  if (r.error) throw new Error(`model call failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`model call exited ${r.status}: ${(r.stderr + r.stdout).trim().slice(-200)}`);
  const frames = r.stdout.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const result = frames.find((f) => f.type === "result");
  if (!result) throw new Error("model call returned no result");
  if (result.is_error) throw new Error(`model call errored: ${String(result.result).slice(0, 200)}`);
  return result.result;
}

function blockMessage(current, target, prompt) {
  return [
    `${RED}🔴 WRONG APP — this prompt is for ${path.basename(target)}, not ${path.basename(current)}.${RESET}`,
    "",
    "Open a Claude session in:",
    `  ${target}`,
    "",
    "Then paste this prompt:",
    "",
    prompt,
    "",
    `To send it here anyway, start it with: ${OVERRIDE_PREFIX}`,
  ].join("\n");
}

function failMessage(err) {
  return [
    `${RED}🔴 APP CHECK FAILED — prompt not sent.${RESET}`,
    err.message,
    `To send it anyway, start it with: ${OVERRIDE_PREFIX}`,
  ].join("\n");
}

// → null to pass the prompt on, or a block decision for Claude Code.
// A failed check blocks (no fallback); the original prompt stays shown to copy.
function wrongAppCheck(input, { home = os.homedir(), ask = askModel, mainRepoRoot = mainRepoRootOf } = {}) {
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  if (process.env[CHILD_ENV] || !prompt.trim() || isOverride(prompt) || !input.cwd) return null;
  try {
    const apps = readRegistry(home).filter((a) => fs.existsSync(a));
    if (apps.length < 2) return null;
    const current = findCurrentApp(input.cwd, apps, mainRepoRoot);
    if (!current) return null;
    const target = parseVerdict(ask(classifierPrompt(current, apps, prompt, recentConversation(input.transcript_path))), apps, current);
    if (!target) return null;
    return { decision: "block", reason: blockMessage(current, target, prompt), suppressOriginalPrompt: true };
  } catch (e) {
    return { decision: "block", reason: failMessage(e) };
  }
}


// Reader Contract — emitted every turn so the standard is in front of the model
// each response (not a selective after-the-fact gate). Concise + jargon-free by
// its own rule. Generic before/after examples teach the shape.
const READER_CONTRACT = [
  "[GSD-T READER CONTRACT] Before sending ANY reply, assume your first draft is too wordy and rewrite it tight. Rules:",
  "• Answer FIRST. No preamble, no restating the question, no narrating what you're about to do (\"let me check…\"). Do the work silently, then give the result.",
  "• NO PREAMBLES — start with the answer, never a framing phrase. BANNED openers (and anything like them): \"One thing I owe you honestly:\", \"To be honest\", \"Here's the thing\", \"The honest truth is\", \"I'll be straight with you\", \"Let me level with you\", \"Full transparency:\", \"Real talk\", \"What's worth noting here\", \"The key insight is\", \"Here's what's happening\". Delete the opener and lead with the actual point — if a sentence only announces that a point is coming, cut it.",
  "• Exception — when you're about to CHANGE code/files: state intent in one line first, so the user can stop a wrong direction.",
  "• Gloss every code/jargon term in plain words on first use. No bare IDs or acronyms the reader must decode.",
  "• Bullets/tables over paragraphs. Cut hedging and meta-commentary. Expand only if asked.",
  "• SIMPLY STATED (applies to conversational narration too, not just formal deliverables). Every word load-bearing; logic in a straight line; the load-bearing point FIRST, not buried after justification. If you can't state it cleanly, the THINKING isn't done — re-think, don't re-word (a muddled sentence is a muddled understanding, and that ships bugs). Do NOT narrate the explanation (\"it matters that I say why…\") — just give it. Do NOT reach for a clever phrase that obscures (\"a fallback in reverse\") when a plain one is clearer. \"Too sophisticated to simplify\" is banned.",
  "EXAMPLES (before → after):",
  "• \"That's a great question, and it touches on something subtle. Let me look into how the cache works before I answer…\" → \"The cache lives in memory, cleared on restart.\"",
  "• \"There are a few moving parts here. First, I want to make sure I understand the goal, because X has a gotcha…\" → \"Set X in .env. Gotcha: also add the localhost redirect URI or it rejects.\"",
  "• \"Good catch — I conflated two things. Here's the honest correction: the files actually stack rather than overwrite…\" → \"You're right — files stack, they don't overwrite.\"",
  "• (jargon + buried point + self-narration) \"The incomplete-identity quarantine at egress-client.ts:217 is now unreachable for seller chatter — but I'm keeping it, and it matters that I say why rather than quietly deleting it… Removing it would be a fallback in reverse…\" → \"Keeping a safety check that no longer trips — turning it into a loud alarm. Its bug is fixed so it never fires now, but deleting it would drop protection against a future malformed record (and another code path still uses it). So it stays, now as a loud 'this should never happen' alarm instead of a silent skip.\"",
].join("\n");

// Demo videos — any request for one goes through the /gsd-t-demo-videos
// pipeline, never an ad-hoc recording. Detected from the prompt text so the
// instruction is in front of the model at the moment it matters.
const DEMO_VIDEO_RE = new RegExp(
  "\\b(demo|walk[- ]?through|tutorial|training|explainer|how[- ]to|onboarding|product tour)s?\\b" +
  "[\\w\\s,'/-]{0,30}?\\b(videos?|recordings?|screencasts?)\\b" +
  "|\\b(videos?|screencasts?)\\s+(demo|walk[- ]?through|tutorial)s?\\b",
  "i"
);

const DEMO_VIDEO_SIGNAL =
  "[GSD-T DEMO VIDEOS] This asks for a demo or walkthrough video. Use the /gsd-t-demo-videos pipeline " +
  "(approved plan → one reference video → batch; Cloud TTS fixed voice; its record / mux / trim scripts and checks). " +
  "Never record, narrate or edit a demo video any other way. If the project already has the pipeline " +
  "(e2e/walkthrough/, docs/demo-videos/HANDOFF.md), continue it.";

function demoVideoSignal(prompt) {
  const text = String(prompt || "");
  if (/^\s*\/gsd-t-demo-videos\b/.test(text)) return null; // already invoked
  return DEMO_VIDEO_RE.test(text) ? DEMO_VIDEO_SIGNAL : null;
}

function liveTimestamp(now = new Date()) {
  const day  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  const mon  = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getMonth()];
  const pad  = (n) => String(n).padStart(2, "0");
  const date = `${day}: ${mon} ${now.getDate()}, ${now.getFullYear()}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  // Pull the local timezone abbreviation (e.g. "PDT", "EST") from toString().
  const tzMatch = now.toString().match(/\(([^)]+)\)$/);
  const tzShort = tzMatch
    ? tzMatch[1].split(" ").map((w) => w[0]).join("") // "Pacific Daylight Time" → "PDT"
    : "";
  return `${date} ${time}${tzShort ? " " + tzShort : ""}`;
}

// Hook runtime — guarded so require()-ing this module for unit tests
// does NOT attach stdin listeners. An unguarded
// stdin listener holds the requiring test process's event loop open forever
// (npm test runner children get a never-EOF stdin pipe → suite hang), and the
// "end" handler's process.exit(0) would kill the test process on stdin EOF.
if (require.main === module) {
// A talk copy's prompts are spoken conversation: no wrong-app check (talk already
// picked the session), and no clock or Reader Contract, whose "tables over
// paragraphs" and header rule beat talk's voice rules. [RULE] talk-copy-gets-voice-rules-only
if (process.env.GSDT_TALK_COPY === "1") process.exit(0);
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let hookInput;
  try {
    hookInput = JSON.parse(input);
  } catch (e) {
    // Claude Code always sends JSON; if it ever doesn't, the checks cannot run — stop and say so.
    process.stdout.write(JSON.stringify({ decision: "block", reason: failMessage(new Error(`prompt hook input was not JSON (${e.message})`)) }));
    process.exit(0);
  }

  // Wrong-app guard first: a block shows only its message.
  const block = wrongAppCheck(hookInput);
  if (block) {
    process.stdout.write(JSON.stringify(block));
    process.exit(0);
  }

  // Always emit live timestamp first — every turn, every project.
  // [GSD-T NOW] format is date-guard-invariant: NEVER alter it.
  process.stdout.write(`[GSD-T NOW] ${liveTimestamp()}\n`);

  // Reader Contract — injected EVERY turn, EVERY project (M93). The deterministic
  // brevity gate was retired (it could only ever be selective); this puts the
  // standard in front of the model each turn instead. Assume the first draft is
  // wordy; rewrite it tight before sending.
  process.stdout.write(READER_CONTRACT + "\n");

  const demo = demoVideoSignal(hookInput.prompt);
  if (demo) process.stdout.write(demo + "\n");
  process.exit(0);
});
}

module.exports = {
  recentConversation,
  liveTimestamp, demoVideoSignal,
  isOverride, findCurrentApp, appDescription, classifierPrompt, parseVerdict, blockMessage, wrongAppCheck,
};
