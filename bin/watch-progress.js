#!/usr/bin/env node
/**
 * bin/watch-progress.js — GSD-T Watch-Progress Tree Builder + Renderer
 *
 * Reads `.gsd-t/.watch-state/*.json` state files written by
 * `scripts/gsd-t-watch-state.js` and reconstructs the agent workflow tree
 * via `parent_agent_id` lineage. Renders a task-list with ✅/🔄/⬜ markers
 * below every `--watch` surface (banner preserved intact).
 *
 * Contract: `.gsd-t/contracts/watch-progress-contract.md` v1.0.0
 * Owner:    D2 (M39 `d2-progress-watch`)
 * Zero external deps.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const STALE_MS = 24 * 60 * 60 * 1000; // 24h

const MARKERS = {
  done: "✅",
  in_progress: "🔄",
  pending: "⬜",
  skipped: "➡️",
  failed: "❌",
};

function _readAll(stateDir) {
  if (!stateDir || !fs.existsSync(stateDir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(stateDir);
  } catch (_) {
    return [];
  }
  const records = [];
  for (const f of entries) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(stateDir, f), "utf8");
      const rec = JSON.parse(raw);
      if (rec && typeof rec === "object" && typeof rec.agent_id === "string") {
        records.push(rec);
      }
    } catch (_) { /* skip malformed */ }
  }
  return records;
}

function _isStale(record, now) {
  if (!record.completed_at) return false;
  const t = Date.parse(record.completed_at);
  if (!Number.isFinite(t)) return false;
  return (now - t) > STALE_MS;
}

function buildTree(stateDir, options) {
  const now = options && Number.isFinite(options.now) ? options.now : Date.now();
  const records = _readAll(stateDir).filter((r) => !_isStale(r, now));
  const index = new Map();
  for (const r of records) index.set(r.agent_id, { record: r, children: [] });
  const roots = [];
  const orphans = [];
  for (const r of records) {
    const node = index.get(r.agent_id);
    const parentId = r.parent_agent_id;
    if (parentId === null || parentId === undefined) {
      roots.push(node);
    } else if (index.has(parentId)) {
      index.get(parentId).children.push(node);
    } else {
      orphans.push(node);
    }
  }
  return { roots, orphans };
}

function _marker(status) {
  return MARKERS[status] || MARKERS.pending;
}

function _countDone(node) {
  let count = 0;
  const s = node.record.status;
  if (s === "done" || s === "skipped") count = 1;
  for (const c of node.children) count += _countDone(c);
  return count;
}

function _flattenIds(node, acc) {
  acc.push(node.record.agent_id);
  for (const c of node.children) _flattenIds(c, acc);
  return acc;
}

function _containsAgent(node, agentId) {
  if (!agentId) return false;
  return _flattenIds(node, []).includes(agentId);
}

function _pickCurrent(tree) {
  let pick = null;
  let latest = -Infinity;
  const walk = (node) => {
    const r = node.record;
    if (r.status === "in_progress" && r.started_at) {
      const t = Date.parse(r.started_at);
      if (Number.isFinite(t) && t > latest) { latest = t; pick = r.agent_id; }
    }
    for (const c of node.children) walk(c);
  };
  for (const root of tree.roots) walk(root);
  return pick;
}

function _renderExpanded(node, depth, lines) {
  const indent = "  ".repeat(depth);
  const r = node.record;
  lines.push(`${indent}${_marker(r.status)} ${r.step_label || r.command || r.agent_id}`);
  for (const c of node.children) _renderExpanded(c, depth + 1, lines);
}

function _renderCollapsed(node, depth, lines) {
  const indent = "  ".repeat(depth);
  const r = node.record;
  const doneCount = _countDone(node);
  const label = r.step_label || r.command || r.agent_id;
  lines.push(`${indent}${_marker(r.status)} ${label} (${doneCount} tasks done)`);
}

function renderTree(tree, options) {
  if (!tree || (tree.roots.length === 0 && tree.orphans.length === 0)) return "";
  const opts = options || {};
  const currentAgent = opts.currentAgent || _pickCurrent(tree);
  const lines = [];
  for (const root of tree.roots) {
    if (_containsAgent(root, currentAgent)) _renderExpanded(root, 0, lines);
    else _renderCollapsed(root, 0, lines);
  }
  if (tree.orphans.length > 0) {
    lines.push("⬜ (orphan subtree — parent state missing)");
    for (const o of tree.orphans) _renderExpanded(o, 1, lines);
  }
  return lines.join("\n");
}

module.exports = { buildTree, renderTree, MARKERS, STALE_MS, _pickCurrent };

if (require.main === module) {
  const stateDir = process.argv[2] || path.join(".gsd-t", ".watch-state");
  const out = renderTree(buildTree(stateDir));
  if (out) process.stdout.write(out + "\n");
}
