"use strict";

/**
 * gsd-t-file-disjointness — M44 D5 (T2: core implementation)
 *
 * Pre-spawn file-disjointness prover. Consumes the task-graph DAG from D1 and
 * partitions a candidate parallel set into:
 *   - parallel   — groups confirmed pairwise-disjoint (safe to spawn together)
 *   - sequential — groups sharing ≥1 write target (must serialize)
 *   - unprovable — tasks with no touch-list source (routed sequential; safe-default)
 *
 * Contract: .gsd-t/contracts/file-disjointness-contract.md (v1.0.0)
 *
 * Hard rules (from constraints.md):
 *   - Unprovable is ALWAYS safe — never assume disjointness
 *   - Zero external runtime deps (Node built-ins + git subprocess only)
 *   - Never throws (returns result object)
 *   - Read-only on all domain files; only writes to .gsd-t/events/YYYY-MM-DD.jsonl
 *   - D5 checks WRITE targets only; reads never conflict
 *   - Mode-agnostic
 *   - Git-history heuristic bounded to 100 commits
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

// ─── Event writer (append-only JSONL) ────────────────────────────────────

/**
 * Append a disjointness_fallback event for a task moved to sequential
 * (including unprovable tasks).
 *
 * Event shape (per T2 spec):
 *   { type: 'disjointness_fallback', task_id, reason, ts }
 *
 * Best-effort: filesystem errors are swallowed so the prover never throws.
 */
function appendFallbackEvent(projectDir, taskId, reason) {
  try {
    const eventsDir = path.join(projectDir, ".gsd-t", "events");
    fs.mkdirSync(eventsDir, { recursive: true });
    const now = new Date();
    const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const file = path.join(eventsDir, `${day}.jsonl`);
    const entry = {
      type: "disjointness_fallback",
      task_id: taskId,
      reason,
      ts: now.toISOString(),
    };
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch {
    // Swallow — observability only; never block the caller.
  }
}

// ─── Git-history fallback (bounded) ──────────────────────────────────────

/**
 * Heuristic touch-list source: scan up to the last 100 commits that touched
 * the domain's directory and collect file paths from commits whose subject
 * mentions the task id. Bounded to prevent runaway I/O on large repos.
 *
 * Returns: string[] — file paths (may be empty). Never throws.
 */
function gitHistoryTouches(projectDir, domain, taskId) {
  if (!domain || !taskId) return [];
  const domainDir = path.join(".gsd-t", "domains", domain);
  let raw;
  try {
    raw = execSync(
      `git log --name-only --pretty=format:"COMMIT:%H %s" -n 100 -- "${domainDir}"`,
      { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return [];
  }
  if (!raw) return [];

  const files = new Set();
  let capturing = false;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("COMMIT:")) {
      // Subject is everything after the sha
      const sp = line.indexOf(" ");
      const subject = sp >= 0 ? line.slice(sp + 1) : "";
      capturing = subject.includes(taskId);
      continue;
    }
    if (!capturing) continue;
    const trimmed = line.trim();
    if (trimmed) files.add(trimmed);
  }
  return Array.from(files);
}

// ─── Touch-list resolution ───────────────────────────────────────────────

/**
 * Resolve the effective touch list for a task by applying the fallback chain:
 *   1. Explicit `touches` populated by D1 (from **Touches** field or scope.md Files Owned)
 *   2. Git-history heuristic — only when touches is [] (D1 couldn't find anything)
 *
 * Returns: { touches: string[], source: 'declared' | 'git' | 'none' }
 */
function resolveTouches(task, projectDir) {
  const declared = Array.isArray(task.touches) ? task.touches : [];
  if (declared.length > 0) {
    return { touches: declared.slice(), source: "declared" };
  }
  // D1 emitted an empty list → scope.md was also empty. Try git history.
  const fromGit = gitHistoryTouches(projectDir, task.domain, task.id);
  if (fromGit.length > 0) {
    return { touches: fromGit, source: "git" };
  }
  return { touches: [], source: "none" };
}

// ─── Overlap grouping (union-find over the overlap relation) ─────────────

function haveOverlap(a, b) {
  if (!a.length || !b.length) return false;
  const set = new Set(a);
  for (const f of b) {
    if (set.has(f)) return true;
  }
  return false;
}

/**
 * Group provable tasks (those with a non-empty touch list from any source)
 * into connected components over the overlap relation. A singleton component
 * with no overlapping partner is safe to parallelize; a component of size ≥ 2
 * must be serialized.
 */
function groupByOverlap(items) {
  // items: [{ task, touches }]
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i, j) => {
    const a = find(i), b = find(j);
    if (a !== b) parent[a] = b;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (haveOverlap(items[i].touches, items[j].touches)) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(items[i].task);
  }
  return Array.from(groups.values());
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Prove pairwise file-disjointness across a candidate parallel set.
 *
 * @param {{tasks: object[], projectDir: string}} opts
 * @returns {{parallel: object[][], sequential: object[][], unprovable: object[]}}
 *
 * Never throws. Appends a `disjointness_fallback` event to
 * `.gsd-t/events/YYYY-MM-DD.jsonl` for every task routed sequential
 * (including unprovable tasks).
 */
function proveDisjointness(opts) {
  const tasks = (opts && Array.isArray(opts.tasks)) ? opts.tasks : [];
  const projectDir = (opts && opts.projectDir) || process.cwd();

  const parallel = [];
  const sequential = [];
  const unprovable = [];

  if (tasks.length === 0) {
    return { parallel, sequential, unprovable };
  }

  // Resolve each task's effective touch list.
  const provable = []; // [{ task, touches }]
  for (const t of tasks) {
    const { touches, source } = resolveTouches(t, projectDir);
    if (source === "none") {
      unprovable.push(t);
      // Unprovable → always sequential (singleton group). Safe-default.
      sequential.push([t]);
      appendFallbackEvent(projectDir, t.id, "unprovable");
    } else {
      provable.push({ task: t, touches });
    }
  }

  // Group provable tasks by overlap. Singletons → parallel. Multi → sequential.
  const groups = groupByOverlap(provable);
  for (const group of groups) {
    if (group.length === 1) {
      parallel.push(group);
    } else {
      sequential.push(group);
      for (const t of group) {
        appendFallbackEvent(projectDir, t.id, "write-target-overlap");
      }
    }
  }

  return { parallel, sequential, unprovable };
}

module.exports = {
  proveDisjointness,
  // Internals exposed for unit tests:
  _haveOverlap: haveOverlap,
  _groupByOverlap: groupByOverlap,
  _resolveTouches: resolveTouches,
  _gitHistoryTouches: gitHistoryTouches,
};
