# Domain: m35-docs-and-tests

## Milestone: M35
## Status: DEFINED
## Wave: 5

## Purpose

Everything downstream — documentation, tests, templates, changelogs, PRD, memory — updated to reflect the M35 model. No silent references to the old bands anywhere. Version bump from 2.75.10 → 2.76.10. Full test suite green.

## Why this domain exists

Doc-ripple is mandatory after behavior changes as sweeping as M35. This domain is the final catch-all before verify + complete-milestone: it makes sure README, GSD-T-README, methodology, architecture, infrastructure, requirements, PRD, CHANGELOG, templates, and memory all reflect M35 consistently.

## Files in scope

### Documentation (G.2)
- `README.md` — new "Runway-Protected Execution" section replacing "graduated degradation" mentions
- `docs/GSD-T-README.md` — model assignment block documented, /advisor escalation explained, token telemetry CLI commands documented
- `docs/methodology.md` — "From Silent Degradation to Aggressive Pause-Resume" narrative arc
- `docs/architecture.md` — runway estimator + headless auto-spawn added to architecture diagrams
- `docs/infrastructure.md` — `.gsd-t/token-metrics.jsonl` schema, `gsd-t metrics` CLI surface
- `docs/requirements.md` — REQ-069 through REQ-078 (10 new REQs)
- `docs/prd-harness-evolution.md` — §3.7 completely rewritten (note: also touched by m35-degradation-rip-out T4; coordinated via contract)
- `CHANGELOG.md` — [2.76.10] entry with Added/Changed/Removed/Migration/Propagation sections

### Version + package (G.3)
- `package.json` — 2.75.10 → 2.76.10
- `.gsd-t/progress.md` — version bump, milestone marked COMPLETE, domain archive
- `bin/gsd-t.js` — version constant

### Templates (already touched by other domains, final coordination happens here)
- `templates/CLAUDE-global.md` — final consistency pass
- `templates/CLAUDE-project.md` — final consistency pass

### Memory (G.4)
- `~/.claude/projects/-Users-david-projects-GSD-T/memory/feedback_no_silent_degradation.md` — update to reflect M35 implemented the fix
- `~/.claude/projects/-Users-david-projects-GSD-T/memory/project_compaction_regression.md` — update to reflect structural elimination

### Tests (G.1)
- Cross-domain test suite consolidation — target ~1030 tests green, 0 failures
- Integration tests for end-to-end flows: degradation rip-out + model selection + runway estimator + headless handoff

## Files NOT in scope

- Any file owned by another domain — this domain only edits docs/tests/version/memory, not code owned by degradation-rip-out/model-selector-advisor/runway-estimator/token-telemetry/optimization-backlog/headless-auto-spawn

## Dependencies

- **Depends on**: All 6 other M35 domains must be complete before this domain's verification pass
- **Blocks**: `gsd-t-verify` → `gsd-t-complete-milestone` → `checkin` → `publish` (user-gated) → `version-update-all`

## Acceptance criteria

1. All 8 documentation files updated with M35 content
2. 10 new REQs (REQ-069 through REQ-078) added to `docs/requirements.md`
3. CHANGELOG entry complete with Added/Changed/Removed/Migration/Propagation
4. Version bumped to 2.76.10 in package.json, progress.md, bin/gsd-t.js
5. Templates consistent with each other and with live ~/.claude/CLAUDE.md sync plan
6. Memory files updated
7. Full test suite green (~1030/1030, ±10)
8. `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" .` returns only historical-prose hits (M31 archive, pre-M35 CHANGELOGs)
9. Goal-backward verify returns 0 findings
