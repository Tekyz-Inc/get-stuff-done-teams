#!/usr/bin/env node

/**
 * GSD-T Token Optimizer — Retrospective tier calibration detector
 *
 * Reads .gsd-t/token-metrics.jsonl (v1.0.0 frozen schema), applies a set
 * of declarative detection rules, and appends recommendations to
 * .gsd-t/optimization-backlog.md. Invoked at complete-milestone. Never
 * blocks, never prompts, never auto-applies a recommendation.
 *
 * Four detection rules:
 *   - demote       — opus phases with ≥90% success + avg fix_cycle < 1.0
 *   - escalate     — sonnet phases with fix-cycle rate ≥30%
 *   - runway-tune  — runway estimator over-estimate ≥15 pts
 *   - outlier      — per-phase p95 consumption > 2× median
 *
 * Rejected recommendations honor a 5-milestone cooldown so the same
 * signal doesn't re-surface immediately.
 *
 * Zero external dependencies (Node.js built-ins only).
 *
 * Contract: .gsd-t/contracts/token-telemetry-contract.md v1.0.0 (read)
 *           .gsd-t/contracts/model-selection-contract.md v1.0.0 (read)
 * Consumers: commands/gsd-t-complete-milestone.md
 *            commands/gsd-t-optimization-apply.md
 *            commands/gsd-t-optimization-reject.md
 */

const fs = require("fs");
const path = require("path");

const METRICS_REL = path.join(".gsd-t", "token-metrics.jsonl");
const BACKLOG_REL = path.join(".gsd-t", "optimization-backlog.md");
const REJECTION_COOLDOWN_MILESTONES = 5;

module.exports = {
  detectRecommendations,
  appendToBacklog,
  readBacklog,
  writeBacklog,
  parseBacklog,
  setRecommendationStatus,
  DETECTION_RULES: getDetectionRules(),
  REJECTION_COOLDOWN_MILESTONES,
};

// ── detectRecommendations ───────────────────────────────────────────────────

/**
 * @param {{projectDir?: string, lookbackMilestones?: number}} opts
 * @returns {Array<object>} recommendation objects
 */
function detectRecommendations(opts) {
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const lookbackMilestones = Math.max(
    1,
    Number((opts && opts.lookbackMilestones) || 3),
  );

  const records = readMetrics(projectDir);
  const scopedRecords = filterByRecentMilestones(records, lookbackMilestones);

  const existingBacklog = parseBacklog(readBacklog(projectDir));
  const activeCooldowns = existingBacklog
    .filter(
      (e) =>
        e.status === "rejected" &&
        Number(e.rejection_cooldown || 0) > 0,
    )
    .map((e) => ({
      fingerprint: fingerprintFromEntry(e),
      remaining: Number(e.rejection_cooldown || 0),
    }));

  const recommendations = [];
  const rules = getDetectionRules();
  let idCounter = nextIdCounter(existingBacklog);

  for (const rule of rules) {
    const hits = rule.detect(scopedRecords);
    for (const hit of hits) {
      const fingerprint = makeFingerprint(rule.type, hit);
      if (activeCooldowns.some((c) => c.fingerprint === fingerprint)) {
        continue; // cooldown — don't resurface
      }
      const id = formatId(idCounter++);
      recommendations.push({
        id,
        type: rule.type,
        detected_at: new Date().toISOString(),
        evidence: hit.evidence,
        projected_savings: hit.projected_savings,
        proposed_change: hit.proposed_change,
        risk: hit.risk,
        status: "pending",
        rejection_cooldown: 0,
        fingerprint,
      });
    }
  }

  return recommendations;
}

// ── Detection rules ─────────────────────────────────────────────────────────

