#!/usr/bin/env node
'use strict';

/**
 * GSD-T Trace-Half Category Distiller (M100 D2).
 *
 * Distills the concrete trace CATEGORY set from a project's own PLAN —
 * NEVER confabulates a category absent from the plan (feedback_no_confabulated_examples).
 * Emits categories as DATA, never baked into the envelope gate (d3 stays
 * value-blind — the gate checks presence+type of `category`, never a value).
 *
 * Contract: .gsd-t/contracts/logging-schema-distillation-contract.md v1.0.0
 * Consumed contract: .gsd-t/contracts/trace-logging-contract.md
 *
 * Shares NO file with the audit-half distiller (bin/gsd-t-audit-distill.cjs,
 * owned by d4) — mechanizes no-collapse by construction.
 *
 * Exports:
 *   distillTraceCategories(planPath) -> { categories: [{ category, source }] }
 */

const fs = require('fs');

// ── Integration-point signatures ────────────────────────────────────────────
//
// A trace-worthy operation is a concrete REST/JSON/external-call integration
// point named in the project's plan (per logging-schema-distillation-contract
// §UMI pilot grounding: Grain / Airtable / Anthropic / Apify for UMI). This
// distiller is GENERIC — it looks for named external-service integration
// points in the plan text, grounding every emitted category in a matched
// source line. It never invents a category the plan does not mention.
//
// Each signature is matched against the plan text case-sensitively on the
// canonical name (avoids over-matching common words); the category name is
// the canonical service/integration name itself, as the ledger records it.

const KNOWN_INTEGRATION_SIGNATURES = [
  'Grain',
  'Airtable',
  'Anthropic',
  'Apify',
  'Slack',
  'Stripe',
  'Twilio',
  'SendGrid',
  'Softr',
];

/**
 * Finds the first line in `lines` containing `needle` as a whole-word match,
 * returning { lineNumber, text } or null if absent. Whole-word match avoids
 * a substring false-positive (e.g. "Grainger" would not match "Grain").
 */
function findFirstMatchingLine(lines, needle) {
  const re = new RegExp('\\b' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      return { lineNumber: i + 1, text: lines[i].trim() };
    }
  }
  return null;
}

/**
 * Distills the concrete trace CATEGORY set from a project plan file.
 *
 * @param {string} planPath - absolute or relative path to the project's plan
 *   (e.g. docs/plan.md).
 * @returns {{ categories: Array<{ category: string, source: string }> }}
 *   `categories` is empty (never an error, never a confabulated placeholder)
 *   when the plan has no trace-worthy operations. Each entry's `source` is
 *   the grep-traceable plan line the category was distilled from.
 */
function distillTraceCategories(planPath) {
  if (!planPath || typeof planPath !== 'string') {
    throw new Error('distillTraceCategories: planPath is required');
  }
  if (!fs.existsSync(planPath)) {
    throw new Error(`distillTraceCategories: plan not found at ${planPath}`);
  }

  const text = fs.readFileSync(planPath, 'utf8');
  const lines = text.split(/\r?\n/);

  const categories = [];
  for (const signature of KNOWN_INTEGRATION_SIGNATURES) {
    const match = findFirstMatchingLine(lines, signature);
    if (match) {
      categories.push({
        category: signature,
        source: `${planPath}:${match.lineNumber}: ${match.text}`,
      });
    }
  }

  return { categories };
}

module.exports = {
  distillTraceCategories,
  KNOWN_INTEGRATION_SIGNATURES,
};

// ── CLI ──────────────────────────────────────────────────────────────────

function _parseArgv(argv) {
  const out = { planPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--plan') out.planPath = argv[++i] || null;
  }
  return out;
}

if (require.main === module) {
  const args = _parseArgv(process.argv.slice(2));
  if (!args.planPath) {
    process.stderr.write('usage: gsd-t-trace-distill.cjs --plan <path-to-plan.md>\n');
    process.exit(2);
  }
  try {
    const result = distillTraceCategories(args.planPath);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: String((err && err.message) || err) }, null, 2) + '\n');
    process.exit(1);
  }
}
