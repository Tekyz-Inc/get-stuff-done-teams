#!/usr/bin/env node
"use strict";

/**
 * gsd-t-graph-metrics-rollup — M99 D3 (read-only rollup of graphDB/logs/)
 *
 * Reads all `graphDB/logs/graph-events-NNN.jsonl` via D1's `resolveLogsDir`.
 * NEVER writes. Tolerates missing / empty / rotated ledger (zeroed report).
 *
 * Exports:
 *   rollup(projectRoot?)  → RollupReport
 *   printRollup(projectRoot?, flags?)   → prints a formatted report to stdout
 *
 * RollupReport shape (graph-metrics-contract.md § Rollup output shape):
 *   {
 *     totalEvents: number,
 *     layer1: {
 *       total: number,
 *       hitCount: number,
 *       hitEmptyCount: number,
 *       passthroughCount: number,      // graph-unavailable / not-found / ambiguous / error
 *       hitRatio: number,              // hitCount / total (0 if total=0)
 *       latency: { p50: number, p95: number },
 *       tierMix: { [tier]: number },
 *       staleCount: number,
 *       staleRate: number,
 *       reindexCount: number,
 *       reindexRate: number,
 *     },
 *     layer2a: {
 *       total: number,
 *       replacedCount: number,
 *       passthroughCount: number,
 *     },
 *     layer2b: {
 *       total: number,
 *       augmentCount: number,
 *       passthroughCount: number,
 *     },
 *     layer2c: {
 *       total: number,
 *       wiredCount: number,
 *       fallbackAnnouncedCount: number,
 *       disabledCount: number,
 *       fallbackRate: number,          // fallbackAnnouncedCount / total (0 if total=0)
 *     },
 *     byConsumer: { [consumer]: ConsumerStats },
 *     byVerb:     { [verb]: VerbStats },
 *     fallbackAnnouncedDespiteHit: number,  // PRE-MORTEM #8 north-star contradiction count
 *   }
 *
 * ConsumerStats: { queryCount, hitCount, grepCount, readCount, wiringCount }
 * VerbStats:     { queryCount, hitCount }
 *
 * [RULE] read-only-rollup
 * [RULE] tolerate-empty-rotated
 * [RULE] import-resolveLogsDir
 * [RULE] mirror-doMetrics-shape
 * [RULE] fallback-despite-hit-counted
 */

const fs = require("node:fs");
const path = require("node:path");

// Import D1's resolver — the ONLY place logsDir is derived. [RULE] import-resolveLogsDir
const { resolveLogsDir } = require("./gsd-t-graph-store-resolver.cjs");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Enumerate all `graph-events-NNN.jsonl` files in logsDir, sorted ascending.
 * Returns [] (not throws) if the dir is missing or empty. [RULE] tolerate-empty-rotated
 * @param {string} logsDir
 * @returns {string[]} absolute paths
 */
function _listLedgerFiles(logsDir) {
  try {
    const entries = fs.readdirSync(logsDir);
    return entries
      .filter(f => /^graph-events-\d+\.jsonl$/.test(f))
      .sort()
      .map(f => path.join(logsDir, f));
  } catch (_e) {
    return [];
  }
}

/**
 * Parse all JSONL lines from a single file. Skips malformed lines (fail-open).
 * @param {string} filePath
 * @returns {object[]}
 */
