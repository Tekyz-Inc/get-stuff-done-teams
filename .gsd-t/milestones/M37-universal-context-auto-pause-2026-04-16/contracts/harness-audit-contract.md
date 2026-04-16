# Harness Audit Contract

## Overview
Defines the component registry schema, audit interface, shadow mode protocol, and cost/benefit ledger format for M31 harness self-audit capability.

**Owner**: harness-audit domain
**Consumers**: command-integration domain, complete-milestone distillation

---

## Component Registry Schema (.gsd-t/component-registry.jsonl)

Each line is a JSON object representing one GSD-T enforcement mechanism:

```json
{
  "id":             "string -- unique component ID (e.g., 'comp-red-team')",
  "name":           "string -- human-readable name (e.g., 'Red Team Adversarial QA')",
  "description":    "string -- what this component does",
  "injection_points": ["string -- command files where this component is injected"],
  "token_cost_estimate": "number -- approximate tokens per invocation",
  "date_added":     "string -- ISO 8601 date when component was added",
  "milestone_added": "string -- milestone that introduced it (e.g., 'M30')",
  "category":       "string -- 'qa', 'enforcement', 'documentation', 'orchestration'",
  "can_disable":    "boolean -- true if component can be cleanly disabled for A/B testing",
  "shadow_capable": "boolean -- true if component can run in shadow mode (log but don't enforce)",
  "status":         "string -- 'active', 'flagged', 'deprecated'"
}
```

---

## Cost/Benefit Ledger (.gsd-t/metrics/component-impact.jsonl)

Each line records one milestone's measurement for one component:

```json
{
  "ts":             "string -- ISO 8601 UTC timestamp",
  "milestone":      "string -- milestone ID",
  "component_id":   "string -- component registry ID",
  "token_cost":     "number -- actual tokens consumed by this component in this milestone",
  "bugs_prevented": "number -- bugs caught by this component (from QA/Red Team logs)",
  "false_positives": "number -- false alerts generated",
  "context_pct":    "number -- percentage of context window consumed by this component's prompt",
  "verdict":        "string -- 'positive' (cost < benefit), 'neutral', 'negative' (cost > benefit)",
  "consecutive_negative": "number -- count of consecutive milestones with negative verdict"
}
```

### Flagging Threshold
- Components with `consecutive_negative >= 3` are flagged in status and enter the patch lifecycle as deprecation candidates.

---

## Audit Command Interface (gsd-t-audit)

```
/user:gsd-t-audit [--component=<id>] [--shadow] [--report-only]
```

| Flag | Behavior |
|------|----------|
| `--component=<id>` | Target a specific component for A/B testing |
| `--shadow` | Run component in shadow mode (log results, don't enforce) |
| `--report-only` | Show current cost/benefit ledger without running tasks |

### Output
- Comparison report written to `.gsd-t/audit-report.md`
- Component impact data appended to `component-impact.jsonl`

---

## bin/component-registry.js API

```javascript
/** Read all components from registry */
getComponents()

/** Get a single component by ID */
getComponent(id)

/** Register a new component */
registerComponent(component)

/** Update component status */
updateStatus(id, status)

/** Get components flagged for deprecation */
getFlaggedComponents()

/** Record a milestone's impact data for a component */
recordImpact(componentId, milestoneId, impactData)

/** Get cost/benefit history for a component */
getImpactHistory(componentId)

/** Seed the registry with all known GSD-T components */
seedRegistry()
```

---

## Integration Points

- `complete-milestone` distillation step calls `recordImpact()` for each active component
- `status` command calls `getFlaggedComponents()` to show flagged items
- Flagged components feed into M26 patch lifecycle as deprecation candidates
