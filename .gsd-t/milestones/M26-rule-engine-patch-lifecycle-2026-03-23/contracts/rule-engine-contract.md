# Rule Engine Contract

## Overview
Defines the canonical schemas for M26 rule engine files: `rules.jsonl`, `patch-templates.jsonl`, patch status files, promotion gate thresholds, and graduation criteria. All files are JSONL (one JSON object per line).

**Owner**: rule-engine domain (rules.jsonl, patch-templates.jsonl), patch-lifecycle domain (patches/)
**Consumers**: command-integration domain

---

## File Locations

```
.gsd-t/metrics/
  rules.jsonl             -- declarative detection rules (written by rule-engine)
  patch-templates.jsonl   -- maps triggers to edits (written by rule-engine)
  patches/                -- individual patch status files (written by patch-lifecycle)
    patch-{id}.json       -- one file per patch with lifecycle state
```

The `.gsd-t/metrics/` directory is created on first write if it does not exist.

---

## rules.jsonl Schema

Each line is a JSON object representing one detection rule:

```json
{
  "id":               "string -- unique rule ID (e.g., 'rule-001')",
  "created_at":       "string -- ISO 8601 UTC timestamp of rule creation",
  "name":             "string -- human-readable rule name",
  "description":      "string -- what this rule detects",
  "trigger": {
    "metric":         "string -- field in task-metrics to evaluate (e.g., 'fix_cycles', 'signal_type', 'first_pass_rate')",
    "operator":       "string -- comparison: gt, gte, lt, lte, eq, neq, in, pattern_count",
    "threshold":      "number|string|array -- value to compare against",
    "scope":          "string -- 'domain', 'milestone', 'global' (what level to aggregate)",
    "window":         "number -- how many recent records to evaluate (0 = all)"
  },
  "severity":         "string -- HIGH, MEDIUM, LOW",
  "action":           "string -- 'warn', 'patch', 'tighten' (what happens when rule fires)",
  "patch_template_id": "string|null -- ID of associated patch template (null if action is 'warn')",
  "activation_count": "number -- how many times this rule has fired",
  "last_activated":   "string|null -- ISO 8601 timestamp of last activation",
  "milestone_created": "string -- milestone ID when rule was created (e.g., 'M26')",
  "status":           "string -- 'active', 'deprecated', 'consolidated'"
}
```

### Trigger Operators

| Operator        | Meaning                                               | Example                              |
|-----------------|-------------------------------------------------------|--------------------------------------|
| `gt`            | Greater than threshold                                | fix_cycles gt 2                      |
| `gte`           | Greater than or equal to threshold                    | fix_cycles gte 3                     |
| `lt`            | Less than threshold                                   | first_pass_rate lt 0.6               |
| `lte`           | Less than or equal to threshold                       | first_pass_rate lte 0.5              |
| `eq`            | Equal to threshold                                    | signal_type eq "debug-invoked"       |
| `neq`           | Not equal to threshold                                | signal_type neq "pass-through"       |
| `in`            | Value is in threshold array                           | signal_type in ["fix-cycle","debug-invoked"] |
| `pattern_count` | Count of matching records >= threshold in window      | fix_cycles pattern_count 3           |

### Rules
- All fields required except `patch_template_id` (null when action is 'warn')
- `id` must be unique across all rules
- `status` must be one of: active, deprecated, consolidated
- `activation_count` starts at 0, incremented on each fire
- `window` of 0 means evaluate all available records

---

## patch-templates.jsonl Schema

Each line is a JSON object representing one patch template:

```json
{
  "id":             "string -- unique template ID (e.g., 'tpl-001')",
  "rule_id":        "string -- ID of the rule that triggers this template",
  "name":           "string -- human-readable name",
  "description":    "string -- what this patch does",
  "target_file":    "string -- relative path to file being patched (e.g., 'commands/gsd-t-execute.md')",
  "edit_type":      "string -- 'append', 'prepend', 'insert_after', 'replace'",
  "edit_anchor":    "string|null -- text marker to locate insertion point (for insert_after/replace)",
  "edit_content":   "string -- content to add/replace",
  "target_metric":  "string -- which metric this patch aims to improve (e.g., 'first_pass_rate')",
  "created_at":     "string -- ISO 8601 UTC timestamp"
}
```