function _parseJSONL(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split("\n");
    const out = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        // skip malformed line — fail-open
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Compute p50 and p95 percentiles from an array of numbers.
 * @param {number[]} values
 * @returns {{ p50: number, p95: number }}
 */
function _percentiles(values) {
  if (!values.length) return { p50: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const p50idx = Math.floor(sorted.length * 0.50);
  const p95idx = Math.floor(sorted.length * 0.95);
  return {
    p50: sorted[Math.min(p50idx, sorted.length - 1)],
    p95: sorted[Math.min(p95idx, sorted.length - 1)],
  };
}

/**
 * Return a zeroed RollupReport (tolerant empty/missing ledger).
 * [RULE] tolerate-empty-rotated
 * @returns {object}
 */
function _zeroedReport() {
  return {
    totalEvents: 0,
    layer1: {
      total: 0,
      hitCount: 0,
      hitEmptyCount: 0,
      passthroughCount: 0,
      hitRatio: 0,
      latency: { p50: 0, p95: 0 },
      tierMix: {},
      staleCount: 0,
      staleRate: 0,
      reindexCount: 0,
      reindexRate: 0,
    },
    layer2a: {
      total: 0,
      replacedCount: 0,
      passthroughCount: 0,
    },
    layer2b: {
      total: 0,
      augmentCount: 0,
      passthroughCount: 0,
    },
    layer2c: {
      total: 0,
      wiredCount: 0,
      fallbackAnnouncedCount: 0,
      disabledCount: 0,
      fallbackRate: 0,
    },
    byConsumer: {},
    byVerb: {},
    fallbackAnnouncedDespiteHit: 0,
  };
}

// ─── Main rollup ──────────────────────────────────────────────────────────────

/**
 * Compute the rollup report from all ledger files under `projectRoot`.
 * NEVER writes. Returns a zeroed report on empty / missing ledger.
 *
 * @param {string} [projectRoot]  — optional; defaults to process.cwd()
 * @returns {object} RollupReport
 */
function rollup(projectRoot) {
  const logsDir = resolveLogsDir(projectRoot);
  const files = _listLedgerFiles(logsDir);

  if (!files.length) return _zeroedReport();

  // Accumulators
  let totalEvents = 0;

  // Layer 1 (kind:"query")
  let l1Total = 0;
  let l1HitCount = 0;
  let l1HitEmptyCount = 0;
  let l1PassthroughCount = 0;
  const l1Latencies = [];
  // Red Team HIGH (M99 round 4): consumer/verb/tier labels come from UNTRUSTED
  // ledger input (GSDT_GRAPH_CONSUMER, hook payloads). A label of "__proto__" /
  // "constructor" / "toString" defeats `if (!obj[label])` guards on a normal `{}`
  // (the name inherits a truthy value from Object.prototype) → `.add()`/property
  // assign hits the prototype, crashing the rollup and bricking the M99 read
  // surface (SC#14). Object.create(null) gives a prototype-LESS map so no key is
  // ever inherited-truthy. [RULE] rollup-prototype-safe-accumulators
  const l1TierMix = Object.create(null);
  let l1StaleCount = 0;
  let l1ReindexCount = 0;

  // Layer 2a (kind:"grep")
  let l2aTotal = 0;
  let l2aReplacedCount = 0;
  let l2aPassthroughCount = 0;

  // Layer 2b (kind:"read")
  let l2bTotal = 0;
  let l2bAugmentCount = 0;
  let l2bPassthroughCount = 0;

  // Layer 2c (kind:"wiring")
  let l2cTotal = 0;
  let l2cWiredCount = 0;
  let l2cFallbackCount = 0;
  let l2cDisabledCount = 0;

  // Per-consumer, per-verb — prototype-less (Red Team HIGH, see l1TierMix above).
  const byConsumer = Object.create(null);
  const byVerb = Object.create(null);

  // Pre-mortem #8: fallback-announced-despite-hit detection.
  // A "window" here is a (consumer, day-minute bucket) pair. We collect all
  // query outcome:hit events and all wiring fallback-announced events per consumer,
  // then count consumers where BOTH exist. More precisely: we compute the count
  // as the number of distinct consumers that have ≥1 query hit AND ≥1
  // fallback-announced wiring event. This is the coarser conservative measure;
  // for the strict same-window co-occurrence we use a time-bucket approach.
  //
  // Implementation: collect per-consumer sets of minute-buckets for hits + fallback.
  const hitBuckets = Object.create(null);       // consumer → Set<minute-bucket> (prototype-less; Red Team HIGH)
  const fallbackBuckets = Object.create(null);  // consumer → Set<minute-bucket> (prototype-less; Red Team HIGH)

  function _minuteBucket(ts) {
    // Truncate to the minute: "2026-06-30T14:25:37.123Z" → "2026-06-30T14:25"
    if (!ts || typeof ts !== "string") return "unknown";
    return ts.slice(0, 16); // "YYYY-MM-DDTHH:MM"
  }

  function _ensureConsumer(consumer) {
    if (!byConsumer[consumer]) {
      byConsumer[consumer] = {
        queryCount: 0,
        hitCount: 0,
        grepCount: 0,
        readCount: 0,
        wiringCount: 0,
      };
    }
  }

  function _ensureVerb(verb) {
    if (!byVerb[verb]) {
      byVerb[verb] = { queryCount: 0, hitCount: 0 };
    }
  }

  for (const filePath of files) {
    const events = _parseJSONL(filePath);
    totalEvents += events.length;

    for (const ev of events) {
      if (!ev || typeof ev !== "object" || !ev.kind) continue;
      const consumer = ev.consumer || "unknown";

      switch (ev.kind) {
        case "query": {
          l1Total++;
          _ensureConsumer(consumer);
          byConsumer[consumer].queryCount++;

          const outcome = ev.outcome || "";
          const isHit = outcome === "hit";
          const isHitEmpty = outcome === "hit-empty";

          if (isHit) {
            l1HitCount++;
            byConsumer[consumer].hitCount++;
            // Record minute-bucket for co-occurrence check
            if (!hitBuckets[consumer]) hitBuckets[consumer] = new Set();
            hitBuckets[consumer].add(_minuteBucket(ev.ts));
          } else if (isHitEmpty) {
            l1HitEmptyCount++;
          } else {
            l1PassthroughCount++;
          }

          if (typeof ev.latencyMs === "number" && ev.latencyMs >= 0) {
            l1Latencies.push(ev.latencyMs);
          }

          if (ev.tier && typeof ev.tier === "string") {
            l1TierMix[ev.tier] = (l1TierMix[ev.tier] || 0) + 1;
          }

          if (ev.staleOnQuery === true) l1StaleCount++;
          if (typeof ev.reindexedCount === "number" && ev.reindexedCount > 0) {
            l1ReindexCount++;
          }

          const verb = ev.verb || "unknown";
          _ensureVerb(verb);
          byVerb[verb].queryCount++;
          if (isHit) byVerb[verb].hitCount++;
          break;
        }

        case "grep": {
          l2aTotal++;
          _ensureConsumer(consumer);
          byConsumer[consumer].grepCount++;

          if (ev.action === "replaced") l2aReplacedCount++;
          else l2aPassthroughCount++;
          break;
        }

        case "read": {
          l2bTotal++;
          _ensureConsumer(consumer);
          byConsumer[consumer].readCount++;

          if (ev.action === "augment") l2bAugmentCount++;
          else l2bPassthroughCount++;
          break;
        }

        case "wiring": {
          l2cTotal++;
          _ensureConsumer(consumer);
          byConsumer[consumer].wiringCount++;

          const mode = ev.graphWiringMode || "";
          if (mode === "WIRED") {
            l2cWiredCount++;
          } else if (mode === "fallback-announced") {
            l2cFallbackCount++;
            // Record minute-bucket for co-occurrence check
            if (!fallbackBuckets[consumer]) fallbackBuckets[consumer] = new Set();
            fallbackBuckets[consumer].add(_minuteBucket(ev.ts));
          } else if (mode === "disabled") {
            l2cDisabledCount++;
          }
          break;
        }

        default:
          // Unknown kind — skip silently (fail-open, future extensibility)
          break;
      }
    }
  }

  // PRE-MORTEM #8: fallbackAnnouncedDespiteHit
  // Count the number of minute-windows where BOTH a hit AND a fallback-announced
  // appear for the SAME consumer. [RULE] fallback-despite-hit-counted
  let fallbackAnnouncedDespiteHit = 0;
  const allConsumers = new Set([
    ...Object.keys(hitBuckets),
    ...Object.keys(fallbackBuckets),
  ]);
  for (const c of allConsumers) {
    const hits = hitBuckets[c];
    const fallbacks = fallbackBuckets[c];
    if (!hits || !fallbacks) continue;
    // Count distinct minute-buckets shared by both sets
    for (const bucket of hits) {
      if (fallbacks.has(bucket)) fallbackAnnouncedDespiteHit++;
    }
  }

  // Derived ratios
  const hitRatio = l1Total > 0 ? l1HitCount / l1Total : 0;
  const staleRate = l1Total > 0 ? l1StaleCount / l1Total : 0;
  const reindexRate = l1Total > 0 ? l1ReindexCount / l1Total : 0;
  const fallbackRate = l2cTotal > 0 ? l2cFallbackCount / l2cTotal : 0;
  const latency = _percentiles(l1Latencies);

  return {
    totalEvents,
    layer1: {
      total: l1Total,
      hitCount: l1HitCount,
      hitEmptyCount: l1HitEmptyCount,
      passthroughCount: l1PassthroughCount,
      hitRatio,
      latency,
      tierMix: l1TierMix,
      staleCount: l1StaleCount,
      staleRate,
      reindexCount: l1ReindexCount,
      reindexRate,
    },
    layer2a: {
      total: l2aTotal,
      replacedCount: l2aReplacedCount,
      passthroughCount: l2aPassthroughCount,
    },
    layer2b: {
      total: l2bTotal,
      augmentCount: l2bAugmentCount,
      passthroughCount: l2bPassthroughCount,
    },
    layer2c: {
      total: l2cTotal,
      wiredCount: l2cWiredCount,
      fallbackAnnouncedCount: l2cFallbackCount,
      disabledCount: l2cDisabledCount,
      fallbackRate,
    },
    byConsumer,
    byVerb,
    fallbackAnnouncedDespiteHit,
  };
}

// ─── Formatted print (mirrors doMetrics shape) ─────────────────────────────

/**
 * Print the rollup report to stdout in a human-readable format.
 * Mirrors the shape/flags of `gsd-t metrics` (`doMetrics`, `bin/gsd-t.js:4697`).
 * [RULE] mirror-doMetrics-shape
 *
 * @param {string} [projectRoot]
 * @param {{ json?: boolean }} [flags]
 */
function printRollup(projectRoot, flags = {}) {
  const report = rollup(projectRoot);

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  const { layer1: l1, layer2a: l2a, layer2b: l2b, layer2c: l2c } = report;

  const pct = (n, d) => d > 0 ? `${(n / d * 100).toFixed(1)}%` : "n/a";

  const lines = [
    "",
    "── Graph Telemetry Rollup ──────────────────────────────────────",
    `  Total events in ledger:  ${report.totalEvents}`,
    "",
    "  Layer 1 — Graph queries",
    `    Total queries:         ${l1.total}`,
    `    Hit:                   ${l1.hitCount}  (${pct(l1.hitCount, l1.total)})`,
    `    Hit-empty:             ${l1.hitEmptyCount}  (${pct(l1.hitEmptyCount, l1.total)})`,
    `    Passthrough/fallback:  ${l1.passthroughCount}  (${pct(l1.passthroughCount, l1.total)})`,
    `    Latency p50/p95:       ${l1.latency.p50}ms / ${l1.latency.p95}ms`,
    `    Stale queries:         ${l1.staleCount}  (${pct(l1.staleCount, l1.total)})`,
    `    Auto-reindex events:   ${l1.reindexCount}  (${pct(l1.reindexCount, l1.total)})`,
  ];

  if (Object.keys(l1.tierMix).length) {
    lines.push("    Tier mix:");
    for (const [tier, cnt] of Object.entries(l1.tierMix)) {
      lines.push(`      ${tier}: ${cnt}  (${pct(cnt, l1.total)})`);
    }
  }

  lines.push(
    "",
    "  Layer 2a — Grep intercepts",
    `    Total:                 ${l2a.total}`,
    `    Replaced by graph:     ${l2a.replacedCount}  (${pct(l2a.replacedCount, l2a.total)})`,
    `    Passed through:        ${l2a.passthroughCount}  (${pct(l2a.passthroughCount, l2a.total)})`,
    "",
    "  Layer 2b — Read intercepts",
    `    Total:                 ${l2b.total}`,
    `    Augmented:             ${l2b.augmentCount}  (${pct(l2b.augmentCount, l2b.total)})`,
    `    Passed through:        ${l2b.passthroughCount}  (${pct(l2b.passthroughCount, l2b.total)})`,
    "",
    "  Layer 2c — Workflow wiring mode",
    `    Total:                 ${l2c.total}`,
    `    WIRED:                 ${l2c.wiredCount}  (${pct(l2c.wiredCount, l2c.total)})`,
    `    Fallback-announced:    ${l2c.fallbackAnnouncedCount}  (${pct(l2c.fallbackAnnouncedCount, l2c.total)})`,
    `    Disabled:              ${l2c.disabledCount}  (${pct(l2c.disabledCount, l2c.total)})`,
    `    Fallback rate:         ${pct(l2c.fallbackAnnouncedCount, l2c.total)}`,
  );

  // North-star contradiction (pre-mortem #8)
  lines.push(
    "",
    "  ★ North-star contradiction check",
    `    fallbackAnnouncedDespiteHit: ${report.fallbackAnnouncedDespiteHit}` +
      (report.fallbackAnnouncedDespiteHit > 0
        ? "  ← consumer claimed fallback but graph DID answer ✗"
        : "  ← all clear ✓"),
  );

  if (Object.keys(report.byConsumer).length) {
    lines.push("", "  By consumer:");
    for (const [consumer, stats] of Object.entries(report.byConsumer)) {
      lines.push(
        `    ${consumer}:`,
        `      queries: ${stats.queryCount}, hits: ${stats.hitCount}, ` +
          `grep: ${stats.grepCount}, read: ${stats.readCount}, wiring: ${stats.wiringCount}`,
      );
    }
  }

  if (Object.keys(report.byVerb).length) {
    lines.push("", "  By verb:");
    for (const [verb, stats] of Object.entries(report.byVerb)) {
      lines.push(
        `    ${verb}:  queries: ${stats.queryCount}, hits: ${stats.hitCount}  ` +
          `(${pct(stats.hitCount, stats.queryCount)})`,
      );
    }
  }

  lines.push("────────────────────────────────────────────────────────────────", "");
  process.stdout.write(lines.join("\n") + "\n");
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  rollup,
  printRollup,
};
