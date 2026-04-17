/**
 * Shared helper: map a `claude -p` process exit code + output to the
 * GSD-T headless exit-code contract.
 *
 * Lives in its own file so non-entry modules (e.g. gsd-t-unattended.cjs)
 * can require it without pulling in the full CLI at bin/gsd-t.js. That
 * decoupling lets PROJECT_BIN_TOOLS ship the supervisor without also
 * vendoring the CLI itself — projects resolve `gsd-t` from the global
 * install, not from a project-local copy.
 *
 * Exit codes (contract):
 *   0 — success
 *   1 — verification/test failure
 *   2 — context budget exceeded
 *   3 — non-zero process exit (other)
 *   4 — blocked / needs human
 *   5 — unknown slash command (claude -p exited 0 but rejected the prompt)
 */

"use strict";

function mapHeadlessExitCode(processExitCode, output) {
  if (processExitCode !== 0 && processExitCode !== null) return 3;
  const raw = output || "";
  const lower = raw.toLowerCase();
  if (/^unknown command:/im.test(raw)) return 5;
  if (
    lower.includes("context budget exceeded") ||
    lower.includes("context window exceeded") ||
    lower.includes("budget exceeded") ||
    lower.includes("token limit")
  ) return 2;
  if (
    lower.includes("blocked") &&
    (lower.includes("needs human") ||
      lower.includes("need human") ||
      lower.includes("human input") ||
      lower.includes("human approval"))
  ) return 4;
  if (
    lower.includes("verification failed") ||
    lower.includes("verify failed") ||
    lower.includes("quality gate failed") ||
    lower.includes("tests failed")
  ) return 1;
  return 0;
}

module.exports = { mapHeadlessExitCode };