### Edit Types

| Edit Type      | Behavior                                                   |
|----------------|------------------------------------------------------------|
| `append`       | Add content at end of target file                          |
| `prepend`      | Add content at beginning of target file                    |
| `insert_after` | Insert content after the line matching `edit_anchor`       |
| `replace`      | Replace the line matching `edit_anchor` with `edit_content` |

### Rules
- All fields required except `edit_anchor` (null for append/prepend)
- `rule_id` must reference an existing rule in rules.jsonl
- `target_file` must be a valid relative path from project root
- `edit_content` must be valid for the target file type (markdown for .md, JS for .js)

---

## Patch Status File Schema (patches/patch-{id}.json)

Each patch has its own status file:

```json
{
  "id":                "string -- unique patch ID (e.g., 'patch-001')",
  "template_id":       "string -- ID of the patch template that generated this",
  "rule_id":           "string -- ID of the rule that triggered this patch",
  "status":            "string -- candidate, applied, measured, promoted, graduated",
  "created_at":        "string -- ISO 8601 UTC when candidate was created",
  "applied_at":        "string|null -- ISO 8601 UTC when patch was applied to target file",
  "measured_milestones": "array -- list of milestone IDs where measurement occurred",
  "metric_before":     "number|null -- target metric value before patch (baseline)",
  "metric_after":      "number|null -- target metric value after patch (latest measurement)",
  "improvement_pct":   "number|null -- percentage improvement ((after - before) / before * 100)",
  "promoted_at":       "string|null -- ISO 8601 UTC when promoted",
  "graduated_at":      "string|null -- ISO 8601 UTC when graduated",
  "graduation_target": "string|null -- file where patch was permanently written on graduation",
  "deprecated_at":     "string|null -- ISO 8601 UTC if deprecated instead of promoted",
  "deprecation_reason": "string|null -- why patch was deprecated"
}
```

### Lifecycle State Machine

```
candidate ──apply──▶ applied ──measure──▶ measured ──gate──▶ promoted ──sustain──▶ graduated
    │                    │                    │                   │
    ▼                    ▼                    ▼                   ▼
 (discard)          (deprecated)         (deprecated)        (never — graduated is final)
```

### Promotion Gate
- Requires: `measured_milestones.length >= 2`
- Requires: `improvement_pct > 55` (>55% win rate, adapted from AlphaZero)
- If gate fails: patch moves to `deprecated` with reason

### Graduation Criteria
- Requires: `status === 'promoted'`
- Requires: promoted for 3+ additional milestones with sustained improvement
- On graduation: patch content written to permanent target (constraints.md, verify checks, or plan pre-conditions)
- On graduation: rule removed from rules.jsonl (absorbed into methodology)

---

## Rule Engine API (bin/rule-engine.js exports)

```javascript
/**
 * Load all active rules from rules.jsonl
 * @returns {Rule[]} Array of active rules
 */
getActiveRules()

/**
 * Evaluate rules against recent task-metrics for a domain
 * @param {string} domain - domain name to evaluate
 * @param {object} [options] - { milestone, window }
 * @returns {RuleMatch[]} Array of { rule, matchedRecords, severity }
 */
evaluateRules(domain, options)

/**
 * Get rules relevant to a domain type for pre-mortem analysis
 * @param {string} domainType - domain type/name pattern
 * @returns {Rule[]} Rules that have historically fired for similar domains
 */
getPreMortemRules(domainType)

/**
 * Increment activation count for a rule
 * @param {string} ruleId
 */
recordActivation(ruleId)

/**
 * Flag rules that haven't fired in N milestones for deprecation
 * @param {number} threshold - milestones of inactivity before flagging
 * @returns {Rule[]} Rules flagged for deprecation
 */
flagInactiveRules(threshold)

/**
 * Consolidate related rules into a single cleaner rule
 * @param {string[]} ruleIds - IDs of rules to consolidate
 * @param {object} consolidated - the merged rule object
 */
consolidateRules(ruleIds, consolidated)
```

