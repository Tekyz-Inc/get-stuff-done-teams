# Cross-Project Sync Contract

## Overview
Defines the canonical schemas for M27 global metrics files, propagation protocol, and universal promotion criteria. All global files live in `~/.claude/metrics/` and use JSONL format (one JSON object per line).

**Owner**: global-metrics domain (global-sync-manager.js)
**Consumers**: cross-project-sync domain (bin/gsd-t.js doUpdateAll), command-extensions domain (commands)

---

## File Locations

```
~/.claude/metrics/
  global-rules.jsonl              -- promoted rules from all projects (with source tag)
  global-rollup.jsonl             -- aggregated rollup entries from all projects
  global-signal-distributions.jsonl -- per-project signal-type distributions
```

The `~/.claude/metrics/` directory is created on first write if it does not exist.

---

## global-rules.jsonl Schema

Each line is a JSON object representing one promoted rule from a project:

```json
{
  "id":               "string -- original rule ID from source project",
  "global_id":        "string -- globally unique ID (e.g., 'grule-001')",
  "source_project":   "string -- project name or directory basename where rule was promoted",
  "source_project_dir": "string -- absolute path to source project",
  "original_rule":    "object -- full rule object from source project's rules.jsonl",
  "promoted_at":      "string -- ISO 8601 UTC when promoted in source project",
  "propagated_to":    "array -- list of project paths where this rule was injected as candidate",
  "promotion_count":  "number -- how many distinct projects have promoted this rule (starts at 1)",
  "is_universal":     "boolean -- true if promotion_count >= 3",
  "is_npm_candidate": "boolean -- true if promotion_count >= 5",
  "shipped_in_version": "string|null -- npm version where this rule was first shipped (null if not shipped yet)"
}
```

### Rules
- `global_id` must be unique across all global rules
- `promotion_count` starts at 1 (the source project counts)
- `is_universal` is automatically set to true when `promotion_count >= 3`
- `is_npm_candidate` is automatically set to true when `promotion_count >= 5`
- When a rule is promoted in a new project, increment `promotion_count` and add project to `propagated_to`

---

## global-rollup.jsonl Schema

Each line is a JSON object representing one project's milestone rollup:

```json
{
  "ts":               "string -- ISO 8601 UTC timestamp of rollup generation",
  "source_project":   "string -- project name",
  "source_project_dir": "string -- absolute path to project",
  "milestone":        "string -- milestone ID (e.g., 'M25')",
  "version":          "string -- project version at milestone completion",
  "total_tasks":      "number",
  "first_pass_rate":  "number -- 0.0-1.0",
  "avg_duration_s":   "number",
  "total_fix_cycles": "number",
  "total_tokens":     "number",
  "elo_after":        "number -- project ELO after this milestone",
  "signal_distribution": "object -- { pass-through: N, fix-cycle: N, ... }",
  "domain_breakdown": "array -- [{ domain, tasks, first_pass_rate, avg_duration_s }]"
}
```

### Rules
- One entry per project per milestone (duplicate detection: source_project + milestone pair)
- Used for cross-project comparison and global ELO computation

---

## global-signal-distributions.jsonl Schema

Each line is a JSON object representing one project's overall signal distribution:

```json
{
  "ts":               "string -- ISO 8601 UTC timestamp of last update",
  "source_project":   "string -- project name",
  "source_project_dir": "string -- absolute path to project",
  "total_tasks":      "number -- total tasks across all milestones",
  "signal_counts":    "object -- { pass-through: N, fix-cycle: N, debug-invoked: N, user-correction: N, phase-skip: N }",
  "signal_rates":     "object -- { pass-through: 0.X, fix-cycle: 0.X, ... } (normalized to sum = 1.0)",
  "domain_type_signals": "array -- [{ domain_type: string, signal_counts: object, total_tasks: number }]"
}
```

### Rules
- One entry per project (updated on each milestone completion, overwriting previous)
- `signal_rates` are normalized: sum of all rates = 1.0
- `domain_type_signals` enables cross-project comparison like "auth domains have 3x user-correction rate"

---

## Propagation Protocol

### On Local Rule Promotion (complete-milestone distillation)

When a patch achieves `promoted` status in a project:
1. Read the promoted rule from local `rules.jsonl`
2. Check if rule already exists in `~/.claude/metrics/global-rules.jsonl` (match by `original_rule.trigger` fingerprint)
3. If new: append to global-rules.jsonl with `promotion_count: 1`
4. If exists: increment `promotion_count`, check universal/npm thresholds

### On Update-All (gsd-t-version-update-all)

For each registered project:
1. Read `~/.claude/metrics/global-rules.jsonl`
2. Filter rules where `is_universal === true` OR `promotion_count >= 2`
3. For each qualifying rule, check if project already has it (match trigger fingerprint in local rules.jsonl)
4. If missing: inject as candidate rule with `status: 'active'`, `activation_count: 0`, `milestone_created` set to current milestone
5. Log: "Synced {N} global rules to {project_name}"

### On NPM Publish

When `is_npm_candidate === true` for a rule:
1. Write rule to `examples/rules/universal-rules.jsonl` in the npm package source
2. Set `shipped_in_version` to current package version
3. On install/update, copy universal rules to new projects as candidates

---

## Global ELO Computation

- Computed from `global-rollup.jsonl` entries for a specific project
- Same algorithm as project ELO (K=32, starting at 1000)
- Each project has its own ELO trajectory in the global rollup
- Cross-project rank = sort all projects by latest `elo_after` descending
- Displayed by `gsd-t-status` with `--global` flag or when global metrics exist

---

## Universal Rule Promotion Thresholds

| Threshold              | Value | Meaning                                            |
|------------------------|-------|----------------------------------------------------|
| Universal              | 3     | Rule promoted in 3+ distinct projects              |
| NPM candidate          | 5     | Rule promoted in 5+ distinct projects              |
| Trigger fingerprint    | —     | `JSON.stringify(rule.trigger)` used for dedup       |

---

## Integration Checkpoints

- **global-metrics Task 1** (global-sync-manager.js core API) must be complete before:
  - cross-project-sync can call its functions from doUpdateAll
  - command-extensions can read global metrics for display

- **cross-project-sync Task 1** (doUpdateAll extension) must be complete before:
  - command-extensions can describe sync behavior in help text

- **global-metrics + cross-project-sync** must both be testable before:
  - command-extensions modifies any command files
