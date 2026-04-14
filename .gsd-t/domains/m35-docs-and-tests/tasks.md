# Tasks: m35-docs-and-tests

## T1 — README + GSD-T-README rewrite (Wave 5)
**Files**: `README.md`, `docs/GSD-T-README.md`
**Acceptance**:
- README has new "Runway-Protected Execution" section replacing all "graduated degradation" mentions
- GSD-T-README documents the Model Assignment block convention, /advisor escalation, and all new `gsd-t metrics` CLI commands (--tokens, --halts, --context-window)
- Both files reference token-budget-contract v3.0.0, model-selection-contract v1.0.0, runway-estimator-contract v1.0.0, token-telemetry-contract v1.0.0, headless-auto-spawn-contract v1.0.0

## T2 — methodology.md + architecture.md + infrastructure.md (Wave 5)
**Files**: `docs/methodology.md`, `docs/architecture.md`, `docs/infrastructure.md`
**Acceptance**:
- methodology.md: "From Silent Degradation to Aggressive Pause-Resume" narrative arc — what changed, why, and what the core principle is
- architecture.md: runway estimator + headless auto-spawn + token telemetry added to diagrams and component descriptions
- infrastructure.md: token-metrics.jsonl schema, `.gsd-t/headless-sessions/` directory, `gsd-t metrics` CLI surface, `/advisor` integration convention

## T3 — requirements.md (REQ-069 through REQ-078) (Wave 5)
**File**: `docs/requirements.md`
**Acceptance**:
- REQ-069: Silent degradation bands removed from bin/token-budget.js
- REQ-070: Three-band model (normal/warn/stop) only
- REQ-071: Surgical per-phase model selection via bin/model-selector.js
- REQ-072: /advisor escalation with graceful fallback
- REQ-073: Pre-flight runway estimator refuses runs that cross stop threshold
- REQ-074: Per-spawn token telemetry to .gsd-t/token-metrics.jsonl
- REQ-075: gsd-t metrics CLI (--tokens/--halts/--context-window)
- REQ-076: Optimization backlog (detect only, user selectively promotes)
- REQ-077: Headless auto-spawn on runway refusal (user never types /clear)
- REQ-078: Structural elimination of native compact messages via tightened thresholds
- Each REQ has acceptance criteria aligned to domain acceptance criteria

## T4 — prd-harness-evolution.md §3.7 final version (Wave 5)
**File**: `docs/prd-harness-evolution.md`
**Acceptance**:
- Note: m35-degradation-rip-out T4 already rewrites §3.7 in Wave 2. This task is the final consistency pass after all other domains have landed.
- Title: "Pre-Flight Runway + Pause-Resume (replaces Token-Aware Orchestration)"
- Explicit call-out that M31 framing was wrong
- References all 5 new contracts
- Section links to M35 milestone archive (post complete-milestone)

## T5 — CHANGELOG [2.76.10] entry (Wave 5)
**File**: `CHANGELOG.md`
**Acceptance**:
- New top section `## [2.76.10] - YYYY-MM-DD` (date is date of complete-milestone)
- Subsections: Added (new modules, commands, contracts), Changed (token-budget v2→v3, thresholds, command files), Removed (downgrade/conserve bands, modelOverride, skipPhases), Migration (v2→v3 contract breaking change), Propagation (how downstream projects inherit)
- Concise but complete — every domain's deliverables appear

## T6 — Version bump: 2.75.10 → 2.76.10 (Wave 5)
**Files**: `package.json`, `bin/gsd-t.js`, `.gsd-t/progress.md`
**Acceptance**:
- `package.json` version field updated
- `bin/gsd-t.js` VERSION constant updated (if one exists — check first)
- `.gsd-t/progress.md` version header updated, M35 row in milestones table moved to COMPLETE with version 2.76.10, archive path populated
- `git tag v2.76.10` (deferred to checkin step)

## T7 — Template final consistency pass + memory updates (Wave 5)
**Files**:
- `templates/CLAUDE-global.md`
- `templates/CLAUDE-project.md`
- `~/.claude/projects/-Users-david-projects-GSD-T/memory/feedback_no_silent_degradation.md`
- `~/.claude/projects/-Users-david-projects-GSD-T/memory/project_compaction_regression.md`
**Acceptance**:
- Templates consistent with each other and with live ~/.claude/CLAUDE.md sync plan
- `feedback_no_silent_degradation.md` updated: M35 implemented the fix, downgrade/conserve bands ripped out in v2.76.10, quality gates are always run
- `project_compaction_regression.md` updated: M35 structurally eliminates native compact under healthy operation via tightened thresholds + runway estimator; any `native-compact` in halt_type is now a defect signal, not expected behavior

## T8 — Full test suite green + goal-backward verify (Wave 5)
**Acceptance**:
- Full test suite: target ~1030/1030, actual count is whatever lands green — no cherry-picking
- Goal-backward verify on all 10 new REQs (REQ-069 through REQ-078) returns 0 findings
- `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" .` produces only historical-prose hits (M31 archive, pre-M35 CHANGELOGs, pre-v2.76 prd-harness-evolution archive if any)
- Milestone ready for complete-milestone command