---

## Patch Lifecycle API (bin/patch-lifecycle.js exports)

```javascript
/**
 * Create a candidate patch from a rule match and template
 * @param {string} ruleId
 * @param {string} templateId
 * @param {number} metricBefore - baseline metric value
 * @returns {Patch} Created patch object
 */
createCandidate(ruleId, templateId, metricBefore)

/**
 * Apply a candidate patch to its target file
 * @param {string} patchId
 * @returns {boolean} true if applied successfully
 */
applyPatch(patchId)

/**
 * Record a measurement for an applied patch
 * @param {string} patchId
 * @param {string} milestoneId
 * @param {number} metricAfter - current metric value
 */
recordMeasurement(patchId, milestoneId, metricAfter)

/**
 * Check if patch passes the promotion gate
 * @param {string} patchId
 * @returns {{ passes: boolean, improvement_pct: number, reason: string }}
 */
checkPromotionGate(patchId)

/**
 * Promote a patch that passed the gate
 * @param {string} patchId
 */
promote(patchId)

/**
 * Graduate a promoted patch into permanent methodology artifact
 * @param {string} patchId
 * @returns {{ target: string, content: string }} What was written where
 */
graduate(patchId)

/**
 * Deprecate a patch that failed the promotion gate
 * @param {string} patchId
 * @param {string} reason
 */
deprecate(patchId, reason)

/**
 * Get all patches in a given status
 * @param {string} status - candidate, applied, measured, promoted, graduated
 * @returns {Patch[]}
 */
getPatchesByStatus(status)
```

---

## Quality Budget Governance

Defined per-milestone in rollup.jsonl or via project CLAUDE.md override:

```json
{
  "rework_ceiling_pct": 20,
  "actions_when_exceeded": [
    "force_discuss_phase",
    "require_contract_review",
    "split_large_tasks"
  ]
}
```

- **Rework ceiling**: max percentage of tasks that may require fix cycles (default: 20%)
- **Check point**: evaluated during `complete-milestone` distillation step
- **When exceeded**: system logs warning and applies constraint tightening for the next milestone
- **Constraint tightening actions**:
  - `force_discuss_phase` — wave cannot skip discuss
  - `require_contract_review` — plan must verify all contracts before task generation
  - `split_large_tasks` — plan must split any task estimated at >30 minutes

---

## Activation Count Deprecation

- Each rule tracks `activation_count` and `last_activated`
- During `complete-milestone` consolidation step:
  - Rules with `activation_count === 0` after 5+ milestones since creation → flag as deprecated
  - Rules with `last_activated` older than 5 milestones ago → flag for review
- Deprecated rules are not evaluated (skipped by `getActiveRules()`)

---

## Periodic Consolidation

- Triggered every 5 milestones during `complete-milestone` distillation
- Identifies rules with overlapping triggers (same metric + same scope + similar thresholds)
- Proposes consolidated rule and marks originals as `status: 'consolidated'`
- Consolidation is logged as a distillation event

---

## Integration Checkpoints

- **rule-engine Task 1** must be complete (rules.jsonl schema, rule evaluator created) before:
  - patch-lifecycle can create candidates (needs rule evaluation results)
  - command-integration can inject rules into execute subagent prompts

- **patch-lifecycle Task 1** must be complete (patch lifecycle manager created) before:
  - command-integration can add promotion/graduation steps to complete-milestone

- **rule-engine + patch-lifecycle** must both be testable before:
  - command-integration modifies any command files
