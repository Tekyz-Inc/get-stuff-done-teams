/**
 * gsd-t-model-tier-policy.cjs
 *
 * SINGLE source of truth for GSD-T model-tier policy.
 * Zero external runtime deps — installer-package invariant.
 * No top-level side effects.
 *
 * Contract: .gsd-t/contracts/model-tier-policy-contract.md v1.1.0 STABLE
 */

'use strict';

// ---------------------------------------------------------------------------
// Published Model-ID Constants (M85 — authoritative, contract v1.0.0)
// ---------------------------------------------------------------------------

/**
 * Frozen map: tier alias → concrete model id.
 * Consumers MUST import from here — never re-hardcode these strings.
 *
 * THREE tiers (Fable removed 2026-07-24): `opus` is now `claude-opus-5` — the
 * default top tier. Opus 5 shipped at the SAME price as Opus 4.8 ($5/$25 per M
 * tokens) but >2× its coding score and within 0.5% of Fable 5 at max effort, so
 * the Fable cost premium ($10/$50 — double Opus 5) is no longer justified. Every
 * stage formerly on `fable` OR `opus` (4.8) now runs `opus` = claude-opus-5.
 *
 * @type {Readonly<{opus: string, sonnet: string, haiku: string}>}
 */
const MODEL_IDS = Object.freeze({
  opus:   'claude-opus-5',
  sonnet: 'claude-sonnet-4-6',
  haiku:  'claude-haiku-4-5-20251001',
});

// ---------------------------------------------------------------------------
// Stage Policy (M85 Fable assignments — contract v1.0.0 § "Stage Policy")
// ---------------------------------------------------------------------------

/**
 * Frozen map: stage key → tier alias.
 * Fable removed 2026-07-24: all 7 stages resolve to `opus` (= claude-opus-5).
 * The M82 competition judge-blindness invariant is RELAXED from "different model"
 * to "fresh independent context" — producers AND judge both run Opus 5 (fresh
 * contexts remove memory-bias; the modest residual taste/blind-spot bias is
 * accepted for a stronger judge — user-locked 2026-07-24). See
 * competition-mode-contract.md §Different-context judge.
 *
 * @type {Readonly<Record<string, string>>}
 */
const STAGE_TIERS = Object.freeze({
  'solution-space-probe':  'opus',
  'partition-probe':       'opus',
  'competition-judge':     'opus',  // was fable; blindness now via fresh context, not different model
  'competition-producers': 'opus',
  'pre-mortem':            'opus',
  'red-team':              'opus',
  'debug-cycle-2':         'opus',
});

// ---------------------------------------------------------------------------
// requiresThinkingOmitted predicate (encoding the Fable HTTP-400 breaking change)
// ---------------------------------------------------------------------------

/**
 * Returns true IFF the model requires the explicit thinking-disabled parameter
 * to be OMITTED from the API call.
 *
 * This predicate existed for `claude-fable-5`, which returned HTTP 400 when the
 * explicit thinking-disabled parameter was sent. Fable was removed 2026-07-24;
 * NO current tier model (opus=claude-opus-5, sonnet, haiku) is known to require
 * omission — Opus 5 and Sonnet 5 default `effort:high` on the API and accept the
 * thinking params normally. Kept as a single-home predicate (callers still import
 * it) so a future model that needs omission is added HERE, never re-hardcoded.
 *
 * @param {string} model — concrete model id or tier alias or any string
 * @returns {boolean}
 */
const MODELS_REQUIRING_THINKING_OMITTED = Object.freeze([]); // none post-Fable
function requiresThinkingOmitted(model) {
  if (typeof model !== 'string') return false;
  return MODELS_REQUIRING_THINKING_OMITTED.some(
    (id) => model === id || model.startsWith(id + '[')
  );
}

// ---------------------------------------------------------------------------
// resolve(stageKey) → concreteModelId
// ---------------------------------------------------------------------------

/**
 * Returns the concrete model id for the given stage key, or null for unknown keys.
 * Never throws.
 *
 * @param {string} stageKey
 * @returns {string|null}
 */
