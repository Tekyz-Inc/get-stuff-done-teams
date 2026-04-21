#!/usr/bin/env node
/**
 * M43 D1-T1 Probe — In-Session Usage Capture Branch Selection
 *
 * Captures the RAW Claude Code hook payload for Stop / SessionEnd / PostToolUse
 * into .gsd-t/.hook-probe/{event}-{ts}.json so D1-T1 can decide:
 *   Branch A (hook-based) — if payload carries a `usage` object.
 *   Branch B (transcript tee) — otherwise.
 *
 * Behavior:
 * - Zero-dep. Silent failure on any error (never interferes with Claude Code).
 * - Writes at most 10 files per event type (rotating) to avoid growth.
 * - Only active when .gsd-t/.hook-probe/ exists in the cwd; creating/deleting
 *   that directory is the on/off switch.
 */
const fs = require("fs");
const path = require("path");

const MAX_STDIN = 1024 * 1024;
const MAX_PER_EVENT = 10;

let input = "";
let aborted = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  input += d;
  if (input.length > MAX_STDIN) { aborted = true; process.stdin.destroy(); }
});
process.stdin.on("end", () => {
  if (aborted) return;
  try {
    const hook = JSON.parse(input);
    const cwd = hook.cwd || process.cwd();
    if (!path.isAbsolute(cwd)) return;
    const probeDir = path.join(cwd, ".gsd-t", ".hook-probe");
    if (!fs.existsSync(probeDir)) return; // disabled unless dir exists
    const event = hook.hook_event_name || "unknown";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const sid = (hook.session_id || "nosid").slice(0, 12);
    const file = path.join(probeDir, `${event}-${ts}-${sid}.json`);
    const resolved = path.resolve(file);
    if (!resolved.startsWith(path.resolve(probeDir) + path.sep)) return;
    fs.writeFileSync(file, JSON.stringify(hook, null, 2) + "\n");
    rotate(probeDir, event);
  } catch {
    // silent
  }
});

function rotate(dir, event) {
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith(event + "-") && f.endsWith(".json"))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(MAX_PER_EVENT)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* noop */ }
    }
  } catch {
    // silent
  }
}
