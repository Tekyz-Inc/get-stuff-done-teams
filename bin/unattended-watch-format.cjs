/**
 * bin/unattended-watch-format.cjs
 *
 * Pure formatter for the unattended watch-tick activity block (M38 ES).
 * Given an array of events (as returned by event-stream.readSinceCursor) and
 * supervisor state, render the human-scannable output per
 * `.gsd-t/contracts/unattended-event-stream-contract.md` §4.
 *
 * Kept separate from the watch command so it can be unit-tested (ES-T3) and
 * so the command itself stays a thin shell wrapper.
 */

"use strict";

function _groupByIter(events) {
  const groups = new Map();
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const iter = Number.isFinite(ev.iter) ? ev.iter : 0;
    if (!groups.has(iter)) groups.set(iter, []);
    groups.get(iter).push(ev);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
}

function _fmtElapsed(startedAt, now) {
  if (!startedAt) return "";
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return "";
  const ms = (now || Date.now()) - t;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `+${m}m elapsed`;
  const h = Math.floor(m / 60);
  return `+${h}h${m % 60}m elapsed`;
}

function _fmtDuration(s) {
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function _formatIteration(iter, evs) {
  const taskStart = evs.find((e) => e.type === "task_start");
  const taskComplete = evs.find((e) => e.type === "task_complete");
  const fileChanges = evs.filter((e) => e.type === "file_changed");
  const testResults = evs.filter((e) => e.type === "test_result");
  const verdicts = evs.filter((e) => e.type === "subagent_verdict");
  const errors = evs.filter((e) => e.type === "error");
  const retries = evs.filter((e) => e.type === "retry");

  const lines = [];
  if (taskStart) {
    const wave = taskStart.wave ? ` (wave ${taskStart.wave})` : "";
    const task = taskStart.task || "(unnamed)";
    lines.push(`  ▶  task: ${task}${wave}`);
  }
  if (fileChanges.length > 0) {
    const paths = fileChanges.map((e) => e.path || "?").filter(Boolean);
    const shown = paths.slice(0, 5).join(", ");
    const extra = paths.length > 5 ? ` … and ${paths.length - 5} more` : "";
    lines.push(`  📝  ${paths.length} file${paths.length === 1 ? "" : "s"} modified (${shown}${extra})`);
  }
  for (const tr of testResults) {
    const suite = tr.suite || "?";
    const pass = Number.isFinite(tr.pass) ? tr.pass : 0;
    const total = Number.isFinite(tr.total) ? tr.total : 0;
    const mark = (tr.fail || 0) > 0 ? "❌" : "✅";
    lines.push(`  ${mark}  test_result: ${suite} ${pass}/${total} pass`);
  }
  for (const v of verdicts) {
    const agent = v.agent || "?";
    const verdict = v.verdict || "?";
    const findings = Number.isFinite(v.findings_count) ? ` (${v.findings_count} findings)` : "";
    const mark = verdict === "pass" || verdict === "grudging_pass" ? "✅" : "❌";
    lines.push(`  ${mark}  subagent_verdict: ${agent} ${verdict}${findings}`);
  }
  for (const er of errors) {
    lines.push(`  ❌  error: ${er.error || "(unknown)"}${er.recoverable ? " [recoverable]" : ""}`);
  }
  for (const r of retries) {
    lines.push(`  🔁  retry: attempt ${r.attempt || iter} — ${r.reason || "?"}`);
  }
  if (taskComplete) {
    const dur = _fmtDuration(taskComplete.duration_s);
    const verdict = taskComplete.verdict || "?";
    lines.push(`  ⏱  duration: ${dur} · verdict: ${verdict}`);
  }
  return lines;
}

/**
 * Format an activity block for the watch tick.
 *
 * @param {object} args
 * @param {object[]} args.events — events since last cursor (may be empty)
 * @param {object} args.state — supervisor state.json contents
 * @param {number} [args.now] — override for Date.now() (tests)
 * @returns {string}
 */
function formatWatchTick(args) {
  const events = Array.isArray(args && args.events) ? args.events : [];
  const state = (args && args.state) || {};
  const now = args && Number.isFinite(args.now) ? args.now : Date.now();

  const elapsed = _fmtElapsed(state.startedAt, now);
  const iter = Number.isFinite(state.iter) ? state.iter : 0;
  const header = `[unattended supervisor — iter ${iter}${elapsed ? `, ${elapsed}` : ""}]`;

  if (events.length === 0) {
    return `${header} (no new activity since last tick)`;
  }

  const groups = _groupByIter(events);
  const blocks = [];
  for (const [groupIter, evs] of groups) {
    const groupHeader = groups.length > 1 ? `[iter ${groupIter}]` : header;
    const body = _formatIteration(groupIter, evs);
    blocks.push([groupHeader, ...body].join("\n"));
  }
  if (groups.length > 1) {
    return `${header}\n${blocks.join("\n")}`;
  }
  return blocks[0];
}

/**
 * Terminal-status block when supervisor reached `done`/`failed`/`stopped`/`crashed`.
 * Returns null if status is not terminal.
 */
function formatTerminalBlock(state) {
  if (!state || typeof state !== "object") return null;
  const s = state.status;
  if (s === "done") {
    return `🎉  Unattended supervisor COMPLETED the milestone (${state.milestone || "?"}, iter ${state.iter || 0}).`;
  }
  if (s === "failed") {
    return `❌  Unattended supervisor HALTED — status=failed (last exit ${state.lastExit ?? "?"}, iter ${state.iter || 0}).`;
  }
  if (s === "stopped") {
    return `🛑  Unattended supervisor STOPPED by user (iter ${state.iter || 0}).`;
  }
  if (s === "crashed") {
    return `💥  Unattended supervisor CRASHED (iter ${state.iter || 0}).`;
  }
  return null;
}

module.exports = {
  formatWatchTick,
  formatTerminalBlock,
  _internal: { _groupByIter, _formatIteration, _fmtElapsed, _fmtDuration },
};
