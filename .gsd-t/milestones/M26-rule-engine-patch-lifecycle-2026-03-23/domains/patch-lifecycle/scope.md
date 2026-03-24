# Domain: patch-lifecycle

## Responsibility
Owns the patch lifecycle management system. Handles the 5-stage lifecycle (candidate -> applied -> measured -> promoted -> graduated), promotion gate evaluation, graduation of patches into permanent methodology artifacts, activation count tracking for deprecation, and periodic consolidation of related rules.

## Owned Files/Directories
- `bin/patch-lifecycle.js` — patch lifecycle manager: create candidates, apply patches, measure outcomes, promote/deprecate, graduate (NEW)
- `.gsd-t/metrics/patches/` — individual patch files with status tracking (NEW, runtime data)

## NOT Owned (do not modify)
- `bin/rule-engine.js` — owned by rule-engine domain (read-only dependency for trigger matching)
- `bin/metrics-collector.js` — owned by M25 metrics-collection (read-only)
- `bin/metrics-rollup.js` — owned by M25 metrics-rollup (read-only)
- `.gsd-t/metrics/rules.jsonl` — owned by rule-engine domain (but patch-lifecycle may append graduated rules for removal)
- `.gsd-t/metrics/task-metrics.jsonl` — read-only
- `.gsd-t/metrics/rollup.jsonl` — read-only
- `commands/*.md` — owned by command-integration domain
- `CLAUDE.md` — graduation target (writes only via explicit graduation protocol)
