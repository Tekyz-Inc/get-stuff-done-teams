#!/usr/bin/env node
/**
 * scripts/gsd-t-watch-state.js — GSD-T Watch-State Writer CLI
 *
 * Records per-agent progress into `.gsd-t/.watch-state/{agent_id}.json` so
 * the watch-progress renderer can reconstruct the workflow tree live.
 *
 * Contract: `.gsd-t/contracts/watch-progress-contract.md` v1.0.0
 * Owner:    D2 (M39 `d2-progress-watch`)
 *
 * Subcommands (contract §4):
 *   start    — create/overwrite a new in-progress record
 *   advance  — record current step (acts as start if no file exists)
 *   done     — terminal: status=done, sets completed_at
 *   skip     — terminal: status=skipped, sets completed_at
 *   fail     — terminal: status=failed, sets completed_at
 *
 * Exit codes:
 *   0 — success
 *   1 — validation (bad args, unknown subcommand)
 *   2 — filesystem (EACCES / ENOSPC / permission)
 *
 * Zero external deps (Node.js built-ins only).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATE_DIR_REL = path.join(".gsd-t", ".watch-state");
const VALID_SUB = new Set(["start", "advance", "done", "skip", "fail"]);

function _parseArgs(argv) {
  const out = { _sub: argv[0] || null };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function _validate(sub, args) {
  if (!VALID_SUB.has(sub)) return `unknown subcommand: ${sub}`;
  if (sub === "start" || sub === "advance") {
    if (!args["command"]) return "--command is required";
    if (!args["step"] || !/^-?\d+$/.test(String(args["step"]))) {
      return "--step must be an integer";
    }
    if (!args["step-label"]) return "--step-label is required";
  }
  return null;
}

function _resolveAgentId(args) {
  const v = args["agent-id"];
  if (v && typeof v === "string" && v !== "true") return v;
  if (process.env.GSD_T_AGENT_ID) return process.env.GSD_T_AGENT_ID;
  return `shell-${process.pid}-${Date.now()}`;
}

function _stateDir(cwd) {
  return path.join(cwd || process.cwd(), STATE_DIR_REL);
}

function _readExisting(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function _atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const rand = crypto.randomBytes(4).toString("hex");
  const tmp = `${filePath}.tmp-${process.pid}-${rand}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, filePath);
}

function _parseParentId(raw) {
  if (raw === undefined || raw === null || raw === "null" || raw === "") return null;
  return String(raw);
}

function _parseMetadata(raw) {
  if (!raw || raw === true) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function _buildRecord(sub, args, existing, resolvedAgentId) {
  const now = new Date().toISOString();
  const base = existing || {
    agent_id: resolvedAgentId || args["agent-id"],
    parent_agent_id: _parseParentId(args["parent-id"]),
    command: "",
    step: 0,
    step_label: "",
    status: "pending",
    started_at: null,
    completed_at: null,
    metadata: {},
  };
  // Always sync parent_agent_id if explicitly provided (supports late lineage).
  if (args["parent-id"] !== undefined) base.parent_agent_id = _parseParentId(args["parent-id"]);
  const mergedMeta = Object.assign({}, base.metadata || {}, _parseMetadata(args["metadata"]));
  base.metadata = mergedMeta;
  if (sub === "start" || sub === "advance") {
    base.command = String(args["command"]);
    base.step = parseInt(args["step"], 10);
    base.step_label = String(args["step-label"]);
    base.status = "in_progress";
    base.completed_at = null;
    if (!base.started_at) base.started_at = now;
  } else if (sub === "done") {
    base.status = "done";
    base.completed_at = now;
  } else if (sub === "skip") {
    base.status = "skipped";
    base.completed_at = now;
  } else if (sub === "fail") {
    base.status = "failed";
    base.completed_at = now;
  }
  return base;
}

function main(argv, cwd) {
  const args = _parseArgs(argv);
  const sub = args._sub;
  const err = _validate(sub, args);
  if (err) {
    process.stderr.write(`[gsd-t-watch-state] ${err}\n`);
    return 1;
  }
  const agentId = _resolveAgentId(args);
  const filePath = path.join(_stateDir(cwd), `${agentId}.json`);
  const existing = _readExisting(filePath);
  const record = _buildRecord(sub, args, existing, agentId);
  try {
    _atomicWrite(filePath, record);
  } catch (e) {
    process.stderr.write(`[gsd-t-watch-state] fs error: ${e.message}\n`);
    return 2;
  }
  return 0;
}

if (require.main === module) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}

module.exports = { main, _parseArgs, _validate, _buildRecord, _stateDir };
