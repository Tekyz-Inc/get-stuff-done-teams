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
 */


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
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  // Always emit live timestamp first — every turn, every project.
  // [GSD-T NOW] format is date-guard-invariant: NEVER alter it.
  process.stdout.write(`[GSD-T NOW] ${liveTimestamp()}\n`);

  // Reader Contract — injected EVERY turn, EVERY project (M93). The deterministic
  // brevity gate was retired (it could only ever be selective); this puts the
  // standard in front of the model each turn instead. Assume the first draft is
  // wordy; rewrite it tight before sending.
  process.stdout.write(READER_CONTRACT + "\n");

  let prompt = "";
  try {
    prompt = JSON.parse(input).prompt || "";
  } catch (e) {
    // Claude Code always sends JSON; if it ever doesn't, say so — the check did not run.
    process.stdout.write(`[GSD-T] prompt hook input was not JSON (${e.message}) — demo-video check did not run\n`);
  }
  const demo = demoVideoSignal(prompt);
  if (demo) process.stdout.write(demo + "\n");
  process.exit(0);
});
}

module.exports = { liveTimestamp, demoVideoSignal };
