# QA Calibration Contract

## Overview
Defines the QA miss-rate tracking schema, calibration logic, and dynamic injection interface for the closed-loop QA calibration system.

**Owner**: qa-calibrator domain
**Consumers**: command-integration domain (execute, quick, integrate), metrics-rollup

---

## QA Miss Log Schema (.gsd-t/metrics/qa-miss-log.jsonl)

Each line records a bug found by Red Team that QA missed:

```json
{
  "ts":           "string -- ISO 8601 UTC timestamp",
  "milestone":    "string -- milestone ID",
  "domain":       "string -- domain where bug was found",
  "task":         "string -- task identifier",
  "category":     "string -- bug category (see Category Taxonomy)",
  "description":  "string -- what Red Team found",
  "severity":     "string -- CRITICAL, HIGH, MEDIUM, LOW",
  "red_team_finding_id": "string -- reference to red-team-report entry"
}
```

### Category Taxonomy

| Category | Description |
|----------|-------------|
| `contract-violation` | Code doesn't match contract interface definition |
| `boundary-input` | Edge case / boundary value not handled |
| `state-transition` | Invalid state change or missing state guard |
| `error-path` | Error handling missing or incorrect |
| `missing-flow` | Required user flow or code path not implemented |
| `regression` | Previously working functionality broken |
| `e2e-gap` | End-to-end scenario not covered by tests |

---

## bin/qa-calibrator.js API

```javascript
/**
 * Log a QA miss (Red Team found, QA missed)
 * @param {object} miss - miss record matching schema above
 */
logMiss(miss)

/**
 * Compute per-category miss rates across recent milestones
 * @param {number} [windowSize=5] - number of recent milestones to analyze
 * @returns {object[]} - [{ category, missRate, totalFindings, qaMissed }]
 */
getCategoryMissRates(windowSize)

/**
 * Get current weak spots (categories with >30% miss rate)
 * @param {number} [windowSize=5]
 * @returns {object[]} - [{ category, missRate, recentExamples: string[] }]
 */
getWeakSpots(windowSize)

/**
 * Generate QA prompt injection text for weak spots
 * @param {number} [windowSize=5]
 * @returns {string} - markdown text to inject into QA subagent prompt, or "" if no weak spots
 */
generateQAInjection(windowSize)

/**
 * Check if a weak spot should generate a permanent rule engine patch
 * @returns {object[]} - categories with >30% miss rate for 3+ consecutive milestones
 */
getPersistentWeakSpots()
```

---

## Dynamic QA Injection Format

When weak spots exist, `generateQAInjection()` returns text like:

```markdown
## QA PRIORITY FOCUS AREAS (auto-calibrated)

Your historical miss rate for these categories is elevated. Pay EXTRA attention:

- **boundary-input** (42% miss rate): Edge cases and boundary values. Recent misses: {example1}, {example2}
- **error-path** (35% miss rate): Error handling completeness. Recent misses: {example1}

These are the areas where Red Team most often finds bugs you missed. Proving them clean is high-value.
```

---

## Calibration Rules

| Condition | Action |
|-----------|--------|
| Category miss rate >30% for current window | Inject as QA priority focus area |
| Category miss rate >30% for 3+ consecutive milestones | Generate rule engine candidate patch (permanent QA check) |
| Category miss rate drops <10% for 2+ milestones | Remove priority injection for that category |

---

## ELO Integration

QA miss rate factors into process ELO via metrics-rollup:
- Milestones with total QA miss count > 3 receive an ELO penalty: `elo_delta -= (miss_count - 3) * 2`
- This incentivizes the system toward better first-pass QA detection

---

## Integration Points

- `execute` Step 2 (QA spawn): calls `generateQAInjection()`, prepends to QA prompt
- `quick` Test & Verify step: same injection
- `integrate` QA spawn: same injection
- `complete-milestone` distillation: calls `logMiss()` for each Red Team finding not in QA report
- `metrics-rollup`: reads qa-miss-log.jsonl for ELO penalty calculation