function resolve(stageKey) {
  try {
    const tier = STAGE_TIERS[stageKey];
    if (!tier) return null;
    const modelId = MODEL_IDS[tier];
    return modelId !== undefined ? modelId : null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Profile Dimension (M86 — additive over the frozen M85 STAGE_TIERS)
// ---------------------------------------------------------------------------

/**
 * Frozen profile → stage-key → tier map.
 *
 * Fable removed 2026-07-24 — profiles now dial OPUS-vs-SONNET spend (not Fable):
 *   standard  — cost-leanest: the high-stakes reasoning stages run sonnet,
 *                only the probes stay opus.
 *   pro       — mid: red-team + pre-mortem + debug-cycle-2 → opus; the rest sonnet.
 *   premium   — full opus posture: all 6 designated stages → opus (= claude-opus-5).
 *
 * competition-producers is held at opus in ALL profiles (always opus-5). The
 * former judge≠producers blindness clamp is REMOVED — the invariant is now
 * "fresh independent context," so the judge may equal producers' model.
 *
 * @type {Readonly<Record<string, Readonly<Record<string, string>>>>}
 */
const PROFILE_STAGE_TIERS = Object.freeze({
  standard: Object.freeze({
    'solution-space-probe': 'opus',
    'partition-probe':      'opus',
    'competition-judge':    'sonnet',
    'pre-mortem':           'sonnet',
    'red-team':             'sonnet',
    'debug-cycle-2':        'sonnet',
  }),
  pro: Object.freeze({
    'solution-space-probe': 'opus',
    'partition-probe':      'opus',
    'competition-judge':    'sonnet',
    'pre-mortem':           'opus',
    'red-team':             'opus',
    'debug-cycle-2':        'opus',
  }),
  premium: Object.freeze({
    'solution-space-probe': 'opus',
    'partition-probe':      'opus',
    'competition-judge':    'opus',
    'pre-mortem':           'opus',
    'red-team':             'opus',
    'debug-cycle-2':        'opus',
  }),
});

/** The 6 injectable designated stages (competition-producers excluded). */
const INJECTABLE_STAGES = Object.freeze([
  'solution-space-probe',
  'partition-probe',
  'competition-judge',
  'pre-mortem',
  'red-team',
  'debug-cycle-2',
]);

/** The HELD producers model id (always opus = claude-opus-5). */
const PRODUCERS_MODEL_ID = MODEL_IDS.opus; // claude-opus-5

/**
 * Resolves the concrete model id for a given stage key under a profile,
 * honoring precedence: stageOverrides[stage] ?? profile-tier ?? global-default.
 *
 * Blindness (M82, RELAXED 2026-07-24 to "fresh independent context"):
 *   - competition-producers key in stageOverrides: still silently dropped (producers
 *     are always opus — not profile-overridable).
 *   - competition-judge may now equal the producers' model (both opus) — the old
 *     judge≠producers clamp is REMOVED; isolation is enforced by fresh context, not
 *     by a different model.
 *
 * @param {string} stageKey
 * @param {{ profile?: string, stageOverrides?: Record<string,string> }} opts
 * @returns {{ model: string, tier: string, requiresThinkingOmitted: boolean,
 *             configError?: string }}
 */
// Own-property lookup guard. Validation-by-truthiness (`!MODEL_IDS[x]`) is a
// validation BYPASS for Object.prototype keys ("constructor", "toString", …):
// the inherited value is truthy, the resolved "model" is a function, and
// JSON.stringify silently DROPS the key from the envelope — the workflow's
// `?? "fable"` fallback then bills premium on a cost-control profile
// (Red Team M86 HIGH). Every tier/profile/stage map lookup goes through this.
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function resolveProfile(stageKey, opts) {
  opts = opts || {};
  const profileValid = typeof opts.profile === 'string' && hasOwn(PROFILE_STAGE_TIERS, opts.profile);
  const profile = profileValid ? opts.profile : 'premium'; // named global default

  const stageOverrides = (opts.stageOverrides && typeof opts.stageOverrides === 'object' && !Array.isArray(opts.stageOverrides))
    ? opts.stageOverrides
    : {};

  // competition-producers is held at opus — not resolvable via profile dimension.
  if (stageKey === 'competition-producers') {
    return {
      model: PRODUCERS_MODEL_ID,
      tier: 'opus',
      requiresThinkingOmitted: requiresThinkingOmitted(PRODUCERS_MODEL_ID),
    };
  }

  // Resolve tier from precedence chain:
  // 1. stageOverrides[stage] if it's a valid tier and not a blindness violation
  // 2. profile-tier
  // global-default (premium) is the fallback when profile is unknown — MARKED,
  // never silent (Red Team M86 r2 LOW: library callers bypassing readConfig got
  // silent premium for an invalid profile).

  const profileTierMap = PROFILE_STAGE_TIERS[profile];
  const stageKnown = hasOwn(profileTierMap, stageKey);
  const errors = [];
  if (!profileValid && opts.profile !== undefined) {
    errors.push(`unknown profile "${opts.profile}" — using the named global default "premium"`);
  }
  if (!stageKnown) {
    // Unknown stage key — defensive sonnet, but NEVER silently (Red Team M86 MEDIUM:
    // a typo'd stage returning ok:true sonnet regressed the M85 explicit unknown-stage error)
    errors.push(`unknown stage "${stageKey}" — not a designated stage; defensive sonnet fallback`);
  }
  let resolvedTier;

  const rawOverrideTier = hasOwn(stageOverrides, stageKey) ? stageOverrides[stageKey] : undefined;
  if (rawOverrideTier !== undefined) {
    if (typeof rawOverrideTier !== 'string' || !hasOwn(MODEL_IDS, rawOverrideTier)) {
      // Invalid tier in override — fall back to profile tier, record configError.
      // The fallback for an UNKNOWN stage is the cheap defensive tier, never fable
      // (Red Team M86 r2 LOW: unknown stage + invalid override resolved fable on standard).
      errors.push(`stageOverrides["${stageKey}"] has invalid tier "${rawOverrideTier}"; falling back to profile tier`);
      resolvedTier = stageKnown ? profileTierMap[stageKey] : 'sonnet';
    } else {
      // Blindness clamp REMOVED (2026-07-24): competition-judge may equal the
      // producers' model — isolation is now enforced by fresh context, not a
      // different model. Any valid tier override is honored.
      resolvedTier = rawOverrideTier;
    }
  } else {
    resolvedTier = stageKnown ? profileTierMap[stageKey] : 'sonnet';
  }

  const modelId = hasOwn(MODEL_IDS, resolvedTier) ? MODEL_IDS[resolvedTier] : MODEL_IDS.sonnet;
  const result = {
    model: modelId,
    tier: resolvedTier,
    requiresThinkingOmitted: requiresThinkingOmitted(modelId),
  };
  if (errors.length) result.configError = errors.join('; ');
  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  MODEL_IDS,
  STAGE_TIERS,
  PROFILE_STAGE_TIERS,
  INJECTABLE_STAGES,
  requiresThinkingOmitted,
  resolve,
  resolveProfile,
};

// ---------------------------------------------------------------------------
// CLI dispatch (M69 invoke-time injection surface)
// run: node bin/gsd-t-model-tier-policy.cjs resolve <stageKey> [--json]
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes('--json');
  const positional = args.filter(a => !a.startsWith('-'));

  const command = positional[0];

  if (command === 'resolve') {
    const stageKey = positional[1];

    if (!stageKey) {
      const msg = 'Usage: gsd-t-model-tier-policy.cjs resolve <stageKey> [--json]';
      if (jsonFlag) {
        process.stdout.write(JSON.stringify({ ok: false, error: msg }) + '\n');
      } else {
        process.stderr.write(msg + '\n');
      }
      process.exit(1);
    }

    const tier = STAGE_TIERS[stageKey];
    const modelId = resolve(stageKey);

    if (modelId === null) {
      const envelope = { ok: false, stageKey, error: `Unknown stage key: "${stageKey}"` };
      if (jsonFlag) {
        process.stdout.write(JSON.stringify(envelope) + '\n');
      } else {
        process.stderr.write(`Unknown stage key: "${stageKey}"\n`);
      }
      process.exit(1);
    }

    const envelope = {
      ok: true,
      stageKey,
      tier,
      model: modelId,
      requiresThinkingOmitted: requiresThinkingOmitted(modelId),
    };

    if (jsonFlag) {
      process.stdout.write(JSON.stringify(envelope) + '\n');
    } else {
      process.stdout.write(`stageKey: ${stageKey}\ntier: ${tier}\nmodel: ${modelId}\nrequiresThinkingOmitted: ${envelope.requiresThinkingOmitted}\n`);
    }

    process.exit(0);
  }

  // Unknown command
  const usage = `Usage: gsd-t-model-tier-policy.cjs resolve <stageKey> [--json]`;
  if (jsonFlag) {
    process.stdout.write(JSON.stringify({ ok: false, error: usage }) + '\n');
  } else {
    process.stderr.write(usage + '\n');
  }
  process.exit(1);
}