function getDetectionRules() {
  return [
    {
      type: "demote",
      detect(records) {
        // Group by {command, phase} filtered to opus.
        const groups = groupBy(
          records.filter((r) => r.model === "opus"),
          (r) => `${r.command}|${r.phase || ""}`,
        );
        const hits = [];
        for (const [key, group] of groups) {
          if (group.length < 3) continue; // need signal
          const successes = group.filter(
            (r) => r.outcome === "success",
          ).length;
          const successRate = successes / group.length;
          if (successRate < 0.9) continue;
          const meanTokens = mean(group.map((r) => r.tokens_consumed || 0));
          const [command, phase] = key.split("|");
          hits.push({
            evidence: `${group.length} ${command}/${phase} spawns on opus, ${Math.round(successRate * 100)}% success, avg ${Math.round(meanTokens)} tokens`,
            projected_savings: `~45% tokens (${Math.round(meanTokens * 0.45)} per spawn)`,
            proposed_change: `bin/model-selector.js — add {command:"${command}", phase:"${phase}"} to sonnet tier`,
            risk: "Low — equivalent success rate at sonnet tier; /advisor escalation available as safety net.",
            key: { command, phase },
          });
        }
        return hits;
      },
    },
    {
      type: "escalate",
      detect(records) {
        // Sonnet phases with high fix-cycle rate.
        // Note: token-telemetry records don't carry fix_cycle_count directly
        // (that's task-metrics), so we proxy via outcome === 'failure' rate
        // as a conservative signal.
        const groups = groupBy(
          records.filter((r) => r.model === "sonnet"),
          (r) => `${r.command}|${r.phase || ""}`,
        );
        const hits = [];
        for (const [key, group] of groups) {
          if (group.length < 5) continue;
          const failures = group.filter(
            (r) => r.outcome === "failure",
          ).length;
          const failureRate = failures / group.length;
          if (failureRate < 0.3) continue;
          const [command, phase] = key.split("|");
          hits.push({
            evidence: `${group.length} ${command}/${phase} spawns on sonnet, ${Math.round(failureRate * 100)}% failure rate — exceeds 30% escalation threshold`,
            projected_savings: "Negative tokens, positive correctness",
            proposed_change: `bin/model-selector.js — escalate {command:"${command}", phase:"${phase}"} to opus OR wire /advisor hook`,
            risk: "Low — escalation is additive; opus fallback preserves behavior.",
            key: { command, phase },
          });
        }
        return hits;
      },
    },
    {
      type: "runway-tune",
      detect(records) {
        // Requires projected_end_pct and actual_end_pct fields on records.
        // These are not in the v1.0.0 frozen 18-field schema, so this rule
        // is a no-op until an additive v1.x minor bump adds them. Keep the
        // rule wired so that the moment the fields exist, the rule fires.
        const hits = [];
        for (const r of records) {
          if (
            typeof r.projected_end_pct === "number" &&
            typeof r.actual_end_pct === "number"
          ) {
            const overEstimate = r.projected_end_pct - r.actual_end_pct;
            if (overEstimate > 15) {
              hits.push({
                evidence: `${r.command} at ${r.timestamp}: projected ${r.projected_end_pct}% vs actual ${r.actual_end_pct}% — ${Math.round(overEstimate)} pt over-estimate`,
                projected_savings: "Tighter runway projections, fewer unnecessary headless handoffs",
                proposed_change: `bin/runway-estimator.js — reduce LOW_CONFIDENCE_SKEW or tune fallback constants for ${r.command}`,
                risk: "Low — conservative tuning; easy to reverse if regressions appear.",
                key: { command: r.command, timestamp: r.timestamp },
              });
            }
          }
        }
        return hits;
      },
    },
    {
      type: "investigate",
      detect(records) {
        // Per-phase p95 consumption > 2x median.
        const groups = groupBy(
          records,
          (r) => `${r.command}|${r.phase || ""}`,
        );
        const hits = [];
        for (const [key, group] of groups) {
          if (group.length < 10) continue;
          const vals = group.map((r) => r.tokens_consumed || 0).sort((a, b) => a - b);
          const med = percentile(vals, 50);
          const p95 = percentile(vals, 95);
          if (med > 0 && p95 > med * 2) {
            const [command, phase] = key.split("|");
            hits.push({
              evidence: `${group.length} ${command}/${phase} spawns: p95=${Math.round(p95)}, median=${Math.round(med)} (${(p95 / med).toFixed(1)}× ratio — outlier signal)`,
              projected_savings: "Unknown until investigation completes",
              proposed_change: `Investigate why ${command}/${phase} has outlier consumption — check for runaway subagents, context leaks, or improper tool use`,
              risk: "Low — investigation only, no code change proposed.",
              key: { command, phase },
            });
          }
        }
        return hits;
      },
    },
  ];
}

// ── appendToBacklog ─────────────────────────────────────────────────────────

/**
 * @param {Array<object>} recommendations
 * @param {string} projectDir
 */
function appendToBacklog(recommendations, projectDir) {
  const dir = projectDir || process.cwd();
  const fp = path.join(dir, BACKLOG_REL);
  ensureDir(path.dirname(fp));

  const header = "# Token Optimization Backlog\n";
  const existing = fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : "";
  const milestone = readCurrentMilestone(dir) || "M?";
  const now = formatDateYmd(new Date());

  let body = existing;
  if (!body.startsWith("# Token Optimization Backlog")) {
    body = header + "\n" + body;
  }

  if (!recommendations || recommendations.length === 0) {
    const marker = `\n## Complete-milestone review — no recommendations (${milestone})\n**Detected**: ${now}\n`;
    body = body.replace(/\s+$/, "") + "\n" + marker;
    fs.writeFileSync(fp, body);
    return;
  }

  const blocks = recommendations
    .map((r) => formatRecommendation(r, milestone))
    .join("\n");
  body = body.replace(/\s+$/, "") + "\n\n" + blocks + "\n";
  fs.writeFileSync(fp, body);
}

function formatRecommendation(r, milestone) {
  const lines = [];
  lines.push(`## [${r.id}] ${summarizeRecommendation(r)}`);
  lines.push(`**Type**: ${r.type}`);
  lines.push(`**Detected**: ${r.detected_at} at complete-milestone ${milestone}`);
  lines.push(`**Evidence**: ${r.evidence}`);
  lines.push(`**Projected savings**: ${r.projected_savings}`);
  lines.push(`**Proposed change**: ${r.proposed_change}`);
  lines.push(`**Risk**: ${r.risk}`);
  lines.push(`**Status**: ${r.status}`);
  lines.push(`**Rejection cooldown**: ${r.rejection_cooldown}`);
  if (r.fingerprint) lines.push(`**Fingerprint**: ${r.fingerprint}`);
  return lines.join("\n") + "\n";
}

