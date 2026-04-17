# Domain: m38-cleanup-and-docs

## Responsibility

Terminal domain. Three jobs:

1. **Delete the self-improvement loop**: 4 commands + qa-calibrator + plumbing
2. **Living document updates** across CLAUDE templates, all `docs/`, README, GSD-T-README, CHANGELOG, help.md
3. **Contract finalization**: fold deleted contracts; update remaining contracts; cut version bumps

## Owned Files/Directories

### Self-improvement loop deletions
- `commands/gsd-t-optimization-apply.md` — DELETE
- `commands/gsd-t-optimization-reject.md` — DELETE
- `commands/gsd-t-reflect.md` — DELETE
- `commands/gsd-t-audit.md` — DELETE
- `bin/qa-calibrator.js` — DELETE
- `.gsd-t/qa-miss-log.jsonl` plumbing — DELETE references; remove file if exists
- `.gsd-t/optimization-backlog.md` — DELETE references in command files; remove file if exists
- `bin/token-optimizer.js` — DELETE (only consumed by deleted optimization-apply/reject commands and complete-milestone Step 14, which becomes a no-op)
- `commands/gsd-t-complete-milestone.md` Step 14 — REMOVE optimizer invocation
- `commands/gsd-t-backlog-list.md` `--file` flag — REMOVE (only used for optimization-backlog.md)

### Living document updates
- `templates/CLAUDE-global.md` — rewrite Context Meter, Universal Auto-Pause, Three-Band Model sections; replace with simpler headless-default model description; remove deleted commands from the table; add `--watch` flag documentation; document the conversational router mode
- `templates/CLAUDE-project.md` — same scope as CLAUDE-global where applicable
- Project `CLAUDE.md` — same; remove M37 Universal Auto-Pause section; replace meter prose; update commands table
- `~/.claude/CLAUDE.md` — synced via `gsd-t version-update-all` per project convention; not edited directly
- `docs/architecture.md` — update spawn defaults, meter description, event stream architecture, supervisor sections
- `docs/workflows.md` — update workflow descriptions with new spawn defaults
- `docs/infrastructure.md` — update infrastructure description; remove dead-meter / runway / telemetry sections; document event stream
- `docs/methodology.md` — add "From Universal Auto-Pause to Headless-by-Default (M38)" section explaining the architectural shift
- `docs/requirements.md` — add REQ-088+ for M38; mark M37 REQ-079..087 retained but supplemented
- `docs/prd-harness-evolution.md` — REVIEW; M37 / M38 entry if relevant
- `README.md` — document the architectural shift; commands table loses 3+4=7 commands; `--watch` flag mention
- `GSD-T-README.md` — same scope as README
- `CHANGELOG.md` — `[3.12.10]` entry with full M38 deltas; explicit note: "M37 right about symptom, wrong about elevation; M38 fixes cause"
- `commands/gsd-t-help.md` — remove deleted command entries (4 self-improvement + 3 conversational from Domain 4 = 7 total); add `--watch` flag documentation; add conversational router mode section

### Contract finalization
- `.gsd-t/contracts/runway-estimator-contract.md` — DELETE
- `.gsd-t/contracts/token-telemetry-contract.md` — DELETE
- `.gsd-t/contracts/headless-auto-spawn-contract.md` — DELETE (folded into Domain 1's headless-default-contract.md)
- `.gsd-t/contracts/qa-calibration-contract.md` — DELETE
- `.gsd-t/contracts/harness-audit-contract.md` — DELETE (gsd-t-audit deleted)
- `.gsd-t/contracts/unattended-supervisor-contract.md` — UPDATE to v1.1.0 with event-stream emission requirement (coordinate with Domain 3)
- All contracts validated against final Wave 1 + 2 file shapes

### Version + propagation
- `package.json` — version 3.11.11 → 3.12.10
- `bin/gsd-t.js` — command counting logic (61 → 54 if 3+4 deleted; verify exact count)
- npm publish + `gsd-t version-update-all` (user-gated per project convention)

## NOT Owned (do not modify)

- `bin/headless-auto-spawn.cjs` (Domain 1)
- `bin/token-budget.cjs`, `bin/runway-estimator.cjs`, `bin/token-telemetry.cjs` (Domain 2 — Domain 5 doesn't delete these, Domain 2 does; Domain 5 just removes references in docs)
- All command-file spawn pattern edits (Domain 1)
- All command-file token bracket / runway gate / auto-pause Step 0.2 strips (Domain 2)
- Event-stream code (Domain 3)
- `commands/gsd.md` (Domain 4)
- `commands/gsd-t-prompt.md`, `gsd-t-brainstorm.md`, `gsd-t-discuss.md` (Domain 4 deletes — Domain 5 just removes their entries from docs)
