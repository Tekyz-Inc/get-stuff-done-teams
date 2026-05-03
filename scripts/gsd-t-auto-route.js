#!/usr/bin/env node
/**
 * GSD-T UserPromptSubmit hook — emits live timestamp + auto-routes plain text prompts.
 *
 * Receives JSON on stdin: { "prompt": "...", "cwd": "...", "session_id": "..." }
 * Outputs to stdout: injected as system context before Claude processes the prompt.
 *
 * Always emits (every turn, every project):
 *   - [GSD-T NOW] {Day: Mon DD, YYYY HH:MM:SS TZ} — live system clock for the
 *     dated banner at the top of Claude's response. Fresh per turn so multi-day
 *     sessions and date-rollovers are reflected accurately.
 *
 * Conditionally emits (GSD-T projects only, plain text prompts only):
 *   - [GSD-T AUTO-ROUTE] signal so Claude routes via /gsd
 */

const fs = require("fs");
const path = require("path");

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

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  // Always emit live timestamp first — every turn, every project.
  process.stdout.write(`[GSD-T NOW] ${liveTimestamp()}\n`);

  try {
    const data = JSON.parse(input);
    // Auto-route is GSD-T-project-only.
    const cwd = typeof data.cwd === "string" ? data.cwd : process.cwd();
    if (!fs.existsSync(path.join(cwd, ".gsd-t", "progress.md"))) process.exit(0);
    const prompt = (typeof data.prompt === "string" ? data.prompt : "").trimStart();
    if (prompt.startsWith("/")) process.exit(0); // slash command — pass through
    if (!prompt) process.exit(0);                // empty prompt — pass through
    // Plain text prompt in a GSD-T project — inject routing signal
    process.stdout.write(
      "[GSD-T AUTO-ROUTE] The user typed a plain text message (no leading /). " +
      "Route it automatically through the /gsd smart router — execute the /gsd " +
      "command with the user's full message as the argument."
    );
  } catch {
    // JSON parse error or any other failure — never block the prompt
  }
  process.exit(0);
});

module.exports = { liveTimestamp };