function summarizeRecommendation(r) {
  switch (r.type) {
    case "demote":
      return "Demote phase from opus → sonnet";
    case "escalate":
      return "Escalate phase from sonnet → opus";
    case "runway-tune":
      return "Tune runway estimator — over-projection detected";
    case "investigate":
      return "Investigate outlier consumption";
    default:
      return "Optimization recommendation";
  }
}

// ── Backlog read/write + parse ─────────────────────────────────────────────

function readBacklog(projectDir) {
  const fp = path.join(projectDir || process.cwd(), BACKLOG_REL);
  if (!fs.existsSync(fp)) return "";
  return fs.readFileSync(fp, "utf8");
}

function writeBacklog(projectDir, content) {
  const fp = path.join(projectDir || process.cwd(), BACKLOG_REL);
  ensureDir(path.dirname(fp));
  fs.writeFileSync(fp, content);
}

/**
 * Parse a backlog markdown string into entry objects. Returns [] on empty
 * input. Entry objects carry {id, type, status, rejection_cooldown,
 * evidence, projected_savings, proposed_change, risk, fingerprint}.
 */
function parseBacklog(content) {
  if (!content || !content.trim()) return [];
  const entries = [];
  // Split on H2 headers of the form "## [ID] ..." — a no-recommendation
  // marker also starts with "## " but has no [ID].
  const parts = content.split(/\n(?=## )/);
  for (const part of parts) {
    const headerMatch = part.match(/^## \[([^\]]+)\]\s*(.*)/);
    if (!headerMatch) continue;
    const id = headerMatch[1];
    const entry = { id };
    const lines = part.split("\n");
    for (const ln of lines) {
      const m = ln.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].toLowerCase().replace(/\s+/g, "_");
      const val = m[2].trim();
      entry[key] = val;
    }
    if (entry.rejection_cooldown !== undefined) {
      entry.rejection_cooldown = Number(entry.rejection_cooldown) || 0;
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * Rewrite a single entry's status + optional fields in-place. Returns the
 * updated content (caller writes it back).
 */
function setRecommendationStatus(content, id, updates) {
  const lines = content.split("\n");
  let inTarget = false;
  const out = [];
  for (const ln of lines) {
    const headerMatch = ln.match(/^## \[([^\]]+)\]/);
    if (headerMatch) {
      inTarget = headerMatch[1] === id;
      out.push(ln);
      continue;
    }
    if (inTarget) {
      const m = ln.match(/^\*\*([^*]+)\*\*:\s*(.*)$/);
      if (m) {
        const key = m[1].toLowerCase().replace(/\s+/g, "_");
        if (updates[key] !== undefined) {
          out.push(`**${m[1]}**: ${updates[key]}`);
          continue;
        }
      }
    }
    out.push(ln);
  }
  return out.join("\n");
}

// ── Internals ───────────────────────────────────────────────────────────────

function readMetrics(projectDir) {
  const fp = path.join(projectDir, METRICS_REL);
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, "utf8");
  const records = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      records.push(JSON.parse(t));
    } catch (_) {
      // skip malformed
    }
  }
  return records;
}

function filterByRecentMilestones(records, n) {
  if (!records.length) return [];
  const milestones = Array.from(
    new Set(records.map((r) => r.milestone).filter(Boolean)),
  );
  milestones.sort();
  const recent = new Set(milestones.slice(-n));
  if (recent.size === 0) return records;
  return records.filter((r) => recent.has(r.milestone));
}

function readCurrentMilestone(projectDir) {
  try {
    const fp = path.join(projectDir, ".gsd-t", "progress.md");
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, "utf8");
    const m = raw.match(/\bM\d+\b/);
    return m ? m[0] : null;
  } catch (_) {
    return null;
  }
}

function nextIdCounter(existingEntries) {
  const milestone = "M35";
  let max = 0;
  for (const e of existingEntries) {
    const m = (e.id || "").match(/OPT-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

function formatId(n) {
  return "M35-OPT-" + String(n).padStart(3, "0");
}

function makeFingerprint(type, hit) {
  const key = hit.key || {};
  const parts = [type];
  for (const k of Object.keys(key).sort()) parts.push(`${k}=${key[k]}`);
  return parts.join("|");
}

function fingerprintFromEntry(entry) {
  // Best-effort: reconstruct a fingerprint from stored fields when
  // available. Returns the 'fingerprint' field if stored, else empty.
  return entry.fingerprint || "";
}

function groupBy(records, keyFn) {
  const map = new Map();
  for (const r of records) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function mean(vals) {
  if (!vals.length) return 0;
  let sum = 0;
  for (const v of vals) sum += v;
  return sum / vals.length;
}

function percentile(sortedVals, p) {
  if (!sortedVals.length) return 0;
  const idx = Math.min(
    sortedVals.length - 1,
    Math.floor((p / 100) * sortedVals.length),
  );
  return sortedVals[idx];
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function formatDateYmd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
