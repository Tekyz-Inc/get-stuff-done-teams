#!/usr/bin/env node
/**
 * GSD-T UserPromptSubmit hook — auto-routes plain text prompts through /gsd.
 *
 * Receives JSON on stdin: { "prompt": "...", "cwd": "...", "session_id": "..." }
 * Outputs to stdout: injected as system context before Claude processes the prompt.
 *
 * Logic:
 *   - Prompt starts with "/" → exit silently (user typed a command, pass through)
 *   - Prompt is plain text → emit [GSD-T AUTO-ROUTE] signal so Claude routes via /gsd
 */

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const prompt = (typeof data.prompt === "string" ? data.prompt : "").trimStart();
    if (prompt.startsWith("/")) process.exit(0); // slash command — pass through
    if (!prompt) process.exit(0);                // empty prompt — pass through
    // Plain text prompt — inject routing signal
    process.stdout.write(
      "[GSD-T AUTO-ROUTE] The user typed a plain text message (no leading /). " +
      "Route it automatically through the /gsd smart router — execute the /user:gsd " +
      "command with the user's full message as the argument."
    );
  } catch {
    // JSON parse error or any other failure — never block the prompt
  }
  process.exit(0);
});
